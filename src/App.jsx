import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { AuthGate } from './components/auth/AuthGate';
import { Header } from './components/layout/Header';
import { Sidebar, MobileNav } from './components/layout/Sidebar';
import { ViewOnlyBanner } from './components/ui';
import { OverviewTab } from './components/finance/OverviewTab';
import { FamilyTab } from './components/finance/FamilyTab';
import { AssetsTab } from './components/finance/AssetsTab';
import { LoansTab } from './components/finance/LoansTab';
import { GoalsTab } from './components/finance/GoalsTab';
import { ExpensesTab } from './components/finance/ExpensesTab';
import { RetireWiseTab } from './components/retirewise/RetireWiseTab';
import { TeamTab } from './components/team/TeamTab';

function Dashboard() {
  const { activeTab, canEdit } = useApp();

  const tabs = {
    overview: <OverviewTab />,
    expenses: <ExpensesTab />,
    family: <FamilyTab />,
    assets: <AssetsTab />,
    loans: <LoansTab />,
    goals: <GoalsTab />,
    retirewise: <RetireWiseTab />,
    team: <TeamTab />,
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Header />
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6 flex gap-4 sm:gap-6">
        <Sidebar />
        <main className="flex-1 min-w-0 pb-[8.5rem] lg:pb-6">
          {!canEdit && activeTab !== 'team' && (
            <div className="mb-4">
              <ViewOnlyBanner />
            </div>
          )}
          {tabs[activeTab]}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AppProvider>
          <Dashboard />
        </AppProvider>
      </AuthGate>
    </AuthProvider>
  );
}
