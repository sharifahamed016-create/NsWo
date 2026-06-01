/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Plus, DollarSign, Calendar, Heart, Trash2, 
  TrendingUp, UserPlus, Search, AlertCircle, MapPin, CreditCard, Tag,
  Eye, Upload, Loader2, Image, FileText, BarChart2, PieChart, Activity, TrendingDown
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, Legend, PieChart as ReChartsPieChart, Pie, Cell
} from 'recharts';
import { useAppContext } from '../../context/AppContext';
import { useEvents } from '../../hooks/useEvents';
import { AppEvent, EventDonor, EventExpense } from '../../types';
import { getImageUrl } from '../../lib/utils';
import { uploadFile } from '../../lib/storage';

interface EventDetailsProps {
  event: AppEvent;
  onBack: () => void;
}

export default function EventDetails({ event, onBack }: EventDetailsProps) {
  const { language, t } = useAppContext();
  const { 
    donors, expenses, addEventDonor, deleteEventDonor, 
    addEventExpense, deleteEventExpense 
  } = useEvents();

  // Tab state
  const [activeTab, setActiveTab] = useState<'ledger' | 'dashboard'>('ledger');

  // Lightbox for receipts
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const [donorSearch, setDonorSearch] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');

  // Form states
  const [showAddDonor, setShowAddDonor] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);

  // New Donor fields
  const [donorName, setDonorName] = useState('');
  const [donorNameBn, setDonorNameBn] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [donorAddress, setDonorAddress] = useState('');
  const [donorAmount, setDonorAmount] = useState('');
  const [donorPaymentMethod, setDonorPaymentMethod] = useState('Cash');
  const [donorDate, setDonorDate] = useState(new Date().toISOString().split('T')[0]);
  const [donorRemarks, setDonorRemarks] = useState('');

  // New Expense fields
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseTitleBn, setExpenseTitleBn] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('humanitarian_assistance');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseRemarks, setExpenseRemarks] = useState('');
  const [expenseReceiptURL, setExpenseReceiptURL] = useState('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);

  // Category Translations
  const categoryTranslations = useMemo<Record<string, {en: string; bn: string}>>(() => ({
    humanitarian_assistance: { en: 'Humanitarian Assistance', bn: 'মানবিক সহযোগিতা' },
    iftar_mahfil: { en: 'Iftar Mahfil', bn: 'ইফতার মাফিল' },
    iftar_distribution: { en: 'Iftar Items Distribution', bn: 'ইফতার সামগ্রী বিতরন' },
    eid_distribution: { en: 'Eid Items Distribution', bn: 'ঈদ সামগ্রী বিতরণ' },
    help_distribution: { en: 'Help Distribution', bn: 'সাহায্য বিতরণ' },
    mosque_expense: { en: 'Mosque Expense', bn: 'মসজিদ খরচ' },
    other: { en: 'Other Expense', bn: 'অন্যান্য' }
  }), []);

  const getExpenseCategoryLabel = (cat: string) => {
    if (categoryTranslations[cat]) {
      return language === 'bn' ? categoryTranslations[cat].bn : categoryTranslations[cat].en;
    }
    // Fallbacks for older data compatibilities
    const fallbacks: Record<string, {en: string; bn: string}> = {
      Catering: { en: 'Catering', bn: 'খাবার (Catering)' },
      Logistics: { en: 'Logistics', bn: 'লজিস্টিকস (Logistics)' },
      Volunteers: { en: 'Volunteers', bn: 'স্বেচ্ছাসেবী খরচ (Volunteers)' },
      Venue: { en: 'Venue', bn: 'ভেন্যু/ভাড়া (Venue)' },
      Branding: { en: 'Branding', bn: 'ব্যানার ও সাইনেজ (Branding)' },
      Promotion: { en: 'Promotion', bn: 'প্রচারণা (Promotion)' },
    };
    if (fallbacks[cat]) {
      return language === 'bn' ? fallbacks[cat].bn : fallbacks[cat].en;
    }
    return cat;
  };

  // Filter lists for current event
  const currentDonors = useMemo(() => {
    return donors.filter(d => d.eventId === event.id && (
      d.name.toLowerCase().includes(donorSearch.toLowerCase()) ||
      d.nameBn.includes(donorSearch) ||
      d.phone.includes(donorSearch) ||
      (d.address && d.address.toLowerCase().includes(donorSearch.toLowerCase()))
    ));
  }, [donors, event.id, donorSearch]);

  const currentExpenses = useMemo(() => {
    return expenses.filter(e => e.eventId === event.id && (
      e.title.toLowerCase().includes(expenseSearch.toLowerCase()) ||
      e.titleBn.includes(expenseSearch)
    ));
  }, [expenses, event.id, expenseSearch]);

  // Aggregate stats
  const totalCollected = useMemo(() => {
    return donors.filter(d => d.eventId === event.id).reduce((sum, d) => sum + d.amount, 0);
  }, [donors, event.id]);

  const totalSpent = useMemo(() => {
    return expenses.filter(e => e.eventId === event.id).reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, event.id]);

  const netFundBalance = totalCollected - totalSpent;

  // Percentage budget spent
  const percentSpent = useMemo(() => {
    if (event.budget <= 0) return 0;
    return Math.min(Math.round((totalSpent / event.budget) * 100), 100);
  }, [totalSpent, event.budget]);

  // Donation progress over time grouped by date
  const donationTimelineData = useMemo(() => {
    const groups: Record<string, number> = {};
    currentDonors.forEach(d => {
      groups[d.date] = (groups[d.date] || 0) + d.amount;
    });
    return Object.keys(groups)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .map(date => ({
        date,
        amount: groups[date],
      }));
  }, [currentDonors]);

  // Expense distribution grouped by translated category
  const expenseCategoryData = useMemo(() => {
    const groups: Record<string, number> = {};
    currentExpenses.forEach(e => {
      const label = getExpenseCategoryLabel(e.category);
      groups[label] = (groups[label] || 0) + e.amount;
    });
    return Object.keys(groups).map(category => ({
      category,
      amount: groups[category],
    }));
  }, [currentExpenses, language]);

  // Cumulative timeline showing run rate of donations vs expenses
  const balanceTimelineData = useMemo(() => {
    const items: { date: string; type: 'donation' | 'expense'; amount: number }[] = [];
    currentDonors.forEach(d => {
      items.push({ date: d.date, type: 'donation', amount: d.amount });
    });
    currentExpenses.forEach(e => {
      items.push({ date: e.date, type: 'expense', amount: e.amount });
    });

    items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let accumDonations = 0;
    let accumExpenses = 0;
    const history: { date: string; donations: number; expenses: number; balance: number }[] = [];

    // Keep unique dates with accumulated stats
    const dateMap: Record<string, { donations: number; expenses: number; balance: number }> = {};

    items.forEach(item => {
      if (item.type === 'donation') {
        accumDonations += item.amount;
      } else {
        accumExpenses += item.amount;
      }
      dateMap[item.date] = {
        donations: accumDonations,
        expenses: accumExpenses,
        balance: accumDonations - accumExpenses
      };
    });

    return Object.keys(dateMap)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .map(date => ({
        date,
        ...dateMap[date]
      }));
  }, [currentDonors, currentExpenses]);

  const handleAddDonorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donorName || !donorAmount) return;

    const receiptNo = `REC-${Date.now().toString().slice(-6)}`;
    try {
      await addEventDonor({
        eventId: event.id,
        name: donorName,
        nameBn: donorNameBn || donorName,
        phone: donorPhone,
        address: donorAddress,
        amount: parseFloat(donorAmount),
        paymentMethod: donorPaymentMethod,
        date: donorDate,
        receiptNo,
        remarks: donorRemarks
      });
      // reset
      setDonorName('');
      setDonorNameBn('');
      setDonorPhone('');
      setDonorAddress('');
      setDonorAmount('');
      setDonorPaymentMethod('Cash');
      setDonorRemarks('');
      setShowAddDonor(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingReceipt(true);
    try {
      const path = `event_receipts/${Date.now()}_${file.name}`;
      const url = await uploadFile(file, path);
      setExpenseReceiptURL(url);
    } catch (error: any) {
      console.error("Receipt upload failed:", error);
      alert(language === 'bn' ? "রসিদ আপলোড ব্যর্থ হয়েছে!" : "Receipt upload failed!");
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseTitle || !expenseAmount) return;

    try {
      await addEventExpense({
        eventId: event.id,
        title: expenseTitle,
        titleBn: expenseTitleBn || expenseTitle,
        amount: parseFloat(expenseAmount),
        category: expenseCategory,
        date: expenseDate,
        remarks: expenseRemarks,
        receiptURL: expenseReceiptURL
      });
      // reset
      setExpenseTitle('');
      setExpenseTitleBn('');
      setExpenseAmount('');
      setExpenseRemarks('');
      setExpenseReceiptURL('');
      setShowAddExpense(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDonorDelete = async (id: string) => {
    if (window.confirm(language === 'bn' ? 'ডোনেশন এন্ট্রি মুছে ফেলতে চান?' : 'Are you sure you want to delete this donation?')) {
      await deleteEventDonor(id);
    }
  };

  const handleExpenseDelete = async (id: string) => {
    if (window.confirm(language === 'bn' ? 'ব্যয় এন্ট্রি মুছে ফেলতে চান?' : 'Are you sure you want to delete this expense?')) {
      await deleteEventExpense(id);
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      bKash: language === 'bn' ? 'বিকাশ (bKash)' : 'bKash',
      Nagad: language === 'bn' ? 'নগদ (Nagad)' : 'Nagad',
      Rocket: language === 'bn' ? 'রকেট (Rocket)' : 'Rocket',
      Cash: language === 'bn' ? 'ক্যাশ (Cash)' : 'Cash',
      Bank: language === 'bn' ? 'ব্যাংক ট্রান্সফার (Bank)' : 'Bank',
      Other: language === 'bn' ? 'অন্যান্য (Other)' : 'Other',
    };
    return labels[method] || method;
  };

  const getPaymentMethodStyle = (method: string) => {
    switch (method) {
      case 'bKash': return 'bg-pink-50 text-pink-600 border-pink-100';
      case 'Nagad': return 'bg-orange-50 text-orange-600 border-orange-100';
      case 'Rocket': return 'bg-purple-50 text-purple-600 border-purple-100';
      case 'Cash': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'Bank': return 'bg-blue-50 text-blue-600 border-blue-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button or Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-3 bg-white text-slate-500 hover:text-slate-900 border border-slate-100 rounded-2xl shadow-sm transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            {language === 'bn' ? (event.titleBn || event.title) : event.title}
          </h1>
          <p className="text-xs text-slate-500 font-bold">
            {language === 'bn' ? 'ইভেন্ট বিস্তারিত এবং হিসাব খাতা' : 'Event Information & Ledger Details'}
          </p>
        </div>
      </div>

      {/* Main event hero illustration info card */}
      <div className="relative bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden shadow-sm">
        {event.imageURL ? (
          <div className="relative h-[220px] lg:h-[280px]">
            <img 
              src={getImageUrl(event.imageURL)} 
              alt="Bannner" 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 text-white space-y-1.5">
              <span className="inline-block bg-emerald-500 text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full">
                {language === 'bn' ? 'সরাসরি প্রজেক্ট ব্যানার' : 'Campaign Banner'}
              </span>
              <h2 className="text-xl lg:text-3xl font-black tracking-tight leading-tight">
                {language === 'bn' ? (event.titleBn || event.title) : event.title}
              </h2>
              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-200 pt-1">
                <span className="flex items-center gap-1">
                  <Calendar size={13} className="text-emerald-400" />
                  {language === 'bn' ? `তারিখ: ${event.date}` : `Date: ${event.date}`}
                </span>
                {(event.location || event.locationBn) && (
                  <span className="flex items-center gap-1">
                    <MapPin size={13} className="text-rose-400" />
                    {language === 'bn' ? (event.locationBn || event.location) : event.location}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 lg:p-8 bg-gradient-to-br from-emerald-600 to-teal-800 text-white rounded-[2.5rem]">
            <div className="max-w-3xl space-y-3">
              <span className="inline-block bg-white/20 text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full">
                {language === 'bn' ? 'ইভেন্ট বিবরণী' : 'Campaign Profile'}
              </span>
              <h2 className="text-2xl lg:text-3xl font-black tracking-tight">
                {language === 'bn' ? (event.titleBn || event.title) : event.title}
              </h2>
              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-emerald-100 pt-1">
                <span className="flex items-center gap-1">
                  <Calendar size={13} className="text-white" />
                  {language === 'bn' ? `তারিখ: ${event.date}` : `Date: ${event.date}`}
                </span>
                {(event.location || event.locationBn) && (
                  <span className="flex items-center gap-1">
                    <MapPin size={13} className="text-white" />
                    {language === 'bn' ? (event.locationBn || event.location) : event.location}
                  </span>
                )}
              </div>
              <p className="text-emerald-100/90 text-sm leading-relaxed max-w-2xl pt-2 font-medium">
                {language === 'bn' ? (event.descriptionBn || event.description) : event.description}
              </p>
            </div>
          </div>
        )}

        {/* Supplementary Description if banner was used */}
        {event.imageURL && (
          <div className="p-6 lg:p-8 bg-white border-t border-slate-50">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2">
              {language === 'bn' ? 'উদ্দেশ্য এবং লক্ষ্য' : 'Campaign Goals & Purpose'}
            </h3>
            <p className="text-slate-600 text-sm font-medium leading-relaxed">
              {language === 'bn' ? (event.descriptionBn || event.description) : event.description}
            </p>
          </div>
        )}
      </div>

      {/* Tabs Menu */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-2 w-full max-w-md mx-auto">
        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-black uppercase rounded-xl transition-all ${
            activeTab === 'ledger'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileText size={14} />
          {language === 'bn' ? 'হিসাব খাতা ও তালিকা' : 'Ledger Book & Lists'}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-black uppercase rounded-xl transition-all ${
            activeTab === 'dashboard'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <BarChart2 size={14} />
          {language === 'bn' ? 'ড্যাশবোর্ড ও বিশ্লেষণ' : 'Dashboard & Analytics'}
        </button>
      </div>

      {/* Stats row - Bento Layout (Visible on dashboard click, or integrated universally) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
            <DollarSign size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'মোট বাজেট' : 'Allocated Budget'}
            </p>
            <p className="text-base font-black text-slate-900">৳{event.budget.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'মোট অনুদান সংগ্রহ' : 'Total Donations'}
            </p>
            <p className="text-base font-black text-emerald-600 font-mono">৳{totalCollected.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
            <TrendingDown size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'মোট ইভেন্ট ব্যয়' : 'Total Spent'}
            </p>
            <p className="text-base font-black text-rose-600 font-mono">৳{totalSpent.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${netFundBalance >= 0 ? 'bg-purple-50 text-purple-600' : 'bg-red-50 text-red-600'}`}>
            <Heart size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'ইভেন্ট ফান্ড ব্যালেন্স' : 'Fund Balance'}
            </p>
            <p className={`text-base font-black font-mono ${netFundBalance >= 0 ? 'text-purple-600' : 'text-red-500'}`}>
              ৳{netFundBalance.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
            <UserPlus size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'মোট ডোনার সংখ্যা' : 'Total Donors'}
            </p>
            <p className="text-base font-black text-slate-900 font-mono">{currentDonors.length} {language === 'bn' ? 'জন' : 'Donors'}</p>
          </div>
        </div>
      </div>

      {/* Progress tracking information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Budget Spending progress bar */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Activity size={12} className="text-rose-500" />
              {language === 'bn' ? 'বাজেট ব্যয়ের শতাংশ (Event Spending)' : 'Spent vs Budget Tracker'}
            </span>
            <span className="text-xs font-black text-rose-500">{percentSpent}% spent</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${percentSpent > 90 ? 'bg-rose-500' : percentSpent > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${percentSpent}%` }}
            />
          </div>
        </div>

        {/* Donation progress bar */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp size={12} className="text-emerald-500" />
              {language === 'bn' ? 'বাজেট অনুদান সংগ্রহ শতাংশ (Donation Progress)' : 'Collected vs Budget Target'}
            </span>
            <span className="text-xs font-black text-emerald-600">
              {event.budget > 0 ? Math.round((totalCollected / event.budget) * 100) : 0}% collected
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${event.budget > 0 ? Math.min(Math.round((totalCollected / event.budget) * 100), 100) : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Render conditional views depending on active tab status */}
      {activeTab === 'ledger' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Donors Lists Panel */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Heart className="text-rose-500" size={18} />
                  {language === 'bn' ? 'ডোনার ও অনুদানসমূহ' : 'Donors & Donations'}
                </h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  {language === 'bn' ? `${currentDonors.length} জন ডোনারের তথ্য রয়েছে` : `${currentDonors.length} donors recorded`}
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowAddDonor(!showAddDonor);
                  setShowAddExpense(false);
                }}
                className="flex items-center gap-1.5 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-600 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
              >
                <UserPlus size={14} />
                {language === 'bn' ? 'ডোনার যুক্ত করুন' : 'Add Donor'}
              </button>
            </div>

            <AnimatePresence>
              {showAddDonor && (
                <motion.form 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onSubmit={handleAddDonorSubmit}
                  className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4 animate-in fade-in duration-300"
                >
                  <div className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-2">
                    {language === 'bn' ? 'নতুন ডোনার যোগ করুন' : 'Donor Information'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Donor Name (English) *</label>
                      <input 
                        type="text" 
                        required
                        value={donorName}
                        onChange={e => setDonorName(e.target.value)}
                        placeholder="E.g. Abdullah"
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">ডোনারের নাম (বাংলা)</label>
                      <input 
                        type="text" 
                        value={donorNameBn}
                        onChange={e => setDonorNameBn(e.target.value)}
                        placeholder="উদা: আব্দুল্লাহ"
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Phone Phone *</label>
                      <input 
                        type="tel" 
                        required
                        value={donorPhone}
                        onChange={e => setDonorPhone(e.target.value)}
                        placeholder="017XXXXXXXX"
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Donation Amount (৳) *</label>
                      <input 
                        type="number" 
                        required
                        value={donorAmount}
                        onChange={e => setDonorAmount(e.target.value)}
                        placeholder="5000"
                        className="w-full px-3 py-2 bg-emerald-50 text-emerald-800 border-none rounded-lg text-xs font-black focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>

                    {/* Payment Method Selector */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Payment Method *</label>
                      <select 
                        value={donorPaymentMethod}
                        onChange={e => setDonorPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                      >
                        <option value="Cash">{language === 'bn' ? 'নগদ (Cash)' : 'Cash'}</option>
                        <option value="bKash">{language === 'bn' ? 'বিকাশ (bKash)' : 'bKash'}</option>
                        <option value="Nagad">{language === 'bn' ? 'নগদ (Nagad)' : 'Nagad'}</option>
                        <option value="Rocket">{language === 'bn' ? 'রকেট (Rocket)' : 'Rocket'}</option>
                        <option value="Bank">{language === 'bn' ? 'ব্যাংক চালানি (Bank)' : 'Bank Transfer'}</option>
                        <option value="Other">{language === 'bn' ? 'অন্যান্য (Other)' : 'Other'}</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Address / ঠিকানা</label>
                      <input 
                        type="text" 
                        value={donorAddress}
                        onChange={e => setDonorAddress(e.target.value)}
                        placeholder="E.g. Dhaka, Bangladesh"
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Remarks / রিমার্কস</label>
                      <textarea 
                        value={donorRemarks}
                        onChange={e => setDonorRemarks(e.target.value)}
                        rows={1}
                        placeholder="..."
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowAddDonor(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-[10px] font-bold uppercase transition-all"
                    >
                      {t.cancel}
                    </button>
                    <button 
                      type="submit"
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold uppercase transition-all shadow-md shadow-emerald-100"
                    >
                      {language === 'bn' ? 'ডোনেশন দিন' : 'Add Donation'}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Search bar for Donors */}
            <div className="relative bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder={language === 'bn' ? 'ডোনার বা ঠিকানা দিয়ে খুঁজুন...' : 'Search Donors or Addresses...'}
                value={donorSearch}
                onChange={e => setDonorSearch(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-1 focus:ring-rose-500 transition-all outline-none font-bold text-slate-700"
              />
            </div>

            {/* Donors Lists Container */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
              {currentDonors.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  {language === 'bn' ? 'কোনো ডোনার রেকর্ড পাওয়া যায়নি' : 'No donors registered for this event yet.'}
                </div>
              ) : (
                currentDonors.map(donor => (
                  <div key={donor.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0 uppercase">
                        {donor.name[0]}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-xs font-black text-slate-900 leading-tight">
                            {language === 'bn' ? (donor.nameBn || donor.name) : donor.name}
                          </p>
                          {donor.paymentMethod && (
                            <span className={`px-1.5 py-0.5 rounded text-[8px] border font-black uppercase tracking-wider shrink-0 ${getPaymentMethodStyle(donor.paymentMethod)}`}>
                              {getPaymentMethodLabel(donor.paymentMethod)}
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-slate-400 font-medium">
                          {donor.phone ? donor.phone + ' | ' : ''} {donor.receiptNo}
                        </p>
                        {donor.address && (
                          <p className="text-[9px] text-slate-500 font-bold flex items-center gap-0.5 mt-0.5">
                            <MapPin size={10} className="text-slate-400 shrink-0" />
                            <span>{donor.address}</span>
                          </p>
                        )}
                        {donor.remarks && (
                          <p className="text-[9px] text-slate-400 mt-0.5 italic">
                            "{donor.remarks}"
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-emerald-600 font-mono">৳{donor.amount.toLocaleString()}</span>
                      <button 
                        onClick={() => handleDonorDelete(donor.id)}
                        className="p-1.5 hover:bg-rose-50 text-slate-300 hover:text-rose-600 rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Expenses Lists Panel */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <AlertCircle className="text-rose-500" size={18} />
                  {language === 'bn' ? 'ইভেন্ট ব্যয়সমূহ' : 'Event Expenses'}
                </h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  {language === 'bn' ? `মোট ${currentExpenses.length}টি ক্রয়ের রেকর্ড রয়েছে` : `${currentExpenses.length} expense items recorded`}
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowAddExpense(!showAddExpense);
                  setShowAddDonor(false);
                }}
                className="flex items-center gap-1.5 bg-rose-600/10 hover:bg-rose-600 text-rose-600 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
              >
                <Plus size={14} />
                {language === 'bn' ? 'ব্যয় যুক্ত করুন' : 'Add Expense'}
              </button>
            </div>

            <AnimatePresence>
              {showAddExpense && (
                <motion.form 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onSubmit={handleAddExpenseSubmit}
                  className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4"
                >
                  <div className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-2">
                    {language === 'bn' ? 'ব্যয় বিবরণী যুক্ত করুন' : 'Expense Details'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Expense Item (English) *</label>
                      <input 
                        type="text" 
                        required
                        value={expenseTitle}
                        onChange={e => setExpenseTitle(e.target.value)}
                        placeholder="E.g., Catering Delivery"
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">ব্যয়ের টাইটেল (বাংলা)</label>
                      <input 
                        type="text" 
                        value={expenseTitleBn}
                        onChange={e => setExpenseTitleBn(e.target.value)}
                        placeholder="উদা: খাবার সরবরাহ"
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Category *</label>
                      <select 
                        value={expenseCategory}
                        onChange={e => setExpenseCategory(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                      >
                        {Object.keys(categoryTranslations).map(key => (
                          <option key={key} value={key}>
                            {language === 'bn' ? categoryTranslations[key].bn : categoryTranslations[key].en}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Cost Amount (৳) *</label>
                      <input 
                        type="number" 
                        required
                        value={expenseAmount}
                        onChange={e => setExpenseAmount(e.target.value)}
                        placeholder="1500"
                        className="w-full px-3 py-2 bg-rose-50 text-rose-800 border-none rounded-lg text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>

                    {/* Receipt upload box inside expense creation */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                        {language === 'bn' ? 'ভাউচার / মেমো রসিদ আপলোড (ঐচ্ছিক)' : 'Receipt Upload (Optional)'}
                      </label>
                      <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-2xl p-4 bg-slate-50 hover:bg-emerald-50/10 transition-all text-center relative pointer-events-auto">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleReceiptUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          disabled={isUploadingReceipt}
                        />
                        {isUploadingReceipt ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 size={24} className="text-emerald-600 animate-spin" />
                            <p className="text-[10px] font-bold text-slate-500">
                              {language === 'bn' ? 'আপলোড হচ্ছে...' : 'Uploading...'}
                            </p>
                          </div>
                        ) : expenseReceiptURL ? (
                          <div className="flex flex-col items-center gap-1.5">
                            <Image size={24} className="text-emerald-600" />
                            <p className="text-[10px] font-bold text-emerald-700">
                              {language === 'bn' ? 'রসিদ আপলোড হয়েছে! (পরিবর্তন করতে ক্লিক করুন)' : 'Receipt uploaded! (Click to replace)'}
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 text-slate-400">
                            <Upload size={24} className="mx-auto" />
                            <p className="text-[10px] font-bold text-slate-500 leading-tight">
                              {language === 'bn' ? 'ক্লিক করে রসিদ ফাইল আপলোড করুন' : 'Click to Upload Invoice/Receipt'}
                            </p>
                            <p className="text-[8px] text-slate-400 font-medium">PNG, JPG, BMP up to 5MB</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Remarks / রিমার্কস</label>
                      <textarea 
                        value={expenseRemarks}
                        onChange={e => setExpenseRemarks(e.target.value)}
                        rows={1}
                        placeholder="..."
                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowAddExpense(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-[10px] font-bold uppercase transition-all"
                    >
                      {t.cancel}
                    </button>
                    <button 
                      type="submit"
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold uppercase transition-all shadow-md shadow-emerald-100"
                    >
                      {language === 'bn' ? 'সংরক্ষণ করুন' : 'Confirm'}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Search bar for Expenses */}
            <div className="relative bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder={language === 'bn' ? 'আইটেম দিয়ে খুঁজুন...' : 'Search Expenses...'}
                value={expenseSearch}
                onChange={e => setExpenseSearch(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-1 focus:ring-rose-500 transition-all outline-none font-bold text-slate-700"
              />
            </div>

            {/* Expenses Lists Container */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
              {currentExpenses.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  {language === 'bn' ? 'কোনো ব্যয়ের রেকর্ড পাওয়া যায়নি' : 'No expenses registered for this event yet.'}
                </div>
              ) : (
                currentExpenses.map(item => (
                  <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs shrink-0 shrink-0">
                        {item.title[0]}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-900 leading-tight">
                            {language === 'bn' ? (item.titleBn || item.title) : item.title}
                          </p>
                          {item.receiptURL && (
                            <button
                              type="button"
                              onClick={() => setLightboxImage(item.receiptURL!)}
                              className="flex items-center gap-0.5 bg-emerald-50 text-emerald-800 border border-emerald-100 hover:bg-emerald-100 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0 cursor-pointer shadow-sm"
                            >
                              <Eye size={9} />
                              {language === 'bn' ? 'রসিদ আছে' : 'Receipt'}
                            </button>
                          )}
                        </div>
                        <p className="text-[9px] text-slate-400 font-medium whitespace-nowrap">
                          {getExpenseCategoryLabel(item.category)} | {item.date}
                        </p>
                        {item.remarks && (
                          <p className="text-[9px] text-slate-500 mt-0.5 max-w-[200px] truncate italic">
                            "{item.remarks}"
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-rose-600 font-mono">৳{item.amount.toLocaleString()}</span>
                      <button 
                        type="button"
                        onClick={() => handleExpenseDelete(item.id)}
                        className="p-1.5 hover:bg-rose-50 text-slate-300 hover:text-rose-600 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      ) : (
        /* Event Dashboard and Financial Analytics Tab using recharts */
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Donation Chart Panel */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col h-[380px]">
              <div className="mb-4">
                <span className="inline-flex bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-1">
                  {language === 'bn' ? 'আদায়কৃত অনুদান চিত্র' : 'Fundraising Growth Timeline'}
                </span>
                <h3 className="text-sm font-black text-slate-800">
                  {language === 'bn' ? '📈 অনুদান চিত্র (Donation Chart)' : 'Donation Growth Chart'}
                </h3>
              </div>
              {donationTimelineData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                  <Activity size={24} className="text-slate-300" />
                  <span>{language === 'bn' ? 'চার্ট দেখানোর জন্য পর্যাপ্ত ডাটা নেই।' : 'No donation data logged yet.'}</span>
                </div>
              ) : (
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={donationTimelineData}>
                      <defs>
                        <linearGradient id="colorDonDetail" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <Tooltip formatter={(value) => [`৳${value}`, language === 'bn' ? 'পরিমাণ' : 'Amount']} />
                      <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorDonDetail)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Expense Chart Panel */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col h-[380px]">
              <div className="mb-4">
                <span className="inline-flex bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-1">
                  {language === 'bn' ? 'খাত ভিত্তিক ব্যয় বণ্টন' : 'Allocation by Categories'}
                </span>
                <h3 className="text-sm font-black text-slate-800">
                  {language === 'bn' ? '📉 খরচ চিত্র (Expense Chart)' : 'Expense Categoric Distribution'}
                </h3>
              </div>
              {expenseCategoryData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                  <PieChart size={24} className="text-slate-300" />
                  <span>{language === 'bn' ? 'চার্ট দেখানোর জন্য পর্যাপ্ত ডাটা নেই।' : 'No expenditures logged yet.'}</span>
                </div>
              ) : (
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={expenseCategoryData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                      <XAxis dataKey="category" stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <Tooltip formatter={(value) => [`৳${value}`, language === 'bn' ? 'ব্যয়' : 'Spent']} />
                      <Bar dataKey="amount" fill="#f43f5e" radius={[8, 8, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Composed Cashflow & Net Balance Path Tracker */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col h-[380px] lg:col-span-2">
              <div className="mb-4">
                <span className="inline-flex bg-purple-50 text-purple-750 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-1">
                  {language === 'bn' ? 'তহবিল ও নিট ব্যালেন্স গতিধারা' : 'Accumulated Income vs Outflow Tracking'}
                </span>
                <h3 className="text-sm font-black text-slate-800">
                  {language === 'bn' ? '📉 ব্যালেন্স প্রবাহ (Balance Chart)' : 'Balance Path Timeline'}
                </h3>
              </div>
              {balanceTimelineData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                  <Activity size={24} className="text-slate-300" />
                  <span>{language === 'bn' ? 'চার্ট দেখানোর জন্য পর্যাপ্ত ডাটা নেই।' : 'No balance progression path logged.'}</span>
                </div>
              ) : (
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={balanceTimelineData}>
                      <defs>
                        <linearGradient id="colorBalDetail" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <Tooltip formatter={(value, name) => [
                        `৳${value}`, 
                        name === 'donations' ? (language === 'bn' ? 'আদায়কৃত অনুদান' : 'Donations Collected') :
                        name === 'expenses' ? (language === 'bn' ? 'ব্যয়কৃত তহবিল' : 'Spent Base') :
                        (language === 'bn' ? 'তহবিল ব্যালেন্স' : 'Net Balance')
                      ]} />
                      <Legend wrapperStyle={{ fontSize: 9, fontWeight: 'bold', paddingTop: 10 }} />
                      <Area type="monotone" name="balance" dataKey="balance" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorBalDetail)" />
                      <Area type="monotone" name="donations" dataKey="donations" stroke="#10b981" strokeWidth={2} fill="transparent" />
                      <Area type="monotone" name="expenses" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fill="transparent" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Lightbox Receipt Viewer */}
      <AnimatePresence>
        {lightboxImage !== null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md cursor-zoom-out"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="relative max-w-3xl max-h-[85vh] bg-white rounded-3xl overflow-hidden shadow-2xl p-2"
            >
              <img 
                src={getImageUrl(lightboxImage)} 
                alt="Receipt" 
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[80vh] object-contain rounded-2xl"
              />
              <button 
                type="button"
                onClick={() => setLightboxImage(null)}
                className="absolute top-4 right-4 bg-slate-900/60 hover:bg-slate-900 text-white rounded-full p-2 text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
