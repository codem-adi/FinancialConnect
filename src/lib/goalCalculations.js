import { toNum } from './utils';

export const WITHDRAWAL_FREQUENCIES = {
  monthly: { id: 'monthly', label: 'Monthly', periodsPerYear: 12 },
  quarterly: { id: 'quarterly', label: 'Quarterly', periodsPerYear: 4 },
  yearly: { id: 'yearly', label: 'Yearly', periodsPerYear: 1 },
};

export const DEFAULT_FREEDOM_SETTINGS = {
  withdrawalAmount: 10000,
  withdrawalFrequency: 'monthly',
  durationYears: 50,
  inflationRate: 7,
  inflationAdjusted: true,
  expectedReturn: 10,
  safeWithdrawalRate: 3.5,
};

function corpusSurvives(initialCorpus, annualSchedule, returnRate) {
  let corpus = initialCorpus;
  for (const withdrawal of annualSchedule) {
    corpus = corpus * (1 + returnRate / 100) - withdrawal;
    if (corpus < 0) return false;
  }
  return true;
}

export function buildAnnualWithdrawalSchedule({
  withdrawalAmount,
  withdrawalFrequency = 'monthly',
  durationYears = 30,
  inflationRate = 7,
  inflationAdjusted = true,
}) {
  const ppy = WITHDRAWAL_FREQUENCIES[withdrawalFrequency]?.periodsPerYear ?? 12;
  const yearOne = toNum(withdrawalAmount) * ppy;
  const years = Math.max(1, Math.round(toNum(durationYears)));
  const infl = toNum(inflationRate) / 100;

  return Array.from({ length: years }, (_, t) => (
    inflationAdjusted ? yearOne * Math.pow(1 + infl, t) : yearOne
  ));
}

export function findRequiredCorpus(annualSchedule, expectedReturn) {
  if (annualSchedule.length === 0) return 0;
  const totalNominal = annualSchedule.reduce((s, w) => s + w, 0);
  let lo = 0;
  let hi = Math.max(totalNominal, annualSchedule[0] * 20);

  while (!corpusSurvives(hi, annualSchedule, expectedReturn)) {
    hi *= 2;
    if (hi > 1e15) break;
  }

  while (hi - lo > 500) {
    const mid = Math.round((lo + hi) / 2);
    if (corpusSurvives(mid, annualSchedule, expectedReturn)) hi = mid;
    else lo = mid + 1;
  }
  return hi;
}

export function projectCorpusDepletion(initialCorpus, annualSchedule, expectedReturn) {
  const rows = [];
  let corpus = initialCorpus;
  const r = toNum(expectedReturn) / 100;

  annualSchedule.forEach((withdrawal, i) => {
    const beginning = corpus;
    const growth = beginning * r;
    corpus = beginning + growth - withdrawal;
    rows.push({
      year: i + 1,
      beginningCorpus: Math.round(beginning),
      growth: Math.round(growth),
      withdrawal: Math.round(withdrawal),
      endingCorpus: Math.round(Math.max(corpus, 0)),
      monthlyWithdrawal: Math.round(withdrawal / 12),
    });
    if (corpus <= 0) return;
  });
  return rows;
}

export function calculateFinancialFreedom(settings, currentCorpus = 0) {
  const withdrawalAmount = toNum(settings.withdrawalAmount);
  const durationYears = Math.max(1, Math.round(toNum(settings.durationYears)));
  const inflationRate = toNum(settings.inflationRate);
  const expectedReturn = toNum(settings.expectedReturn);
  const safeWithdrawalRate = toNum(settings.safeWithdrawalRate) || 3.5;
  const inflationAdjusted = settings.inflationAdjusted !== false;
  const frequency = settings.withdrawalFrequency || 'monthly';
  const ppy = WITHDRAWAL_FREQUENCIES[frequency]?.periodsPerYear ?? 12;

  const schedule = buildAnnualWithdrawalSchedule({
    withdrawalAmount,
    withdrawalFrequency: frequency,
    durationYears,
    inflationRate,
    inflationAdjusted,
  });

  const yearOneAnnual = schedule[0] || 0;
  const requiredCorpus = findRequiredCorpus(schedule, expectedReturn);
  const perpetualCorpus = safeWithdrawalRate > 0 ? yearOneAnnual / (safeWithdrawalRate / 100) : 0;
  const totalWithdrawn = schedule.reduce((s, w) => s + w, 0);
  const corpus = toNum(currentCorpus);
  const gap = Math.max(0, requiredCorpus - corpus);
  const progress = requiredCorpus > 0 ? Math.min(100, (corpus / requiredCorpus) * 100) : 0;
  const depletion = projectCorpusDepletion(corpus || requiredCorpus, schedule, expectedReturn);
  const survivesFullPeriod = corpusSurvives(corpus, schedule, expectedReturn);

  const lastYearWithdrawal = schedule[schedule.length - 1] || yearOneAnnual;
  const finalYearMonthly = lastYearWithdrawal / ppy;
  const perPeriodLabel = frequency === 'yearly' ? 'year' : frequency === 'quarterly' ? 'quarter' : 'month';

  const scheduleTable = schedule.map((annual, i) => ({
    year: i + 1,
    annualWithdrawal: Math.round(annual),
    perPeriodWithdrawal: Math.round(annual / ppy),
    perPeriodLabel,
  }));

  const periodChartData = [];
  schedule.forEach((annual, yearIdx) => {
    const perPeriod = annual / ppy;
    for (let p = 1; p <= ppy; p += 1) {
      periodChartData.push({
        id: `${yearIdx + 1}-${p}`,
        year: yearIdx + 1,
        periodInYear: p,
        label: frequency === 'yearly' ? `Y${yearIdx + 1}` : `Y${yearIdx + 1} · ${perPeriodLabel.charAt(0).toUpperCase()}${p}`,
        perPeriodWithdrawal: Math.round(perPeriod),
        annualWithdrawal: Math.round(annual),
      });
    }
  });

  return {
    withdrawalAmount,
    withdrawalFrequency: frequency,
    frequencyLabel: WITHDRAWAL_FREQUENCIES[frequency]?.label || 'Monthly',
    perPeriodLabel,
    periodsPerYear: ppy,
    durationYears,
    inflationRate,
    inflationAdjusted,
    expectedReturn,
    safeWithdrawalRate,
    yearOneAnnual,
    yearOneMonthly: yearOneAnnual / ppy,
    finalYearMonthly: finalYearMonthly,
    requiredCorpus,
    perpetualCorpus,
    totalWithdrawn,
    currentCorpus: corpus,
    gap,
    progress,
    schedule,
    depletion,
    survivesFullPeriod,
    scheduleTable,
    periodChartData,
    chartData: scheduleTable.map((row) => ({
      year: row.year,
      withdrawal: row.perPeriodWithdrawal,
      perPeriodWithdrawal: row.perPeriodWithdrawal,
      annualWithdrawal: row.annualWithdrawal,
    })),
  };
}
