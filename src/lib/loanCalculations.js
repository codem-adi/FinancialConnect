import { toNum } from './utils';

export function calculateEMI(principal, annualRate, tenureMonths) {
  const p = toNum(principal);
  const t = toNum(tenureMonths);
  const r = toNum(annualRate);
  if (p <= 0 || t <= 0) return 0;
  const monthlyRate = r / 100 / 12;
  if (monthlyRate === 0) return p / t;
  const factor = Math.pow(1 + monthlyRate, t);
  return (p * monthlyRate * factor) / (factor - 1);
}

export function getMonthsSinceStart(startDate, asOfDate = new Date()) {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const end = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
  if (isNaN(start.getTime())) return 0;
  return Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
}

export function formatDuration(months) {
  if (months <= 0) return 'Closed';
  const years = Math.floor(months / 12);
  const m = months % 12;
  if (years === 0) return `${m} mo`;
  if (m === 0) return `${years} yr`;
  return `${years} yr ${m} mo`;
}

export const LOAN_TYPES = {
  home: { label: 'Home Loan', color: '#6366f1' },
  personal: { label: 'Personal Loan', color: '#8b5cf6' },
  car: { label: 'Car Loan', color: '#06b6d4' },
  education: { label: 'Education Loan', color: '#10b981' },
  business: { label: 'Business Loan', color: '#f59e0b' },
  credit_card: { label: 'Credit Card', color: '#ef4444' },
  bill: { label: 'Bill / Utility', color: '#f97316' },
  prepayment: { label: 'Prepayment', color: '#14b8a6' },
  other: { label: 'Other', color: '#64748b' },
};

export function getPrepayments(loan) {
  return (loan.prepayments || loan.releases || []).map((p) => ({
    ...p,
    amount: toNum(p.amount),
    rate: p.rate != null ? toNum(p.rate) : null,
  }));
}

export const EMI_BASIS = {
  disbursed: {
    id: 'disbursed',
    label: 'Disbursed Amount',
    description: 'BOB / tranche home loan — EMI on amount actually drawn. Undisbursed stays separate until released.',
  },
  sanctioned: {
    id: 'sanctioned',
    label: 'Sanctioned Amount',
    description: 'Full sanction EMI — like most online calculators. EMI on total approved amount from day one.',
  },
};

/** Principal actually drawn — used for outstanding balance & amortization */
export function getDisbursedPrincipal(loan) {
  return toNum(loan.disbursedAmount) || toNum(loan.loanAmount) || 0;
}

/** Principal used to calculate EMI based on user/bank choice */
export function getEmiPrincipal(loan) {
  const basis = loan.emiBasis || 'disbursed';
  if (basis === 'sanctioned') {
    return toNum(loan.totalSanctioned) || toNum(loan.loanAmount) || getDisbursedPrincipal(loan);
  }
  return getDisbursedPrincipal(loan);
}

function getPrincipal(loan) {
  return getDisbursedPrincipal(loan);
}

function monthWindow(startDate, monthIndex) {
  const start = new Date(startDate);
  const monthStart = new Date(start.getFullYear(), start.getMonth() + monthIndex, 1);
  const monthEnd = new Date(start.getFullYear(), start.getMonth() + monthIndex + 1, 1);
  return { monthStart, monthEnd };
}

/** Simulate EMI schedule + dated prepayments, return full stats */
export function simulateAmortization(loan, extraPrepayments = []) {
  const disbursedPrincipal = getDisbursedPrincipal(loan);
  const emiPrincipal = getEmiPrincipal(loan);
  const defaultRate = toNum(loan.interestRate);
  const tenure = toNum(loan.tenureMonths);
  const emiBasis = loan.emiBasis || 'disbursed';
  const originalEmi = calculateEMI(emiPrincipal, defaultRate, tenure);

  const allPrepayments = [...getPrepayments(loan), ...extraPrepayments]
    .filter((p) => toNum(p.amount) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const emisPaid = loan.emisPaid != null ? toNum(loan.emisPaid) : getMonthsSinceStart(loan.startDate);
  const paidEmis = Math.min(emisPaid, tenure);

  let balance = disbursedPrincipal;
  let interestPaid = 0;
  let principalFromEmi = 0;
  let prepaymentTotal = 0;
  const appliedIds = new Set();

  for (let month = 0; month < paidEmis && balance > 0; month++) {
    const rate = defaultRate;
    const monthlyRate = rate / 100 / 12;
    const interest = balance * monthlyRate;
    const emiPay = Math.min(originalEmi, balance + interest);
    const principalPart = Math.min(Math.max(emiPay - interest, 0), balance);

    interestPaid += interest;
    principalFromEmi += principalPart;
    balance -= principalPart;

    if (loan.startDate) {
      const { monthStart, monthEnd } = monthWindow(loan.startDate, month);
      for (const pp of allPrepayments) {
        const key = pp.id || `${pp.date}-${pp.amount}`;
        if (appliedIds.has(key)) continue;
        const ppDate = new Date(pp.date);
        if (isNaN(ppDate.getTime())) continue;
        if (ppDate >= monthStart && ppDate < monthEnd) {
          const amt = Math.min(toNum(pp.amount), balance);
          balance -= amt;
          prepaymentTotal += amt;
          appliedIds.add(key);
        }
      }
    }
  }

  // Prepayments after EMI period or with future dates relative to paid EMIs
  for (const pp of allPrepayments) {
    const key = pp.id || `${pp.date}-${pp.amount}`;
    if (appliedIds.has(key)) continue;
    const ppDate = new Date(pp.date);
    const amt = Math.min(toNum(pp.amount), balance);
    if (amt > 0) {
      balance -= amt;
      prepaymentTotal += amt;
      appliedIds.add(key);
    }
  }

  const outstanding = Math.max(0, balance);
  const remainingTenure = Math.max(0, tenure - paidEmis);
  // EMI stays fixed — prepayment only reduces outstanding principal
  const emi = Math.round(originalEmi);

  const totalPrincipalPaid = principalFromEmi + prepaymentTotal;
  const totalInterestIfFull = originalEmi * tenure - emiPrincipal;
  const monthlyRate = defaultRate / 100 / 12;
  const remainingInterest = outstanding > 0
    ? Math.round(outstanding * monthlyRate * remainingTenure)
    : 0;
  const repaymentProgress = disbursedPrincipal > 0 ? (totalPrincipalPaid / disbursedPrincipal) * 100 : 0;

  const sanctioned = toNum(loan.totalSanctioned) || disbursedPrincipal;
  const disbursed = disbursedPrincipal;
  const totalInterestSaved = getPrepayments(loan).reduce(
    (sum, p) => sum + calculateInterestSavedForDate(loan, p.amount, p.date, p.id),
    0,
  );

  return {
    loanCategory: 'emi',
    originalEmi: Math.round(originalEmi),
    emi,
    currentEmi: emi,
    annualRate: defaultRate,
    monthlyRate: defaultRate / 12,
    emiBasis,
    emiPrincipal,
    disbursedPrincipal,
    loanAmount: disbursedPrincipal,
    sanctioned,
    disbursed,
    undisbursed: Math.max(0, sanctioned - disbursed),
    outstanding,
    emisPaid: paidEmis,
    remainingEmis: outstanding <= 0 ? 0 : remainingTenure,
    totalEmis: tenure,
    interestPaid: Math.round(interestPaid),
    principalPaid: Math.round(totalPrincipalPaid),
    totalInterestProjected: Math.round(Math.max(0, totalInterestIfFull)),
    remainingInterest,
    totalPayable: Math.round(originalEmi * tenure),
    repaymentProgress: Math.min(100, repaymentProgress),
    timeRemainingMonths: outstanding <= 0 ? 0 : remainingTenure,
    timeRemaining: formatDuration(outstanding <= 0 ? 0 : remainingTenure),
    prepaymentTotal: Math.round(prepaymentTotal),
    prepaymentCount: allPrepayments.length,
    totalInterestSaved: Math.round(totalInterestSaved),
    isClosed: outstanding <= 0 || loan.status === 'closed',
  };
}

export function computeEmiLoanStats(loan) {
  return simulateAmortization(loan);
}

export function getLoanEndDate(loan) {
  if (!loan.startDate) return null;
  const start = new Date(loan.startDate);
  const tenure = toNum(loan.tenureMonths);
  const end = new Date(start.getFullYear(), start.getMonth() + tenure, start.getDate());
  return end;
}

/** Full months from prepayment date until loan maturity — earlier date = more months = more interest saved */
export function getMonthsFromDateToLoanEnd(loan, fromDate) {
  const from = new Date(fromDate);
  const end = getLoanEndDate(loan);
  if (!end || isNaN(from.getTime())) return 0;
  if (from >= end) return 0;
  let months = (end.getFullYear() - from.getFullYear()) * 12 + (end.getMonth() - from.getMonth());
  if (from.getDate() > end.getDate()) months -= 1;
  return Math.max(0, months);
}

export function getEmiMonthIndex(loan, date) {
  return getMonthsSinceStart(loan.startDate, date) + 1;
}

/** Outstanding balance at a date (EMIs + prior prepayments applied; optionally exclude one prepayment id) */
export function getBalanceAtDate(loan, targetDate, excludePrepaymentIds = []) {
  const disbursedPrincipal = getDisbursedPrincipal(loan);
  const defaultRate = toNum(loan.interestRate);
  const tenure = toNum(loan.tenureMonths);
  const originalEmi = calculateEMI(getEmiPrincipal(loan), defaultRate, tenure);
  const target = new Date(targetDate);
  if (isNaN(target.getTime())) return disbursedPrincipal;

  const excludeSet = new Set(excludePrepaymentIds.filter(Boolean));
  const allPrepayments = getPrepayments(loan)
    .filter((p) => !excludeSet.has(p.id))
    .filter((p) => toNum(p.amount) > 0 && new Date(p.date) <= target)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!loan.startDate) return disbursedPrincipal;

  const targetMonthIndex = getMonthsSinceStart(loan.startDate, target);
  const monthsToRun = Math.min(tenure, targetMonthIndex + 1);

  let balance = disbursedPrincipal;
  const appliedIds = new Set();

  for (let month = 0; month < monthsToRun && balance > 0; month++) {
    const monthlyRate = defaultRate / 100 / 12;
    const interest = balance * monthlyRate;
    const emiPay = Math.min(originalEmi, balance + interest);
    const principalPart = Math.min(Math.max(emiPay - interest, 0), balance);
    balance -= principalPart;

    const { monthStart, monthEnd } = monthWindow(loan.startDate, month);
    for (const pp of allPrepayments) {
      const key = pp.id || `${pp.date}-${pp.amount}`;
      if (appliedIds.has(key)) continue;
      const ppDate = new Date(pp.date);
      if (ppDate >= monthStart && ppDate < monthEnd) {
        balance -= Math.min(toNum(pp.amount), balance);
        appliedIds.add(key);
      }
    }
  }

  for (const pp of allPrepayments) {
    const key = pp.id || `${pp.date}-${pp.amount}`;
    if (!appliedIds.has(key)) {
      balance -= Math.min(toNum(pp.amount), balance);
    }
  }

  return Math.max(0, balance);
}

/** Sum of interest portions on remaining fixed-EMI payments from a given balance */
function projectRemainingInterest(balance, emi, annualRate, months) {
  let b = balance;
  let totalInterest = 0;
  const monthlyRate = annualRate / 100 / 12;
  for (let m = 0; m < months && b > 0.01; m++) {
    const interest = b * monthlyRate;
    totalInterest += interest;
    const emiPay = Math.min(emi, b + interest);
    const principalPart = Math.min(Math.max(emiPay - interest, 0), b);
    b -= principalPart;
  }
  return totalInterest;
}

/** Interest saved = difference in projected remaining interest before vs after prepayment (reducing-balance EMI) */
export function calculateInterestSavedForDate(loan, prepaymentAmount, prepaymentDate, excludePrepaymentId = null) {
  const prepayAmt = toNum(prepaymentAmount);
  if (prepayAmt <= 0 || !loan.startDate) return 0;

  const rate = toNum(loan.interestRate);
  const tenure = toNum(loan.tenureMonths);
  const emi = Math.round(calculateEMI(getEmiPrincipal(loan), rate, tenure));
  const monthsLeft = getMonthsFromDateToLoanEnd(loan, prepaymentDate);
  if (monthsLeft <= 0 || rate <= 0) return 0;

  const exclude = excludePrepaymentId ? [excludePrepaymentId] : [];
  const balanceAtDate = getBalanceAtDate(loan, prepaymentDate, exclude);
  const cappedPrepay = Math.min(prepayAmt, balanceAtDate);
  if (cappedPrepay <= 0) return 0;

  const before = projectRemainingInterest(balanceAtDate, emi, rate, monthsLeft);
  const after = projectRemainingInterest(balanceAtDate - cappedPrepay, emi, rate, monthsLeft);
  return Math.max(0, Math.round(before - after));
}

/** Months of fixed EMI until balance reaches zero */
export function projectMonthsToPayoff(balance, emi, annualRate, maxMonths = 600) {
  let b = toNum(balance);
  const emiPay = toNum(emi);
  const rate = toNum(annualRate);
  if (b <= 0) return 0;
  if (emiPay <= 0) return maxMonths;

  const monthlyRate = rate / 100 / 12;
  let months = 0;
  while (b > 0.01 && months < maxMonths) {
    const interest = b * monthlyRate;
    const payment = Math.min(emiPay, b + interest);
    const principalPart = Math.min(Math.max(payment - interest, 0), b);
    b -= principalPart;
    months++;
  }
  return months;
}

function payoffMonthsForLoanState(loan) {
  const stats = simulateAmortization(loan);
  if (stats.outstanding <= 0) return 0;
  return projectMonthsToPayoff(stats.outstanding, stats.emi, stats.annualRate);
}

/** How much sooner the loan closes thanks to prepayments (vs never prepaying) */
export function getPrepaymentPayoffSavings(loan) {
  const withPrepay = payoffMonthsForLoanState(loan);
  const withoutPrepay = payoffMonthsForLoanState({ ...loan, prepayments: [] });
  const monthsSaved = Math.max(0, withoutPrepay - withPrepay);
  return {
    monthsToPayoff: withPrepay,
    monthsToPayoffWithoutPrepay: withoutPrepay,
    monthsSaved,
    emiEquivalent: monthsSaved,
  };
}

/** Marginal months saved by a single recorded prepayment */
export function getPrepaymentMonthsSaved(loan, prepaymentId) {
  const all = getPrepayments(loan);
  if (!all.some((p) => p.id === prepaymentId)) return 0;
  const without = { ...loan, prepayments: all.filter((p) => p.id !== prepaymentId) };
  return Math.max(0, payoffMonthsForLoanState(without) - payoffMonthsForLoanState(loan));
}

/** Preview months saved if a new prepayment were applied now */
export function getPreviewPrepaymentMonthsSaved(loan, amount, date) {
  const stats = simulateAmortization(loan);
  const prepayAmt = Math.min(toNum(amount), stats.outstanding);
  if (prepayAmt <= 0) return 0;
  const hypothetical = {
    id: 'preview',
    date,
    amount: prepayAmt,
    type: 'prepayment',
  };
  const after = simulateAmortization(loan, [hypothetical]);
  const monthsNow = payoffMonthsForLoanState(loan);
  const monthsAfter = projectMonthsToPayoff(after.outstanding, after.emi, after.annualRate);
  return Math.max(0, monthsNow - monthsAfter);
}

export function formatPayoffAcceleration(months) {
  const n = Math.max(0, Math.round(months));
  if (n <= 0) {
    return { value: 'On schedule', sub: 'Prepayments have not shortened the loan yet' };
  }
  if (n < 12) {
    return {
      value: `${n} mo early`,
      sub: `Equivalent to skipping ${n} EMI${n === 1 ? '' : 's'}`,
    };
  }
  const years = Math.floor(n / 12);
  const rem = n % 12;
  const value = rem > 0 ? `${years} yr ${rem} mo early` : `${years} yr early`;
  return {
    value,
    sub: `Equivalent to skipping ~${n} EMI${n === 1 ? '' : 's'}`,
  };
}
/** @deprecated use calculateInterestSavedForDate */
export function calculateInterestSaved(prepaymentAmount, annualRate, remainingMonths) {
  const p = toNum(prepaymentAmount);
  const n = toNum(remainingMonths);
  const r = toNum(annualRate);
  if (p <= 0 || n <= 0 || r <= 0) return 0;
  return Math.round(p * (r / 100 / 12) * n);
}

export function getPrepaymentSavingsReport(loan) {
  const prepayments = getPrepayments(loan);
  const payoff = getPrepaymentPayoffSavings(loan);
  const items = prepayments.map((p) => {
    const monthsRemaining = getMonthsFromDateToLoanEnd(loan, p.date);
    const emiMonth = getEmiMonthIndex(loan, p.date);
    const interestSaved = calculateInterestSavedForDate(loan, p.amount, p.date, p.id);
    const monthsSavedEarly = getPrepaymentMonthsSaved(loan, p.id);
    return {
      id: p.id,
      date: p.date,
      amount: p.amount,
      emiMonth,
      monthsRemaining,
      interestSaved,
      monthsSavedEarly,
    };
  });
  return {
    items,
    totalSaved: items.reduce((s, i) => s + i.interestSaved, 0),
    totalPrepaid: items.reduce((s, i) => s + i.amount, 0),
    ...payoff,
  };
}

/** Compare same amount prepayed at different EMI months */
export function comparePrepaymentTimings(loan, amount) {
  const amt = toNum(amount) || 100000;
  const tenure = toNum(loan.tenureMonths);
  const sampleMonths = [1, 6, 12, 24, 60].filter((m) => m <= tenure);
  if (!loan.startDate) return [];

  const start = new Date(loan.startDate);
  return sampleMonths.map((monthIdx) => {
    const d = new Date(start.getFullYear(), start.getMonth() + monthIdx - 1, start.getDate());
    const dateStr = d.toISOString().split('T')[0];
    const monthsRemaining = getMonthsFromDateToLoanEnd(loan, dateStr);
    return {
      emiMonth: monthIdx,
      date: dateStr,
      amount: amt,
      monthsRemaining,
      interestSaved: calculateInterestSavedForDate(loan, amt, dateStr),
    };
  });
}

export function previewPrepaymentImpact(loan, amount, date) {
  const stats = simulateAmortization(loan);
  const prepayAmt = Math.min(toNum(amount), stats.outstanding);
  const monthsRemaining = getMonthsFromDateToLoanEnd(loan, date);
  const emiMonth = getEmiMonthIndex(loan, date);
  const interestSaved = calculateInterestSavedForDate(loan, prepayAmt, date);
  const monthsSavedEarly = getPreviewPrepaymentMonthsSaved(loan, prepayAmt, date);
  return {
    prepayAmount: prepayAmt,
    interestSaved,
    monthsSavedEarly,
    monthsRemaining,
    emiMonth,
    currentOutstanding: stats.outstanding,
    newOutstanding: Math.max(0, stats.outstanding - prepayAmt),
    emi: stats.emi,
    remainingEmis: stats.remainingEmis,
  };
}

export function previewPrepayment(loan, prepayment) {
  const before = simulateAmortization(loan);
  const after = simulateAmortization(loan, [prepayment]);
  const amt = Math.min(toNum(prepayment.amount), before.outstanding);
  return {
    before,
    after,
    interestSaved: calculateInterestSavedForDate(loan, amt, prepayment.date),
  };
}

export function previewDisbursement(loan) {
  const before = simulateAmortization(loan);
  const amt = toNum(loan.totalSanctioned) || toNum(loan.loanAmount);
  const after = simulateAmortization({ ...loan, disbursedAmount: amt, loanAmount: amt });
  return {
    before,
    after,
    disbursedAmount: amt,
  };
}

/** Credit card & bill stats */
export function computeRevolvingStats(loan) {
  const limit = toNum(loan.creditLimit) || toNum(loan.totalSanctioned);
  const balance = toNum(loan.statementBalance) || toNum(loan.loanAmount) || toNum(loan.disbursedAmount);
  const minDue = toNum(loan.minDue);
  const rate = toNum(loan.interestRate);
  const utilization = limit > 0 ? (balance / limit) * 100 : 0;

  return {
    loanCategory: 'revolving',
    creditLimit: limit,
    statementBalance: balance,
    minDue,
    annualRate: rate,
    monthlyRate: rate / 12,
    utilization: Math.min(100, utilization),
    availableCredit: Math.max(0, limit - balance),
    dueDate: loan.dueDate || null,
    outstanding: balance,
    emi: minDue,
    isClosed: loan.status === 'closed' || balance <= 0,
    repaymentProgress: limit > 0 ? ((limit - balance) / limit) * 100 : 0,
  };
}

export function computeLoanStats(loan) {
  const type = loan.loanType || loan.type || 'personal';
  if (type === 'credit_card' || type === 'bill') {
    return { ...computeRevolvingStats(loan), loanType: type };
  }
  return { ...simulateAmortization(loan), loanType: type };
}

export function getOutstandingBalance(loan) {
  return computeLoanStats(loan).outstanding;
}

export function createEmptyLoan(id) {
  return {
    id,
    name: '',
    lender: '',
    loanType: 'personal',
    totalSanctioned: '',
    loanAmount: '',
    disbursedAmount: '',
    interestRate: 10.5,
    tenureMonths: 60,
    emiBasis: 'disbursed',
    startDate: new Date().toISOString().split('T')[0],
    status: 'active',
    emisPaid: null,
    prepayments: [],
    creditLimit: '',
    statementBalance: '',
    minDue: '',
    dueDate: '',
  };
}

export function normalizeLoan(loan) {
  return {
    ...createEmptyLoan(loan.id || 'temp'),
    ...loan,
    loanType: loan.loanType || loan.type || 'personal',
    emiBasis: loan.emiBasis || 'disbursed',
    prepayments: getPrepayments(loan),
    loanAmount: loan.loanAmount ?? loan.disbursedAmount ?? '',
  };
}

export function applyPrepayment(loan, prepayment) {
  const prepayments = [...getPrepayments(loan), { ...prepayment, type: 'prepayment' }];
  const updated = { ...loan, prepayments };
  const stats = simulateAmortization(updated);
  const fixedEmi = Math.round(calculateEMI(getEmiPrincipal(loan), toNum(loan.interestRate), toNum(loan.tenureMonths)));
  return {
    ...updated,
    emi: fixedEmi,
    status: stats.isClosed ? 'closed' : loan.status,
  };
}

function finalizeLoanAfterPrepaymentChange(loan) {
  const fixedEmi = Math.round(calculateEMI(getEmiPrincipal(loan), toNum(loan.interestRate), toNum(loan.tenureMonths)));
  const stats = simulateAmortization(loan);
  return {
    ...loan,
    emi: fixedEmi,
    status: stats.isClosed ? 'closed' : (loan.status === 'closed' && !stats.isClosed ? 'active' : loan.status),
  };
}

export function updatePrepayment(loan, prepaymentId, updates) {
  const prepayments = getPrepayments(loan).map((p) => {
    if (p.id !== prepaymentId) return p;
    const merged = { ...p, ...updates, type: 'prepayment' };
    const interestSaved = calculateInterestSavedForDate(loan, merged.amount, merged.date, prepaymentId);
    return { ...merged, interestSaved };
  });
  return finalizeLoanAfterPrepaymentChange({ ...loan, prepayments });
}

export function removePrepayment(loan, prepaymentId) {
  const prepayments = getPrepayments(loan).filter((p) => p.id !== prepaymentId);
  return finalizeLoanAfterPrepaymentChange({ ...loan, prepayments });
}
