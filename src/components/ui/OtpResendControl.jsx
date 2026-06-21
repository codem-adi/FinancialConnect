import { useEffect } from 'react';
import { useOtpResend } from '../../hooks/useOtpResend';
import { formatOtpWait } from '../../lib/otpResend';

/** Resend OTP button with 30s cooldown and 1h block messaging */
export function OtpResendControl({
  email,
  onResend,
  initialCooldown = 0,
  active = true,
  className = 'text-sm text-indigo-400 hover:text-indigo-300 w-full text-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-indigo-400',
  onError,
  onBlockedChange,
}) {
  const { handleResend, label, disabled, busy, blocked, cooldown } = useOtpResend({
    email,
    onResend,
    initialCooldown,
    active,
  });

  useEffect(() => {
    onBlockedChange?.(blocked);
    if (blocked) onError?.('');
  }, [blocked, onError, onBlockedChange]);

  const click = async () => {
    try {
      await handleResend();
      onError?.('');
    } catch (err) {
      if (err?.code === 'OTP_BLOCKED') {
        onError?.('');
      } else {
        onError?.(err.message);
      }
    }
  };

  if (blocked) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 text-center px-1">
        {`Too many code requests. Please try again in ${formatOtpWait(cooldown)}.`}
      </p>
    );
  }

  return (
    <button type="button" onClick={click} disabled={disabled} className={className}>
      {busy ? 'Sending…' : label}
    </button>
  );
}
