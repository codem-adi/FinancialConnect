import { useState } from 'react';
import { TrendingUp, Eye } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useLogoutConfirm } from '../../hooks/useLogoutConfirm';
import { exportJSON, importJSON } from '../../lib/api';
import { NotificationsDropdown } from '../notifications/NotificationsDropdown';
import { SettingsDropdown } from './SettingsDropdown';

export function Header() {
  const { data, toggleTheme, importData, setActiveTab, canEdit } = useApp();
  const { user, role, isOwner, household } = useAuth();
  const { requestLogout, LogoutConfirmDialog } = useLogoutConfirm();
  const [openPanel, setOpenPanel] = useState(null);

  const setPanel = (panel) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

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
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base sm:text-lg leading-tight truncate">RetireWise</h1>
              <p className="text-[10px] sm:text-xs text-slate-500 hidden sm:block truncate">
                {household?.name || user?.name || 'Personal Finance'} · {role}
                {!canEdit && (
                  <span className="text-amber-600 ml-1">
                    <Eye className="w-3 h-3 inline" /> view only
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <NotificationsDropdown
              open={openPanel === 'notifications'}
              onOpenChange={(next) => setOpenPanel(next ? 'notifications' : null)}
              onOpenTeam={() => setActiveTab('team')}
            />
            <SettingsDropdown
              open={openPanel === 'settings'}
              onOpenChange={(next) => setOpenPanel(next ? 'settings' : null)}
              theme={data.theme}
              onToggleTheme={toggleTheme}
              isOwner={isOwner}
              canEdit={canEdit}
              role={role}
              householdName={household?.name || user?.name}
              onExport={() => exportJSON(data)}
              onImport={handleImport}
              onRequestLogout={requestLogout}
            />
          </div>
        </div>
      </header>
    </>
  );
}
