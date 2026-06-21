import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAuthSession, setAuthSession, clearAuthSession, authHeaders } from '../lib/authStorage';
import { parseOtpJson } from '../lib/apiOtp';
import { API_BASE } from '../lib/apiBase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getAuthSession());
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((next) => {
    if (next) {
      setAuthSession(next);
      setSession(next);
    } else {
      clearAuthSession();
      setSession(null);
    }
  }, []);

  useEffect(() => {
    const stored = getAuthSession();
    if (!stored?.token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/auth/me`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((me) => {
        applySession({ ...stored, token: stored.token, ...me });
      })
      .catch(() => applySession(null))
      .finally(() => setLoading(false));
  }, [applySession]);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok) {
      applySession({ ...data, token: data.token });
      return data;
    }
    if (data.token && data.code === 'NEEDS_VERIFICATION') {
      applySession({ ...data, token: data.token, needsVerification: true });
      return data;
    }
    const err = new Error(data.error || 'Login failed');
    err.code = data.code;
    err.retryAfterSeconds = data.retryAfterSeconds;
    err.blockedUntil = data.blockedUntil;
    throw err;
  }, [applySession]);

  const signup = useCallback(async ({ email, password, name, joinCode, role }) => {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, password, name, joinCode: joinCode || undefined, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || 'Signup failed');
      err.code = data.code;
      err.retryAfterSeconds = data.retryAfterSeconds;
      err.blockedUntil = data.blockedUntil;
      throw err;
    }
    applySession({ ...data, token: data.token });
    return data;
  }, [applySession]);

  const verifyOtp = useCallback(async (email, otp, purpose = 'activation') => {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, otp, purpose }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Verification failed');
    applySession({ ...getAuthSession(), ...data, token: data.token || getAuthSession()?.token });
    return data;
  }, [applySession]);

  const resendOtp = useCallback(async (email, purpose = 'activation') => {
    const res = await fetch(`${API_BASE}/auth/resend-otp`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, purpose }),
    });
    return parseOtpJson(res, 'Could not resend OTP');
  }, []);

  const requestLoginOtp = useCallback(async (email) => {
    const res = await fetch(`${API_BASE}/auth/login-otp`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email }),
    });
    return parseOtpJson(res, 'Could not send login code');
  }, []);

  const loginWithOtp = useCallback(async (email, otp) => {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, otp, purpose: 'login' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    applySession({ ...data, token: data.token });
    return data;
  }, [applySession]);

  const forgotPassword = useCallback(async (email) => {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email }),
    });
    return parseOtpJson(res, 'Request failed');
  }, []);

  const resetPassword = useCallback(async (email, otp, newPassword) => {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, otp, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Reset failed');
    applySession({ ...data, token: data.token });
    return data;
  }, [applySession]);

  const logout = useCallback(() => applySession(null), [applySession]);

  const refreshSession = useCallback(async () => {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    if (!res.ok) return;
    const me = await res.json();
    applySession({ ...getAuthSession(), ...me, token: getAuthSession()?.token });
  }, [applySession]);

  const requestLeaveGroupOtp = useCallback(async () => {
    const res = await fetch(`${API_BASE}/team/leave/request-otp`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return parseOtpJson(res, 'Could not send verification code');
  }, []);

  const leaveGroup = useCallback(async (otp) => {
    const res = await fetch(`${API_BASE}/team/leave`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ otp }),
    });
    const data = await parseOtpJson(res, 'Could not leave group');
    applySession({ ...data, token: data.token });
    return data;
  }, [applySession]);

  const needsVerification = session?.needsVerification || session?.user?.isActive === false;
  const awaitingApproval = session?.awaitingApproval;
  const isOwner = session?.role === 'owner';

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user,
      household: session?.household,
      role: session?.role,
      isOwner,
      canEdit: session?.canEdit !== false && !awaitingApproval,
      needsVerification,
      awaitingApproval,
      loading,
      login,
      loginWithOtp,
      requestLoginOtp,
      signup,
      logout,
      verifyOtp,
      resendOtp,
      forgotPassword,
      resetPassword,
      refreshSession,
      requestLeaveGroupOtp,
      leaveGroup,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
