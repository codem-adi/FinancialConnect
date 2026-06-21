import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Receipt, Pencil, Check, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatIndianCurrency, toNum } from '../../lib/utils';
import { formatMonthLabel, getMonthRecord, upsertMonthRecord } from '../../lib/financeStats';
import { buildExpenseMonthAudit } from '../../lib/auditSummaries';
import { Card, Btn, InputField, AmountWords, ConfirmDialog } from '../ui';

function ExtraExpenseModal({ draft, adding, onClose, onSave, onFieldChange, canSave }) {
  if (!draft) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold">{adding ? 'Add expense' : 'Edit expense'}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <InputField
            label="Description"
            value={draft.name}
            onChange={(v) => onFieldChange('name', v)}
            placeholder="e.g. Car repair, Gift"
          />
          <InputField
            label="Amount"
            type="number"
            min={1}
            value={draft.amount ?? ''}
            onChange={(v) => onFieldChange('amount', v)}
            suffix="₹"
            showWords
          />
          {draft.amount !== '' && toNum(draft.amount) <= 0 && (
            <p className="text-xs text-red-500">Amount must be greater than zero.</p>
          )}
        </div>
        <div className="flex gap-2 p-5 border-t border-slate-200 dark:border-slate-800">
          <Btn className="flex-1" onClick={onSave} disabled={!canSave}>
            <Check className="w-3.5 h-3.5 inline mr-1" />Save
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

export function ExtraExpensesCard({ selectedMonth }) {
  const { data, updateFinance, generateId, canEdit } = useApp();
  const pf = data.personalFinance;
  const monthRecord = useMemo(() => getMonthRecord(pf, selectedMonth), [pf, selectedMonth]);
  const monthLabel = useMemo(() => formatMonthLabel(selectedMonth), [selectedMonth]);
  const expenses = monthRecord.extraExpenses || [];

  const [draft, setDraft] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [amountDrafts, setAmountDrafts] = useState({});
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  useEffect(() => {
    const next = {};
    for (const ex of expenses) {
      next[ex.id] = ex.amount ?? '';
    }
    setAmountDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedMonth,
    expenses.map((e) => e.id).join(','),
    JSON.stringify(Object.fromEntries(expenses.map((e) => [e.id, e.amount ?? '']))),
  ]);

  const saveRecord = (updated, summary) => {
    updateFinance(
      upsertMonthRecord(pf, { ...updated, month: selectedMonth }),
      buildExpenseMonthAudit(selectedMonth, summary),
    );
  };

  const saveMonthAmount = (id, value, name) => {
    const amount = toNum(value);
    if (amount <= 0) return;
    saveRecord(
      {
        ...monthRecord,
        extraExpenses: expenses.map((e) => (
          e.id === id ? { ...e, amount } : e
        )),
      },
      `Updated ${name || 'expense'} for ${monthLabel}`,
    );
  };

  const isAmountDirty = (id) => {
    const saved = expenses.find((e) => e.id === id)?.amount ?? '';
    return String(saved) !== String(amountDrafts[id] ?? '');
  };

  const startAdd = () => {
    setDraft({ id: generateId(), name: '', amount: '', category: 'other' });
    setAdding(true);
    setEditingId(null);
  };

  const startEdit = (item) => {
    setDraft({ ...item, amount: item.amount ?? '' });
    setEditingId(item.id);
    setAdding(false);
  };

  const cancelModal = () => {
    setDraft(null);
    setAdding(false);
    setEditingId(null);
  };

  const saveModal = () => {
    const amount = toNum(draft?.amount);
    if (!draft?.name?.trim() || amount <= 0) return;
    const payload = {
      ...draft,
      name: draft.name.trim(),
      amount,
      category: draft.category || 'other',
    };
    const next = adding
      ? [...expenses, payload]
      : expenses.map((e) => (e.id === payload.id ? payload : e));
    saveRecord(
      { ...monthRecord, extraExpenses: next },
      adding ? `Added ${payload.name}` : `Updated ${payload.name}`,
    );
    cancelModal();
  };

  const removeExpense = (id) => {
    const name = expenses.find((e) => e.id === id)?.name || 'expense';
    saveRecord(
      { ...monthRecord, extraExpenses: expenses.filter((e) => e.id !== id) },
      `Removed ${name}`,
    );
    if (editingId === id) cancelModal();
  };

  const pendingDelete = pendingDeleteId
    ? expenses.find((e) => e.id === pendingDeleteId)
    : null;

  if (!canEdit && expenses.length === 0) return null;

  return (
    <>
      <Card
        title="One-off / Extra Expenses"
        subtitle={`${monthLabel} — irregular items`}
        action={canEdit ? (
          <Btn size="sm" onClick={startAdd}><Plus className="w-3 h-3 inline mr-1" />Add</Btn>
        ) : null}
      >
        <div className="space-y-1.5 mt-3">
          {expenses.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No extra expenses this month.</p>
          ) : (
            expenses.map((item) => {
              const draftAmount = amountDrafts[item.id] ?? '';
              const dirty = isAmountDirty(item.id);
              const displayAmount = toNum(item.amount);

              return (
                <div
                  key={item.id}
                  className="px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    <Receipt className="w-4 h-4 text-red-500 shrink-0 mt-2.5 hidden sm:block" />

                    <span className="font-medium text-sm truncate min-w-0 flex-[1.5] pt-2" title={item.name}>
                      {item.name}
                    </span>

                    {canEdit ? (
                      <>
                        <div className="shrink-0 w-[130px] sm:w-[160px]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base text-slate-500 font-medium">₹</span>
                            <input
                              type="number"
                              min={1}
                              value={draftAmount}
                              onChange={(e) => setAmountDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="0"
                              className="w-full text-base sm:text-lg font-semibold px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                            />
                          </div>
                          {dirty && toNum(draftAmount) > 0 && (
                            <AmountWords amount={draftAmount} className="text-[11px] leading-snug px-0.5" />
                          )}
                        </div>
                        {dirty && toNum(draftAmount) > 0 && (
                          <Btn
                            size="sm"
                            className="shrink-0 !px-3 mt-1.5"
                            onClick={() => saveMonthAmount(item.id, draftAmount, item.name)}
                          >
                            Save
                          </Btn>
                        )}
                        <div className="flex gap-0.5 shrink-0 ml-auto pt-1">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                            aria-label="Edit expense"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            aria-label="Remove expense"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <span className="text-sm font-semibold text-red-500 shrink-0 ml-auto pt-2">
                        {displayAmount > 0 ? formatIndianCurrency(displayAmount, false) : '—'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {draft && canEdit && (
        <ExtraExpenseModal
          draft={draft}
          adding={adding}
          onClose={cancelModal}
          onSave={saveModal}
          onFieldChange={(field, value) => setDraft((d) => ({ ...d, [field]: value }))}
          canSave={Boolean(draft.name?.trim()) && toNum(draft.amount) > 0}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        message={`delete ${pendingDelete?.name || 'this expense'}`}
        detail={pendingDelete && toNum(pendingDelete.amount) > 0
          ? formatIndianCurrency(toNum(pendingDelete.amount), false)
          : undefined}
        confirmLabel="Delete expense"
        variant="danger"
        onConfirm={() => {
          if (pendingDeleteId) removeExpense(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}
