import { Settings, Sun, Moon, Download, Upload, LogOut, Eye } from 'lucide-react';
import { Btn } from '../ui';
import { cn } from '../../lib/utils';
import { HeaderDropdownPanel } from './HeaderDropdownPanel';

function SettingsRow({ icon: Icon, label, sub, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-3 text-left transition-colors',
        'hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 dark:active:bg-slate-800',
        danger && 'text-red-600 dark:text-red-400',
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0', danger ? 'text-red-500' : 'text-slate-500')} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </button>
  );
}

export function SettingsDropdown({
  open,
  onOpenChange,
  theme,
  onToggleTheme,
  isOwner,
  canEdit,
  role,
  householdName,
  onExport,
  onImport,
  onRequestLogout,
}) {
  return (
    <>
      <Btn
        variant="ghost"
        size="sm"
        onClick={() => onOpenChange(!open)}
        title="Settings"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Settings className="w-4 h-4" />
      </Btn>

      <HeaderDropdownPanel open={open} onClose={() => onOpenChange(false)} title="Settings">
        {(householdName || role) && (
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{householdName || 'Account'}</p>
            <p className="text-[10px] text-slate-500 capitalize">
              {role}
              {!canEdit && (
                <span className="text-amber-600 ml-1">
                  <Eye className="w-3 h-3 inline" /> view only
                </span>
              )}
            </p>
          </div>
        )}

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <SettingsRow
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            sub="Switch appearance"
            onClick={() => {
              onToggleTheme();
              onOpenChange(false);
            }}
          />
          {isOwner && (
            <>
              <SettingsRow
                icon={Download}
                label="Export dashboard"
                sub="Download JSON backup"
                onClick={() => {
                  onExport();
                  onOpenChange(false);
                }}
              />
              <SettingsRow
                icon={Upload}
                label="Import dashboard"
                sub="Restore from JSON file"
                onClick={() => {
                  onOpenChange(false);
                  onImport();
                }}
              />
            </>
          )}
          <SettingsRow
            icon={LogOut}
            label="Log out"
            sub="Sign in again to access your data"
            danger
            onClick={() => {
              onOpenChange(false);
              onRequestLogout();
            }}
          />
        </div>
      </HeaderDropdownPanel>
    </>
  );
}
