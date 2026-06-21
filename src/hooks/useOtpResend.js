import { useCallback, useEffect, useState } from 'react';
import { fetchOtpStatus } from '../lib/apiOtp';
import { formatOtpWait } from '../lib/otpResend';

/**
 * Shared OTP resend cooldown + 1h block UI state.
 * @param {{ email?: string, onResend: () => Promise<object>, initialCooldown?: number, active?: boolean }} opts
 */
export function useOtpResend({ email, onResend, initialCooldown = 0, active = true }) {
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [blocked, setBlocked] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const syncStatus = useCallback(async () => {
    if (!email || !active) return;
    try {
      const s = await fetchOtpStatus(email);
      if (!s.allowed) {
        setCooldown(s.resendAvailableIn || s.retryAfterSeconds || 0);
        setBlocked(!!s.blocked);
        setStatusMessage(s.message || null);
      } else {
        setBlocked(false);
        setStatusMessage(null);
        if (s.resendAvailableIn > 0) setCooldown(s.resendAvailableIn);
      }
    } catch {
      /* ignore status poll errors */
    }
  }, [email, active]);

  useEffect(() => {
    if (initialCooldown > 0) setCooldown(initialCooldown);
  }, [initialCooldown]);

  useEffect(() => {
    if (active && email) syncStatus();
  }, [active, email, syncStatus]);

  useEffect(() => {
    if (!active || (cooldown <= 0 && !blocked)) return undefined;
    const timer = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          syncStatus();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [active, cooldown, blocked, syncStatus]);

  const handleResend = useCallback(async () => {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const data = await onResend();
      setBlocked(false);
      setCooldown(data.resendAvailableIn || 30);
      return data;
    } catch (err) {
      const wait = err.retryAfterSeconds || 0;
      if (wait > 0) setCooldown(wait);
      if (err.code === 'OTP_BLOCKED') {
        setBlocked(true);
        setStatusMessage(err.message || 'Too many code requests. Please try again in one hour.');
      }
      throw err;
    } finally {
      setBusy(false);
    }
  }, [busy, cooldown, onResend]);

  const startCooldown = useCallback((seconds) => {
    setCooldown(seconds || 30);
    setBlocked(false);
    setStatusMessage(null);
  }, []);

  const setBlockedState = useCallback((message, seconds) => {
    setBlocked(true);
    setStatusMessage(message);
    setCooldown(seconds || 3600);
  }, []);

  let label = 'Resend code';
  if (blocked) {
    label = cooldown > 0 ? `Retry in ${formatOtpWait(cooldown)}` : 'Try again later';
  } else if (cooldown > 0) {
    label = `Resend code in ${formatOtpWait(cooldown)}`;
  }

  const disabled = busy || cooldown > 0;

  return {
    handleResend,
    label,
    disabled,
    busy,
    blocked,
    cooldown,
    statusMessage,
    startCooldown,
    setBlockedState,
  };
}
