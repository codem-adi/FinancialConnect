import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Trash2, Pencil, X, Banknote, ArrowDownCircle, CreditCard,
  Clock, TrendingDown, IndianRupee, ChevronDown, ChevronUp, AlertCircle, ScrollText, Star,
  Copy, Check,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useUiSection } from '../../hooks/useUiSection';
import { formatIndianCurrency, formatPercent, formatRate, formatMonthlyRate, sanitizeNumbers, toNum, cn } from '../../lib/utils';
import {
  computeLoanStats, createEmptyLoan, normalizeLoan, LOAN_TYPES, calculateEMI,
  applyPrepayment, updatePrepayment, removePrepayment,
  previewPrepaymentImpact, getPrepaymentSavingsReport,
  calculateInterestSavedForDate, getPrepayments, formatPayoffAcceleration, formatDuration,
  getEmiPrincipal, getDisbursedPrincipal, EMI_BASIS, getLoanMonthlyOutflow,
  computeMonthlyPaymentBreakdown, buildLoanBankStatement, getMaxPrepaymentAmount,
  getManualEmiPayments, getPaidEmiCount, MAX_TENURE_MONTHS, formatManualEmiPaymentsSummary,
  clampManualEmiDate, getManualEmiDateBounds, updateEmiMonthStatus,
  getCurrentEmiMonthIndex, getEmiMonthStatus, getEmiDueDateForMonth,
  getFirstEmiDate, getEmiDay,
  getDailyInterest, formatTimeSkipped, todayYmd,
  getDisbursements, getMaxDisbursementAmount, getMaxDisbursementEditAmount,
  getDisbursementProgressPct, previewPartialDisbursement, applyDisbursement,
  previewDisbursementEdit, updateDisbursement, removeDisbursement,
} from '../../lib/loanCalculations';
import {
  buildLoanAudit, buildLoanDeleteAudit, buildPrepaymentAudit,
  buildPartialDisburseAudit, buildDisbursementUpdateAudit, buildDisbursementDeleteAudit,
} from '../../lib/auditSummaries';
import { Card, Btn, InputField, Badge, ProgressBar, StatCard, ConfirmDialog, PageHeader } from '../ui';

function loanIdsMatch(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function getLoanPrincipalTaken(stats) {
  if (stats.loanCategory === 'revolving') {
    return toNum(stats.creditLimit) || toNum(stats.statementBalance);
  }
  return toNum(stats.disbursedPrincipal) || toNum(stats.loanAmount) || 0;
}

function DashboardStatCard({ label, value, secondaryValue, sub, color = 'indigo', onClick, active, footer }) {
  const colors = {
    indigo: 'from-indigo-500 to-purple-600',
    green: 'from-emerald-500 to-teal-600',
    red: 'from-red-500 to-rose-600',
    amber: 'from-amber-500 to-orange-600',
    blue: 'from-blue-500 to-cyan-600',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'bg-white dark:bg-slate-900 rounded-lg sm:rounded-2xl border p-2 sm:p-5 animate-fade-in min-w-0 text-left w-full transition-all',
        active
          ? 'border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-500/30 shadow-md'
          : 'border-slate-200 dark:border-slate-800',
        onClick && 'cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm',
      )}
    >
      <p className="text-[9px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide truncate">{label}</p>
      <p className={cn('text-sm sm:text-2xl font-bold mt-0.5 sm:mt-1 bg-gradient-to-r bg-clip-text text-transparent break-words leading-tight', colors[color])}>{value}</p>
      {secondaryValue && (
        <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">{secondaryValue}</p>
      )}
      {sub && <p className="text-[9px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 line-clamp-2 sm:line-clamp-3">{sub}</p>}
      {footer}
    </Tag>
  );
}

function LoanPaymentsDashboardFooter({ monthlyInterest, monthlyPrincipal, interestPaid }) {
  return (
    <div className="mt-2 sm:mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
      <div className="grid grid-cols-2 gap-1 sm:gap-2">
        <div className="min-w-0 text-left">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-slate-400 leading-tight">This month</p>
          <p className="text-[10px] sm:text-xs font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums leading-tight">
            Int {formatIndianCurrency(monthlyInterest, false)}
          </p>
          <p className="text-[9px] sm:text-[10px] text-slate-500 tabular-nums leading-tight">
            Prin {formatIndianCurrency(monthlyPrincipal, false)}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-slate-400 leading-tight">Interest paid</p>
          <p className="text-[10px] sm:text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums leading-tight">
            {formatIndianCurrency(interestPaid)}
          </p>
          <p className="text-[9px] sm:text-[10px] text-slate-500 leading-tight">lifetime</p>
        </div>
      </div>
    </div>
  );
}

function LoanClosingDashboardFooter({ featured }) {
  if (!featured || featured.isClosed) return null;
  const originalLeft = featured.originalEmiPayoffMonths ?? featured.scheduleTimeRemainingMonths ?? 0;
  const afterPrepayLeft = featured.afterPrepayPayoffMonths ?? featured.actualPayoffMonths ?? 0;
  const paceLeft = featured.pacePayoffMonths ?? featured.actualPayoffMonths ?? 0;
  const paceDelta = featured.monthsSavedVsPace ?? 0;
  const prepaySaved = featured.monthsSavedVsSchedule ?? 0;

  return (
    <div className="mt-2 sm:mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        <div className="min-w-0 text-left">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-slate-400 leading-tight">Original EMI</p>
          <p className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums leading-tight">
            {formatDuration(originalLeft)}
          </p>
        </div>
        <div className="min-w-0 text-center">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-slate-400 leading-tight">After prepay</p>
          <p className="text-[10px] sm:text-xs font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums leading-tight">
            {formatDuration(afterPrepayLeft)}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-slate-400 leading-tight">Your pace</p>
          <p className="text-[10px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight">
            {formatDuration(paceLeft)}
          </p>
        </div>
      </div>
      <p className="text-[8px] sm:text-[10px] text-slate-500 leading-snug">
        {paceDelta > 0
          ? `${formatDuration(paceDelta)} sooner at avg ${formatIndianCurrency(featured.averageMonthlyPayment || 0, false)}/mo`
          : paceDelta < 0
            ? `${formatDuration(Math.abs(paceDelta))} longer at current pace`
            : prepaySaved > 0
              ? `${formatDuration(prepaySaved)} saved by prepays`
              : 'Same as bank EMI pace'}
      </p>
    </div>
  );
}

function LoanStatCell({ label, value, sub, valueClassName, onClick, subClassName }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'p-2 sm:p-3 text-center min-w-0',
        onClick && 'cursor-pointer hover:bg-white/60 dark:hover:bg-slate-800/40 transition-colors',
      )}
    >
      <p className="text-[9px] sm:text-[10px] uppercase text-slate-500 truncate">{label}</p>
      <p className={cn('text-xs sm:text-lg font-bold leading-tight mt-0.5 break-words', valueClassName)}>{value}</p>
      {sub && (
        <p className={cn('text-[9px] sm:text-[10px] text-slate-500 mt-0.5 leading-snug', subClassName ?? 'truncate')}>
          {sub}
        </p>
      )}
    </Tag>
  );
}

function useIsSmUp() {
  const [matches, setMatches] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 640px)').matches : true
  ));
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return matches;
}

function EmiBreakdownPanel({ items, total, interestPaidTotal = 0 }) {
  if (items.length === 0) {
    return (
      <Card className="!p-4 border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20">
        <p className="text-sm text-slate-500 text-center">No active monthly payments</p>
      </Card>
    );
  }
  const totals = items.reduce((acc, item) => ({
    interest: acc.interest + item.interest,
    principal: acc.principal + item.principal,
    extra: acc.extra + item.extra,
    dailyInterest: acc.dailyInterest + (item.dailyInterest || 0),
    interestPaid: acc.interestPaid + (item.interestPaid || 0),
  }), { interest: 0, principal: 0, extra: 0, dailyInterest: 0, interestPaid: 0 });
  const lifetimeInterest = interestPaidTotal || totals.interestPaid;

  return (
    <Card className="!p-0 overflow-hidden border-indigo-200 dark:border-indigo-800 animate-fade-in">
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/80 dark:bg-indigo-950/30">
        <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">Monthly payment split by loan</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {formatIndianCurrency(total, false)}/mo total · {formatIndianCurrency(totals.interest, false)} interest · {formatIndianCurrency(totals.principal, false)} principal
          {totals.extra > 0 && ` · +${formatIndianCurrency(totals.extra, false)} extra`}
          {totals.dailyInterest > 0 && ` · ${formatIndianCurrency(totals.dailyInterest, false)}/day`}
          {lifetimeInterest > 0 && ` · ${formatIndianCurrency(lifetimeInterest)} interest paid`}
        </p>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((item) => {
          const typeInfo = LOAN_TYPES[item.loanType] || LOAN_TYPES.other;
          return (
            <div key={item.id} className="px-3 sm:px-4 py-2.5 sm:py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: `${typeInfo.color}20`, color: typeInfo.color }}>
                      {typeInfo.label}
                    </span>
                    {item.hasManualEmi && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">
                        Manual
                      </span>
                    )}
                    {item.isClosed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                        Closed
                      </span>
                    )}
                  </div>
                  {item.lender && <p className="text-xs text-slate-500 truncate">{item.lender}</p>}
                  {item.hasManualEmi && item.scheduledEmi !== item.payment && item.payment > 0 && (
                    <p className="text-[10px] text-slate-500 mt-0.5">Bank EMI {formatIndianCurrency(item.scheduledEmi, false)}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-indigo-600 dark:text-indigo-400">
                    {item.payment > 0 ? formatIndianCurrency(item.payment, false) : '—'}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {item.payment > 0 ? `${formatPercent(item.pct, 1)} of outflow` : 'no EMI'}
                  </p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] sm:text-xs">
                <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 px-2 py-1.5 text-center">
                  <p className="text-slate-500">Daily interest</p>
                  <p className="font-semibold text-rose-700 dark:text-rose-400">
                    {item.dailyInterest > 0 ? `${formatIndianCurrency(item.dailyInterest, false)}/day` : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 text-center">
                  <p className="text-slate-500">Interest /mo</p>
                  <p className="font-semibold text-amber-700 dark:text-amber-400">{formatIndianCurrency(item.interest, false)}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1.5 text-center">
                  <p className="text-slate-500">Principal</p>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">{formatIndianCurrency(item.principal, false)}</p>
                  <p className={`text-[9px] mt-0.5 font-medium ${item.extra > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                    Extra {item.extra > 0 ? `+${formatIndianCurrency(item.extra, false)}` : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 px-2 py-1.5 text-center">
                  <p className="text-slate-500">Interest paid</p>
                  <p className="font-semibold text-orange-700 dark:text-orange-400">
                    {item.interestPaid > 0 ? formatIndianCurrency(item.interestPaid) : '—'}
                  </p>
                  {item.interestPaidPct > 0 && (
                    <p className="text-[9px] text-slate-400 mt-0.5">{formatPercent(item.interestPaidPct, 0)} of total</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function LoanClosingBreakdownPanel({ items, defaultLoanId, onSetDefault }) {
  const [pendingDefault, setPendingDefault] = useState(null);

  if (items.length === 0) {
    return (
      <Card className="!p-4 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
        <p className="text-sm text-slate-500 text-center">No EMI loans to show closing timeline</p>
      </Card>
    );
  }
  const active = items.filter((item) => !item.isClosed);
  return (
    <Card className="!p-0 overflow-hidden border-emerald-200 dark:border-emerald-800 animate-fade-in">
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 dark:border-slate-800 bg-emerald-50/80 dark:bg-emerald-950/30">
        <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">Loan closing by loan</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {active.length > 0
            ? `${active.length} active · mark a loan as default for the top card`
            : 'All EMI loans paid off'}
        </p>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((item) => {
          const typeInfo = LOAN_TYPES[item.loanType] || LOAN_TYPES.other;
          const closed = item.isClosed;
          const isDefault = loanIdsMatch(defaultLoanId, item.id);
          return (
            <div key={item.id} className={cn('px-3 sm:px-4 py-2.5 sm:py-3', isDefault && 'bg-emerald-50/60 dark:bg-emerald-950/20')}>
              <div className="flex items-start gap-2 sm:gap-3 mb-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: `${typeInfo.color}20`, color: typeInfo.color }}>
                      {typeInfo.label}
                    </span>
                    {isDefault && (
                      <span className="inline-flex flex-nowrap items-center gap-0.5 whitespace-nowrap shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium leading-none">
                        <Star className="w-3 h-3 fill-current shrink-0" aria-hidden />
                        <span>Default</span>
                      </span>
                    )}
                    {closed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">
                        Paid off
                      </span>
                    )}
                  </div>
                  {item.lender && <p className="text-xs text-slate-500 truncate">{item.lender}</p>}
                </div>
                {!isDefault && (
                  <Btn
                    size="sm"
                    variant="ghost"
                    className="shrink-0 !inline-flex !flex-nowrap items-center gap-0.5 !px-1.5 sm:!px-2 text-[10px] sm:text-xs leading-none"
                    onClick={() => setPendingDefault(item)}
                  >
                    <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" aria-hidden />
                    <span className="whitespace-nowrap hidden sm:inline">Set default</span>
                    <span className="whitespace-nowrap sm:hidden">Default</span>
                  </Btn>
                )}
              </div>
              {closed ? (
                <p className="text-xs text-slate-500">
                  Original tenure {formatDuration(item.totalEmis)}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-[10px] sm:text-xs">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2 py-1.5 text-center">
                    <p className="text-slate-500">Original EMI</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{formatDuration(item.originalEmiPayoffMonths ?? item.scheduleTimeRemainingMonths)}</p>
                  </div>
                  <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1.5 text-center">
                    <p className="text-slate-500">After prepay</p>
                    <p className="font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">{formatDuration(item.afterPrepayPayoffMonths ?? item.actualPayoffMonths)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1.5 text-center">
                    <p className="text-slate-500">Your pace</p>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatDuration(item.pacePayoffMonths ?? item.actualPayoffMonths)}</p>
                  </div>
                </div>
              )}
              {!closed && (item.monthsSavedVsPace > 0 || item.monthsSavedVsSchedule > 0) && (
                <p className="text-[10px] text-teal-700 dark:text-teal-400 mt-2 text-right">
                  {item.monthsSavedVsPace > 0
                    ? `${formatDuration(item.monthsSavedVsPace)} sooner at avg ${formatIndianCurrency(item.averageMonthlyPayment || 0, false)}/mo`
                    : `${formatDuration(item.monthsSavedVsSchedule)} earlier from prepays`}
                </p>
              )}
              {!closed && !(item.monthsSavedVsPace > 0) && !(item.monthsSavedVsSchedule > 0) && (
                <p className="text-[10px] text-slate-500 mt-2 text-right">
                  {item.monthsSavedVsPace < 0
                    ? `${formatDuration(Math.abs(item.monthsSavedVsPace))} longer at current pace`
                    : 'Same pace as bank EMI'}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        open={!!pendingDefault}
        message={`set "${pendingDefault?.name || 'this loan'}" as the default for Loan closing`}
        detail="The top Loan closing card will show this loan's closing timeline."
        confirmLabel="Set as default"
        onConfirm={() => {
          onSetDefault(pendingDefault.id);
          setPendingDefault(null);
        }}
        onCancel={() => setPendingDefault(null)}
      />
    </Card>
  );
}

function buildChangeRows(pairs) {
  return pairs
    .map((row) => {
      if (Array.isArray(row)) {
        const [label, before, after] = row;
        return { label, before: before ?? '—', after: after ?? '—' };
      }
      return { label: row.label, before: row.before ?? '—', after: row.after ?? '—' };
    })
    .filter((r) => String(r.before) !== String(r.after));
}

/** Read-only summary of what will change — confirm via the parent action button */
function ChangeReviewPanel({ title, rows }) {
  const changedRows = buildChangeRows(rows);
  if (changedRows.length === 0) return null;

  return (
    <div className="my-3 p-4 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
        <h4 className="font-semibold text-sm text-amber-900 dark:text-amber-200">{title}</h4>
      </div>
      <div className="space-y-2">
        {changedRows.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-2 text-sm py-2 px-3 rounded-lg bg-white/60 dark:bg-slate-900/40">
            <span className="text-slate-500 col-span-1">{row.label}</span>
            <span className="text-slate-600 dark:text-slate-400 line-through">{row.before}</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{row.after}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricBox({ label, value, sub, accent, onClick, active }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'p-2 sm:p-3 rounded-lg sm:rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 min-w-0 text-left w-full',
        onClick && 'cursor-pointer hover:border-teal-300 dark:hover:border-teal-700 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition-colors',
        active && 'border-teal-400 dark:border-teal-600 ring-2 ring-teal-500/20 bg-teal-50/70 dark:bg-teal-950/30',
      )}
    >
      <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-500 font-medium truncate">{label}</p>
      <p className={cn('text-sm sm:text-lg font-bold mt-0.5 leading-tight break-words', accent || 'text-slate-800 dark:text-slate-100')}>{value}</p>
      {sub && <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 line-clamp-2">{sub}</p>}
    </Tag>
  );
}

function CompactMetricTable({ rows, className }) {
  return (
    <div className={cn('sm:hidden overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30', className)}>
      <table className="w-full text-[11px]">
        <tbody>
          {rows.map((row) => {
            const clickable = typeof row.onClick === 'function';
            return (
              <tr
                key={row.label}
                onClick={row.onClick}
                className={cn(
                  'border-t border-slate-100 dark:border-slate-800 first:border-t-0',
                  clickable && 'cursor-pointer active:bg-teal-50/80 dark:active:bg-teal-950/30',
                  clickable && row.active && 'bg-teal-50/70 dark:bg-teal-950/30',
                )}
              >
                <td className={cn('px-2.5 py-1.5 font-medium align-top w-[44%]', clickable ? 'text-teal-700 dark:text-teal-300' : 'text-slate-500')}>
                  {row.label}
                  {clickable && (
                    <span className="block text-[9px] font-normal text-teal-600/80 dark:text-teal-400/80 mt-0.5">
                      {row.active ? 'Hide' : 'Timeline'}
                    </span>
                  )}
                </td>
                <td className={cn('px-2.5 py-1.5 text-right font-semibold tabular-nums align-top', row.accent || 'text-slate-800 dark:text-slate-100')}>
                  <div>{row.value}</div>
                  {row.sub && <div className="text-[10px] font-normal text-slate-500 mt-0.5 leading-snug">{row.sub}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LoanDetailsMetrics({ stats, showClosingTimeline = false, onToggleClosingTimeline }) {
  const rows = [
    { label: 'EMI Principal', value: formatIndianCurrency(stats.emiPrincipal), sub: stats.emiBasis === 'sanctioned' ? 'Sanctioned basis' : 'Disbursed basis' },
    { label: 'Disbursed', value: formatIndianCurrency(stats.disbursed) },
    { label: 'EMIs Elapsed', value: `${stats.emisPaid} / ${stats.totalEmis}`, sub: `${stats.remainingEmis} on schedule · auto` },
    { label: 'Principal Paid', value: formatIndianCurrency(stats.principalPaid), accent: 'text-emerald-600' },
    { label: 'Interest Paid', value: formatIndianCurrency(stats.interestPaid), accent: 'text-amber-600' },
    { label: 'Remaining Interest', value: formatIndianCurrency(stats.remainingInterest || 0), accent: 'text-orange-500' },
    {
      label: 'Prepayments',
      value: formatIndianCurrency(stats.prepaymentTotal),
      sub: `${stats.prepaymentCount} payment(s)`,
      accent: 'text-teal-600',
      onClick: onToggleClosingTimeline,
      active: showClosingTimeline,
    },
    ...(toNum(stats.undisbursed) > 0
      ? [{ label: 'Undisbursed', value: formatIndianCurrency(stats.undisbursed), accent: 'text-amber-500' }]
      : []),
  ];

  return (
    <div className="space-y-2">
      <CompactMetricTable rows={rows} />
      <div className="hidden sm:grid sm:grid-cols-4 gap-2 sm:gap-3">
        {rows.map((row) => (
          <MetricBox
            key={row.label}
            label={row.label}
            value={row.value}
            sub={row.sub}
            accent={row.accent}
            onClick={row.onClick}
            active={row.active}
          />
        ))}
      </div>
      {showClosingTimeline && (
        <div className="animate-fade-in w-full">
          <LoanClosingTimelineCard stats={stats} />
        </div>
      )}
    </div>
  );
}

function LoanClosingTimelineCard({ stats }) {
  const closed = stats.isClosed;
  const originalLeft = Math.max(0, stats.originalEmiPayoffMonths ?? stats.scheduleTimeRemainingMonths ?? 0);
  const afterPrepayLeft = Math.max(0, stats.afterPrepayPayoffMonths ?? stats.actualPayoffMonths ?? 0);
  const paceLeft = Math.max(0, stats.pacePayoffMonths ?? stats.actualPayoffMonths ?? 0);
  const paceDelta = stats.monthsSavedVsPace ?? (afterPrepayLeft - paceLeft);
  const prepaySaved = Math.max(0, stats.monthsSavedVsSchedule || 0);
  const maxLeft = Math.max(originalLeft, afterPrepayLeft, paceLeft, 1);
  const paceBarPct = Math.min(100, Math.max(8, (paceLeft / maxLeft) * 100));

  if (closed) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/20 animate-fade-in">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        <p className="text-[11px] sm:text-xs text-emerald-700 dark:text-emerald-300">
          Paid off · original {formatDuration(stats.totalEmis)}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-teal-200/70 dark:border-teal-800/50 bg-gradient-to-r from-teal-50/50 via-white to-indigo-50/40 dark:from-teal-950/20 dark:via-slate-900/40 dark:to-indigo-950/20 px-2.5 py-2 animate-fade-in">
      <div className="grid grid-cols-3 gap-2">
        <div className="min-w-0 text-left">
          <p className="text-[9px] uppercase tracking-wider text-slate-400">Original EMI</p>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums leading-tight">
            {formatDuration(originalLeft)}
          </p>
        </div>
        <div className="min-w-0 text-center">
          <p className="text-[9px] uppercase tracking-wider text-slate-400">After prepay</p>
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums leading-tight">
            {formatDuration(afterPrepayLeft)}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[9px] uppercase tracking-wider text-slate-400">Your pace</p>
          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight">
            {formatDuration(paceLeft)}
          </p>
        </div>
      </div>

      <div className="mt-1.5 h-1 rounded-full bg-slate-200/80 dark:bg-slate-700/80 overflow-hidden relative">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
          style={{ width: `${paceBarPct}%` }}
        />
      </div>

      <p className="mt-1 text-[10px] text-slate-500 leading-snug">
        {paceDelta > 0
          ? `${formatDuration(paceDelta)} sooner at avg ${formatIndianCurrency(stats.averageMonthlyPayment || stats.monthlyPayment || 0, false)}/mo`
          : paceDelta < 0
            ? `${formatDuration(Math.abs(paceDelta))} longer at current pace`
            : prepaySaved > 0
              ? `${formatDuration(prepaySaved)} saved by prepays · same as bank EMI going forward`
              : 'On track with bank EMI'}
      </p>
    </div>
  );
}

function fmtStat(v, currency = true) {
  return currency ? formatIndianCurrency(v) : String(v);
}

function upsertManualEmiPayment(payments, entry) {
  const idx = payments.findIndex((p) => p.date === entry.date);
  if (idx >= 0) {
    return payments.map((p, i) => (i === idx ? { ...p, ...entry, id: p.id } : p));
  }
  return [...payments, entry].sort((a, b) => new Date(a.date) - new Date(b.date));
}

function ManualEmiPaymentsEditor({ payments, onChange, scheduledEmi, pending, onPendingChange, startDate, genId }) {
  const { minDate, maxDate } = useMemo(
    () => getManualEmiDateBounds({ startDate: startDate || pending.date }),
    [startDate, pending.date],
  );

  const sorted = useMemo(
    () => [...payments].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [payments],
  );

  const addPayment = () => {
    const amt = toNum(pending.amount);
    const date = clampManualEmiDate(pending.date, { startDate: startDate || minDate });
    if (!date || amt <= 0) return;
    onChange(upsertManualEmiPayment(payments, { id: genId(), date, amount: amt }));
    onPendingChange({ date: startDate || minDate, amount: '' });
  };

  const removePayment = (id) => onChange(payments.filter((p) => p.id !== id));

  const hasPending = pending.date && toNum(pending.amount) > 0;
  const pendingClamped = pending.date ? clampManualEmiDate(pending.date, { startDate: startDate || minDate }) : '';

  return (
    <div className="col-span-2 space-y-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
      <div>
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Actual EMI amount (optional)</p>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
          From loan start through the date you pick, every EMI month uses this amount. Add a new date when your payment changes.
          Bank EMI is {formatIndianCurrency(scheduledEmi, false)}.
        </p>
      </div>

      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/80 dark:bg-slate-900/80 text-left">
                <th className="px-2 py-1.5 font-medium text-slate-500">Through date</th>
                <th className="px-2 py-1.5 font-medium text-slate-500 text-right">You pay / mo</th>
                <th className="px-2 py-1.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">{p.date}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{formatIndianCurrency(p.amount, false)}</td>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => removePayment(p.id)} className="text-red-500 hover:text-red-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <InputField
          label="Through date"
          type="date"
          value={pendingClamped || pending.date}
          onChange={(v) => onPendingChange({
            ...pending,
            date: clampManualEmiDate(v, { startDate: startDate || minDate }),
          })}
          min={minDate}
          max={maxDate}
        />
        <InputField
          label="Monthly amount"
          type="number"
          value={pending.amount}
          onChange={(v) => onPendingChange({ ...pending, amount: v })}
          suffix="₹"
          placeholder={scheduledEmi > 0 ? String(scheduledEmi) : ''}
        />
      </div>
      <p className="text-[10px] text-slate-500">
        Date from {minDate} to today ({maxDate}). Defaults to loan start.
      </p>
      {hasPending && (
        <p className="text-[10px] text-amber-700 dark:text-amber-400">
          {formatIndianCurrency(toNum(pending.amount), false)}/mo through {pendingClamped || pending.date} — saved on Add or Save loan
        </p>
      )}
      <Btn size="sm" variant="secondary" onClick={addPayment} disabled={!pending.date || toNum(pending.amount) <= 0}>
        <Plus className="w-3 h-3 inline mr-1" />Add schedule
      </Btn>
    </div>
  );
}

function buildLoanShareText(loan, stats, isRevolving) {
  const typeLabel = LOAN_TYPES[loan.loanType]?.label || loan.loanType || '—';
  const lines = [
    `Loan: ${loan.name || 'Unnamed'}`,
    `Lender: ${loan.lender || '—'}`,
    `Type: ${typeLabel}`,
  ];

  if (isRevolving) {
    lines.push(
      `Credit limit: ${formatIndianCurrency(loan.creditLimit || loan.totalSanctioned)}`,
      `Outstanding: ${formatIndianCurrency(loan.statementBalance ?? loan.loanAmount)}`,
      `Min. due: ${formatIndianCurrency(loan.minDue, false)}`,
      `Interest rate: ${formatRate(loan.interestRate)}`,
      `Due date: ${loan.dueDate || '—'}`,
    );
    if (toNum(loan.manualEmi) > 0) {
      lines.push(`Actual payment: ${formatIndianCurrency(loan.manualEmi, false)}/mo`);
    }
  } else {
    lines.push(
      `Sanctioned: ${formatIndianCurrency(loan.totalSanctioned)}`,
      `Disbursed: ${formatIndianCurrency(stats?.disbursed ?? loan.disbursedAmount ?? loan.loanAmount)}`,
      `Outstanding: ${formatIndianCurrency(stats?.outstanding ?? 0)}`,
      `Interest rate: ${formatRate(loan.interestRate)}`,
      `Tenure: ${loan.tenureMonths || 0} months (${formatDuration(loan.tenureMonths)})`,
      `Start date: ${loan.startDate || '—'}`,
      `EMI day: ${getEmiDay(loan)} of each month`,
      `First EMI: ${getFirstEmiDate(loan) || '—'}`,
      `EMI basis: ${EMI_BASIS[loan.emiBasis || 'disbursed']?.label || 'Disbursed'}`,
      `Bank EMI: ${formatIndianCurrency(stats?.emi ?? stats?.scheduledEmi ?? 0, false)}/mo`,
    );
    if (stats?.hasManualEmi) {
      lines.push(`You pay: ${formatIndianCurrency(stats.monthlyPayment, false)}/mo`);
    }
    if (stats && !stats.isClosed) {
      lines.push(
        `Original EMI closing: ${formatDuration(stats.originalEmiPayoffMonths ?? stats.scheduleTimeRemainingMonths)}`,
        `After prepay closing: ${formatDuration(stats.afterPrepayPayoffMonths ?? stats.actualPayoffMonths)}`,
        `Your pace closing: ${formatDuration(stats.pacePayoffMonths ?? stats.actualPayoffMonths)} (avg ${formatIndianCurrency(stats.averageMonthlyPayment || stats.monthlyPayment || 0, false)}/mo)`,
      );
    } else if (stats?.isClosed) {
      lines.push('Status: Paid off');
    }
    const prepays = getPrepayments(loan);
    if (prepays.length > 0) {
      const total = prepays.reduce((s, p) => s + toNum(p.amount), 0);
      lines.push(`Prepayments: ${prepays.length} · ${formatIndianCurrency(total, false)} total`);
    }
    const disbs = getDisbursements(loan);
    if (disbs.length > 1) {
      lines.push(`Disbursement draws: ${disbs.length}`);
    }
  }

  lines.push(`Shared on: ${todayYmd()}`);
  return lines.join('\n');
}

function LoanEditModal({ loan, onSave, onClose, genId }) {
  const defaultEmiDate = (l) => l.startDate || todayYmd();
  const [draft, setDraft] = useState(normalizeLoan(loan));
  const [pendingEmi, setPendingEmi] = useState(() => ({ date: defaultEmiDate(loan), amount: '' }));
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const type = draft.loanType;
  const isRevolving = type === 'credit_card' || type === 'bill';
  const set = (field, value) => setDraft((d) => ({ ...d, [field]: value }));

  useEffect(() => {
    const normalized = normalizeLoan(loan);
    setDraft(normalized);
    setPendingEmi({ date: defaultEmiDate(normalized), amount: '' });
    setShowSaveConfirm(false);
    setCopied(false);
  }, [loan.id]);

  const handleCopyDetails = async () => {
    try {
      const saved = buildSaved();
      const stats = computeLoanStats(saved);
      const text = buildLoanShareText(saved, stats, isRevolving);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const collectManualEmiPayments = () => {
    let list = (draft.manualEmiPayments || [])
      .filter((p) => toNum(p.amount) > 0 && p.date)
      .map((p) => ({
        ...p,
        date: clampManualEmiDate(p.date, draft),
        amount: Math.round(toNum(p.amount)),
      }));
    const amt = toNum(pendingEmi.amount);
    if (pendingEmi.date && amt > 0) {
      const date = clampManualEmiDate(pendingEmi.date, draft);
      list = upsertManualEmiPayment(list, { id: genId(), date, amount: amt });
    }
    return list;
  };

  const previewEmi = useMemo(() => {
    if (isRevolving) return toNum(draft.minDue);
    return Math.round(calculateEMI(getEmiPrincipal(draft), draft.interestRate, draft.tenureMonths));
  }, [draft, isRevolving]);

  const emiPrincipalPreview = useMemo(() => getEmiPrincipal(draft), [draft]);
  const disbursedPreview = useMemo(() => getDisbursedPrincipal(draft), [draft]);
  const undisbursedPreview = Math.max(0, toNum(draft.totalSanctioned) - disbursedPreview);
  const sanctionedAmount = toNum(draft.totalSanctioned);
  const disbursedExceedsSanctioned = !isRevolving && sanctionedAmount > 0 && disbursedPreview > sanctionedAmount;
  const tenureExceedsMax = !isRevolving && toNum(draft.tenureMonths) > MAX_TENURE_MONTHS;
  const saveBlocked = disbursedExceedsSanctioned || tenureExceedsMax;

  const buildSaved = () => {
    const numericFields = isRevolving
      ? ['creditLimit', 'totalSanctioned', 'statementBalance', 'loanAmount', 'disbursedAmount', 'minDue', 'manualEmi', 'interestRate']
      : ['totalSanctioned', 'loanAmount', 'disbursedAmount', 'interestRate', 'tenureMonths'];
    const cleaned = sanitizeNumbers({ ...draft }, numericFields);
    const sanctioned = toNum(cleaned.totalSanctioned);
    const disbursedRaw = toNum(cleaned.disbursedAmount) || toNum(cleaned.loanAmount);
    const disbursed = sanctioned > 0 ? Math.min(disbursedRaw, sanctioned) : disbursedRaw;
    const tenure = Math.min(Math.max(1, toNum(cleaned.tenureMonths) || 60), MAX_TENURE_MONTHS);

    let disbursements = (draft.disbursements || []).filter((d) => toNum(d.amount) > 0 && d.date);
    if (disbursements.length === 0 && disbursed > 0 && draft.startDate) {
      disbursements = [{
        id: genId(),
        date: draft.startDate,
        amount: Math.round(disbursed),
      }];
    }

    const disbursedTotal = disbursements.reduce((s, d) => s + toNum(d.amount), 0) || disbursed;

    return normalizeLoan({
      ...draft,
      ...cleaned,
      disbursements,
      disbursedAmount: disbursedTotal,
      loanAmount: disbursedTotal,
      tenureMonths: tenure,
      manualEmiPayments: collectManualEmiPayments(),
      manualEmi: '',
      emisPaid: null,
      emiBasis: draft.emiBasis || 'disbursed',
      emi: previewEmi,
    });
  };

  const paymentPreview = useMemo(() => {
    try {
      const saved = buildSaved();
      const stats = computeLoanStats(saved);
      if (isRevolving) {
        if (!stats.hasManualEmi) return null;
        return {
          monthlyPayment: stats.monthlyPayment,
          interestPortion: stats.monthlyInterest || 0,
          scheduledPrincipal: stats.monthlyScheduledPrincipal || 0,
          extraPrincipal: stats.monthlyExtraPrincipal || 0,
          hasManualEmi: true,
        };
      }
      return computeMonthlyPaymentBreakdown(saved, stats.outstanding, previewEmi, saved.interestRate);
    } catch {
      return null;
    }
  }, [draft, previewEmi, isRevolving]);

  const existingStats = loan.id ? computeLoanStats(normalizeLoan(loan)) : null;
  const newStats = useMemo(() => {
    try { return computeLoanStats(buildSaved()); } catch { return null; }
  }, [draft, previewEmi]);

  const original = useMemo(() => normalizeLoan(loan), [loan]);

  const confirmPairs = useMemo(() => {
    if (!loan.id || !loan.name) return [];
    const saved = buildSaved();
    const pairs = [
      ['Name', original.name, saved.name],
      ['Lender', original.lender, saved.lender],
      ['Loan Type', LOAN_TYPES[original.loanType]?.label, LOAN_TYPES[saved.loanType]?.label],
    ];

    if (isRevolving) {
      pairs.push(
        ['Credit Limit', fmtStat(original.creditLimit || original.totalSanctioned), fmtStat(saved.creditLimit || saved.totalSanctioned)],
        ['Outstanding', fmtStat(original.statementBalance ?? original.loanAmount), fmtStat(saved.statementBalance ?? saved.loanAmount)],
        ['Min. Due', fmtStat(original.minDue, false), fmtStat(saved.minDue, false)],
        ['Actual payment', fmtStat(original.manualEmi, false) || '—', fmtStat(saved.manualEmi, false) || '—'],
        ['Monthly outflow', fmtStat(getLoanMonthlyOutflow(computeLoanStats(original)), false), fmtStat(getLoanMonthlyOutflow(computeLoanStats(saved)), false)],
        ['Interest Rate', formatRate(original.interestRate), formatRate(saved.interestRate)],
        ['Due Date', original.dueDate || '—', saved.dueDate || '—'],
      );
    } else if (loan.id && loan.name) {
      const saved = buildSaved();
      pairs.push(
        ['Actual EMI payments', formatManualEmiPaymentsSummary(original), formatManualEmiPaymentsSummary(saved)],
      );
      if (newStats && existingStats) {
        pairs.push(
          ['Sanctioned', fmtStat(original.totalSanctioned), fmtStat(saved.totalSanctioned)],
          ['Disbursed', fmtStat(original.disbursedAmount || original.loanAmount), fmtStat(saved.disbursedAmount)],
          ['Interest Rate', formatRate(original.interestRate), formatRate(saved.interestRate)],
          ['Tenure', `${original.tenureMonths} mo`, `${saved.tenureMonths} mo`],
          ['Start Date', original.startDate || '—', saved.startDate || '—'],
          ['EMI Date', `Day ${getEmiDay(original)}`, `Day ${getEmiDay(saved)}`],
          ['First EMI', getFirstEmiDate(original) || '—', getFirstEmiDate(saved) || '—'],
          ['EMI Basis', EMI_BASIS[original.emiBasis || 'disbursed']?.label, EMI_BASIS[saved.emiBasis || 'disbursed']?.label],
          ['Bank EMI', fmtStat(existingStats.emi, false), fmtStat(newStats.emi, false)],
          ['Monthly outflow', fmtStat(getLoanMonthlyOutflow(existingStats), false), fmtStat(getLoanMonthlyOutflow(newStats), false)],
          ['Outstanding', fmtStat(existingStats.outstanding), fmtStat(newStats.outstanding)],
          ['Original EMI closing', formatDuration(existingStats.scheduleTimeRemainingMonths), formatDuration(newStats.scheduleTimeRemainingMonths)],
          ['After prepay closing', formatDuration(existingStats.actualPayoffMonths), formatDuration(newStats.actualPayoffMonths)],
          ['Your pace closing', formatDuration(existingStats.pacePayoffMonths ?? existingStats.actualPayoffMonths), formatDuration(newStats.pacePayoffMonths ?? newStats.actualPayoffMonths)],
        );
      }
    }

    return pairs;
  }, [original, draft, previewEmi, newStats, existingStats, isRevolving, loan.id, loan.name, pendingEmi]);

  const confirmRows = useMemo(() => buildChangeRows(confirmPairs), [confirmPairs]);

  const isNewLoan = !loan.id || !loan.name;
  const savedPreview = useMemo(() => buildSaved(), [draft, previewEmi, pendingEmi, isRevolving]);

  const handleSaveClick = () => {
    if (saveBlocked) return;
    setShowSaveConfirm(true);
  };

  const handleConfirmSave = () => {
    onSave(savedPreview);
    setShowSaveConfirm(false);
    onClose();
  };

  const saveConfirmDetail = useMemo(() => {
    const parts = [];
    if (draft.name) parts.push(draft.name);
    const emiCount = getManualEmiPayments(savedPreview).length;
    if (emiCount > 0) parts.push(`${emiCount} actual EMI payment${emiCount !== 1 ? 's' : ''}`);
    if (confirmRows.length > 0) parts.push(`${confirmRows.length} field change${confirmRows.length !== 1 ? 's' : ''}`);
    return parts.join(' · ') || 'Your loan details will be updated';
  }, [draft.name, savedPreview, confirmRows.length]);

  const footerLabel = isNewLoan ? 'Save Loan' : 'Save Loan';

  return createPortal(
    <>
      <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <div
          className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[min(92dvh,100%)] sm:max-h-[90vh] shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 flex items-center justify-between gap-2 p-3 sm:p-5 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-base sm:text-lg min-w-0 truncate">{loan.id && loan.name ? 'Edit Loan' : 'Add Loan'}</h3>
            <div className="flex items-center gap-1 shrink-0">
              <Btn
                type="button"
                size="sm"
                variant="ghost"
                className="!px-2 inline-flex items-center gap-1 whitespace-nowrap"
                onClick={handleCopyDetails}
                title="Copy all loan details"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span className="text-xs hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
              </Btn>
              <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-3 sm:space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Loan Name" value={draft.name} onChange={(v) => set('name', v)} />
            <InputField label="Lender" value={draft.lender} onChange={(v) => set('lender', v)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Loan Type</label>
            <select value={type} onChange={(e) => set('loanType', e.target.value)} className="w-full">
              {Object.entries(LOAN_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {isRevolving ? (
            <div className="grid grid-cols-2 gap-3">
              <InputField label={type === 'credit_card' ? 'Credit Limit' : 'Bill Amount'} type="number" value={draft.creditLimit || draft.totalSanctioned} onChange={(v) => { set('creditLimit', v); set('totalSanctioned', v); }} suffix="₹" />
              <InputField label="Outstanding Balance" type="number" value={draft.statementBalance ?? draft.loanAmount} onChange={(v) => { set('statementBalance', v); set('loanAmount', v); set('disbursedAmount', v); }} suffix="₹" />
              <InputField label="Min. Due / EMI" type="number" value={draft.minDue} onChange={(v) => set('minDue', v)} suffix="₹" />
              <InputField label="Actual payment (optional)" type="number" value={draft.manualEmi ?? ''} onChange={(v) => set('manualEmi', v)} suffix="₹" placeholder="If you pay more than min due" />
              {paymentPreview && paymentPreview.hasManualEmi && (
                <div className="col-span-2 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/20">
                  <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    You pay {formatIndianCurrency(paymentPreview.monthlyPayment, false)}/mo
                    {paymentPreview.extraPrincipal > 0 && ` (+${formatIndianCurrency(paymentPreview.extraPrincipal, false)} above min due)`}
                  </p>
                </div>
              )}
              <InputField label="Interest Rate" type="number" value={draft.interestRate} onChange={(v) => set('interestRate', v)} suffix="% p.a." step={0.01} showWords={false} emptyZero={false} />
              <InputField label="Due Date" type="date" value={draft.dueDate || ''} onChange={(v) => set('dueDate', v)} className="col-span-2" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <InputField
                label="Sanctioned Amount"
                type="number"
                value={draft.totalSanctioned}
                onChange={(v) => {
                  set('totalSanctioned', v);
                  const d = toNum(draft.disbursedAmount);
                  if (toNum(v) > 0 && d > toNum(v)) set('disbursedAmount', v);
                }}
                suffix="₹"
              />
              {(draft.disbursements || []).length > 0 ? (
                <div className="col-span-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Disbursed so far</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatIndianCurrency(disbursedPreview)}</p>
                  {sanctionedAmount > 0 && (
                    <p className="text-xs text-slate-500">
                      {formatPercent(getDisbursementProgressPct(draft), 1)} of sanctioned ·{' '}
                      {undisbursedPreview > 0
                        ? `${formatIndianCurrency(undisbursedPreview)} remaining`
                        : 'Fully disbursed'}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-500">
                    Edit individual draws in the loan&apos;s <span className="font-medium">Disbursements</span> tab (use Edit on each row).
                  </p>
                </div>
              ) : (
                <InputField
                  label="Initial Disbursed Amount"
                  type="number"
                  value={draft.disbursedAmount}
                  onChange={(v) => {
                    const cap = toNum(draft.totalSanctioned);
                    const next = cap > 0 ? Math.min(toNum(v), cap) : toNum(v);
                    set('disbursedAmount', v === '' ? '' : next);
                    set('loanAmount', v === '' ? '' : next);
                  }}
                  suffix="₹"
                />
              )}
              {disbursedExceedsSanctioned && (
                <div className="col-span-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300">
                  Disbursed amount cannot exceed sanctioned amount ({formatIndianCurrency(sanctionedAmount)}).
                </div>
              )}
              {undisbursedPreview > 0 && (
                <div className="col-span-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-800 dark:text-amber-300">
                  Undisbursed: {formatIndianCurrency(undisbursedPreview)} — not included in EMI when using Disbursed basis
                </div>
              )}
              <InputField label="Interest Rate" type="number" value={draft.interestRate} onChange={(v) => set('interestRate', v)} suffix="% p.a." step={0.01} showWords={false} emptyZero={false} />
              <InputField
                label="Tenure"
                type="number"
                value={draft.tenureMonths}
                onChange={(v) => set('tenureMonths', v === '' ? '' : Math.min(toNum(v), MAX_TENURE_MONTHS))}
                suffix="months"
                showWords={false}
                emptyZero={false}
                allowDecimal={false}
              />
              <InputField label="Start Date" type="date" value={draft.startDate} onChange={(v) => {
                set('startDate', v);
                setPendingEmi((p) => ({
                  ...p,
                  date: clampManualEmiDate(p.date || v, { startDate: v }),
                }));
              }} />
              <InputField
                label="EMI Date (day of month)"
                type="number"
                value={draft.emiDay ?? getEmiDay(draft)}
                onChange={(v) => set('emiDay', v === '' ? '' : Math.min(31, Math.max(1, Math.round(toNum(v)))))}
                suffix="of each month"
                showWords={false}
                emptyZero={false}
                allowDecimal={false}
                min={1}
                max={31}
              />
              {draft.startDate && (
                <p className="col-span-2 text-[10px] text-slate-500">
                  First EMI on <span className="font-medium">{getFirstEmiDate(draft) || '—'}</span>
                  {' · '}interest and payment post at 6:00 AM on each EMI date
                </p>
              )}
              {tenureExceedsMax && (
                <div className="col-span-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300">
                  Tenure cannot exceed 35 years ({MAX_TENURE_MONTHS} months).
                </div>
              )}
              <p className="col-span-2 text-[10px] text-slate-500">
                EMIs elapsed: {getPaidEmiCount(draft)} (auto from EMI schedule)
              </p>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Calculate EMI on</label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  {Object.values(EMI_BASIS).map((opt) => {
                    const active = (draft.emiBasis || 'disbursed') === opt.id;
                    const amount = opt.id === 'sanctioned'
                      ? toNum(draft.totalSanctioned)
                      : toNum(draft.disbursedAmount) || toNum(draft.loanAmount);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => set('emiBasis', opt.id)}
                        className={`rounded-lg px-3 py-2.5 text-left transition-all ${
                          active
                            ? 'bg-white dark:bg-slate-900 shadow-sm ring-1 ring-indigo-500/60'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                      >
                        <p className={`text-sm font-semibold ${active ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>
                          {opt.label}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {formatIndianCurrency(amount, false)}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  {(EMI_BASIS[draft.emiBasis || 'disbursed'] || EMI_BASIS.disbursed).description}
                </p>
              </div>

              <div className="col-span-2 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
                <p className="text-xs text-slate-500">Bank EMI on {formatIndianCurrency(emiPrincipalPreview, false)} @ {formatRate(draft.interestRate)}</p>
                <p className="text-xl font-bold text-indigo-600">{previewEmi > 0 ? formatIndianCurrency(previewEmi, false) : '—'}</p>
              </div>
              <ManualEmiPaymentsEditor
                payments={draft.manualEmiPayments || []}
                onChange={(next) => set('manualEmiPayments', next)}
                scheduledEmi={previewEmi}
                pending={pendingEmi}
                onPendingChange={setPendingEmi}
                startDate={draft.startDate}
                genId={genId}
              />
              {paymentPreview && paymentPreview.hasManualEmi && (
                <div className="col-span-2 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/20 space-y-2">
                  <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Your {formatIndianCurrency(paymentPreview.monthlyPayment, false)}/mo splits as:</p>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="text-slate-500">Interest</p>
                      <p className="font-bold text-amber-600">{formatIndianCurrency(paymentPreview.interestPortion, false)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Principal</p>
                      <p className="font-bold text-emerald-600">{formatIndianCurrency(paymentPreview.scheduledPrincipal, false)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">+ Extra</p>
                      <p className="font-bold text-indigo-600">
                        {paymentPreview.extraPrincipal > 0 ? `+${formatIndianCurrency(paymentPreview.extraPrincipal, false)}` : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {showSaveConfirm && confirmRows.length > 0 && (
            <div className="pb-1">
              <ChangeReviewPanel
                title="Review changes before saving"
                rows={confirmPairs}
              />
            </div>
          )}
          </div>
          <div className="shrink-0 flex gap-2 p-3 sm:p-5 pt-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Btn onClick={handleSaveClick} className="flex-1 min-h-[44px]" disabled={saveBlocked}>{footerLabel}</Btn>
            <Btn variant="ghost" onClick={onClose} className="min-h-[44px]">Cancel</Btn>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showSaveConfirm}
        message="Would you like to save this loan?"
        detail={saveConfirmDetail}
        confirmLabel="Yes, save"
        cancelLabel="No, go back"
        onConfirm={handleConfirmSave}
        onCancel={() => setShowSaveConfirm(false)}
      />
    </>,
    document.body,
  );
}

function DisbursementForm({ loan, onConfirm, onCancel, genId }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const maxAllowed = getMaxDisbursementAmount(loan);
  const impact = useMemo(() => {
    const amt = toNum(amount);
    if (amt <= 0 || !date || maxAllowed <= 0) return null;
    return previewPartialDisbursement(loan, amt, date);
  }, [loan, amount, date, maxAllowed]);

  const exceedsLimit = toNum(amount) > maxAllowed && toNum(amount) > 0;
  const canApply = impact && impact.disbursementAmount > 0;

  const handleApply = () => {
    if (!canApply) return;
    if (!showConfirm) { setShowConfirm(true); return; }
    onConfirm({
      id: genId(),
      date,
      amount: impact.disbursementAmount,
      notes: notes.trim() || undefined,
    });
  };

  const reviewRows = canApply
    ? [
        ['Amount', '—', formatIndianCurrency(impact.disbursementAmount)],
        ['Date', '—', date],
        ['Total disbursed', fmtStat(impact.before.disbursed), fmtStat(impact.after.disbursed)],
        ['Outstanding', fmtStat(impact.before.outstanding), fmtStat(impact.after.outstanding)],
        ['Drawn', '—', `${formatPercent(impact.disbursedPct, 1)} of sanctioned`],
      ]
    : [];

  if (maxAllowed <= 0) {
    return (
      <div className="border-t border-slate-100 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/20">
        <p className="text-sm text-slate-500">Loan is fully disbursed (100% of sanctioned amount).</p>
        <Btn size="sm" variant="ghost" className="mt-3" onClick={onCancel}>Close</Btn>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 dark:border-slate-800 p-4 bg-indigo-50/50 dark:bg-indigo-900/10">
      <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-300 mb-3">Add Disbursement</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <InputField label="Amount" type="number" value={amount} onChange={setAmount} suffix="₹" />
        <InputField label="Date" type="date" value={date} onChange={setDate} />
      </div>
      <InputField label="Notes (optional)" value={notes} onChange={setNotes} className="mb-3" />

      <p className="text-xs text-slate-500 mb-3">
        Max you can draw now: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatIndianCurrency(maxAllowed)}</span>
        {toNum(loan.totalSanctioned) > 0 && (
          <> · {formatPercent(getDisbursementProgressPct(loan), 1)} already disbursed</>
        )}
      </p>

      {exceedsLimit && (
        <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          Cannot disburse more than remaining sanction ({formatIndianCurrency(maxAllowed)}).
        </div>
      )}

      {canApply && (
        <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 mb-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">Debit on statement</span>
            <span className="font-bold text-red-600">+ {formatIndianCurrency(impact.disbursementAmount, false)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">New outstanding</span>
            <span className="font-bold">{formatIndianCurrency(impact.after.outstanding)}</span>
          </div>
          {impact.undisbursedAfter > 0 && (
            <p className="text-xs text-slate-500">Still undisbursed: {formatIndianCurrency(impact.undisbursedAfter)}</p>
          )}
        </div>
      )}

      {showConfirm && canApply && (
        <div className="mb-4">
          <ChangeReviewPanel title="Confirm disbursement" rows={reviewRows} />
        </div>
      )}

      <div className="flex gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-700/80">
        {canApply && (
          <Btn size="sm" onClick={handleApply}>{showConfirm ? 'Confirm disbursement' : 'Review disbursement'}</Btn>
        )}
        <Btn size="sm" variant="ghost" onClick={() => { setShowConfirm(false); onCancel(); }}>Cancel</Btn>
      </div>
    </div>
  );
}

function DisbursementEditModal({ disbursement, loan, onSave, onClose }) {
  const [amount, setAmount] = useState(disbursement.amount ?? '');
  const [date, setDate] = useState(disbursement.date || '');
  const [notes, setNotes] = useState(disbursement.notes || '');
  const [showConfirm, setShowConfirm] = useState(false);

  const impact = useMemo(() => {
    const amt = toNum(amount);
    if (amt <= 0 || !date) return null;
    return previewDisbursementEdit(loan, disbursement.id, amt, date);
  }, [loan, amount, date, disbursement.id]);

  const maxAllowed = impact?.maxAllowed ?? getMaxDisbursementEditAmount(loan, disbursement.id);
  const exceedsLimit = toNum(amount) > maxAllowed && toNum(amount) > 0;
  const canSave = impact && impact.disbursementAmount > 0 && !exceedsLimit;

  const confirmPairs = useMemo(() => [
    ['Amount', formatIndianCurrency(disbursement.amount, false), formatIndianCurrency(amount, false)],
    ['Date', disbursement.date, date],
    ['Notes', disbursement.notes || '—', notes || '—'],
    ['Total disbursed', fmtStat(impact?.before?.disbursed), fmtStat(impact?.after?.disbursed)],
    ['Outstanding', fmtStat(impact?.before?.outstanding), fmtStat(impact?.after?.outstanding)],
  ], [disbursement, amount, date, notes, impact]);

  const handleApply = () => {
    if (!canSave) return;
    if (!showConfirm) { setShowConfirm(true); return; }
    onSave({ amount: impact.disbursementAmount, date, notes: notes.trim() || undefined });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md max-h-[min(92dvh,100%)] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold">Edit draw</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
          <InputField label="Amount" type="number" value={amount} onChange={setAmount} suffix="₹" />
          <InputField label="Date" type="date" value={date} onChange={setDate} />
          <InputField label="Notes" value={notes} onChange={setNotes} />
          <p className="text-xs text-slate-500">
            Max for this draw: <span className="font-semibold">{formatIndianCurrency(maxAllowed)}</span>
            {toNum(loan.totalSanctioned) > 0 && impact && (
              <> · After save: {formatPercent(impact.disbursedPct, 1)} drawn</>
            )}
          </p>
          {exceedsLimit && (
            <p className="text-xs text-red-600">Cannot exceed sanctioned limit ({formatIndianCurrency(maxAllowed)} for this draw).</p>
          )}
          {showConfirm && (
            <ChangeReviewPanel title="Confirm draw update" rows={confirmPairs} />
          )}
        </div>
        <div className="shrink-0 flex gap-2 p-4 sm:p-5 pt-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Btn onClick={handleApply} className="flex-1 min-h-[44px]" disabled={!canSave}>
            {showConfirm ? 'Save changes' : 'Review changes'}
          </Btn>
          <Btn variant="ghost" onClick={() => { setShowConfirm(false); onClose(); }} className="min-h-[44px]">Cancel</Btn>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DisbursementsPanel({ loan, stats, canEdit, showForm, onAdd, onConfirm, onCancel, onEdit, onDelete, pendingDisburseDeleteId, onConfirmDisburseDelete, onCancelDisburseDelete, genId }) {
  const disbursements = useMemo(() => getDisbursements(loan), [loan]);
  const sanctioned = toNum(loan.totalSanctioned);
  const progressPct = getDisbursementProgressPct(loan);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Disbursements</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatIndianCurrency(stats.disbursed)} drawn
            {sanctioned > 0 && ` · ${formatPercent(progressPct, 1)} of ${formatIndianCurrency(sanctioned)}`}
            {stats.undisbursed > 0 && ` · ${formatIndianCurrency(stats.undisbursed)} left`}
          </p>
        </div>
        {canEdit && !showForm && (
          <Btn size="sm" variant="secondary" onClick={onAdd} disabled={stats.undisbursed <= 0}>
            <Banknote className="w-3 h-3 inline mr-1" />Add Disbursement
          </Btn>
        )}
      </div>

      {canEdit && stats.undisbursed <= 0 && disbursements.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          Fully disbursed — use <span className="font-medium">Edit</span> on a row to correct an amount.
        </p>
      )}

      {sanctioned > 0 && (
        <ProgressBar value={progressPct} color="#6366f1" height="h-2" />
      )}

      {disbursements.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs">
                <th className="px-3 py-2 font-medium text-slate-500">Date</th>
                <th className="px-3 py-2 font-medium text-slate-500 text-right">Amount</th>
                <th className="px-3 py-2 font-medium text-slate-500">Notes</th>
                {canEdit && <th className="px-3 py-2 font-medium text-slate-500 text-right w-24">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {disbursements.map((d) => (
                <tr key={d.id || `${d.date}-${d.amount}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 whitespace-nowrap">{d.date}</td>
                  <td className="px-3 py-2 text-right font-medium text-red-600">{formatIndianCurrency(d.amount, false)}</td>
                  <td className="px-3 py-2 text-slate-500">{d.notes || '—'}</td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        <Btn variant="ghost" size="sm" className="!px-2" onClick={() => onEdit(d)} title="Edit draw">
                          <Pencil className="w-3.5 h-3.5" />
                        </Btn>
                        {disbursements.length > 1 && (
                          <Btn variant="ghost" size="sm" className="!px-2" onClick={() => onDelete(d)} title="Remove draw">
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Btn>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-slate-500">No disbursements recorded yet.</p>
      )}

      {disbursements.map((d) => pendingDisburseDeleteId === d.id && (
        <ConfirmDialog
          key={`del-disb-${d.id}`}
          open
          message="remove this draw"
          detail={`${formatIndianCurrency(d.amount, false)} on ${d.date}`}
          variant="danger"
          confirmLabel="Remove"
          onConfirm={() => onConfirmDisburseDelete(d)}
          onCancel={onCancelDisburseDelete}
        />
      ))}

      {showForm && (
        <DisbursementForm loan={loan} onConfirm={onConfirm} onCancel={onCancel} genId={genId} />
      )}
    </div>
  );
}

function PrepaymentForm({ loan, onConfirm, onCancel, genId }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => todayYmd());
  const [showConfirm, setShowConfirm] = useState(false);

  const impact = useMemo(() => {
    const amt = toNum(amount);
    if (amt <= 0 || !date) return null;
    return previewPrepaymentImpact(loan, amt, date);
  }, [loan, amount, date]);

  const maxAllowed = impact?.maxAllowed ?? getMaxPrepaymentAmount(loan, date);
  const exceedsLimit = toNum(amount) > maxAllowed && toNum(amount) > 0;
  const canApply = impact && impact.prepayAmount > 0 && !impact.exceedsOutstanding;

  const timeSkipped = canApply
    ? formatTimeSkipped(impact.monthsSavedEarly)
    : formatTimeSkipped(0);
  // Reducing-balance EMI: remaining interest with vs without this prepay
  const moneySaved = canApply ? Math.round(impact.interestSaved || 0) : 0;

  const handleApply = () => {
    if (!canApply) return;
    if (!showConfirm) { setShowConfirm(true); return; }
    onConfirm({ id: genId(), date, amount: impact.prepayAmount, type: 'prepayment' });
  };

  const reviewRows = canApply
    ? [
        ['Amount', '—', formatIndianCurrency(impact.prepayAmount)],
        ['Date', '—', date],
        ['Days skipped', '—', `${timeSkipped.days} days (${timeSkipped.primary})`],
        ['Interest saved', '—', formatIndianCurrency(moneySaved, false)],
        ['New outstanding', fmtStat(impact.currentOutstanding), fmtStat(impact.newOutstanding)],
      ]
    : [];

  return (
    <div className="rounded-lg sm:rounded-xl border border-teal-200 dark:border-teal-800 p-3 sm:p-4 bg-teal-50/50 dark:bg-teal-900/10 space-y-3">
      <p className="text-sm font-semibold text-teal-800 dark:text-teal-300">Record Prepayment</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InputField label="Prepayment Amount" type="number" value={amount} onChange={(v) => { setAmount(v); setShowConfirm(false); }} suffix="₹" />
        <InputField label="Date Applied" type="date" value={date} onChange={(v) => { setDate(v || todayYmd()); setShowConfirm(false); }} />
      </div>

      {maxAllowed > 0 && (
        <p className="text-xs text-slate-500">
          Max on {date}: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatIndianCurrency(maxAllowed)}</span>
        </p>
      )}

      {exceedsLimit && (
        <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
          Cannot prepay more than outstanding ({formatIndianCurrency(maxAllowed)}).
        </div>
      )}

      {canApply ? (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 p-2.5 sm:p-3 space-y-2.5">
          <p className="text-[10px] uppercase tracking-wider text-emerald-700/80 dark:text-emerald-400/80 font-medium">What this prepay does</p>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="min-w-0 rounded-md bg-white/70 dark:bg-slate-900/40 px-2 py-1.5">
              <p className="text-[10px] text-slate-500">Days you skip</p>
              <p className="text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums leading-tight">
                {timeSkipped.days}
                <span className="text-[10px] sm:text-xs font-medium text-slate-500"> days</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                {timeSkipped.primary}
                {timeSkipped.secondary ? ` · ${timeSkipped.secondary}` : ''}
              </p>
            </div>
            <div className="min-w-0 rounded-md bg-white/70 dark:bg-slate-900/40 px-2 py-1.5">
              <p className="text-[10px] text-slate-500">Interest you save</p>
              <p className="text-base sm:text-lg font-bold text-emerald-600 tabular-nums leading-tight">
                {formatIndianCurrency(moneySaved, false)}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                Total interest avoided over remaining EMIs
              </p>
            </div>
          </div>

          <p className="text-[10px] text-slate-500 leading-snug">
            {formatIndianCurrency(impact.prepayAmount, false)} goes to principal → closes ~{timeSkipped.days} days earlier.
            Interest saved = remaining EMI interest <span className="font-medium">without</span> this prepay
            minus interest <span className="font-medium">with</span> it (monthly reducing balance, not days × today&apos;s rate).
          </p>

          <div className="flex justify-between text-xs pt-1.5 border-t border-emerald-200/80 dark:border-emerald-800/60">
            <span className="text-slate-500">New outstanding</span>
            <span className="font-semibold tabular-nums">{formatIndianCurrency(impact.newOutstanding)}</span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">
          Enter an amount to see how many days you skip and how much interest you save.
        </p>
      )}

      {showConfirm && canApply && (
        <ChangeReviewPanel title="Confirm prepayment" rows={reviewRows} />
      )}

      <div className="flex gap-2 pt-1">
        {canApply && (
          <Btn size="sm" onClick={handleApply}>{showConfirm ? 'Apply prepayment' : 'Review prepayment'}</Btn>
        )}
        <Btn size="sm" variant="ghost" onClick={() => { setShowConfirm(false); onCancel(); }}>Cancel</Btn>
      </div>
    </div>
  );
}

function PrepaymentEditModal({ prepayment, loan, onSave, onClose }) {
  const [amount, setAmount] = useState(prepayment.amount ?? '');
  const [date, setDate] = useState(prepayment.date || '');
  const [notes, setNotes] = useState(prepayment.notes || '');
  const [showConfirm, setShowConfirm] = useState(false);

  const impact = useMemo(() => {
    const amt = toNum(amount);
    if (amt <= 0 || !date) return null;
    return previewPrepaymentImpact(loan, amt, date, prepayment.id);
  }, [loan, amount, date, prepayment.id]);

  const maxAllowed = impact?.maxAllowed ?? getMaxPrepaymentAmount(loan, date, prepayment.id);
  const exceedsLimit = toNum(amount) > maxAllowed && toNum(amount) > 0;

  const confirmPairs = useMemo(() => [
    ['Amount', formatIndianCurrency(prepayment.amount), formatIndianCurrency(amount)],
    ['Date', prepayment.date, date],
    ['Notes', prepayment.notes || '—', notes || '—'],
  ], [prepayment, amount, date, notes]);

  const confirmRows = useMemo(() => buildChangeRows(confirmPairs), [confirmPairs]);

  const handleApply = () => {
    if (!impact || impact.prepayAmount <= 0 || impact.exceedsOutstanding) return;
    if (!showConfirm) {
      if (confirmRows.length === 0) {
        onSave({ amount: impact.prepayAmount, date, notes });
        onClose();
        return;
      }
      setShowConfirm(true);
      return;
    }
    onSave({ amount: impact.prepayAmount, date, notes });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md max-h-[min(92dvh,100%)] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold">Edit prepayment</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
          <InputField label="Amount" type="number" value={amount} onChange={setAmount} suffix="₹" />
          <InputField label="Date" type="date" value={date} onChange={setDate} />
          <InputField label="Notes" value={notes} onChange={setNotes} />
          {maxAllowed > 0 && (
            <p className="text-xs text-slate-500">Max on {date}: {formatIndianCurrency(maxAllowed)}</p>
          )}
          {exceedsLimit && (
            <p className="text-xs text-red-600">Cannot exceed outstanding principal ({formatIndianCurrency(maxAllowed)}).</p>
          )}
          {impact && (
            <p className="text-xs text-slate-500">Included in Loan & Car Payments for {date.slice(0, 7)}</p>
          )}
          {showConfirm && confirmRows.length > 0 && (
            <div className="pb-1">
              <ChangeReviewPanel title="Confirm prepayment update" rows={confirmPairs} />
            </div>
          )}
        </div>
        <div className="shrink-0 flex gap-2 p-4 sm:p-5 pt-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Btn onClick={handleApply} className="flex-1 min-h-[44px]">
            {showConfirm ? 'Save changes' : confirmRows.length > 0 ? 'Review changes' : 'Save changes'}
          </Btn>
          <Btn variant="ghost" onClick={() => { setShowConfirm(false); onClose(); }} className="min-h-[44px]">Cancel</Btn>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PrepaymentsPanel({
  loan, stats, canEdit, showPrepay, onPrepay, onPrepayConfirm, onPrepayCancel, genId,
  onPrepayEdit, onPrepayDelete, pendingPrepayDeleteId, onConfirmPrepayDelete, onCancelPrepayDelete,
}) {
  const [visibleCount, setVisibleCount] = useState(PREPAYMENTS_PAGE_SIZE);
  const report = useMemo(() => getPrepaymentSavingsReport(loan), [loan]);
  const prepayments = getPrepayments(loan);
  const hasPrepays = prepayments.length > 0;
  const payoffAccel = formatPayoffAcceleration(report.monthsSaved ?? 0);

  const sortedItems = useMemo(
    () => [...report.items].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [report.items],
  );

  useEffect(() => {
    setVisibleCount(PREPAYMENTS_PAGE_SIZE);
  }, [loan.id, sortedItems.length]);

  const visibleItems = sortedItems.slice(0, visibleCount);
  const hasMore = visibleCount < sortedItems.length;
  const remaining = sortedItems.length - visibleCount;
  const dailyInterest = getDailyInterest(stats.outstanding, loan.interestRate);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">Prepayments</p>
          <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
            {hasPrepays
              ? `${prepayments.length} recorded · EMI stays fixed, loan closes sooner`
              : 'Pay extra principal anytime to cut interest and close earlier'}
          </p>
        </div>
        {canEdit && !stats.isClosed && !showPrepay && (
          <Btn size="sm" variant="secondary" className="shrink-0 !text-xs whitespace-nowrap" onClick={onPrepay}>
            <Plus className="w-3 h-3 inline mr-1" />
            Record
          </Btn>
        )}
      </div>

      {!stats.isClosed && stats.outstanding > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20 px-2.5 py-2 sm:px-3">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-medium text-amber-900 dark:text-amber-200">
              Interest charged today
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 truncate">
              Per day on {formatIndianCurrency(stats.outstanding, false)} at {formatRate(loan.interestRate)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm sm:text-base font-bold text-amber-700 dark:text-amber-300 tabular-nums leading-tight">
              {formatIndianCurrency(dailyInterest, false)}
              <span className="text-[10px] sm:text-xs font-medium text-amber-600/80 dark:text-amber-400/80"> / day</span>
            </p>
          </div>
        </div>
      )}

      {hasPrepays && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            {
              label: 'Prepaid',
              value: formatIndianCurrency(report.totalPrepaid, false),
              accent: 'text-teal-600 dark:text-teal-400',
              ring: 'border-teal-200/80 dark:border-teal-800/50 bg-teal-50/50 dark:bg-teal-950/20',
            },
            {
              label: 'Saved',
              value: formatIndianCurrency(report.totalSaved, false),
              accent: 'text-emerald-600 dark:text-emerald-400',
              ring: 'border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20',
            },
            {
              label: 'Earlier',
              value: report.monthsSaved > 0 ? payoffAccel.value : 'On schedule',
              accent: report.monthsSaved > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500',
              ring: 'border-indigo-200/80 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-950/20',
            },
            {
              label: 'Left',
              value: formatIndianCurrency(stats.outstanding, false),
              accent: 'text-red-500 dark:text-red-400',
              ring: 'border-red-200/80 dark:border-red-800/50 bg-red-50/40 dark:bg-red-950/20',
            },
          ].map((card) => (
            <div
              key={card.label}
              className={cn(
                'rounded-lg sm:rounded-xl border px-2.5 py-2 sm:px-3 sm:py-3 min-w-0',
                card.ring,
              )}
            >
              <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-500 font-medium truncate">
                {card.label}
              </p>
              <p className={cn('mt-0.5 sm:mt-1 text-sm sm:text-lg font-bold tabular-nums leading-tight break-words', card.accent)}>
                {card.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {showPrepay && (
        <PrepaymentForm loan={loan} genId={genId} onConfirm={onPrepayConfirm} onCancel={onPrepayCancel} />
      )}

      {!hasPrepays && !showPrepay && (
        <p className="text-xs text-slate-500 py-1">
          No prepayments yet.
          {canEdit && !stats.isClosed && (
            <>
              {' '}
              <button type="button" onClick={onPrepay} className="text-teal-600 dark:text-teal-400 font-medium hover:underline">
                Record one
              </button>
            </>
          )}
        </p>
      )}

      {hasPrepays && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          {visibleItems.map((item) => {
            const p = prepayments.find((x) => x.id === item.id);
            const earlyLabel = item.monthsSavedEarly > 0 ? formatPayoffAcceleration(item.monthsSavedEarly).value : null;
            return (
              <div key={item.id} className="flex items-start gap-2 px-2.5 sm:px-3 py-2 sm:py-2.5 bg-white dark:bg-slate-900">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs sm:text-sm font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                      {formatIndianCurrency(item.amount, false)}
                    </p>
                    <p className="text-[10px] sm:text-xs text-slate-500 tabular-nums shrink-0">{item.date}</p>
                  </div>
                  <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
                    EMI #{item.emiMonth}
                    {earlyLabel && <span className="text-emerald-600"> · {earlyLabel} early</span>}
                    {item.interestSaved > 0 && (
                      <span className="text-emerald-600"> · saved {formatIndianCurrency(item.interestSaved, false)}</span>
                    )}
                  </p>
                </div>
                {canEdit && p && (
                  <div className="flex gap-0.5 shrink-0 -mr-1">
                    <Btn variant="ghost" size="sm" className="!px-1.5" onClick={() => onPrepayEdit(p)} title="Edit">
                      <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </Btn>
                    <Btn variant="ghost" size="sm" className="!px-1.5 !text-red-500" onClick={() => onPrepayDelete(p)} title="Delete">
                      <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </Btn>
                  </div>
                )}
              </div>
            );
          })}
          {hasMore && (
            <div className="px-3 py-2 text-center bg-slate-50/80 dark:bg-slate-800/40">
              <Btn
                size="sm"
                variant="ghost"
                className="!text-xs"
                onClick={() => setVisibleCount((n) => Math.min(n + PREPAYMENTS_PAGE_SIZE, sortedItems.length))}
              >
                Load more ({remaining} remaining)
              </Btn>
            </div>
          )}
        </div>
      )}

      {prepayments.map((p) => pendingPrepayDeleteId === p.id && (
        <ConfirmDialog
          key={`del-${p.id}`}
          open
          message="delete this prepayment"
          detail={`${formatIndianCurrency(p.amount, false)} on ${p.date}`}
          variant="danger"
          confirmLabel="Delete"
          onConfirm={() => onConfirmPrepayDelete(p)}
          onCancel={onCancelPrepayDelete}
        />
      ))}
    </div>
  );
}

const STATEMENT_PAGE_SIZES = [25, 50, 100, 200];
const PREPAYMENTS_PAGE_SIZE = 10;

const STATEMENT_ROW_STYLES = {
  disbursement: 'border-l-4 border-l-slate-500 bg-slate-100/80 dark:bg-slate-800/50',
  interest: 'border-l-4 border-l-red-400 bg-red-50/60 dark:bg-red-950/25',
  emi: 'border-l-4 border-l-indigo-500 bg-indigo-100/90 dark:bg-indigo-900/45',
  prepayment: 'border-l-4 border-l-teal-500 bg-teal-100/90 dark:bg-teal-900/45',
};

function formatStatementDateMobile(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return { main: dateStr, year: '' };
  return {
    main: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    year: String(d.getFullYear()),
  };
}

function formatStatementBalance(balance) {
  return formatIndianCurrency(balance, false);
}

function SkipEmiAction({ loan, stats, canEdit, onMarkUnpaid, onClearUnpaid }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const monthIndex = useMemo(() => getCurrentEmiMonthIndex(loan), [loan]);

  if (!canEdit || stats.isClosed || monthIndex == null) return null;

  const emiDate = getEmiDueDateForMonth(loan, monthIndex);
  const isUnpaid = getEmiMonthStatus(loan, monthIndex) === 'unpaid';
  const emiLabel = `EMI #${monthIndex + 1}`;
  const emiAmount = formatIndianCurrency(stats.monthlyPayment || stats.emi || 0, false);

  if (isUnpaid) {
    return (
      <>
        <Btn
          size="sm"
          variant="secondary"
          className="shrink-0 whitespace-nowrap !text-amber-800 dark:!text-amber-200"
          onClick={() => setShowConfirm(true)}
        >
          Undo skip
        </Btn>
        <ConfirmDialog
          open={showConfirm}
          title="Undo skipped EMI"
          message={`undo the skip for ${emiLabel} (${emiDate})`}
          detail={`This marks ${emiLabel} as paid again.\n\n• Interest will be charged for the period\n• EMI of ${emiAmount} will be credited to your loan\n• Same as a normal payment month`}
          confirmLabel="Yes, mark as paid"
          onConfirm={() => {
            onClearUnpaid(monthIndex);
            setShowConfirm(false);
          }}
          onCancel={() => setShowConfirm(false)}
        />
      </>
    );
  }

  return (
    <>
      <Btn
        size="sm"
        variant="secondary"
        className="shrink-0 whitespace-nowrap"
        onClick={() => setShowConfirm(true)}
      >
        Skip this EMI
      </Btn>
      <ConfirmDialog
        open={showConfirm}
        title="Skip this EMI"
        message={`skip ${emiLabel} due on ${emiDate}`}
        detail={`You are choosing not to pay this month's installment (${emiAmount}).\n\nWhat happens:\n• Interest for the period is still added to outstanding\n• No EMI payment is credited this month\n• The loan will take longer to close\n\nYou can undo this later if you paid.`}
        confirmLabel="Yes, skip this EMI"
        variant="danger"
        onConfirm={() => {
          onMarkUnpaid(monthIndex);
          setShowConfirm(false);
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

function StatementMobileRow({ entry }) {
  const rowStyle = STATEMENT_ROW_STYLES[entry.txnType] || STATEMENT_ROW_STYLES.interest;
  const { main, year } = formatStatementDateMobile(entry.date);

  return (
    <tr className={cn('border-t border-slate-200 dark:border-slate-700', rowStyle)}>
      <td className="px-2 py-2 whitespace-nowrap align-top">
        <p className="font-medium tabular-nums">{main}</p>
        {year && <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">{year}</p>}
      </td>
      <td className="px-2 py-2 align-top min-w-[9rem]">
        <p className="font-medium leading-snug">{entry.particulars}</p>
        {entry.subLabel && <p className="text-xs text-slate-500">{entry.subLabel}</p>}
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums text-red-600 align-top">
        {entry.debit > 0 ? formatIndianCurrency(entry.debit, false) : '—'}
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums text-emerald-600 align-top">
        {entry.credit > 0 ? formatIndianCurrency(entry.credit, false) : '—'}
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums font-semibold text-red-600 align-top">
        {formatStatementBalance(entry.balance)}
      </td>
    </tr>
  );
}

function StatementDesktopRow({ entry }) {
  const rowStyle = STATEMENT_ROW_STYLES[entry.txnType] || STATEMENT_ROW_STYLES.interest;

  return (
    <tr className={cn('border-t border-slate-200 dark:border-slate-700 hover:brightness-[0.98] dark:hover:brightness-110', rowStyle)}>
      <td className="px-3 py-2.5 whitespace-nowrap align-top">
        <p className="font-medium tabular-nums">{entry.date}</p>
      </td>
      <td className="px-3 py-2.5 align-top min-w-[12rem]">
        <p className="font-medium leading-snug">{entry.particulars}</p>
        {entry.subLabel && <p className="text-xs text-slate-500 mt-0.5">{entry.subLabel}</p>}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-red-600 align-top">
        {entry.debit > 0 ? formatIndianCurrency(entry.debit, false) : '—'}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-emerald-600 align-top">
        {entry.credit > 0 ? formatIndianCurrency(entry.credit, false) : '—'}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums font-semibold text-red-600 align-top">
        {formatStatementBalance(entry.balance)}
      </td>
    </tr>
  );
}

function BankStatementPanel({ loan }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const entries = useMemo(() => buildLoanBankStatement(loan), [loan]);
  const stats = useMemo(() => computeLoanStats(loan), [loan]);

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [loan.id, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageStart = (safePage - 1) * pageSize;
  const pageEntries = entries.slice(pageStart, pageStart + pageSize);
  const rangeStart = entries.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + pageSize, entries.length);

  if (entries.length === 0) {
    return (
      <Card className="!p-6 sm:!p-8 text-center border-dashed">
        <ScrollText className="w-8 h-8 sm:w-10 sm:h-10 mx-auto text-slate-300 mb-2" />
        <p className="text-xs sm:text-sm text-slate-500">No statement entries yet. Add a disbursed amount and ensure the loan has a start date (or disbursement dates).</p>
      </Card>
    );
  }

  const closingBalance = entries[0]?.balance ?? 0;
  const outstanding = Math.round(stats.outstanding || 0);
  const balanceMatches = Math.abs(closingBalance - outstanding) <= 1;

  return (
    <div className="space-y-2.5 sm:space-y-3 animate-fade-in">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-[10px] sm:text-xs text-slate-500 leading-snug sm:max-w-md">
          Ledger balance = outstanding principal owed. Interest and EMI post at 6:00 AM on the EMI date.
        </p>
        <div className="text-[10px] sm:text-xs tabular-nums text-left sm:text-right space-y-0.5 shrink-0">
          <p>
            <span className="text-slate-500">Closing </span>
            <span className="font-semibold text-red-600">{formatStatementBalance(closingBalance)}</span>
          </p>
          <p>
            <span className="text-slate-500">Outstanding </span>
            <span className={cn('font-semibold', balanceMatches ? 'text-emerald-600' : 'text-amber-600')}>
              {formatIndianCurrency(outstanding, false)}
            </span>
          </p>
        </div>
      </div>

      {/* Mobile table — horizontal scroll for full columns */}
      <div className="sm:hidden overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs">
              <th className="px-2 py-2 font-medium text-slate-500">Date</th>
              <th className="px-2 py-2 font-medium text-slate-500">Particulars</th>
              <th className="px-2 py-2 font-medium text-slate-500 text-right">Debit</th>
              <th className="px-2 py-2 font-medium text-slate-500 text-right">Credit</th>
              <th className="px-2 py-2 font-medium text-slate-500 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {pageEntries.map((entry) => (
              <StatementMobileRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs">
              <th className="px-3 py-2.5 font-medium text-slate-500">Date</th>
              <th className="px-3 py-2.5 font-medium text-slate-500">Particulars</th>
              <th className="px-3 py-2.5 font-medium text-slate-500 text-right">Debit</th>
              <th className="px-3 py-2.5 font-medium text-slate-500 text-right">Credit</th>
              <th className="px-3 py-2.5 font-medium text-slate-500 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {pageEntries.map((entry) => (
              <StatementDesktopRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>
      </div>

      {closingBalance != null && (
        <p className="text-xs text-slate-500 text-right sm:hidden">
          Closing balance: <span className="font-semibold text-red-600">{formatStatementBalance(closingBalance)}</span>
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500">
        <p className="text-center sm:text-left">
          <span className="sm:hidden">{rangeStart}–{rangeEnd} of {entries.length}</span>
          <span className="hidden sm:inline">
            Showing <span className="font-medium text-slate-700 dark:text-slate-300">{rangeStart}–{rangeEnd}</span> of{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">{entries.length}</span>
          </span>
        </p>
        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-3">
          <label className="flex items-center gap-1.5 sm:gap-2">
            <span className="hidden sm:inline">Rows per page</span>
            <span className="sm:hidden">Per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
            >
              {STATEMENT_PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Btn
              size="sm"
              variant="ghost"
              className="!px-2 !text-xs"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
            >
              Prev
            </Btn>
            <span className="px-1.5 sm:px-2 tabular-nums text-[11px] sm:text-xs">
              {safePage}/{totalPages}
            </span>
            <Btn
              size="sm"
              variant="ghost"
              className="!px-2 !text-xs"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
            >
              Next
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoanClosingSummary({ stats, onClick }) {
  const closed = stats.isClosed;
  const originalLeft = stats.originalEmiPayoffMonths ?? stats.scheduleTimeRemainingMonths;
  const afterPrepayLeft = stats.afterPrepayPayoffMonths ?? stats.actualPayoffMonths;
  const paceLeft = stats.pacePayoffMonths ?? stats.actualPayoffMonths;
  const paceDelta = stats.monthsSavedVsPace ?? 0;
  const Tag = onClick ? 'button' : 'div';

  if (closed) {
    return (
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={cn(
          'col-span-2 p-2 sm:p-3 text-center border-t sm:border-t-0 border-slate-100 dark:border-slate-800 bg-white/40 dark:bg-slate-900/20',
          onClick && 'cursor-pointer hover:bg-white/70 dark:hover:bg-slate-800/40 transition-colors',
        )}
      >
        <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-slate-500 mb-0.5 sm:mb-1">Loan closing</p>
        <p className="text-sm sm:text-lg font-bold text-emerald-600">Paid off</p>
        <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">
          {formatDuration(stats.totalEmis)} original tenure
        </p>
      </Tag>
    );
  }

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'col-span-2 p-2 sm:p-3 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 bg-white/40 dark:bg-slate-900/20 text-left',
        onClick && 'cursor-pointer hover:bg-white/70 dark:hover:bg-slate-800/40 transition-colors',
      )}
    >
      <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-slate-500 mb-1 sm:mb-2 text-center">Loan closing</p>
      <div className="sm:hidden text-center space-y-0.5">
        <p className="text-sm font-bold tabular-nums text-emerald-600">
          {formatDuration(paceLeft)}
        </p>
        <p className="text-[9px] text-slate-500 leading-snug">
          Prepay {formatDuration(afterPrepayLeft)} · Orig {formatDuration(originalLeft)}
        </p>
      </div>
      <div className="hidden sm:block space-y-2 text-xs max-w-xs mx-auto">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500 shrink-0">Original EMI</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
            {formatDuration(originalLeft)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500 shrink-0">After prepay</span>
          <span className="font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
            {formatDuration(afterPrepayLeft)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700">
          <span className="text-slate-700 dark:text-slate-300 font-medium shrink-0">Your pace</span>
          <span className="font-bold tabular-nums text-emerald-600">
            {formatDuration(paceLeft)}
          </span>
        </div>
        <p className="text-[10px] text-slate-500 text-right leading-snug">
          {paceDelta > 0
            ? `${formatDuration(paceDelta)} sooner · avg ${formatIndianCurrency(stats.averageMonthlyPayment || 0, false)}/mo`
            : paceDelta < 0
              ? `${formatDuration(Math.abs(paceDelta))} longer at current pace`
              : stats.monthsSavedVsSchedule > 0
                ? `${formatDuration(stats.monthsSavedVsSchedule)} saved by prepays`
                : 'Same as bank EMI pace'}
        </p>
      </div>
    </Tag>
  );
}

function EmiLoanCard({ loan, stats, expanded, onToggle, onEdit, onDelete, showDisburse, onDisburseAdd, onDisburseConfirm, onDisburseCancel, onDisburseEdit, onDisburseDelete, pendingDisburseDeleteId, onConfirmDisburseDelete, onCancelDisburseDelete, onPrepay, showPrepay, onPrepayConfirm, onPrepayCancel, onPrepayEdit, onPrepayDelete, pendingPrepayDeleteId, onConfirmPrepayDelete, onCancelPrepayDelete, genId, pendingAction, onConfirmDelete, onCancelAction, detailTab, onDetailTabChange, canEdit, onMarkEmiUnpaid, onClearEmiUnpaid }) {
  const typeInfo = LOAN_TYPES[stats.loanType] || LOAN_TYPES.other;
  const savingsReport = useMemo(() => getPrepaymentSavingsReport(loan), [loan]);
  const isDeletePending = pendingAction?.type === 'delete';
  const disbursementCount = getDisbursements(loan).length;
  const isDesktop = useIsSmUp();
  const [showClosingTimeline, setShowClosingTimeline] = useState(isDesktop);

  useEffect(() => {
    setShowClosingTimeline(isDesktop);
  }, [isDesktop]);

  const deleteRows = isDeletePending
    ? [
        ['Loan', loan.name, 'Will be removed'],
        ['Outstanding', fmtStat(stats.outstanding), '—'],
        ['Monthly EMI', fmtStat(stats.emi, false), '—'],
      ]
    : [];

  return (
    <Card className="overflow-hidden !p-0">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors" style={{ borderLeftWidth: 4, borderLeftColor: typeInfo.color }}>
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base truncate max-w-[60vw] sm:max-w-none">{loan.name || 'Unnamed Loan'}</h3>
                <Badge color={stats.isClosed ? 'green' : 'amber'}>{stats.isClosed ? 'closed' : 'active'}</Badge>
                <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${typeInfo.color}20`, color: typeInfo.color }}>{typeInfo.label}</span>
                <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  EMI: {stats.emiBasis === 'sanctioned' ? 'Sanctioned' : 'Disbursed'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 line-clamp-2 sm:line-clamp-none">
                {loan.lender || '—'} · {formatIndianCurrency(getDailyInterest(stats.outstanding, stats.annualRate), false)}/day
                {stats.hasManualEmi ? (
                  <> · You pay {formatIndianCurrency(stats.monthlyPayment, false)} (bank {formatIndianCurrency(stats.scheduledEmi || stats.emi, false)})</>
                ) : (
                  <> · EMI {formatIndianCurrency(stats.emi, false)} on {formatIndianCurrency(stats.emiPrincipal, false)}</>
                )}
                {savingsReport.totalSaved > 0 && (
                  <span className="text-emerald-600"> · Saved {formatIndianCurrency(savingsReport.totalSaved)} interest</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {expanded ? <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" /> : <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />}
            </div>
          </div>
        </div>
      </button>

      {/* Summary strip */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-slate-100 dark:divide-slate-800 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/30 dark:to-purple-950/30">
        <LoanStatCell
          label="Daily interest"
          value={formatIndianCurrency(getDailyInterest(stats.outstanding, stats.annualRate), false)}
          sub={stats.isClosed || stats.outstanding <= 0 ? 'paid off' : `${formatRate(stats.annualRate)} · on outstanding`}
          valueClassName="text-rose-600"
        />
        <LoanStatCell label="Outstanding" value={formatIndianCurrency(stats.outstanding)} sub={stats.disbursedPrincipal > 0 ? `${formatPercent((stats.outstanding / stats.disbursedPrincipal) * 100, 0)} left` : undefined} valueClassName="text-red-500" />
        <LoanStatCell
          label="This Month"
          value={formatIndianCurrency(stats.monthlyPayment || stats.emi || 0, false)}
          sub={(
            <>
              <span className="text-amber-600 dark:text-amber-400">
                Int {formatIndianCurrency(stats.monthlyInterest || 0, false)}
              </span>
              {' · '}
              <span className="text-emerald-600 dark:text-emerald-400">
                Prin {formatIndianCurrency(stats.monthlyScheduledPrincipal || 0, false)}
              </span>
              {' · '}
              <span className={stats.monthlyExtraPrincipal > 0 ? 'text-indigo-600 dark:text-indigo-400' : undefined}>
                Extra {stats.monthlyExtraPrincipal > 0
                  ? `+${formatIndianCurrency(stats.monthlyExtraPrincipal, false)}`
                  : '—'}
              </span>
            </>
          )}
          subClassName="whitespace-normal"
          valueClassName="text-indigo-600"
        />
        <LoanStatCell label="Int. Saved" value={formatIndianCurrency(savingsReport.totalSaved || 0)} valueClassName="text-emerald-600" />
        <LoanClosingSummary stats={stats} />
      </div>

      {expanded && (
        <div className="animate-fade-in">
          <div className="flex border-b border-slate-200 dark:border-slate-800 px-2 sm:px-4 overflow-x-auto">
            <button
              type="button"
              onClick={() => onDetailTabChange('details')}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors shrink-0 ${detailTab === 'details' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <span className="sm:hidden">Details</span>
              <span className="hidden sm:inline">Loan Details</span>
            </button>
            <button
              type="button"
              onClick={() => onDetailTabChange('disbursements')}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1 sm:gap-1.5 shrink-0 ${detailTab === 'disbursements' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Banknote className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="sm:hidden">Draw</span>
              <span className="hidden sm:inline">Disbursements</span>
              {disbursementCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                  {formatPercent(getDisbursementProgressPct(loan), 0)}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onDetailTabChange('prepayments')}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1 sm:gap-1.5 shrink-0 ${detailTab === 'prepayments' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <ArrowDownCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="sm:hidden">Prepay</span>
              <span className="hidden sm:inline">Prepayments</span>
              {stats.prepaymentCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
                  {stats.prepaymentCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onDetailTabChange('statement')}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1 sm:gap-1.5 shrink-0 ${detailTab === 'statement' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <ScrollText className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="sm:hidden">Stmt</span>
              <span className="hidden sm:inline">Bank Statement</span>
            </button>
          </div>

          {detailTab === 'disbursements' ? (
            <div className="p-3 sm:p-5">
              <DisbursementsPanel
                loan={loan}
                stats={stats}
                canEdit={canEdit}
                showForm={showDisburse}
                onAdd={onDisburseAdd}
                onConfirm={onDisburseConfirm}
                onCancel={onDisburseCancel}
                onEdit={onDisburseEdit}
                onDelete={onDisburseDelete}
                pendingDisburseDeleteId={pendingDisburseDeleteId}
                onConfirmDisburseDelete={onConfirmDisburseDelete}
                onCancelDisburseDelete={onCancelDisburseDelete}
                genId={genId}
              />
            </div>
          ) : detailTab === 'prepayments' ? (
            <div className="p-3 sm:p-5">
              <PrepaymentsPanel
                loan={loan}
                stats={stats}
                canEdit={canEdit}
                showPrepay={showPrepay}
                onPrepay={onPrepay}
                onPrepayConfirm={onPrepayConfirm}
                onPrepayCancel={onPrepayCancel}
                genId={genId}
                onPrepayEdit={onPrepayEdit}
                onPrepayDelete={onPrepayDelete}
                pendingPrepayDeleteId={pendingPrepayDeleteId}
                onConfirmPrepayDelete={onConfirmPrepayDelete}
                onCancelPrepayDelete={onCancelPrepayDelete}
              />
            </div>
          ) : detailTab === 'statement' ? (
            <div className="p-3 sm:p-5">
              <BankStatementPanel loan={loan} />
            </div>
          ) : (
        <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
          {canEdit && (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <SkipEmiAction
                  loan={loan}
                  stats={stats}
                  canEdit={canEdit}
                  onMarkUnpaid={(monthIndex) => onMarkEmiUnpaid(loan.id, monthIndex)}
                  onClearUnpaid={(monthIndex) => onClearEmiUnpaid(loan.id, monthIndex)}
                />
              </div>
              <div className="flex gap-1 shrink-0">
                <Btn variant="ghost" size="sm" onClick={onEdit} title="Edit loan"><Pencil className="w-4 h-4" /></Btn>
                <Btn variant="ghost" size="sm" onClick={onDelete} title="Delete loan"><Trash2 className="w-4 h-4 text-red-500" /></Btn>
              </div>
            </div>
          )}

          <LoanDetailsMetrics
            stats={stats}
            showClosingTimeline={showClosingTimeline}
            onToggleClosingTimeline={() => setShowClosingTimeline((v) => !v)}
          />

          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-slate-500">Repayment Progress</span>
              <span className="font-bold text-emerald-600">{Number(stats.repaymentProgress ?? 0).toFixed(1)}%</span>
            </div>
            <ProgressBar value={stats.repaymentProgress} color={typeInfo.color} height="h-2.5" />
          </div>

          {canEdit && isDeletePending && (
            <>
              <ChangeReviewPanel title="Confirm delete loan" rows={deleteRows} />
              <div className="flex gap-2 pt-3 mt-1 border-t border-slate-200/80 dark:border-slate-700/80">
                <Btn size="sm" variant="danger" onClick={onConfirmDelete}>Delete Loan</Btn>
                <Btn size="sm" variant="ghost" onClick={onCancelAction}>Cancel</Btn>
              </div>
            </>
          )}
        </div>
          )}
        </div>
      )}
    </Card>
  );
}

function RevolvingLoanCard({ loan, stats, expanded, onToggle, onEdit, onDelete, pendingAction, onConfirmDelete, onCancelAction, canEdit }) {
  const typeInfo = LOAN_TYPES[stats.loanType] || LOAN_TYPES.credit_card;

  return (
    <Card className="overflow-hidden !p-0">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30" style={{ borderLeftWidth: 4, borderLeftColor: typeInfo.color }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={{ color: typeInfo.color }} />
                <h3 className="font-bold text-sm sm:text-base truncate">{loan.name}</h3>
                <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${typeInfo.color}20`, color: typeInfo.color }}>{typeInfo.label}</span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">{formatIndianCurrency(stats.statementBalance)} outstanding · Due {stats.dueDate || '—'}</p>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" /> : <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />}
          </div>
        </div>
      </button>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800 bg-gradient-to-r from-red-50/80 to-orange-50/80 dark:from-red-950/20 dark:to-orange-950/20">
        <LoanStatCell label="Outstanding" value={formatIndianCurrency(stats.statementBalance)} valueClassName="text-red-500" />
        <LoanStatCell
          label={stats.hasManualEmi ? 'You Pay' : 'Min. Due'}
          value={formatIndianCurrency(stats.monthlyPayment || stats.minDue, false)}
          sub={stats.hasManualEmi ? `Min ${formatIndianCurrency(stats.minDue, false)}` : undefined}
          valueClassName="text-indigo-600"
        />
        <LoanStatCell label="Utilization" value={`${stats.utilization.toFixed(0)}%`} />
        <LoanStatCell label="Due Date" value={stats.dueDate || '—'} valueClassName="text-sm sm:text-lg" />
      </div>

      {expanded && (
        <div className="p-3 sm:p-5 animate-fade-in">
          {canEdit && (
            <div className="flex gap-1 justify-end mb-3">
              <Btn variant="ghost" size="sm" onClick={onEdit}><Pencil className="w-4 h-4" /></Btn>
              <Btn variant="ghost" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4 text-red-500" /></Btn>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MetricBox label="Credit Limit" value={formatIndianCurrency(stats.creditLimit)} />
            <MetricBox label="Available" value={formatIndianCurrency(stats.availableCredit)} accent="text-emerald-600" />
            <MetricBox label="Interest Rate" value={formatRate(stats.annualRate)} sub={formatMonthlyRate(stats.annualRate)} />
          </div>
          <ProgressBar value={stats.utilization} color={stats.utilization > 70 ? '#ef4444' : typeInfo.color} height="h-2.5" />
          {canEdit && pendingAction?.type === 'delete' && (
            <>
              <ChangeReviewPanel
                title="Confirm delete"
                rows={[
                  ['Account', loan.name, 'Removed'],
                  ['Balance', fmtStat(stats.statementBalance), '—'],
                ]}
              />
              <div className="flex gap-2 mt-3">
                <Btn size="sm" variant="danger" onClick={onConfirmDelete}>Delete</Btn>
                <Btn size="sm" variant="ghost" onClick={onCancelAction}>Cancel</Btn>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export function LoansTab() {
  const { data, updateFinance, generateId: genId, canEdit } = useApp();
  const pf = data.personalFinance;
  const loans = (pf.loans || []).map(normalizeLoan);
  const [loansUi, setLoansUi] = useUiSection('loans');

  const [editLoan, setEditLoan] = useState(null);
  const [prepayLoanId, setPrepayLoanId] = useState(null);
  const [disburseLoanId, setDisburseLoanId] = useState(null);
  const [editDisbursement, setEditDisbursement] = useState(null);
  const [pendingDisburseDelete, setPendingDisburseDelete] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingPrepayDelete, setPendingPrepayDelete] = useState(null);
  const [editPrepayment, setEditPrepayment] = useState(null);
  const [showPaymentsBreakdown, setShowPaymentsBreakdown] = useState(false);
  const [showClosingBreakdown, setShowClosingBreakdown] = useState(false);

  const expandedIds = loansUi.expandedIds || [];
  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds]);
  const isExpanded = (id) => expandedSet.has(id);
  const setExpandedForLoan = (id, open) => {
    const next = new Set(expandedIds);
    if (open) next.add(id);
    else next.delete(id);
    setLoansUi({ expandedIds: [...next] });
  };
  const toggleExpanded = (id) => setExpandedForLoan(id, !isExpanded(id));
  const rawDetailTab = loansUi.detailTab || 'details';
  const detailTab = rawDetailTab === 'savings' ? 'prepayments' : rawDetailTab;
  const setDetailTab = (tab) => setLoansUi({ detailTab: tab });

  const defaultClosingLoanId = loansUi.defaultClosingLoanId || null;

  const allStats = useMemo(() => loans.map((l) => ({ loan: l, stats: computeLoanStats(l) })), [loans]);

  const summary = useMemo(() => {
    const active = allStats.filter(({ stats }) => !stats.isClosed);
    const totalOutstanding = allStats.reduce((s, { stats }) => s + stats.outstanding, 0);
    const totalMonthlyEmi = active.reduce((s, { stats }) => s + getLoanMonthlyOutflow(stats), 0);
    const totalInterestPaid = allStats.reduce((s, { stats }) => s + (stats.interestPaid || 0), 0);
    const totalMonthlyInterest = active.reduce((s, { stats }) => s + (stats.monthlyInterest || 0), 0);
    const totalMonthlyPrincipal = active.reduce((s, { stats }) => s + (stats.monthlyTotalPrincipal || 0), 0);
    const totalPrincipalTaken = allStats.reduce((s, { stats }) => s + getLoanPrincipalTaken(stats), 0);
    const totalPrincipalPaid = allStats.reduce((s, { stats }) => {
      if (stats.loanCategory === 'revolving') {
        const taken = getLoanPrincipalTaken(stats);
        return s + Math.max(0, taken - stats.outstanding);
      }
      return s + (stats.principalPaid || 0);
    }, 0);
    const remainingPct = totalPrincipalTaken > 0
      ? Math.min(100, (totalOutstanding / totalPrincipalTaken) * 100)
      : 0;
    const repaidPct = totalPrincipalTaken > 0
      ? Math.min(100, (totalPrincipalPaid / totalPrincipalTaken) * 100)
      : 0;

    const emiBreakdown = allStats
      .filter(({ stats }) => getLoanMonthlyOutflow(stats) > 0 || (stats.interestPaid || 0) > 0)
      .map(({ loan, stats }) => {
        const payment = getLoanMonthlyOutflow(stats);
        const interestPaid = stats.interestPaid || 0;
        return {
          id: loan.id,
          name: loan.name || 'Unnamed',
          lender: loan.lender,
          loanType: stats.loanType,
          isClosed: !!stats.isClosed,
          payment,
          scheduledEmi: stats.scheduledEmi || stats.emi,
          hasManualEmi: stats.hasManualEmi,
          interest: stats.monthlyInterest || 0,
          principal: stats.monthlyScheduledPrincipal || 0,
          extra: stats.monthlyExtraPrincipal || 0,
          dailyInterest: getDailyInterest(stats.outstanding ?? stats.statementBalance, stats.annualRate),
          interestPaid,
          interestPaidPct: totalInterestPaid > 0 ? (interestPaid / totalInterestPaid) * 100 : 0,
          pct: totalMonthlyEmi > 0 ? (payment / totalMonthlyEmi) * 100 : 0,
        };
      })
      .sort((a, b) => b.payment - a.payment || b.interestPaid - a.interestPaid);

    const closingBreakdown = allStats
      .filter(({ stats }) => stats.loanCategory !== 'revolving')
      .map(({ loan, stats }) => ({
        id: loan.id,
        name: loan.name || 'Unnamed',
        lender: loan.lender,
        loanType: stats.loanType,
        isClosed: stats.isClosed,
        totalEmis: stats.totalEmis,
        originalEmiPayoffMonths: stats.originalEmiPayoffMonths ?? stats.scheduleTimeRemainingMonths,
        afterPrepayPayoffMonths: stats.afterPrepayPayoffMonths ?? stats.actualPayoffMonths,
        pacePayoffMonths: stats.pacePayoffMonths ?? stats.actualPayoffMonths,
        averageMonthlyPayment: stats.averageMonthlyPayment || stats.monthlyPayment,
        scheduleTimeRemainingMonths: stats.scheduleTimeRemainingMonths,
        actualPayoffMonths: stats.actualPayoffMonths,
        monthsSavedVsSchedule: stats.monthsSavedVsSchedule,
        monthsSavedVsPace: stats.monthsSavedVsPace ?? 0,
        prepaymentCount: stats.prepaymentCount,
        prepaymentPrincipalPct: stats.prepaymentPrincipalPct,
      }))
      .sort((a, b) => {
        if (a.isClosed && !b.isClosed) return 1;
        if (!a.isClosed && b.isClosed) return -1;
        return (b.pacePayoffMonths ?? 0) - (a.pacePayoffMonths ?? 0);
      });

    const activeClosing = closingBreakdown.filter((item) => !item.isClosed);
    const lastLoanClosesMonths = activeClosing.length > 0
      ? Math.max(...activeClosing.map((item) => item.pacePayoffMonths ?? item.actualPayoffMonths))
      : 0;
    const maxScheduleRemaining = activeClosing.length > 0
      ? Math.max(...activeClosing.map((item) => item.originalEmiPayoffMonths ?? item.scheduleTimeRemainingMonths))
      : 0;
    const anyClosingAccel = activeClosing.some((item) => (item.monthsSavedVsPace > 0) || (item.monthsSavedVsSchedule > 0));

    const hasExplicitDefault = !!(defaultClosingLoanId && closingBreakdown.some((item) => loanIdsMatch(item.id, defaultClosingLoanId)));
    let featuredClosingLoan = defaultClosingLoanId
      ? closingBreakdown.find((item) => loanIdsMatch(item.id, defaultClosingLoanId)) ?? null
      : null;
    if (!featuredClosingLoan && activeClosing.length > 0) {
      featuredClosingLoan = activeClosing.reduce((best, item) => (
        (item.pacePayoffMonths ?? 0) > (best.pacePayoffMonths ?? 0) ? item : best
      ));
    }

    return {
      totalOutstanding,
      totalMonthlyEmi,
      totalInterestPaid,
      totalMonthlyInterest,
      totalMonthlyPrincipal,
      totalPrincipalTaken,
      totalPrincipalPaid,
      remainingPct,
      repaidPct,
      emiBreakdown,
      closingBreakdown,
      lastLoanClosesMonths,
      maxScheduleRemaining,
      anyClosingAccel,
      activeClosingCount: activeClosing.length,
      featuredClosingLoan,
      hasExplicitDefault,
    };
  }, [allStats, defaultClosingLoanId]);

  const saveFinance = (updatedPf, audit) => updateFinance(updatedPf, audit);

  const saveLoans = (updatedLoans, audit) => saveFinance({ ...pf, loans: updatedLoans }, audit);

  const handleSaveLoan = (saved) => {
    const normalized = normalizeLoan(saved);
    const before = loans.find((l) => l.id === normalized.id);
    const audit = buildLoanAudit(before, normalized);
    saveLoans(
      before ? loans.map((l) => (l.id === normalized.id ? normalized : l)) : [...loans, normalized],
      audit,
    );
  };

  const handlePrepayConfirm = (loanId, prepayment) => {
    const loan = loans.find((l) => l.id === loanId);
    const interestSaved = calculateInterestSavedForDate(loan, prepayment.amount, prepayment.date);
    const withSaved = { ...prepayment, interestSaved };
    const updatedLoans = loans.map((l) => (l.id === loanId ? applyPrepayment(l, withSaved) : l));
    saveFinance({ ...pf, loans: updatedLoans }, buildPrepaymentAudit(loan, withSaved, 'create'));
    setPrepayLoanId(null);
    setPendingAction(null);
  };

  const handlePrepayUpdate = (loanId, prepaymentId, updates) => {
    const loan = loans.find((l) => l.id === loanId);
    const existing = getPrepayments(loan).find((p) => p.id === prepaymentId);
    const merged = { ...existing, ...updates };
    const updatedLoans = loans.map((l) => (l.id === loanId ? updatePrepayment(l, prepaymentId, updates) : l));
    saveFinance({ ...pf, loans: updatedLoans }, buildPrepaymentAudit(loan, merged, 'update'));
    setEditPrepayment(null);
  };

  const handlePrepayDelete = (loanId, prepayment) => {
    const loan = loans.find((l) => l.id === loanId);
    const updatedLoans = loans.map((l) => (l.id === loanId ? removePrepayment(l, prepayment.id) : l));
    saveFinance({ ...pf, loans: updatedLoans }, buildPrepaymentAudit(loan, prepayment, 'delete'));
    setPendingPrepayDelete(null);
  };

  const handleDisburseConfirm = (loanId, disbursement) => {
    const loan = loans.find((l) => l.id === loanId);
    const updatedLoans = loans.map((l) => (l.id === loanId ? applyDisbursement(l, disbursement) : l));
    saveFinance({ ...pf, loans: updatedLoans }, buildPartialDisburseAudit(loan, disbursement));
    setDisburseLoanId(null);
    setPendingAction(null);
  };

  const handleDisburseUpdate = (loanId, disbursementId, updates) => {
    const loan = loans.find((l) => l.id === loanId);
    const before = getDisbursements(loan).find((d) => d.id === disbursementId);
    const updatedLoans = loans.map((l) => (l.id === loanId ? updateDisbursement(l, disbursementId, updates) : l));
    const after = getDisbursements(updatedLoans.find((l) => l.id === loanId)).find((d) => d.id === disbursementId);
    saveFinance({ ...pf, loans: updatedLoans }, buildDisbursementUpdateAudit(loan, before, after));
    setEditDisbursement(null);
  };

  const handleDisburseDelete = (loanId, disbursement) => {
    const loan = loans.find((l) => l.id === loanId);
    const updatedLoans = loans.map((l) => (l.id === loanId ? removeDisbursement(l, disbursement.id) : l));
    saveFinance({ ...pf, loans: updatedLoans }, buildDisbursementDeleteAudit(loan, disbursement));
    setPendingDisburseDelete(null);
  };

  const handleConfirmDelete = (loanId) => {
    const loan = loans.find((l) => l.id === loanId);
    saveLoans(loans.filter((l) => l.id !== loanId), buildLoanDeleteAudit(loan));
    if (loanIdsMatch(defaultClosingLoanId, loanId)) {
      setLoansUi({ defaultClosingLoanId: null });
    }
    setPendingAction(null);
  };

  const handleMarkEmiUnpaid = (loanId, monthIndex) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;
    const updated = normalizeLoan(updateEmiMonthStatus(loan, monthIndex, 'unpaid'));
    saveLoans(loans.map((l) => (l.id === loanId ? updated : l)));
  };

  const handleClearEmiUnpaid = (loanId, monthIndex) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;
    const updated = normalizeLoan(updateEmiMonthStatus(loan, monthIndex, 'paid'));
    saveLoans(loans.map((l) => (l.id === loanId ? updated : l)));
  };

  return (
    <div className="space-y-3 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="Loans Dashboard"
        subtitle="Tap a loan to expand"
        action={canEdit ? (
          <Btn className="w-full sm:w-auto" size="sm" onClick={() => setEditLoan(createEmptyLoan(genId()))}>
            <Plus className="w-4 h-4 inline mr-1" />Add Loan
          </Btn>
        ) : null}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-4">
        <DashboardStatCard
          label="Total Outstanding"
          value={formatIndianCurrency(summary.totalOutstanding)}
          sub={summary.totalPrincipalTaken > 0
            ? `${formatIndianCurrency(summary.totalPrincipalTaken)} taken · ${formatPercent(summary.remainingPct, 1)} remaining`
            : 'No principal recorded'}
          color="red"
          footer={summary.totalPrincipalTaken > 0 ? (
            <div className="mt-2 space-y-1">
              <ProgressBar value={summary.repaidPct} color="#ef4444" height="h-1.5" />
              <p className="text-[10px] text-slate-500">{formatPercent(summary.repaidPct, 1)} principal repaid</p>
            </div>
          ) : null}
        />
        <DashboardStatCard
          label="EMI & interest"
          value={formatIndianCurrency(summary.totalMonthlyEmi, false)}
          secondaryValue="/ month outflow"
          sub={showPaymentsBreakdown ? 'Tap to hide loan split' : 'Tap for payment split by loan'}
          color="indigo"
          onClick={() => { setShowPaymentsBreakdown((v) => !v); setShowClosingBreakdown(false); }}
          active={showPaymentsBreakdown}
          footer={(
            <LoanPaymentsDashboardFooter
              monthlyInterest={summary.totalMonthlyInterest}
              monthlyPrincipal={summary.totalMonthlyPrincipal}
              interestPaid={summary.totalInterestPaid}
            />
          )}
        />
        <DashboardStatCard
          label="Loan closing"
          value={(() => {
            const featured = summary.featuredClosingLoan;
            if (!featured) return 'Paid off';
            if (featured.isClosed) return 'Paid off';
            return formatDuration(featured.pacePayoffMonths ?? featured.actualPayoffMonths);
          })()}
          sub={showClosingBreakdown
            ? 'Tap to hide loan split'
            : (() => {
                const featured = summary.featuredClosingLoan;
                if (!featured) return 'All EMI loans paid off';
                if (featured.isClosed) return `${featured.name} · paid off`;
                if (summary.hasExplicitDefault) return `${featured.name} · default`;
                return `${featured.name} · longest at your pace`;
              })()}
          color="green"
          onClick={() => { setShowClosingBreakdown((v) => !v); setShowPaymentsBreakdown(false); }}
          active={showClosingBreakdown}
          footer={<LoanClosingDashboardFooter featured={summary.featuredClosingLoan} />}
        />
      </div>

      {showPaymentsBreakdown && (
        <EmiBreakdownPanel
          items={summary.emiBreakdown}
          total={summary.totalMonthlyEmi}
          interestPaidTotal={summary.totalInterestPaid}
        />
      )}

      {showClosingBreakdown && (
        <LoanClosingBreakdownPanel
          items={summary.closingBreakdown}
          defaultLoanId={defaultClosingLoanId}
          onSetDefault={(loanId) => setLoansUi({ defaultClosingLoanId: loanId })}
        />
      )}

      {loans.length === 0 && (
        <Card className="text-center py-12">
          <TrendingDown className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">No loans yet. Add your first loan to start tracking.</p>
        </Card>
      )}

      <div className="space-y-3 sm:space-y-4">
        {allStats.map(({ loan, stats }) => {
          const loanExpanded = isExpanded(loan.id);
          const isRevolving = stats.loanCategory === 'revolving';
          const action = pendingAction?.loanId === loan.id ? pendingAction : null;

          return isRevolving ? (
            <RevolvingLoanCard
              key={loan.id}
              loan={loan}
              stats={stats}
              expanded={loanExpanded}
              onToggle={() => toggleExpanded(loan.id)}
              onEdit={() => setEditLoan(loan)}
              onDelete={() => { setExpandedForLoan(loan.id, true); setPendingAction({ type: 'delete', loanId: loan.id }); }}
              pendingAction={action}
              onConfirmDelete={() => handleConfirmDelete(loan.id)}
              onCancelAction={() => setPendingAction(null)}
              canEdit={canEdit}
            />
          ) : (
            <EmiLoanCard
              key={loan.id}
              loan={loan}
              stats={stats}
              expanded={loanExpanded}
              onToggle={() => toggleExpanded(loan.id)}
              onEdit={() => setEditLoan(loan)}
              onDelete={() => { setExpandedForLoan(loan.id, true); setPendingAction({ type: 'delete', loanId: loan.id }); }}
              showDisburse={disburseLoanId === loan.id}
              onDisburseAdd={() => { setExpandedForLoan(loan.id, true); setDetailTab('disbursements'); setDisburseLoanId(loan.id); setPendingAction(null); }}
              onDisburseConfirm={(d) => handleDisburseConfirm(loan.id, d)}
              onDisburseCancel={() => setDisburseLoanId(null)}
              onDisburseEdit={(d) => setEditDisbursement({ loanId: loan.id, disbursement: d })}
              onDisburseDelete={(d) => setPendingDisburseDelete({ loanId: loan.id, disbursement: d })}
              pendingDisburseDeleteId={pendingDisburseDelete?.loanId === loan.id ? pendingDisburseDelete.disbursement.id : null}
              onConfirmDisburseDelete={() => handleDisburseDelete(pendingDisburseDelete.loanId, pendingDisburseDelete.disbursement)}
              onCancelDisburseDelete={() => setPendingDisburseDelete(null)}
              onPrepay={() => { setExpandedForLoan(loan.id, true); setDetailTab('prepayments'); setPrepayLoanId(loan.id); setPendingAction(null); }}
              showPrepay={prepayLoanId === loan.id}
              genId={genId}
              onPrepayConfirm={(pp) => handlePrepayConfirm(loan.id, pp)}
              onPrepayCancel={() => setPrepayLoanId(null)}
              onPrepayEdit={(p) => setEditPrepayment({ loanId: loan.id, prepayment: p })}
              onPrepayDelete={(p) => setPendingPrepayDelete({ loanId: loan.id, prepayment: p })}
              pendingPrepayDeleteId={pendingPrepayDelete?.loanId === loan.id ? pendingPrepayDelete.prepayment.id : null}
              onConfirmPrepayDelete={() => handlePrepayDelete(pendingPrepayDelete.loanId, pendingPrepayDelete.prepayment)}
              onCancelPrepayDelete={() => setPendingPrepayDelete(null)}
              pendingAction={action}
              onConfirmDelete={() => handleConfirmDelete(loan.id)}
              onCancelAction={() => setPendingAction(null)}
              detailTab={detailTab}
              onDetailTabChange={setDetailTab}
              canEdit={canEdit}
              onMarkEmiUnpaid={handleMarkEmiUnpaid}
              onClearEmiUnpaid={handleClearEmiUnpaid}
            />
          );
        })}
      </div>

      {editLoan && (
        <LoanEditModal loan={editLoan} onSave={handleSaveLoan} onClose={() => setEditLoan(null)} genId={genId} />
      )}

      {editPrepayment && (
        <PrepaymentEditModal
          prepayment={editPrepayment.prepayment}
          loan={loans.find((l) => l.id === editPrepayment.loanId)}
          onSave={(updates) => handlePrepayUpdate(editPrepayment.loanId, editPrepayment.prepayment.id, updates)}
          onClose={() => setEditPrepayment(null)}
        />
      )}

      {editDisbursement && (
        <DisbursementEditModal
          disbursement={editDisbursement.disbursement}
          loan={loans.find((l) => l.id === editDisbursement.loanId)}
          onSave={(updates) => handleDisburseUpdate(editDisbursement.loanId, editDisbursement.disbursement.id, updates)}
          onClose={() => setEditDisbursement(null)}
        />
      )}
    </div>
  );
}
