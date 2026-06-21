import { getOutstandingBalance } from './loanCalculations';

export function toNum(value) {
  if (value === '' || value == null || value === undefined) return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

export function formatIndianCurrency(amount, compact = true) {
  const num = toNum(amount);
  if (!isFinite(num)) return '₹0';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (compact) {
    if (abs >= 1e7) {
      const crore = abs / 1e7;
      return `${sign}₹${crore.toFixed(crore >= 10 ? 0 : 2)} Crore`;
    }
    if (abs >= 1e5) {
      const lakh = abs / 1e5;
      return `${sign}₹${lakh.toFixed(lakh >= 10 ? 1 : 2)} Lakh`;
    }
    if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
  }
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatIndianNumber(num) {
  return toNum(num).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function formatPercent(value, decimals = null) {
  const num = toNum(value);
  if (decimals != null) return `${num.toFixed(decimals)}%`;
  if (Number.isInteger(num)) return `${num}%`;
  return `${parseFloat(num.toFixed(4))}%`;
}

/** Loan interest rate — preserves decimals e.g. 7.45% not 7.5% */
export function formatRate(value) {
  return formatPercent(value);
}

export function formatMonthlyRate(annualRate) {
  const monthly = toNum(annualRate) / 12;
  if (Number.isInteger(monthly)) return `${monthly}%/mo`;
  return `${parseFloat(monthly.toFixed(4))}%/mo`;
}

/** EMI rounded to nearest rupee (bank standard) */
export function formatEmi(emi) {
  return formatIndianCurrency(Math.round(toNum(emi)), false);
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function wordsBelow1000(n) {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = n % 10 ? ` ${ONES[n % 10]}` : '';
    return `${t}${o}`.trim();
  }
  const h = ONES[Math.floor(n / 100)];
  const rest = n % 100;
  return `${h} Hundred${rest ? ` ${wordsBelow1000(rest)}` : ''}`.trim();
}

/** Convert amount to Indian English words e.g. "Forty Five Lakh Rupees" */
export function amountToIndianWords(amount) {
  const n = Math.floor(Math.abs(toNum(amount)));
  if (n === 0) return '';

  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  if (crore) parts.push(`${wordsBelow1000(crore)} Crore`);
  if (lakh) parts.push(`${wordsBelow1000(lakh)} Lakh`);
  if (thousand) parts.push(`${wordsBelow1000(thousand)} Thousand`);
  if (rest) parts.push(wordsBelow1000(rest));

  return `${parts.join(' ')} Rupees Only`;
}

export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getProgressPercent(current, target) {
  const t = toNum(target);
  if (t <= 0) return 0;
  return clamp((toNum(current) / t) * 100, 0, 100);
}

export function getReadinessColor(score) {
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}

export function getLoanRemaining(loan) {
  return getOutstandingBalance(loan);
}

export function getLoanUndisbursed(loan) {
  return Math.max(0, toNum(loan.totalSanctioned) - toNum(loan.disbursedAmount));
}

export function calculateEMI(principal, rate, tenureMonths) {
  const p = toNum(principal);
  const t = toNum(tenureMonths);
  const r = toNum(rate);
  if (p <= 0 || t <= 0) return 0;
  const monthlyRate = r / 100 / 12;
  if (monthlyRate === 0) return p / t;
  return (p * monthlyRate * Math.pow(1 + monthlyRate, t)) /
    (Math.pow(1 + monthlyRate, t) - 1);
}

/** Coerce form values to numbers for saving */
export function sanitizeNumbers(obj, fields) {
  const out = { ...obj };
  for (const f of fields) {
    if (out[f] === '' || out[f] == null) out[f] = 0;
    else out[f] = toNum(out[f]);
  }
  return out;
}
