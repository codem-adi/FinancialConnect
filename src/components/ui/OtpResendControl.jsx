import { useOtpResend } from '../../hooks/useOtpResend';

/** Resend OTP button with 30s cooldown and 1h block messaging */
export function OtpResendControl({
  email,
  onResend,
  initialCooldown = 0,
  active = true,
  className = 'text-sm text-indigo-400 hover:text-indigo-300 w-full text-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-indigo-400',
  onError,
}) {
  const { handleResend, label, disabled, busy, blocked, statusMessage } = useOtpResend({
    email,
    onResend,
    initialCooldown,
    active,
  });

  const click = async () => {
    try {
      await handleResend();
    } catch (err) {
      onError?.(err.message);
    }
  };

  return (
    <div className="space-y-1">
      <button type="button" onClick={click} disabled={disabled} className={className}>
        {busy ? 'Sending…' : label}
      </button>
      {blocked && statusMessage && (
        <p className="text-xs text-amber-600 dark:text-amber-400 text-center px-1">
          {statusMessage}
        </p>
      )}
    </div>
  );
}
