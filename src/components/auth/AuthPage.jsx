import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Btn, InputField, Card, OtpResendControl } from '../ui';
import { OtpVerifyScreen } from './OtpVerifyScreen';

export function AuthPage() {
  const { login, loginWithOtp, requestLoginOtp, resendOtp, signup, forgotPassword } = useAuth();
  const [mode, setMode] = useState('login');
  const [loginMethod, setLoginMethod] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loginOtpSent, setLoginOtpSent] = useState(false);
  const [loginOtpResendCooldown, setLoginOtpResendCooldown] = useState(0);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinRole, setJoinRole] = useState('viewer');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setInfo('');
    setLoginOtpSent(false);
    setOtp('');
    if (next === 'login') setLoginMethod('password');
  };

  const switchLoginMethod = (method) => {
    setLoginMethod(method);
    setError('');
    setInfo('');
    setLoginOtpSent(false);
    setOtp('');
    setLoginOtpResendCooldown(0);
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitLoginOtpRequest = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const data = await requestLoginOtp(email);
      setLoginOtpSent(true);
      setLoginOtpResendCooldown(data.resendAvailableIn || 30);
      setInfo(data.message || 'Login code sent to your email');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitLoginOtpVerify = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await loginWithOtp(email, otp);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resendLoginOtp = () => resendOtp(email, 'login');

  const submitSignup = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const data = await signup({
        email,
        password,
        name,
        joinCode: joinCode.trim() || undefined,
        role: joinRole,
      });
      if (data.message) setInfo(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const data = await forgotPassword(email);
      setInfo(data.message || 'If the email exists, a reset code was sent.');
      setMode('reset');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'reset') {
    return (
      <OtpVerifyScreen
        purpose="reset"
        email={email}
        title="Reset password"
        subtitle="Enter the code from your email and choose a new password"
        initialResendCooldown={30}
        onDone={() => switchMode('login')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md !p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">RetireWise</h1>
            <p className="text-xs text-slate-500">Personal finance & FIRE planning</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <Btn size="sm" variant={mode === 'login' ? 'primary' : 'secondary'} onClick={() => switchMode('login')}>Log in</Btn>
          <Btn size="sm" variant={mode === 'signup' ? 'primary' : 'secondary'} onClick={() => switchMode('signup')}>Sign up</Btn>
        </div>

        {mode === 'login' && (
          <>
            <div className="flex gap-2 mb-4 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50">
              <button
                type="button"
                onClick={() => switchLoginMethod('password')}
                className={`flex-1 text-sm py-2 rounded-lg transition-colors ${
                  loginMethod === 'password'
                    ? 'bg-white dark:bg-slate-900 font-medium shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => switchLoginMethod('otp')}
                className={`flex-1 text-sm py-2 rounded-lg transition-colors ${
                  loginMethod === 'otp'
                    ? 'bg-white dark:bg-slate-900 font-medium shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Email OTP
              </button>
            </div>

            {loginMethod === 'password' ? (
              <form onSubmit={submitLogin} className="space-y-4">
                <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
                <InputField label="Password" type="password" value={password} onChange={setPassword} placeholder="Your password" />
                <button type="button" onClick={() => switchMode('forgot')} className="text-xs text-indigo-400 hover:text-indigo-300">
                  Forgot password?
                </button>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Btn type="submit" className="w-full" disabled={busy}>
                  {busy ? 'Please wait…' : 'Log in'}
                </Btn>
              </form>
            ) : !loginOtpSent ? (
              <form onSubmit={submitLoginOtpRequest} className="space-y-4">
                <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
                {error && <p className="text-sm text-red-500">{error}</p>}
                {info && <p className="text-sm text-emerald-500">{info}</p>}
                <Btn type="submit" className="w-full" disabled={busy || !email.trim()}>
                  {busy ? 'Sending…' : 'Send login code'}
                </Btn>
              </form>
            ) : (
              <form onSubmit={submitLoginOtpVerify} className="space-y-4">
                <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
                <InputField label="Login code" value={otp} onChange={setOtp} placeholder="6-digit code" />
                {error && <p className="text-sm text-red-500">{error}</p>}
                {info && <p className="text-sm text-emerald-500">{info}</p>}
                <Btn type="submit" className="w-full" disabled={busy || otp.length < 6}>
                  {busy ? 'Verifying…' : 'Log in with code'}
                </Btn>
                <div className="flex flex-col gap-2">
                  <OtpResendControl
                    email={email}
                    initialCooldown={loginOtpResendCooldown}
                    active={loginOtpSent}
                    onResend={resendLoginOtp}
                    onError={setError}
                  />
                  <button type="button" onClick={() => { setLoginOtpSent(false); setOtp(''); setInfo(''); setLoginOtpResendCooldown(0); }} className="text-sm text-slate-500 hover:text-slate-400 w-full text-center">
                    Change email
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {mode === 'signup' && (
          <form onSubmit={submitSignup} className="space-y-4">
            <InputField label="Full name" value={name} onChange={setName} placeholder="Your name" />
            <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
            <InputField label="Password" type="password" value={password} onChange={setPassword} placeholder="Min 6 characters" />
            <InputField
              label="Dashboard join code (optional)"
              value={joinCode}
              onChange={setJoinCode}
              placeholder="e.g. RW-ABC123"
            />
            {joinCode.trim() ? (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Requested access</label>
                <select value={joinRole} onChange={(e) => setJoinRole(e.target.value)} className="w-full">
                  <option value="viewer">View only</option>
                  <option value="editor">Can edit</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">The dashboard owner must approve your request after email verification.</p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Leave join code empty to create your own household dashboard with a unique invite code.
              </p>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            {info && <p className="text-sm text-emerald-500">{info}</p>}
            <Btn type="submit" className="w-full" disabled={busy}>
              {busy ? 'Please wait…' : 'Create account'}
            </Btn>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={submitForgot} className="space-y-4">
            <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
            {error && <p className="text-sm text-red-500">{error}</p>}
            {info && <p className="text-sm text-emerald-500">{info}</p>}
            <Btn type="submit" className="w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset code'}
            </Btn>
            <button type="button" onClick={() => switchMode('login')} className="text-sm text-slate-500 w-full text-center">
              Back to login
            </button>
          </form>
        )}

        <p className="text-xs text-slate-500 mt-6 text-center">
          {mode === 'signup'
            ? 'Verify your email after signup. Without a join code, a new household is created for you.'
            : mode === 'forgot'
              ? 'We\'ll email a one-time code to reset your password.'
              : 'Log in with password or email OTP.'}
        </p>
      </Card>
    </div>
  );
}
