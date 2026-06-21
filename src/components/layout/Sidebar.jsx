import { createPortal } from 'react-dom';
import { LayoutDashboard, Receipt, Users, Landmark, Wallet, Target, Flame, ChevronRight, UsersRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { cn } from '../../lib/utils';

export const mainTabs = [
  { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard },
  { id: 'expenses', label: 'Expenses', shortLabel: 'Expenses', icon: Receipt },
  { id: 'family', label: 'Family Income', shortLabel: 'Income', icon: Users },
  { id: 'assets', label: 'Assets', shortLabel: 'Assets', icon: Landmark },
  { id: 'loans', label: 'Loans', shortLabel: 'Loans', icon: Wallet },
  { id: 'goals', label: 'Financial Goals', shortLabel: 'Goals', icon: Target },
  { id: 'team', label: 'Financial Group', shortLabel: 'Group', icon: UsersRound },
  { id: 'retirewise', label: 'RetireWise — FIRE Planning', shortLabel: 'FIRE', icon: Flame },
];

export function Sidebar() {
  const { activeTab, setActiveTab } = useApp();

  return (
    <aside className="w-64 shrink-0 hidden lg:block">
      <nav className="sticky top-20 space-y-1">
        {mainTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
              activeTab === id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800',
            )}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className="truncate">{label}</span>
            {activeTab === id && <ChevronRight className="w-4 h-4 ml-auto shrink-0" />}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export function MobileNav() {
  const { activeTab, setActiveTab } = useApp();

  const nav = (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)] pb-[max(0.375rem,env(safe-area-inset-bottom))]"
      aria-label="Main navigation"
    >
      <div className="grid grid-cols-4 gap-0.5 px-1 pt-1.5 max-w-[1600px] mx-auto">
        {mainTabs.map(({ id, shortLabel, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex flex-col items-center justify-center min-h-[3.25rem] px-1 py-1.5 rounded-xl transition-colors touch-manipulation',
                active
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800',
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="text-[10px] font-medium mt-0.5 leading-tight text-center truncate w-full">
                {shortLabel}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  return createPortal(nav, document.body);
}
