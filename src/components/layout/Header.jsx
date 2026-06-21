import { Moon, Sun, Download, Upload, TrendingUp, LogOut, Eye } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useLogoutConfirm } from '../../hooks/useLogoutConfirm';
import { exportJSON, importJSON } from '../../lib/api';
import { NotificationsDropdown } from '../notifications/NotificationsDropdown';
import { Btn } from '../ui';

export function Header() {
  const { data, toggleTheme, importData, setActiveTab, canEdit } = useApp();
  const { user, role, isOwner, household } = useAuth();
  const { requestLogout, LogoutConfirmDialog } = useLogoutConfirm();

  const handleImport = () => {
    if (!isOwner) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const imported = await importJSON(file);
        await importData(imported);
      } catch (err) {
        alert(err.message || 'Import failed');
      }
    };
    input.click();
  };

  return (
    <>
      {LogoutConfirmDialog}
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">RetireWise</h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              {household?.name || user?.name || 'Personal Finance'} · {role}
              {!canEdit && <span className="text-amber-600 ml-1"><Eye className="w-3 h-3 inline" /> view only</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsDropdown onOpenTeam={() => setActiveTab('team')} />
          {isOwner && (
            <>
              <Btn variant="ghost" size="sm" onClick={() => exportJSON(data)} title="Export dashboard"><Download className="w-4 h-4" /></Btn>
              <Btn variant="ghost" size="sm" onClick={handleImport} title="Import dashboard"><Upload className="w-4 h-4" /></Btn>
            </>
          )}
          <Btn variant="ghost" size="sm" onClick={toggleTheme}>
            {data.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Btn>
          <Btn variant="ghost" size="sm" onClick={requestLogout} title="Log out"><LogOut className="w-4 h-4" /></Btn>
        </div>
      </div>
    </header>
    </>
  );
}
