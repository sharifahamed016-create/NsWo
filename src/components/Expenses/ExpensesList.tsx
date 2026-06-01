/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, PieChart, Calendar, Tag, 
  User, Save, X, TrendingDown, TrendingUp, 
  Wallet, ArrowRight, Download, Filter, 
  CheckCircle2, AlertCircle, FileText, PlusCircle,
  Edit, Trash2
} from 'lucide-react';
import { 
  PieChart as RePieChart, Pie, Cell, 
  ResponsiveContainer, Tooltip as ReTooltip
} from 'recharts';
import { useExpenses } from '../../hooks/useExpenses';
import { usePayments } from '../../hooks/usePayments';
import { useEvents } from '../../hooks/useEvents';
import { useMembers } from '../../hooks/useMembers';
import { useAppContext } from '../../context/AppContext';
import { ExpenseCategory, PaymentType } from '../../types';

const COLORS = ['#10b981', '#f43f5e', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];

export default function ExpensesList() {
  const { t, language, isSuperAdmin, isModerator, isAdmin, settings } = useAppContext();

  // Helper to check if themeColor is light to prevent white text on white backgrounds
  const isThemeLight = (() => {
    const hex = settings.themeColor || '#059669';
    const c = hex.replace('#', '');
    if (c.length !== 6) return false;
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 170;
  })();

  const { expenses, addExpense, updateExpense, deleteExpense } = useExpenses();
  const { payments, addPayment, updatePayment, deletePayment } = usePayments();
  const { 
    donors, 
    expenses: eventExpenses,
    deleteEventDonor,
    updateEventDonor,
    deleteEventExpense,
    updateEventExpense
  } = useEvents();
  const { members } = useMembers();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [txToDelete, setTxToDelete] = useState<any | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);

  const handleCleanLedger = async () => {
    const confirmMsg = language === 'bn' 
      ? 'আপনি কি নিশ্চিত যে সদস্যদের চাঁদা ও ভর্তি ফি বাদে অন্য সকল আয়, ইভেন্ট অনুদান ও সমস্ত খরচ স্থায়ীভাবে ডিলিট করতে চান? এটি আর ফিরিয়ে আনা যাবে না!'
      : 'Are you sure you want to delete all expenses, event collections, and external payments? This action is completely irreversible!';
    
    if (!window.confirm(confirmMsg)) return;

    setIsCleaning(true);
    try {
      const { collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');
      const { db } = await import('../../lib/firebase');
      const { logActivity } = await import('../../lib/activity');

      // 1. Delete all from 'expenses'
      const expensesSnap = await getDocs(collection(db, 'expenses'));
      for (const d of expensesSnap.docs) {
        await deleteDoc(doc(db, 'expenses', d.id));
      }

      // 2. Delete all from 'event_expenses'
      const eventExpSnap = await getDocs(collection(db, 'event_expenses'));
      for (const d of eventExpSnap.docs) {
        await deleteDoc(doc(db, 'event_expenses', d.id));
      }

      // 3. Delete all from 'event_donors'
      const eventDonorsSnap = await getDocs(collection(db, 'event_donors'));
      for (const d of eventDonorsSnap.docs) {
        await deleteDoc(doc(db, 'event_donors', d.id));
      }

      // 4. Delete only external payments from 'payments' (memberId === 'external')
      const paymentsSnap = await getDocs(collection(db, 'payments'));
      let deletedExternalCount = 0;
      for (const d of paymentsSnap.docs) {
        if (d.data().memberId === 'external') {
          await deleteDoc(doc(db, 'payments', d.id));
          deletedExternalCount++;
        }
      }

      await logActivity(
        'database_reset',
        `Database cleanup performed: Deleted all general expenses, event logs, and ${deletedExternalCount} external payments.`,
        `ডাটাবেস ক্লিনআপ করা হয়েছে: সকল প্রকার সাধারণ খরচ, ইভেন্ট ভিত্তিক খরচ ও অনুদান এবং ${deletedExternalCount} টি বাহ্যিক আয় ডিলিট করা হয়েছে।`
      );

      alert(language === 'bn' ? 'সদস্যের টাকা বাদে বাকি সব লেনদেন সফলভাবে ডিলিট করা হয়েছে!' : 'Database cleanup completed successfully! Keeping only member subscription records.');
    } catch (error: any) {
      console.error('Database cleanup failed:', error);
      alert(language === 'bn' ? 'ডিলিট করতে ত্রুটি হয়েছে: ' + error.message : 'Database cleanup failed: ' + error.message);
    } finally {
      setIsCleaning(false);
    }
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense'>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // Compile all transactions dynamically
  const allTransactions = useMemo(() => {
    const list: Array<{
      id: string;
      type: 'income' | 'expense';
      amount: number;
      date: string;
      label: string;
      description: string;
      category: string;
      source: string;
      badgeColor: string;
      timestamp: number;
      entrySource: 'payment' | 'event_donor' | 'expense' | 'event_expense';
      originalObject: any;
    }> = [];

    // 1. General Member Payments (Income)
    payments.forEach(p => {
      const isBn = language === 'bn';
      const payerName = isBn ? (p.memberNameBn || p.memberName) : p.memberName;
      
      list.push({
        id: p.id,
        type: 'income',
        amount: p.amount,
        date: p.date,
        label: p.type === PaymentType.SUBSCRIPTION 
          ? (isBn ? 'সদস্য মাসিক চাঁদা' : 'Monthly subscription')
          : (p.type === PaymentType.DONATION 
            ? (isBn ? 'সংস্থার অনুদান' : 'Donation Payment') 
            : p.type === PaymentType.ADMISSION 
              ? (isBn ? 'ভর্তি ফি সংগ্রহ' : 'Admission Fee') 
              : (isBn ? 'অন্যান্য আয়' : 'Other Income')),
        description: p.remarks || (isBn 
          ? `আদায় রশিদ নং: #${p.receiptNo} (${payerName})` 
          : `Collection Receipt: #${p.receiptNo} (${payerName})`),
        category: p.type,
        source: payerName,
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        timestamp: p.createdAt || new Date(p.date).getTime(),
        entrySource: 'payment',
        originalObject: p
      });
    });

    // 2. Special Event Donations (Income)
    donors.forEach(d => {
      const isBn = language === 'bn';
      const donorName = isBn ? (d.nameBn || d.name) : d.name;
      list.push({
        id: d.id,
        type: 'income',
        amount: d.amount,
        date: d.date,
        label: isBn ? 'ইভেন্ট বিশেষ অনুদান' : 'Special Event Donation',
        description: d.remarks || (isBn ? `ইভেন্ট অনুদান দাতা: ${donorName}` : `Event Donor: ${donorName}`),
        category: 'event_donation',
        source: donorName,
        badgeColor: 'bg-teal-50 text-teal-700 border-teal-100',
        timestamp: d.createdAt || new Date(d.date).getTime(),
        entrySource: 'event_donor',
        originalObject: d
      });
    });

    // 3. General Organization Expenses (Expense)
    expenses.forEach(e => {
      const isBn = language === 'bn';
      list.push({
        id: e.id,
        type: 'expense',
        amount: e.amount,
        date: e.date,
        label: isBn ? 'সংস্থার সাধারণ ব্যয়' : 'General expenditure',
        description: e.description,
        category: e.category,
        source: e.requestedBy,
        badgeColor: 'bg-rose-50 text-rose-700 border-rose-100',
        timestamp: e.createdAt || new Date(e.date).getTime(),
        entrySource: 'expense',
        originalObject: e
      });
    });

    // 4. Special Event Expenses (Expense)
    eventExpenses.forEach(ee => {
      const isBn = language === 'bn';
      const title = isBn ? (ee.titleBn || ee.title) : ee.title;
      list.push({
        id: ee.id,
        type: 'expense',
        amount: ee.amount,
        date: ee.date,
        label: isBn ? 'বিশেষ ইভেন্ট ব্যয়' : 'Special Event Cost',
        description: ee.remarks || title,
        category: 'event_expense',
        source: title,
        badgeColor: 'bg-amber-50 text-amber-800 border-amber-100',
        timestamp: ee.createdAt || new Date(ee.date).getTime(),
        entrySource: 'event_expense',
        originalObject: ee
      });
    });

    // Sort chronologically (newest first)
    return list.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateB !== dateA) return dateB - dateA;
      return b.timestamp - a.timestamp;
    });
  }, [payments, donors, expenses, eventExpenses, language]);

  // Aggregate stats based on ALL ledger entries
  const totals = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    
    allTransactions.forEach(t => {
      if (t.type === 'income') {
        totalIncome += t.amount;
      } else {
        totalExpense += t.amount;
      }
    });

    return {
      income: totalIncome,
      expense: totalExpense,
      balance: totalIncome - totalExpense
    };
  }, [allTransactions]);

  // Compiled Category Breakdown for Expense distribution
  const categoryData = useMemo(() => {
    const data: Record<string, number> = {};
    allTransactions.forEach(t => {
      if (t.type === 'expense') {
        data[t.category] = (data[t.category] || 0) + t.amount;
      }
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [allTransactions]);

  // Filtered transactions for the ledger table
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter(t => {
      const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            t.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            t.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTab = activeTab === 'all' || t.type === activeTab;
      const matchesCategory = activeCategory === 'all' || t.category === activeCategory;
      return matchesSearch && matchesTab && matchesCategory;
    });
  }, [allTransactions, searchTerm, activeTab, activeCategory]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Banner */}
      <div 
        className={`p-6 md:p-8 rounded-3xl ${isThemeLight ? 'text-slate-950' : 'text-white'} shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden`}
        style={{ backgroundColor: settings.themeColor }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <FileText size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <div className={`inline-flex items-center gap-2 px-3 py-1 ${isThemeLight ? 'bg-black/10 text-slate-950 font-black' : 'bg-white/20 text-white'} rounded-full text-xs font-semibold uppercase tracking-wider`}>
            ⚖️ {language === 'bn' ? 'আয়-ব্যয় খতিয়ান' : 'Financial Ledger'}
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight font-sans">
            {language === 'bn' ? 'আয় ও ব্যয় খাতা খতিয়ান' : 'Income & Expenses Ledger'}
          </h2>
          <p className={`${isThemeLight ? 'text-slate-800' : 'text-white/85'} text-xs md:text-sm max-w-xl font-medium`}>
            {language === 'bn' 
              ? 'সংস্থার সকল প্রকার আয়ের রসিদ ও ব্যয়ের ভাউচার খতিয়ান সংরক্ষণ বই।' 
              : 'Complete organizational receipts registry and expenditures voucher book.'}
          </p>
        </div>
        {isAdmin && (
          <button 
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="z-10 flex items-center justify-center gap-2 px-5 py-3.5 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-[1.02] transform transition-all text-sm self-start md:self-center cursor-pointer"
          >
            <Plus size={18} />
            {language === 'bn' ? 'নতুন এন্ট্রি যোগ করুন' : 'Add Ledger Entry'}
          </button>
        )}
      </div>

      {/* Unified Financial Summary Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-6">
        <div className="bg-emerald-500 text-white p-2.5 xs:p-4 sm:p-6 md:p-8 rounded-[1.25rem] sm:rounded-[2.5rem] md:rounded-[3rem] shadow-xl shadow-emerald-100 relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500 hidden xs:block">
            <TrendingUp size={160} />
          </div>
          <p className="text-emerald-100 text-[8px] xs:text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-0.5 sm:mb-1 truncate opacity-95">
            {language === 'bn' ? 'মোট সংগৃহীত আয়' : 'Total Collected Income'}
          </p>
          <h3 className="text-xs xs:text-sm sm:text-lg md:text-2xl lg:text-3xl font-black tracking-tight truncate">৳ {totals.income.toLocaleString()}</h3>
          <p className="hidden md:block text-[8px] text-emerald-100/70 font-bold mt-2 uppercase tracking-wide">Includes subscriptions & event donations</p>
        </div>
        
        <div className="bg-rose-500 text-white p-2.5 xs:p-4 sm:p-6 md:p-8 rounded-[1.25rem] sm:rounded-[2.5rem] md:rounded-[3rem] shadow-xl shadow-rose-100 relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500 hidden xs:block">
            <TrendingDown size={160} />
          </div>
          <p className="text-rose-100 text-[8px] xs:text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-0.5 sm:mb-1 truncate opacity-95">
            {language === 'bn' ? 'মোট খরচ' : 'Total Expenses'}
          </p>
          <h3 className="text-xs xs:text-sm sm:text-lg md:text-2xl lg:text-3xl font-black tracking-tight truncate">৳ {totals.expense.toLocaleString()}</h3>
          <p className="hidden md:block text-[8px] text-rose-100/70 font-bold mt-2 uppercase tracking-wide">Includes rentals, events, utilities & charity</p>
        </div>

        <div className="bg-slate-900 text-white p-2.5 xs:p-4 sm:p-6 md:p-8 rounded-[1.25rem] sm:rounded-[2.5rem] md:rounded-[3rem] shadow-xl shadow-slate-200/50 relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500 hidden xs:block">
            <Wallet size={160} />
          </div>
          <p className="text-slate-400 text-[8px] xs:text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-0.5 sm:mb-1 truncate opacity-95">
            {language === 'bn' ? 'সংস্থার নেট ব্যালেন্স' : 'Current Net Balance'}
          </p>
          <h3 className="text-xs xs:text-sm sm:text-lg md:text-2xl lg:text-3xl font-black tracking-tight text-emerald-400 truncate">৳ {totals.balance.toLocaleString()}</h3>
          <p className="hidden md:block text-[8px] text-slate-400/80 font-bold mt-2 uppercase tracking-wide">Available reserves in secure cloud</p>
        </div>
      </div>

      {/* Admin Quick Cleanup Alert Box */}
      {isSuperAdmin && (
        <div className="bg-rose-50 border border-rose-100 rounded-[2rem] p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm shadow-rose-100/50">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
              <AlertCircle size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-xs font-black text-rose-950 uppercase tracking-widest">
                {language === 'bn' ? 'ডাটাবেস ক্লিনআপ টুল' : 'Database Cleanup Utilities'}
              </h4>
              <p className="text-rose-700/80 text-[11px] font-bold mt-1 leading-relaxed">
                {language === 'bn' 
                  ? 'সদস্যদের দেওয়া চাঁদা ছাড়া বাকি সব লেনদেন (সাধারণ খরচ, ইভেন্ট খরচ, ইভেন্ট অনুদান ও বাহ্যিক আয়) এক ক্লিকে ডিলিট করুন।' 
                  : 'Remove all general expenses, event logs, event donors, and external payments keeping only real member subscription records.'}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleCleanLedger}
            disabled={isCleaning}
            className="shrink-0 w-full md:w-auto flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-black py-4 px-6 rounded-2xl text-[10px] uppercase tracking-wider shadow-lg shadow-rose-200 transition-all select-none active:scale-95 disabled:opacity-50"
          >
            {isCleaning ? (
              <span className="animate-pulse">{language === 'bn' ? 'মুছে ফেলা হচ্ছে...' : 'Deleting...'}</span>
            ) : (
              <>
                <Trash2 size={13} strokeWidth={2.5} />
                {language === 'bn' ? 'সদস্যদের চাঁদা ছাড়া বাকি সব ডিলিট করুন' : 'Delete Non-Member Cash'}
              </>
            )}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Expenditure distribution Pie Chart */}
        <div className="lg:col-span-1 bg-white p-6 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col justify-between">
          <div>
            <h3 className="font-black text-slate-900 text-base uppercase tracking-tight mb-2">
              {language === 'bn' ? 'ব্যয় খাতের বিশ্লেষণ' : 'Expense Allocation'}
            </h3>
            <p className="text-xs text-slate-400 font-bold mb-6">
              {language === 'bn' ? 'বিভিন্ন খাতে ব্যয়ের বন্টন চিত্র' : 'Frictional cost analysis across sections'}
            </p>
            
            {categoryData.length > 0 ? (
              <>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <ReTooltip 
                        formatter={(val) => `৳${val.toLocaleString()}`}
                        contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                      />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
                   {categoryData.map((item, idx) => (
                     <div key={idx} className="flex items-center justify-between">
                       <div className="flex items-center gap-2 min-w-0">
                         <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                         <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight truncate">{item.name}</span>
                       </div>
                       <span className="text-xs font-black text-slate-900 font-mono">৳ {item.value.toLocaleString()}</span>
                     </div>
                   ))}
                </div>
              </>
            ) : (
              <div className="py-20 text-center text-slate-400 italic text-xs font-bold">
                {language === 'bn' ? 'বিশ্লেষণের জন্য কোনো ব্যয় রেকর্ড নেই' : 'No expenses recorded yet to show breakdown'}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 bg-slate-50/50 -mx-6 -mb-6 p-6 rounded-b-[3rem] text-center">
            <span className="text-[10px] text-slate-500 font-bold">
              {language === 'bn' ? 'সংস্থার মোট লেনদেন ভলিউম:' : 'Total Transaction Volume:'}
            </span>
            <p className="text-base font-black text-slate-800 tracking-tight mt-0.5">
              ৳ {(totals.income + totals.expense).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Dynamic Receipts & Expenditures ledger table */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-[2.2rem] border border-slate-100 shadow-sm flex flex-col gap-4">
            
            {/* Search inputs */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder={language === 'bn' ? 'বিবরণ, খাত বা অনুরোধকারী খুঁজুন...' : 'Search description, context, recipient...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-4 py-3.5 text-xs focus:ring-4 focus:ring-emerald-50 mt-0.5 outline-none text-slate-700 font-bold"
                />
              </div>
              
              <select 
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
                className="bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-[10px] font-black uppercase tracking-widest outline-none focus:ring-4 focus:ring-slate-100"
              >
                <option value="all">{language === 'bn' ? 'সকল খাত (All Categories)' : 'All Categories'}</option>
                <option value="subscription">{language === 'bn' ? 'সদস্য চাঁদা' : 'Subscription'}</option>
                <option value="donation">{language === 'bn' ? 'সংস্থার অনুদান' : 'Org Donation'}</option>
                <option value="admission">{language === 'bn' ? 'ভর্তি ফি' : 'Admission Fee'}</option>
                <option value="event_donation">{language === 'bn' ? 'ইভেন্ট অনুদান' : 'Event Donation'}</option>
                <option value="event_expense">{language === 'bn' ? 'ইভেন্ট ব্যয়' : 'Event Cost'}</option>
                {[...Object.values(ExpenseCategory), ...(settings?.customExpenseCategories || [])].map(c => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>
            </div>

            {/* Filter segments tab (Facebook / Modern style) */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-105 rounded-xl border border-slate-100 border-dashed">
              <button
                onClick={() => setActiveTab('all')}
                className={`flex-1 text-center py-2.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                  activeTab === 'all' 
                    ? 'bg-[#01582e] text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {language === 'bn' ? '📖 সকল লেনদেন খাতা' : '📖 All Ledger'}
              </button>
              <button
                onClick={() => setActiveTab('income')}
                className={`flex-1 text-center py-2.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                  activeTab === 'income' 
                    ? 'bg-[#01582e] text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {language === 'bn' ? '🟢 শুধুমাত্র আয় সমূহ' : '🟢 Incomes Only'}
              </button>
              <button
                onClick={() => setActiveTab('expense')}
                className={`flex-1 text-center py-2.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                  activeTab === 'expense' 
                    ? 'bg-[#01582e] text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {language === 'bn' ? '🔴 শুধুমাত্র ব্যয় সমূহ' : '🔴 Expenditures'}
              </button>
            </div>
          </div>

          {/* Ledger Statement Accounts Grid Box */}
          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#01582e]/5 border-b border-[#01582e]/10">
                  <tr>
                    <th className="px-6 py-5 text-[10px] font-black text-emerald-950 uppercase tracking-[0.15em]">{language === 'bn' ? 'বিবরণ ও বিবরণ তারিখ' : 'Description & Ledger Date'}</th>
                    <th className="px-4 py-5 text-[10px] font-black text-emerald-950 uppercase tracking-[0.15em]">{language === 'bn' ? 'লেনদেন ক্যাটাগরি' : 'Trans Category'}</th>
                    <th className="px-4 py-5 text-[10px] font-black text-emerald-950 uppercase tracking-[0.15em]">{language === 'bn' ? 'উৎস / প্রাপক' : 'Requested / Recipient'}</th>
                    <th className="px-6 py-5 text-[10px] font-black text-emerald-950 uppercase tracking-[0.15em] text-right">{language === 'bn' ? 'পরিমাণ (৳)' : 'Amount'}</th>
                    {isAdmin && (
                      <th className="px-6 py-5 text-[10px] font-black text-emerald-950 uppercase tracking-[0.15em] text-center">{language === 'bn' ? 'অ্যাকশন' : 'Action'}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((tx) => (
                    <tr key={`${tx.entrySource}-${tx.id}`} className="group hover:bg-slate-50/70 transition-all cursor-default relative">
                      {/* Left visual bar marking income/expense */}
                      <td className="absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-1.5"
                          style={{ backgroundColor: tx.type === 'income' ? '#10b981' : '#f43f5e' }}
                      />
                      
                      {/* Description column with title & formatted subtitle */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black transition-transform group-hover:scale-105 shrink-0 ${
                            tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                          }`}>
                            {tx.type === 'income' ? <ArrowRight size={18} /> : <TrendingDown size={18} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-900 leading-tight">
                              {tx.description}
                            </p>
                            <span className="inline-flex items-center gap-1.5 text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">
                              <Calendar size={10} className="text-slate-300" />
                              {tx.date}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Category field with styled badges */}
                      <td className="px-4 py-5 whitespace-nowrap">
                        <span className={`px-2.5 py-1 border rounded-lg text-[9px] font-extrabold uppercase tracking-wider ${tx.badgeColor}`}>
                          {tx.category}
                        </span>
                      </td>

                      {/* Source/Requested column */}
                      <td className="px-4 py-5">
                        <p className="text-[10.5px] font-bold text-slate-700 truncate max-w-[120px]">
                          {tx.source}
                        </p>
                      </td>

                      {/* Dynamic amount formatted with ৳ */}
                      <td className="px-6 py-5 text-right whitespace-nowrap">
                        <p className={`text-xs md:text-sm font-black tracking-tight ${
                          tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {tx.type === 'income' ? '+' : '-'} ৳ {tx.amount.toLocaleString()}
                        </p>
                        <span className="text-[8px] text-slate-400 uppercase font-black leading-none">
                          {tx.type === 'income' ? (language === 'bn' ? 'রসিদ আয়' : 'receipt') : (language === 'bn' ? 'ভাউচার ব্যয়' : 'expense')}
                        </span>
                      </td>

                      {/* Edit or Delete Action Controls for Moderators */}
                      {isAdmin && (
                        <td className="px-6 py-5 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTx(tx);
                              }}
                              className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-all cursor-pointer active:scale-90"
                              title={language === 'bn' ? 'সম্পাদনা করুন' : 'Edit Transaction'}
                            >
                              <Edit size={14} strokeWidth={2.5} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTxToDelete(tx);
                              }}
                              className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all cursor-pointer active:scale-90"
                              title={language === 'bn' ? 'ডিলিট করুন' : 'Delete Transaction'}
                            >
                              <Trash2 size={14} strokeWidth={2.5} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 5 : 4} className="px-6 py-20 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 grayscale opacity-40">
                          <Download size={32} />
                        </div>
                        <p className="text-xs font-bold text-slate-400 italic">No ledger statement accounts found matching criteria</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isFormOpen && (
          <UnifiedLedgerForm 
            onClose={() => setIsFormOpen(false)} 
            onSaveIncome={async (incomeData) => {
              // Standard External collections saved to Payments database using "external" marker ID
              await addPayment({
                memberId: 'external',
                memberName: incomeData.source || 'অন্যান্য আয়োজন/উৎস',
                memberNameBn: incomeData.source || 'অন্যান্য আয়খাত',
                amount: incomeData.amount,
                date: incomeData.date,
                month: incomeData.date.slice(0, 7),
                year: parseInt(incomeData.date.slice(0, 4)) || new Date().getFullYear(),
                type: PaymentType.OTHER,
                method: incomeData.method || 'Cash',
                remarks: incomeData.description
              });
              setIsFormOpen(false);
            }}
            onSaveExpense={async (expenseData) => {
              // Direct Organization costs
              await addExpense({
                amount: expenseData.amount,
                date: expenseData.date,
                category: expenseData.category,
                description: expenseData.description,
                requestedBy: expenseData.requestedBy || 'সংস্থার প্রতিনিধি'
              });
              setIsFormOpen(false);
            }}
          />
        )}

        {editingTx && (
          <UnifiedLedgerForm 
            onClose={() => setEditingTx(null)} 
            initialData={editingTx}
            onSaveIncome={async (incomeData) => {
              if (editingTx.entrySource === 'payment') {
                await updatePayment(editingTx.id, editingTx.amount, {
                  memberId: editingTx.originalObject?.memberId || 'external',
                  memberName: incomeData.source || 'অন্যান্য আয়োজন/উৎস',
                  memberNameBn: incomeData.source || 'অন্যান্য আয়খাত',
                  amount: incomeData.amount,
                  date: incomeData.date,
                  month: incomeData.date.slice(0, 7),
                  year: parseInt(incomeData.date.slice(0, 4)) || new Date().getFullYear(),
                  type: editingTx.originalObject?.type || PaymentType.OTHER,
                  method: incomeData.method || 'Cash',
                  remarks: incomeData.description
                });
              } else if (editingTx.entrySource === 'event_donor') {
                await updateEventDonor(editingTx.id, {
                  name: incomeData.source,
                  amount: incomeData.amount,
                  date: incomeData.date,
                  remarks: incomeData.description
                });
              }
              setEditingTx(null);
            }}
            onSaveExpense={async (expenseData) => {
              if (editingTx.entrySource === 'expense') {
                await updateExpense(editingTx.id, {
                  amount: expenseData.amount,
                  date: expenseData.date,
                  category: expenseData.category,
                  description: expenseData.description,
                  requestedBy: expenseData.requestedBy || 'সংস্থার প্রতিনিধি'
                });
              } else if (editingTx.entrySource === 'event_expense') {
                await updateEventExpense(editingTx.id, {
                  amount: expenseData.amount,
                  date: expenseData.date,
                  remarks: expenseData.description,
                  title: expenseData.requestedBy || 'ইভেন্ট ব্যয়'
                });
              }
              setEditingTx(null);
            }}
          />
        )}

        {txToDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setTxToDelete(null)}
              className="absolute inset-0 bg-slate-900/55 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.9, y: 100, opacity: 0 }} 
              animate={{ scale: 1, y: 0, opacity: 1 }} 
              exit={{ scale: 0.9, y: 100, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={28} />
              </div>
              
              <h3 className="text-xl font-black text-slate-900 mb-2">
                {language === 'bn' ? 'লেনদেনটি মুছে ফেলতে চান?' : 'Are you sure you want to delete?'}
              </h3>
              
              <p className="text-slate-500 text-xs font-bold mb-6">
                {language === 'bn' 
                  ? `আপনি কি নিশ্চিত যে "${txToDelete.description}" (৳ ${txToDelete.amount.toLocaleString()}) এই আয়ের/ব্যয়ের হিসাব ভাউচারটি ডিলিট করতে চান?`
                  : `Are you sure you want to delete "${txToDelete.description}" of amount ৳ ${txToDelete.amount.toLocaleString()}?`
                }
              </p>
              
              <div className="flex gap-4">
                <button
                  onClick={() => setTxToDelete(null)}
                  className="flex-1 px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  onClick={async () => {
                    if (txToDelete.entrySource === 'payment') {
                      await deletePayment(
                        txToDelete.id,
                        txToDelete.amount,
                        txToDelete.originalObject?.memberId || 'external',
                        txToDelete.source
                      );
                    } else if (txToDelete.entrySource === 'event_donor') {
                      await deleteEventDonor(txToDelete.id);
                    } else if (txToDelete.entrySource === 'expense') {
                      await deleteExpense(txToDelete.id, txToDelete.amount, txToDelete.category);
                    } else if (txToDelete.entrySource === 'event_expense') {
                      await deleteEventExpense(txToDelete.id);
                    }
                    setTxToDelete(null);
                  }}
                  className="flex-1 px-6 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-red-100"
                >
                  {language === 'bn' ? 'নিশ্চিত ডিলিট' : 'Confirm Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface UnifiedLedgerFormProps {
  onClose: () => void;
  onSaveIncome: (data: any) => Promise<void>;
  onSaveExpense: (data: any) => Promise<void>;
  initialData?: any;
}

function UnifiedLedgerForm({ onClose, onSaveIncome, onSaveExpense, initialData }: UnifiedLedgerFormProps) {
  const { language, settings } = useAppContext();
  const [formType, setFormType] = useState<'income' | 'expense'>(
    initialData ? initialData.type : 'expense'
  );
  const [amount, setAmount] = useState<number>(initialData ? initialData.amount : 0);
  const [date, setDate] = useState<string>(
    initialData ? initialData.date : new Date().toISOString().split('T')[0]
  );
  const [description, setDescription] = useState<string>(
    initialData 
      ? (initialData.entrySource === 'payment' && initialData.originalObject 
          ? initialData.originalObject.remarks || initialData.description 
          : initialData.description)
      : ''
  );
  
  // Income specific fields
  const [sourceName, setSourceName] = useState<string>(
    initialData && initialData.type === 'income' ? initialData.source : ''
  );
  const [method, setMethod] = useState<string>(
    initialData && initialData.entrySource === 'payment' && initialData.originalObject
      ? (initialData.originalObject.method || 'Cash')
      : 'Cash'
  );

  // Expense specific fields
  const [category, setCategory] = useState<string>(
    initialData && initialData.type === 'expense' && initialData.entrySource === 'expense'
      ? (initialData.category as string)
      : ExpenseCategory.OFFICE
  );
  const [requestedBy, setRequestedBy] = useState<string>(
    initialData && initialData.type === 'expense' ? initialData.source : ''
  );

  const handleConfirm = async () => {
    if (amount <= 0 || !description.trim()) {
      alert(language === 'bn' ? 'দয়া করে বৈধ পরিমাণ ও বিবরণ প্রদান করুন!' : 'Please enter a valid amount and transaction description!');
      return;
    }

    if (formType === 'income') {
      await onSaveIncome({
        amount,
        date,
        description,
        source: sourceName || (language === 'bn' ? 'অন্যান্য প্রকাশ্য উৎস' : 'External General Source'),
        method
      });
    } else {
      await onSaveExpense({
        amount,
        date,
        category,
        description,
        requestedBy: requestedBy || (language === 'bn' ? 'নাছিরেরটেক সমাজ কল্যাণ সংস্থা' : 'Nashirertek Social Welfare Association')
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose} 
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-md" 
      />
      <motion.div 
        initial={{ scale: 0.9, y: 100, opacity: 0 }} 
        animate={{ scale: 1, y: 0, opacity: 1 }} 
        exit={{ scale: 0.9, y: 100, opacity: 0 }}
        className="relative w-full max-w-xl bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100 text-slate-900"
      >
        {/* Toggle Headbar form type (Green background for Income, Red/Rose for Expense) */}
        <div className={`p-8 text-white relative transition-colors duration-500 ${
          formType === 'income' ? 'bg-[#01582e]' : 'bg-rose-600'
        }`}>
          <div className="absolute top-8 right-8 cursor-pointer hover:bg-white/10 p-2 rounded-full transition-colors" onClick={onClose}>
            <X size={22} className="text-white" />
          </div>
          
          <h2 className="text-2xl font-black tracking-tight mb-2">
            {initialData 
              ? (language === 'bn' ? 'লেনদেন হিসাব পরিবর্তন' : 'Edit Financial Ledger Entry')
              : (language === 'bn' ? 'সংস্থার নতুন হিসাব এন্ট্রি' : 'New Financial Ledger Entry')
            }
          </h2>
          <p className="text-slate-100/70 text-[9px] font-extrabold uppercase tracking-widest leading-none">
            Google cloud-backed double entry registry
          </p>

          {!initialData && (
            <div className="flex bg-white/10 p-1 rounded-2xl border border-white/10 mt-6 max-w-xs justify-between">
              <button
                onClick={() => { setFormType('income'); if(amount===0) setAmount(500); }}
                className={`flex-1 text-center py-2.5 rounded-xl text-xs font-extrabold uppercase transition-all ${
                  formType === 'income' ? 'bg-white text-[#01582e] font-black' : 'text-white'
                }`}
              >
                {language === 'bn' ? '🟢 আয় যোগ' : '🟢 Income'}
              </button>
              <button
                onClick={() => { setFormType('expense'); if(amount===500||amount===0) setAmount(100); }}
                className={`flex-1 text-center py-2.5 rounded-xl text-xs font-extrabold uppercase transition-all ${
                  formType === 'expense' ? 'bg-white text-rose-600 font-black' : 'text-white'
                }`}
              >
                {language === 'bn' ? '🔴 ব্যয় যোগ' : '🔴 Expense'}
              </button>
            </div>
          )}
        </div>

        <div className="p-8 space-y-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Amount input */}
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                {language === 'bn' ? 'অর্থের পরিমাণ (৳)' : 'Financial Amount (৳)'}
              </label>
              <div className="relative">
                <span className={`absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black ${
                  formType === 'income' ? 'text-emerald-500' : 'text-rose-500'
                }`}>৳</span>
                <input 
                  type="number" 
                  value={amount || ''} 
                  onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className={`w-full pl-12 pr-6 py-4 border-none rounded-[1.5rem] text-2xl font-black outline-none ${
                    formType === 'income' ? 'bg-emerald-50 text-[#014120] focus:ring-4 focus:ring-emerald-100' : 'bg-rose-50/70 text-rose-700 focus:ring-4 focus:ring-rose-100'
                  }`}
                />
              </div>
            </div>

            {/* Date Picker */}
            <div className="space-y-2">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{language === 'bn' ? 'দাখিলা তারিখ' : 'Registry Date'}</label>
               <input 
                 type="date" 
                 value={date} 
                 onChange={e => setDate(e.target.value)}
                 className="w-full px-5 py-4 bg-slate-50 border-none rounded-[1.5rem] text-xs font-black focus:ring-4 focus:ring-slate-100 outline-none"
               />
            </div>
          </div>

          {/* Description input (Core requirement: বিবরণ) */}
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
              {language === 'bn' ? 'লেনদেনের বিবরণ (অবশ্যই প্রদান করুন)' : 'Trans Description (Voucher Context)'}
            </label>
            <textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)}
              placeholder={language === 'bn' ? 'লেনদেনটির সংক্ষিপ্ত বা বিস্তারিত বিবরণ...' : 'E.g., Office general rent payment, stationary costs, etc.'}
              className="w-full px-5 py-4 bg-slate-50 border-none rounded-[1.5rem] text-xs font-bold focus:ring-4 focus:ring-slate-100 outline-none resize-none min-h-[90px]"
            />
          </div>

          {/* Dynamic properties based on selected Form type */}
          {formType === 'income' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
               {/* Income Source Name */}
               <div className="space-y-2">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{language === 'bn' ? 'আয়ের উৎস / সদস্য নাম' : 'Income Source / Name'}</label>
                 <input 
                   type="text" 
                   placeholder={language === 'bn' ? 'যেমন: বিশিষ্ট সমাজসেবক অনুদান' : 'E.g., External Sponsor'}
                   value={sourceName} 
                   onChange={e => setSourceName(e.target.value)}
                   className="w-full px-5 py-4 bg-slate-50 border-none rounded-[1.5rem] text-xs font-bold focus:ring-4 focus:ring-emerald-50 outline-none"
                 />
               </div>
               {/* Collection Mode */}
               <div className="space-y-2">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{language === 'bn' ? 'আদায়ের মাধ্যম' : 'Payment Method'}</label>
                 <select 
                   value={method} 
                   onChange={e => setMethod(e.target.value)}
                   className="w-full px-5 py-4 bg-slate-50 border-none rounded-[1.5rem] text-xs font-black outline-none uppercase tracking-widest"
                 >
                   <option value="Cash">Cash / নগদ</option>
                   <option value="Bkash">Bkash / বিকাশ</option>
                   <option value="Nagad">Nagad / নগদ (বিকাশ মত)</option>
                   <option value="Bank">Bank / ব্যাংক</option>
                 </select>
               </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
               {/* Expense Categories */}
               <div className="space-y-2">
                 <label className="text-[9px] font-black text-[#854d0e] uppercase tracking-widest ml-1">{language === 'bn' ? 'ব্যয়ের খাত ক্যাটাগরি' : 'Expense Category'}</label>
                 <select 
                   value={category} 
                   onChange={e => setCategory(e.target.value as any)}
                   className="w-full px-5 py-4 bg-slate-50 border-none rounded-[1.5rem] text-xs font-black focus:ring-4 focus:ring-slate-100 outline-none uppercase tracking-widest opacity-90 disabled:opacity-50"
                   disabled={initialData && initialData.entrySource === 'event_expense'}
                 >
                   {initialData && initialData.entrySource === 'event_expense' ? (
                     <option value="event_expense">EVENT_EXPENSE</option>
                   ) : (
                     [...Object.values(ExpenseCategory), ...(settings?.customExpenseCategories || [])].map(c => (
                       <option key={c} value={c}>{c.toUpperCase()}</option>
                     ))
                   )}
                 </select>
               </div>
               {/* Requested Person */}
               <div className="space-y-2">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{language === 'bn' ? 'অনুরোধকারী / প্রাপক' : 'Requested / Recipient'}</label>
                 <input 
                   type="text" 
                   placeholder={language === 'bn' ? 'নাম বা পদবি' : 'E.g. Secretary office'}
                   value={requestedBy} 
                   onChange={e => setRequestedBy(e.target.value)}
                   className="w-full px-5 py-4 bg-slate-50 border-none rounded-[1.5rem] text-xs font-bold focus:ring-4 focus:ring-slate-100 outline-none"
                 />
               </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t border-slate-55 flex-wrap md:flex-nowrap">
            <button 
              onClick={onClose}
              className="flex-1 px-6 py-4.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-[1.5rem] text-[9px] font-black uppercase tracking-wider transition-all"
            >
              {language === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>
            <button 
              onClick={handleConfirm}
              className={`flex-[2] py-4.5 text-white rounded-[1.5rem] text-[9.5px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2.5 ${
                formType === 'income' 
                  ? 'bg-[#01582e] hover:bg-emerald-800 shadow-emerald-100' 
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
              }`}
            >
              <Save size={18} />
              {language === 'bn' ? 'নিশ্চিত ও সংরক্ষণ করুন' : 'Confirm & Save Document'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
