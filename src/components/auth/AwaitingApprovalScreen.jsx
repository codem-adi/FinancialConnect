import { useState } from 'react';
import { Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLogoutConfirm } from '../../hooks/useLogoutConfirm';
import { Btn, Card } from '../ui';
import { LeaveGroupDialog } from '../team/LeaveGroupDialog';

export function AwaitingApprovalScreen() {
  const { session, refreshSession } = useAuth();
  const { requestLogout, LogoutConfirmDialog } = useLogoutConfirm();
  const householdName = session?.household?.name || 'the financial dashboard';
  const [leaveOpen, setLeaveOpen] = useState(false);

  return (
    <>
      {LogoutConfirmDialog}
      <LeaveGroupDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        householdName={householdName}
        actionMessage="cancel your join request"
        actionDetail="You will leave the approval queue and get a new empty personal dashboard with your own join code."
        confirmLabel="Send verification code"
        submitLabel="Cancel request"
      />
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md !p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-7 h-7 text-amber-400 animate-pulse-soft" />
        </div>
        <h1 className="text-xl font-bold mb-2">Waiting for approval</h1>
        <p className="text-sm text-slate-500 mb-6">
          Your account is verified. The owner of <strong>{householdName}</strong> must approve your access before you can view financial data.
        </p>
        <div className="flex flex-col gap-2">
          <Btn onClick={() => refreshSession()}>Check again</Btn>
          <Btn variant="secondary" onClick={() => setLeaveOpen(true)}>Cancel request &amp; start own dashboard</Btn>
          <Btn variant="ghost" onClick={requestLogout}>Sign out</Btn>
        </div>
      </Card>
    </div>
    </>
  );
}
