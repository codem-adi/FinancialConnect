import { toNum } from './utils';
import { computeLoanStats, getPrepayments, getLoanMonthlyOutflow } from './loanCalculations';
import { DEFAULT_FREEDOM_SETTINGS } from './goalCalculations';
import { getTotalActiveAssets, migrateLegacyAssets } from './assetCalculations';
import { normalizeMemberCards, sumCardBillAmounts } from './cardBillCalculations';

export function getMonthKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

export function getPastMonths(count = 6, fromDate = new Date()) {
  const months = [];
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  for (let i = count - 1; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(getMonthKey(dt));
  }
  return months;
}

export function getShortMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-IN', { month: 'short' });
}

export function getMemberIncomeAdjustment(record, memberId) {
  const adj = record.memberIncomeAdjustments?.[memberId];
  if ((record.pausedMembers || []).includes(memberId)) {
    return { mode: 'skip', partialAmount: 0, extraAmount: 0, note: adj?.note || 'Salary skipped' };
  }
  if (!adj?.mode || adj.mode === 'full') {
    return { mode: 'full', partialAmount: 0, extraAmount: 0, note: '' };
  }
  return {
    mode: adj.mode,
    partialAmount: adj.partialAmount ?? '',
    extraAmount: adj.extraAmount ?? '',
    note: adj.note || '',
  };
}

export function computeEffectiveMemberIncome(baseIncome, adjustment) {
  const base = toNum(baseIncome);
  switch (adjustment.mode) {
    case 'skip':
      return { effective: 0, status: 'skipped', cutAmount: base, extraAmount: 0 };
    case 'partial': {
      const paid = Math.max(0, Math.min(base, toNum(adjustment.partialAmount)));
      return { effective: paid, status: paid <= 0 ? 'skipped' : 'cut', cutAmount: base - paid, extraAmount: 0 };
    }
    case 'extra': {
      const extra = toNum(adjustment.extraAmount);
      return { effective: base + extra, status: 'extra', cutAmount: 0, extraAmount: extra };
    }
    default:
      return { effective: base, status: 'normal', cutAmount: 0, extraAmount: 0 };
  }
}

export const INCOME_ADJUSTMENT_MODES = [
  { id: 'full', label: 'Full salary', description: 'Pay the usual monthly amount' },
  { id: 'skip', label: 'Skip / pause', description: 'No salary this month (unexpected expense, etc.)' },
  { id: 'partial', label: 'Income cut', description: 'Pay a reduced amount this month' },
  { id: 'extra', label: 'Extra income', description: 'Bonus or additional pay on top of salary' },
];

export function getFamilyIncome(pf, monthKey) {
  return getMemberIncomeBreakdown(pf, monthKey).reduce((s, m) => s + m.effectiveIncome, 0);
}

export function getMemberIncomeBreakdown(pf, monthKey) {
  const record = getMonthRecord(pf, monthKey);
  return (pf.familyMembers || []).map((m) => {
    const base = toNum(m.monthlyIncome);
    const adjustment = getMemberIncomeAdjustment(record, m.id);
    const { effective, status, cutAmount, extraAmount } = computeEffectiveMemberIncome(base, adjustment);
    return {
      id: m.id,
      name: m.name,
      relationship: m.relationship,
      monthlyIncome: base,
      adjustment,
      paused: status === 'skipped',
      effectiveIncome: effective,
      status,
      cutAmount,
      extraAmount,
      note: adjustment.note,
    };
  });
}

export function getPreviousMonthKey(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return getMonthKey(new Date(y, m - 2, 1));
}

export function hasMonthExpenseData(pf, monthKey) {
  const saved = (pf.monthlyRecords || []).find((r) => r.month === monthKey);
  if (saved) {
    const cats = Object.values(saved.categoryAmounts || {}).reduce((s, v) => s + toNum(v), 0);
    const extra = (saved.extraExpenses || []).reduce((s, e) => s + toNum(e.amount), 0);
    const cards = sumCardBillAmounts(saved, normalizeMemberCards(pf));
    return cats + extra + cards > 0;
  }
  return false;
}

export function getHousingCategoryId(pf) {
  const cats = pf.expenseCategories?.length ? pf.expenseCategories : DEFAULT_EXPENSE_CATEGORIES;
  const housing = cats.find((c) => c.category === 'housing') || cats[0];
  return housing?.id || 'ec1';
}

export function monthKeyFromDate(dateStr) {
  if (!dateStr) return getMonthKey();
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return getMonthKey();
  return getMonthKey(d);
}

/** Prepayments are tracked on loans and rolled into Loan EMIs — no housing sync */
export function syncPrepaymentToExpenses(pf) {
  return pf;
}

export function removePrepaymentFromExpenses(pf) {
  return pf;
}

export function updatePrepaymentExpense(pf) {
  return pf;
}

/** One-time: undo old sync that added prepayments to Rent / Housing */
function migratePrepaymentExpensesFromHousing(pf) {
  if (pf.prepaymentExpenseMigrated) return pf;
  const housingId = getHousingCategoryId(pf);
  const records = (pf.monthlyRecords || []).map((record) => {
    const monthPrepay = getPrepaymentsForMonth(pf, record.month).reduce((s, p) => s + p.amount, 0);
    if (monthPrepay <= 0) return record;
    const current = toNum(record.categoryAmounts?.[housingId]);
    const next = Math.max(0, current - monthPrepay);
    if (next === current) return record;
    return {
      ...record,
      categoryAmounts: { ...record.categoryAmounts, [housingId]: next },
    };
  });
  return { ...pf, monthlyRecords: records, prepaymentExpenseMigrated: true };
}

export function getPrepaymentsForMonth(pf, monthKey) {
  const items = [];
  for (const loan of pf.loans || []) {
    for (const p of getPrepayments(loan)) {
      if (monthKeyFromDate(p.date) === monthKey) {
        items.push({
          id: p.id,
          loanId: loan.id,
          loanName: loan.name,
          lender: loan.lender,
          loanType: loan.loanType,
          date: p.date,
          amount: toNum(p.amount),
          interestSaved: toNum(p.interestSaved),
          notes: p.notes,
        });
      }
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export function getLoanPrepaymentTotal(pf, monthKey) {
  return getPrepaymentsForMonth(pf, monthKey).reduce((s, p) => s + p.amount, 0);
}

/** @deprecated use getLoanPrepaymentTotal */
export function getHousingPrepaymentTotal(pf, monthKey) {
  return getLoanPrepaymentTotal(pf, monthKey);
}

export function getLoanEmiTotal(pf) {
  return (pf.loans || []).reduce((s, loan) => {
    const stats = computeLoanStats(loan);
    if (stats.isClosed) return s;
    return s + getLoanMonthlyOutflow(stats);
  }, 0);
}

function sumCategoryAmounts(categoryAmounts = {}) {
  return Object.values(categoryAmounts).reduce((s, v) => s + toNum(v), 0);
}

function sumExtraExpenses(extraExpenses = []) {
  return extraExpenses.reduce((s, e) => s + toNum(e.amount), 0);
}

/** Build default category amounts from legacy fixed/variable fields */
export function buildDefaultCategoryAmounts(pf) {
  const cats = pf.expenseCategories?.length ? pf.expenseCategories : DEFAULT_EXPENSE_CATEGORIES;
  if (cats.length === 0) return {};
  const amounts = {};
  const fixed = toNum(pf.monthlyFixedExpenses);
  const variable = toNum(pf.monthlyVariableExpenses);
  if (cats[0]) amounts[cats[0].id] = Math.round(fixed * 0.5);
  if (cats[1]) amounts[cats[1].id] = Math.round(fixed * 0.2);
  if (cats[2]) amounts[cats[2].id] = Math.round(variable * 0.4);
  if (cats[3]) amounts[cats[3].id] = Math.round(fixed * 0.15);
  if (cats[4]) amounts[cats[4].id] = Math.round(variable * 0.3);
  if (cats[5]) amounts[cats[5].id] = Math.round(variable * 0.3);
  return amounts;
}

export function getMonthRecord(pf, monthKey) {
  const found = (pf.monthlyRecords || []).find((r) => r.month === monthKey);
  const isCurrent = monthKey === getMonthKey();
  if (found) {
    return {
      month: monthKey,
      otherIncome: found.otherIncome ?? (isCurrent ? pf.otherIncome ?? 0 : 0),
      categoryAmounts: found.categoryAmounts ?? (isCurrent ? buildDefaultCategoryAmounts(pf) : {}),
      extraExpenses: found.extraExpenses || [],
      pausedMembers: found.pausedMembers || [],
      memberIncomeAdjustments: found.memberIncomeAdjustments || {},
      cardBillAmounts: found.cardBillAmounts || {},
      notes: found.notes || '',
    };
  }
  return {
    month: monthKey,
    otherIncome: isCurrent ? pf.otherIncome ?? 0 : 0,
    categoryAmounts: isCurrent ? buildDefaultCategoryAmounts(pf) : {},
    extraExpenses: [],
    pausedMembers: [],
    memberIncomeAdjustments: {},
    cardBillAmounts: {},
    notes: '',
  };
}

export function saveMemberIncomeAdjustment(pf, monthKey, memberId, adjustment) {
  const record = getMonthRecord(pf, monthKey);
  const pausedMembers = (record.pausedMembers || []).filter((id) => id !== memberId);
  const memberIncomeAdjustments = { ...(record.memberIncomeAdjustments || {}) };
  if (!adjustment || adjustment.mode === 'full') {
    delete memberIncomeAdjustments[memberId];
  } else {
    memberIncomeAdjustments[memberId] = {
      mode: adjustment.mode,
      partialAmount: adjustment.partialAmount,
      extraAmount: adjustment.extraAmount,
      note: adjustment.note || '',
    };
  }
  return upsertMonthRecord(pf, {
    ...record,
    month: monthKey,
    pausedMembers,
    memberIncomeAdjustments,
  });
}

export function upsertMonthRecord(pf, record) {
  const records = [...(pf.monthlyRecords || [])];
  const idx = records.findIndex((r) => r.month === record.month);
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  records.sort((a, b) => a.month.localeCompare(b.month));
  return { ...pf, monthlyRecords: records };
}

export function computeMonthStats(pf, monthKey) {
  const record = getMonthRecord(pf, monthKey);
  const familyIncome = getFamilyIncome(pf, monthKey);
  const memberIncome = getMemberIncomeBreakdown(pf, monthKey);
  const otherIncome = toNum(record.otherIncome);
  const totalIncome = familyIncome + otherIncome;

  const categoryTotal = sumCategoryAmounts(record.categoryAmounts);
  const extraTotal = sumExtraExpenses(record.extraExpenses);
  const livingExpenses = categoryTotal + extraTotal;
  const loanEmi = getLoanEmiTotal(pf);
  const loanPrepayments = getLoanPrepaymentTotal(pf, monthKey);
  const loanPayments = loanEmi + loanPrepayments;
  const cardBillTotal = sumCardBillAmounts(record, normalizeMemberCards(pf));
  const totalExpenses = livingExpenses + loanPayments + cardBillTotal;
  const savings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

  const totalAssets = getTotalActiveAssets(pf.assets);
  const totalLoanOutstanding = (pf.loans || []).reduce((s, l) => {
    try { return s + computeLoanStats(l).outstanding; } catch { return s; }
  }, 0);

  const categoryBreakdown = (pf.expenseCategories?.length ? pf.expenseCategories : DEFAULT_EXPENSE_CATEGORIES).map((cat) => ({
    id: cat.id,
    name: cat.name,
    color: cat.color,
    amount: toNum(record.categoryAmounts?.[cat.id]),
  })).filter((c) => c.amount > 0);

  if (extraTotal > 0) {
    categoryBreakdown.push({ id: 'extra', name: 'Other / One-off', color: '#64748b', amount: extraTotal });
  }
  if (loanPayments > 0) {
    categoryBreakdown.push({
      id: 'loans',
      name: 'Loan EMIs',
      color: '#ef4444',
      amount: loanPayments,
      emiAmount: loanEmi,
      prepaymentAmount: loanPrepayments,
    });
  }
  if (cardBillTotal > 0) {
    categoryBreakdown.push({
      id: 'card-bills',
      name: 'Credit Card Bills',
      color: '#6366f1',
      amount: cardBillTotal,
    });
  }

  return {
    month: monthKey,
    monthLabel: formatMonthLabel(monthKey),
    familyIncome,
    memberIncome,
    otherIncome,
    totalIncome,
    categoryTotal,
    extraTotal,
    livingExpenses,
    loanEmi,
    loanPrepayments,
    loanPayments,
    cardBillTotal,
    totalExpenses,
    savings,
    savingsRate,
    totalAssets,
    totalLoanOutstanding,
    netWorth: totalAssets - totalLoanOutstanding,
    categoryBreakdown,
    record,
  };
}

export function computeOverviewStats(pf, monthKey = getMonthKey()) {
  return computeMonthStats(pf, monthKey);
}

export function getMonthlyChartData(pf, months = 6) {
  const savedMonths = new Set((pf.monthlyRecords || []).map((r) => r.month));
  return getPastMonths(months).map((m) => {
    const s = computeMonthStats(pf, m);
    return {
      month: getShortMonthLabel(m),
      monthLabel: s.monthLabel,
      monthKey: m,
      hasRecord: savedMonths.has(m),
      income: s.totalIncome,
      expenses: s.livingExpenses,
      loanEmi: s.loanEmi,
      loanPrepayments: s.loanPrepayments,
      loanPayments: s.loanPayments,
      savings: s.savings,
      totalOutflow: s.totalExpenses,
    };
  });
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  { id: 'ec1', name: 'Rent / Housing', category: 'housing', color: '#6366f1' },
  { id: 'ec2', name: 'Food & Groceries', category: 'food', color: '#10b981' },
  { id: 'ec3', name: 'Transport / Car', category: 'transport', color: '#06b6d4' },
  { id: 'ec4', name: 'Utilities', category: 'utilities', color: '#f59e0b' },
  { id: 'ec5', name: 'Insurance', category: 'insurance', color: '#8b5cf6' },
  { id: 'ec6', name: 'Entertainment', category: 'entertainment', color: '#ec4899' },
  { id: 'ec7', name: 'Healthcare', category: 'health', color: '#14b8a6' },
  { id: 'ec8', name: 'Shopping & Other', category: 'other', color: '#64748b' },
];

export function normalizePersonalFinance(pf) {
  if (!pf) return pf;
  const base = {
    ...pf,
    expenseCategories: pf.expenseCategories?.length ? pf.expenseCategories : DEFAULT_EXPENSE_CATEGORIES,
    monthlyRecords: pf.monthlyRecords || [],
    memberCards: pf.memberCards ?? pf.memberCars ?? [],
    freedomSettings: { ...DEFAULT_FREEDOM_SETTINGS, ...(pf.freedomSettings || {}) },
    assets: pf.assetsMigrated ? (pf.assets || []) : migrateLegacyAssets(pf.assets || []),
    assetsMigrated: true,
  };
  return migratePrepaymentExpensesFromHousing(base);
}

export function buildSampleMonthlyRecords(pf) {
  const months = getPastMonths(6);
  const baseAmounts = buildDefaultCategoryAmounts(pf);
  return months.map((month, i) => {
    const variance = 1 + (i - 3) * 0.05;
    const categoryAmounts = {};
    for (const [k, v] of Object.entries(baseAmounts)) {
      categoryAmounts[k] = Math.round(toNum(v) * variance);
    }
    return {
      month,
      otherIncome: toNum(pf.otherIncome),
      categoryAmounts,
      extraExpenses: i === months.length - 1 ? [{ id: 'ex1', name: 'Car Service', amount: 8500, category: 'transport' }] : [],
      pausedMembers: i === months.length - 2 && pf.familyMembers?.[1]
        ? [pf.familyMembers[1].id]
        : [],
      memberIncomeAdjustments: i === months.length - 3 && pf.familyMembers?.[0]
        ? { [pf.familyMembers[0].id]: { mode: 'partial', partialAmount: Math.round(toNum(pf.familyMembers[0].monthlyIncome) * 0.5), extraAmount: 0, note: 'Half salary — emergency expense' } }
        : {},
      notes: '',
    };
  });
}
