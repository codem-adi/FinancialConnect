import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, CreditCard, Pencil, Check, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { fetchTeamMembers } from '../../lib/api';
import { formatIndianCurrency, toNum } from '../../lib/utils';
import {
  createEmptyCard,
  getCardBillAmount,
  normalizeMemberCards,
} from '../../lib/cardBillCalculations';
import { formatMonthLabel, getMonthRecord, upsertMonthRecord } from '../../lib/financeStats';
import { Card, Btn, InputField, AmountWords, ConfirmDialog } from '../ui';

function dayOptions() {
  return Array.from({ length: 31 }, (_, i) => i + 1);
}

const PERSON_SOURCES = [
  { id: 'family', label: 'Family income' },
  { id: 'group', label: 'Financial group' },
  { id: 'custom', label: 'Type name' },
];

function CardEditModal({
  draft,
  adding,
  personSource,
  familyMembers,
  groupMembers,
  onClose,
  onSave,
  onFieldChange,
  onPersonSourceChange,
  onFamilyMemberChange,
  onGroupMemberChange,
  canSave,
}) {
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

  if (!draft) return null;

  const cardLabel = draft.cardName?.trim() || 'this card';

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 className="font-semibold">{adding ? 'Add card' : 'Edit card'}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Card owner</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {PERSON_SOURCES.map((src) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => onPersonSourceChange(src.id)}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                    personSource === src.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>

            {personSource === 'family' && (
              familyMembers.length === 0 ? (
                <p className="text-sm text-slate-500">Add family members in the Family Income tab first.</p>
              ) : (
                <select value={draft.memberId} onChange={(e) => onFamilyMemberChange(e.target.value)} className="w-full">
                  {familyMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.relationship})</option>
                  ))}
                </select>
              )
            )}

            {personSource === 'group' && (
              groupMembers.length === 0 ? (
                <p className="text-sm text-slate-500">No active group members yet.</p>
              ) : (
                <select value={draft.memberId} onChange={(e) => onGroupMemberChange(e.target.value)} className="w-full">
                  {groupMembers.map((m) => {
                    const key = m.id || m.userId;
                    const label = m.name || m.email;
                    return (
                      <option key={key} value={key}>
                        {label}{m.email ? ` · ${m.email}` : ''} ({m.role})
                      </option>
                    );
                  })}
                </select>
              )
            )}

            {personSource === 'custom' && (
              <InputField
                label="Person name"
                value={draft.memberName || ''}
                onChange={(v) => onFieldChange('memberName', v)}
                placeholder="e.g. Rahul, Spouse"
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InputField label="Card name" value={draft.cardName} onChange={(v) => onFieldChange('cardName', v)} placeholder="e.g. HDFC Regalia" />
            <InputField label="Last 4 digits" value={draft.cardLast4 || ''} onChange={(v) => onFieldChange('cardLast4', v.replace(/\D/g, '').slice(0, 4))} placeholder="1234" />
            <InputField label="Bill provider / bank" value={draft.billProvider} onChange={(v) => onFieldChange('billProvider', v)} placeholder="e.g. HDFC Bank" />
            <InputField label="Reminder email" type="email" value={draft.notifyEmail || ''} onChange={(v) => onFieldChange('notifyEmail', v)} placeholder="owner@email.com" />
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Bill generate (day)</label>
              <select value={draft.billGenerateDay} onChange={(e) => onFieldChange('billGenerateDay', e.target.value)} className="w-full">
                {dayOptions().map((d) => <option key={d} value={d}>Day {d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Bill due (day)</label>
              <select value={draft.billDueDay} onChange={(e) => onFieldChange('billDueDay', e.target.value)} className="w-full">
                {dayOptions().map((d) => <option key={d} value={d}>Day {d}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.sendReminder !== false}
              onChange={(e) => onFieldChange('sendReminder', e.target.checked)}
              className="w-4 h-4 accent-indigo-600"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Email reminders to card owner</span>
          </label>
        </div>

        <div className="flex gap-2 p-5 border-t border-slate-200 dark:border-slate-800">
          <Btn className="flex-1" onClick={() => setConfirmSaveOpen(true)} disabled={!canSave}>
            <Check className="w-3.5 h-3.5 inline mr-1" />Save
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
      </div>

      <ConfirmDialog
        open={confirmSaveOpen}
        message={adding ? 'add this card' : `save changes to ${cardLabel}`}
        detail={adding ? cardLabel : `${draft.memberName} · ${draft.billProvider}`}
        confirmLabel={adding ? 'Add card' : 'Save changes'}
        onConfirm={() => {
          setConfirmSaveOpen(false);
          onSave();
        }}
        onCancel={() => setConfirmSaveOpen(false)}
      />
    </>
  );
}

export function CardBillsCard({ selectedMonth }) {
  const { data, updateFinance, generateId, canEdit } = useApp();
  const { user } = useAuth();
  const pf = data.personalFinance;
  const cards = useMemo(() => normalizeMemberCards(pf), [pf]);
  const monthRecord = useMemo(() => getMonthRecord(pf, selectedMonth), [pf, selectedMonth]);
  const monthLabel = useMemo(() => formatMonthLabel(selectedMonth), [selectedMonth]);
  const familyMembers = pf.familyMembers || [];

  const [groupMembers, setGroupMembers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [adding, setAdding] = useState(false);
  const [amountDrafts, setAmountDrafts] = useState({});
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [pendingAmountSave, setPendingAmountSave] = useState(null);

  useEffect(() => {
    fetchTeamMembers()
      .then((res) => setGroupMembers((res.members || []).filter((m) => m.status === 'active')))
      .catch(() => setGroupMembers([]));
  }, []);

  useEffect(() => {
    const next = {};
    for (const card of cards) {
      next[card.id] = monthRecord.cardBillAmounts?.[card.id] ?? '';
    }
    setAmountDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset drafts when month or saved amounts change
  }, [
    selectedMonth,
    cards.map((c) => c.id).join(','),
    JSON.stringify(Object.fromEntries(cards.map((c) => [c.id, monthRecord.cardBillAmounts?.[c.id] ?? '']))),
  ]);

  const saveCards = (nextPf, summary) => {
    updateFinance(nextPf, {
      section: 'expenses',
      action: 'update',
      summary: summary || 'Updated member card bills',
    });
  };

  const saveMonthAmount = (cardId, value, cardName) => {
    const nextPf = upsertMonthRecord(pf, {
      ...monthRecord,
      month: selectedMonth,
      cardBillAmounts: {
        ...(monthRecord.cardBillAmounts || {}),
        [cardId]: value === '' ? '' : Number(value),
      },
    });
    updateFinance(nextPf, {
      section: 'expenses',
      action: 'update',
      summary: `Updated ${cardName || 'card'} bill for ${monthLabel}`,
    });
  };

  const setAmountDraft = (cardId, value) => {
    setAmountDrafts((prev) => ({ ...prev, [cardId]: value }));
  };

  const isAmountDirty = (cardId) => {
    const saved = monthRecord.cardBillAmounts?.[cardId] ?? '';
    const draftVal = amountDrafts[cardId] ?? '';
    return String(saved) !== String(draftVal);
  };

  const saveAmountDraft = (cardId, cardName) => {
    saveMonthAmount(cardId, amountDrafts[cardId] ?? '', cardName);
  };

  const startAdd = () => {
    const defaultMember = familyMembers[0];
    setDraft({
      ...createEmptyCard(defaultMember, 'family'),
      id: generateId(),
      notifyEmail: defaultMember?.email || user?.email || '',
    });
    setAdding(true);
    setEditingId(null);
  };

  const startEdit = (item) => {
    setDraft({
      ...item,
      cardName: item.cardName || item.carName || '',
      cardLast4: item.cardLast4 || item.registrationNumber || '',
      memberSource: item.memberSource || (item.memberId ? 'family' : 'custom'),
    });
    setEditingId(item.id);
    setAdding(false);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditingId(null);
    setAdding(false);
  };

  const setDraftField = (field, value) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const onPersonSourceChange = (source) => {
    if (source === 'family') {
      const member = familyMembers[0];
      setDraft((d) => ({
        ...d,
        memberSource: 'family',
        memberId: member?.id || '',
        memberName: member?.name || '',
        notifyEmail: d.notifyEmail || member?.email || user?.email || '',
      }));
    } else if (source === 'group') {
      const member = groupMembers[0];
      setDraft((d) => ({
        ...d,
        memberSource: 'group',
        memberId: member?.id || member?.userId || '',
        memberName: member?.name || member?.email || '',
        notifyEmail: d.notifyEmail || member?.email || '',
      }));
    } else {
      setDraft((d) => ({
        ...d,
        memberSource: 'custom',
        memberId: '',
        memberName: d.memberName || '',
      }));
    }
  };

  const onFamilyMemberChange = (memberId) => {
    const member = familyMembers.find((m) => m.id === memberId);
    setDraft((d) => ({
      ...d,
      memberSource: 'family',
      memberId,
      memberName: member?.name || '',
      notifyEmail: d.notifyEmail || member?.email || user?.email || '',
    }));
  };

  const onGroupMemberChange = (memberKey) => {
    const member = groupMembers.find((m) => (m.id || m.userId) === memberKey);
    setDraft((d) => ({
      ...d,
      memberSource: 'group',
      memberId: member?.id || member?.userId || '',
      memberName: member?.name || member?.email?.split('@')[0] || '',
      notifyEmail: d.notifyEmail || member?.email || '',
    }));
  };

  const personSource = draft?.memberSource || 'family';

  const canSaveDraft = draft?.cardName?.trim()
    && draft?.billProvider?.trim()
    && draft?.memberName?.trim();

  const saveDraft = () => {
    if (!canSaveDraft) return;
    const payload = {
      ...draft,
      memberSource: personSource,
      cardName: draft.cardName.trim(),
      cardLast4: (draft.cardLast4 || '').trim(),
      billProvider: draft.billProvider.trim(),
      memberName: draft.memberName.trim(),
      billGenerateDay: Number(draft.billGenerateDay) || 1,
      billDueDay: Number(draft.billDueDay) || 10,
      notifyEmail: (draft.notifyEmail || '').trim().toLowerCase(),
      sendReminder: draft.sendReminder !== false,
      memberId: personSource === 'custom' ? '' : (draft.memberId || ''),
    };
    delete payload.estimatedAmount;
    const next = adding
      ? [...cards, payload]
      : cards.map((c) => (c.id === payload.id ? payload : c));
    saveCards({ ...pf, memberCards: next }, adding ? `Added card bill: ${payload.cardName}` : `Updated card bill: ${payload.cardName}`);
    cancelEdit();
  };

  const removeCard = (id) => {
    const name = cards.find((c) => c.id === id)?.cardName || 'card';
    const nextCards = cards.filter((c) => c.id !== id);
    const monthlyRecords = (pf.monthlyRecords || []).map((record) => {
      if (!record.cardBillAmounts?.[id]) return record;
      const { [id]: _removed, ...rest } = record.cardBillAmounts;
      return { ...record, cardBillAmounts: rest };
    });
    saveCards(
      { ...pf, memberCards: nextCards, monthlyRecords },
      `Removed card bill: ${name}`,
    );
    if (editingId === id) cancelEdit();
  };

  const modalOpen = Boolean(draft);
  const pendingDeleteCard = pendingDeleteId
    ? cards.find((c) => c.id === pendingDeleteId)
    : null;

  return (
    <>
      <Card
        title="Member Cards & Bills"
        subtitle={`${monthLabel} bill amounts`}
        action={canEdit ? (
          <Btn size="sm" onClick={startAdd}><Plus className="w-3 h-3 inline mr-1" />Add card</Btn>
        ) : null}
      >
        <div className="space-y-1.5 mt-3">
          {cards.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No cards yet.</p>
          ) : (
            cards.map((item) => {
              const displayAmount = getCardBillAmount(monthRecord, item.id, item);
              const draftAmount = amountDrafts[item.id] ?? '';
              const dirty = isAmountDirty(item.id);

              return (
                <div
                  key={item.id}
                  className="px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    <CreditCard className="w-4 h-4 text-indigo-600 shrink-0 mt-2.5 hidden sm:block" />

                    <span className="font-medium text-sm truncate min-w-0 flex-[1.2] pt-2" title={item.cardName}>
                      {item.cardName}
                    </span>

                    <span className="text-sm text-slate-500 truncate min-w-0 flex-1 pt-2" title={item.memberName}>
                      {item.memberName}
                    </span>

                    {canEdit ? (
                      <>
                        <div className="shrink-0 w-[130px] sm:w-[160px]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base text-slate-500 font-medium">₹</span>
                            <input
                              type="number"
                              value={draftAmount}
                              onChange={(e) => setAmountDraft(item.id, e.target.value)}
                              placeholder="0"
                              className="w-full text-base sm:text-lg font-semibold px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                            />
                          </div>
                          {dirty && toNum(draftAmount) > 0 && (
                            <AmountWords amount={draftAmount} className="text-[11px] leading-snug px-0.5" />
                          )}
                        </div>
                        {dirty && (
                          <Btn
                            size="sm"
                            className="shrink-0 !px-3 mt-1.5"
                            onClick={() => setPendingAmountSave({ id: item.id, name: item.cardName })}
                          >
                            Save
                          </Btn>
                        )}
                        <div className="flex gap-0.5 shrink-0 ml-auto pt-1">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                            aria-label="Edit card"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            aria-label="Remove card"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="shrink-0 ml-auto text-right min-w-[100px] pt-2">
                        <span className="text-sm font-semibold text-indigo-600">
                          {displayAmount > 0 ? formatIndianCurrency(displayAmount, false) : '—'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {modalOpen && canEdit && (
        <CardEditModal
          draft={draft}
          adding={adding}
          personSource={personSource}
          familyMembers={familyMembers}
          groupMembers={groupMembers}
          onClose={cancelEdit}
          onSave={saveDraft}
          onFieldChange={setDraftField}
          onPersonSourceChange={onPersonSourceChange}
          onFamilyMemberChange={onFamilyMemberChange}
          onGroupMemberChange={onGroupMemberChange}
          canSave={canSaveDraft}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        message={`delete ${pendingDeleteCard?.cardName || 'this card'}`}
        detail={pendingDeleteCard ? pendingDeleteCard.memberName : undefined}
        confirmLabel="Delete card"
        variant="danger"
        onConfirm={() => {
          if (pendingDeleteId) removeCard(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingAmountSave)}
        message={`save ${monthLabel} bill amount for ${pendingAmountSave?.name || 'this card'}`}
        detail={
          pendingAmountSave
            ? formatIndianCurrency(toNum(amountDrafts[pendingAmountSave.id]), false)
            : undefined
        }
        confirmLabel="Save amount"
        onConfirm={() => {
          if (pendingAmountSave) {
            saveAmountDraft(pendingAmountSave.id, pendingAmountSave.name);
          }
          setPendingAmountSave(null);
        }}
        onCancel={() => setPendingAmountSave(null)}
      />
    </>
  );
}
