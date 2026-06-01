/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import MembersList from './components/Members/MembersList';
import PaymentsList from './components/Payments/PaymentsList';
import ExpensesList from './components/Expenses/ExpensesList';
import EventsList from './components/Events/EventsList';
import Reports from './components/Reports/Reports';
import Settings from './components/Settings';
import Login from './components/Login';
import BloodDonorsList from './components/BloodDonorsList';
import NoticeBoard from './components/NoticeBoard';
import MemberPolls from './components/MemberPolls';
import LoanTracker from './components/LoanTracker';
import DueRemindersList from './components/DueRemindersList';
import AiCopilot from './components/AiCopilot';
import GoogleSheetsSync from './components/GoogleSheetsSync';
import YearlyLedger from './components/YearlyLedger';
import SpecialProjects from './components/SpecialProjects';
import ReliefDistribution from './components/ReliefDistribution';
import { MemberRoleType } from './types';

function AppContent() {
  const { user, loading, t } = useAppContext();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#020905] bg-[radial-gradient(ellipse_at_center,rgba(6,78,59,0.4),transparent_80%)]">
        <div className="flex flex-col items-center gap-4 p-8 rounded-[2rem] border border-emerald-900/30 bg-black/60 shadow-2xl backdrop-blur-2xl">
          <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-amber-400 font-bold tracking-wide text-xs uppercase animate-pulse">অনুরোধ প্রক্রিয়াধীন...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard setActiveTab={setActiveTab} />;
      case 'members':
        return <MembersList />;
      case 'yearly-ledger':
        return <YearlyLedger setActiveTab={setActiveTab} />;
      case 'events':
        return <EventsList />;
      case 'payments':
        return <PaymentsList />;
      case 'expenses':
        return <ExpensesList />;
      case 'blood-donors':
        return <BloodDonorsList />;
      case 'notice-board':
        return <NoticeBoard />;
      case 'member-polls':
        return <MemberPolls />;
      case 'loan-tracker':
        return <LoanTracker />;
      case 'special-projects':
        return <SpecialProjects />;
      case 'relief-distribution':
        return <ReliefDistribution />;
      case 'reminders':
        return <DueRemindersList />;
      case 'ai-copilot':
        return <AiCopilot />;
      case 'google-sheets':
        return <GoogleSheetsSync />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
