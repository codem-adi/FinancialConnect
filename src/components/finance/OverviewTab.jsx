import { useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Users, Wallet, Receipt, Sparkles, TrendingUp, TrendingDown, PiggyBank, Scale, Car } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { formatIndianCurrency } from '../../lib/utils';
import { isFreshHousehold } from '../../lib/defaults';
import { computeOverviewStats, getMonthlyChartData, getMonthKey, formatMonthLabel } from '../../lib/financeStats';
import { AllocationTable, withAllocationPercent } from '../charts/AllocationTable';
import { StatCard, Card, Badge, PageHeader } from '../ui';

const CHART_COLORS = { income: '#10b981', outflow: '#ef4444', savings: '#6366f1' };

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold mb-1">{row?.monthLabel || label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-medium">{formatIndianCurrency(p.value, false)}</span>
        </p>
      ))}
      {row && !row.hasRecord && (
        <p className="text-[10px] text-slate-400 mt-1 border-t border-slate-100 dark:border-slate-800 pt-1">
          No expense data saved — edit in Expenses tab
        </p>
      )}
    </div>
  );
}

export function OverviewTab() {
  const { data, setActiveTab, canEdit } = useApp();
  const { user, household } = useAuth();
  const pf = data.personalFinance;
  const currentMonth = getMonthKey();

  const stats = useMemo(() => computeOverviewStats(pf, currentMonth), [pf, currentMonth]);
  const chartData = useMemo(() => getMonthlyChartData(pf, 6), [pf]);
  const isFresh = useMemo(() => isFreshHousehold(pf), [pf]);

  const breakdownData = useMemo(
    () => withAllocationPercent(stats.categoryBreakdown.filter((c) => c.amount > 0), 'amount'),
    [stats.categoryBreakdown]
  );

  const setupSteps = [
    { icon: Users, label: 'Add family income', tab: 'family', hint: 'Set salaries for household members' },
    { icon: Receipt, label: 'Record this month\'s expenses', tab: 'expenses', hint: 'Track spending by category' },
    { icon: Wallet, label: 'Add assets & loans', tab: 'assets', hint: 'Build your net worth picture' },
    { icon: Sparkles, label: 'Invite family', tab: 'team', hint: 'Share your join code from Financial Group' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="Financial Overview"
        subtitle={`${formatMonthLabel(currentMonth)} — income, expenses, loans & savings`}
        action={canEdit ? (
          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            className="w-full sm:w-auto text-sm px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-center"
          >
            Edit This Month&apos;s Expenses
          </button>
        ) : null}
      />

      {isFresh && (
        <Card className="!p-0 overflow-hidden border-indigo-200 dark:border-indigo-800">
          <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
            <p className="text-sm opacity-90">Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</p>
            <h2 className="text-lg sm:text-xl font-bold mt-0.5">
              {household?.name || 'Your household dashboard'}
            </h2>
            <p className="text-sm opacity-90 mt-1">
              Your dashboard is empty and ready. Start with the steps below — everything updates on Overview as you go.
            </p>
          </div>
          {canEdit && (
            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {setupSteps.map(({ icon: Icon, label, tab, hint }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 text-left transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
        <StatCard label="Income" value={formatIndianCurrency(stats.totalIncome)} sub="Family + other" color="green" />
        <StatCard label="Living Expenses" value={formatIndianCurrency(stats.livingExpenses)} sub="Categories" color="red" />
        <StatCard
          label="Loan EMIs"
          value={formatIndianCurrency(stats.loanPayments)}
          sub={stats.loanPrepayments > 0
            ? `${formatIndianCurrency(stats.loanEmi)} EMI + ${formatIndianCurrency(stats.loanPrepayments)} prepay`
            : 'All active loans'}
          color="amber"
        />
        <StatCard label="Total Outflow" value={formatIndianCurrency(stats.totalExpenses)} color="red" />
        <StatCard label="Savings" value={formatIndianCurrency(stats.savings)} sub={`${stats.savingsRate.toFixed(1)}% rate`} color="blue" />
        <StatCard label="Net Worth" value={formatIndianCurrency(stats.netWorth)} sub="Assets − Loans" color="indigo" />
      </div>

      <Card
        title="Monthly Trend — Last 6 Months"
        subtitle={canEdit ? 'Income vs total outflow vs savings — edit each month in Expenses to build history' : 'Income vs total outflow vs savings'}
      >
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.income} stopOpacity={0.35} />
                <stop offset="95%" stopColor={CHART_COLORS.income} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.outflow} stopOpacity={0.25} />
                <stop offset="95%" stopColor={CHART_COLORS.outflow} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="opacity-20" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `${(v / 1e5).toFixed(0)}L`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={42} />
            <Tooltip content={<TrendTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
            <Area type="monotone" dataKey="income" stroke={CHART_COLORS.income} strokeWidth={2.5} fill="url(#incomeGrad)" name="Income" dot={{ r: 3, fill: CHART_COLORS.income }} activeDot={{ r: 5 }} />
            <Area type="monotone" dataKey="totalOutflow" stroke={CHART_COLORS.outflow} strokeWidth={2} fill="url(#outflowGrad)" name="Total Outflow" dot={{ r: 3, fill: CHART_COLORS.outflow }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="savings" stroke={CHART_COLORS.savings} strokeWidth={2.5} name="Savings" dot={{ r: 4, fill: CHART_COLORS.savings, strokeWidth: 0 }} activeDot={{ r: 6 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title={`Expense Breakdown — ${formatMonthLabel(currentMonth)}`}>
          <AllocationTable
            rows={breakdownData}
            emptyMessage={canEdit ? 'No expenses recorded — go to Expenses tab to add' : 'No expenses recorded this month'}
          />
        </Card>

        <Card title="Wealth & Cash Flow">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-medium">Total Assets</span>
              </div>
              <span className="font-bold text-emerald-600">{formatIndianCurrency(stats.totalAssets)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
              <div className="flex items-center gap-3">
                <Wallet className="w-5 h-5 text-red-600" />
                <span className="text-sm font-medium">Outstanding Loans</span>
              </div>
              <span className="font-bold text-red-600">{formatIndianCurrency(stats.totalLoanOutstanding)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <div className="flex items-center gap-3">
                <Car className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-medium">Loan Payments</span>
              </div>
              <div className="text-right">
                <span className="font-bold text-amber-600">{formatIndianCurrency(stats.loanPayments)}</span>
                {stats.loanPrepayments > 0 && (
                  <p className="text-[10px] text-slate-500">
                    {formatIndianCurrency(stats.loanEmi)} EMI + {formatIndianCurrency(stats.loanPrepayments)} prepay
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
              <div className="flex items-center gap-3">
                <Scale className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-medium">Net Worth</span>
              </div>
              <span className="font-bold text-indigo-600">{formatIndianCurrency(stats.netWorth)}</span>
            </div>
            <div className={`flex items-center justify-between p-3 rounded-xl ${stats.savings >= 0 ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
              <div className="flex items-center gap-3">
                <PiggyBank className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium">This Month Savings</span>
              </div>
              <span className={`font-bold ${stats.savings >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{formatIndianCurrency(stats.savings)}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Family Summary">
        <div className="space-y-3">
          {stats.memberIncome.map((m) => {
            const badge = { normal: null, skipped: 'Skipped', cut: 'Reduced', extra: 'Bonus' }[m.status];
            return (
            <div key={m.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <div className="flex items-center gap-2">
                <div>
                  <p className="font-medium text-sm">{m.name}</p>
                  <p className="text-xs text-slate-500">{m.relationship}</p>
                </div>
                {badge && <Badge color={m.status === 'extra' ? 'indigo' : 'amber'}>{badge}</Badge>}
              </div>
              <div className="text-right">
                {m.paused ? (
                  <>
                    <p className="text-sm text-slate-400 line-through">{formatIndianCurrency(m.monthlyIncome)}/mo</p>
                    <p className="text-xs text-amber-600">Skipped this month</p>
                  </>
                ) : m.status === 'cut' ? (
                  <>
                    <p className="text-sm text-slate-400 line-through">{formatIndianCurrency(m.monthlyIncome)}/mo</p>
                    <p className="text-sm text-emerald-600 font-medium">{formatIndianCurrency(m.effectiveIncome)}/mo</p>
                  </>
                ) : m.status === 'extra' ? (
                  <p className="text-sm text-emerald-600 font-medium">{formatIndianCurrency(m.effectiveIncome)}/mo (+bonus)</p>
                ) : (
                  <p className="text-sm text-emerald-600 font-medium">{formatIndianCurrency(m.effectiveIncome)}/mo</p>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
