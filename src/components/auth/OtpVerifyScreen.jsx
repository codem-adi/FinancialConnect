import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Btn, InputField, Card, OtpResendControl } from '../ui';

export function OtpVerifyScreen({
  purpose = 'activation',
  onDone,
  onBack,
  backLabel,
  title,
  subtitle,
  email: emailProp,
  initialResendCooldown = 30,
}) {
  const { session, verifyOtp, resendOtp, resetPassword, logout } = useAuth();
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const email = emailProp || session?.user?.email || '';

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (purpose === 'activation') {
      sessionStorage.setItem('auth-return-mode', 'signup');
      logout();
    }
  };

  const defaultBackLabel = purpose === 'reset' ? 'Back to login' : 'Use a different email';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (purpose === 'reset') {
        await resetPassword(email, otp, newPassword);
      } else {
        await verifyOtp(email, otp, purpose);
      }
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md !p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{title || 'Verify your account'}</h1>
            <p className="text-xs text-slate-500">{subtitle || `Enter the 6-digit code for ${email}`}</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {!emailProp && <InputField label="Email" type="email" value={email} onChange={() => {}} disabled />}
          <InputField label="OTP code" value={otp} onChange={setOtp} placeholder="123456" />
          {purpose === 'reset' && (
            <InputField label="New password" type="password" value={newPassword} onChange={setNewPassword} placeholder="Min 6 characters" />
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Btn type="submit" className="w-full" disabled={busy || otp.length < 6 || (purpose === 'reset' && newPassword.length < 6)}>
            {busy ? 'Verifying…' : purpose === 'reset' ? 'Reset password' : 'Activate account'}
          </Btn>
        </form>

        <div className="mt-4 space-y-2">
          <OtpResendControl
            email={email}
            initialCooldown={initialResendCooldown}
            active={!!email}
            onResend={() => resendOtp(email, purpose)}
            onError={setError}
          />
          {(onBack || purpose === 'activation') && (
            <button
              type="button"
              onClick={handleBack}
              className="text-sm text-slate-500 hover:text-slate-400 w-full text-center"
            >
              {backLabel || defaultBackLabel}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
