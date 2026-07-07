import { getReadinessColor } from './utils';

function futureExpense(expense, inflation, years) {
  return expense * Math.pow(1 + inflation / 100, years);
}

function realReturn(nominalReturn, inflation) {
  return ((1 + nominalReturn / 100) / (1 + inflation / 100) - 1) * 100;
}

function corpusFromSWR(annualExpense, swr) {
  return annualExpense / (swr / 100);
}

export function projectCorpus(startCorpus, startAge, endAge, annualExpenseStart, inflation, returnRate, getYearReturn) {
  const projections = [];
  let corpus = startCorpus;
  const years = endAge - startAge;

  for (let i = 0; i <= years; i++) {
    const age = startAge + i;
    const annualExpense = futureExpense(annualExpenseStart, inflation, i);
    const beginningCorpus = corpus;

    if (i === 0) {
      projections.push({ year: i, age, beginningCorpus, investmentGrowth: 0, withdrawal: 0, endingCorpus: corpus, annualExpense });
      continue;
    }

    const yearReturn = getYearReturn ? getYearReturn(i, returnRate) : returnRate;
    const growth = beginningCorpus * (yearReturn / 100);
    const withdrawal = annualExpense;
    corpus = beginningCorpus + growth - withdrawal;

    projections.push({
      year: i, age, beginningCorpus, investmentGrowth: growth, withdrawal,
      endingCorpus: Math.max(corpus, 0), annualExpense,
    });
    if (corpus <= 0) break;
  }
  return projections;
}

function findSurvivalYear(projections) {
  const depleted = projections.find((p) => p.endingCorpus <= 0 && p.year > 0);
  return depleted ? depleted.year : null;
}

export function runScenario(name, plan, getYearReturn) {
  const annualExpense = plan.monthlyExpenseToday * 12;
  const projections = projectCorpus(
    plan.currentCorpus, plan.retirementAge, plan.lifeExpectancy,
    annualExpense, plan.inflationRate, plan.expectedReturn, getYearReturn
  );
  const depletionYear = findSurvivalYear(projections);
  const lastProjection = projections[projections.length - 1];
  return {
    name, projections,
    survivalYear: depletionYear ? plan.retirementAge + depletionYear : null,
    depletionYear,
    remainingCorpus: lastProjection?.endingCorpus ?? 0,
  };
}

export function runAllScenarios(plan) {
  return [
    runScenario('Normal Market', plan, (_, r) => r),
    runScenario('Weak Market', plan, (_, r) => r - 3),
    runScenario('Bad Market', plan, (_, r) => r - 5),
    runScenario('Lost Decade', plan, (year, r) => (year <= 10 ? 3 : r)),
    runScenario('Crash Scenario', plan, (year, r) => {
      if (year === 1) return -30;
      if (year === 2) return -15;
      if (year === 3) return 5;
      return r;
    }),
  ];
}

function boxMullerRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function runMonteCarloSimulation(plan, simulations = 1000) {
  const annualExpense = plan.monthlyExpenseToday * 12;
  const years = plan.lifeExpectancy - plan.retirementAge;
  const meanReturn = plan.expectedReturn / 100;
  const volatility = plan.volatility / 100;
  const inflation = plan.inflationRate / 100;
  const endingCorpora = [];
  let survived = 0;

  for (let sim = 0; sim < simulations; sim++) {
    let corpus = plan.currentCorpus;
    let survivedSim = true;
    for (let year = 1; year <= years; year++) {
      const randomReturn = meanReturn + volatility * boxMullerRandom();
      const expense = annualExpense * Math.pow(1 + inflation, year);
      corpus = corpus * (1 + randomReturn) - expense;
      if (corpus <= 0) { survivedSim = false; corpus = 0; break; }
    }
    if (survivedSim) survived++;
    endingCorpora.push(corpus);
  }

  endingCorpora.sort((a, b) => a - b);
  const p10Index = Math.floor(simulations * 0.1);
  const p50Index = Math.floor(simulations * 0.5);
  const p90Index = Math.floor(simulations * 0.9);
  const maxCorpus = Math.max(...endingCorpora, 1);
  const bucketCount = 20;
  const bucketSize = maxCorpus / bucketCount;
  const distribution = Array.from({ length: bucketCount }, (_, i) => ({
    bucket: `${Math.round((i * bucketSize) / 1e5)}L`, count: 0,
  }));
  for (const c of endingCorpora) {
    const idx = Math.min(Math.floor(c / bucketSize), bucketCount - 1);
    distribution[idx].count++;
  }

  return {
    survivalProbability: (survived / simulations) * 100,
    medianEndingCorpus: endingCorpora[p50Index] ?? 0,
    worst10Percent: endingCorpora[p10Index] ?? 0,
    best10Percent: endingCorpora[p90Index] ?? 0,
    distribution,
  };
}

function calculateFireAchievement(plan, fireTarget) {
  let corpus = plan.currentCorpus;
  let monthlySIP = plan.monthlySIP;
  const annualIncrease = plan.annualSIPIncrease / 100;
  const annualReturn = plan.expectedReturn / 100;

  for (let year = 1; year <= 100; year++) {
    corpus = corpus * (1 + annualReturn) + monthlySIP * 12;
    if (corpus >= fireTarget) {
      const fireDate = new Date();
      fireDate.setFullYear(fireDate.getFullYear() + year);
      return { yearsToFire: year, projectedCorpus: corpus, projectedDate: fireDate.toISOString().split('T')[0] };
    }
    monthlySIP *= 1 + annualIncrease;
  }
  return { yearsToFire: null, projectedCorpus: corpus, projectedDate: null };
}

function runRiskScenario(plan, modifier) {
  const annualExpense = plan.monthlyExpenseToday * 12 * (modifier.withdrawalMultiplier ?? 1);
  const inflation = modifier.inflationOverride ?? plan.inflationRate;
  const returnRate = plan.expectedReturn + (modifier.returnDelta ?? 0);
  const projections = projectCorpus(
    plan.currentCorpus, plan.retirementAge, plan.lifeExpectancy,
    annualExpense, inflation, returnRate
  );
  const depletion = findSurvivalYear(projections);
  if (!depletion) return plan.lifeExpectancy;
  return plan.retirementAge + depletion;
}

export function calculateRetireWise(plan) {
  const retirementHorizon = plan.lifeExpectancy - plan.retirementAge;
  const annualExpenseToday = plan.monthlyExpenseToday * 12;
  const yearsToRetirement = plan.retirementAge - plan.currentAge;
  const futureAnnualExpense = futureExpense(annualExpenseToday, plan.inflationRate, yearsToRetirement);
  const realRet = realReturn(plan.expectedReturn, plan.inflationRate);

  const requiredCorpus = {
    conservative: corpusFromSWR(futureAnnualExpense, 2.5),
    recommended: corpusFromSWR(futureAnnualExpense, 3.5),
    luxury: corpusFromSWR(futureAnnualExpense, 4.0),
  };

  const safeWithdrawal = {
    swr25: plan.currentCorpus * 0.025 / 12,
    swr30: plan.currentCorpus * 0.03 / 12,
    swr35: plan.currentCorpus * 0.035 / 12,
    swr40: plan.currentCorpus * 0.04 / 12,
  };

  const corpusRatio = requiredCorpus.recommended > 0
    ? plan.currentCorpus / requiredCorpus.recommended
    : 0;
  const readinessScore = Number.isFinite(corpusRatio)
    ? Math.min(100, Math.max(0, Math.round(corpusRatio * 100)))
    : 0;
  const monteCarlo = runMonteCarloSimulation(plan, 1000);

  const fireTargets = {
    leanFire: annualExpenseToday * 25,
    regularFire: annualExpenseToday * 33,
    fatFire: annualExpenseToday * 40,
    leanFire25x: annualExpenseToday * 25,
    regularFire33x: annualExpenseToday * 33,
    fatFire40x: annualExpenseToday * 40,
    luxuryFire50x: annualExpenseToday * 50,
  };

  const baseProjections = projectCorpus(
    plan.currentCorpus, plan.retirementAge, Math.min(plan.lifeExpectancy, plan.retirementAge + 50),
    annualExpenseToday, plan.inflationRate, plan.expectedReturn
  );

  const scenarios = runAllScenarios(plan);
  const fireAchievement = calculateFireAchievement(plan, fireTargets.regularFire);
  const lowerReturnYear = runRiskScenario(plan, { returnDelta: -2 });
  const higherInflationYear = runRiskScenario(plan, { inflationOverride: 9 });
  const higherWithdrawalYear = runRiskScenario(plan, { withdrawalMultiplier: 1.2 });

  return {
    retirementHorizon, annualExpenseToday, futureAnnualExpense, realReturn: realRet,
    requiredCorpus, safeWithdrawal, readinessScore,
    readinessColor: getReadinessColor(readinessScore),
    corpusSurvivalProbability: {
      p50: monteCarlo.survivalProbability * 0.7,
      p75: monteCarlo.survivalProbability * 0.85,
      p90: monteCarlo.survivalProbability * 0.95,
      p95: monteCarlo.survivalProbability,
    },
    fireTargets, baseProjections, scenarios, monteCarlo, fireAchievement,
    riskAnalysis: {
      lowerReturns: `If market returns are 2% lower than expected, corpus survives until age ${lowerReturnYear ?? plan.lifeExpectancy}.`,
      higherInflation: `If inflation increases to 9%, corpus survives until age ${higherInflationYear ?? plan.lifeExpectancy}.`,
      higherWithdrawal: `If withdrawal increases by 20%, corpus survives until age ${higherWithdrawalYear ?? plan.lifeExpectancy}.`,
    },
  };
}

export function projectAccumulation(plan, maxYears = 50) {
  const results = [];
  let corpus = plan.currentCorpus;
  let monthlySIP = plan.monthlySIP;
  const annualReturn = plan.expectedReturn / 100;
  const annualIncrease = plan.annualSIPIncrease / 100;
  results.push({ year: 0, age: plan.currentAge, corpus, sip: monthlySIP });
  for (let year = 1; year <= maxYears; year++) {
    corpus = corpus * (1 + annualReturn) + monthlySIP * 12;
    results.push({ year, age: plan.currentAge + year, corpus, sip: monthlySIP });
    monthlySIP *= 1 + annualIncrease;
  }
  return results;
}
