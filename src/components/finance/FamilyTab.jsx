import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Pencil, X, Calendar, User, IndianRupee, TrendingUp,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useUiSection } from '../../hooks/useUiSection';
import { formatIndianCurrency, toNum } from '../../lib/utils';
import {
  getMonthKey, formatMonthLabel, getPastMonths, computeMonthStats, getMonthRecord,
  upsertMonthRecord, saveMemberIncomeAdjustment, INCOME_ADJUSTMENT_MODES,
} from '../../lib/financeStats';
import { buildFamilyMemberAudit, buildFamilyIncomeAudit } from '../../lib/auditSummaries';
import { Card, Btn, InputField, Badge, StatCard, ConfirmDialog, PageHeader } from '../ui';

const STATUS_BADGE = {
  normal: { label: 'Full salary', color: 'green' },
  skipped: { label: 'Skipped', color: 'amber' },
  cut: { label: 'Reduced pay', color: 'amber' },
  extra: { label: 'Extra income', color: 'indigo' },
};

const RELATIONSHIPS = ['Self', 'Spouse', 'Parent', 'Child', 'Sibling', 'Other'];
const MEMBERS_PAGE_SIZE = 6;

function AddMemberModal({ onSave, onClose}) {
  const [draft, setDraft] = useState({ name: '', relationship: 'Other', monthlyIncome: '' });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const doSave = () => {
    onSave({
      name: draft.name.trim(),
      relationship: draft.relationship,
      monthlyIncome: toNum(draft.monthlyIncome),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold">Add family member</h3>
          <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <InputField label="Name" value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Relationship</label>
            <select
              value={draft.relationship}
              onChange={(e) => setDraft((d) => ({ ...d, relationship: e.target.value }))}
              className="w-full"
            >
              {RELATIONSHIPS.map((r) => <option key={r.trim()} value={r.trim()}>{r.trim()}</option>)}
            </select>
          </div>
          <InputField label="Monthly income" type="number" value={draft.monthlyIncome} onChange={(v) => setDraft((d) => ({ ...d, monthlyIncome: v }))} suffix="₹" />
        </div>
        <div className="flex gap-2 p-5 border-t border-slate-200 dark:border-slate-800">
          <Btn className="flex-1" disabled={!draft.name.trim()} onClick={() => setConfirmOpen(true)}>Add member</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        message="add this family member"
        detail={draft.name.trim() || undefined}
        onConfirm={doSave}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function MemberEditModal({
  member, monthKey, monthIncome, onSaveProfile, onSaveAdjustment, onDelete, onClose,
}) {
  const [profile, setProfile] = useState({
    name: member.name,
    relationship: member.relationship,
    monthlyIncome: member.monthlyIncome,
  });
  const [adjustment, setAdjustment] = useState({
    mode: monthIncome?.adjustment?.mode === 'skip' ? 'skip' : monthIncome?.adjustment?.mode || 'full',
    partialAmount: monthIncome?.adjustment?.partialAmount ?? '',
    extraAmount: monthIncome?.adjustment?.extraAmount ?? '',
    note: monthIncome?.adjustment?.note || '',
  });
  const [confirmOpen, setConfirmOpen] = useState(null);

  const setAdj = (field, value) => setAdjustment((a) => ({ ...a, [field]: value }));

  const doSaveProfile = () => {
    onSaveProfile({
      name: profile.name.trim(),
      relationship: profile.relationship,
      monthlyIncome: toNum(profile.monthlyIncome),
    });
    setConfirmOpen(null);
  };

  const doSaveAdjustment = () => {
    onSaveAdjustment(adjustment);
    setConfirmOpen(null);
  };

  const doDelete = () => {
    onDelete();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 className="font-semibold">Edit — {member.name}</h3>
          <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Profile</p>
            <div className="space-y-3">
              <InputField label="Name" value={profile.name} onChange={(v) => setProfile((p) => ({ ...p, name: v }))} />
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Relationship</label>
                <select
                  value={profile.relationship}
                  onChange={(e) => setProfile((p) => ({ ...p, relationship: e.target.value }))}
                  className="w-full"
                >
                  {RELATIONSHIPS.map((r) => <option key={r.trim()} value={r.trim()}>{r.trim()}</option>)}
                </select>
              </div>
              <InputField label="Base monthly income" type="number" value={profile.monthlyIncome} onChange={(v) => setProfile((p) => ({ ...p, monthlyIncome: v }))} suffix="₹" />
            </div>
            <Btn size="sm" className="mt-3" onClick={() => setConfirmOpen('profile')}>Save profile</Btn>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">This month ({formatMonthLabel(monthKey)})</p>
            <p className="text-xs text-slate-500 mb-3">Override salary for this month only — e.g. skip, reduced pay, or a bonus</p>
            <div className="space-y-2">
              {INCOME_ADJUSTMENT_MODES.map((mode) => (
                <label
                  key={mode.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${adjustment.mode === mode.id ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <input
                    type="radio"
                    name="adj-mode"
                    checked={adjustment.mode === mode.id}
                    onChange={() => setAdj('mode', mode.id)}
                    className="mt-1 accent-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-medium">{mode.label}</p>
                    <p className="text-xs text-slate-500">{mode.description}</p>
                  </div>
                </label>
              ))}
            </div>
            {adjustment.mode === 'partial' && (
              <InputField label="Amount paid this month" type="number" value={adjustment.partialAmount} onChange={(v) => setAdj('partialAmount', v)} suffix="₹" className="mt-3" />
            )}
            {adjustment.mode === 'extra' && (
              <InputField label="Extra / bonus amount" type="number" value={adjustment.extraAmount} onChange={(v) => setAdj('extraAmount', v)} suffix="₹" className="mt-3" />
            )}
            {(adjustment.mode === 'skip' || adjustment.mode === 'partial' || adjustment.mode === 'extra') && (
              <InputField label="Note (optional)" value={adjustment.note} onChange={(v) => setAdj('note', v)} className="mt-3" />
            )}
            <Btn size="sm" variant="secondary" className="mt-3" onClick={() => setConfirmOpen('adjustment')}>
              Apply for {formatMonthLabel(monthKey)}
            </Btn>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <Btn size="sm" variant="danger" onClick={() => setConfirmOpen('delete')}>
              <Trash2 className="w-3.5 h-3.5 inline mr-1" />Remove member
            </Btn>
          </div>
        </div>
        <div className="p-5 border-t border-slate-200 dark:border-slate-800">
          <Btn variant="ghost" className="w-full" onClick={onClose}>Close</Btn>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen === 'profile'}
        message="save changes to this member profile"
        detail={profile.name.trim()}
        onConfirm={doSaveProfile}
        onCancel={() => setConfirmOpen(null)}
      />
      <ConfirmDialog
        open={confirmOpen === 'adjustment'}
        message={`apply this income adjustment for ${formatMonthLabel(monthKey)}`}
        detail={member.name}
        onConfirm={doSaveAdjustment}
        onCancel={() => setConfirmOpen(null)}
      />
      <ConfirmDialog
        open={confirmOpen === 'delete'}
        message="remove this family member"
        detail={member.name}
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmOpen(null)}
      />
    </div>
  );
}

function OtherIncomeModal({ value, monthKey, onSave, onClose}) {
  const [amount, setAmount] = useState(value ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const doSave = () => {
    onSave(toNum(amount));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b">
          <h3 className="font-semibold">Other income — {formatMonthLabel(monthKey)}</h3>
          <p className="text-xs text-slate-500 mt-1">Freelance, rent, dividends, etc.</p>
        </div>
        <div className="p-5">
          <InputField label="Amount this month" type="number" value={amount} onChange={setAmount} suffix="₹" />
        </div>
        <div className="flex gap-2 p-5 border-t">
          <Btn className="flex-1" onClick={() => setConfirmOpen(true)}>Save</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        message={`save other income for ${formatMonthLabel(monthKey)}`}
        onConfirm={doSave}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export function FamilyTab() {
  const { data, updateFinance, generateId: genId, canEdit } = useApp();
  const pf = data.personalFinance;
  const currentMonth = getMonthKey();
  const [familyUi, setFamilyUi] = useUiSection('family');

  const selectedMonth = familyUi.selectedMonth || currentMonth;
  const setSelectedMonth = (month) => setFamilyUi({ selectedMonth: month });
  const editMemberId = familyUi.editMemberId;
  const setEditMemberId = (id) => setFamilyUi({ editMemberId: id });
  const editOtherIncome = familyUi.editOtherIncome;
  const setEditOtherIncome = (v) => setFamilyUi({ editOtherIncome: v });
  const showAddMember = familyUi.showAddMember;
  const setShowAddMember = (v) => setFamilyUi({ showAddMember: v });
  const membersPage = familyUi.membersPage || 1;
  const setMembersPage = (page) => setFamilyUi({ membersPage: page });

  const monthOptions = useMemo(() => {
    const keys = new Set([...getPastMonths(12), ...(pf.monthlyRecords || []).map((r) => r.month)]);
    return [...keys].sort().reverse();
  }, [pf.monthlyRecords]);

  const stats = useMemo(() => computeMonthStats(pf, selectedMonth), [pf, selectedMonth]);
  const record = useMemo(() => getMonthRecord(pf, selectedMonth), [pf, selectedMonth]);
  const isCurrentMonth = selectedMonth === currentMonth;

  const editPfMember = editMemberId ? pf.familyMembers.find((m) => m.id === editMemberId) : null;
  const editMonthIncome = editMemberId ? stats.memberIncome.find((m) => m.id === editMemberId) : null;

  const memberTotalPages = Math.max(1, Math.ceil(stats.memberIncome.length / MEMBERS_PAGE_SIZE));
  const safeMembersPage = Math.min(membersPage, memberTotalPages);
  const pagedMembers = stats.memberIncome.slice(
    (safeMembersPage - 1) * MEMBERS_PAGE_SIZE,
    safeMembersPage * MEMBERS_PAGE_SIZE,
  );

  const saveFinance = (next, audit) => updateFinance(next, audit);

  const addMember = ({ name, relationship, monthlyIncome }) => {
    const member = { id: genId(), name, relationship, monthlyIncome, monthlyExpense: 0 };
    saveFinance(
      { ...pf, familyMembers: [...pf.familyMembers, member] },
      buildFamilyMemberAudit(null, member),
    );
    setMembersPage(Math.max(1, Math.ceil((pf.familyMembers.length + 1) / MEMBERS_PAGE_SIZE)));
  };

  const saveMemberProfile = (id, updates) => {
    const before = pf.familyMembers.find((m) => m.id === id);
    const after = { ...before, ...updates };
    saveFinance(
      { ...pf, familyMembers: pf.familyMembers.map((m) => (m.id === id ? after : m)) },
      buildFamilyMemberAudit(before, after),
    );
  };

  const saveAdjustment = (memberId, adjustment) => {
    const memberName = pf.familyMembers.find((m) => m.id === memberId)?.name || 'Member';
    const payload = adjustment.mode === 'full'
      ? null
      : {
        mode: adjustment.mode === 'skip' ? 'skip' : adjustment.mode,
        partialAmount: adjustment.partialAmount,
        extraAmount: adjustment.extraAmount,
        note: adjustment.note,
      };
    saveFinance(
      saveMemberIncomeAdjustment(pf, selectedMonth, memberId, payload),
      buildFamilyIncomeAudit(memberName, selectedMonth, adjustment),
    );
  };

  const removeMember = (id) => {
    const name = pf.familyMembers.find((m) => m.id === id)?.name;
    saveFinance({
      ...pf,
      familyMembers: pf.familyMembers.filter((m) => m.id !== id),
    }, { section: 'family', action: 'delete', summary: `Removed family member: ${name}` });
    setEditMemberId(null);
  };

  const saveOtherIncome = (amount) => {
    saveFinance(
      upsertMonthRecord(pf, { ...record, month: selectedMonth, otherIncome: amount }),
      { section: 'family', action: 'update', summary: `Updated other income for ${formatMonthLabel(selectedMonth)}` },
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="Family Income"
        subtitle="Track each member's salary and monthly adjustments"
        action={(
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="text-sm flex-1 sm:flex-none min-w-0">
              {monthOptions.map((m) => (
                <option key={m} value={m}>{formatMonthLabel(m)}{m === currentMonth ? ' (Current)' : ''}</option>
              ))}
            </select>
          </div>
        )}
      />

      {!isCurrentMonth && (
        <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2">
          Viewing <strong>{formatMonthLabel(selectedMonth)}</strong> — income adjustments apply to this month only.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="Family income" value={formatIndianCurrency(stats.familyIncome)} sub={formatMonthLabel(selectedMonth)} color="green" />
        <StatCard label="Other income" value={formatIndianCurrency(stats.otherIncome)} color="blue" />
        <StatCard label="Total income" value={formatIndianCurrency(stats.totalIncome)} color="indigo" />
        <StatCard label="Members" value={String(pf.familyMembers.length)} sub="In household" color="blue" />
      </div>

      <div className="flex justify-end">
        {canEdit && (
          <Btn onClick={() => setShowAddMember(true)}><Plus className="w-4 h-4 inline mr-1" />Add member</Btn>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pagedMembers.length === 0 ? (
          <Card className="md:col-span-2">
            <p className="text-sm text-slate-500 text-center py-8">
              No family members yet. {canEdit ? 'Click “Add member” to track household income.' : ''}
            </p>
          </Card>
        ) : (
          pagedMembers.map((m) => {
          const badge = STATUS_BADGE[m.status] || STATUS_BADGE.normal;
          return (
            <Card key={m.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <User className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold">{m.name}</h4>
                    <p className="text-xs text-slate-500">{m.relationship}</p>
                  </div>
                </div>
                {canEdit && (
                  <Btn variant="ghost" size="sm" onClick={() => setEditMemberId(m.id)}><Pencil className="w-3.5 h-3.5" /></Btn>
                )}
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  {m.status !== 'normal' && (
                    <p className="text-sm text-slate-400 line-through">{formatIndianCurrency(m.monthlyIncome)}/mo base</p>
                  )}
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600">{formatIndianCurrency(m.effectiveIncome)}</p>
                  <p className="text-xs text-slate-500">effective this month</p>
                </div>
                {m.status !== 'normal' && <Badge color={badge.color}>{badge.label}</Badge>}
              </div>
              {m.note && <p className="text-xs text-slate-500 mt-2 italic">{m.note}</p>}
            </Card>
          );
        })
        )}
      </div>

      {stats.memberIncome.length > MEMBERS_PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-xs text-slate-500">
            Showing {(safeMembersPage - 1) * MEMBERS_PAGE_SIZE + 1}–{Math.min(safeMembersPage * MEMBERS_PAGE_SIZE, stats.memberIncome.length)} of {stats.memberIncome.length} members
          </p>
          <div className="flex items-center gap-1">
            <Btn size="sm" variant="ghost" disabled={safeMembersPage <= 1} onClick={() => setMembersPage(safeMembersPage - 1)}>Prev</Btn>
            <span className="text-xs px-2 text-slate-600 dark:text-slate-400">Page {safeMembersPage} / {memberTotalPages}</span>
            <Btn size="sm" variant="ghost" disabled={safeMembersPage >= memberTotalPages} onClick={() => setMembersPage(safeMembersPage + 1)}>Next</Btn>
          </div>
        </div>
      )}

      <Card title="Other income" subtitle={`For ${formatMonthLabel(selectedMonth)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IndianRupee className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-xl sm:text-2xl font-bold text-blue-600">{formatIndianCurrency(stats.otherIncome)}</p>
              <p className="text-xs text-slate-500">Not tied to a family member</p>
            </div>
          </div>
          {canEdit && (
            <Btn variant="secondary" size="sm" onClick={() => setEditOtherIncome(true)}>
              <Pencil className="w-3.5 h-3.5 inline mr-1" />Edit
            </Btn>
          )}
        </div>
      </Card>

      <Card title="How it flows" className="!bg-slate-50 dark:!bg-slate-900/50">
        <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
          <TrendingUp className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
          <p>
            Base salaries are set per member. Use <strong>monthly adjustments</strong> to skip salary, record reduced pay,
            or add a bonus — without changing the base amount. Totals feed into Expenses and Overview automatically.
          </p>
        </div>
      </Card>

      {showAddMember && (
        <AddMemberModal onSave={addMember} onClose={() => setShowAddMember(false)} />
      )}

      {editPfMember && (
        <MemberEditModal
          member={editPfMember}
          monthKey={selectedMonth}
          monthIncome={editMonthIncome}
          onSaveProfile={(updates) => saveMemberProfile(editPfMember.id, updates)}
          onSaveAdjustment={(adj) => saveAdjustment(editPfMember.id, { ...adj, mode: adj.mode === 'skip' ? 'skip' : adj.mode })}
          onDelete={() => removeMember(editPfMember.id)}
          onClose={() => setEditMemberId(null)}
        />
      )}

      {editOtherIncome && (
        <OtherIncomeModal
          value={record.otherIncome}
          monthKey={selectedMonth}
          onSave={saveOtherIncome}
          onClose={() => setEditOtherIncome(false)}
        />
      )}
    </div>
  );
}
