import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export function useLogoutConfirm() {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);

  const requestLogout = useCallback(() => setOpen(true), []);
  const cancelLogout = useCallback(() => setOpen(false), []);
  const confirmLogout = useCallback(() => {
    logout();
    setOpen(false);
  }, [logout]);

  const LogoutConfirmDialog = (
    <ConfirmDialog
      open={open}
      message="log out"
      detail="You will need to sign in again to access your financial dashboard."
      confirmLabel="Log out"
      variant="danger"
      onConfirm={confirmLogout}
      onCancel={cancelLogout}
    />
  );

  return { requestLogout, LogoutConfirmDialog };
}
