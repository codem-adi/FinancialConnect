import { formatIndianCurrency, toNum, formatRate } from './utils';
import { LOAN_TYPES, normalizeLoan, formatManualEmiPaymentsSummary, applyDisbursement, getDisbursementProgressPct, getEmiDay } from './loanCalculations';
import { formatMonthLabel } from './financeStats';

function money(v) {
  if (v === '' || v == null) return '—';
  return formatIndianCurrency(v, false);
}

function pushChange(changes, label, before, after, fmt = (x) => String(x ?? '—')) {
  if (fmt(before) !== fmt(after)) changes.push(`${label}: ${fmt(before)} → ${fmt(after)}`);
}

export function buildLoanAudit(before, after) {
  const b = before ? normalizeLoan(before) : null;
  const a = normalizeLoan(after);
  const name = a.name || 'Loan';

  if (!b) {
    return {
      section: 'loans',
      action: 'create',
      entityId: a.id,
      summary: `Added loan: ${name} (${LOAN_TYPES[a.loanType]?.label || a.loanType}, ${money(a.disbursedAmount || a.loanAmount)})`,
    };
  }

  const changes = [];
  pushChange(changes, 'name', b.name, a.name);
  pushChange(changes, 'lender', b.lender, a.lender);
  pushChange(changes, 'type', LOAN_TYPES[b.loanType]?.label, LOAN_TYPES[a.loanType]?.label);
  pushChange(changes, 'sanctioned', b.totalSanctioned, a.totalSanctioned, money);
  pushChange(changes, 'disbursed', b.disbursedAmount || b.loanAmount, a.disbursedAmount || a.loanAmount, money);
  pushChange(changes, 'rate', b.interestRate, a.interestRate, (x) => formatRate(x));
  pushChange(changes, 'tenure', b.tenureMonths, a.tenureMonths, (x) => `${x} mo`);
  pushChange(changes, 'EMI basis', b.emiBasis, a.emiBasis);
  pushChange(changes, 'start date', b.startDate, a.startDate);
  pushChange(changes, 'EMI date', getEmiDay(b), getEmiDay(a), (x) => `day ${x}`);
  pushChange(changes, 'min due', b.minDue, a.minDue, money);
  pushChange(changes, 'actual payment', b.manualEmi, a.manualEmi, money);
  pushChange(changes, 'EMI payments', formatManualEmiPaymentsSummary(b), formatManualEmiPaymentsSummary(a));
  pushChange(changes, 'balance', b.statementBalance ?? b.loanAmount, a.statementBalance ?? a.loanAmount, money);

  const detail = changes.join('; ');
  return {
    section: 'loans',
    action: 'update',
    entityId: a.id,
    summary: changes.length
      ? `Updated loan ${name} — ${changes.slice(0, 3).join('; ')}${changes.length > 3 ? ` (+${changes.length - 3} more)` : ''}`
      : `Updated loan: ${name}`,
    details: detail || null,
  };
}

export function buildLoanDeleteAudit(loan) {
  const l = normalizeLoan(loan);
  return {
    section: 'loans',
    action: 'delete',
    entityId: l.id,
    summary: `Deleted loan: ${l.name}`,
    details: `${LOAN_TYPES[l.loanType]?.label || l.loanType} · ${money(l.disbursedAmount || l.loanAmount)}`,
  };
}

export function buildPrepaymentAudit(loan, prepayment, action = 'create') {
  const l = normalizeLoan(loan);
  const verbs = { create: 'Recorded prepayment', update: 'Updated prepayment', delete: 'Removed prepayment' };
  return {
    section: 'loans',
    action,
    entityId: l.id,
    summary: `${verbs[action] || 'Prepayment'} on ${l.name}: ${money(prepayment.amount)} (${prepayment.date})`,
    details: prepayment.notes || null,
  };
}

export function buildDisbursementUpdateAudit(loan, before, after) {
  const l = normalizeLoan(loan);
  return {
    section: 'loans',
    action: 'update',
    entityId: l.id,
    summary: `Updated draw on ${l.name}: ${money(before.amount)} → ${money(after.amount)} (${after.date})`,
    details: after.notes || null,
  };
}

export function buildDisbursementDeleteAudit(loan, disbursement) {
  const l = normalizeLoan(loan);
  return {
    section: 'loans',
    action: 'delete',
    entityId: l.id,
    summary: `Removed draw on ${l.name}: ${money(disbursement.amount)} (${disbursement.date})`,
    details: disbursement.notes || null,
  };
}

export function buildPartialDisburseAudit(loan, disbursement) {
  const l = normalizeLoan(loan);
  const pct = getDisbursementProgressPct(applyDisbursement(loan, disbursement));
  return {
    section: 'loans',
    action: 'update',
    entityId: l.id,
    summary: `Disbursement on ${l.name}: ${money(disbursement.amount)} (${disbursement.date}) · ${pct.toFixed(1)}% drawn`,
    details: disbursement.notes || null,
  };
}

export function buildDisburseAudit(loan, amount) {
  const l = normalizeLoan(loan);
  return {
    section: 'loans',
    action: 'update',
    entityId: l.id,
    summary: `Disbursement on ${l.name}: ${money(amount)}`,
  };
}

export function buildFamilyMemberAudit(before, after) {
  if (!before) {
    return {
      section: 'family',
      action: 'create',
      entityId: after.id,
      summary: `Added family member: ${after.name} (${after.relationship}, ${money(after.monthlyIncome)}/mo)`,
    };
  }
  const changes = [];
  pushChange(changes, 'name', before.name, after.name);
  pushChange(changes, 'relationship', before.relationship, after.relationship);
  pushChange(changes, 'income', before.monthlyIncome, after.monthlyIncome, money);
  const name = after.name || before.name;
  return {
    section: 'family',
    action: 'update',
    entityId: after.id,
    summary: changes.length ? `Updated member ${name} — ${changes.join('; ')}` : `Updated member: ${name}`,
  };
}

export function buildFamilyIncomeAudit(memberName, monthKey, adjustment) {
  const modeLabels = {
    full: 'reset to full salary',
    skip: 'skipped salary',
    partial: 'reduced pay',
    extra: 'extra income',
  };
  const mode = adjustment?.mode === 'skip' ? 'skip' : adjustment?.mode || 'full';
  let amountHint = '';
  if (mode === 'partial' && adjustment?.partialAmount != null && adjustment.partialAmount !== '') {
    amountHint = ` (${money(adjustment.partialAmount)}/mo)`;
  } else if (mode === 'extra' && adjustment?.extraAmount != null && adjustment.extraAmount !== '') {
    amountHint = ` (+${money(adjustment.extraAmount)})`;
  }
  return {
    section: 'family',
    action: 'update',
    summary: `Income for ${memberName} (${formatMonthLabel(monthKey)}): ${modeLabels[mode] || mode}${amountHint}`,
    details: adjustment?.note || null,
  };
}

export function buildExpenseMonthAudit(monthKey, detail) {
  return {
    section: 'expenses',
    action: 'update',
    summary: `Updated expenses for ${formatMonthLabel(monthKey)}${detail ? `: ${detail}` : ''}`,
  };
}

export function buildAssetAudit(before, after, action) {
  if (action === 'delete') {
    return {
      section: 'assets',
      action: 'delete',
      entityId: after.id,
      summary: `Removed asset: ${after.name} (${money(after.value)})`,
    };
  }
  if (!before) {
    return {
      section: 'assets',
      action: 'create',
      entityId: after.id,
      summary: `Added asset: ${after.name} (${money(after.value)})`,
    };
  }
  const changes = [];
  pushChange(changes, 'name', before.name, after.name);
  pushChange(changes, 'value', before.value, after.value, money);
  pushChange(changes, 'type', before.type, after.type);
  return {
    section: 'assets',
    action: 'update',
    entityId: after.id,
    summary: changes.length
      ? `Updated asset ${after.name} — ${changes.join('; ')}`
      : `Updated asset: ${after.name}`,
  };
}
