import { toNum, formatIndianCurrency, formatRate } from './utils';
import {
  buildInterestCycleSummaries,
  buildLoanBankStatement,
  getVerifiedRateHistory,
  hasVerifiedRateChanges,
  BOB_INTEREST_DAYS_PER_YEAR,
} from './loanCalculations';

/** First cycle: unknown rate-change date may explain up to ~₹300 variance */
export const STATEMENT_TOLERANCE = {
  firstCycleMax: 300,
  laterCycleMax: 100,
  laterCycleTarget: 0,
};

export const UNKNOWN_RATE_CHANGE_NOTE =
  'Loan was initially sanctioned at a higher rate (e.g. 7.77%) but later floated to the current rate (e.g. 7.45%). '
  + 'The exact effective date is unknown, so the engine uses your entered rate from day one. '
  + 'A first-cycle variance up to ₹300 may be solely due to this — not a calculation error.';

export function getBankReferenceCycles(loan) {
  const cycles = loan.bankReference?.cycles;
  if (!Array.isArray(cycles)) return [];
  return cycles
    .filter((c) => c && c.interest != null && toNum(c.interest) >= 0)
    .sort((a, b) => toNum(a.monthIndex) - toNum(b.monthIndex));
}

function findEmiLine(statement, monthIndex) {
  return statement.find((l) => l.txnType === 'emi' && l.emiMonthIndex === monthIndex);
}

function findInterestLine(statement, monthIndex) {
  return statement.find((l) => l.txnType === 'interest' && l.emiMonthIndex === monthIndex);
}

/** Run diagnostic checks when variance exceeds tolerance */
export function diagnoseCycleVariance(loan, monthIndex, computed, bankRef) {
  const statement = buildLoanBankStatement(loan);
  const interestLine = findInterestLine(statement, monthIndex);
  const emiLine = findEmiLine(statement, monthIndex);
  const diff = Math.round(toNum(computed.interest) - toNum(bankRef.interest));
  const absDiff = Math.abs(diff);
  const isFirstCycle = monthIndex === 0;
  const tolerance = isFirstCycle ? STATEMENT_TOLERANCE.firstCycleMax : STATEMENT_TOLERANCE.laterCycleMax;

  const checks = [];

  checks.push({
    id: 'days',
    label: 'Interest days',
    ok: computed.dayCount > 0,
    detail: `${computed.periodStart} → ${computed.periodEnd} (${computed.dayCount} days, actual/${BOB_INTEREST_DAYS_PER_YEAR})`,
  });

  checks.push({
    id: 'rate',
    label: 'Interest rate',
    ok: true,
    detail: hasVerifiedRateChanges(loan)
      ? `Verified rate history (${getVerifiedRateHistory(loan).length} change(s))`
      : `${formatRate(computed.rateUsed ?? loan.interestRate)} p.a. from loan start — no unverified rate-change date`,
  });

  checks.push({
    id: 'ordering',
    label: 'Transaction ordering',
    ok: Boolean(interestLine && (emiLine || computed.emiStatus === 'unpaid')),
    detail: interestLine
      ? `Interest at 6:00 PM on ${computed.emiDate}, then EMI credit`
      : 'Interest line missing for this cycle',
  });

  checks.push({
    id: 'value_dates',
    label: 'Value dates',
    ok: computed.emiDate === interestLine?.date,
    detail: `EMI date ${computed.emiDate}${interestLine?.date && interestLine.date !== computed.emiDate ? ` (statement: ${interestLine.date})` : ''}`,
  });

  if (bankRef.balance != null && emiLine?.balance != null) {
    const balDiff = Math.abs(Math.round(emiLine.balance) - Math.round(-toNum(bankRef.balance)));
    checks.push({
      id: 'balance',
      label: 'Closing balance',
      ok: balDiff <= tolerance,
      detail: `Computed ${formatIndianCurrency(Math.abs(emiLine.balance), false)} vs bank ${formatIndianCurrency(Math.abs(bankRef.balance), false)} (Δ ${formatIndianCurrency(balDiff, false)})`,
    });
  } else {
    checks.push({
      id: 'balance',
      label: 'Opening / closing balance',
      ok: computed.openingPrincipal > 0,
      detail: `Opening principal ${formatIndianCurrency(computed.openingPrincipal, false)} before interest`,
    });
  }

  if (bankRef.emi != null && emiLine) {
    const emiDiff = Math.abs(Math.round(emiLine.credit) - Math.round(toNum(bankRef.emi)));
    checks.push({
      id: 'emi_allocation',
      label: 'EMI amount',
      ok: emiDiff <= 1,
      detail: `Computed ${formatIndianCurrency(emiLine.credit, false)} vs bank ${formatIndianCurrency(bankRef.emi, false)}`,
    });
    checks.push({
      id: 'principal_reduction',
      label: 'Principal reduction',
      ok: (emiLine.principal ?? 0) > 0 || computed.emiStatus === 'unpaid',
      detail: computed.emiStatus === 'unpaid'
        ? 'No EMI credited (unpaid month)'
        : `Principal ${formatIndianCurrency(emiLine.principal ?? 0, false)} from EMI after interest`,
    });
  }

  checks.push({
    id: 'rounding',
    label: 'Rounding',
    ok: true,
    detail: computed.interestExact != null
      ? `Daily accrual total ${computed.interestExact.toFixed(2)} → rounded ${formatIndianCurrency(computed.interest, false)}`
      : `Rounded to nearest rupee at cycle end`,
  });

  const failedChecks = checks.filter((c) => !c.ok);

  let attribution = null;
  if (isFirstCycle && absDiff > 0 && absDiff <= STATEMENT_TOLERANCE.firstCycleMax && !hasVerifiedRateChanges(loan)) {
    attribution = 'unknown_rate_change';
  } else if (absDiff > tolerance) {
    attribution = 'calculation_review';
  }

  return {
    monthIndex,
    emiMonth: computed.emiMonth,
    emiDate: computed.emiDate,
    computedInterest: computed.interest,
    bankInterest: Math.round(toNum(bankRef.interest)),
    difference: diff,
    absDifference: absDiff,
    tolerance,
    withinTolerance: absDiff <= tolerance,
    isFirstCycle,
    checks,
    failedChecks,
    attribution,
    attributionNote: attribution === 'unknown_rate_change' ? UNKNOWN_RATE_CHANGE_NOTE : null,
  };
}

/** Compare computed interest cycles against bank reference entries */
export function validateLoanStatementAgainstBank(loan) {
  const computedCycles = buildInterestCycleSummaries(loan);
  const bankCycles = getBankReferenceCycles(loan);

  if (bankCycles.length === 0) {
    return {
      hasReference: false,
      computedCycles,
      results: [],
      summary: null,
      allWithinTolerance: null,
      methodology: {
        type: 'daily_reducing_balance',
        daysPerYear: BOB_INTEREST_DAYS_PER_YEAR,
        ratePolicy: hasVerifiedRateChanges(loan)
          ? 'verified_rate_history'
          : 'single_rate_from_loan_start',
        rateNote: hasVerifiedRateChanges(loan)
          ? null
          : UNKNOWN_RATE_CHANGE_NOTE,
      },
    };
  }

  const results = bankCycles.map((bankRef) => {
    const monthIndex = toNum(bankRef.monthIndex);
    const computed = computedCycles.find((c) => c.monthIndex === monthIndex);
    if (!computed) {
      return {
        monthIndex,
        emiMonth: monthIndex + 1,
        computedInterest: null,
        bankInterest: Math.round(toNum(bankRef.interest)),
        difference: null,
        absDifference: null,
        withinTolerance: false,
        missing: true,
        checks: [{ id: 'missing', label: 'Cycle', ok: false, detail: 'No computed interest for this EMI month yet' }],
        failedChecks: [],
        attribution: 'missing_cycle',
      };
    }
    return diagnoseCycleVariance(loan, monthIndex, computed, bankRef);
  });

  const compared = results.filter((r) => !r.missing);
  const allWithinTolerance = compared.length > 0 && compared.every((r) => r.withinTolerance);
  const exceedsLater = compared.some((r) => !r.isFirstCycle && r.absDifference > STATEMENT_TOLERANCE.laterCycleMax);

  return {
    hasReference: true,
    computedCycles,
    results,
    allWithinTolerance,
    needsReview: exceedsLater,
    summary: {
      compared: compared.length,
      matched: compared.filter((r) => r.withinTolerance).length,
      maxDifference: compared.reduce((max, r) => Math.max(max, r.absDifference || 0), 0),
      firstCycleAttributed: compared.some((r) => r.attribution === 'unknown_rate_change'),
    },
    methodology: {
      type: 'daily_reducing_balance',
      daysPerYear: BOB_INTEREST_DAYS_PER_YEAR,
      ratePolicy: hasVerifiedRateChanges(loan)
        ? 'verified_rate_history'
        : 'single_rate_from_loan_start',
      rateNote: hasVerifiedRateChanges(loan)
        ? null
        : UNKNOWN_RATE_CHANGE_NOTE,
    },
  };
}
