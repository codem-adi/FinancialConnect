import { useEffect, useState } from 'react';
import { Trash2, Eye, Pencil, History, UserPlus, Copy, Check, UserCheck, UserX, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchTeamMembers, inviteTeamMember, updateTeamMemberRole, removeTeamMember, fetchAuditLog,
  fetchJoinCode, fetchJoinRequests, approveJoinRequest, rejectJoinRequest,
} from '../../lib/api';
import { Card, Btn, InputField, Badge, PageHeader } from '../ui';
import { LeaveGroupDialog } from './LeaveGroupDialog';

function formatWhen(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const AUDIT_PAGE_SIZE = 20;

export function TeamTab() {
  const { user, role, canEdit, household } = useAuth();
  const [members, setMembers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinRequests, setJoinRequests] = useState([]);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const loadAudit = async (append = false) => {
    if (append) setAuditLoadingMore(true);
    else setAuditLoading(true);
    try {
      const offset = append ? logs.length : 0;
      const audit = await fetchAuditLog(AUDIT_PAGE_SIZE, offset);
      const nextLogs = audit.logs || [];
      setLogs((prev) => (append ? [...prev, ...nextLogs] : nextLogs));
      setAuditHasMore(!!audit.hasMore);
    } finally {
      setAuditLoading(false);
      setAuditLoadingMore(false);
    }
  };

  const load = async () => {
    const [team, requests] = await Promise.all([
      fetchTeamMembers(),
      role === 'owner' ? fetchJoinRequests() : Promise.resolve({ requests: [] }),
    ]);
    setMembers(team.members || []);
    setJoinRequests(requests.requests || []);
    await loadAudit(false);

    if (role === 'owner') {
      try {
        const codeData = await fetchJoinCode();
        setJoinCode(codeData.joinCode || '');
      } catch {
        /* owner-only */
      }
    }
  };

  useEffect(() => { load(); }, [role]);

  const invite = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    setError('');
    setBusy(true);
    try {
      await inviteTeamMember(email, inviteRole);
      setEmail('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (memberId, nextRole) => {
    try {
      await updateTeamMemberRole(memberId, nextRole);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (memberId) => {
    try {
      await removeTeamMember(memberId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const copyCode = async () => {
    if (!joinCode) return;
    await navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reviewRequest = async (id, action) => {
    try {
      if (action === 'approve') await approveJoinRequest(id);
      else await rejectJoinRequest(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <LeaveGroupDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        householdName={household?.name}
        actionMessage="leave this financial group"
        actionDetail="You will exit this dashboard and get a new empty personal dashboard with your own join code."
        confirmLabel="Send verification code"
        submitLabel="Leave group"
      />
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="Financial Group"
        subtitle="People who can view or edit this household's finances. Activity is logged for 1 year."
      />

      {!canEdit && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
          <Eye className="w-4 h-4 inline mr-1" />
          You have <strong>view-only</strong> access. You can see all details but cannot edit assets, loans, or expenses.
        </div>
      )}

      {role === 'owner' && joinCode && (
        <Card title="Dashboard join code" subtitle="Share this code so family can request access when signing up">
          <div className="flex items-center gap-3">
            <code className="flex-1 text-lg font-mono font-bold tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-4 py-3 rounded-xl">
              {joinCode}
            </code>
            <Btn size="sm" variant="secondary" onClick={copyCode}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Btn>
          </div>
        </Card>
      )}

      {role === 'owner' && joinRequests.length > 0 && (
        <Card title="Pending access requests" subtitle="Users who signed up with your join code">
          <div className="space-y-2">
            {joinRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.name || r.email}</p>
                  <p className="text-xs text-slate-500">{r.email} · wants {r.role} access</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Btn size="sm" onClick={() => reviewRequest(r.id, 'approve')}>
                    <UserCheck className="w-4 h-4 inline mr-1" />Approve
                  </Btn>
                  <Btn size="sm" variant="secondary" className="!text-red-500" onClick={() => reviewRequest(r.id, 'reject')}>
                    <UserX className="w-4 h-4" />
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {role !== 'owner' && (
        <Card title="Leave group" subtitle="Exit this household and start your own dashboard">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            You are a <strong>{role}</strong> on <strong>{household?.name || 'this dashboard'}</strong>.
            Leaving creates a fresh personal dashboard — you will no longer see this group&apos;s finances.
          </p>
          <Btn variant="danger" size="sm" onClick={() => setLeaveOpen(true)}>
            <LogOut className="w-4 h-4 inline mr-1" />Leave group
          </Btn>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Group members" subtitle={`Logged in as ${user?.name} · ${role}`}>
          {canEdit && (
            <form onSubmit={invite} className="space-y-3 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="family@example.com" />
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Access level</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full">
                  <option value="viewer">View only — can see all financial details</option>
                  <option value="editor">Can edit — can change assets, loans, expenses, goals</option>
                </select>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Btn type="submit" size="sm" disabled={busy || !email.trim()}>
                <UserPlus className="w-4 h-4 inline mr-1" />Invite member
              </Btn>
            </form>
          )}

          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="min-w-0">
                  <p className="font-medium truncate">{m.name || m.email}</p>
                  <p className="text-xs text-slate-500 truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.status === 'pending' && <Badge color="amber">Pending signup</Badge>}
                  {m.status === 'awaiting_approval' && <Badge color="amber">Awaiting approval</Badge>}
                  {m.role === 'owner' && <Badge color="indigo">Owner</Badge>}
                  {m.role === 'editor' && <Badge color="green"><Pencil className="w-3 h-3 inline" /> Editor</Badge>}
                  {m.role === 'viewer' && <Badge color="blue"><Eye className="w-3 h-3 inline" /> Viewer</Badge>}
                  {canEdit && m.role !== 'owner' && !m.isSelf && (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m.id, e.target.value)}
                        className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
                      >
                        <option value="viewer">View</option>
                        <option value="editor">Edit</option>
                      </select>
                      <Btn size="sm" variant="ghost" className="!text-red-500" onClick={() => remove(m.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Btn>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Activity log" subtitle="Last 12 months · paginated history">
          <div className="space-y-2 max-h-[32rem] overflow-y-auto overscroll-contain pr-1">
            {auditLoading && logs.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">Loading activity…</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No activity yet</p>
            ) : (
              logs.map((log) => (
                <div key={log._id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-start gap-2">
                    <History className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{log.summary}</p>
                      {log.details && (
                        <p className="text-xs text-slate-500 mt-1">{log.details}</p>
                      )}
                      <p className="text-xs text-slate-500 mt-0.5">
                        {log.userName} · {log.section} · {formatWhen(log.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {logs.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Showing {logs.length} action{logs.length !== 1 ? 's' : ''}
              </p>
              {auditHasMore && (
                <Btn size="sm" variant="secondary" disabled={auditLoadingMore} onClick={() => loadAudit(true)}>
                  {auditLoadingMore ? 'Loading…' : 'Load more'}
                </Btn>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
    </>
  );
}
