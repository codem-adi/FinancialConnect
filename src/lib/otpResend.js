/** Format seconds as human-readable wait time */
export function formatOtpWait(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.ceil((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r > 0 ? `${m}m ${r}s` : `${m}m`;
  }
  return `${s}s`;
}

export function applyOtpRateLimitFromResponse(data) {
  return {
    cooldown: data?.resendAvailableIn || 0,
    blocked: data?.code === 'OTP_BLOCKED',
    message: data?.error || null,
  };
}

export function applyOtpRateLimitFromError(err) {
  return {
    cooldown: err?.retryAfterSeconds || 0,
    blocked: err?.code === 'OTP_BLOCKED',
    message: err?.message || null,
  };
}
