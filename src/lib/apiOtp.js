import { authApi } from '../services/endpoints';

export function throwOtpError(err, fallbackError = 'Request failed') {
  const data = err.response?.data || {};
  const error = new Error(data.error || fallbackError);
  error.code = data.code;
  error.retryAfterSeconds = data.retryAfterSeconds;
  error.blockedUntil = data.blockedUntil;
  throw error;
}

export async function otpRequest(promise, fallbackError = 'Request failed') {
  try {
    const { data } = await promise;
    return data;
  } catch (err) {
    throwOtpError(err, fallbackError);
  }
}

export async function fetchOtpStatus(email) {
  if (!email) return { allowed: true, resendAvailableIn: 0, sendsRemaining: 5, blocked: false };
  try {
    const { data } = await authApi.otpStatus(email);
    return data;
  } catch {
    return { allowed: true, resendAvailableIn: 0, sendsRemaining: 5, blocked: false };
  }
}
