import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { fetchAppData, saveAppData, savePersonalFinance, savePlan, deletePlan, duplicatePlan, activatePlan, setTheme as setThemeApi, saveToLocalStorage } from '../lib/api';
import { createDefaultAppData, createDefaultPlan } from '../lib/defaults';
import { normalizePersonalFinance } from '../lib/financeStats';
import { generateId } from '../lib/utils';
import { loadUiState, saveUiState, patchUiState } from '../lib/uiPersistence';
import { useAuth } from './AuthContext';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const { canEdit: authCanEdit, isOwner, session } = useAuth();
  const householdId = session?.household?.id;
  const [data, setData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [uiState, setUiState] = useState(() => loadUiState());

  const activeTab = uiState.activeTab;
  const canEdit = data?.canEdit ?? authCanEdit;

  const patchUi = useCallback((section, patch) => {
    setUiState((prev) => {
      const next = patchUiState(prev, section, patch);
      saveUiState(next);
      return next;
    });
  }, []);

  const setActiveTab = useCallback((tab) => {
    patchUi(null, { activeTab: tab });
  }, [patchUi]);

  useEffect(() => {
    if (!session?.token) {
      setDataLoading(false);
      setData(null);
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    fetchAppData().then(async (d) => {
      if (cancelled) return;
      const loaded = d || createDefaultAppData(session?.user?.name);
      const pf = normalizePersonalFinance(loaded.personalFinance);
      const edit = loaded.canEdit ?? authCanEdit;
      if (!edit && d) {
        setData({ ...loaded, personalFinance: pf });
        setDataLoading(false);
        return;
      }
      if (!loaded.personalFinance?.prepaymentExpenseMigrated && pf.prepaymentExpenseMigrated && edit) {
        await savePersonalFinance(pf, { section: 'system', action: 'migrate', summary: 'Migrated prepayment expense' });
      }
      if (cancelled) return;
      setData({ ...loaded, personalFinance: pf });
      setDataLoading(false);
    });
    return () => { cancelled = true; };
  }, [householdId, session?.token]);

  useEffect(() => {
    if (!data) return;
    document.documentElement.classList.toggle('dark', data.theme === 'dark');
  }, [data?.theme]);

  const updateData = useCallback(async (newData, audit) => {
    if (!isOwner) throw new Error('Only the dashboard owner can replace full household data');
    setData(newData);
    saveToLocalStorage(newData);
    await saveAppData(newData, audit);
  }, [isOwner]);

  const updateFinance = useCallback(async (finance, audit) => {
    if (!canEdit) throw new Error('View-only access — you cannot edit financial data');
    const normalized = normalizePersonalFinance(finance);
    const newData = { ...data, personalFinance: normalized };
    setData(newData);
    saveToLocalStorage(newData);
    await savePersonalFinance(normalized, audit);
  }, [data, canEdit]);

  const activePlan = useMemo(() => {
    if (!data) return null;
    return data.retirementPlans.find((p) => p.id === data.activePlanId) || data.retirementPlans[0];
  }, [data]);

  const updatePlan = useCallback(async (plan, audit) => {
    if (!canEdit) throw new Error('View-only access — you cannot edit financial data');
    const plans = data.retirementPlans.map((p) => (p.id === plan.id ? { ...plan, updatedAt: new Date().toISOString() } : p));
    const exists = plans.some((p) => p.id === plan.id);
    const newPlans = exists ? plans : [...plans, plan];
    const newData = { ...data, retirementPlans: newPlans, activePlanId: plan.id };
    setData(newData);
    saveToLocalStorage(newData);
    await savePlan({ ...plan, updatedAt: new Date().toISOString() }, audit || {
      section: 'retirewise',
      action: 'update',
      entityId: plan.id,
      summary: `Updated plan: ${plan.name}`,
    });
  }, [data, canEdit]);

  const addPlan = useCallback(async () => {
    if (!canEdit) return;
    const plan = createDefaultPlan();
    plan.name = `Plan ${data.retirementPlans.length + 1}`;
    const newData = { ...data, retirementPlans: [...data.retirementPlans, plan], activePlanId: plan.id };
    setData(newData);
    await savePlan(plan, { section: 'retirewise', action: 'create', entityId: plan.id, summary: `Created plan: ${plan.name}` });
  }, [data, canEdit]);

  const removePlan = useCallback(async (id) => {
    if (!canEdit) return;
    await deletePlan(id);
    const plans = data.retirementPlans.filter((p) => p.id !== id);
    const newData = { ...data, retirementPlans: plans, activePlanId: plans[0]?.id || null };
    setData(newData);
    saveToLocalStorage(newData);
  }, [data, canEdit]);

  const dupPlan = useCallback(async (id) => {
    if (!canEdit) return null;
    const dup = await duplicatePlan(id);
    const newData = { ...data, retirementPlans: [...data.retirementPlans, dup] };
    setData(newData);
    saveToLocalStorage(newData);
    return dup;
  }, [data, canEdit]);

  const setActivePlanId = useCallback(async (id) => {
    if (!data || !id) return;
    const newData = { ...data, activePlanId: id };
    setData(newData);
    saveToLocalStorage(newData);
    await activatePlan(id);
  }, [data]);

  const toggleTheme = useCallback(async () => {
    const theme = data.theme === 'dark' ? 'light' : 'dark';
    const newData = { ...data, theme };
    setData(newData);
    if (canEdit) await setThemeApi(theme);
  }, [data, canEdit]);

  const importData = useCallback(async (imported) => {
    if (!isOwner) throw new Error('Only the dashboard owner can import data');
    setData(imported);
    await saveAppData(imported, { section: 'general', action: 'import', summary: 'Imported JSON data' });
  }, [isOwner]);

  const value = useMemo(() => ({
    data, setData, updateData, updateFinance, activePlan, updatePlan,
    addPlan, removePlan, dupPlan, setActivePlanId, toggleTheme, importData,
    activeTab, setActiveTab, uiState, patchUi, generateId, canEdit,
  }), [
    data, updateData, updateFinance, activePlan, updatePlan,
    addPlan, removePlan, dupPlan, setActivePlanId, toggleTheme, importData,
    activeTab, setActiveTab, uiState, patchUi, canEdit,
  ]);

  const showDataLoading = Boolean(session?.token && dataLoading);

  return (
    <AppContext.Provider value={value}>
      {showDataLoading ? (
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400">Loading RetireWise...</p>
          </div>
        </div>
      ) : children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
