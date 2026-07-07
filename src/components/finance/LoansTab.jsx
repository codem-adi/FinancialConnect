import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Trash2, Pencil, X, Banknote, ArrowDownCircle, CreditCard,
  Clock, TrendingDown, IndianRupee, ChevronDown, ChevronUp, AlertCircle, ScrollText, Star,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useUiSection } from '../../hooks/useUiSection';
import { formatIndianCurrency, formatPercent, formatRate, formatMonthlyRate, sanitizeNumbers, toNum, cn } from '../../lib/utils';
import {
  computeLoanStats, createEmptyLoan, normalizeLoan, LOAN_TYPES, calculateEMI,
  previewDisbursement, applyPrepayment, updatePrepayment, removePrepayment,
  previewPrepaymentImpact, getPrepaymentSavingsReport,
  calculateInterestSavedForDate, getPrepayments, formatPayoffAcceleration, formatDuration,
  getEmiPrincipal, getDisbursedPrincipal, EMI_BASIS, getLoanMonthlyOutflow,
  computeMonthlyPaymentBreakdown, buildLoanBankStatement, getMaxPrepaymentAmount,
  getManualEmiPayments, getPaidEmiCount, MAX_TENURE_MONTHS, formatManualEmiPaymentsSummary,
  clampManualEmiDate, getManualEmiDateBounds,
} from '../../lib/loanCalculations';
import {
  buildLoanAudit, buildLoanDeleteAudit, buildPrepaymentAudit, buildDisburseAudit,
} from '../../lib/auditSummaries';
import { Card, Btn, InputField, Badge, ProgressBar, StatCard, ConfirmDialog, PageHeader } from '../ui';

function getLoanPrincipalTaken(stats) {
  if (stats.loanCategory === 'revolving') {
    return toNum(stats.creditLimit) || toNum(stats.statementBalance);
  }
  return toNum(stats.disbursedPrincipal) || toNum(stats.loanAmount) || 0;
}

function DashboardStatCard({ label, value, sub, color = 'indigo', onClick, active, footer }) {
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
      {sub && <p className="text-[9px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 line-clamp-2 sm:line-clamp-3">{sub}</p>}
      {footer}
    </Tag>
  );
}

function LoanStatCell({ label, value, sub, valueClassName }) {
  return (
    <div className="p-2 sm:p-3 text-center min-w-0">
      <p className="text-[9px] sm:text-[10px] uppercase text-slate-500 truncate">{label}</p>
      <p className={cn('text-xs sm:text-lg font-bold leading-tight mt-0.5 break-words', valueClassName)}>{value}</p>
      {sub && <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function EmiBreakdownPanel({ items, total }) {
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
  }), { interest: 0, principal: 0, extra: 0 });

  return (
    <Card className="!p-0 overflow-hidden border-indigo-200 dark:border-indigo-800 animate-fade-in">
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/80 dark:bg-indigo-950/30">
        <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">Monthly payment split by loan</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {formatIndianCurrency(total, false)}/mo total · {formatIndianCurrency(totals.interest, false)} interest · {formatIndianCurrency(totals.principal, false)} principal
          {totals.extra > 0 && ` · +${formatIndianCurrency(totals.extra, false)} extra principal`}
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
                  </div>
                  {item.lender && <p className="text-xs text-slate-500 truncate">{item.lender}</p>}
                  {item.hasManualEmi && item.scheduledEmi !== item.payment && (
                    <p className="text-[10px] text-slate-500 mt-0.5">Bank EMI {formatIndianCurrency(item.scheduledEmi, false)}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-indigo-600 dark:text-indigo-400">{formatIndianCurrency(item.payment, false)}</p>
                  <p className="text-[10px] text-slate-500">{formatPercent(item.pct, 1)} of outflow</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] sm:text-xs">
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 text-center">
                  <p className="text-slate-500">Interest</p>
                  <p className="font-semibold text-amber-700 dark:text-amber-400">{formatIndianCurrency(item.interest, false)}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1.5 text-center">
                  <p className="text-slate-500">Principal</p>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">{formatIndianCurrency(item.principal, false)}</p>
                </div>
                <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1.5 text-center">
                  <p className="text-slate-500">+ Extra</p>
                  <p className={`font-semibold ${item.extra > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                    {item.extra > 0 ? `+${formatIndianCurrency(item.extra, false)}` : '—'}
                  </p>
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
          const closed = item.isClosed || item.actualPayoffMonths <= 0;
          const isDefault = defaultLoanId === item.id;
          return (
            <div key={item.id} className={cn('px-3 sm:px-4 py-2.5 sm:py-3', isDefault && 'bg-emerald-50/60 dark:bg-emerald-950/20')}>
              <div className="flex items-start gap-2 sm:gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: `${typeInfo.color}20`, color: typeInfo.color }}>
                      {typeInfo.label}
                    </span>
                    {isDefault && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium inline-flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-current" />
                        Default
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
                    className="shrink-0 text-[10px] sm:text-xs px-2"
                    onClick={() => setPendingDefault(item)}
                  >
                    <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-0.5 sm:mr-1" />
                    <span className="sm:hidden">Default</span>
                    <span className="hidden sm:inline">Set default</span>
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
                    <p className="text-slate-500">Original</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{formatDuration(item.totalEmis)}</p>
                  </div>
                  <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1.5 text-center">
                    <p className="text-slate-500">Standard EMI left</p>
                    <p className="font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">{formatDuration(item.scheduleTimeRemainingMonths)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1.5 text-center">
                    <p className="text-slate-500">Closes in</p>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatDuration(item.actualPayoffMonths)}</p>
                  </div>
                </div>
              )}
              {!closed && item.monthsSavedVsSchedule > 0 && (
                <p className="text-[10px] text-teal-700 dark:text-teal-400 mt-2 text-right">
                  {formatDuration(item.monthsSavedVsSchedule)} earlier
                  {item.prepaymentCount > 0
                    ? ` · ${formatPercent(item.prepaymentPrincipalPct, 0)} prepaid`
                    : ' · ahead of bank schedule'}
                </p>
              )}
              {!closed && item.monthsSavedVsSchedule <= 0 && (
                <p className="text-[10px] text-slate-500 mt-2 text-right">Same as standard EMI schedule</p>
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

function InterestBreakdownPanel({ items, total }) {
  if (items.length === 0) {
    return (
      <Card className="!p-4 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
        <p className="text-sm text-slate-500 text-center">No interest paid yet</p>
      </Card>
    );
  }
  return (
    <Card className="!p-0 overflow-hidden border-amber-200 dark:border-amber-800 animate-fade-in">
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 dark:border-slate-800 bg-amber-50/80 dark:bg-amber-950/30">
        <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">Interest paid by loan</p>
        <p className="text-xs text-slate-500 mt-0.5">Lifetime total {formatIndianCurrency(total)}</p>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((item) => {
          const typeInfo = LOAN_TYPES[item.loanType] || LOAN_TYPES.other;
          return (
            <div key={item.id} className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: `${typeInfo.color}20`, color: typeInfo.color }}>
                    {typeInfo.label}
                  </span>
                </div>
                {item.lender && <p className="text-xs text-slate-500 truncate">{item.lender}</p>}
                {item.monthlyInterest > 0 && (
                  <p className="text-[10px] text-slate-500 mt-0.5">~{formatIndianCurrency(item.monthlyInterest, false)}/mo interest now</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-amber-600 dark:text-amber-400">{formatIndianCurrency(item.interestPaid)}</p>
                <p className="text-[10px] text-slate-500">{formatPercent(item.pct, 1)} of total</p>
              </div>
              <div className="w-16 sm:w-24 shrink-0 hidden sm:block">
                <ProgressBar value={item.pct} color="#f59e0b" height="h-1.5" />
              </div>
            </div>
          );
        })}
      </div>
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

function MetricBox({ label, value, sub, accent }) {
  return (
    <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 min-w-0">
      <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-500 font-medium truncate">{label}</p>
      <p className={cn('text-sm sm:text-lg font-bold mt-0.5 leading-tight break-words', accent || 'text-slate-800 dark:text-slate-100')}>{value}</p>
      {sub && <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 line-clamp-2">{sub}</p>}
    </div>
  );
}

function CompactMetricTable({ rows, className }) {
  return (
    <div className={cn('sm:hidden overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30', className)}>
      <table className="w-full text-[11px]">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-slate-100 dark:border-slate-800 first:border-t-0">
              <td className="px-2.5 py-1.5 text-slate-500 font-medium align-top w-[44%]">{row.label}</td>
              <td className={cn('px-2.5 py-1.5 text-right font-semibold tabular-nums align-top', row.accent || 'text-slate-800 dark:text-slate-100')}>
                <div>{row.value}</div>
                {row.sub && <div className="text-[10px] font-normal text-slate-500 mt-0.5 leading-snug">{row.sub}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoanDetailsMetrics({ stats }) {
  const rows = [
    { label: 'EMI Principal', value: formatIndianCurrency(stats.emiPrincipal), sub: stats.emiBasis === 'sanctioned' ? 'Sanctioned basis' : 'Disbursed basis' },
    { label: 'Disbursed', value: formatIndianCurrency(stats.disbursed) },
    { label: 'EMIs Elapsed', value: `${stats.emisPaid} / ${stats.totalEmis}`, sub: `${stats.remainingEmis} on schedule · auto` },
    { label: 'Principal Paid', value: formatIndianCurrency(stats.principalPaid), accent: 'text-emerald-600' },
    { label: 'Interest Paid', value: formatIndianCurrency(stats.interestPaid), accent: 'text-amber-600' },
    { label: 'Remaining Interest', value: formatIndianCurrency(stats.remainingInterest || 0), accent: 'text-orange-500' },
    { label: 'Prepayments', value: formatIndianCurrency(stats.prepaymentTotal), sub: `${stats.prepaymentCount} payment(s)`, accent: 'text-teal-600' },
    { label: 'Undisbursed', value: formatIndianCurrency(stats.undisbursed), accent: 'text-amber-500' },
  ];

  return (
    <>
      <CompactMetricTable rows={rows} />
      <div className="hidden sm:grid sm:grid-cols-4 gap-2 sm:gap-3">
        {rows.map((row) => (
          <MetricBox key={row.label} label={row.label} value={row.value} sub={row.sub} accent={row.accent} />
        ))}
      </div>
    </>
  );
}

function LoanClosingTimelineCard({ stats }) {
  const rows = [
    {
      label: 'Original tenure',
      value: formatDuration(stats.totalEmis),
      sub: `${stats.totalEmis} monthly EMIs`,
    },
    {
      label: 'Left on standard EMI',
      value: formatDuration(stats.scheduleTimeRemainingMonths),
      sub: 'Bank schedule to original end',
      accent: 'text-indigo-600',
    },
    {
      label: 'Closes in (actual)',
      value: formatDuration(stats.actualPayoffMonths),
      sub: stats.monthsSavedVsSchedule > 0
        ? `${formatDuration(stats.monthsSavedVsSchedule)} sooner`
        : 'Same as standard EMI schedule',
      accent: 'text-emerald-600',
    },
  ];

  return (
    <Card className="!p-2.5 sm:!p-4 border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20">
      <p className="text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 sm:mb-3 px-0.5">Loan closing timeline</p>
      <CompactMetricTable
        rows={rows}
        className="!bg-white/70 dark:!bg-slate-900/50 border-indigo-100 dark:border-indigo-900/40"
      />
      <div className="hidden sm:grid sm:grid-cols-3 gap-2 sm:gap-3 text-sm">
        <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-white/70 dark:bg-slate-900/50">
          <p className="text-[9px] sm:text-[10px] uppercase text-slate-500">Original tenure</p>
          <p className="text-sm sm:text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">{formatDuration(stats.totalEmis)}</p>
          <p className="text-[9px] sm:text-[10px] text-slate-500">{stats.totalEmis} monthly EMIs</p>
        </div>
        <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-white/70 dark:bg-slate-900/50">
          <p className="text-[9px] sm:text-[10px] uppercase text-slate-500">Left on standard EMI</p>
          <p className="text-sm sm:text-lg font-bold text-indigo-600 tabular-nums">{formatDuration(stats.scheduleTimeRemainingMonths)}</p>
          <p className="text-[9px] sm:text-[10px] text-slate-500">Bank schedule to original end</p>
        </div>
        <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-white/70 dark:bg-slate-900/50">
          <p className="text-[9px] sm:text-[10px] uppercase text-slate-500">Closes in (actual)</p>
          <p className="text-sm sm:text-lg font-bold text-emerald-600 tabular-nums">{formatDuration(stats.actualPayoffMonths)}</p>
          <p className="text-[9px] sm:text-[10px] text-slate-500">
            {stats.monthsSavedVsSchedule > 0
              ? `${formatDuration(stats.monthsSavedVsSchedule)} sooner · prepay + lower balance`
              : 'Same as standard EMI schedule'}
          </p>
        </div>
      </div>
      {stats.prepaymentPrincipalPct > 0 && (
        <p className="text-[10px] sm:text-xs text-teal-700 dark:text-teal-400 mt-2 sm:mt-3 px-0.5 leading-snug">
          Prepayments: {formatIndianCurrency(stats.prepaymentTotal)} ({formatPercent(stats.prepaymentPrincipalPct, 1)} of loan drawn)
          {stats.monthsSavedVsSchedule > 0 && (
            <span className="hidden sm:inline">{` — closes ${formatDuration(stats.monthsSavedVsSchedule)} earlier than standard EMI schedule`}</span>
          )}
          {stats.monthsSavedVsSchedule > 0 && (
            <span className="sm:hidden">{` · ${formatDuration(stats.monthsSavedVsSchedule)} earlier`}</span>
          )}
        </p>
      )}
    </Card>
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

function LoanEditModal({ loan, onSave, onClose, genId }) {
  const defaultEmiDate = (l) => l.startDate || new Date().toISOString().split('T')[0];
  const [draft, setDraft] = useState(normalizeLoan(loan));
  const [pendingEmi, setPendingEmi] = useState(() => ({ date: defaultEmiDate(loan), amount: '' }));
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const type = draft.loanType;
  const isRevolving = type === 'credit_card' || type === 'bill';
  const set = (field, value) => setDraft((d) => ({ ...d, [field]: value }));

  useEffect(() => {
    const normalized = normalizeLoan(loan);
    setDraft(normalized);
    setPendingEmi({ date: defaultEmiDate(normalized), amount: '' });
    setShowSaveConfirm(false);
  }, [loan.id]);

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
    return normalizeLoan({
      ...draft,
      ...cleaned,
      disbursedAmount: disbursed,
      loanAmount: disbursed,
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
          ['EMI Basis', EMI_BASIS[original.emiBasis || 'disbursed']?.label, EMI_BASIS[saved.emiBasis || 'disbursed']?.label],
          ['Bank EMI', fmtStat(existingStats.emi, false), fmtStat(newStats.emi, false)],
          ['Monthly outflow', fmtStat(getLoanMonthlyOutflow(existingStats), false), fmtStat(getLoanMonthlyOutflow(newStats), false)],
          ['Outstanding', fmtStat(existingStats.outstanding), fmtStat(newStats.outstanding)],
          ['Time left (with prepay)', formatDuration(existingStats.actualPayoffMonths), formatDuration(newStats.actualPayoffMonths)],
          ['Time left (standard EMI)', formatDuration(existingStats.scheduleTimeRemainingMonths), formatDuration(newStats.scheduleTimeRemainingMonths)],
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 sm:p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold text-base sm:text-lg">{loan.id && loan.name ? 'Edit Loan' : 'Add Loan'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
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
              <InputField
                label="Disbursed (Drawn) Amount"
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
              {tenureExceedsMax && (
                <div className="col-span-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300">
                  Tenure cannot exceed 35 years ({MAX_TENURE_MONTHS} months).
                </div>
              )}
              <p className="col-span-2 text-[10px] text-slate-500">
                EMIs elapsed: {getPaidEmiCount(draft)} (auto from start date)
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
        <div className="flex gap-2 p-5 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Btn onClick={handleSaveClick} className="flex-1" disabled={saveBlocked}>{footerLabel}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
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
    </div>
  );
}

function PrepaymentForm({ loan, onConfirm, onCancel, genId }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [showConfirm, setShowConfirm] = useState(false);

  const impact = useMemo(() => {
    const amt = toNum(amount);
    if (amt <= 0 || !date) return null;
    return previewPrepaymentImpact(loan, amt, date);
  }, [loan, amount, date]);

  const maxAllowed = impact?.maxAllowed ?? getMaxPrepaymentAmount(loan, date);
  const exceedsLimit = toNum(amount) > maxAllowed && toNum(amount) > 0;
  const canApply = impact && impact.prepayAmount > 0 && !impact.exceedsOutstanding;

  const handleApply = () => {
    if (!canApply) return;
    if (!showConfirm) { setShowConfirm(true); return; }
    onConfirm({ id: genId(), date, amount: impact.prepayAmount, type: 'prepayment' });
  };

  const reviewRows = canApply
    ? [
        ['Amount', '—', formatIndianCurrency(impact.prepayAmount)],
        ['Date', '—', date],
        ['Interest saved', '—', formatIndianCurrency(impact.interestSaved, false)],
        ['Closes early by', '—', formatPayoffAcceleration(impact.monthsSavedEarly).value],
        ['New outstanding', fmtStat(impact.currentOutstanding), fmtStat(impact.newOutstanding)],
      ]
    : [];

  return (
    <div className="border-t border-slate-100 dark:border-slate-800 p-4 bg-teal-50/50 dark:bg-teal-900/10">
      <p className="text-sm font-semibold text-teal-800 dark:text-teal-300 mb-3">Record Prepayment</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <InputField label="Prepayment Amount" type="number" value={amount} onChange={setAmount} suffix="₹" />
        <InputField label="Date Applied" type="date" value={date} onChange={setDate} />
      </div>

      {maxAllowed > 0 && (
        <p className="text-xs text-slate-500 mb-3">
          Max prepayment on {date}: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatIndianCurrency(maxAllowed)}</span> (outstanding principal)
        </p>
      )}

      {exceedsLimit && (
        <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          Cannot prepay more than outstanding principal ({formatIndianCurrency(maxAllowed)}).
        </div>
      )}

      {canApply && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 mb-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">Debited from loan principal</span>
            <span className="font-bold text-red-600">− {formatIndianCurrency(impact.prepayAmount, false)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">New outstanding balance</span>
            <span className="font-bold">{formatIndianCurrency(impact.newOutstanding)}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>EMI month {impact.emiMonth}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-emerald-200 dark:border-emerald-700">
            <span className="text-emerald-800 dark:text-emerald-300 font-medium">Loan closes early by</span>
            <span className="font-bold text-emerald-600">{formatPayoffAcceleration(impact.monthsSavedEarly).value}</span>
          </div>
          <p className="text-[10px] text-emerald-700 dark:text-emerald-400">{formatPayoffAcceleration(impact.monthsSavedEarly).sub}</p>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">Interest you save</span>
            <span className="font-bold text-emerald-600">{formatIndianCurrency(impact.interestSaved, false)}</span>
          </div>
          <p className="text-[10px] text-slate-500">Added to Loan & Car Payments in monthly expenses · EMI stays {formatIndianCurrency(impact.emi, false)}/mo</p>
        </div>
      )}

      {showConfirm && canApply && (
        <div className="mb-4">
          <ChangeReviewPanel title="Confirm prepayment" rows={reviewRows} />
        </div>
      )}

      <div className="flex gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-700/80">
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold">Edit prepayment</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
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
        <div className="flex gap-2 p-5 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Btn onClick={handleApply} className="flex-1">
            {showConfirm ? 'Save changes' : confirmRows.length > 0 ? 'Review changes' : 'Save changes'}
          </Btn>
          <Btn variant="ghost" onClick={() => { setShowConfirm(false); onClose(); }}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

function PrepaymentsPanel({
  loan, stats, canEdit, showPrepay, onPrepay, onPrepayConfirm, onPrepayCancel, genId,
  onPrepayEdit, onPrepayDelete, pendingPrepayDeleteId, onConfirmPrepayDelete, onCancelPrepayDelete,
}) {
  const report = useMemo(() => getPrepaymentSavingsReport(loan), [loan]);
  const prepayments = getPrepayments(loan);
  const payoffAccel = formatPayoffAcceleration(report.monthsSaved ?? 0);

  const summaryRows = [
    { label: 'Prepaid', value: formatIndianCurrency(report.totalPrepaid), accent: 'text-teal-600' },
    { label: 'Interest Saved', value: formatIndianCurrency(report.totalSaved, false), accent: 'text-emerald-600' },
    { label: 'Closes Early', value: payoffAccel.value, accent: 'text-indigo-600' },
    { label: 'Outstanding', value: formatIndianCurrency(stats.outstanding), accent: 'text-red-500' },
  ];

  return (
    <div className="space-y-3 sm:space-y-4 animate-fade-in">
      <Card className="!p-2.5 sm:!p-4 border-teal-200 dark:border-teal-800 bg-gradient-to-br from-teal-50/80 to-emerald-50/50 dark:from-teal-950/30 dark:to-emerald-950/20">
        <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
              <ArrowDownCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-600 shrink-0" />
              <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">Prepayments</p>
            </div>
            <p className="hidden sm:block text-xs text-slate-500 max-w-md">
              Extra principal payments reduce your outstanding balance. EMI stays fixed — you close the loan sooner.
            </p>
          </div>
          {canEdit && !stats.isClosed && (
            <Btn size="sm" variant="secondary" className="shrink-0 text-xs" onClick={onPrepay}>
              <Plus className="w-3 h-3 inline mr-1" />
              <span className="hidden sm:inline">Record Prepayment</span>
              <span className="sm:hidden">Record</span>
            </Btn>
          )}
        </div>

        <CompactMetricTable
          rows={summaryRows}
          className="mt-2 !bg-white/70 dark:!bg-slate-900/50 border-teal-100 dark:border-teal-900/40"
        />
        <div className="hidden sm:grid sm:grid-cols-4 gap-3 mt-4">
          <div className="text-center p-2 rounded-lg bg-white/70 dark:bg-slate-900/50">
            <p className="text-[10px] uppercase text-slate-500">Prepaid</p>
            <p className="font-bold text-teal-600">{formatIndianCurrency(report.totalPrepaid)}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-white/70 dark:bg-slate-900/50">
            <p className="text-[10px] uppercase text-slate-500">Interest Saved</p>
            <p className="font-bold text-emerald-600">{formatIndianCurrency(report.totalSaved, false)}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-white/70 dark:bg-slate-900/50">
            <p className="text-[10px] uppercase text-slate-500">Closes Early</p>
            <p className="font-bold text-indigo-600 text-sm">{payoffAccel.value}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-white/70 dark:bg-slate-900/50">
            <p className="text-[10px] uppercase text-slate-500">Outstanding</p>
            <p className="font-bold text-red-500">{formatIndianCurrency(stats.outstanding)}</p>
          </div>
        </div>
      </Card>

      {showPrepay && (
        <PrepaymentForm loan={loan} genId={genId} onConfirm={onPrepayConfirm} onCancel={onPrepayCancel} />
      )}

      {prepayments.length === 0 ? (
        <Card className="!p-6 sm:!p-8 text-center border-dashed">
          <ArrowDownCircle className="w-8 h-8 sm:w-10 sm:h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-xs sm:text-sm text-slate-500">No prepayments recorded yet</p>
          {canEdit && !stats.isClosed && !showPrepay && (
            <Btn size="sm" variant="secondary" className="mt-3" onClick={onPrepay}>Record your first prepayment</Btn>
          )}
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-[11px] sm:text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-left">
                <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium text-slate-500">Date</th>
                <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium text-slate-500 text-right">Amount</th>
                <th className="hidden sm:table-cell px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium text-slate-500">Closes Early</th>
                <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium text-slate-500 text-right">Saved</th>
                {canEdit && <th className="px-1 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium text-slate-500 w-14 sm:w-20" />}
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => {
                const p = prepayments.find((x) => x.id === item.id);
                const earlyLabel = item.monthsSavedEarly > 0 ? formatPayoffAcceleration(item.monthsSavedEarly).value : '—';
                return (
                  <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 align-top">
                      <p className="font-medium">{item.date}</p>
                      <p className="text-[10px] text-slate-500 leading-snug">
                        EMI #{item.emiMonth}
                        {item.monthsSavedEarly > 0 && (
                          <span className="sm:hidden text-emerald-600"> · {earlyLabel}</span>
                        )}
                      </p>
                    </td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-right font-medium tabular-nums align-top">{formatIndianCurrency(item.amount, false)}</td>
                    <td className="hidden sm:table-cell px-2 sm:px-3 py-1.5 sm:py-2.5 text-emerald-600 font-medium align-top">
                      {earlyLabel}
                    </td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-right font-bold text-emerald-600 tabular-nums align-top">{formatIndianCurrency(item.interestSaved, false)}</td>
                    {canEdit && (
                      <td className="px-1 sm:px-3 py-1.5 sm:py-2.5 align-top">
                        <div className="flex gap-0.5 sm:gap-1 justify-end">
                          <Btn variant="ghost" size="sm" className="!px-1.5 sm:!px-2" onClick={() => onPrepayEdit(p)}><Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></Btn>
                          <Btn variant="ghost" size="sm" className="!px-1.5 sm:!px-2 !text-red-500" onClick={() => onPrepayDelete(p)}><Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></Btn>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20">
                <td colSpan={2} className="px-2 sm:px-3 py-1.5 sm:py-2.5 font-semibold text-[11px] sm:text-sm sm:hidden">Total saved</td>
                <td colSpan={3} className="hidden sm:table-cell px-2 sm:px-3 py-1.5 sm:py-2.5 font-semibold text-sm">Total saved</td>
                <td className="px-2 sm:px-3 py-1.5 sm:py-2.5 text-right font-bold text-emerald-600 tabular-nums">{formatIndianCurrency(report.totalSaved, false)}</td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          </table>
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

      {report.monthsSaved > 0 && (
        <p className="text-xs text-slate-500 leading-relaxed">
          Your prepayments move loan closure ~{formatDuration(report.monthsSaved)} ahead
          {report.monthsToPayoffWithoutPrepay > report.monthsToPayoff && (
            <> ({formatDuration(report.monthsToPayoffWithoutPrepay)} → {formatDuration(report.monthsToPayoff)} remaining)</>
          )}
        </p>
      )}
    </div>
  );
}

const STATEMENT_TAG_STYLES = {
  emi: { label: 'EMI', className: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' },
  prepayment: { label: 'Prepayment', className: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' },
};

const STATEMENT_PAGE_SIZES = [15, 25, 50, 100];

function BankStatementPanel({ loan }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const entries = useMemo(() => buildLoanBankStatement(loan), [loan]);

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
      <Card className="!p-8 text-center border-dashed">
        <ScrollText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-500">No statement entries yet. Set a start date and disbursed amount.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <p className="text-xs text-slate-500">
        Interest debited first, then EMI/prepayment credited. Newest entries first.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs">
              <th className="px-3 py-2.5 font-medium text-slate-500">Date</th>
              <th className="px-3 py-2.5 font-medium text-slate-500">Type</th>
              <th className="px-3 py-2.5 font-medium text-slate-500 text-right">Opening</th>
              <th className="px-3 py-2.5 font-medium text-slate-500 text-right">Int. Debit</th>
              <th className="px-3 py-2.5 font-medium text-slate-500 text-right">Payment</th>
              <th className="px-3 py-2.5 font-medium text-slate-500 text-right">Principal</th>
              <th className="px-3 py-2.5 font-medium text-slate-500 text-right">+ Extra</th>
              <th className="px-3 py-2.5 font-medium text-slate-500 text-right">Closing</th>
            </tr>
          </thead>
          <tbody>
            {pageEntries.map((entry) => {
              const tagStyle = STATEMENT_TAG_STYLES[entry.tag] || STATEMENT_TAG_STYLES.emi;
              const interestDebit = entry.transactions.find((t) => t.type === 'debit')?.amount || 0;
              const paymentCredit = entry.transactions.find((t) => t.type === 'credit')?.amount || 0;
              return (
                <tr key={entry.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <p className="font-medium">{entry.date}</p>
                    {entry.emiMonth > 0 && (
                      <p className="text-[10px] text-slate-500">EMI #{entry.emiMonth}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase whitespace-nowrap ${tagStyle.className}`}>
                      {tagStyle.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatIndianCurrency(entry.openingBalance)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-red-600">
                    {interestDebit > 0 ? `−${formatIndianCurrency(interestDebit, false)}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-emerald-600">
                    {paymentCredit > 0 ? `+${formatIndianCurrency(paymentCredit, false)}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {entry.principal > 0 ? formatIndianCurrency(entry.principal, false) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-indigo-600">
                    {entry.extraPrincipal > 0 ? `+${formatIndianCurrency(entry.extraPrincipal, false)}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap font-semibold text-red-600">
                    {formatIndianCurrency(entry.closingBalance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
        <p>
          Showing <span className="font-medium text-slate-700 dark:text-slate-300">{rangeStart}–{rangeEnd}</span> of{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">{entries.length}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs"
            >
              {STATEMENT_PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
            >
              Prev
            </Btn>
            <span className="px-2 tabular-nums">
              {safePage} / {totalPages}
            </span>
            <Btn
              size="sm"
              variant="ghost"
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

function LoanClosingSummary({ stats }) {
  const closed = stats.isClosed || stats.actualPayoffMonths <= 0;
  const hasAccel = stats.monthsSavedVsSchedule > 0;

  if (closed) {
    return (
      <div className="col-span-2 p-2 sm:p-3 text-center border-t sm:border-t-0 border-slate-100 dark:border-slate-800 bg-white/40 dark:bg-slate-900/20">
        <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-slate-500 mb-0.5 sm:mb-1">Loan closing</p>
        <p className="text-sm sm:text-lg font-bold text-emerald-600">Paid off</p>
        <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">
          {formatDuration(stats.totalEmis)} original tenure
        </p>
      </div>
    );
  }

  return (
    <div className="col-span-2 p-2 sm:p-3 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 bg-white/40 dark:bg-slate-900/20">
      <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-slate-500 mb-1 sm:mb-2 text-center">Loan closing</p>
      <div className="sm:hidden text-center space-y-0.5">
        <p className={`text-sm font-bold tabular-nums ${hasAccel ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-100'}`}>
          {formatDuration(stats.actualPayoffMonths)}
        </p>
        <p className="text-[9px] text-slate-500 leading-snug">
          Std {formatDuration(stats.scheduleTimeRemainingMonths)}
          {hasAccel ? ` · ${formatDuration(stats.monthsSavedVsSchedule)} earlier` : ''}
        </p>
      </div>
      <div className="hidden sm:block space-y-2 text-xs max-w-xs mx-auto">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500 shrink-0">Original loan</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
            {formatDuration(stats.totalEmis)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500 shrink-0">Left on standard EMI</span>
          <span className="font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
            {formatDuration(stats.scheduleTimeRemainingMonths)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700">
          <span className="text-slate-700 dark:text-slate-300 font-medium shrink-0">Closes in (actual)</span>
          <span className={`font-bold tabular-nums ${hasAccel ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-100'}`}>
            {formatDuration(stats.actualPayoffMonths)}
          </span>
        </div>
        {hasAccel ? (
          <p className="text-[10px] text-teal-700 dark:text-teal-400 text-right leading-snug">
            {formatDuration(stats.monthsSavedVsSchedule)} earlier
            {stats.prepaymentCount > 0
              ? ` · ${formatPercent(stats.prepaymentPrincipalPct, 0)} prepaid`
              : ' · ahead of bank schedule'}
          </p>
        ) : (
          <p className="text-[10px] text-slate-500 text-right">Same as standard EMI schedule</p>
        )}
      </div>
    </div>
  );
}

function EmiLoanCard({ loan, stats, expanded, onToggle, onEdit, onDelete, onDisburse, onPrepay, showPrepay, onPrepayConfirm, onPrepayCancel, onPrepayEdit, onPrepayDelete, pendingPrepayDeleteId, onConfirmPrepayDelete, onCancelPrepayDelete, genId, pendingAction, onConfirmDisburse, onConfirmDelete, onCancelAction, detailTab, onDetailTabChange, canEdit }) {
  const typeInfo = LOAN_TYPES[stats.loanType] || LOAN_TYPES.other;
  const savingsReport = useMemo(() => getPrepaymentSavingsReport(loan), [loan]);
  const isDisbursePending = pendingAction?.type === 'disburse';
  const isDeletePending = pendingAction?.type === 'delete';

  const disbursePreview = isDisbursePending ? previewDisbursement(loan) : null;
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
                {loan.lender || '—'} · {formatRate(stats.annualRate)}
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
        <LoanStatCell label="Rate" value={formatRate(stats.annualRate)} sub={formatMonthlyRate(stats.annualRate)} />
        <LoanStatCell label="Outstanding" value={formatIndianCurrency(stats.outstanding)} sub={stats.disbursedPrincipal > 0 ? `${formatPercent((stats.outstanding / stats.disbursedPrincipal) * 100, 0)} left` : undefined} valueClassName="text-red-500" />
        <LoanStatCell
          label="This Month"
          value={formatIndianCurrency(stats.monthlyTotalPrincipal || 0, false)}
          sub={stats.monthlyExtraPrincipal > 0 ? `+${formatIndianCurrency(stats.monthlyExtraPrincipal, false)} extra` : 'principal'}
          valueClassName="text-emerald-600"
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

          {detailTab === 'prepayments' ? (
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
            <div className="flex gap-1 justify-end">
              <Btn variant="ghost" size="sm" onClick={onEdit}><Pencil className="w-4 h-4" /></Btn>
              <Btn variant="ghost" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4 text-red-500" /></Btn>
            </div>
          )}

          <LoanDetailsMetrics stats={stats} />

          <LoanClosingTimelineCard stats={stats} />

          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-slate-500">Repayment Progress</span>
              <span className="font-bold text-emerald-600">{stats.repaymentProgress.toFixed(1)}%</span>
            </div>
            <ProgressBar value={stats.repaymentProgress} color={typeInfo.color} height="h-2.5" />
          </div>

          {canEdit && isDisbursePending && disbursePreview && (
            <ChangeReviewPanel
              title="Confirm full disbursement"
              rows={[
                ['Disbursed Amount', fmtStat(disbursePreview.before.disbursed), fmtStat(disbursePreview.disbursedAmount)],
                ['Monthly EMI', fmtStat(disbursePreview.before.emi, false), fmtStat(disbursePreview.after.emi, false)],
                ['Outstanding', fmtStat(disbursePreview.before.outstanding), fmtStat(disbursePreview.after.outstanding)],
              ]}
            />
          )}

          {canEdit && (
            <div className={`flex flex-wrap gap-2${isDisbursePending ? ' pt-3 mt-1 border-t border-slate-200/80 dark:border-slate-700/80' : ''}`}>
              {stats.undisbursed > 0 && (
                isDisbursePending ? (
                  <>
                    <Btn size="sm" variant="secondary" onClick={onConfirmDisburse}><Banknote className="w-3 h-3 inline mr-1" />Confirm Disbursement</Btn>
                    <Btn size="sm" variant="ghost" onClick={onCancelAction}>Cancel</Btn>
                  </>
                ) : (
                  <Btn size="sm" variant="secondary" onClick={onDisburse}><Banknote className="w-3 h-3 inline mr-1" />Full Disbursement</Btn>
                )
              )}
            </div>
          )}

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
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingPrepayDelete, setPendingPrepayDelete] = useState(null);
  const [editPrepayment, setEditPrepayment] = useState(null);
  const [showEmiBreakdown, setShowEmiBreakdown] = useState(false);
  const [showInterestBreakdown, setShowInterestBreakdown] = useState(false);
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

    const emiBreakdown = active
      .filter(({ stats }) => getLoanMonthlyOutflow(stats) > 0)
      .map(({ loan, stats }) => ({
        id: loan.id,
        name: loan.name || 'Unnamed',
        lender: loan.lender,
        loanType: stats.loanType,
        payment: getLoanMonthlyOutflow(stats),
        scheduledEmi: stats.scheduledEmi || stats.emi,
        hasManualEmi: stats.hasManualEmi,
        interest: stats.monthlyInterest || 0,
        principal: stats.monthlyScheduledPrincipal || 0,
        extra: stats.monthlyExtraPrincipal || 0,
        pct: totalMonthlyEmi > 0 ? (getLoanMonthlyOutflow(stats) / totalMonthlyEmi) * 100 : 0,
      }))
      .sort((a, b) => b.payment - a.payment);

    const interestBreakdown = allStats
      .filter(({ stats }) => (stats.interestPaid || 0) > 0)
      .map(({ loan, stats }) => ({
        id: loan.id,
        name: loan.name || 'Unnamed',
        lender: loan.lender,
        loanType: stats.loanType,
        interestPaid: stats.interestPaid || 0,
        monthlyInterest: stats.monthlyInterest || 0,
        pct: totalInterestPaid > 0 ? ((stats.interestPaid || 0) / totalInterestPaid) * 100 : 0,
      }))
      .sort((a, b) => b.interestPaid - a.interestPaid);

    const closingBreakdown = allStats
      .filter(({ stats }) => stats.loanCategory !== 'revolving')
      .map(({ loan, stats }) => ({
        id: loan.id,
        name: loan.name || 'Unnamed',
        lender: loan.lender,
        loanType: stats.loanType,
        isClosed: stats.isClosed,
        totalEmis: stats.totalEmis,
        scheduleTimeRemainingMonths: stats.scheduleTimeRemainingMonths,
        actualPayoffMonths: stats.actualPayoffMonths,
        monthsSavedVsSchedule: stats.monthsSavedVsSchedule,
        prepaymentCount: stats.prepaymentCount,
        prepaymentPrincipalPct: stats.prepaymentPrincipalPct,
      }))
      .sort((a, b) => {
        if (a.isClosed && !b.isClosed) return 1;
        if (!a.isClosed && b.isClosed) return -1;
        return b.actualPayoffMonths - a.actualPayoffMonths;
      });

    const activeClosing = closingBreakdown.filter((item) => !item.isClosed);
    const lastLoanClosesMonths = activeClosing.length > 0
      ? Math.max(...activeClosing.map((item) => item.actualPayoffMonths))
      : 0;
    const maxScheduleRemaining = activeClosing.length > 0
      ? Math.max(...activeClosing.map((item) => item.scheduleTimeRemainingMonths))
      : 0;
    const anyClosingAccel = activeClosing.some((item) => item.monthsSavedVsSchedule > 0);

    const hasExplicitDefault = !!(defaultClosingLoanId && closingBreakdown.some((item) => item.id === defaultClosingLoanId));
    let featuredClosingLoan = hasExplicitDefault
      ? closingBreakdown.find((item) => item.id === defaultClosingLoanId)
      : null;
    if (!featuredClosingLoan && activeClosing.length > 0) {
      featuredClosingLoan = activeClosing.reduce((best, item) => (
        item.actualPayoffMonths > best.actualPayoffMonths ? item : best
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
      interestBreakdown,
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

  const handleConfirmDisburse = (loanId) => {
    const loan = loans.find((l) => l.id === loanId);
    const amt = toNum(loan?.totalSanctioned) || toNum(loan?.loanAmount);
    saveLoans(loans.map((l) => {
      if (l.id !== loanId) return l;
      const updated = { ...l, disbursedAmount: amt, loanAmount: amt };
      const fixedEmi = Math.round(calculateEMI(getEmiPrincipal(updated), toNum(updated.interestRate), toNum(updated.tenureMonths)));
      return { ...updated, emi: fixedEmi };
    }), buildDisburseAudit(loan, amt));
    setPendingAction(null);
  };

  const handleConfirmDelete = (loanId) => {
    const loan = loans.find((l) => l.id === loanId);
    saveLoans(loans.filter((l) => l.id !== loanId), buildLoanDeleteAudit(loan));
    if (defaultClosingLoanId === loanId) {
      setLoansUi({ defaultClosingLoanId: null });
    }
    setPendingAction(null);
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-4">
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
          label="Monthly EMI Outflow"
          value={formatIndianCurrency(summary.totalMonthlyEmi, false)}
          sub={showEmiBreakdown
            ? 'Tap to hide payment split'
            : `${formatIndianCurrency(summary.totalMonthlyInterest, false)} interest · ${formatIndianCurrency(summary.totalMonthlyPrincipal, false)} principal/mo`}
          color="indigo"
          onClick={() => { setShowEmiBreakdown((v) => !v); setShowInterestBreakdown(false); setShowClosingBreakdown(false); }}
          active={showEmiBreakdown}
        />
        <DashboardStatCard
          label="Interest Paid"
          value={formatIndianCurrency(summary.totalInterestPaid)}
          sub={showInterestBreakdown ? 'Tap to hide loan split' : 'Tap to see interest by loan'}
          color="amber"
          onClick={() => { setShowInterestBreakdown((v) => !v); setShowEmiBreakdown(false); setShowClosingBreakdown(false); }}
          active={showInterestBreakdown}
        />
        <DashboardStatCard
          label="Loan closing"
          value={(() => {
            const featured = summary.featuredClosingLoan;
            if (!featured) return 'Paid off';
            const closed = featured.isClosed || featured.actualPayoffMonths <= 0;
            return closed ? 'Paid off' : formatDuration(featured.actualPayoffMonths);
          })()}
          sub={showClosingBreakdown
            ? 'Tap to hide'
            : (() => {
                const featured = summary.featuredClosingLoan;
                if (!featured) return 'All EMI loans paid off';
                const closed = featured.isClosed || featured.actualPayoffMonths <= 0;
                const label = summary.hasExplicitDefault ? featured.name : featured.name;
                if (closed) return `${label} · paid off`;
                const accel = featured.monthsSavedVsSchedule > 0
                  ? ` · ${formatDuration(featured.monthsSavedVsSchedule)} earlier`
                  : '';
                return `${label} · Std ${formatDuration(featured.scheduleTimeRemainingMonths)}${accel}`;
              })()}
          color="green"
          onClick={() => { setShowClosingBreakdown((v) => !v); setShowEmiBreakdown(false); setShowInterestBreakdown(false); }}
          active={showClosingBreakdown}
        />
      </div>

      {showEmiBreakdown && (
        <EmiBreakdownPanel items={summary.emiBreakdown} total={summary.totalMonthlyEmi} />
      )}

      {showInterestBreakdown && (
        <InterestBreakdownPanel items={summary.interestBreakdown} total={summary.totalInterestPaid} />
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
              onDisburse={() => { setExpandedForLoan(loan.id, true); setPendingAction({ type: 'disburse', loanId: loan.id }); }}
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
              onConfirmDisburse={() => handleConfirmDisburse(loan.id)}
              onConfirmDelete={() => handleConfirmDelete(loan.id)}
              onCancelAction={() => setPendingAction(null)}
              detailTab={detailTab}
              onDetailTabChange={setDetailTab}
              canEdit={canEdit}
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
    </div>
  );
}
