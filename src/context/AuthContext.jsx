import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAuthSession, setAuthSession, clearAuthSession } from '../lib/authStorage';
import { otpRequest } from '../lib/apiOtp';
import { authApi } from '../services/endpoints';

const AuthContext = createContext(null);

function authError(err, fallback) {
  const data = err.response?.data || {};
  const error = new Error(data.error || fallback);
  error.code = data.code;
  error.retryAfterSeconds = data.retryAfterSeconds;
  error.blockedUntil = data.blockedUntil;
  throw error;
}

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
    authApi.me()
      .then(({ data: me }) => {
        applySession({ ...stored, token: stored.token, ...me });
      })
      .catch(() => applySession(null))
      .finally(() => setLoading(false));
  }, [applySession]);

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await authApi.login(email, password);
      applySession({ ...data, token: data.token });
      return data;
    } catch (err) {
      const data = err.response?.data;
      if (data?.token && data?.code === 'NEEDS_VERIFICATION') {
        applySession({ ...data, token: data.token, needsVerification: true });
        return data;
      }
      authError(err, 'Login failed');
    }
  }, [applySession]);

  const signup = useCallback(async ({ email, password, name, joinCode, role }) => {
    try {
      const { data } = await authApi.signup({
        email, password, name, joinCode: joinCode || undefined, role,
      });
      applySession({ ...data, token: data.token });
      return data;
    } catch (err) {
      authError(err, 'Signup failed');
    }
  }, [applySession]);

  const verifyOtp = useCallback(async (email, otp, purpose = 'activation') => {
    try {
      const { data } = await authApi.verifyOtp({ email, otp, purpose });
      applySession({ ...getAuthSession(), ...data, token: data.token || getAuthSession()?.token });
      return data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Verification failed');
    }
  }, [applySession]);

  const resendOtp = useCallback(async (email, purpose = 'activation') => (
    otpRequest(authApi.resendOtp(email, purpose), 'Could not resend OTP')
  ), []);

  const requestLoginOtp = useCallback(async (email) => (
    otpRequest(authApi.loginOtp(email), 'Could not send login code')
  ), []);

  const loginWithOtp = useCallback(async (email, otp) => {
    try {
      const { data } = await authApi.verifyOtp({ email, otp, purpose: 'login' });
      applySession({ ...data, token: data.token });
      return data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Login failed');
    }
  }, [applySession]);

  const forgotPassword = useCallback(async (email) => (
    otpRequest(authApi.forgotPassword(email), 'Request failed')
  ), []);

  const resetPassword = useCallback(async (email, otp, newPassword) => {
    try {
      const { data } = await authApi.resetPassword({ email, otp, newPassword });
      applySession({ ...data, token: data.token });
      return data;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Reset failed');
    }
  }, [applySession]);

  const logout = useCallback(() => applySession(null), [applySession]);

  const refreshSession = useCallback(async () => {
    try {
      const { data: me } = await authApi.me();
      applySession({ ...getAuthSession(), ...me, token: getAuthSession()?.token });
    } catch {
      /* ignore */
    }
  }, [applySession]);

  const requestLeaveGroupOtp = useCallback(async () => (
    otpRequest(authApi.leaveRequestOtp(), 'Could not send verification code')
  ), []);

  const leaveGroup = useCallback(async (otp) => {
    const data = await otpRequest(authApi.leave(otp), 'Could not leave group');
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
