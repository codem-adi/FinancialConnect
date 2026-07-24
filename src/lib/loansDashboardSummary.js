import { getDailyInterest, getLoanMonthlyOutflow } from './loanCalculations';
import { toNum } from './utils';

export function getLoanPrincipalTaken(stats) {
  if (stats.loanCategory === 'revolving') {
    return toNum(stats.creditLimit) || toNum(stats.statementBalance);
  }
  return toNum(stats.disbursedPrincipal) || toNum(stats.loanAmount) || 0;
}

/** Portfolio interest avoided — from stats already computed in simulateAmortization */
export function sumPortfolioInterestSaved(allStats) {
  return allStats.reduce((sum, { stats }) => {
    if (stats.loanCategory === 'revolving') return sum;
    return sum + (stats.totalInterestSaved || 0);
  }, 0);
}

/**
 * Sanity checks for dashboard totals. Returns human-readable issue strings.
 * Principal paid + interest paid should equal total cash paid (EMI + prepayments).
 */
export function validateLoansDashboardSummary(summary, allStats) {
  const issues = [];
  const interestSavedCheck = sumPortfolioInterestSaved(allStats);
  if (Math.abs(summary.totalInterestSaved - interestSavedCheck) > 1) {
    issues.push(`Interest saved: displayed ${summary.totalInterestSaved}, expected ${interestSavedCheck}`);
  }

  const principalPlusInterest = summary.totalPrincipalPaid + summary.totalInterestPaid;
  const cashDelta = Math.abs(summary.totalCashPaid - principalPlusInterest);
  if (cashDelta > Math.max(1, allStats.length)) {
    issues.push(`Total cash paid (${summary.totalCashPaid}) != principal paid + interest paid (${principalPlusInterest})`);
  }

  for (const { loan, stats } of allStats) {
    if (stats.loanCategory === 'revolving') continue;
    const disbursed = toNum(stats.disbursedPrincipal);
    if (disbursed <= 0) continue;
    const gap = Math.abs((stats.principalPaid || 0) + stats.outstanding - disbursed);
    if (gap > 1) {
      issues.push(`${loan.name || loan.id}: principal paid + outstanding != disbursed (off by ${gap})`);
    }
  }

  return issues;
}

export { getDailyInterest, getLoanMonthlyOutflow };
