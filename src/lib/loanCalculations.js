import { toNum, formatIndianCurrency } from './utils';

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
  const n = Math.max(0, Math.round(toNum(months)));
  const years = Math.floor(n / 12);
  const m = n % 12;
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

export const MAX_TENURE_MONTHS = 35 * 12; // 35 years

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

function emiDateForMonth(startDate, monthIndex) {
  if (!startDate) return '';
  const start = new Date(startDate);
  const d = new Date(start.getFullYear(), start.getMonth() + monthIndex, start.getDate());
  return d.toISOString().split('T')[0];
}

/** EMIs elapsed since start — always auto from start date */
export function getPaidEmiCount(loan) {
  if (!loan.startDate) return 0;
  const tenure = toNum(loan.tenureMonths);
  return Math.min(tenure, getMonthsSinceStart(loan.startDate));
}

export function formatManualEmiPaymentsSummary(loan) {
  const items = getManualEmiPayments(loan);
  if (!items.length) return '—';
  return items
    .map((p) => `${formatIndianCurrency(p.amount, false)}/mo through ${p.date}`)
    .join(' · ');
}

/** Dated actual EMI amounts — each entry applies from loan start through that date, then until next change */
export function getManualEmiPayments(loan) {
  return (loan.manualEmiPayments || [])
    .filter((p) => toNum(p.amount) > 0 && p.date)
    .map((p) => ({ ...p, amount: Math.round(toNum(p.amount)) }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function getManualEmiDateBounds(loan, asOfDate = new Date()) {
  const today = asOfDate instanceof Date ? asOfDate.toISOString().split('T')[0] : String(asOfDate).slice(0, 10);
  const minDate = loan.startDate || today;
  return { minDate, maxDate: today };
}

export function clampManualEmiDate(date, loan, asOfDate = new Date()) {
  const { minDate, maxDate } = getManualEmiDateBounds(loan, asOfDate);
  if (!date) return minDate;
  let d = String(date).slice(0, 10);
  if (minDate && d < minDate) d = minDate;
  if (maxDate && d > maxDate) d = maxDate;
  return d;
}

/**
 * Each schedule entry (date, amount) means: from loan start through that date, pay `amount` each month.
 * After the last entry's date, the last amount still applies until a new entry is added.
 */
export function getManualPaymentForMonth(loan, monthIndex) {
  const payments = getManualEmiPayments(loan);
  if (!payments.length || !loan.startDate || monthIndex < 0) return null;

  const emiDate = new Date(emiDateForMonth(loan.startDate, monthIndex));
  if (isNaN(emiDate.getTime())) return null;

  let chosen = null;
  for (const p of payments) {
    const through = new Date(p.date);
    if (isNaN(through.getTime())) continue;
    chosen = p.amount;
    if (emiDate <= through) break;
  }
  return chosen != null ? Math.round(chosen) : null;
}

/** Latest / current month manual payment if any */
export function getManualEmi(loan) {
  if (!loan.startDate) {
    const legacy = toNum(loan.manualEmi);
    return legacy > 0 ? Math.round(legacy) : null;
  }
  const tenure = toNum(loan.tenureMonths);
  const idx = Math.min(getPaidEmiCount(loan), Math.max(0, tenure - 1));
  return getManualPaymentForMonth(loan, idx) ?? getManualPaymentForMonth(loan, idx - 1);
}

/** Split a monthly payment into interest, scheduled principal, and extra principal */
export function computePaymentBreakdown(outstanding, scheduledEmi, annualRate, manualAmount = null) {
  const monthlyRate = toNum(annualRate) / 100 / 12;
  const scheduled = Math.round(scheduledEmi);
  const manual = manualAmount != null && toNum(manualAmount) > 0 ? Math.round(toNum(manualAmount)) : null;
  const monthlyPayment = manual ?? scheduled;

  if (outstanding <= 0) {
    return {
      scheduledEmi: scheduled,
      monthlyPayment,
      hasManualEmi: manual != null,
      interestPortion: 0,
      scheduledPrincipal: 0,
      extraPrincipal: 0,
      totalPrincipal: 0,
    };
  }

  const interestPortion = Math.round(outstanding * monthlyRate);
  const scheduledPay = Math.min(scheduled, outstanding + interestPortion);
  const scheduledPrincipal = Math.min(Math.max(scheduledPay - interestPortion, 0), outstanding);
  const extraPrincipal = manual && manual > scheduled
    ? Math.min(manual - scheduled, Math.max(0, outstanding - scheduledPrincipal))
    : 0;
  const totalPrincipal = Math.min(scheduledPrincipal + extraPrincipal, outstanding);

  return {
    scheduledEmi: scheduled,
    monthlyPayment,
    hasManualEmi: manual != null,
    interestPortion,
    scheduledPrincipal,
    extraPrincipal,
    totalPrincipal,
  };
}

/** Split a monthly payment into interest, scheduled principal, and extra principal */
export function computeMonthlyPaymentBreakdown(loan, outstanding, scheduledEmi, annualRate, monthIndex = null) {
  const idx = monthIndex != null
    ? monthIndex
    : Math.min(getPaidEmiCount(loan), Math.max(0, toNum(loan.tenureMonths) - 1));
  const manual = getManualPaymentForMonth(loan, idx);
  return computePaymentBreakdown(outstanding, scheduledEmi, annualRate, manual);
}

function applyPrepaymentsInMonth(loan, month, balance, allPrepayments, appliedIds) {
  let prepaymentTotal = 0;
  if (!loan.startDate) return { balance, prepaymentTotal };

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
  return { balance: Math.max(0, balance), prepaymentTotal };
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

  const emisPaid = getPaidEmiCount(loan);
  const paidEmis = Math.min(emisPaid, tenure);

  let balance = disbursedPrincipal;
  let interestPaid = 0;
  let principalFromEmi = 0;
  let prepaymentTotal = 0;
  const appliedIds = new Set();
  const scheduledEmi = Math.round(originalEmi);

  for (let month = 0; month < paidEmis && balance > 0; month++) {
    const manualAmt = getManualPaymentForMonth(loan, month);
    const breakdown = computePaymentBreakdown(balance, scheduledEmi, defaultRate, manualAmt);
    interestPaid += breakdown.interestPortion;
    principalFromEmi += breakdown.totalPrincipal;
    balance = Math.max(0, balance - breakdown.totalPrincipal);

    const prep = applyPrepaymentsInMonth(loan, month, balance, allPrepayments, appliedIds);
    balance = prep.balance;
    prepaymentTotal += prep.prepaymentTotal;
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
  const scheduleRemainingMonths = Math.max(0, tenure - paidEmis);
  const emi = Math.round(originalEmi);
  const actualPayoffMonths = outstanding <= 0
    ? 0
    : projectMonthsToPayoff(outstanding, emi, defaultRate);
  const monthsSavedVsSchedule = Math.max(0, scheduleRemainingMonths - actualPayoffMonths);

  const totalPrincipalPaid = principalFromEmi + prepaymentTotal;
  const totalInterestIfFull = originalEmi * tenure - emiPrincipal;
  const monthlyRate = defaultRate / 100 / 12;
  const remainingInterest = outstanding > 0
    ? Math.round(outstanding * monthlyRate * scheduleRemainingMonths)
    : 0;
  const repaymentProgress = disbursedPrincipal > 0 ? (totalPrincipalPaid / disbursedPrincipal) * 100 : 0;

  const sanctioned = toNum(loan.totalSanctioned) || disbursedPrincipal;
  const disbursed = disbursedPrincipal;
  const totalInterestSaved = getPrepayments(loan).reduce(
    (sum, p) => sum + calculateInterestSavedForDate(loan, p.amount, p.date, p.id),
    0,
  );

  const paymentBreakdown = computeMonthlyPaymentBreakdown(
    loan,
    outstanding,
    scheduledEmi,
    defaultRate,
    Math.min(paidEmis, Math.max(0, tenure - 1)),
  );

  return {
    loanCategory: 'emi',
    originalEmi: Math.round(originalEmi),
    scheduledEmi: paymentBreakdown.scheduledEmi,
    emi: paymentBreakdown.scheduledEmi,
    monthlyPayment: paymentBreakdown.monthlyPayment,
    hasManualEmi: getManualEmiPayments(loan).length > 0 || paymentBreakdown.hasManualEmi,
    monthlyInterest: paymentBreakdown.interestPortion,
    monthlyScheduledPrincipal: paymentBreakdown.scheduledPrincipal,
    monthlyExtraPrincipal: paymentBreakdown.extraPrincipal,
    monthlyTotalPrincipal: paymentBreakdown.totalPrincipal,
    currentEmi: paymentBreakdown.monthlyPayment,
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
    remainingEmis: outstanding <= 0 ? 0 : scheduleRemainingMonths,
    totalEmis: tenure,
    totalTenureLabel: formatDuration(tenure),
    scheduleTimeRemainingMonths: scheduleRemainingMonths,
    scheduleTimeRemaining: formatDuration(scheduleRemainingMonths),
    actualPayoffMonths,
    actualPayoffTimeRemaining: formatDuration(actualPayoffMonths),
    monthsSavedVsSchedule,
    prepaymentPrincipalPct: disbursedPrincipal > 0
      ? Math.min(100, (prepaymentTotal / disbursedPrincipal) * 100)
      : 0,
    interestPaid: Math.round(interestPaid),
    principalPaid: Math.round(totalPrincipalPaid),
    totalInterestProjected: Math.round(Math.max(0, totalInterestIfFull)),
    remainingInterest,
    totalPayable: Math.round(originalEmi * tenure),
    repaymentProgress: Math.min(100, repaymentProgress),
    timeRemainingMonths: outstanding <= 0 ? 0 : actualPayoffMonths,
    timeRemaining: formatDuration(outstanding <= 0 ? 0 : actualPayoffMonths),
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
    const manualAmt = getManualPaymentForMonth(loan, month);
    const breakdown = computePaymentBreakdown(balance, Math.round(originalEmi), defaultRate, manualAmt);
    balance = Math.max(0, balance - breakdown.totalPrincipal);

    const prep = applyPrepaymentsInMonth(loan, month, balance, allPrepayments, appliedIds);
    balance = prep.balance;
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
  return {
    value: `${formatDuration(n)} early`,
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

export function previewPrepaymentImpact(loan, amount, date, excludePrepaymentId = null) {
  const stats = simulateAmortization(loan);
  const maxAllowed = getMaxPrepaymentAmount(loan, date, excludePrepaymentId);
  const requested = toNum(amount);
  const prepayAmt = Math.min(requested, maxAllowed);
  const monthsRemaining = getMonthsFromDateToLoanEnd(loan, date);
  const emiMonth = getEmiMonthIndex(loan, date);
  const interestSaved = calculateInterestSavedForDate(loan, prepayAmt, date, excludePrepaymentId);
  const monthsSavedEarly = getPreviewPrepaymentMonthsSaved(loan, prepayAmt, date);
  return {
    prepayAmount: prepayAmt,
    requestedAmount: requested,
    maxAllowed,
    exceedsOutstanding: requested > maxAllowed,
    interestSaved,
    monthsSavedEarly,
    monthsRemaining,
    emiMonth,
    currentOutstanding: stats.outstanding,
    newOutstanding: Math.max(0, maxAllowed - prepayAmt),
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
  const manual = getManualEmi(loan);
  const monthlyPayment = manual ?? minDue;

  return {
    loanCategory: 'revolving',
    creditLimit: limit,
    statementBalance: balance,
    minDue,
    scheduledEmi: minDue,
    monthlyPayment,
    hasManualEmi: manual != null,
    monthlyInterest: 0,
    monthlyScheduledPrincipal: monthlyPayment,
    monthlyExtraPrincipal: manual && manual > minDue ? manual - minDue : 0,
    monthlyTotalPrincipal: monthlyPayment,
    annualRate: rate,
    monthlyRate: rate / 12,
    utilization: Math.min(100, utilization),
    availableCredit: Math.max(0, limit - balance),
    dueDate: loan.dueDate || null,
    outstanding: balance,
    emi: minDue,
    currentEmi: monthlyPayment,
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

export function getLoanMonthlyOutflow(stats) {
  return toNum(stats.monthlyPayment) || toNum(stats.emi) || 0;
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
    manualEmiPayments: [],
    prepayments: [],
    creditLimit: '',
    statementBalance: '',
    minDue: '',
    dueDate: '',
  };
}

function migrateLegacyManualEmi(loan) {
  const existing = getManualEmiPayments(loan);
  if (existing.length > 0) return existing;
  const legacy = toNum(loan.manualEmi);
  if (legacy <= 0 || !loan.startDate) return [];
  const tenure = toNum(loan.tenureMonths);
  const monthIdx = Math.min(getPaidEmiCount(loan), Math.max(0, tenure - 1));
  return [{
    id: loan.id ? `${loan.id}-legacy-emi` : 'legacy-emi',
    date: emiDateForMonth(loan.startDate, monthIdx),
    amount: Math.round(legacy),
  }];
}

export function normalizeLoan(loan) {
  const tenure = Math.min(Math.max(1, toNum(loan.tenureMonths) || 60), MAX_TENURE_MONTHS);
  const sanctioned = toNum(loan.totalSanctioned);
  const disbursedRaw = toNum(loan.disbursedAmount) || toNum(loan.loanAmount);
  const disbursed = sanctioned > 0 ? Math.min(disbursedRaw, sanctioned) : disbursedRaw;
  const manualEmiPayments = migrateLegacyManualEmi(loan).map((p) => ({
    ...p,
    date: clampManualEmiDate(p.date, { startDate: loan.startDate }),
  }));

  return {
    ...createEmptyLoan(loan.id || 'temp'),
    ...loan,
    loanType: loan.loanType || loan.type || 'personal',
    emiBasis: loan.emiBasis || 'disbursed',
    tenureMonths: tenure,
    totalSanctioned: loan.totalSanctioned ?? '',
    disbursedAmount: disbursed || loan.disbursedAmount || '',
    loanAmount: disbursed || loan.loanAmount || loan.disbursedAmount || '',
    prepayments: getPrepayments(loan),
    manualEmiPayments,
    manualEmi: '',
    emisPaid: null,
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

/** Max prepayment allowed on a date — cannot exceed outstanding principal at that date */
export function getMaxPrepaymentAmount(loan, date, excludePrepaymentId = null) {
  const exclude = excludePrepaymentId ? [excludePrepaymentId] : [];
  return Math.max(0, Math.round(getBalanceAtDate(loan, date, exclude)));
}

/**
 * Bank-style loan ledger: interest debited first, then EMI/prepayment credited.
 * Each EMI period shows opening balance, transactions, interest/principal split, closing balance.
 */
export function buildLoanBankStatement(loan) {
  const disbursedPrincipal = getDisbursedPrincipal(loan);
  if (disbursedPrincipal <= 0 || !loan.startDate) return [];

  const rate = toNum(loan.interestRate);
  const tenure = toNum(loan.tenureMonths);
  const scheduledEmi = Math.round(calculateEMI(getEmiPrincipal(loan), rate, tenure));
  const emisPaid = getPaidEmiCount(loan);
  const paidEmiMonths = Math.min(tenure, Math.max(emisPaid, 0));

  const prepayments = getPrepayments(loan)
    .filter((p) => toNum(p.amount) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const entries = [];
  let balance = disbursedPrincipal;
  const appliedPrepIds = new Set();

  for (let month = 0; month < paidEmiMonths && balance > 0; month++) {
    const emiDate = emiDateForMonth(loan.startDate, month);
    const openingBalance = Math.round(balance);
    const manualAmt = getManualPaymentForMonth(loan, month);
    const breakdown = computePaymentBreakdown(balance, scheduledEmi, rate, manualAmt);
    const interest = breakdown.interestPortion;
    const principal = breakdown.totalPrincipal;
    const closingBalance = Math.max(0, openingBalance - principal);

    const transactions = [
      {
        label: 'Interest',
        type: 'debit',
        amount: interest,
        description: 'Interest charged on outstanding principal',
      },
      {
        label: breakdown.hasManualEmi && breakdown.monthlyPayment > scheduledEmi ? 'Payment' : 'EMI',
        type: 'credit',
        amount: breakdown.monthlyPayment,
        description: breakdown.hasManualEmi
          ? `Your payment (bank EMI ${scheduledEmi})`
          : 'EMI received',
      },
    ];

    entries.push({
      id: `emi-${month}`,
      date: emiDate,
      tag: 'emi',
      emiMonth: month + 1,
      openingBalance,
      interest,
      principal: breakdown.scheduledPrincipal,
      extraPrincipal: breakdown.extraPrincipal,
      totalPrincipal: principal,
      payment: breakdown.monthlyPayment,
      scheduledEmi,
      hasManualEmi: breakdown.hasManualEmi,
      transactions,
      closingBalance,
      balanceAfterInterest: openingBalance + interest,
    });

    balance = closingBalance;

    if (loan.startDate) {
      const { monthStart, monthEnd } = monthWindow(loan.startDate, month);
      for (const pp of prepayments) {
        const key = pp.id || `${pp.date}-${pp.amount}`;
        if (appliedPrepIds.has(key)) continue;
        const ppDate = new Date(pp.date);
        if (isNaN(ppDate.getTime())) continue;
        if (ppDate >= monthStart && ppDate < monthEnd) {
          const prepayOpening = Math.round(balance);
          const amt = Math.min(toNum(pp.amount), balance);
          if (amt <= 0) continue;
          balance -= amt;
          entries.push({
            id: `prepay-${pp.id || key}`,
            date: pp.date,
            tag: 'prepayment',
            emiMonth: month + 1,
            openingBalance: prepayOpening,
            interest: 0,
            principal: amt,
            extraPrincipal: 0,
            totalPrincipal: amt,
            payment: amt,
            scheduledEmi: 0,
            hasManualEmi: false,
            notes: pp.notes,
            transactions: [
              {
                label: 'Prepayment',
                type: 'credit',
                amount: amt,
                description: 'Additional principal payment',
              },
            ],
            closingBalance: Math.round(balance),
          });
          appliedPrepIds.add(key);
        }
      }
    }
  }

  for (const pp of prepayments) {
    const key = pp.id || `${pp.date}-${pp.amount}`;
    if (appliedPrepIds.has(key)) continue;
    const prepayOpening = Math.round(balance);
    const amt = Math.min(toNum(pp.amount), balance);
    if (amt <= 0) continue;
    balance -= amt;
    entries.push({
      id: `prepay-${pp.id || key}`,
      date: pp.date,
      tag: 'prepayment',
      emiMonth: getEmiMonthIndex(loan, pp.date),
      openingBalance: prepayOpening,
      interest: 0,
      principal: amt,
      extraPrincipal: 0,
      totalPrincipal: amt,
      payment: amt,
      scheduledEmi: 0,
      hasManualEmi: false,
      notes: pp.notes,
      transactions: [
        {
          label: 'Prepayment',
          type: 'credit',
          amount: amt,
          description: 'Additional principal payment',
        },
      ],
      closingBalance: Math.round(balance),
    });
    appliedPrepIds.add(key);
  }

  return entries.sort((a, b) => new Date(b.date) - new Date(a.date) || (b.emiMonth - a.emiMonth));
}
