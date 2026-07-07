const UI_STORAGE_KEY = 'retirewise-ui';

export const DEFAULT_UI_STATE = {
  activeTab: 'overview',
  goals: {
    subView: 'freedom',
    savedGoalsPage: 1,
    expandedScheduleGoalId: null,
    scheduleViewMode: 'year',
    goalName: '',
  },
  expenses: {
    selectedMonth: null,
    editingCategories: false,
  },
  family: {
    selectedMonth: null,
    editMemberId: null,
    showAddMember: false,
    editOtherIncome: false,
    membersPage: 1,
  },
  assets: {
    collapsedTypes: {},
    expandedHistoryId: null,
  },
  loans: {
    expandedIds: [],
    detailTab: 'details',
    defaultClosingLoanId: null,
  },
  retirewise: {
    draftPlanById: {},
  },
};

function mergeSection(defaults, saved) {
  if (!saved || typeof saved !== 'object') return { ...defaults };
  return { ...defaults, ...saved };
}

export function loadUiState() {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_STATE };
    const parsed = JSON.parse(raw);
    return {
      activeTab: parsed.activeTab || DEFAULT_UI_STATE.activeTab,
      goals: mergeSection(DEFAULT_UI_STATE.goals, parsed.goals),
      expenses: mergeSection(DEFAULT_UI_STATE.expenses, parsed.expenses),
      family: mergeSection(DEFAULT_UI_STATE.family, parsed.family),
      assets: mergeSection(DEFAULT_UI_STATE.assets, parsed.assets),
      loans: mergeSection(DEFAULT_UI_STATE.loans, parsed.loans),
      retirewise: mergeSection(DEFAULT_UI_STATE.retirewise, parsed.retirewise),
    };
  } catch {
    return { ...DEFAULT_UI_STATE };
  }
}

export function saveUiState(state) {
  try {
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota */ }
}

export function patchUiState(prev, section, patch) {
  if (!section) {
    return { ...prev, ...patch };
  }
  return {
    ...prev,
    [section]: { ...prev[section], ...patch },
  };
}
