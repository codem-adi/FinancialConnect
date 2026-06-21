import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAuthSession, setAuthSession, clearAuthSession } from '../lib/authStorage';
import { otpRequest } from '../lib/apiOtp';
import { authApi, appApi } from '../services/endpoints';

const AuthContext = createContext(null);

const DEFAULT_FEATURES = {
  sendEmail: true,
  otpEnabled: true,
  passwordResetEnabled: true,
  leaveGroupOtpEnabled: true,
};

function authError(err, fallback) {
  const data = err.response?.data || {};
  const error = new Error(data.error || fallback);
  error.code = data.code;
  error.retryAfterSeconds = data.retryAfterSeconds;
  error.blockedUntil = data.blockedUntil;
  throw error;
}

function logOtpNotSent(data) {
  if (data?.otpSent === false) {
    console.error('[auth] Verification code was not sent:', data.message || data.error);
  }
}

function normalizeAuthPayload(data, otpEnabled) {
  const next = { ...data, token: data.token };
  if (!otpEnabled) {
    next.needsVerification = false;
    if (next.user) next.user = { ...next.user, isActive: true };
  } else {
    next.needsVerification = data.needsVerification ?? data.user?.isActive === false;
  }
  return next;
}

async function loadAuthFeatures() {
  try {
    const { data } = await authApi.config();
    return { ...DEFAULT_FEATURES, ...data };
  } catch {
    try {
      const { data: health } = await appApi.health();
      if (health.auth) return { ...DEFAULT_FEATURES, ...health.auth };
    } catch {
      /* ignore */
    }
  }
  return DEFAULT_FEATURES;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getAuthSession());
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
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
    let cancelled = false;

    const boot = async () => {
      const config = await loadAuthFeatures();
      if (!cancelled) setFeatures(config);

      const stored = getAuthSession();
      if (!stored?.token) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const { data: me } = await authApi.me();
        if (!cancelled) {
          applySession(normalizeAuthPayload(
            { ...stored, ...me, token: stored.token },
            config.otpEnabled,
          ));
        }
      } catch {
        if (!cancelled) applySession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    boot();
    return () => { cancelled = true; };
  }, [applySession]);

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await authApi.login(email, password);
      applySession(normalizeAuthPayload(data, features.otpEnabled));
      return data;
    } catch (err) {
      const data = err.response?.data;
      if (features.otpEnabled && data?.token && data?.code === 'NEEDS_VERIFICATION') {
        logOtpNotSent(data);
        applySession(normalizeAuthPayload({ ...data, needsVerification: true }, true));
        return data;
      }
      authError(err, 'Login failed');
    }
  }, [applySession, features.otpEnabled]);

  const signup = useCallback(async ({ email, password, name, joinCode, role }) => {
    try {
      const { data } = await authApi.signup({
        email, password, name, joinCode: joinCode || undefined, role,
      });
      applySession(normalizeAuthPayload(data, features.otpEnabled));
      logOtpNotSent(data);
      return data;
    } catch (err) {
      authError(err, 'Signup failed');
    }
  }, [applySession, features.otpEnabled]);

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
      applySession(normalizeAuthPayload(
        { ...getAuthSession(), ...me, token: getAuthSession()?.token },
        features.otpEnabled,
      ));
    } catch {
      /* ignore */
    }
  }, [applySession, features.otpEnabled]);

  const requestLeaveGroupOtp = useCallback(async () => (
    otpRequest(authApi.leaveRequestOtp(), 'Could not send verification code')
  ), []);

  const leaveGroup = useCallback(async (otp) => {
    const data = await otpRequest(authApi.leave(otp), 'Could not leave group');
    applySession({ ...data, token: data.token });
    return data;
  }, [applySession]);

  const otpEnabled = features.otpEnabled;
  const needsVerification = otpEnabled && (session?.needsVerification || session?.user?.isActive === false);
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
      otpEnabled,
      passwordResetEnabled: features.passwordResetEnabled,
      leaveGroupOtpEnabled: features.leaveGroupOtpEnabled,
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
