import { useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Plus, Trash2, Target, Star, Flame, Calculator, TrendingUp, PiggyBank, AlertCircle,
  Eye, Pencil, Save, Table2, BarChart3,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatIndianCurrency, getProgressPercent } from '../../lib/utils';
import {
  calculateFinancialFreedom, DEFAULT_FREEDOM_SETTINGS, WITHDRAWAL_FREQUENCIES,
} from '../../lib/goalCalculations';
import { getGoalsCorpus } from '../../lib/assetCalculations';
import { useDeferredCalculation } from '../../hooks/useDeferredCalculation';
import { useUiSection } from '../../hooks/useUiSection';
import { CalculatingOverlay } from '../ui/CalculatingOverlay';
import { Card, Btn, InputField, ProgressBar, StatCard, PageHeader } from '../ui';

const FREEDOM_CALC_STEPS = [
  'Building withdrawal schedule…',
  'Adjusting for inflation…',
  'Finding minimum corpus…',
  'Projecting corpus over time…',
];

const SAVED_GOALS_PAGE_SIZE = 8;

function SavedGoalPicker({ goals, selectedGoalId, onSelect, onClear }) {
  if (goals.length === 0) {
    return <p className="text-sm text-slate-500">No saved goals yet — configure below and save.</p>;
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Load saved scenario</label>
      <select
        value={selectedGoalId || ''}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) onClear();
          else {
            const goal = goals.find((g) => g.id === id);
            if (goal) onSelect(goal);
          }
        }}
        className="w-full text-sm"
      >
        <option value="">— New scenario —</option>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.title} · {formatIndianCurrency(g.targetAmount)}
          </option>
        ))}
      </select>
      <p className="text-[10px] text-slate-400">{goals.length} saved scenario{goals.length !== 1 ? 's' : ''}</p>
    </div>
  );
}

function SavedGoalsTable({
  goals, currentCorpus, page, onPageChange, onLoad, onDelete, expandedScheduleGoalId, onToggleSchedule,
  scheduleViewMode, onScheduleViewModeChange, canEdit,
}) {
  const totalPages = Math.max(1, Math.ceil(goals.length / SAVED_GOALS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = goals.slice((safePage - 1) * SAVED_GOALS_PAGE_SIZE, safePage * SAVED_GOALS_PAGE_SIZE);
  const expandedGoal = expandedScheduleGoalId ? goals.find((g) => g.id === expandedScheduleGoalId) : null;
  const expandedCalc = expandedGoal
    ? calculateFinancialFreedom(expandedGoal.freedomMeta || DEFAULT_FREEDOM_SETTINGS, currentCorpus)
    : null;

  return (
    <Card title="Saved freedom goals" subtitle={`${goals.length} scenario${goals.length !== 1 ? 's' : ''}`}>
      <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left py-3 px-3 font-semibold min-w-[140px]">Scenario</th>
              <th className="text-right py-3 px-3 font-semibold">Target</th>
              <th className="text-right py-3 px-3 font-semibold">Progress</th>
              <th className="text-left py-3 px-3 font-semibold hidden md:table-cell">Income plan</th>
              {canEdit ? (
                <th className="text-right py-3 px-3 font-semibold w-[120px]">Actions</th>
              ) : (
                <th className="text-right py-3 px-3 font-semibold w-[80px]">Schedule</th>
              )}
            </tr>
          </thead>
          <tbody>
            {slice.map((g) => {
              const progress = getProgressPercent(currentCorpus, g.targetAmount);
              const meta = g.freedomMeta;
              const incomeLabel = meta
                ? `${formatIndianCurrency(meta.withdrawalAmount, false)}/${WITHDRAWAL_FREQUENCIES[meta.withdrawalFrequency]?.label?.toLowerCase() || 'mo'} · ${meta.durationYears}yr`
                : '—';
              return (
                <tr
                  key={g.id}
                  className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${expandedScheduleGoalId === g.id ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}
                >
                  <td className="py-2.5 px-3 font-medium max-w-[200px] truncate" title={g.title}>{g.title}</td>
                  <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap">{formatIndianCurrency(g.targetAmount)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="font-semibold text-indigo-600">{progress.toFixed(1)}%</span>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-500 hidden md:table-cell">{incomeLabel}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Btn size="sm" variant="ghost" onClick={() => onLoad(g)} title="Edit in calculator"><Pencil className="w-3.5 h-3.5" /></Btn>
                      )}
                      <Btn
                        size="sm"
                        variant={expandedScheduleGoalId === g.id ? 'primary' : 'ghost'}
                        onClick={() => onToggleSchedule(g.id)}
                        title="View schedule"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Btn>
                      {canEdit && (
                        <Btn size="sm" variant="ghost" className="!text-red-500" onClick={() => onDelete(g.id)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Btn>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs text-slate-500">
            Showing {(safePage - 1) * SAVED_GOALS_PAGE_SIZE + 1}–{Math.min(safePage * SAVED_GOALS_PAGE_SIZE, goals.length)} of {goals.length}
          </p>
          <div className="flex items-center gap-1">
            <Btn size="sm" variant="ghost" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>Prev</Btn>
            <span className="text-xs px-2 text-slate-600 dark:text-slate-400">Page {safePage} / {totalPages}</span>
            <Btn size="sm" variant="ghost" disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)}>Next</Btn>
          </div>
        </div>
      )}

      {expandedGoal && expandedCalc && (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <p className="text-sm font-semibold mb-3">Schedule — {expandedGoal.title}</p>
          <WithdrawalScheduleSection
            calc={expandedCalc}
            viewMode={scheduleViewMode}
            onViewModeChange={onScheduleViewModeChange}
          />
        </div>
      )}
    </Card>
  );
}

function WithdrawalTooltip({ active, payload, calc }) {
  if (!active || !payload?.length || !calc) return null;
  const row = payload[0]?.payload ?? {};
  const freq = calc.frequencyLabel?.toLowerCase() || 'period';
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-lg text-sm min-w-[180px]">
      <p className="font-semibold mb-1.5">Year {row.year}</p>
      <p className="flex justify-between gap-4">
        <span className="text-slate-500 capitalize">Per {calc.perPeriodLabel}</span>
        <span className="font-medium text-red-500">{formatIndianCurrency(row.perPeriodWithdrawal, false)}</span>
      </p>
      <p className="flex justify-between gap-4 mt-0.5">
        <span className="text-slate-500">Annual total</span>
        <span className="font-medium">{formatIndianCurrency(row.annualWithdrawal, false)}</span>
      </p>
      <p className="text-[10px] text-slate-400 mt-1.5 border-t border-slate-100 dark:border-slate-800 pt-1">
        {formatIndianCurrency(calc.withdrawalAmount, false)} / {freq} · {calc.inflationAdjusted ? `${calc.inflationRate}% inflation` : 'flat'}
      </p>
    </div>
  );
}

function WithdrawalScheduleSection({ calc, viewMode: viewModeProp, onViewModeChange }) {
  const [internalViewMode, setInternalViewMode] = useState('year');
  const viewMode = viewModeProp ?? internalViewMode;
  const setViewMode = onViewModeChange ?? setInternalViewMode;
  const freqCap = calc.frequencyLabel || 'Monthly';
  const perLabel = calc.perPeriodLabel || 'month';

  const yearChartData = calc.scheduleTable || [];
  const periodChartData = (calc.periodChartData || []).slice(0, calc.withdrawalFrequency === 'monthly' ? 36 : 20);

  const chartData = viewMode === 'period' ? periodChartData : yearChartData;
  const chartXKey = viewMode === 'period' ? 'label' : 'year';

  return (
    <Card
      title="Withdrawal schedule"
      subtitle={`${formatIndianCurrency(calc.withdrawalAmount, false)} per ${perLabel} · ${calc.inflationAdjusted ? 'inflation-adjusted yearly' : 'flat each year'}`}
      action={(
        <div className="flex gap-1">
          <Btn size="sm" variant={viewMode === 'year' ? 'primary' : 'ghost'} onClick={() => setViewMode('year')}>
            <BarChart3 className="w-3.5 h-3.5" />
          </Btn>
          <Btn size="sm" variant={viewMode === 'period' ? 'primary' : 'ghost'} onClick={() => setViewMode('period')}>
            <Table2 className="w-3.5 h-3.5" />
          </Btn>
        </div>
      )}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
          <XAxis dataKey={chartXKey} tick={{ fontSize: 10 }} interval={viewMode === 'period' ? 'preserveStartEnd' : 0} />
          <YAxis tickFormatter={(v) => `${(v / 1e3).toFixed(0)}K`} tick={{ fontSize: 11 }} />
          <Tooltip content={<WithdrawalTooltip calc={calc} />} />
          <Legend />
          <Bar
            dataKey="perPeriodWithdrawal"
            fill="#ef4444"
            name={`Per ${perLabel} (${freqCap})`}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Schedule table — hover rows for details</p>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900 shadow-[0_1px_0_0_rgb(226_232_240)] dark:shadow-[0_1px_0_0_rgb(30_41_59)]">
              <tr className="text-xs text-slate-500">
                <th className="text-left py-2 px-3 font-semibold bg-white dark:bg-slate-900">Year</th>
                <th className="text-right py-2 px-3 font-semibold capitalize bg-white dark:bg-slate-900">Per {perLabel}</th>
                <th className="text-right py-2 px-3 font-semibold bg-white dark:bg-slate-900">Annual total</th>
              </tr>
            </thead>
            <tbody>
              {yearChartData.map((row) => (
                <tr
                  key={row.year}
                  className="border-t border-slate-50 dark:border-slate-800/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors group"
                  title={`Year ${row.year}: ${formatIndianCurrency(row.perPeriodWithdrawal, false)}/${perLabel} · ${formatIndianCurrency(row.annualWithdrawal, false)}/year`}
                >
                  <td className="py-2 px-3 font-medium">Year {row.year}</td>
                  <td className="py-2 px-3 text-right text-red-500 font-medium">{formatIndianCurrency(row.perPeriodWithdrawal, false)}</td>
                  <td className="py-2 px-3 text-right font-semibold">{formatIndianCurrency(row.annualWithdrawal, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          Chart shows per-{perLabel} amount. Table &amp; tooltip also show annual total for each year.
        </p>
      </div>
    </Card>
  );
}

export function GoalsTab() {
  const { data, updateFinance, generateId: genId, canEdit } = useApp();
  const pf = data.personalFinance;
  const [goalsUi, setGoalsUi] = useUiSection('goals');
  const [pendingDeleteSmallGoalId, setPendingDeleteSmallGoalId] = useState(null);
  const [selectedGoalId, setSelectedGoalId] = useState(pf.activeFreedomGoalId || null);

  const subView = goalsUi.subView;
  const savedGoalsPage = goalsUi.savedGoalsPage;
  const expandedScheduleGoalId = goalsUi.expandedScheduleGoalId;
  const scheduleViewMode = goalsUi.scheduleViewMode;

  const setSubView = (v) => setGoalsUi({ subView: v });
  const setSavedGoalsPage = (v) => setGoalsUi({ savedGoalsPage: typeof v === 'function' ? v(savedGoalsPage) : v });
  const setExpandedScheduleGoalId = (v) => setGoalsUi({ expandedScheduleGoalId: v });
  const setScheduleViewMode = (v) => setGoalsUi({ scheduleViewMode: v });

  const activeGoalTitle = useMemo(() => {
    if (!pf.activeFreedomGoalId) return '';
    return pf.financialGoals?.find((g) => g.id === pf.activeFreedomGoalId)?.title || '';
  }, [pf.activeFreedomGoalId, pf.financialGoals]);

  const goalName = goalsUi.goalName || activeGoalTitle;
  const setGoalName = (name) => {
    const next = typeof name === 'function' ? name(goalName) : name;
    setGoalsUi({ goalName: next });
  };

  const freedomGoals = useMemo(
    () => (pf.financialGoals || []).filter((g) => g.category === 'financial_freedom'),
    [pf.financialGoals]
  );

  const savedSettings = pf.freedomSettings || DEFAULT_FREEDOM_SETTINGS;
  const [settings, setSettings] = useState({ ...DEFAULT_FREEDOM_SETTINGS, ...savedSettings });

  const currentCorpus = useMemo(() => getGoalsCorpus(pf.assets), [pf.assets]);

  const calcInputKey = useMemo(
    () => JSON.stringify({ ...settings, currentCorpus }),
    [settings, currentCorpus]
  );

  const { result: calc, isCalculating } = useDeferredCalculation(
    calcInputKey,
    () => calculateFinancialFreedom(settings, currentCorpus),
    { debounceMs: 450, minDisplayMs: 750 }
  );

  const persistSettings = (next, activeId = selectedGoalId) => {
    if (!canEdit) return;
    setSettings(next);
    updateFinance({ ...pf, freedomSettings: next, activeFreedomGoalId: activeId ?? selectedGoalId ?? null });
  };

  const setSetting = (field, value) => {
    persistSettings({ ...settings, [field]: value });
  };

  const loadGoal = (goal) => {
    if (!goal?.freedomMeta) return;
    setSelectedGoalId(goal.id);
    const next = { ...DEFAULT_FREEDOM_SETTINGS, ...goal.freedomMeta };
    setSettings(next);
    setGoalsUi({ subView: 'freedom', goalName: goal.title || '' });
    updateFinance({ ...pf, activeFreedomGoalId: goal.id, freedomSettings: next });
  };

  const clearSelectedGoal = () => {
    setSelectedGoalId(null);
    setGoalsUi({ goalName: '' });
    updateFinance({ ...pf, activeFreedomGoalId: null });
  };

  const buildGoalPayload = () => {
    const title = goalName.trim() || `₹${formatIndianCurrency(calc.withdrawalAmount, false)}/${calc.frequencyLabel.toLowerCase()} · ${calc.durationYears}yr`;
    return {
      title,
      targetAmount: calc.requiredCorpus,
      currentAmount: currentCorpus,
      deadline: new Date(new Date().setFullYear(new Date().getFullYear() + Math.min(calc.durationYears, 30))).toISOString().split('T')[0],
      category: 'financial_freedom',
      priority: 'high',
      milestones: [],
      freedomMeta: { ...settings },
      updatedAt: new Date().toISOString(),
    };
  };

  const saveGoal = () => {
    const payload = buildGoalPayload();
    const audit = { section: 'goals', action: selectedGoalId ? 'update' : 'create', entityId: selectedGoalId, summary: `${selectedGoalId ? 'Updated' : 'Saved'} freedom goal: ${payload.title}` };
    if (selectedGoalId) {
      updateFinance({
        ...pf,
        activeFreedomGoalId: selectedGoalId,
        freedomSettings: { ...settings },
        financialGoals: pf.financialGoals.map((g) => (g.id === selectedGoalId ? { ...g, ...payload, id: g.id } : g)),
      }, audit);
    } else {
      const id = genId();
      updateFinance({
        ...pf,
        activeFreedomGoalId: id,
        freedomSettings: { ...settings },
        financialGoals: [...pf.financialGoals, { ...payload, id, createdAt: new Date().toISOString() }],
      }, audit);
      setSelectedGoalId(id);
    }
  };

  const updateSmallGoal = (id, field, value) => {
    updateFinance({ ...pf, smallGoals: pf.smallGoals.map((g) => (g.id === id ? { ...g, [field]: value } : g)) });
  };

  const removeSmallGoal = (id) => {
    updateFinance({ ...pf, smallGoals: pf.smallGoals.filter((x) => x.id !== id) });
    setPendingDeleteSmallGoalId(null);
  };

  const deleteFreedomGoal = (id) => {
    const next = pf.financialGoals.filter((g) => g.id !== id);
    if (selectedGoalId === id) clearSelectedGoal();
    updateFinance({ ...pf, financialGoals: next, activeFreedomGoalId: selectedGoalId === id ? null : pf.activeFreedomGoalId });
  };

  const addSmallGoal = () => {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    updateFinance({
      ...pf,
      smallGoals: [...pf.smallGoals, {
        id: genId(), title: 'New Goal', targetAmount: 50000, savedAmount: 0,
        deadline: '2026-06-30', category: 'Savings', color: colors[pf.smallGoals.length % colors.length],
      }],
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="Financial Goals"
        subtitle="Financial freedom calculator & savings goals"
        action={(
          <div className="flex overflow-x-auto gap-2 pb-0.5 scrollbar-hide w-full sm:w-auto -mx-1 px-1">
            <Btn variant={subView === 'freedom' ? 'primary' : 'secondary'} size="sm" className="shrink-0" onClick={() => setSubView('freedom')}>
              <Flame className="w-4 h-4 inline mr-1" />Freedom
            </Btn>
            <Btn variant={subView === 'saved' ? 'primary' : 'secondary'} size="sm" className="shrink-0" onClick={() => setSubView('saved')}>
              <Target className="w-4 h-4 inline mr-1" />Saved ({freedomGoals.length})
            </Btn>
            <Btn variant={subView === 'small' ? 'primary' : 'secondary'} size="sm" className="shrink-0" onClick={() => setSubView('small')}>
              <Star className="w-4 h-4 inline mr-1" />Small Goals
            </Btn>
          </div>
        )}
      />

      {subView === 'freedom' && (
        <div className={canEdit ? 'grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6' : 'space-y-4'}>
          {canEdit && (
          <div className="space-y-4">
            <Card title="Saved scenarios" subtitle="Load a goal into the calculator">
              <SavedGoalPicker
                goals={freedomGoals}
                selectedGoalId={selectedGoalId}
                onSelect={loadGoal}
                onClear={clearSelectedGoal}
              />
              {selectedGoalId && (
                <Btn size="sm" variant="ghost" className="w-full mt-2" onClick={clearSelectedGoal}>Clear selection · new scenario</Btn>
              )}
            </Card>

            <Card title="Goal name">
              <InputField label="Scenario name" value={goalName} onChange={setGoalName} placeholder="e.g. ₹10K/mo retirement" />
            </Card>

            <Card title="Income Goal" subtitle="How much recurring income do you want?">
              <div className="space-y-3">
                <InputField label="Withdrawal amount" type="number" value={settings.withdrawalAmount} onChange={(v) => setSetting('withdrawalAmount', v)} suffix="₹" />
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Withdrawal frequency</label>
                  <select value={settings.withdrawalFrequency} onChange={(e) => setSetting('withdrawalFrequency', e.target.value)} className="w-full">
                    {Object.values(WITHDRAWAL_FREQUENCIES).map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <InputField label="Duration" type="number" value={settings.durationYears} onChange={(v) => setSetting('durationYears', v)} suffix="years" allowDecimal={false} />
              </div>
            </Card>

            <Card title="Inflation & Returns">
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input type="checkbox" checked={settings.inflationAdjusted} onChange={(e) => setSetting('inflationAdjusted', e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                  <div>
                    <p className="text-sm font-medium">Inflation-adjusted withdrawals</p>
                    <p className="text-[11px] text-slate-500">Withdrawal rises each year by inflation %</p>
                  </div>
                </label>
                <InputField label="Inflation rate" type="number" value={settings.inflationRate} onChange={(v) => setSetting('inflationRate', v)} suffix="% p.a." step={0.1} />
                <InputField label="Expected return on corpus" type="number" value={settings.expectedReturn} onChange={(v) => setSetting('expectedReturn', v)} suffix="% p.a." step={0.1} />
                <InputField label="Safe withdrawal rate (perpetual)" type="number" value={settings.safeWithdrawalRate} onChange={(v) => setSetting('safeWithdrawalRate', v)} suffix="% p.a." step={0.1} />
              </div>
            </Card>

            <Card title="Your Corpus">
              <p className="text-xs text-slate-500 mb-2">MF, equity, FD &amp; cash only — excludes property &amp; gold</p>
              <p className="text-2xl font-bold text-indigo-600">{formatIndianCurrency(currentCorpus)}</p>
              <Btn size="sm" variant="secondary" className="mt-3 w-full" onClick={saveGoal}>
                <Save className="w-3.5 h-3.5 inline mr-1" />
                {selectedGoalId ? 'Update saved goal' : 'Save as new goal'}
              </Btn>
            </Card>
          </div>
          )}

          <div className="space-y-4">
            <CalculatingOverlay
              isCalculating={isCalculating}
              steps={FREEDOM_CALC_STEPS}
              title="Running freedom calculator"
            >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Corpus needed" value={formatIndianCurrency(calc.requiredCorpus)} sub={`${calc.durationYears} yr · ${calc.inflationAdjusted ? 'inflation on' : 'flat'}`} color="indigo" />
              <StatCard label="Perpetual (SWR)" value={formatIndianCurrency(calc.perpetualCorpus)} sub={`@${calc.safeWithdrawalRate}% forever`} color="amber" />
              <StatCard label="Your corpus" value={formatIndianCurrency(calc.currentCorpus)} sub={`${calc.progress.toFixed(1)}% of target · liquid only`} color="green" />
              <StatCard label="Gap to freedom" value={formatIndianCurrency(calc.gap)} sub={calc.gap <= 0 ? 'Target met!' : 'Still needed'} color={calc.gap <= 0 ? 'green' : 'red'} />
            </div>

            <Card title="What you need" subtitle={`${formatIndianCurrency(calc.withdrawalAmount, false)} ${calc.frequencyLabel.toLowerCase()} for ${calc.durationYears} years`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Calculator className="w-4 h-4 text-indigo-600" />
                    <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">Finite horizon corpus</p>
                  </div>
                  <p className="text-2xl font-bold text-indigo-600">{formatIndianCurrency(calc.requiredCorpus)}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    {formatIndianCurrency(calc.withdrawalAmount, false)}/{calc.perPeriodLabel} in year 1
                    {calc.inflationAdjusted && <> → {formatIndianCurrency(calc.finalYearMonthly, false)}/{calc.perPeriodLabel} in year {calc.durationYears}</>}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Total withdrawn: {formatIndianCurrency(calc.totalWithdrawn)}</p>
                </div>
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-2">
                    <PiggyBank className="w-4 h-4 text-amber-600" />
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Perpetual income (SWR)</p>
                  </div>
                  <p className="text-2xl font-bold text-amber-600">{formatIndianCurrency(calc.perpetualCorpus)}</p>
                  <p className="text-xs text-slate-500 mt-2">Using {calc.safeWithdrawalRate}% safe withdrawal rate</p>
                </div>
              </div>
              <ProgressBar value={calc.progress} color="#6366f1" height="h-2.5" />
              {calc.currentCorpus > 0 && (
                <div className={`flex items-center gap-2 p-3 rounded-xl text-sm mt-3 ${calc.survivesFullPeriod ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-800'}`}>
                  {calc.survivesFullPeriod ? <TrendingUp className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {calc.survivesFullPeriod
                    ? `Your assets can fund this for all ${calc.durationYears} years.`
                    : `Need ${formatIndianCurrency(calc.gap)} more for the full plan.`}
                </div>
              )}
            </Card>

            <WithdrawalScheduleSection
              calc={calc}
              viewMode={scheduleViewMode}
              onViewModeChange={setScheduleViewMode}
            />

            <Card title="Corpus projection" subtitle={`Starting with ${formatIndianCurrency(calc.currentCorpus || calc.requiredCorpus)}`}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={calc.depletion.slice(0, 40)}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1e7).toFixed(1)}Cr`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatIndianCurrency(v, false)} />
                  <Area type="monotone" dataKey="endingCorpus" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} name="Corpus left" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
            </CalculatingOverlay>
          </div>
        </div>
      )}

      {subView === 'saved' && (
        <>
          {freedomGoals.length === 0 ? (
            <Card className="text-center py-12">
              <Target className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No saved freedom goals — use the calculator and click Save</p>
            </Card>
          ) : (
            <SavedGoalsTable
              goals={freedomGoals}
              currentCorpus={currentCorpus}
              page={savedGoalsPage}
              onPageChange={setSavedGoalsPage}
              onLoad={loadGoal}
              onDelete={deleteFreedomGoal}
              expandedScheduleGoalId={expandedScheduleGoalId}
              onToggleSchedule={(id) => setExpandedScheduleGoalId(expandedScheduleGoalId === id ? null : id)}
              scheduleViewMode={scheduleViewMode}
              onScheduleViewModeChange={setScheduleViewMode}
              canEdit={canEdit}
            />
          )}
        </>
      )}

      {subView === 'small' && (
        <>
          {canEdit && (
            <div className="flex justify-end">
              <Btn onClick={addSmallGoal}><Plus className="w-4 h-4 inline mr-1" />Add Small Goal</Btn>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pf.smallGoals.map((g) => {
              const progress = getProgressPercent(g.savedAmount, g.targetAmount);
              const pendingDelete = pendingDeleteSmallGoalId === g.id;
              return (
                <Card key={g.id}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold">{g.title}</h4>
                      <p className="text-xs text-slate-500">{g.category} · Due {g.deadline}</p>
                    </div>
                    {canEdit && !pendingDelete && (
                      <Btn variant="ghost" size="sm" onClick={() => setPendingDeleteSmallGoalId(g.id)}><Trash2 className="w-3 h-3" /></Btn>
                    )}
                  </div>
                  <div className="text-2xl font-bold mb-2" style={{ color: g.color }}>{progress.toFixed(0)}%</div>
                  <ProgressBar value={progress} color={g.color} height="h-3" />
                  <div className="flex justify-between mt-2 text-sm text-slate-500">
                    <span>{formatIndianCurrency(g.savedAmount)}</span>
                    <span>{formatIndianCurrency(g.targetAmount)}</span>
                  </div>
                  {canEdit && (
                    <InputField label="Update saved" type="number" value={g.savedAmount} onChange={(v) => updateSmallGoal(g.id, 'savedAmount', v)} suffix="₹" className="mt-3" />
                  )}
                  {canEdit && pendingDelete && (
                    <div className="mt-4 p-4 rounded-xl border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                      <p className="font-semibold text-sm text-red-900 dark:text-red-200 mb-2">Delete this goal?</p>
                      <div className="flex gap-2">
                        <Btn size="sm" variant="danger" onClick={() => removeSmallGoal(g.id)}>Yes, delete</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setPendingDeleteSmallGoalId(null)}>Cancel</Btn>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
