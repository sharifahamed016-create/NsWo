/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Menu, X, Home, Users, CreditCard, PieChart, 
  FileText, Settings, LogOut, Languages, Search, Bell,
  Award, Heart, Calendar, Sparkles, Shield, FileSpreadsheet
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { getImageUrl } from '../lib/utils';
import Notifications from './Notifications';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const { user, logout, language, setLanguage, t, settings, userRole } = useAppContext();

  const menuItems = [
    { id: 'dashboard', label: language === 'bn' ? 'সারাংশ' : 'Dashboard', emoji: '🏠', icon: Home },
    { id: 'members', label: language === 'bn' ? 'সাধারণ সদস্য' : 'Members', emoji: '👥', icon: Users },
    { id: 'yearly-ledger', label: language === 'bn' ? 'বাৎসরিক লেজার' : 'Yearly Ledger', emoji: '📅', icon: Calendar },
    { id: 'payments', label: language === 'bn' ? 'পেমেন্ট এন্ট্রি' : 'Payment Entry', emoji: '💰', icon: CreditCard },
    { id: 'expenses', label: language === 'bn' ? 'আয়-ব্যয় হিসাব' : 'Income & Expense', emoji: '⚖️', icon: FileText },
    { id: 'events', label: language === 'bn' ? 'ইভেন্ট ম্যানেজমেন্ট' : 'Events', emoji: '🎉', icon: Calendar },
    { id: 'blood-donors', label: language === 'bn' ? 'রক্তদাতা ডিরেক্টরি' : 'Blood Donors', emoji: '🩸', icon: Heart },
    { id: 'notice-board', label: language === 'bn' ? 'ডিজিটাল নোটিশ বোর্ড' : 'Notice Board', emoji: '🏛️', icon: FileText },
    { id: 'member-polls', label: language === 'bn' ? 'ভোটিং ও পোলিং' : 'Member Polls', emoji: '🗳️', icon: Users },
    { id: 'loan-tracker', label: language === 'bn' ? 'কর্জে হাসানা ট্র্যাকার' : 'Hasanah Loan Fund', emoji: '🤝', icon: CreditCard },
    { id: 'special-projects', label: language === 'bn' ? 'বিশেষ প্রজেক্ট' : 'Special Projects', emoji: '🏗️', icon: Award },
    { id: 'relief-distribution', label: language === 'bn' ? 'ত্রাণ ও বন্টন' : 'Relief & Zakat', emoji: '📦', icon: CreditCard },
    { id: 'reminders', label: language === 'bn' ? 'বকেয়া রিমাইন্ডার' : 'Due Reminders', emoji: '🔔', icon: Bell },
    { id: 'ai-copilot', label: language === 'bn' ? 'এআই অ্যাসিস্ট্যান্ট' : 'AI Copilot', emoji: '🤖', icon: Sparkles },
    { id: 'google-sheets', label: language === 'bn' ? 'গুগল শিট সিঙ্ক' : 'Google Sheet Sync', emoji: '📊', icon: FileSpreadsheet },
    { id: 'reports', label: language === 'bn' ? 'রিপোর্ট' : 'Reports', emoji: '📊', icon: FileText },
    { id: 'settings', label: language === 'bn' ? 'সেটিংস' : 'Settings', emoji: '⚙️', icon: Settings },
  ];

  const appName = language === 'bn' ? settings.nameBn : settings.name;

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'bn' : 'en');
  };

  const isLightColor = (hex?: string) => {
    if (!hex) return false;
    const c = hex.replace('#', '');
    if (c.length !== 6) return false;
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 170;
  };

  const isLight = isLightColor(settings.themeColor);
  const themeTextColor = isLight ? 'text-slate-950 font-black' : 'text-white';
  const themeTextMuted = isLight ? 'text-slate-700/90 font-semibold' : 'text-white/85';
  const themeNavActive = isLight ? 'bg-slate-900 text-white shadow-xs font-bold' : 'bg-white text-slate-900 font-bold';
  const themeNavInactive = isLight ? 'text-slate-800 hover:bg-black/5 font-semibold' : 'text-white/70 hover:bg-white/10';
  const themeBgMuted = isLight ? 'bg-black/5 text-slate-800 font-medium' : 'bg-white/10 text-white';
  const themeBgMutedDark = isLight ? 'bg-black/10' : 'bg-black/20';
  const themeBorderColor = isLight ? 'border-black/5' : 'border-white/10';
  const themeHoverBg = isLight ? 'hover:bg-black/5' : 'hover:bg-white/10';

  const [quotaExceeded, setQuotaExceeded] = useState(() => {
    return typeof window !== 'undefined' ? !!(window as any).__firestore_quota_exceeded : false;
  });

  React.useEffect(() => {
    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('nswo_quota_exceeded', handleQuota);
    return () => window.removeEventListener('nswo_quota_exceeded', handleQuota);
  }, []);

  return (
    <div className="min-h-screen bg-[#020905] font-sans text-slate-100 bg-[radial-gradient(ellipse_at_top,rgba(6,78,59,0.3),transparent_70%)]">
      {/* Quota Exceeded Local Storage Warning Banner */}
      {quotaExceeded && (
        <div className="bg-amber-500 text-amber-950 px-4 py-2.5 text-center text-xs lg:text-sm font-semibold flex items-center justify-center gap-2 border-b border-amber-600 shadow-sm animate-pulse sticky top-0 z-50">
          <span className="text-base">🛰️</span>
          <span>
            {language === 'bn' 
              ? 'লোকাল স্মার্ট মোড সক্রিয়! সার্ভার কোটা পূর্ণ হওয়ায় ডাটাবেস অফলাইন ক্যাশড কপি থেকে চলছে। আপনার কাজ লোকালি নিরাপদে সংরক্ষিত হচ্ছে।' 
              : 'Local Offline Mode active! Server quota exceeded, using high-performance cached local storage. Your changes continue to persist securely.'
            }
          </span>
        </div>
      )}

      {/* Mobile Header */}
      <header 
        className={`lg:hidden flex items-center justify-between p-4 ${themeTextColor} shadow-md sticky top-0 z-50`}
        style={{ backgroundColor: settings.themeColor }}
      >
        <div className="flex items-center gap-3">
          {getImageUrl(settings.logoURL) ? (
            <img src={getImageUrl(settings.logoURL)} alt="Logo" className={`w-12 h-12 rounded-xl object-cover border ${isLight ? 'border-black/10' : 'border-white/20'} shadow-sm`} referrerPolicy="no-referrer" />
          ) : (
            <div className={`w-12 h-12 ${isLight ? 'bg-black/10' : 'bg-white/20'} backdrop-blur-sm rounded-xl flex items-center justify-center border ${themeBorderColor} shadow-sm`}>
              <span className={`font-black text-lg ${themeTextColor}`}>{appName.charAt(0)}</span>
            </div>
          )}
          <h1 className={`font-black truncate max-w-[200px] text-lg ${themeTextColor}`}>{appName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsNotificationsOpen(true)}
            className={`p-2 relative ${isLight ? 'bg-black/10 text-slate-800 hover:bg-black/15' : 'bg-white/10 text-white hover:bg-white/20'} rounded-lg transition-colors`}
          >
            <Bell size={20} />
            <div className={`absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border ${isLight ? 'border-slate-50' : 'border-emerald-700'}`} />
          </button>
          <button onClick={() => setIsSidebarOpen(true)} className={`p-2 ${themeTextColor}`}>
            <Menu size={24} />
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside 
          className="hidden lg:flex flex-col w-64 h-screen text-slate-50 sticky top-0 transition-all duration-500 border-r border-[#d97706]/20 bg-gradient-to-b from-[#021c10] to-[#010906]"
        >
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3 mb-6">
              {getImageUrl(settings.logoURL) ? (
                <img src={getImageUrl(settings.logoURL)} alt="Logo" className="w-16 h-16 rounded-2xl object-cover shadow-xl border-2 border-white/20" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-xl border border-white/10">
                  <span className="text-white font-black text-2xl">{appName.charAt(0)}</span>
                </div>
              )}
              <div className="leading-tight min-w-0">
                <h1 className="font-bold text-white text-sm uppercase tracking-wider truncate max-w-[140px] leading-tight block">{appName}</h1>
                <p className="text-[10px] text-white/60 uppercase tracking-widest mt-0.5">{t.adminPanel}</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  activeTab === item.id 
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black border border-amber-400/40 transform scale-[1.02]' 
                    : 'hover:bg-emerald-900/45 text-slate-300 hover:text-white'
                }`}
              >
                <span className="text-lg">{item.emoji}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-white/10 bg-black/5">
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl mb-3">
              <img 
                src={getImageUrl(user?.photoURL) || 'https://ui-avatars.com/api/?name=' + user?.displayName} 
                alt="Profile" 
                className="w-10 h-10 rounded-full border-2 border-white/20 shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-white leading-tight">{user?.displayName}</p>
                <p className="text-[10px] truncate text-white/50 lowercase leading-tight mt-0.5">{user?.email}</p>
                <div className="mt-1">
                  <span className={`inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded gap-1 shadow-sm uppercase tracking-wider ${
                    userRole === 'ADMIN' ? 'bg-amber-400 text-amber-950' :
                    userRole === 'MODERATOR' ? 'bg-sky-450 text-sky-950' :
                    'bg-slate-500 text-white'
                  }`}>
                    {userRole === 'ADMIN' ? '👑 Admin' :
                     userRole === 'MODERATOR' ? '🛡️ Moderator' : '👁️ Viewer'}
                  </span>
                </div>
              </div>
            </div>
            <button 
              onClick={logout}
              className="w-full flex items-center gap-2 px-4 py-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-xs"
            >
              <LogOut size={16} />
              {t.logout}
            </button>
          </div>
        </aside>

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {isSidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={`fixed left-0 top-0 bottom-0 w-[280px] ${themeTextColor} z-[70] lg:hidden flex flex-col shadow-2xl`}
                style={{ backgroundColor: settings.themeColor }}
              >
                <div className={`p-5 flex items-center justify-between border-b ${themeBorderColor}`}>
                  <div className="flex items-center gap-2">
                    {getImageUrl(settings.logoURL) ? (
                      <img src={getImageUrl(settings.logoURL)} alt="Logo" className="w-8 h-8 rounded flex items-center justify-center object-cover border border-white/10" referrerPolicy="no-referrer" />
                    ) : (
                      <div className={`w-8 h-8 ${themeBgMuted} flex items-center justify-center rounded`}>
                        <span className="font-bold">{appName.charAt(0)}</span>
                      </div>
                    )}
                    <span className="font-black text-sm truncate max-w-[150px]">{appName}</span>
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className={`p-1 rounded-full ${themeHoverBg}`}>
                    <X size={20} />
                  </button>
                </div>
                
                <div className={`p-4 ${themeBgMutedDark}`}>
                  <button 
                    onClick={toggleLanguage}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 ${themeBgMuted} rounded-lg text-xs font-bold`}
                  >
                    <Languages size={14} />
                    {language === 'en' ? 'বাংলা' : 'English'}
                  </button>
                </div>

                <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
                  {menuItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-4 rounded-lg transition-all ${
                        activeTab === item.id 
                          ? `${themeNavActive}` 
                          : `${themeNavInactive}`
                      }`}
                    >
                      <span className="text-lg">{item.emoji}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </nav>

                <div className={`p-5 ${themeBgMutedDark}`}>
                  <div className="flex items-center gap-4 mb-4">
                    <img 
                      src={getImageUrl(user?.photoURL) || 'https://ui-avatars.com/api/?name=' + user?.displayName} 
                      alt="Profile" 
                      className={`w-12 h-12 rounded-full border-2 ${isLight ? 'border-black/10' : 'border-white/20'} shrink-0`}
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-black truncate leading-tight ${themeTextColor}`}>{user?.displayName}</p>
                      <p className={`text-xs truncate lowercase leading-tight mt-0.5 ${themeTextMuted}`}>{user?.email}</p>
                      <div className="mt-1.5">
                        <span className={`inline-flex items-center text-[8px] font-black px-2 py-0.5 rounded gap-1 shadow-sm uppercase tracking-wider ${
                          userRole === 'ADMIN' ? 'bg-amber-400 text-amber-950' :
                          userRole === 'MODERATOR' ? 'bg-sky-450 text-sky-950' :
                          'bg-slate-500 text-white'
                        }`}>
                          {userRole === 'ADMIN' ? '👑 Admin' :
                           userRole === 'MODERATOR' ? '🛡️ Moderator' : '👁️ Viewer'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={logout}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 ${themeBgMuted} ${themeHoverBg} rounded-xl transition-colors font-bold text-sm`}
                  >
                    <LogOut size={16} />
                    {t.logout}
                  </button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 min-w-0 pb-20 lg:pb-0">
          {/* Top Bar for Desktop */}
          <div className="hidden lg:flex items-center justify-end p-6 pb-2 max-w-7xl mx-auto gap-4">
             <button 
               onClick={() => setIsNotificationsOpen(true)}
               className="p-3 bg-white text-slate-400 hover:text-emerald-600 rounded-2xl border border-slate-100 shadow-sm transition-all relative"
             >
               <Bell size={20} />
               <div className="absolute top-3 right-3 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
             </button>
          </div>

          <div className="p-4 lg:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>

        {/* Mobile persistent bottom menu bar */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#020b06]/95 backdrop-blur-xl border-t border-emerald-900/40 z-40 pb-safe shadow-2xl px-2 py-2.5 flex justify-around items-center gap-1 overflow-x-auto no-scrollbar">
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all min-w-[44px] h-[44px] ${
                  isActive 
                    ? 'text-amber-400 bg-emerald-950/50 font-black border border-amber-500/20 shadow-sm' 
                    : 'text-slate-400 font-bold hover:text-slate-200'
                }`}
              >
                <span className={`text-xl transition-transform ${isActive ? 'scale-110' : ''}`}>{item.emoji}</span>
              </button>
            );
          })}
        </div>

        <Notifications 
          isOpen={isNotificationsOpen} 
          onClose={() => setIsNotificationsOpen(false)}
          onViewMember={(id) => {
            setActiveTab('members');
            // We could add state to pre-select this member if needed
          }}
        />
      </div>
    </div>
  );
}
