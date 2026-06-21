import { useEffect, useState } from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Btn, InputField, OtpResendControl } from '../ui';

/**
 * Two-step leave flow: confirm intent → email OTP → leave group.
 */
export function LeaveGroupDialog({
  open,
  onClose,
  householdName,
  actionMessage,
  actionDetail,
  confirmLabel = 'Continue',
  submitLabel = 'Leave group',
  onSuccess,
}) {
  const { user, requestLeaveGroupOtp, leaveGroup } = useAuth();
  const [step, setStep] = useState('confirm');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep('confirm');
      setOtp('');
      setError('');
      setInfo('');
      setBusy(false);
      setResendCooldown(0);
    }
  }, [open]);

  if (!open) return null;

  const confirmText = actionMessage.startsWith('Are you sure')
    ? actionMessage
    : `Are you sure you want to ${actionMessage}?`;

  const sendOtp = async () => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const data = await requestLeaveGroupOtp();
      setResendCooldown(data.resendAvailableIn || 30);
      setInfo(data.message || 'Verification code sent to your email');
      setStep('otp');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitLeave = async () => {
    setError('');
    setBusy(true);
    try {
      await leaveGroup(otp);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'confirm' ? (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">Confirm action</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{confirmText}</p>
                {actionDetail && <p className="text-xs text-slate-500 mt-2">{actionDetail}</p>}
                {householdName && (
                  <p className="text-xs text-slate-500 mt-2">
                    Group: <strong>{householdName}</strong>
                  </p>
                )}
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  You will need to verify with a one-time code sent to your email.
                </p>
              </div>
            </div>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Btn variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Btn>
              <Btn variant="danger" size="sm" onClick={sendOtp} disabled={busy}>
                {busy ? 'Sending code…' : confirmLabel}
              </Btn>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/30">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">Verify it&apos;s you</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Enter the 6-digit code sent to <strong>{user?.email}</strong>
                </p>
              </div>
            </div>
            <InputField
              label="Verification code"
              value={otp}
              onChange={setOtp}
              placeholder="123456"
              className="mb-3"
            />
            {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
            {info && <p className="text-sm text-emerald-600 mb-2">{info}</p>}
            <div className="flex gap-2 justify-end mb-3">
              <Btn variant="ghost" size="sm" onClick={() => { setStep('confirm'); setOtp(''); setError(''); }}>
                Back
              </Btn>
              <Btn
                variant="danger"
                size="sm"
                onClick={submitLeave}
                disabled={busy || otp.length < 6}
              >
                {busy ? 'Leaving…' : submitLabel}
              </Btn>
            </div>
            <OtpResendControl
              email={user?.email}
              initialCooldown={resendCooldown}
              active={open && step === 'otp'}
              onResend={requestLeaveGroupOtp}
              onError={setError}
              className="text-xs text-indigo-600 hover:underline w-full text-center disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </>
        )}
      </div>
    </div>
  );
}
