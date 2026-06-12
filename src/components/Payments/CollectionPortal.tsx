/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Receipt, Calendar, User, Key, Lock,
  ArrowUpRight, Download, Printer, Share2, X,
  Edit, Trash2, Check, Upload, QrCode, Save, LogOut,
  RefreshCw, FileSpreadsheet, AlertCircle, CheckCircle2,
  Trash, ArrowRight, ShieldCheck, MessageSquare, Info, Smartphone
} from 'lucide-react';
import { usePayments } from '../../hooks/usePayments';
import { useMembers } from '../../hooks/useMembers';
import { useAppContext } from '../../context/AppContext';
import { getImageUrl } from '../../lib/utils';
import ReceiptModal from './ReceiptModal';
import { Payment } from '../../types';

// Simple Bangla digits helper
const toBanglaDigitsLocal = (num: number | string): string => {
  const banglaDigits: { [key: string]: string } = {
    '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯'
  };
  return String(num).replace(/[0-9]/g, digit => banglaDigits[digit] || digit);
};

export default function CollectionPortal() {
  const { settings, language, t } = useAppContext();
  const isBn = language === 'bn';

  // State to check lock gate status
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [accessError, setAccessError] = useState('');

  // Core records hooks
  const { payments, loading: paymentsLoading, addPayment } = usePayments();
  const { members, loading: membersLoading } = useMembers();

  // Active Month target & Spreadsheet rows
  const [activeMonthFilter, setActiveMonthFilter] = useState(() => new Date().toISOString().slice(0, 7)); // default current month
  const [bulkRows, setBulkRows] = useState<any[]>([]);
  const [autoLoadToggle, setAutoLoadToggle] = useState(true);
  const [bulkSearchTerm, setBulkSearchTerm] = useState('');
  const [bulkSavingAll, setBulkSavingAll] = useState(false);

  // Modal open states
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrInputText, setQrInputText] = useState('');
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelPasteText, setExcelPasteText] = useState('');
  const [qrSuccessFlash, setQrSuccessFlash] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<Payment | null>(null);
  
  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // Play audio scan feedback
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
      gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime); 
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1); 
    } catch (e) {
      console.warn("Audio scanner beep ignored:", e);
    }
  };

  // 1. Auto-unlock logic based on URL search query key or persistent local storage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const keyParam = params.get('key');
    const configuredCode = settings.portalPasscode || '7890';

    // Check query params
    if (keyParam === configuredCode) {
      setIsUnlocked(true);
      localStorage.setItem('nswo_portal_unlocked', 'true');
      return;
    }

    // Check localStorage
    const savedUnlock = localStorage.getItem('nswo_portal_unlocked');
    if (savedUnlock === 'true') {
      setIsUnlocked(true);
    }
  }, [settings.portalPasscode]);

  // Handle PIN passcode manual entry submit
  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const configuredCode = settings.portalPasscode || '7890';
    
    if (passcodeInput.trim() === configuredCode) {
      setIsUnlocked(true);
      setAccessError('');
      localStorage.setItem('nswo_portal_unlocked', 'true');
    } else {
      setAccessError(isBn ? 'ভুল পাসকোড! অনুগ্রহ করে সঠিক পিন কোড প্রবেশ করুন।' : 'Invalid Access PIN! Please enter the correct code.');
    }
  };

  const handleLogout = () => {
    setIsUnlocked(false);
    localStorage.removeItem('nswo_portal_unlocked');
    setPasscodeInput('');
    
    // Clear key URL param if there is any
    const url = new URL(window.location.href);
    url.searchParams.delete('key');
    window.history.replaceState({}, '', url.toString());
  };

  // Helper to pre-populate list on month / toggle changes
  const initializeBulkRows = () => {
    if (autoLoadToggle && members.length > 0) {
      const activeContributors = members.filter(m => 
        m.status === 'active' && m.includeInMonthlyLedger !== false
      );
      
      const rows = activeContributors.map(m => {
        const existingPayment = payments.find(p => 
          p.memberId === m.id && 
          p.month === activeMonthFilter && 
          (!p.type || p.type === 'SUBSCRIPTION')
        );

        return {
          tempId: `portal_row_${m.id}_${Date.now()}_${Math.random()}`,
          memberId: m.id,
          customId: m.memberId,
          name: m.name,
          nameBn: m.nameBn,
          phone: m.phone,
          monthlySubscription: m.monthlySubscription,
          selectedMonth: activeMonthFilter,
          amount: m.monthlySubscription || 500,
          paymentDate: new Date().toISOString().split('T')[0],
          note: '',
          status: existingPayment ? 'saved' : 'idle',
          errorMessage: '',
          savedPaymentObj: existingPayment || null
        };
      });

      rows.sort((a, b) => a.customId.localeCompare(b.customId, undefined, { numeric: true, sensitivity: 'base' }));
      setBulkRows(rows);
    } else {
      setBulkRows([]);
    }
  };

  useEffect(() => {
    if (isUnlocked && members.length > 0) {
      initializeBulkRows();
    }
  }, [isUnlocked, autoLoadToggle, activeMonthFilter, members]);

  // Handle single cell modification
  const updateRowField = (tempId: string, field: string, value: any) => {
    setBulkRows(prev => prev.map(row => {
      if (row.tempId === tempId) {
        if (field === 'selectedMonth') {
          const existingPayment = payments.find(p => 
            p.memberId === row.memberId && 
            p.month === value && 
            (!p.type || p.type === 'SUBSCRIPTION')
          );
          return { 
            ...row, 
            [field]: value, 
            status: existingPayment ? 'saved' : 'idle',
            savedPaymentObj: existingPayment || null
          };
        }
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  const appendMemberToBulk = (member: any) => {
    if (bulkRows.some(row => row.memberId === member.id)) {
      alert(isBn ? `সদস্য "${member.name}" ইতোমধ্যে তালিকায় যুক্ত আছেন!` : `Member "${member.name}" is already in the list!`);
      return;
    }

    const existingPayment = payments.find(p => 
      p.memberId === member.id && 
      p.month === activeMonthFilter && 
      (!p.type || p.type === 'SUBSCRIPTION')
    );

    const newRow = {
      tempId: `portal_row_${member.id}_${Date.now()}`,
      memberId: member.id,
      customId: member.memberId,
      name: member.name,
      nameBn: member.nameBn,
      phone: member.phone,
      monthlySubscription: member.monthlySubscription,
      selectedMonth: activeMonthFilter,
      amount: member.monthlySubscription || 500,
      paymentDate: new Date().toISOString().split('T')[0],
      note: '',
      status: existingPayment ? 'saved' : 'idle',
      errorMessage: '',
      savedPaymentObj: existingPayment || null
    };

    setBulkRows(prev => [newRow, ...prev]);
    playBeep();
  };

  // Submit single payment row
  const handleSaveRow = async (tempId: string) => {
    const row = bulkRows.find(r => r.tempId === tempId);
    if (!row || row.status === 'saved') return;

    setBulkRows(prev => prev.map(r => r.tempId === tempId ? { ...r, status: 'saving', errorMessage: '' } : r));

    try {
      const parentMember = members.find(m => m.id === row.memberId);
      if (!parentMember) throw new Error(isBn ? 'সদস্য খুঁজে পাওয়া যায়নি' : 'Member profile not found');

      const payload = {
        memberId: row.memberId,
        memberName: parentMember.name,
        memberNameBn: parentMember.nameBn || parentMember.name,
        amount: Number(row.amount),
        date: row.paymentDate,
        month: row.selectedMonth,
        year: Number(row.paymentDate.split('-')[0]),
        type: 'subscription' as any,
        method: isBn ? 'নগদ' : 'Cash',
        remarks: row.note || (isBn ? 'কালেকশন পোর্টাল হতে সংরক্ষিত' : 'Recorded via Shared Collection Link Portal')
      };

      const receiptNo = await addPayment(payload);

      const savedObj: Payment = {
        id: `saved_${row.memberId}_${Date.now()}`,
        memberId: row.memberId,
        memberName: parentMember.name,
        memberNameBn: parentMember.nameBn || parentMember.name,
        amount: Number(row.amount),
        date: row.paymentDate,
        month: row.selectedMonth,
        year: Number(row.paymentDate.split('-')[0]),
        type: 'subscription' as any,
        method: isBn ? 'নগদ' : 'Cash',
        remarks: row.note || (isBn ? 'কালেকশন পোর্টাল হতে সংরক্ষিত' : 'Recorded via Shared Collection Link Portal'),
        receiptNo: receiptNo || `R-temp`,
        createdAt: Date.now()
      };

      setBulkRows(prev => prev.map(r => r.tempId === tempId ? { 
        ...r, 
        status: 'saved', 
        savedPaymentObj: savedObj 
      } : r));

    } catch (err: any) {
      console.error("Single row save error:", err);
      setBulkRows(prev => prev.map(r => r.tempId === tempId ? { 
        ...r, 
        status: 'failed', 
        errorMessage: err.message || 'Error saving' 
      } : r));
    }
  };

  // Submit all pending rows sequentially (Series loop to avoid transaction race conditions)
  const handleSaveAllRows = async () => {
    const unsavedRows = bulkRows.filter(r => r.status === 'idle' || r.status === 'failed');
    if (unsavedRows.length === 0) {
      alert(isBn ? 'সংরক্ষণ করার মতো কোনো নতুন পেমেন্ট অবশিষ্ট নেই।' : 'No unsaved payments found in active rows.');
      return;
    }

    setBulkSavingAll(true);
    
    for (const row of unsavedRows) {
      await handleSaveRow(row.tempId);
    }

    setBulkSavingAll(false);
  };

  const handleDeleteRowLocally = (tempId: string) => {
    setBulkRows(prev => prev.filter(r => r.tempId !== tempId));
  };

  // WhatsApp share generator
  const getWhatsAppShareUrl = (row: any) => {
    const pObj = row.savedPaymentObj;
    if (!pObj) return '';
    const phone = row.phone || '';
    const cleanPhone = phone.replace(/[^\d]/g, '');
    const finalPhone = cleanPhone.startsWith('88') ? cleanPhone : `88${cleanPhone}`;
    
    const textBn = `প্রিয় সদস্য,\nআপনার মাসিক চাঁদা পেমেন্ট সফলভাবে জমা হয়েছে। ধন্যবাদ!\n\n` + 
      `👤 সদস্য: ${pObj.memberNameBn || pObj.memberName}\n` +
      `🆔 আইডি: ${row.customId}\n` +
      `📅 মাস: ${pObj.month}\n` +
      `৳ পরিমাণ: ৳${pObj.amount}\n` +
      `🧾 রসিদ নং: ${pObj.receiptNo}\n\n` +
      `ধন্যবাদান্তে,\n${settings.nameBn || settings.name}`;
      
    const textEn = `Dear Member,\nYour monthly subscription payment has been received successfully. Thank you!\n\n` + 
      `👤 Name: ${pObj.memberName}\n` +
      `🆔 ID: ${row.customId}\n` +
      `📅 Month: ${pObj.month}\n` +
      `৳ Amount: ৳${pObj.amount}\n` +
      `🧾 Receipt No: ${pObj.receiptNo}\n\n` +
      `Best regards,\n${settings.name}`;
      
    const text = isBn ? textBn : textEn;
    return `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(text)}`;
  };

  // CSV Excel blocks importer
  const parseExcelPaste = () => {
    if (!excelPasteText.trim()) return;

    const lines = excelPasteText.split('\n').map(l => l.trim()).filter(Boolean);
    let successfullyAddedCount = 0;
    const newRowsToAppend: any[] = [];

    lines.forEach(line => {
      const cols = line.split(/[\t,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length === 0) return;

      const matchedMember = members.find(m => 
        cols.some(val => 
          val.toLowerCase() === m.memberId.toLowerCase() || 
          val === m.phone ||
          val.toLowerCase() === m.name.toLowerCase()
        )
      );

      if (matchedMember) {
        if (bulkRows.some(r => r.memberId === matchedMember.id) || newRowsToAppend.some(r => r.memberId === matchedMember.id)) {
          return;
        }

        let customAmount = matchedMember.monthlySubscription || 500;
        for (const col of cols) {
          const num = Number(col);
          if (!isNaN(num) && num > 0 && col !== matchedMember.phone && col !== matchedMember.memberId) {
            customAmount = num;
            break;
          }
        }

        const existingPayment = payments.find(p => 
          p.memberId === matchedMember.id && 
          p.month === activeMonthFilter && 
          (!p.type || p.type === 'SUBSCRIPTION')
        );

        newRowsToAppend.push({
          tempId: `portal_row_${matchedMember.id}_excel_${Date.now()}_${Math.random()}`,
          memberId: matchedMember.id,
          customId: matchedMember.memberId,
          name: matchedMember.name,
          nameBn: matchedMember.nameBn,
          phone: matchedMember.phone,
          monthlySubscription: matchedMember.monthlySubscription,
          selectedMonth: activeMonthFilter,
          amount: customAmount,
          paymentDate: new Date().toISOString().split('T')[0],
          note: isBn ? 'এক্সেল ফাইল হতে লোডকৃত' : 'Imported from spreadsheet data',
          status: existingPayment ? 'saved' : 'idle',
          errorMessage: '',
          savedPaymentObj: existingPayment || null
        });

        successfullyAddedCount++;
      }
    });

    if (newRowsToAppend.length > 0) {
      setBulkRows(prev => [...newRowsToAppend, ...prev]);
      playBeep();
      alert(isBn 
        ? `স্প্রেডশিট থেকে মোট ${toBanglaDigitsLocal(successfullyAddedCount)} জন অসংরক্ষিত সদস্য সফলভাবে লোড করা হয়েছে!` 
        : `Successfully loaded ${successfullyAddedCount} unrecorded members from spreadsheet block!`
      );
    } else {
      alert(isBn 
        ? `কোন সদস্য সনাক্ত করা যায়নি। স্প্রেডশিট আইডি (উদা: M-1001) বা মোবাইল নম্বর থাকতে হবে।` 
        : `Could not recognize any valid members. Please paste valid rows containing Member IDs or phone numbers.`
      );
    }

    setExcelPasteText('');
    setIsExcelModalOpen(false);
  };

  // QR matches
  const handleQrInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQrInputText(val);

    const cleanId = val.trim();
    const matched = members.find(m => m.memberId.toLowerCase() === cleanId.toLowerCase());
    if (matched) {
      appendMemberToBulk(matched);
      setQrSuccessFlash(isBn ? `সক্রিয় সদস্য সনাক্ত: ${matched.nameBn || matched.name}` : `Active Member Detected: ${matched.name}`);
      setQrInputText('');
      playBeep();
      
      setTimeout(() => {
        setQrSuccessFlash(null);
      }, 3000);
    }
  };

  const startCamera = async () => {
    setCameraActive(true);
    try {
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      activeStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (e) {
      console.warn("Camera streams blocked or camera not plugged in:", e);
    }
  };

  const stopCamera = () => {
    setCameraActive(false);
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => track.stop());
      activeStreamRef.current = null;
    }
  };

  useEffect(() => {
    if (isQrModalOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isQrModalOpen]);

  // Suggestions lookups
  const bulkSearchedMembers = useMemo(() => {
    if (!bulkSearchTerm.trim()) return [];
    return members.filter(m => 
      m.name.toLowerCase().includes(bulkSearchTerm.toLowerCase()) ||
      (m.nameBn && m.nameBn.includes(bulkSearchTerm)) ||
      m.memberId.toLowerCase().includes(bulkSearchTerm.toLowerCase()) ||
      m.phone.includes(bulkSearchTerm)
    ).slice(0, 5);
  }, [members, bulkSearchTerm]);

  // Theme support
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

  // Main UI components render
  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020804] px-4 md:px-0">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,rgba(5,150,105,0.4),transparent_70%)]" />
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md bg-black/60 backdrop-blur-2xl px-8 py-10 rounded-[2.5rem] border border-emerald-900/40 text-center shadow-2xl relative z-10"
        >
          {/* Logo / Title */}
          <div className="w-20 h-20 bg-emerald-950/80 rounded-3xl mx-auto flex items-center justify-center border-2 border-emerald-500/30 text-emerald-400 mb-6">
            <Lock size={36} className="text-emerald-500 animate-pulse" />
          </div>

          <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
            {isBn ? settings.nameBn : settings.name}
          </h2>
          <p className="text-emerald-400 font-bold text-xs uppercase tracking-widest mt-2">
            🔑 {isBn ? 'চাঁদা কালেকশন পোর্টাল' : 'Subscription Entry Link Portal'}
          </p>
          <p className="text-slate-400 text-[11px] font-medium leading-relaxed mt-4">
            {isBn 
              ? 'অনুগ্রহ করে অনুমোদিত কালেকশন ম্যানেজার বা অ্যাডমিন পিন কোডটি প্রবেশ করিয়ে এন্ট্রি শিট আনলক করুন।' 
              : 'Secure access gateway. Please enter the Collection Manager security passcode pin code to unlock the spreadsheet.'}
          </p>

          <form onSubmit={handleUnlockSubmit} className="mt-8 space-y-4 text-left">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                {isBn ? 'কালেকশন ম্যানেজার পিন' : 'Portal Access code'}
              </label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="password" 
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  placeholder="••••"
                  className="w-full bg-emerald-950/10 border border-emerald-900/30 rounded-2xl pl-12 pr-4 py-4 text-center text-lg font-black tracking-[0.4em] focus:ring-2 focus:ring-emerald-500 transition-all outline-none text-white placeholder-slate-600"
                  required
                />
              </div>
            </div>

            {accessError && (
              <p className="text-xs font-bold text-rose-500 text-center bg-red-500/10 py-2.5 rounded-xl border border-red-500/20">
                ⚠️ {accessError}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-xl shadow-emerald-950/50 cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck size={16} />
              {isBn ? 'পোর্টাল আনলক করুন' : 'Unlock Ledger Portal'}
            </button>
          </form>

          <p className="text-[10px] text-slate-500 font-bold mt-8">
            {isBn ? 'নাছিরেরটেক সমাজ কল্যাণ সংস্থা © ২০২৬' : 'NSWO Verified secure entry system © 2026'}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#010904] text-slate-100 p-4 md:p-8 space-y-6">
      
      {/* 2. Brand Header Banner */}
      <div 
        className={`p-6 md:p-8 rounded-3xl ${isThemeLight ? 'text-slate-900' : 'text-white'} shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden`}
        style={{ backgroundColor: settings.themeColor }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <Smartphone size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <div className={`inline-flex items-center gap-2 px-3 py-1 ${isThemeLight ? 'bg-black/10 text-slate-950' : 'bg-white/20 text-white'} rounded-full text-xs font-black uppercase tracking-wider`}>
            ⚡ {isBn ? 'চাঁদা কালেকশন পোর্টাল' : 'Collector Hub (Unlocked)'}
          </div>
          <h2 className="text-xl md:text-3xl font-black tracking-tight leading-tight">
            {isBn ? settings.nameBn : settings.name}
          </h2>
          <p className={`text-xs md:text-sm font-semibold max-w-2xl ${isThemeLight ? 'text-slate-800' : 'text-white/80'}`}>
            {isBn 
              ? 'এখানে আপনি এক ক্লিকে কিউআর কোড স্ক্যান করে বা নাম খুঁজে মেম্বারদের টাকা এন্ট্রি দিতে পারবেন। সংরক্ষিত ডাটা সরাসরি সেন্ট্রাল সিস্টেমে সিঙ্ক হবে।' 
              : 'Directly record multiple membership payments. All transactions synchronized immediately with cloud index.'}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="z-10 self-start md:self-center bg-black/20 hover:bg-black/30 text-inherit text-xs font-black px-4 py-2.5 rounded-xl border border-current flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95"
        >
          <LogOut size={14} />
          {isBn ? 'লগআউট' : 'Lock Portal'}
        </button>
      </div>

      {/* Main layout contents */}
      <div className="space-y-6">
        
        {/* Action Widgets Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Quick Lookup Card */}
          <div className="bg-white/5 border border-white/15 rounded-3xl p-5 flex flex-col justify-between">
            <div className="mb-4">
              <span className="text-[10px] font-black tracking-widest text-[#d97706] uppercase block mb-1">🔍 Quick search</span>
              <h4 className="text-sm font-black text-white">{isBn ? 'সদস্য তালিকা হতে খুঁজুন' : 'Append Member ID'}</h4>
              <p className="text-[11px] text-white/60 mt-1">{isBn ? 'নাম বা আইডি লিখে খুঁজে সরাসরি এন্ট্রি শিটে এড় করুন।' : 'Find member profiles to populate table row.'}</p>
            </div>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" size={16} />
              <input 
                type="text"
                placeholder={isBn ? 'নাম, আইডি বা মোবাইল নং...' : 'Lookup name, custom ID or mobile...'}
                value={bulkSearchTerm}
                onChange={(e) => setBulkSearchTerm(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white"
              />

              {/* Suggestions dropdown */}
              {bulkSearchTerm.trim() && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-[#041a0d] border border-emerald-900/60 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-emerald-950/40">
                  {bulkSearchedMembers.map(m => (
                    <button
                      key={m.id}
                      onClick={() => {
                        appendMemberToBulk(m);
                        setBulkSearchTerm('');
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-emerald-950/40 transition-all flex items-center justify-between group"
                    >
                      <div>
                        <p className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                          {isBn ? (m.nameBn || m.name) : m.name}
                        </p>
                        <span className="text-[9px] text-white/50">ID: {m.memberId} | Mob: {m.phone}</span>
                      </div>
                      <Plus size={14} className="text-[#d97706] group-hover:scale-125 transition-transform" />
                    </button>
                  ))}
                  {bulkSearchedMembers.length === 0 && (
                    <div className="p-4 text-center text-xs text-white/40">
                      {isBn ? 'কোন সদস্য পাওয়া যায়নি!' : 'No matching member found.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Scanner Card */}
          <div className="bg-white/5 border border-white/15 rounded-3xl p-5 flex flex-col justify-between">
            <div className="mb-4">
              <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase block mb-1">📸 Barcode Scan</span>
              <h4 className="text-sm font-black text-white">{isBn ? 'আইডি কার্ড আরআর স্ক্যানার' : 'QR Card ID Reader'}</h4>
              <p className="text-[11px] text-white/60 mt-1">{isBn ? 'গ্রাহকের ডিজিটাল আইডি কার্ড ক্যামেরা বা স্ক্যানার দিয়ে স্ক্যান করুন।' : 'Scan card instantly to load regular row.'}</p>
            </div>

            <button
              onClick={() => setIsQrModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-2xl shadow-lg hover:scale-[1.02] transform transition-all text-xs"
            >
              <QrCode size={16} />
              <span>{isBn ? 'স্ক্যানার ক্যামেরা খুলুন' : 'Open Camera Scanner'}</span>
            </button>
          </div>

          {/* Copy Paste spreadsheet */}
          <div className="bg-white/5 border border-white/15 rounded-3xl p-5 flex flex-col justify-between">
            <div className="mb-4">
              <span className="text-[10px] font-black tracking-widest text-[#d97706] uppercase block mb-1">📊 Import Spreadsheet</span>
              <h4 className="text-sm font-black text-white">{isBn ? 'স্প্রেডশিট ডাটা পেস্ট' : 'Paste CSV/Excel Block'}</h4>
              <p className="text-[11px] text-white/60 mt-1">{isBn ? 'এক্সেল বা গুগল শিট হতে রো কপি করে সরাসরি পেস্ট করুন।' : 'Direct copy paste columns into ledger rows.'}</p>
            </div>

            <button
              onClick={() => setIsExcelModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 text-slate-900 font-bold rounded-2xl shadow-lg hover:scale-[1.02] transform transition-all text-xs"
            >
              <Upload size={16} className="text-emerald-700" />
              <span>{isBn ? 'স্প্রেডশিট ডাটা পেস্ট করুন' : 'Spreadsheet Paste'}</span>
            </button>
          </div>

        </div>

        {/* Ledger Month targeted Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/5 p-4 rounded-3xl border border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-white/70">{isBn ? 'আদায়ের মাস টার্গেট:' : 'Collection target month:'}</span>
            <input 
              type="month"
              value={activeMonthFilter}
              onChange={(e) => setActiveMonthFilter(e.target.value)}
              className="bg-emerald-950/40 border border-emerald-900/60 rounded-xl px-4 py-2 font-mono text-xs font-black text-amber-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-white/70">
              {isBn ? 'মাসিক নিয়মিত চাঁদা সদস্য অটো-লোড করুন:' : 'Auto load regular active members:'}
            </span>
            <button
              onClick={() => setAutoLoadToggle(!autoLoadToggle)}
              className={`w-14 h-8 rounded-full transition-all relative ${
                autoLoadToggle ? 'bg-emerald-600 border border-emerald-500' : 'bg-slate-700 border border-slate-650'
              }`}
            >
              <div className={`absolute top-0.5 w-6.5 h-6.5 rounded-full bg-white shadow-md transition-all ${
                autoLoadToggle ? 'left-6.5' : 'left-0.5'
              }`} />
            </button>
            <span className="text-xs font-black uppercase text-emerald-400">
              {autoLoadToggle ? (isBn ? 'লোডেড' : 'ON') : (isBn ? 'বন্ধ' : 'OFF')}
            </span>
          </div>

          <button
            onClick={initializeBulkRows}
            className="text-[10px] font-black uppercase tracking-wider text-white/60 hover:text-white px-3 py-2 border border-white/10 rounded-xl flex items-center gap-1 hover:bg-emerald-950"
          >
            <RefreshCw size={12} />
            {isBn ? 'রিস্টার্ট ডাটা' : 'Restart state'}
          </button>
        </div>

        {/* Core Spreadsheet Table layout */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl overflow-hidden text-slate-900">
          <div className="overflow-x-auto text-[11px] md:text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-secondary/10">
                  <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center w-12">#</th>
                  <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{isBn ? 'সদস্য পরিচিতি' : 'Member & ID'}</th>
                  <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{isBn ? 'মোবাইল নম্বর' : 'Mobile'}</th>
                  <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">{isBn ? 'টার্গেট মাস' : 'Month'}</th>
                  <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest w-32">{isBn ? 'পরিমাণ' : 'Amount'}</th>
                  <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest w-40">{isBn ? 'তারিখ' : 'Date'}</th>
                  <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{isBn ? 'মন্তব্য/নোট' : 'Remarks'}</th>
                  <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">{isBn ? 'অবস্থা / অ্যাকশন' : 'Sync Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-semibold text-slate-800">
                {bulkRows.map((row, index) => (
                  <tr 
                    key={row.tempId}
                    className={`transition-colors ${
                      row.status === 'saved' ? 'bg-emerald-50/50 hover:bg-emerald-50/70' :
                      row.status === 'failed' ? 'bg-red-50/30 hover:bg-red-50/40' :
                      'hover:bg-slate-50/40'
                    }`}
                  >
                    <td className="px-4 py-3.5 text-center font-bold text-slate-400">
                      {isBn ? toBanglaDigitsLocal(index + 1) : index + 1}
                    </td>

                    <td className="px-4 py-3.5 font-bold">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-emerald-100 flex items-center justify-center text-emerald-600 font-extrabold shrink-0 border border-white">
                          {row.name[0]}
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900 truncate max-w-[150px]">
                            {isBn ? (row.nameBn || row.name) : row.name}
                          </p>
                          <span className="text-[10px] font-mono font-black text-rose-500 uppercase">
                            #{row.customId}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-slate-500 font-bold">
                      {row.phone || (isBn ? 'নেই' : 'None')}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <input 
                        type="month"
                        value={row.selectedMonth}
                        disabled={row.status === 'saved'}
                        onChange={(e) => updateRowField(row.tempId, 'selectedMonth', e.target.value)}
                        className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 font-mono text-[11px] font-bold text-slate-700 disabled:bg-slate-50"
                      />
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">৳</span>
                        <input 
                          type="number"
                          value={row.amount}
                          disabled={row.status === 'saved'}
                          onChange={(e) => updateRowField(row.tempId, 'amount', Number(e.target.value))}
                          className="bg-slate-100 border border-slate-200 rounded-lg pl-6 pr-1.5 py-1 text-slate-800 font-black w-24 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <input 
                        type="date"
                        value={row.paymentDate}
                        disabled={row.status === 'saved'}
                        onChange={(e) => updateRowField(row.tempId, 'paymentDate', e.target.value)}
                        className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 font-mono font-bold text-slate-700 disabled:bg-slate-50"
                      />
                    </td>

                    <td className="px-4 py-3.5">
                      <input 
                        type="text"
                        placeholder={isBn ? 'টাকা আদায়ের মন্তব্য...' : 'Add remarks...'}
                        value={row.note}
                        disabled={row.status === 'saved'}
                        onChange={(e) => updateRowField(row.tempId, 'note', e.target.value)}
                        className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 placeholder-slate-400 disabled:bg-slate-50"
                      />
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        
                        {row.status === 'saved' && (
                          <div className="flex items-center gap-1.5 animate-in zoom-in-95">
                            <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg uppercase">
                              <Check size={12} strokeWidth={3} />
                              {isBn ? 'সফল' : 'PAID'}
                            </span>
                            
                            {row.savedPaymentObj && (
                              <button
                                onClick={() => setViewingReceipt(row.savedPaymentObj)}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200"
                                title={isBn ? 'রশিদ ডাউনলোড' : 'Download receipt'}
                              >
                                <Receipt size={14} />
                              </button>
                            )}

                            {row.phone && (
                              <a 
                                href={getWhatsAppShareUrl(row)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-lg border border-emerald-500/20 transition-all font-bold"
                                title={isBn ? 'হোয়াটসঅ্যাপ মেসেজ' : 'Send receipt message'}
                              >
                                <MessageSquare size={14} />
                              </a>
                            )}
                          </div>
                        )}

                        {row.status === 'saving' && (
                          <div className="flex items-center gap-1 text-slate-500 font-bold">
                            <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                            <span>{isBn ? 'সেভিং...' : 'Syncing...'}</span>
                          </div>
                        )}

                        {row.status === 'failed' && (
                          <div className="flex items-center gap-1 text-red-600 bg-red-100 px-2 py-1 rounded-lg">
                            <AlertCircle size={14} />
                            <span className="text-[10px] font-bold" title={row.errorMessage}>
                              {isBn ? 'ব্যর্থ' : 'Failed'}
                            </span>
                          </div>
                        )}

                        {row.status === 'idle' && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleSaveRow(row.tempId)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg flex items-center gap-1 text-[10px]"
                            >
                              <Save size={12} />
                              {isBn ? 'সেভ' : 'Save'}
                            </button>
                            <button
                              onClick={() => handleDeleteRowLocally(row.tempId)}
                              className="p-1.5 hover:bg-red-100 text-slate-400 hover:text-red-500 rounded-lg"
                            >
                              <Trash size={14} />
                            </button>
                          </div>
                        )}

                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {bulkRows.length === 0 && (
              <div className="p-16 text-center text-slate-400">
                <p className="text-sm font-bold">
                  {isBn ? 'লোডেড তালিকায় কোনো রেকর্ড নেই। অনুগ্রহ করে সদস্য সার্চ করুন।' : 'Spreadsheet editor is currently empty. Populate the list above.'}
                </p>
              </div>
            )}
          </div>

          {/* Table global save actions */}
          {bulkRows.length > 0 && (
            <div className="p-4 md:p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-slate-600 text-xs font-bold text-center sm:text-left">
                {isBn 
                  ? `মোট চাঁদা এন্ট্রি রো: ${toBanglaDigitsLocal(bulkRows.length)} টি | সফল সংরক্ষিত: ${toBanglaDigitsLocal(bulkRows.filter(r => r.status === 'saved').length)} টি`
                  : `Total collection rows: ${bulkRows.length} | Successfully saved: ${bulkRows.filter(r => r.status === 'saved').length}`
                }
              </div>

              <button
                type="button"
                disabled={bulkSavingAll || bulkRows.filter(r => r.status === 'idle' || r.status === 'failed').length === 0}
                onClick={handleSaveAllRows}
                className="w-full sm:w-auto px-8 py-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xl shadow-slate-200"
              >
                {bulkSavingAll ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>{isBn ? 'সবগুলো সেভ হতেছে...' : 'Bulk Saving sequentially...'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} className="text-emerald-400 animate-pulse" />
                    <span>{isBn ? 'সব আদায় একসাথে সেভ করুন' : 'Confirm & Save All Payments'}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: QR ID SCANNER */}
      <AnimatePresence>
        {isQrModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#03150b] border border-emerald-900/60 rounded-[2.5rem] w-full max-w-lg p-6 overflow-hidden text-center relative max-h-[90vh] flex flex-col"
            >
              <button 
                onClick={() => setIsQrModalOpen(false)}
                className="absolute top-4 right-4 p-2 text-white/50 hover:text-white bg-white/10 rounded-full"
              >
                <X size={18} />
              </button>

              <div className="mt-2 mb-4">
                <h3 className="text-lg font-black text-white">📷 {isBn ? 'স্মার্ট কিউআর স্ক্যান বিবরণী' : 'QR Membership Scanner'}</h3>
                <p className="text-xs text-white/60 mt-1">{isBn ? 'ক্যামেরার সামনে আইডি কার্ডের QR ধরুন অথবা স্ক্যানার ইনপুটে টাইপ করুন।' : 'Position QR card cleanly in front of web camera.'}</p>
              </div>

              {/* Success alert overlay */}
              {qrSuccessFlash && (
                <div className="bg-emerald-500 text-white font-extrabold text-xs py-3 px-4 rounded-xl border border-emerald-400 mb-4 animate-bounce">
                  ✨ {qrSuccessFlash}
                </div>
              )}

              {/* Hardware / manual inputs simulation */}
              <div className="space-y-4 flex-1 overflow-y-auto">
                {/* Physical / simulator barcode entry test */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                    {isBn ? 'ম্যানুয়াল কার্ল আইডি ইনপুট বা স্ক্যানার ডাটা:' : 'Manual Scan / Type Mock Card (e.g. M-1001):'}
                  </label>
                  <input
                    type="text"
                    value={qrInputText}
                    onChange={handleQrInputChange}
                    placeholder="e.g. M-1001"
                    className="w-full bg-emerald-950/20 border border-emerald-900/40 rounded-xl px-4 py-3 font-mono text-center text-sm font-black text-amber-400 outline-none"
                    autoFocus
                  />
                </div>

                {/* Video feed display container */}
                <div className="relative aspect-video rounded-2xl bg-black border border-white/10 overflow-hidden flex items-center justify-center">
                  {cameraActive ? (
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="w-full h-full object-cover rounded-2xl scale-x-[-1]"
                    />
                  ) : (
                    <div className="text-slate-500 font-bold text-xs p-8">
                      {isBn ? 'ক্যামেরা লোড করা হইতেছে...' : 'Camera feed blocked or inactive'}
                    </div>
                  )}
                  {/* Scope lines target pointer overlay */}
                  <div className="absolute inset-x-12 inset-y-8 border-2 border-dashed border-emerald-500/50 rounded-lg pointer-events-none flex items-center justify-center">
                    <div className="w-full h-0.5 bg-red-500/80 animate-pulse" />
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-950/30 rounded-2xl text-[10px] text-slate-400 font-bold text-left leading-normal">
                  💡 {isBn 
                    ? 'গ্রাহক কার্ডে থাকা কিউআর কোড (যেমন: M-1001, M-1002 ইত্যাদি) স্ক্যান বা টাইপ করা মাত্রই সংশ্লিষ্ট মেম্বারকে সরাসরি এই ডাটা এন্ট্রি শিট-এ সংযুক্ত করে নেওয়া হবে।' 
                    : 'Typing or Scanning standard custom card values will append the profile row automatically.'}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: PASTE CSV DATA BLOCK */}
      <AnimatePresence>
        {isExcelModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#03150b] border border-emerald-900/60 rounded-[2.5rem] w-full max-w-xl p-6 relative"
            >
              <button 
                onClick={() => setIsExcelModalOpen(false)}
                className="absolute top-4 right-4 p-2 text-white/50 hover:text-white bg-white/10 rounded-full"
              >
                <X size={18} />
              </button>

              <div className="mt-2 mb-4">
                <h3 className="text-lg font-black text-white">📊 {isBn ? 'স্প্রেডশিট এক্সেল ব্লক আপলোড' : 'Spreadsheet Row Paste Importer'}</h3>
                <p className="text-xs text-white/60 mt-1">{isBn ? 'এক্সেল বা শিট থেকে কন্ট্রিবিউশন কলামগুলো একই সাথে কপি করে এখানে পেস্ট করুন।' : 'Paste multiple rows directly from any spreadsheet document.'}</p>
              </div>

              <div className="space-y-4">
                <textarea 
                  value={excelPasteText}
                  onChange={(e) => setExcelPasteText(e.target.value)}
                  placeholder={isBn 
                    ? "M-1001\t500\nM-1002\t1000\n01711233344\t500" 
                    : "e.g. Code \t Amount \n M-1001 \t 500 \n M-1002 \t 1000"
                  }
                  rows={8}
                  className="w-full bg-emerald-950/20 border border-emerald-900/40 rounded-2xl p-4 font-mono text-xs focus:ring-1 focus:ring-emerald-500 outline-none text-emerald-400 placeholder-slate-600"
                />

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsExcelModalOpen(false)}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/15 text-white font-extrabold rounded-xl text-xs"
                  >
                    {isBn ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={parseExcelPaste}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs shadow-xl shadow-emerald-950/30"
                  >
                    {isBn ? 'ডাটা পার্স করুন' : 'Parse Custom Data'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PRINTABLE RECEIPT MODAL INTEGRATION */}
      {viewingReceipt && (
        <ReceiptModal 
          payment={viewingReceipt} 
          onClose={() => setViewingReceipt(null)} 
        />
      )}

    </div>
  );
}
