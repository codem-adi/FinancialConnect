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

export function getDisbursements(loan) {
  const items = (loan.disbursements || [])
    .filter((d) => toNum(d.amount) > 0 && d.date)
    .map((d) => ({ ...d, amount: Math.round(toNum(d.amount)) }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (items.length > 0) return items;

  const legacy = toNum(loan.disbursedAmount) || toNum(loan.loanAmount);
  if (legacy <= 0) return [];

  const date = loan.startDate
    || (loan.disbursements || []).find((d) => d.date)?.date
    || new Date().toISOString().split('T')[0];

  return [{
    id: loan.id ? `${loan.id}-legacy-disb` : 'legacy-disb',
    date: String(date).slice(0, 10),
    amount: Math.round(legacy),
  }];
}

export function getUndisbursedAmount(loan) {
  const sanctioned = toNum(loan.totalSanctioned);
  if (sanctioned <= 0) return 0;
  return Math.max(0, sanctioned - getDisbursedPrincipal(loan));
}

export function getMaxDisbursementAmount(loan) {
  return Math.max(0, Math.round(getUndisbursedAmount(loan)));
}

/** Max amount allowed when editing one draw (others unchanged). */
export function getMaxDisbursementEditAmount(loan, disbursementId) {
  const sanctioned = toNum(loan.totalSanctioned);
  const disbursements = getDisbursements(loan);
  const otherTotal = disbursements
    .filter((d) => d.id !== disbursementId)
    .reduce((sum, d) => sum + toNum(d.amount), 0);
  if (sanctioned <= 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.round(sanctioned - otherTotal));
}

export function getDisbursementProgressPct(loan) {
  const sanctioned = toNum(loan.totalSanctioned);
  if (sanctioned <= 0) return 0;
  return Math.min(100, (getDisbursedPrincipal(loan) / sanctioned) * 100);
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

/** Principal actually drawn — sum of disbursement entries */
export function getDisbursedPrincipal(loan) {
  const fromEntries = getDisbursements(loan).reduce((sum, d) => sum + toNum(d.amount), 0);
  if (fromEntries > 0) return fromEntries;
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

const DAY_MS = 24 * 60 * 60 * 1000;
/** BOB home loans: actual/365 daily reducing balance */
export const BOB_INTEREST_DAYS_PER_YEAR = 365;
/** EMI interest/payment posts at 6:00 PM on the EMI date */
export const EMI_POST_OFFSET_MS = 18 * 60 * 60 * 1000;

function nextDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

/** Only user-verified rate changes — never auto-inferred from statements */
export function getVerifiedRateHistory(loan) {
  return (loan.rateHistory || [])
    .filter((entry) => entry?.verified && entry.effectiveDate && toNum(entry.rate) > 0)
    .map((entry) => ({
      ...entry,
      rate: toNum(entry.rate),
      effectiveDate: String(entry.effectiveDate).slice(0, 10),
    }))
    .sort((a, b) => parseYmd(a.effectiveDate) - parseYmd(b.effectiveDate));
}

/** Annual rate on a date — loan.interestRate unless a verified change applies */
export function getRateForDate(loan, date) {
  const base = toNum(loan.interestRate);
  const target = parseYmd(date);
  if (Number.isNaN(target.getTime())) return base;
  let rate = base;
  for (const entry of getVerifiedRateHistory(loan)) {
    if (parseYmd(entry.effectiveDate) <= target) rate = entry.rate;
  }
  return rate;
}

export function hasVerifiedRateChanges(loan) {
  return getVerifiedRateHistory(loan).length > 0;
}

function parseYmd(dateStr) {
  const parts = String(dateStr).slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return new Date(NaN);
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function clampEmiDayForMonth(emiDay, year, month) {
  return Math.min(Math.max(1, emiDay), daysInMonth(year, month));
}

/** Day of month when EMI is due (1–31). Defaults to start date's day for older loans. */
export function getEmiDay(loan) {
  const fromField = toNum(loan.emiDay);
  if (fromField >= 1 && fromField <= 31) return Math.round(fromField);
  if (!loan.startDate) return 1;
  const start = parseYmd(loan.startDate);
  return Number.isNaN(start.getTime()) ? 1 : start.getDate();
}

/** First EMI due date — next occurrence of emi day strictly after loan start */
export function getFirstEmiDate(loan) {
  if (!loan.startDate) return '';
  const start = parseYmd(loan.startDate);
  if (Number.isNaN(start.getTime())) return '';
  const emiDay = getEmiDay(loan);
  let year = start.getFullYear();
  let month = start.getMonth();
  let candidate = new Date(year, month, clampEmiDayForMonth(emiDay, year, month));
  while (candidate <= start) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    candidate = new Date(year, month, clampEmiDayForMonth(emiDay, year, month));
  }
  return formatYmd(candidate);
}

/** EMI due date for schedule month index (0 = first EMI) */
export function emiDateForMonth(loan, monthIndex) {
  const first = getFirstEmiDate(loan);
  if (!first) return '';
  const d = parseYmd(first);
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + monthIndex);
  const y = d.getFullYear();
  const m = d.getMonth();
  return formatYmd(new Date(y, m, clampEmiDayForMonth(getEmiDay(loan), y, m)));
}

function getEmiPeriod(loan, monthIndex) {
  const periodEnd = emiDateForMonth(loan, monthIndex);
  const periodStart = monthIndex === 0
    ? String(loan.startDate).slice(0, 10)
    : emiDateForMonth(loan, monthIndex - 1);
  return { periodStart, periodEnd };
}

function emiPeriodWindow(loan, monthIndex) {
  const { periodStart, periodEnd } = getEmiPeriod(loan, monthIndex);
  return { periodStart: parseYmd(periodStart), periodEnd: parseYmd(periodEnd) };
}

function computeBobDailyInterest(loan, openingPrincipal, periodStart, periodEnd, disbursementsByDate = {}) {
  let principal = toNum(openingPrincipal);
  let accrued = 0;
  let day = periodStart instanceof Date ? new Date(periodStart.getTime()) : parseYmd(periodStart);
  const end = periodEnd instanceof Date ? periodEnd : parseYmd(periodEnd);
  if (Number.isNaN(day.getTime()) || Number.isNaN(end.getTime()) || principal <= 0) {
    return { interest: 0, interestExact: 0, dayCount: 0, closingPrincipal: principal, rateUsed: getRateForDate(loan, periodEnd) };
  }

  let dayCount = 0;
  let lastRate = getRateForDate(loan, formatYmd(day));

  while (day <= end) {
    const ymd = formatYmd(day);
    const disb = toNum(disbursementsByDate[ymd]);
    if (disb > 0) principal += disb;
    const rate = getRateForDate(loan, ymd);
    lastRate = rate;
    if (principal > 0 && rate > 0) {
      accrued += principal * (rate / 100) / BOB_INTEREST_DAYS_PER_YEAR;
    }
    dayCount += 1;
    day = nextDay(day);
  }

  return {
    interest: Math.round(accrued),
    interestExact: accrued,
    dayCount,
    closingPrincipal: principal,
    rateUsed: lastRate,
  };
}

function computeInterestForPeriod(loan, principal, fromDate, toDate, disbursementsByDate = {}) {
  return computeBobDailyInterest(loan, principal, fromDate, toDate, disbursementsByDate).interest;
}

function computePeriodInterestWithDisbursements(balance, loan, month, allDisbursements, appliedIds) {
  const { periodStart, periodEnd } = emiPeriodWindow(loan, month);
  const periodStartStr = formatYmd(periodStart);
  const periodEndStr = formatYmd(periodEnd);

  const disbursementsByDate = {};
  let disbursementTotal = 0;

  for (const d of allDisbursements) {
    const key = d.id || `${d.date}-${d.amount}`;
    if (appliedIds.has(key)) continue;
    const dDate = parseYmd(d.date);
    if (Number.isNaN(dDate.getTime()) || dDate < periodStart || dDate > periodEnd) continue;
    const ymd = formatYmd(dDate);
    const amt = toNum(d.amount);
    disbursementsByDate[ymd] = (disbursementsByDate[ymd] || 0) + amt;
    disbursementTotal += amt;
    appliedIds.add(key);
  }

  const daily = computeBobDailyInterest(loan, balance, periodStart, periodEnd, disbursementsByDate);

  return {
    principal: daily.closingPrincipal,
    interest: daily.interest,
    interestExact: daily.interestExact,
    disbursementTotal,
    dayCount: daily.dayCount,
    rateUsed: daily.rateUsed,
    periodStart: periodStartStr,
    periodEnd: periodEndStr,
  };
}

/** EMIs whose due date has passed */
export function getPaidEmiCount(loan, asOfDate = new Date()) {
  if (!loan.startDate) return 0;
  const tenure = toNum(loan.tenureMonths);
  const today = asOfDate instanceof Date ? formatYmd(asOfDate) : String(asOfDate).slice(0, 10);
  let count = 0;
  for (let i = 0; i < tenure; i++) {
    const emiDate = emiDateForMonth(loan, i);
    if (emiDate && today >= emiDate) count += 1;
    else break;
  }
  return count;
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

  const emiDate = parseYmd(emiDateForMonth(loan, monthIndex));
  if (Number.isNaN(emiDate.getTime())) return null;

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

export const EMI_MONTH_STATUS = {
  paid: { id: 'paid', label: 'Paid' },
  unpaid: { id: 'unpaid', label: 'EMI not paid', description: 'Interest charged — no EMI credited this month' },
};

export function getEmiMonthStatuses(loan) {
  return loan.emiMonthStatuses && typeof loan.emiMonthStatuses === 'object'
    ? loan.emiMonthStatuses
    : {};
}

export function getEmiMonthStatus(loan, monthIndex) {
  const status = getEmiMonthStatuses(loan)[String(monthIndex)];
  if (status === 'unpaid' || status === 'skipped' || status === 'bounced') return 'unpaid';
  return 'paid';
}

export function updateEmiMonthStatus(loan, monthIndex, status) {
  const statuses = { ...getEmiMonthStatuses(loan) };
  const key = String(monthIndex);
  if (!status || status === 'paid') {
    delete statuses[key];
  } else {
    statuses[key] = 'unpaid';
  }
  return { ...loan, emiMonthStatuses: statuses };
}

/** EMI month index for the current cycle (null if no EMI is due yet). */
export function getCurrentEmiMonthIndex(loan, asOfDate = new Date()) {
  if (!loan.startDate) return null;
  const tenure = toNum(loan.tenureMonths);
  if (tenure <= 0) return null;

  const count = getPaidEmiCount(loan, asOfDate);
  if (count <= 0) return null;

  const monthIndex = Math.min(count - 1, tenure - 1);
  const emiDate = emiDateForMonth(loan, monthIndex);
  const today = (asOfDate instanceof Date ? asOfDate : new Date(asOfDate)).toISOString().split('T')[0];
  if (today < emiDate) return null;

  return monthIndex;
}

export function getEmiDueDateForMonth(loan, monthIndex) {
  return emiDateForMonth(loan, monthIndex);
}

/** Apply one EMI month to outstanding principal — respects unpaid status and period interest */
function processEmiMonth(principal, loan, monthIndex, scheduledEmi, annualRate, periodInterest = null) {
  const status = getEmiMonthStatus(loan, monthIndex);
  const manualAmt = getManualPaymentForMonth(loan, monthIndex);
  const scheduled = Math.round(scheduledEmi);
  const manual = manualAmt != null && toNum(manualAmt) > 0 ? Math.round(toNum(manualAmt)) : null;
  const monthlyPayment = manual ?? scheduled;

  const interest = periodInterest != null
    ? Math.round(periodInterest)
    : computePaymentBreakdown(principal, scheduledEmi, annualRate, manualAmt).interestPortion;

  if (principal <= 0) {
    const emptyBreakdown = {
      scheduledEmi: scheduled,
      monthlyPayment,
      hasManualEmi: manual != null,
      interestPortion: 0,
      scheduledPrincipal: 0,
      extraPrincipal: 0,
      totalPrincipal: 0,
    };
    return {
      status,
      interest: 0,
      payment: 0,
      principalReduction: 0,
      newPrincipal: 0,
      breakdown: emptyBreakdown,
    };
  }

  const scheduledPay = Math.min(scheduled, principal + interest);
  const scheduledPrincipal = Math.min(Math.max(scheduledPay - interest, 0), principal);
  const extraPrincipal = manual && manual > scheduled
    ? Math.min(manual - scheduled, Math.max(0, principal - scheduledPrincipal))
    : 0;
  const totalPrincipal = Math.min(scheduledPrincipal + extraPrincipal, principal);

  const breakdown = {
    scheduledEmi: scheduled,
    monthlyPayment,
    hasManualEmi: manual != null,
    interestPortion: interest,
    scheduledPrincipal,
    extraPrincipal,
    totalPrincipal,
  };

  if (status === 'paid') {
    return {
      status,
      interest,
      payment: monthlyPayment,
      principalReduction: totalPrincipal,
      newPrincipal: Math.max(0, principal - totalPrincipal),
      breakdown,
    };
  }

  return {
    status,
    interest,
    payment: 0,
    principalReduction: 0,
    newPrincipal: Math.max(0, principal + interest),
    breakdown,
  };
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

function applyDisbursementsInPeriod(loan, month, balance, allDisbursements, appliedIds) {
  let disbursementTotal = 0;
  if (!loan.startDate) return { balance, disbursementTotal };

  const { periodStart, periodEnd } = emiPeriodWindow(loan, month);
  for (const d of allDisbursements) {
    const key = d.id || `${d.date}-${d.amount}`;
    if (appliedIds.has(key)) continue;
    const dDate = parseYmd(d.date);
    if (Number.isNaN(dDate.getTime())) continue;
    if (dDate >= periodStart && dDate <= periodEnd) {
      const amt = toNum(d.amount);
      balance += amt;
      disbursementTotal += amt;
      appliedIds.add(key);
    }
  }
  return { balance, disbursementTotal };
}

function applyPrepaymentsInPeriod(loan, month, balance, allPrepayments, appliedIds) {
  let prepaymentTotal = 0;
  if (!loan.startDate) return { balance, prepaymentTotal };

  const { periodStart, periodEnd } = emiPeriodWindow(loan, month);
  for (const pp of allPrepayments) {
    const key = pp.id || `${pp.date}-${pp.amount}`;
    if (appliedIds.has(key)) continue;
    const ppDate = parseYmd(pp.date);
    if (Number.isNaN(ppDate.getTime())) continue;
    if (ppDate >= periodStart && ppDate <= periodEnd) {
      const amt = Math.min(toNum(pp.amount), balance);
      balance -= amt;
      prepaymentTotal += amt;
      appliedIds.add(key);
    }
  }
  return { balance: Math.max(0, balance), prepaymentTotal };
}

function accrueEmiPeriodToDate(balance, loan, monthIndex, toDateStr, rate, allDisbursements, appliedDisbIds, allPrepayments, appliedPrepIds) {
  const { periodStart, periodEnd } = emiPeriodWindow(loan, monthIndex);
  const target = parseYmd(toDateStr);
  if (Number.isNaN(target.getTime()) || target < periodStart) return balance;
  const end = target < periodEnd ? target : periodEnd;

  let principal = balance;

  const disbs = allDisbursements
    .filter((d) => {
      const key = d.id || `${d.date}-${d.amount}`;
      if (appliedDisbIds.has(key)) return false;
      const dDate = parseYmd(d.date);
      return !Number.isNaN(dDate.getTime()) && dDate >= periodStart && dDate <= end;
    })
    .sort((a, b) => parseYmd(a.date) - parseYmd(b.date));

  for (const d of disbs) {
    principal += toNum(d.amount);
    appliedDisbIds.add(d.id || `${d.date}-${d.amount}`);
  }

  const preps = allPrepayments
    .filter((pp) => {
      const key = pp.id || `${pp.date}-${pp.amount}`;
      if (appliedPrepIds.has(key)) return false;
      const ppDate = parseYmd(pp.date);
      return !Number.isNaN(ppDate.getTime()) && ppDate >= periodStart && ppDate <= end;
    })
    .sort((a, b) => parseYmd(a.date) - parseYmd(b.date));

  for (const pp of preps) {
    const amt = Math.min(toNum(pp.amount), principal);
    principal = Math.max(0, principal - amt);
    appliedPrepIds.add(pp.id || `${pp.date}-${pp.amount}`);
  }

  return Math.max(0, principal);
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

  const allDisbursements = getDisbursements(loan);
  const emisPaid = getPaidEmiCount(loan);
  const paidEmis = Math.min(emisPaid, tenure);

  let balance = 0;
  let interestPaid = 0;
  let principalFromEmi = 0;
  let prepaymentTotal = 0;
  const appliedPrepIds = new Set();
  const appliedDisbIds = new Set();
  const scheduledEmi = Math.round(originalEmi);

  for (let month = 0; month < paidEmis; month++) {
    const period = computePeriodInterestWithDisbursements(balance, loan, month, allDisbursements, appliedDisbIds);
    balance = period.principal;
    if (balance <= 0) continue;

    const monthResult = processEmiMonth(balance, loan, month, scheduledEmi, defaultRate, period.interest);
    interestPaid += monthResult.interest;
    principalFromEmi += monthResult.principalReduction;
    balance = monthResult.newPrincipal;

    const prep = applyPrepaymentsInPeriod(loan, month, balance, allPrepayments, appliedPrepIds);
    balance = prep.balance;
    prepaymentTotal += prep.prepaymentTotal;
  }

  for (const d of allDisbursements) {
    const key = d.id || `${d.date}-${d.amount}`;
    if (!appliedDisbIds.has(key)) {
      balance += toNum(d.amount);
      appliedDisbIds.add(key);
    }
  }

  // Prepayments after EMI period or with future dates relative to paid EMIs
  for (const pp of allPrepayments) {
    const key = pp.id || `${pp.date}-${pp.amount}`;
    if (appliedPrepIds.has(key)) continue;
    const amt = Math.min(toNum(pp.amount), balance);
    if (amt > 0) {
      balance -= amt;
      prepaymentTotal += amt;
      appliedPrepIds.add(key);
    }
  }

  // Disbursements never entered the EMI schedule — principal still outstanding
  if (disbursedPrincipal > 0 && balance <= 0 && principalFromEmi === 0 && interestPaid === 0) {
    balance = Math.max(0, disbursedPrincipal - prepaymentTotal);
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
    outstanding > 0 ? outstanding : disbursedPrincipal,
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
    isClosed: disbursedPrincipal > 0 && outstanding <= 0,
  };
}

export function computeEmiLoanStats(loan) {
  return simulateAmortization(loan);
}

export function getLoanEndDate(loan) {
  const tenure = toNum(loan.tenureMonths);
  if (!loan.startDate || tenure <= 0) return null;
  const lastEmi = emiDateForMonth(loan, tenure - 1);
  if (!lastEmi) return null;
  return parseYmd(lastEmi);
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
  if (!loan.startDate) return 0;
  const target = parseYmd(date);
  if (Number.isNaN(target.getTime())) return 0;
  const tenure = toNum(loan.tenureMonths);
  for (let i = 0; i < tenure; i++) {
    const emiDate = parseYmd(emiDateForMonth(loan, i));
    const periodStart = i === 0 ? parseYmd(loan.startDate) : parseYmd(emiDateForMonth(loan, i - 1));
    if (target >= periodStart && target <= emiDate) return i + 1;
  }
  return tenure;
}

/** Outstanding balance at a date (EMIs + prior prepayments applied; optionally exclude one prepayment id) */
export function getBalanceAtDate(loan, targetDate, excludePrepaymentIds = []) {
  const defaultRate = toNum(loan.interestRate);
  const tenure = toNum(loan.tenureMonths);
  const originalEmi = calculateEMI(getEmiPrincipal(loan), defaultRate, tenure);
  const target = new Date(targetDate);
  if (isNaN(target.getTime())) return getDisbursedPrincipal(loan);

  const excludeSet = new Set(excludePrepaymentIds.filter(Boolean));
  const allPrepayments = getPrepayments(loan)
    .filter((p) => !excludeSet.has(p.id))
    .filter((p) => toNum(p.amount) > 0 && new Date(p.date) <= target)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const allDisbursements = getDisbursements(loan)
    .filter((d) => new Date(d.date) <= target);

  if (!loan.startDate) return getDisbursedPrincipal(loan);

  const targetStr = formatYmd(target);
  const completedEmis = getPaidEmiCount(loan, target);

  let balance = 0;
  const appliedPrepIds = new Set();
  const appliedDisbIds = new Set();

  for (let month = 0; month < completedEmis; month++) {
    const period = computePeriodInterestWithDisbursements(balance, loan, month, allDisbursements, appliedDisbIds);
    balance = period.principal;
    if (balance <= 0) continue;

    const monthResult = processEmiMonth(balance, loan, month, Math.round(originalEmi), defaultRate, period.interest);
    balance = monthResult.newPrincipal;

    const prep = applyPrepaymentsInPeriod(loan, month, balance, allPrepayments, appliedPrepIds);
    balance = prep.balance;
  }

  if (completedEmis < tenure) {
    balance = accrueEmiPeriodToDate(
      balance,
      loan,
      completedEmis,
      targetStr,
      defaultRate,
      allDisbursements,
      appliedDisbIds,
      allPrepayments,
      appliedPrepIds,
    );
  }

  for (const d of allDisbursements) {
    const key = d.id || `${d.date}-${d.amount}`;
    if (!appliedDisbIds.has(key)) {
      balance += toNum(d.amount);
    }
  }

  for (const pp of allPrepayments) {
    const key = pp.id || `${pp.date}-${pp.amount}`;
    if (!appliedPrepIds.has(key)) {
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
  const remaining = getMaxDisbursementAmount(loan);
  return previewPartialDisbursement(loan, remaining, new Date().toISOString().split('T')[0]);
}

export function previewPartialDisbursement(loan, amount, date) {
  const before = simulateAmortization(loan);
  const amt = Math.min(toNum(amount), getMaxDisbursementAmount(loan));
  const entry = { id: 'preview', date, amount: amt };
  const previewLoan = applyDisbursement(loan, entry);
  const after = simulateAmortization(previewLoan);
  return {
    before,
    after,
    disbursementAmount: amt,
    newDisbursedTotal: getDisbursedPrincipal(previewLoan),
    undisbursedAfter: getUndisbursedAmount(previewLoan),
    disbursedPct: getDisbursementProgressPct(previewLoan),
  };
}

export function applyDisbursement(loan, disbursement) {
  const amt = Math.round(toNum(disbursement.amount));
  if (amt <= 0) return loan;

  const capped = Math.min(amt, getMaxDisbursementAmount(loan));
  if (capped <= 0) return loan;

  const entry = {
    ...disbursement,
    amount: capped,
    type: 'disbursement',
  };

  const base = getDisbursements(loan).filter((d) => d.id !== entry.id);
  const disbursements = [...base, entry];
  const total = disbursements.reduce((s, d) => s + toNum(d.amount), 0);
  const updated = {
    ...loan,
    disbursements,
    disbursedAmount: total,
    loanAmount: total,
  };

  const fixedEmi = Math.round(calculateEMI(getEmiPrincipal(updated), toNum(updated.interestRate), toNum(updated.tenureMonths)));
  return { ...updated, emi: fixedEmi };
}

function finalizeLoanAfterDisbursementChange(loan, disbursements) {
  const total = disbursements.reduce((sum, d) => sum + toNum(d.amount), 0);
  const updated = {
    ...loan,
    disbursements,
    disbursedAmount: total,
    loanAmount: total,
  };
  const fixedEmi = Math.round(calculateEMI(getEmiPrincipal(updated), toNum(updated.interestRate), toNum(updated.tenureMonths)));
  const stats = simulateAmortization(updated);
  return {
    ...updated,
    emi: fixedEmi,
    status: deriveLoanStatus(loan, stats),
  };
}

export function previewDisbursementEdit(loan, disbursementId, amount, date) {
  const before = simulateAmortization(loan);
  const previewLoan = updateDisbursement(loan, disbursementId, { amount, date });
  const after = simulateAmortization(previewLoan);
  const capped = Math.min(Math.round(toNum(amount)), getMaxDisbursementEditAmount(loan, disbursementId));
  return {
    before,
    after,
    disbursementAmount: capped,
    maxAllowed: getMaxDisbursementEditAmount(loan, disbursementId),
    disbursedPct: getDisbursementProgressPct(previewLoan),
    undisbursedAfter: getUndisbursedAmount(previewLoan),
  };
}

export function updateDisbursement(loan, disbursementId, updates) {
  const maxAllowed = getMaxDisbursementEditAmount(loan, disbursementId);
  const disbursements = getDisbursements(loan).map((d) => {
    if (d.id !== disbursementId) return d;
    const amt = Math.min(Math.round(toNum(updates.amount ?? d.amount)), maxAllowed);
    return {
      ...d,
      ...updates,
      amount: amt > 0 ? amt : d.amount,
      date: updates.date || d.date,
      type: 'disbursement',
    };
  });
  return finalizeLoanAfterDisbursementChange(loan, disbursements);
}

export function removeDisbursement(loan, disbursementId) {
  const disbursements = getDisbursements(loan).filter((d) => d.id !== disbursementId);
  if (disbursements.length === 0) return loan;
  return finalizeLoanAfterDisbursementChange(loan, disbursements);
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
    emiDay: new Date().getDate(),
    status: 'active',
    manualEmiPayments: [],
    emiMonthStatuses: {},
    disbursements: [],
    prepayments: [],
    creditLimit: '',
    statementBalance: '',
    minDue: '',
    dueDate: '',
    rateHistory: [],
    bankReference: null,
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
    date: emiDateForMonth(loan, monthIdx),
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

  const disbursements = (loan.disbursements || [])
    .filter((d) => toNum(d.amount) > 0 && d.date)
    .map((d) => ({ ...d, amount: Math.round(toNum(d.amount)) }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const migratedDisbursements = disbursements.length > 0
    ? disbursements
    : migrateLegacyDisbursements(loan, disbursed);

  const disbursedTotal = migratedDisbursements.reduce((s, d) => s + toNum(d.amount), 0) || disbursed;
  const normalized = {
    ...createEmptyLoan(loan.id || 'temp'),
    ...loan,
    loanType: loan.loanType || loan.type || 'personal',
    emiBasis: loan.emiBasis || 'disbursed',
    tenureMonths: tenure,
    totalSanctioned: loan.totalSanctioned ?? '',
    disbursedAmount: disbursedTotal || loan.disbursedAmount || '',
    loanAmount: disbursedTotal || loan.loanAmount || loan.disbursedAmount || '',
    prepayments: getPrepayments(loan),
    disbursements: migratedDisbursements,
    manualEmiPayments,
    emiMonthStatuses: getEmiMonthStatuses(loan),
    manualEmi: '',
    emisPaid: null,
  };
  return {
    ...normalized,
    emiDay: getEmiDay(normalized),
    rateHistory: getVerifiedRateHistory(normalized),
    bankReference: loan.bankReference && typeof loan.bankReference === 'object'
      ? {
          cycles: (loan.bankReference.cycles || [])
            .filter((c) => c && (c.interest != null || c.emi != null || c.balance != null))
            .map((c) => ({
              monthIndex: toNum(c.monthIndex),
              interest: c.interest != null ? Math.round(toNum(c.interest)) : null,
              emi: c.emi != null ? Math.round(toNum(c.emi)) : null,
              balance: c.balance != null ? Math.round(toNum(c.balance)) : null,
            })),
        }
      : null,
  };
}

function deriveLoanStatus(loan, stats) {
  const disbursed = getDisbursedPrincipal(loan);
  if (disbursed <= 0) return loan.status === 'closed' ? 'closed' : 'active';
  return stats.outstanding <= 0 ? 'closed' : 'active';
}

function migrateLegacyDisbursements(loan, disbursedAmount) {
  const amt = Math.round(toNum(disbursedAmount));
  if (amt <= 0) return [];
  const date = loan.startDate || new Date().toISOString().split('T')[0];
  return [{
    id: loan.id ? `${loan.id}-legacy-disb` : 'legacy-disb',
    date: String(date).slice(0, 10),
    amount: amt,
  }];
}

export function applyPrepayment(loan, prepayment) {
  const prepayments = [...getPrepayments(loan), { ...prepayment, type: 'prepayment' }];
  const updated = { ...loan, prepayments };
  const stats = simulateAmortization(updated);
  const fixedEmi = Math.round(calculateEMI(getEmiPrincipal(loan), toNum(loan.interestRate), toNum(loan.tenureMonths)));
  return {
    ...updated,
    emi: fixedEmi,
    status: deriveLoanStatus(updated, stats),
  };
}

function finalizeLoanAfterPrepaymentChange(loan) {
  const fixedEmi = Math.round(calculateEMI(getEmiPrincipal(loan), toNum(loan.interestRate), toNum(loan.tenureMonths)));
  const stats = simulateAmortization(loan);
  return {
    ...loan,
    emi: fixedEmi,
    status: deriveLoanStatus(loan, stats),
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

function statementSortKey(dateStr, offsetMs = 0) {
  const parts = String(dateStr).slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return new Date(dateStr).getTime() + offsetMs;
  }
  const [year, month, day] = parts;
  return new Date(year, month - 1, day).getTime() + offsetMs;
}

/**
 * Liability balance is negative: disbursement opens at −disbursed;
 * interest debits increase what you owe; EMI/prepayment credits reduce it.
 */
export function buildLoanBankStatement(loan) {
  const disbursedPrincipal = getDisbursedPrincipal(loan);
  if (disbursedPrincipal <= 0 || !loan.startDate) return [];

  const rate = toNum(loan.interestRate);
  const tenure = toNum(loan.tenureMonths);
  const scheduledEmi = Math.round(calculateEMI(getEmiPrincipal(loan), rate, tenure));
  const paidEmiMonths = Math.min(tenure, Math.max(getPaidEmiCount(loan), 0));

  const disbursements = getDisbursements(loan);
  const prepayments = getPrepayments(loan)
    .filter((p) => toNum(p.amount) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const lines = [];
  const appliedPrepIds = new Set();
  const appliedDisbIds = new Set();
  let principal = 0;
  let disbSeq = 0;
  let disbSortIndex = 0;

  const pushLine = (line) => {
    const offsetMs = line.sortOffsetMs || 0;
    lines.push({
      debit: 0,
      credit: 0,
      emiMonth: null,
      emiStatus: null,
      sortOffsetMs: 0,
      sortSubOrder: 0,
      ...line,
      sortOrder: statementSortKey(line.date, offsetMs),
    });
  };

  const pushDisbursementLine = (d, amt, balance) => {
    disbSortIndex += 1;
    disbSeq += 1;
    const key = d.id || `${d.date}-${d.amount}`;
    pushLine({
      id: `disb-${key}`,
      date: d.date,
      sortOffsetMs: disbSortIndex * 60 * 1000,
      sortSubOrder: disbSortIndex,
      txnType: 'disbursement',
      particulars: disbSeq === 1 ? 'Loan Disbursement' : 'Tranche Disbursement',
      subLabel: d.notes || (disbSeq > 1 ? `Draw #${disbSeq}` : undefined),
      debit: amt,
      balance,
    });
    appliedDisbIds.add(key);
  };

  for (let month = 0; month < paidEmiMonths; month++) {
    const principalBeforePeriod = principal;
    const disbIdsBefore = new Set(appliedDisbIds);

    const period = computePeriodInterestWithDisbursements(principalBeforePeriod, loan, month, disbursements, appliedDisbIds);
    principal = period.principal;
    if (principal <= 0) continue;

    if (loan.startDate) {
      const { periodStart, periodEnd } = emiPeriodWindow(loan, month);
      let running = principalBeforePeriod;
      for (const d of disbursements) {
        const key = d.id || `${d.date}-${d.amount}`;
        if (disbIdsBefore.has(key) || !appliedDisbIds.has(key)) continue;
        const dDate = parseYmd(d.date);
        if (Number.isNaN(dDate.getTime())) continue;
        if (dDate >= periodStart && dDate <= periodEnd) {
          const amt = toNum(d.amount);
          running += amt;
          disbSortIndex += 1;
          disbSeq += 1;
          pushLine({
            id: `disb-${key}`,
            date: d.date,
            sortOffsetMs: disbSortIndex * 60 * 1000,
            sortSubOrder: disbSortIndex,
            txnType: 'disbursement',
            particulars: disbSeq === 1 ? 'Loan Disbursement' : 'Tranche Disbursement',
            subLabel: d.notes || (disbSeq > 1 ? `Draw #${disbSeq}` : undefined),
            debit: amt,
            balance: -running,
          });
        }
      }
    }

    const emiDate = emiDateForMonth(loan, month);
    const result = processEmiMonth(principal, loan, month, scheduledEmi, rate, period.interest);
    const interestLabel = result.status === 'unpaid'
      ? 'Interest Charged — EMI Not Paid'
      : 'Interest Charged';
    const balanceAfterInterest = -(principal + result.interest);

    pushLine({
      id: `int-${month}`,
      date: emiDate,
      sortOffsetMs: EMI_POST_OFFSET_MS,
      sortSubOrder: 1,
      txnType: 'interest',
      particulars: interestLabel,
      subLabel: `EMI #${month + 1}`,
      debit: result.interest,
      balance: balanceAfterInterest,
      emiMonth: month + 1,
      emiMonthIndex: month,
      emiStatus: result.status,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      dayCount: period.dayCount,
      rateUsed: period.rateUsed,
      interestExact: period.interestExact,
      openingPrincipal: principalBeforePeriod,
    });

    if (result.status === 'paid' && result.payment > 0) {
      principal = result.newPrincipal;
      pushLine({
        id: `emi-${month}`,
        date: emiDate,
        sortOffsetMs: EMI_POST_OFFSET_MS + 5 * 60 * 1000,
        sortSubOrder: 2,
        txnType: 'emi',
        particulars: result.breakdown.hasManualEmi && result.payment > scheduledEmi
          ? 'Payment Received'
          : 'EMI Received',
        subLabel: `EMI #${month + 1}`,
        credit: result.payment,
        balance: -principal,
        emiMonth: month + 1,
        emiMonthIndex: month,
        emiStatus: 'paid',
        principal: result.breakdown.scheduledPrincipal,
        extraPrincipal: result.breakdown.extraPrincipal,
      });
    } else if (result.status === 'unpaid') {
      principal = result.newPrincipal;
    }

    if (loan.startDate) {
      const { periodStart, periodEnd } = emiPeriodWindow(loan, month);
      for (const pp of prepayments) {
        const key = pp.id || `${pp.date}-${pp.amount}`;
        if (appliedPrepIds.has(key)) continue;
        const ppDate = parseYmd(pp.date);
        if (Number.isNaN(ppDate.getTime())) continue;
        if (ppDate >= periodStart && ppDate <= periodEnd) {
          const amt = Math.min(toNum(pp.amount), principal);
          if (amt <= 0) continue;
          principal = Math.max(0, principal - amt);
          pushLine({
            id: `prepay-${pp.id || key}`,
            date: pp.date,
            sortOffsetMs: EMI_POST_OFFSET_MS + 10 * 60 * 1000,
            sortSubOrder: 3,
            txnType: 'prepayment',
            particulars: 'Prepayment Received',
            credit: amt,
            balance: -principal,
            emiMonth: month + 1,
            notes: pp.notes,
          });
          appliedPrepIds.add(key);
        }
      }
    }
  }

  for (const d of disbursements) {
    const key = d.id || `${d.date}-${d.amount}`;
    if (appliedDisbIds.has(key)) continue;
    const amt = toNum(d.amount);
    if (amt <= 0) continue;
    principal += amt;
    pushDisbursementLine(d, amt, -principal);
  }

  for (const pp of prepayments) {
    const key = pp.id || `${pp.date}-${pp.amount}`;
    if (appliedPrepIds.has(key)) continue;
    const amt = Math.min(toNum(pp.amount), principal);
    if (amt <= 0) continue;
    principal = Math.max(0, principal - amt);
    pushLine({
      id: `prepay-${pp.id || key}`,
      date: pp.date,
      sortOffsetMs: 10 * 60 * 1000,
      sortSubOrder: 3,
      txnType: 'prepayment',
      particulars: 'Prepayment Received',
      credit: amt,
      balance: -principal,
      emiMonth: getEmiMonthIndex(loan, pp.date),
      notes: pp.notes,
    });
    appliedPrepIds.add(key);
  }

  return lines.sort((a, b) => {
    const byTime = b.sortOrder - a.sortOrder;
    if (byTime !== 0) return byTime;
    return (b.sortSubOrder || 0) - (a.sortSubOrder || 0);
  });
}

/** Per-EMI interest cycle summary for bank statement reconciliation */
export function buildInterestCycleSummaries(loan) {
  const statement = buildLoanBankStatement(loan);
  const emiCredits = statement.filter((l) => l.txnType === 'emi');

  return statement
    .filter((l) => l.txnType === 'interest')
    .map((line) => {
      const emiLine = emiCredits.find((e) => e.emiMonthIndex === line.emiMonthIndex);
      return {
        monthIndex: line.emiMonthIndex,
        emiMonth: line.emiMonth,
        emiDate: line.date,
        periodStart: line.periodStart,
        periodEnd: line.periodEnd || line.date,
        dayCount: line.dayCount,
        rateUsed: line.rateUsed,
        interest: line.debit,
        interestExact: line.interestExact,
        openingPrincipal: line.openingPrincipal,
        emiCredit: emiLine?.credit ?? 0,
        principalComponent: emiLine?.principal ?? 0,
        closingBalance: emiLine?.balance ?? line.balance,
        emiStatus: line.emiStatus,
      };
    })
    .sort((a, b) => a.monthIndex - b.monthIndex);
}
