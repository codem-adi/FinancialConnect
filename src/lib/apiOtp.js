import { authHeaders } from './authStorage';
import { API_BASE } from './apiBase';

export async function parseOtpJson(res, fallbackError = 'Request failed') {
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || fallbackError);
    err.code = data.code;
    err.retryAfterSeconds = data.retryAfterSeconds;
    err.blockedUntil = data.blockedUntil;
    throw err;
  }
  return data;
}

export async function fetchOtpStatus(email) {
  if (!email) return { allowed: true, resendAvailableIn: 0, sendsRemaining: 5, blocked: false };
  const res = await fetch(
    `${API_BASE}/auth/otp-status?email=${encodeURIComponent(email)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) return { allowed: true, resendAvailableIn: 0, sendsRemaining: 5, blocked: false };
  return res.json();
}

export async function requestLeaveGroupOtpApi() {
  const res = await fetch(`${API_BASE}/team/leave/request-otp`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return parseOtpJson(res, 'Could not send verification code');
}

export async function leaveGroupApi(otp) {
  const res = await fetch(`${API_BASE}/team/leave`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ otp }),
  });
  return parseOtpJson(res, 'Could not leave group');
}
