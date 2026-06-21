import { useAuth } from '../../context/AuthContext';
import { useApiHealth } from '../../hooks/useApiHealth';
import { AuthPage } from './AuthPage';
import { BackendLoadingScreen } from './BackendLoadingScreen';
import { OtpVerifyScreen } from './OtpVerifyScreen';
import { AwaitingApprovalScreen } from './AwaitingApprovalScreen';

export function AuthGate({ children }) {
  const apiHealth = useApiHealth();
  const { session, loading, needsVerification, awaitingApproval } = useAuth();

  if (apiHealth !== 'ok') {
    return <BackendLoadingScreen />;
  }

  if (loading) {
    return <BackendLoadingScreen />;
  }

  if (session?.token && needsVerification) {
    return (
      <OtpVerifyScreen
        purpose="activation"
        initialResendCooldown={session.resendAvailableIn ?? 30}
      />
    );
  }

  if (session?.token && awaitingApproval) {
    return <AwaitingApprovalScreen />;
  }

  if (!session?.token) return <AuthPage />;
  return children;
}
