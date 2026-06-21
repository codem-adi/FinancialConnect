import { DEFAULT_EXPENSE_CATEGORIES } from './financeStats';

export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const FRESH_RETIREMENT_PLAN = {
  name: 'My Plan',
  currentAge: 30,
  retirementAge: 60,
  lifeExpectancy: 90,
  monthlyExpenseToday: 0,
  inflationRate: 6,
  currentCorpus: 0,
  expectedReturn: 10,
  conservativeReturn: 7,
  moderateReturn: 9,
  aggressiveReturn: 12,
  assetAllocation: { equity: 70, debt: 20, gold: 5, cash: 5 },
  volatility: 15,
  monthlySIP: 0,
  annualSIPIncrease: 10,
};

const FRESH_FREEDOM_SETTINGS = {
  withdrawalAmount: 0,
  withdrawalFrequency: 'monthly',
  durationYears: 30,
  inflationRate: 6,
  inflationAdjusted: true,
  expectedReturn: 10,
  safeWithdrawalRate: 3.5,
};

export function createDefaultPlan() {
  const now = new Date().toISOString();
  return { id: generateId(), ...FRESH_RETIREMENT_PLAN, createdAt: now, updatedAt: now };
}

export function createFreshAppData(userName) {
  const plan = createDefaultPlan();
  const displayName = (userName || 'You').trim() || 'You';

  return {
    personalFinance: {
      familyMembers: [{
        id: generateId(),
        name: displayName,
        relationship: 'Self',
        monthlyIncome: 0,
        monthlyExpense: 0,
      }],
      assets: [],
      loans: [],
      financialGoals: [],
      smallGoals: [],
      monthlyFixedExpenses: 0,
      monthlyVariableExpenses: 0,
      otherIncome: 0,
      expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
      monthlyRecords: [],
      memberCards: [],
      freedomSettings: { ...FRESH_FREEDOM_SETTINGS },
      updatedAt: new Date().toISOString(),
    },
    retirementPlans: [plan],
    activePlanId: plan.id,
    theme: 'dark',
  };
}

export function createDefaultAppData(userName) {
  return createFreshAppData(userName);
}

export function isFreshHousehold(pf) {
  if (!pf) return false;
  const noAssets = !(pf.assets?.length);
  const noLoans = !(pf.loans?.length);
  const noRecords = !(pf.monthlyRecords?.length);
  const noGoals = !(pf.financialGoals?.length) && !(pf.smallGoals?.length);
  return noAssets && noLoans && noRecords && noGoals;
}
