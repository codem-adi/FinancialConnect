import { useMemo, useState, useEffect } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { calculateRetireWise, projectAccumulation } from '../../lib/calculations';
import { formatIndianCurrency, formatPercent } from '../../lib/utils';
import { AllocationTable } from '../charts/AllocationTable';
import { CalculatingOverlay } from '../ui/CalculatingOverlay';
import { useDeferredCalculation } from '../../hooks/useDeferredCalculation';
import { useUiSection } from '../../hooks/useUiSection';
import { Card, StatCard, InputField, Btn, Badge, ReadinessRing, PageHeader } from '../ui';
import { Save, Copy, Trash2, Plus, AlertTriangle } from 'lucide-react';

const SCENARIO_COLORS = ['#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const ALLOC_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4'];

const RETIREWISE_CALC_STEPS = [
  'Projecting retirement expenses…',
  'Computing required corpus…',
  'Running Monte Carlo simulation…',
  'Stress-testing scenarios…',
  'Building accumulation path…',
];

function PlanInputs({ plan, onChange, onSave, onDuplicate, onDelete, onAdd, plans, activePlanId, setActivePlan, canEdit }) {
  const allocTotal = plan.assetAllocation.equity + plan.assetAllocation.debt + plan.assetAllocation.gold + plan.assetAllocation.cash;
  const update = (field, value) => onChange({ ...plan, [field]: value });
  const updateAlloc = (field, value) => onChange({ ...plan, assetAllocation: { ...plan.assetAllocation, [field]: value } });

  return (
    <div className="space-y-4">
      <Card title="Plan Management">
        <InputField label="Plan Name" value={plan.name} onChange={(v) => update('name', v)} className="mb-3" readOnly={!canEdit} />
        <select value={activePlanId} onChange={(e) => setActivePlan(e.target.value)} className="w-full mb-3" disabled={!canEdit}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Btn size="sm" onClick={onSave}><Save className="w-3 h-3 inline mr-1" />Save</Btn>
          <Btn size="sm" variant="secondary" onClick={onDuplicate}><Copy className="w-3 h-3 inline mr-1" />Duplicate</Btn>
          <Btn size="sm" variant="secondary" onClick={onAdd}><Plus className="w-3 h-3 inline mr-1" />New</Btn>
          <Btn size="sm" variant="danger" onClick={onDelete}><Trash2 className="w-3 h-3" /></Btn>
        </div>
        )}
      </Card>

      <Card title="Retirement Inputs">
        <div className="space-y-3">
          <InputField label="Current Age" type="number" value={plan.currentAge} onChange={(v) => update('currentAge', v)} readOnly={!canEdit} />
          <InputField label="Retirement Age" type="number" value={plan.retirementAge} onChange={(v) => update('retirementAge', v)} readOnly={!canEdit} />
          <InputField label="Life Expectancy" type="number" value={plan.lifeExpectancy} onChange={(v) => update('lifeExpectancy', v)} readOnly={!canEdit} />
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-sm">
            Horizon: <strong>{plan.lifeExpectancy - plan.retirementAge} years</strong>
          </div>
        </div>
      </Card>

      <Card title="Expense Inputs">
        <div className="space-y-3">
          <InputField label="Monthly Expense Today" type="number" value={plan.monthlyExpenseToday} onChange={(v) => update('monthlyExpenseToday', v)} suffix="₹" />
          <div className="text-xs text-slate-500">Annual: {formatIndianCurrency(plan.monthlyExpenseToday * 12, false)}</div>
          <InputField label="Inflation Rate" type="number" value={plan.inflationRate} onChange={(v) => update('inflationRate', v)} suffix="%" step={0.1} />
        </div>
      </Card>

      <Card title="Investment Inputs">
        <div className="space-y-3">
          <InputField label="Current Corpus" type="number" value={plan.currentCorpus} onChange={(v) => update('currentCorpus', v)} suffix="₹" />
          <InputField label="Expected Return" type="number" value={plan.expectedReturn} onChange={(v) => update('expectedReturn', v)} suffix="%" />
          <InputField label="Conservative Return" type="number" value={plan.conservativeReturn} onChange={(v) => update('conservativeReturn', v)} suffix="%" />
          <InputField label="Moderate Return" type="number" value={plan.moderateReturn} onChange={(v) => update('moderateReturn', v)} suffix="%" />
          <InputField label="Aggressive Return" type="number" value={plan.aggressiveReturn} onChange={(v) => update('aggressiveReturn', v)} suffix="%" />
          <InputField label="Volatility (Monte Carlo)" type="number" value={plan.volatility} onChange={(v) => update('volatility', v)} suffix="%" />
        </div>
      </Card>

      <Card title="Asset Allocation">
        <div className="space-y-3">
          {['equity', 'debt', 'gold', 'cash'].map((k) => (
            <InputField key={k} label={`${k.charAt(0).toUpperCase() + k.slice(1)} %`} type="number" value={plan.assetAllocation[k]} onChange={(v) => updateAlloc(k, v)} suffix="%" />
          ))}
          <div className={`text-sm font-medium ${allocTotal === 100 ? 'text-emerald-600' : 'text-red-500'}`}>
            Total: {allocTotal}% {allocTotal !== 100 && '(must equal 100%)'}
          </div>
        </div>
      </Card>

      <Card title="Savings Goal Planner">
        <div className="space-y-3">
          <InputField label="Monthly SIP" type="number" value={plan.monthlySIP} onChange={(v) => update('monthlySIP', v)} suffix="₹" />
          <InputField label="Annual SIP Increase" type="number" value={plan.annualSIPIncrease} onChange={(v) => update('annualSIPIncrease', v)} suffix="%" />
        </div>
      </Card>
    </div>
  );
}

export function RetireWiseTab() {
  const { data, activePlan, updatePlan, addPlan, removePlan, dupPlan, setActivePlanId, canEdit } = useApp();
  const [retireUi, setRetireUi] = useUiSection('retirewise');
  const [localPlan, setLocalPlan] = useState(null);

  useEffect(() => {
    if (!activePlan) return;
    const draft = retireUi.draftPlanById?.[activePlan.id];
    setLocalPlan(draft ? { ...draft } : null);
  }, [activePlan?.id]);

  const plan = localPlan || activePlan;

  const planKey = useMemo(() => (plan ? JSON.stringify(plan) : ''), [plan]);

  const { result: computed, isCalculating } = useDeferredCalculation(
    planKey,
    () => (plan
      ? { calc: calculateRetireWise(plan), accumulation: projectAccumulation(plan) }
      : { calc: null, accumulation: [] }),
    { debounceMs: 500, minDisplayMs: 950 }
  );

  const calc = computed?.calc;
  const accumulation = computed?.accumulation ?? [];

  if (!plan || !calc) return null;

  const setActivePlanIdLocal = (id) => {
    const selected = data.retirementPlans.find((p) => p.id === id);
    if (!selected) return;
    if (localPlan && plan?.id) {
      setRetireUi({
        draftPlanById: { ...retireUi.draftPlanById, [plan.id]: localPlan },
      });
    }
    const draft = retireUi.draftPlanById?.[id];
    setLocalPlan(draft ? { ...draft } : { ...selected });
    setActivePlanId(id);
  };

  const handleChange = (updated) => {
    setLocalPlan(updated);
    setRetireUi({
      draftPlanById: { ...retireUi.draftPlanById, [updated.id]: updated },
    });
  };

  const handleSave = async () => {
    await updatePlan(localPlan || plan);
    const drafts = { ...retireUi.draftPlanById };
    delete drafts[(localPlan || plan).id];
    setRetireUi({ draftPlanById: drafts });
    setLocalPlan(null);
  };

  const corpusChartData = calc.baseProjections.map((p) => ({
    age: p.age,
    corpus: Math.round(p.endingCorpus),
    expense: Math.round(p.annualExpense),
  }));

  const withdrawalChartData = calc.baseProjections.slice(0, 30).map((p) => ({
    age: p.age,
    withdrawal: Math.round(p.withdrawal / 12),
  }));

  const scenarioChartData = calc.scenarios[0]?.projections.slice(0, 40).map((_, i) => {
    const point = { age: calc.scenarios[0].projections[i]?.age };
    calc.scenarios.forEach((s) => { point[s.name] = Math.round(s.projections[i]?.endingCorpus || 0); });
    return point;
  }) || [];

  const allocData = Object.entries(plan.assetAllocation)
    .map(([k, v], i) => ({
      name: k.charAt(0).toUpperCase() + k.slice(1),
      amount: plan.currentCorpus * v / 100,
      pct: v,
      color: ALLOC_COLORS[i % ALLOC_COLORS.length],
    }))
    .sort((a, b) => b.amount - a.amount);

  const readinessBadge = { green: 'green', yellow: 'amber', red: 'red' };

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6">
      <PageHeader
        title="RetireWise — FIRE Planning"
        subtitle="Retirement corpus, safe withdrawal & stress testing"
        action={!canEdit ? (
          <select
            value={plan.id}
            onChange={(e) => setActivePlanIdLocal(e.target.value)}
            className="text-sm w-full sm:w-auto"
          >
            {data.retirementPlans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : null}
      />

      <div className={canEdit ? 'grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4 sm:gap-6' : 'space-y-4 sm:space-y-6'}>
        {canEdit && (
        <PlanInputs
          plan={plan}
          onChange={handleChange}
          onSave={handleSave}
          onDuplicate={() => dupPlan(plan.id).then((d) => setLocalPlan(d))}
          onDelete={() => { removePlan(plan.id); setLocalPlan(null); }}
          onAdd={() => { addPlan(); setLocalPlan(null); }}
          plans={data.retirementPlans}
          activePlanId={plan.id}
          setActivePlan={setActivePlanIdLocal}
          canEdit={canEdit}
        />
        )}

        <CalculatingOverlay
          isCalculating={isCalculating}
          steps={RETIREWISE_CALC_STEPS}
          title="Running RetireWise analysis"
        >
        <div className="space-y-4 sm:space-y-6">
          {/* Real Return Banner */}
          <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
            <p className="text-xs sm:text-sm opacity-80">Real Return (after inflation)</p>
            <p className="text-2xl sm:text-3xl font-bold">{formatPercent(calc.realReturn)}</p>
            <p className="text-xs sm:text-sm opacity-80 mt-1">Future annual expense at retirement: {formatIndianCurrency(calc.futureAnnualExpense)}</p>
          </div>

          {/* Main Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <Card title="Required Corpus">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Conservative (2.5%)</span><span className="font-bold">{formatIndianCurrency(calc.requiredCorpus.conservative)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Recommended (3.5%)</span><span className="font-bold text-indigo-600">{formatIndianCurrency(calc.requiredCorpus.recommended)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Luxury (4.0%)</span><span className="font-bold">{formatIndianCurrency(calc.requiredCorpus.luxury)}</span></div>
              </div>
            </Card>

            <Card title="Safe Monthly Withdrawal">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">2.5% SWR</span><span className="font-bold">{formatIndianCurrency(calc.safeWithdrawal.swr25)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">3.0% SWR</span><span className="font-bold">{formatIndianCurrency(calc.safeWithdrawal.swr30)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">3.5% SWR</span><span className="font-bold text-indigo-600">{formatIndianCurrency(calc.safeWithdrawal.swr35)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">4.0% SWR</span><span className="font-bold">{formatIndianCurrency(calc.safeWithdrawal.swr40)}</span></div>
              </div>
            </Card>

            <Card title="Retirement Readiness">
              <ReadinessRing score={calc.readinessScore} color={calc.readinessColor} />
              <div className="text-center mt-2">
                <Badge color={readinessBadge[calc.readinessColor]}>{calc.readinessColor.toUpperCase()}</Badge>
              </div>
            </Card>

            <Card title="Corpus Survival Probability">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">50%</span><span className="font-bold">{calc.corpusSurvivalProbability.p50.toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">75%</span><span className="font-bold">{calc.corpusSurvivalProbability.p75.toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">90%</span><span className="font-bold">{calc.corpusSurvivalProbability.p90.toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">95%</span><span className="font-bold text-indigo-600">{calc.corpusSurvivalProbability.p95.toFixed(1)}%</span></div>
              </div>
            </Card>
          </div>

          {/* FIRE Targets */}
          <Card title="FIRE Targets">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
              <StatCard label="Lean FIRE (25x)" value={formatIndianCurrency(calc.fireTargets.leanFire25x)} color="blue" />
              <StatCard label="Regular FIRE (33x)" value={formatIndianCurrency(calc.fireTargets.regularFire33x)} color="indigo" />
              <StatCard label="Fat FIRE (40x)" value={formatIndianCurrency(calc.fireTargets.fatFire40x)} color="green" />
              <StatCard label="Luxury FIRE (50x)" value={formatIndianCurrency(calc.fireTargets.luxuryFire50x)} color="amber" />
            </div>
            {calc.fireAchievement.yearsToFire && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-sm">
                FIRE achieved in <strong>{calc.fireAchievement.yearsToFire} years</strong> ({calc.fireAchievement.projectedDate}) ·
                Corpus: {formatIndianCurrency(calc.fireAchievement.projectedCorpus)}
              </div>
            )}
          </Card>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Corpus Growth Over Time">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={corpusChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="age" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1e7).toFixed(1)}Cr`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatIndianCurrency(v)} />
                  <Area type="monotone" dataKey="corpus" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} name="Corpus" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Withdrawal Growth (Inflation Adjusted)">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={withdrawalChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="age" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1e5).toFixed(1)}L`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatIndianCurrency(v)} />
                  <Line type="monotone" dataKey="withdrawal" stroke="#f59e0b" strokeWidth={2} name="Monthly Withdrawal" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Scenario Comparison */}
          <Card title="Scenario Comparison">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={scenarioChartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="age" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1e7).toFixed(1)}Cr`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatIndianCurrency(v)} />
                <Legend />
                {calc.scenarios.map((s, i) => (
                  <Line key={s.name} type="monotone" dataKey={s.name} stroke={SCENARIO_COLORS[i]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
              {calc.scenarios.map((s, i) => (
                <div key={s.name} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-sm">
                  <p className="font-medium" style={{ color: SCENARIO_COLORS[i] }}>{s.name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {s.depletionYear ? `Depletes at age ${s.survivalYear}` : 'Survives full horizon'}
                  </p>
                  <p className="text-xs font-bold mt-1">{formatIndianCurrency(s.remainingCorpus)} left</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Monte Carlo + Allocation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Monte Carlo Distribution (1,000 sims)">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <StatCard label="Survival Probability" value={`${calc.monteCarlo.survivalProbability.toFixed(1)}%`} color="green" />
                <StatCard label="Median Ending Corpus" value={formatIndianCurrency(calc.monteCarlo.medianEndingCorpus)} color="indigo" />
                <StatCard label="Worst 10%" value={formatIndianCurrency(calc.monteCarlo.worst10Percent)} color="red" />
                <StatCard label="Best 10%" value={formatIndianCurrency(calc.monteCarlo.best10Percent)} color="amber" />
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={calc.monteCarlo.distribution}>
                  <XAxis dataKey="bucket" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Asset Allocation">
              <AllocationTable rows={allocData} />
            </Card>
          </div>

          {/* Risk Analysis */}
          <Card title="Risk Analysis">
            <div className="space-y-3">
              {[calc.riskAnalysis.lowerReturns, calc.riskAnalysis.higherInflation, calc.riskAnalysis.higherWithdrawal].map((text, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm">{text}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* SIP Accumulation */}
          <Card title="Savings Goal — Corpus Accumulation">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={accumulation.slice(0, 30)}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="age" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1e7).toFixed(1)}Cr`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatIndianCurrency(v)} />
                <Area type="monotone" dataKey="corpus" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Projected Corpus" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </div>
        </CalculatingOverlay>
      </div>
    </div>
  );
}
