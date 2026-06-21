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

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]"
      aria-label="Main navigation"
    >
      <div className="flex overflow-x-auto gap-0.5 px-1.5 py-1.5 scrollbar-hide snap-x snap-mandatory">
        {mainTabs.map(({ id, shortLabel, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex flex-col items-center justify-center shrink-0 min-w-[4.25rem] max-w-[4.75rem] px-1.5 py-1.5 rounded-xl snap-start transition-colors',
                active
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 dark:text-slate-400',
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
}
