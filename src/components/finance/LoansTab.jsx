import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Trash2, Pencil, X, Banknote, ArrowDownCircle, CreditCard,
  Clock, TrendingDown, IndianRupee, ChevronDown, ChevronUp, AlertCircle, PiggyBank,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useUiSection } from '../../hooks/useUiSection';
import { formatIndianCurrency, formatPercent, formatRate, formatMonthlyRate, sanitizeNumbers, toNum } from '../../lib/utils';
import {
  computeLoanStats, createEmptyLoan, normalizeLoan, LOAN_TYPES, calculateEMI,
  previewDisbursement, applyPrepayment, updatePrepayment, removePrepayment,
  previewPrepaymentImpact, getPrepaymentSavingsReport,
  calculateInterestSavedForDate, getPrepayments, formatPayoffAcceleration, formatDuration,
  getEmiPrincipal, getDisbursedPrincipal, EMI_BASIS,
} from '../../lib/loanCalculations';
import {
  buildLoanAudit, buildLoanDeleteAudit, buildPrepaymentAudit, buildDisburseAudit,
} from '../../lib/auditSummaries';
import { Card, Btn, InputField, Badge, ProgressBar, StatCard, ConfirmDialog, PageHeader } from '../ui';

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
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${accent || 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function fmtStat(v, currency = true) {
  return currency ? formatIndianCurrency(v) : String(v);
}

function LoanEditModal({ loan, onSave, onClose }) {
  const [draft, setDraft] = useState(normalizeLoan(loan));
  const [showConfirm, setShowConfirm] = useState(false);
  const type = draft.loanType;
  const isRevolving = type === 'credit_card' || type === 'bill';
  const set = (field, value) => setDraft((d) => ({ ...d, [field]: value }));

  const previewEmi = useMemo(() => {
    if (isRevolving) return toNum(draft.minDue);
    return Math.round(calculateEMI(getEmiPrincipal(draft), draft.interestRate, draft.tenureMonths));
  }, [draft, isRevolving]);

  const emiPrincipalPreview = useMemo(() => getEmiPrincipal(draft), [draft]);
  const disbursedPreview = useMemo(() => getDisbursedPrincipal(draft), [draft]);
  const undisbursedPreview = Math.max(0, toNum(draft.totalSanctioned) - disbursedPreview);

  const buildSaved = () => {
    const numericFields = isRevolving
      ? ['creditLimit', 'totalSanctioned', 'statementBalance', 'loanAmount', 'disbursedAmount', 'minDue', 'interestRate']
      : ['totalSanctioned', 'loanAmount', 'disbursedAmount', 'interestRate', 'tenureMonths'];
    const cleaned = sanitizeNumbers({ ...draft }, numericFields);
    return {
      ...cleaned,
      disbursedAmount: toNum(cleaned.disbursedAmount) || toNum(cleaned.loanAmount),
      loanAmount: toNum(cleaned.disbursedAmount) || toNum(cleaned.loanAmount),
      emiBasis: draft.emiBasis || 'disbursed',
      emi: previewEmi,
    };
  };

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
        ['Interest Rate', formatRate(original.interestRate), formatRate(saved.interestRate)],
        ['Due Date', original.dueDate || '—', saved.dueDate || '—'],
      );
    } else if (newStats && existingStats) {
      pairs.push(
        ['Sanctioned', fmtStat(original.totalSanctioned), fmtStat(saved.totalSanctioned)],
        ['Disbursed', fmtStat(original.disbursedAmount || original.loanAmount), fmtStat(saved.disbursedAmount)],
        ['Interest Rate', formatRate(original.interestRate), formatRate(saved.interestRate)],
        ['Tenure', `${original.tenureMonths} mo`, `${saved.tenureMonths} mo`],
        ['Start Date', original.startDate || '—', saved.startDate || '—'],
        ['EMIs Paid', String(original.emisPaid ?? 'auto'), String(saved.emisPaid ?? 'auto')],
        ['EMI Basis', EMI_BASIS[original.emiBasis || 'disbursed']?.label, EMI_BASIS[saved.emiBasis || 'disbursed']?.label],
        ['Monthly EMI', fmtStat(existingStats.emi, false), fmtStat(newStats.emi, false)],
        ['Outstanding', fmtStat(existingStats.outstanding), fmtStat(newStats.outstanding)],
        ['Time Remaining', existingStats.timeRemaining, newStats.timeRemaining],
      );
    }

    return pairs;
  }, [original, draft, previewEmi, newStats, existingStats, isRevolving, loan.id, loan.name]);

  const confirmRows = useMemo(() => buildChangeRows(confirmPairs), [confirmPairs]);

  const isNewLoan = !loan.id || !loan.name;

  useEffect(() => {
    setShowConfirm(false);
  }, [draft]);

  const handleSave = () => {
    if (isNewLoan) {
      onSave(buildSaved());
      onClose();
      return;
    }
    if (!showConfirm) {
      if (confirmRows.length === 0) {
        onClose();
        return;
      }
      setShowConfirm(true);
      return;
    }
    onSave(buildSaved());
    onClose();
  };

  const footerLabel = isNewLoan
    ? 'Add Loan'
    : showConfirm
      ? 'Save Loan'
      : confirmRows.length > 0
        ? 'Review Changes'
        : 'Save Loan';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold text-lg">{loan.id && loan.name ? 'Edit Loan' : 'Add Loan'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
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
              <InputField label="Interest Rate" type="number" value={draft.interestRate} onChange={(v) => set('interestRate', v)} suffix="% p.a." step={0.01} showWords={false} emptyZero={false} />
              <InputField label="Due Date" type="date" value={draft.dueDate || ''} onChange={(v) => set('dueDate', v)} className="col-span-2" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Sanctioned Amount" type="number" value={draft.totalSanctioned} onChange={(v) => set('totalSanctioned', v)} suffix="₹" />
              <InputField label="Disbursed (Drawn) Amount" type="number" value={draft.disbursedAmount} onChange={(v) => { set('disbursedAmount', v); set('loanAmount', v); }} suffix="₹" />
              {undisbursedPreview > 0 && (
                <div className="col-span-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-800 dark:text-amber-300">
                  Undisbursed: {formatIndianCurrency(undisbursedPreview)} — not included in EMI when using Disbursed basis
                </div>
              )}
              <InputField label="Interest Rate" type="number" value={draft.interestRate} onChange={(v) => set('interestRate', v)} suffix="% p.a." step={0.01} showWords={false} emptyZero={false} />
              <InputField label="Tenure" type="number" value={draft.tenureMonths} onChange={(v) => set('tenureMonths', v)} suffix="months" showWords={false} emptyZero={false} allowDecimal={false} />
              <InputField label="Start Date" type="date" value={draft.startDate} onChange={(v) => set('startDate', v)} />
              <InputField label="EMIs Paid (auto if blank)" type="number" value={draft.emisPaid ?? ''} onChange={(v) => set('emisPaid', v === '' ? null : v)} showWords={false} allowDecimal={false} />

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
                <p className="text-xs text-slate-500">Monthly EMI on {formatIndianCurrency(emiPrincipalPreview, false)} @ {formatRate(draft.interestRate)}</p>
                <p className="text-xl font-bold text-indigo-600">{previewEmi > 0 ? formatIndianCurrency(previewEmi, false) : '—'}</p>
              </div>
            </div>
          )}
          {showConfirm && confirmRows.length > 0 && (
            <div className="pb-1">
              <ChangeReviewPanel
                title="Confirm loan update — review changes"
                rows={confirmPairs}
              />
            </div>
          )}
        </div>
        <div className="flex gap-2 p-5 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Btn onClick={handleSave} className="flex-1">{footerLabel}</Btn>
          <Btn variant="ghost" onClick={() => { setShowConfirm(false); onClose(); }}>Cancel</Btn>
        </div>
      </div>
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

  const canApply = impact && impact.prepayAmount > 0;

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
    return previewPrepaymentImpact(loan, amt, date);
  }, [loan, amount, date]);

  const confirmPairs = useMemo(() => [
    ['Amount', formatIndianCurrency(prepayment.amount), formatIndianCurrency(amount)],
    ['Date', prepayment.date, date],
    ['Notes', prepayment.notes || '—', notes || '—'],
  ], [prepayment, amount, date, notes]);

  const confirmRows = useMemo(() => buildChangeRows(confirmPairs), [confirmPairs]);

  const handleApply = () => {
    if (!impact || impact.prepayAmount <= 0) return;
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

function PrepaymentsSavingsPanel({
  loan, stats, canEdit, showPrepay, onPrepay, onPrepayConfirm, onPrepayCancel, genId,
  onPrepayEdit, onPrepayDelete, pendingPrepayDeleteId, onConfirmPrepayDelete, onCancelPrepayDelete,
}) {
  const report = useMemo(() => getPrepaymentSavingsReport(loan), [loan]);
  const prepayments = getPrepayments(loan);
  const payoffAccel = formatPayoffAcceleration(report.monthsSaved ?? 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Prepayments reduce principal; interest saved is based on your fixed EMI schedule.</p>
        {canEdit && !stats.isClosed && (
          <Btn size="sm" variant="secondary" onClick={onPrepay}>
            <ArrowDownCircle className="w-3 h-3 inline mr-1" />Record Prepayment
          </Btn>
        )}
      </div>

      {showPrepay && (
        <PrepaymentForm loan={loan} genId={genId} onConfirm={onPrepayConfirm} onCancel={onPrepayCancel} />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
            <div className="flex items-center gap-2 mb-1">
              <PiggyBank className="w-5 h-5" />
              <p className="text-sm font-medium opacity-90">Total Interest Saved</p>
            </div>
            <p className="text-3xl font-bold">{formatIndianCurrency(report.totalSaved, false)}</p>
            <p className="text-xs opacity-80 mt-1">
              {report.items.length} prepayment(s) · {formatIndianCurrency(report.totalPrepaid)} principal prepaid
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MetricBox label="Prepaid Principal" value={formatIndianCurrency(report.totalPrepaid)} accent="text-teal-600" />
            <MetricBox
              label="Closes Early By"
              value={payoffAccel.value}
              sub={report.monthsSaved > 0 ? `${formatDuration(report.monthsToPayoff)} left · ${payoffAccel.sub}` : payoffAccel.sub}
              accent="text-emerald-600"
            />
            <MetricBox label="Outstanding" value={formatIndianCurrency(stats.outstanding)} accent="text-red-500" />
            <MetricBox label="Remaining Interest" value={formatIndianCurrency(stats.remainingInterest || 0)} accent="text-orange-500" />
          </div>

          {report.monthsSaved > 0 && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-3 py-2">
              Your prepayments move loan closure ~{formatDuration(report.monthsSaved)} ahead of the original schedule
              {report.monthsToPayoffWithoutPrepay > report.monthsToPayoff && (
                <> ({formatDuration(report.monthsToPayoffWithoutPrepay)} → {formatDuration(report.monthsToPayoff)} remaining)</>
              )}
            </p>
          )}

          <p className="text-xs text-slate-500 leading-relaxed">
            Interest saved = projected interest on remaining EMIs before prepayment minus after prepayment (fixed EMI, reducing balance).
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Prepayments</p>
          {prepayments.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              No prepayments recorded yet
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 text-left">
                    <th className="px-3 py-2 text-xs font-medium text-slate-500">Date</th>
                    <th className="px-3 py-2 text-xs font-medium text-slate-500">Amount</th>
                    <th className="px-3 py-2 text-xs font-medium text-slate-500">Closes Early</th>
                    <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">Interest Saved</th>
                    {canEdit && <th className="px-3 py-2 text-xs font-medium text-slate-500 w-20" />}
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((item) => {
                    const p = prepayments.find((x) => x.id === item.id);
                    return (
                      <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2.5">
                          <p className="font-medium">{item.date}</p>
                          <p className="text-[10px] text-slate-500">EMI #{item.emiMonth}</p>
                        </td>
                        <td className="px-3 py-2.5 font-medium">{formatIndianCurrency(item.amount, false)}</td>
                        <td className="px-3 py-2.5 text-emerald-600 font-medium">
                          {item.monthsSavedEarly > 0
                            ? formatPayoffAcceleration(item.monthsSavedEarly).value
                            : '—'}
                          {item.monthsSavedEarly > 0 && (
                            <p className="text-[10px] text-slate-500 font-normal">{formatPayoffAcceleration(item.monthsSavedEarly).sub}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-600">{formatIndianCurrency(item.interestSaved, false)}</td>
                        {canEdit && (
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1 justify-end">
                              <Btn variant="ghost" size="sm" onClick={() => onPrepayEdit(p)}><Pencil className="w-3.5 h-3.5" /></Btn>
                              <Btn variant="ghost" size="sm" onClick={() => onPrepayDelete(p)} className="!text-red-500"><Trash2 className="w-3.5 h-3.5" /></Btn>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20">
                    <td colSpan={3} className="px-3 py-2.5 font-semibold text-sm">Total</td>
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-600">{formatIndianCurrency(report.totalSaved, false)}</td>
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
        </div>
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
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors" style={{ borderLeftWidth: 4, borderLeftColor: typeInfo.color }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base">{loan.name || 'Unnamed Loan'}</h3>
                <Badge color={stats.isClosed ? 'green' : 'amber'}>{stats.isClosed ? 'closed' : 'active'}</Badge>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${typeInfo.color}20`, color: typeInfo.color }}>{typeInfo.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  EMI: {stats.emiBasis === 'sanctioned' ? 'Sanctioned' : 'Disbursed'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {loan.lender || '—'} · {formatRate(stats.annualRate)} · EMI {formatIndianCurrency(stats.emi, false)} on {formatIndianCurrency(stats.emiPrincipal, false)}
                {savingsReport.totalSaved > 0 && (
                  <span className="text-emerald-600"> · Saved {formatIndianCurrency(savingsReport.totalSaved)} interest</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {expanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </div>
          </div>
        </div>
      </button>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-slate-100 dark:divide-slate-800 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/30 dark:to-purple-950/30">
        <div className="p-3 text-center">
          <p className="text-[10px] uppercase text-slate-500">Monthly EMI</p>
          <p className="text-lg font-bold text-indigo-600">{formatIndianCurrency(stats.emi, false)}</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] uppercase text-slate-500">Rate</p>
          <p className="text-lg font-bold">{formatRate(stats.annualRate)}</p>
          <p className="text-[10px] text-slate-500">{formatMonthlyRate(stats.annualRate)}</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] uppercase text-slate-500">Outstanding</p>
          <p className="text-lg font-bold text-red-500">{formatIndianCurrency(stats.outstanding)}</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] uppercase text-slate-500">Time Left</p>
          <p className="text-lg font-bold">{stats.timeRemaining}</p>
        </div>
        <div className="p-3 text-center col-span-2 sm:col-span-1">
          <p className="text-[10px] uppercase text-slate-500">Interest Saved</p>
          <p className="text-lg font-bold text-emerald-600">{formatIndianCurrency(savingsReport.totalSaved || 0)}</p>
        </div>
      </div>

      {expanded && (
        <div className="animate-fade-in">
          <div className="flex border-b border-slate-200 dark:border-slate-800 px-4">
            <button
              type="button"
              onClick={() => onDetailTabChange('details')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${detailTab === 'details' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Loan Details
            </button>
            <button
              type="button"
              onClick={() => onDetailTabChange('savings')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${detailTab === 'savings' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <PiggyBank className="w-3.5 h-3.5" />
              Prepayments & Savings
              {savingsReport.totalSaved > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                  {formatIndianCurrency(savingsReport.totalSaved)}
                </span>
              )}
            </button>
          </div>

          {detailTab === 'savings' ? (
            <div className="p-5">
              <PrepaymentsSavingsPanel
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
          ) : (
        <div className="p-5 space-y-4">
          {canEdit && (
            <div className="flex gap-1 justify-end">
              <Btn variant="ghost" size="sm" onClick={onEdit}><Pencil className="w-4 h-4" /></Btn>
              <Btn variant="ghost" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4 text-red-500" /></Btn>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricBox label="EMI Principal" value={formatIndianCurrency(stats.emiPrincipal)} sub={stats.emiBasis === 'sanctioned' ? 'Sanctioned basis' : 'Disbursed basis'} />
            <MetricBox label="Disbursed" value={formatIndianCurrency(stats.disbursed)} />
            <MetricBox label="EMIs Paid" value={`${stats.emisPaid} / ${stats.totalEmis}`} sub={`${stats.remainingEmis} remaining`} />
            <MetricBox label="Principal Paid" value={formatIndianCurrency(stats.principalPaid)} accent="text-emerald-600" />
            <MetricBox label="Interest Paid" value={formatIndianCurrency(stats.interestPaid)} accent="text-amber-600" />
            <MetricBox label="Remaining Interest" value={formatIndianCurrency(stats.remainingInterest || 0)} accent="text-orange-500" />
            <MetricBox label="Prepayments" value={formatIndianCurrency(stats.prepaymentTotal)} sub={`${stats.prepaymentCount} payment(s)`} accent="text-teal-600" />
            <MetricBox label="Undisbursed" value={formatIndianCurrency(stats.undisbursed)} accent="text-amber-500" />
          </div>

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
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30" style={{ borderLeftWidth: 4, borderLeftColor: typeInfo.color }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" style={{ color: typeInfo.color }} />
                <h3 className="font-bold">{loan.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${typeInfo.color}20`, color: typeInfo.color }}>{typeInfo.label}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{formatIndianCurrency(stats.statementBalance)} outstanding · Due {stats.dueDate || '—'}</p>
            </div>
            {expanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
          </div>
        </div>
      </button>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800 bg-gradient-to-r from-red-50/80 to-orange-50/80 dark:from-red-950/20 dark:to-orange-950/20">
        <div className="p-3 text-center">
          <p className="text-[10px] uppercase text-slate-500">Outstanding</p>
          <p className="text-lg font-bold text-red-500">{formatIndianCurrency(stats.statementBalance)}</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] uppercase text-slate-500">Min. Due</p>
          <p className="text-lg font-bold text-indigo-600">{formatIndianCurrency(stats.minDue, false)}</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] uppercase text-slate-500">Utilization</p>
          <p className="text-lg font-bold">{stats.utilization.toFixed(0)}%</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] uppercase text-slate-500">Due Date</p>
          <p className="text-sm font-bold">{stats.dueDate || '—'}</p>
        </div>
      </div>

      {expanded && (
        <div className="p-5 animate-fade-in">
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
  const detailTab = loansUi.detailTab || 'details';
  const setDetailTab = (tab) => setLoansUi({ detailTab: tab });

  const allStats = useMemo(() => loans.map((l) => ({ loan: l, stats: computeLoanStats(l) })), [loans]);

  const summary = useMemo(() => ({
    totalOutstanding: allStats.reduce((s, { stats }) => s + stats.outstanding, 0),
    totalMonthlyEmi: allStats.reduce((s, { stats }) => s + (stats.emi || 0), 0),
    totalInterestPaid: allStats.reduce((s, { stats }) => s + (stats.interestPaid || 0), 0),
    activeCount: allStats.filter(({ stats }) => !stats.isClosed).length,
  }), [allStats]);

  const saveFinance = (updatedPf, audit) => updateFinance(updatedPf, audit);

  const saveLoans = (updatedLoans, audit) => saveFinance({ ...pf, loans: updatedLoans }, audit);

  const handleSaveLoan = (saved) => {
    const before = loans.find((l) => l.id === saved.id);
    const audit = buildLoanAudit(before, saved);
    saveLoans(
      before ? loans.map((l) => (l.id === saved.id ? saved : l)) : [...loans, saved],
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
    setPendingAction(null);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="Loans Dashboard"
        subtitle="Tap a loan to expand · All changes require confirmation"
        action={canEdit ? (
          <Btn className="w-full sm:w-auto" onClick={() => setEditLoan(createEmptyLoan(genId()))}>
            <Plus className="w-4 h-4 inline mr-1" />Add Loan
          </Btn>
        ) : null}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <StatCard label="Total Outstanding" value={formatIndianCurrency(summary.totalOutstanding)} color="red" />
        <StatCard label="Monthly EMI Outflow" value={formatIndianCurrency(summary.totalMonthlyEmi, false)} sub="All active loans" color="indigo" />
        <StatCard label="Interest Paid" value={formatIndianCurrency(summary.totalInterestPaid)} color="amber" />
        <StatCard label="Active Loans" value={String(summary.activeCount)} sub={`of ${loans.length} total`} color="blue" />
      </div>

      {loans.length === 0 && (
        <Card className="text-center py-12">
          <TrendingDown className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">No loans yet. Add your first loan to start tracking.</p>
        </Card>
      )}

      <div className="space-y-4">
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
              onPrepay={() => { setExpandedForLoan(loan.id, true); setDetailTab('savings'); setPrepayLoanId(loan.id); setPendingAction(null); }}
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
        <LoanEditModal loan={editLoan} onSave={handleSaveLoan} onClose={() => setEditLoan(null)} />
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
