/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Receipt, Calendar, User, 
  ArrowUpRight, Download, Printer, Share2, X,
  Edit, Trash2, Check, Upload, QrCode, Save, 
  RefreshCw, FileSpreadsheet, AlertCircle, CheckCircle2,
  Trash, ArrowRight, ShieldCheck, MessageSquare, Info
} from 'lucide-react';
import { usePayments } from '../../hooks/usePayments';
import { useMembers } from '../../hooks/useMembers';
import { useAppContext } from '../../context/AppContext';
import { getImageUrl } from '../../lib/utils';
import PaymentForm from './PaymentForm';
import ReceiptModal from './ReceiptModal';
import { Payment } from '../../types';

// Simple Bangla digits helper
const toBanglaDigitsLocal = (num: number | string): string => {
  const banglaDigits: { [key: string]: string } = {
    '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯'
  };
  return String(num).replace(/[0-9]/g, digit => banglaDigits[digit] || digit);
};

export default function PaymentsList({ defaultSubTab = 'records' }: { defaultSubTab?: 'records' | 'bulk' }) {
  const { t, language, isModerator, isAdmin, settings } = useAppContext();
  const isBn = language === 'bn';

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

  const { payments, loading, deletePayment, addPayment } = usePayments();
  const { members } = useMembers();

  // Active view mode: 'records' (Standard history) or 'bulk' (Premium grid entry)
  const [activeSubTab, setActiveSubTab] = useState<'records' | 'bulk'>(defaultSubTab);

  // Sync state when defaultSubTab changes
  useEffect(() => {
    setActiveSubTab(defaultSubTab);
  }, [defaultSubTab]);

  // Standard History Mode states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<Payment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk Entry Mode states
  const [bulkRows, setBulkRows] = useState<any[]>([]);
  const [autoLoadToggle, setAutoLoadToggle] = useState(true);
  const [bulkSearchTerm, setBulkSearchTerm] = useState('');
  const [activeMonthFilter, setActiveMonthFilter] = useState(() => new Date().toISOString().slice(0, 7)); // default current month
  const [bulkSavingAll, setBulkSavingAll] = useState(false);

  // Modals inside Bulk mode
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrInputText, setQrInputText] = useState('');
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelPasteText, setExcelPasteText] = useState('');
  const [qrSuccessFlash, setQrSuccessFlash] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // Synthesize soft scanner beep
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // Professional scanner beep tone
      gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime); // Soft volume
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1); // Beep for 100ms
    } catch (e) {
      console.warn("Audio Context beep initialization ignored:", e);
    }
  };

  // Pre-populate sheet based on toggle selection
  const initializeBulkRows = () => {
    if (autoLoadToggle && members.length > 0) {
      const activeContributors = members.filter(m => 
        m.status === 'active' && m.includeInMonthlyLedger !== false
      );
      
      const rows = activeContributors.map(m => {
        // Check if member already has a subscription paid for activeMonthFilter
        const existingPayment = payments.find(p => 
          p.memberId === m.id && 
          p.month === activeMonthFilter && 
          (!p.type || p.type === 'SUBSCRIPTION')
        );

        return {
          tempId: `row_${m.id}_${Date.now()}_${Math.random()}`,
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

      // Sort rows based on Member ID or sort order
      rows.sort((a, b) => a.customId.localeCompare(b.customId, undefined, { numeric: true, sensitivity: 'base' }));
      setBulkRows(rows);
    } else {
      setBulkRows([]);
    }
  };

  // Re-run initialization when tab, contribution toggle, or month filter changes
  useEffect(() => {
    if (activeSubTab === 'bulk') {
      initializeBulkRows();
    }
  }, [activeSubTab, autoLoadToggle, activeMonthFilter, members]);

  // Handle single cell input changes
  const updateRowField = (tempId: string, field: string, value: any) => {
    setBulkRows(prev => prev.map(row => {
      if (row.tempId === tempId) {
        // If changing month, check if there's already a payment in database
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

  // Append clicked/found member to table
  const appendMemberToBulk = (member: any) => {
    if (bulkRows.some(row => row.memberId === member.id)) {
      alert(isBn ? `সদস্য "${member.name}" ইতোমধ্যে তালিকায় যুক্ত আছেন!` : `Member "${member.name}" is already in the sheet!`);
      return;
    }

    const existingPayment = payments.find(p => 
      p.memberId === member.id && 
      p.month === activeMonthFilter && 
      (!p.type || p.type === 'SUBSCRIPTION')
    );

    const newRow = {
      tempId: `row_${member.id}_${Date.now()}`,
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

  // Save single row to Firestore
  const handleSaveRow = async (tempId: string) => {
    const row = bulkRows.find(r => r.tempId === tempId);
    if (!row || row.status === 'saved') return;

    // Transition state
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
        remarks: row.note || (isBn ? 'মাসিক চাঁদা এন্ট্রি হাব থেকে সংরক্ষিত' : 'Recorded via Monthly Payment Bulk Center')
      };

      // Call database transaction hook
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
        remarks: row.note || (isBn ? 'মাসিক চাঁদা এন্ট্রি হাব থেকে সংরক্ষিত' : 'Recorded via Monthly Payment Bulk Center'),
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

  // Save all pending rows sequentially (Series loop to avoid transaction race conditions)
  const handleSaveAllRows = async () => {
    const unsavedRows = bulkRows.filter(r => r.status === 'idle' || r.status === 'failed');
    if (unsavedRows.length === 0) {
      alert(isBn ? 'সংরক্ষণ করার মতো কোনো নতুন পেমেন্ট অবশিষ্ট নেই।' : 'No unsaved payments found in active rows.');
      return;
    }

    setBulkSavingAll(true);
    
    for (const row of unsavedRows) {
      // Perform saving step by step
      await handleSaveRow(row.tempId);
    }

    setBulkSavingAll(false);
  };

  // Remove row from spreadsheet tab locally (doesn't delete database record)
  const handleDeleteRowLocally = (tempId: string) => {
    setBulkRows(prev => prev.filter(r => r.tempId !== tempId));
  };

  // Generate WhatsApp Share Link
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

  // Parse Copy-Pasted Excel/CSV block
  const parseExcelPaste = () => {
    if (!excelPasteText.trim()) return;

    const lines = excelPasteText.split('\n').map(l => l.trim()).filter(Boolean);
    let successfullyAddedCount = 0;
    const newRowsToAppend: any[] = [];

    lines.forEach(line => {
      // Split by tab, comma, or semicolon
      const cols = line.split(/[\t,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length === 0) return;

      // Find if any column value matches physical Member ID or phone
      const matchedMember = members.find(m => 
        cols.some(val => 
          val.toLowerCase() === m.memberId.toLowerCase() || 
          val === m.phone ||
          val.toLowerCase() === m.name.toLowerCase()
        )
      );

      if (matchedMember) {
        // Prevent duplicates in active sheet
        if (bulkRows.some(r => r.memberId === matchedMember.id) || newRowsToAppend.some(r => r.memberId === matchedMember.id)) {
          return;
        }

        // Try to identify custom amount. Find a numeric value from columns (excluding search values)
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
          tempId: `row_${matchedMember.id}_excel_${Date.now()}_${Math.random()}`,
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
        ? `কোন সদস্য সনাক্ত করা যায়নি। অনুগ্রহ করে স্প্রেডশিট থেকে রো কপি করে প্রবেশ করুন। (উদা: M-1001 বা মোবাইল নম্বর থাকতে হবে)` 
        : `Could not recognize any valid members. Please paste valid rows containing Member IDs (e.g. M-1001) or phone numbers.`
      );
    }

    setExcelPasteText('');
    setIsExcelModalOpen(false);
  };

  // QR Modal scanner input triggers
  const handleQrInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQrInputText(val);

    // If input matches some member custom ID, process instantly
    const cleanId = val.trim();
    const matched = members.find(m => m.memberId.toLowerCase() === cleanId.toLowerCase());
    if (matched) {
      appendMemberToBulk(matched);
      setQrSuccessFlash(isBn ? `সক্রিয় সদস্য সনাক্ত: ${matched.nameBn || matched.name}` : `Active Member Detected: ${matched.name}`);
      setQrInputText('');
      playBeep();
      
      // Auto-clear success flash
      setTimeout(() => {
        setQrSuccessFlash(null);
      }, 3000);
    }
  };

  // Real Camera scan initialization
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

  // Standard payments search filtering
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const matchesSearch = 
        p.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.memberNameBn && p.memberNameBn.includes(searchTerm)) ||
        p.receiptNo.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;
      
      if (selectedType === 'ALL') return true;
      if (selectedType === 'SUBSCRIPTION') return !p.type || p.type === 'SUBSCRIPTION';
      return p.type === selectedType;
    });
  }, [payments, searchTerm, selectedType]);

  // Suggest matches inside spreadsheet search
  const bulkSearchedMembers = useMemo(() => {
    if (!bulkSearchTerm.trim()) return [];
    return members.filter(m => 
      m.name.toLowerCase().includes(bulkSearchTerm.toLowerCase()) ||
      (m.nameBn && m.nameBn.includes(bulkSearchTerm)) ||
      m.memberId.toLowerCase().includes(bulkSearchTerm.toLowerCase()) ||
      m.phone.includes(bulkSearchTerm)
    ).slice(0, 5);
  }, [members, bulkSearchTerm]);

  // Calculate sum counts
  const totalGridPaid = useMemo(() => {
    return bulkRows.reduce((acc, r) => acc + (r.status === 'saved' ? Number(r.amount) : 0), 0);
  }, [bulkRows]);

  const totalGridDue = useMemo(() => {
    return bulkRows.reduce((acc, r) => acc + (r.status !== 'saved' ? Number(r.amount) : 0), 0);
  }, [bulkRows]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* 1. Header Banner */}
      <div 
        className={`p-6 md:p-8 rounded-3xl ${isThemeLight ? 'text-slate-950' : 'text-white'} shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden`}
        style={{ backgroundColor: settings.themeColor }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <Receipt size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <div className={`inline-flex items-center gap-2 px-3 py-1 ${isThemeLight ? 'bg-black/10 text-slate-950 font-black' : 'bg-white/20 text-white'} rounded-full text-xs font-semibold uppercase tracking-wider`}>
            🪙 {isBn ? 'বাৎসরিক ও মাসিক আদায় খাতা' : 'Payment Registry Hub'}
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            {isBn ? 'সদস্য চাঁদা ও রশিদ ডেক্স' : t.payments}
          </h2>
          <p className={`${isThemeLight ? 'text-slate-800' : 'text-white/85'} text-xs md:text-sm max-w-2xl font-semibold`}>
            {isBn 
              ? `মোট ${toBanglaDigitsLocal(payments.length)} টি সফল আদায়ের রশিদ ডাটাবেসে রিসিভড সংরক্ষিত রয়েছে। মেম্বার লেজার ও ব্যালেন্স অটো আপডেট হবে।` 
              : `A total of ${payments.length} verified monthly contributions registered securely on Cloud.`
            }
          </p>
        </div>
        {isModerator && (
          <div className="z-10 flex flex-wrap gap-2">
            <button 
              type="button"
              onClick={() => setIsFormOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-xl shadow-lg hover:scale-[1.02] transform transition-all text-xs cursor-pointer"
            >
              <Plus size={16} />
              {isBn ? 'একক জমা রশিদ' : 'Add Single Payment'}
            </button>
          </div>
        )}
      </div>

      {/* 2. Premium Grid Mode Toggle Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/5 p-3 rounded-2xl border border-white/10">
        <div className="flex bg-slate-150 p-1 rounded-xl w-fit gap-1">
          <button
            onClick={() => setActiveSubTab('records')}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'records'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
            }`}
          >
            📋 {isBn ? 'রশিদ ও খতিয়ান তালিকা' : 'Recipient Record Logs'}
          </button>
          <button
            onClick={() => setActiveSubTab('bulk')}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'bulk'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
            }`}
          >
            ⚡ {isBn ? 'চাঁদা এন্ট্রি হাব (Bulk Grid)' : 'Monthly Entry Hub (Grid)'}
          </button>
        </div>

        {/* Access Restriction Warning */}
        {!isModerator && activeSubTab === 'bulk' && (
          <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-1.5 text-xs text-rose-400">
            <Info size={14} />
            <span>{isBn ? 'শুধুমাত্র অনুমোদিত কালেকশন ম্যানেজার এন্ট্রি করতে পারবেন!' : 'Only authorized Managers can save entries!'}</span>
          </div>
        )}
      </div>


      {/* VIEW A: Standard Payment Records */}
      {activeSubTab === 'records' && (
        <div className="space-y-6">
          {/* Search Bar & Filters */}
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder={t.search + ' by Name, Mobile or Receipt...'} 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none text-slate-700 font-medium"
                />
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex flex-wrap gap-2 pb-1 overflow-x-auto scrollbar-hide">
              {[
                { id: 'ALL', labelBn: 'সব জমার খতিয়ান', labelEn: 'All Receipts' },
                { id: 'SUBSCRIPTION', labelBn: 'মাসিক চাঁদা', labelEn: 'Subscription' },
                { id: 'ADMISSION', labelBn: 'ভর্তি ফি', labelEn: 'Entrance / Admission' },
                { id: 'DONATION', labelBn: 'বিশেষ অনুদান', labelEn: 'Donations' },
                { id: 'OTHER', labelBn: 'অন্যান্য ফান্ড', labelEn: 'Other Funds' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedType(tab.id)}
                  className={`px-4 py-2.5 text-xs font-black rounded-xl border transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                    selectedType === tab.id
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-100/50'
                      : 'bg-white text-slate-600 border-slate-150 hover:bg-slate-50'
                  }`}
                >
                  {isBn ? tab.labelBn : tab.labelEn}
                </button>
              ))}
            </div>
          </div>

          {/* Payments History List */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden text-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.receipt}</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.name}</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.amount}</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.month}</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredPayments.map((payment) => (
                    <tr 
                      key={payment.id} 
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => setViewingReceipt(payment)}
                    >
                      <td className="px-6 py-4">
                        <span className="text-emerald-700 text-xs font-black">
                          #{payment.receiptNo || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl overflow-hidden bg-emerald-100 flex items-center justify-center text-emerald-600 font-black text-sm shrink-0 border-2 border-white shadow-sm">
                            {getImageUrl(members.find(m => m.id === payment.memberId)?.photoURL) ? (
                              <img 
                                src={getImageUrl(members.find(m => m.id === payment.memberId)?.photoURL)} 
                                alt="" 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              payment.memberName[0]
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900 leading-tight">
                              {isBn ? (payment.memberNameBn || payment.memberName) : payment.memberName}
                            </p>
                            <span className="text-[10px] text-slate-500 font-mono tracking-wider">
                              ID: {members.find(m => m.id === payment.memberId)?.memberId || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-emerald-600 font-black text-sm">
                          ৳ {payment.amount.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
                          <Calendar size={14} className="text-slate-300" />
                          {isBn ? toBanglaDigitsLocal(payment.month) : payment.month}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => setViewingReceipt(payment)}
                            className="p-1 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-black uppercase"
                          >
                            <Receipt size={12} />
                            {isBn ? 'রশিদ' : 'Receipt'}
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => setEditingPayment(payment)}
                                className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-all cursor-pointer active:scale-90"
                                title={isBn ? 'সম্পাদনা করুন' : 'Edit Payment'}
                              >
                                <Edit size={14} strokeWidth={2.5} />
                              </button>
                              <button
                                onClick={() => setPaymentToDelete(payment)}
                                className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all cursor-pointer active:scale-90"
                                title={isBn ? 'ডিলিট করুন' : 'Delete Payment'}
                              >
                                <Trash2 size={14} strokeWidth={2.5} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPayments.length === 0 && !loading && (
                <div className="p-12 text-center text-slate-500">
                  <p className="text-sm font-bold">{isBn ? 'কোন পেমেন্ট রেকর্ড পাওয়া যায়নি' : 'No payment transaction logs synchronized.'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* VIEW B: Premium Monthly Bulk Payment Grid */}
      {activeSubTab === 'bulk' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          
          {/* Action Row widgets */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Box 1: Real-time Member Search / Addition */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 relative overflow-hidden flex flex-col justify-between">
              <div className="mb-4">
                <span className="text-[10px] font-black tracking-widest text-[#d97706] uppercase block mb-1">🚀 Search & Append</span>
                <h4 className="text-base font-black text-white">{isBn ? 'সদস্য তালিকা হতে খুঁজুন' : 'Quick Lookup & Add Row'}</h4>
                <p className="text-xs text-white/60 mt-1">{isBn ? 'খুঁজে নিয়ে সাথে সাথে স্প্রেডশিটে যুক্ত করুন।' : 'Find any member and append row.'}</p>
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" size={16} />
                <input 
                  type="text"
                  placeholder={isBn ? 'নাম, আইডি বা মোবাইল নং...' : 'Lookup name, custom ID or mobile...'}
                  value={bulkSearchTerm}
                  onChange={(e) => setBulkSearchTerm(e.target.value)}
                  className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-white"
                />

                {/* Dropdown Suggestions */}
                {bulkSearchTerm.trim() && (
                  <div className="absolute left-0 right-0 top-full mt-2 bg-[#021c10] border border-emerald-950 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-emerald-900/40">
                    {bulkSearchedMembers.map(m => (
                      <button
                        key={m.id}
                        onClick={() => {
                          appendMemberToBulk(m);
                          setBulkSearchTerm('');
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-emerald-900/30 transition-all flex items-center justify-between group"
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

            {/* Box 2: QR Scanner / Simulator Trigger Card */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 flex flex-col justify-between">
              <div className="mb-4">
                <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase block mb-1">📷 QR Code Scan</span>
                <h4 className="text-base font-black text-white">{isBn ? 'কিউআর কোড স্ক্যানার' : 'QR Scan Member Card'}</h4>
                <p className="text-xs text-white/60 mt-1">{isBn ? 'গ্রাহকের আইডি কার্ডের QR রিড করে দ্রুত এন্ট্রি দিন।' : 'Scan ID cards directly using webcam or physical scanner.'}</p>
              </div>

              <button
                onClick={() => setIsQrModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-emerald-950/20 hover:scale-[1.02] transform transition-all text-xs"
              >
                <QrCode size={16} />
                <span>{isBn ? 'স্ক্যানার ও ক্যামেরা চালু করুন' : 'Launch Scanner'}</span>
              </button>
            </div>

            {/* Box 3: Spreadsheet Upload Card */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 flex flex-col justify-between">
              <div className="mb-4">
                <span className="text-[10px] font-black tracking-widest text-[#d97706] uppercase block mb-1">📊 Excel Data Sync</span>
                <h4 className="text-base font-black text-white">{isBn ? 'বাল্ক স্প্রেডশিট আপলোড' : 'Excel/CSV Bulk Import'}</h4>
                <p className="text-xs text-white/60 mt-1">{isBn ? 'এক্সেল বা স্প্রেডশিট হতে কপি-পেস্ট করে মেম্বার লোড করুন।' : 'Copy-paste columns directly from excel block to table.'}</p>
              </div>

              <button
                onClick={() => setIsExcelModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 text-slate-900 font-bold rounded-2xl shadow-lg hover:scale-[1.02] transform transition-all text-xs"
              >
                <Upload size={16} className="text-emerald-700" />
                <span>{isBn ? 'স্প্রেডশিট ডাটা পেস্ট করুন' : 'Excel Copy-Paste Import'}</span>
              </button>
            </div>

          </div>

          {/* Table Header Configurations: Month and Filter Toggles */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/5 p-4 rounded-3xl border border-white/10">
            
            {/* Filter 1: Active Month Target Selector */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-white/70">{isBn ? 'টার্গেট আদায় মাস:' : 'Target Month:'}</span>
              <input 
                type="month"
                value={activeMonthFilter}
                onChange={(e) => setActiveMonthFilter(e.target.value)}
                className="bg-emerald-950/40 border border-emerald-900/50 rounded-xl px-4 py-2 font-mono text-xs font-black text-amber-500 outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Filter 2: Monthly subscription toggle */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-white/70">
                {isBn ? 'শুধুমাত্র রেগুলার চাঁদা প্রদানকারী লোড করুন:' : 'Auto load regular subscribers only:'}
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
              <span className={`text-xs font-black uppercase ${autoLoadToggle ? 'text-emerald-400' : 'text-slate-400'}`}>
                {autoLoadToggle ? (isBn ? 'সক্রিয়' : 'ON') : (isBn ? 'ইন-অ্যাক্টিভ' : 'OFF')}
              </span>
            </div>

            {/* Sync Re-initialize indicator */}
            <button
              onClick={initializeBulkRows}
              className="text-[10px] font-black uppercase tracking-wider text-white/60 hover:text-white px-3 py-2 border border-white/10 rounded-xl flex items-center gap-1 hover:bg-emerald-950"
              title={isBn ? 'রিস্টার্ট ডাটা' : 'Reload state'}
            >
              <RefreshCw size={12} />
              {isBn ? 'রিলোড' : 'Reload'}
            </button>
          </div>

          {/* Mega Editable Ledger Table */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden text-slate-900">
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center w-12">#</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{isBn ? 'মেম্বার নাম ও আইডি' : 'Member & ID'}</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{isBn ? 'মোবাইল নম্বর' : 'Mobile'}</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">{isBn ? 'টার্গেট মাস' : 'Month'}</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest w-32">{isBn ? 'আদায় পরিমাণ ৳' : 'Amount ৳'}</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest w-40">{isBn ? 'তারিখ' : 'Date'}</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{isBn ? 'মন্তব্য' : 'Remarks'}</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">{isBn ? 'অ্যাকশন' : 'Status / Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {bulkRows.map((row, index) => (
                    <tr 
                      key={row.tempId}
                      className={`transition-colors ${
                        row.status === 'saved' ? 'bg-emerald-50/40 hover:bg-emerald-50/60' :
                        row.status === 'failed' ? 'bg-red-50/20 hover:bg-red-50/30' :
                        'hover:bg-slate-50/40'
                      }`}
                    >
                      {/* Index Column */}
                      <td className="px-4 py-3.5 text-center font-bold text-slate-400">
                        {isBn ? toBanglaDigitsLocal(index + 1) : index + 1}
                      </td>

                      {/* Member Info */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-emerald-100 flex items-center justify-center text-emerald-600 font-black shrink-0 border border-white">
                            {row.name[0]}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 truncate max-w-[150px]">
                              {isBn ? (row.nameBn || row.name) : row.name}
                            </p>
                            <span className="text-[9px] font-mono font-black text-rose-500 uppercase">
                              #{row.customId}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Mobile phone number */}
                      <td className="px-4 py-3.5 font-mono text-slate-500 text-[11px]">
                        {row.phone || (isBn ? 'নেই' : 'None')}
                      </td>

                      {/* Select Target Month Dropdown */}
                      <td className="px-4 py-3.5 text-center">
                        <input 
                          type="month"
                          value={row.selectedMonth}
                          disabled={row.status === 'saved'}
                          onChange={(e) => updateRowField(row.tempId, 'selectedMonth', e.target.value)}
                          className="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-bold text-slate-700 focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </td>

                      {/* Editable Amount */}
                      <td className="px-4 py-3.5 text-slate-800">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-sans">৳</span>
                          <input 
                            type="number"
                            min="1"
                            value={row.amount}
                            disabled={row.status === 'saved'}
                            onChange={(e) => updateRowField(row.tempId, 'amount', Number(e.target.value))}
                            className="bg-slate-100 border border-slate-205 rounded-lg pl-6 pr-2 py-1.5 font-bold text-slate-800 focus:ring-1 focus:ring-emerald-500 outline-none w-24 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>
                      </td>

                      {/* Date selection picker */}
                      <td className="px-4 py-3.5 text-slate-800">
                        <input 
                          type="date"
                          value={row.paymentDate}
                          disabled={row.status === 'saved'}
                          onChange={(e) => updateRowField(row.tempId, 'paymentDate', e.target.value)}
                          className="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-bold text-slate-700 focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </td>

                      {/* Optional Note */}
                      <td className="px-4 py-3.5 text-slate-800">
                        <input 
                          type="text"
                          placeholder={isBn ? 'ঐচ্ছিক মন্তব্য...' : 'Optional comment...'}
                          value={row.note}
                          disabled={row.status === 'saved'}
                          onChange={(e) => updateRowField(row.tempId, 'note', e.target.value)}
                          className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 placeholder-slate-400 focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </td>

                      {/* Row status and triggers */}
                      <td className="px-4 py-3.5 text-right w-fit">
                        <div className="flex items-center justify-end gap-2">
                          
                          {/* Saved state dashboard */}
                          {row.status === 'saved' && (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 text-[9px] font-black font-sans px-2 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg uppercase">
                                <Check size={12} strokeWidth={3} />
                                {isBn ? 'সফল জমা' : 'PAID'}
                              </span>
                              
                              {/* Open printable receipt */}
                              {row.savedPaymentObj && (
                                <button
                                  onClick={() => setViewingReceipt(row.savedPaymentObj)}
                                  className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
                                  title={isBn ? 'রশিদ ডাউনলোড' : 'Download receipt'}
                                >
                                  <Receipt size={14} />
                                </button>
                              )}

                              {/* WhatsApp Direct Share */}
                              {row.phone && row.savedPaymentObj && (
                                <a
                                  href={getWhatsAppShareUrl(row)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition-colors border border-emerald-200 flex items-center justify-center"
                                  title={isBn ? 'হোয়াটসঅ্যাপে রশিদ পাঠান' : 'Send receipt via WhatsApp'}
                                >
                                  <MessageSquare size={14} className="fill-emerald-800/20" />
                                </a>
                              )}
                            </div>
                          )}

                          {/* Saving loader */}
                          {row.status === 'saving' && (
                            <div className="flex items-center gap-2">
                              <RefreshCw size={14} className="text-amber-500 animate-spin" />
                              <span className="text-[10px] font-bold text-amber-500 pr-1">{isBn ? 'সেভ হচ্ছে...' : 'Saving...'}</span>
                            </div>
                          )}

                          {/* Error block */}
                          {row.status === 'failed' && (
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold text-red-500" title={row.errorMessage}>{isBn ? 'ব্যর্থ!' : 'Sync Failed!'}</span>
                              <button
                                onClick={() => handleSaveRow(row.tempId)}
                                className="p-1.5 bg-red-100 text-red-600 rounded-lg"
                              >
                                <RefreshCw size={12} />
                              </button>
                            </div>
                          )}

                          {/* Idle actionable buttons */}
                          {row.status === 'idle' && (
                            <div className="flex items-center gap-1.5">
                              {isModerator ? (
                                <button
                                  onClick={() => handleSaveRow(row.tempId)}
                                  className="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-[9px] font-black uppercase flex items-center gap-1 cursor-pointer"
                                >
                                  <Check size={11} strokeWidth={2.5} />
                                  {isBn ? 'জমা করুন' : 'Confirm'}
                                </button>
                              ) : (
                                <span className="text-[9px] text-slate-400 italic">{isBn ? 'ইন-অ্যাক্টিভ' : 'Idle'}</span>
                              )}
                              
                              <button
                                onClick={() => handleDeleteRowLocally(row.tempId)}
                                className="p-1.5 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg"
                                title={isBn ? 'তালিকা থেকে বাদ দিন' : 'Remove row'}
                              >
                                <Trash size={13} />
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
                <div className="p-20 text-center text-slate-400">
                  <FileSpreadsheet size={48} className="mx-auto mb-4 text-slate-300 stroke-1" />
                  <p className="font-bold text-slate-500">{isBn ? 'চাঁদা প্রদানের জন্য কোনো সক্রিয় সদস্য লোড করা নেই' : 'No target contribution members initialized.'}</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                    {isBn 
                      ? 'পেমেন্ট এন্ট্রি শুরু করার জন্য কিউআর স্ক্যান করুন, সদস্য ব্যাকপ্যানেল খুঁজুন অথবা উপরে টগলটি অন করুন।' 
                      : 'To get started, switch on auto-load billing or manually lookup members above.'
                    }
                  </p>
                </div>
              )}
            </div>

            {/* Table Footer Stats Summary Bar */}
            {bulkRows.length > 0 && (
              <div className="bg-slate-50/80 p-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 font-bold text-slate-700">
                
                <div className="flex flex-wrap items-center gap-6 text-xs font-semibold">
                  <div>
                    {isBn ? 'মোট লোড মেম্বার:' : 'Total Loaded Rows:'}{' '}
                    <span className="text-slate-900 font-black">{isBn ? toBanglaDigitsLocal(bulkRows.length) : bulkRows.length} জন</span>
                  </div>
                  <div>
                    {isBn ? 'মোট সফল জমার পরিমাণ:' : 'Saved Sum:'}{' '}
                    <span className="text-emerald-600 font-extrabold">৳{isBn ? toBanglaDigitsLocal(totalGridPaid.toLocaleString()) : totalGridPaid.toLocaleString()}</span>
                  </div>
                  <div>
                    {isBn ? 'অবশিষ্ট জমার পরিমাণ:' : 'Pending Sync Sum:'}{' '}
                    <span className="text-amber-600 font-extrabold">৳{isBn ? toBanglaDigitsLocal(totalGridDue.toLocaleString()) : totalGridDue.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Append empty custom entry row helper */}
                  <button
                    onClick={() => {
                      if (members.length > 0) appendMemberToBulk(members[0]);
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-black uppercase rounded-xl transition-all border border-slate-200"
                  >
                    + {isBn ? 'নতুুন রো যুক্ত করুন' : 'Add Custom Row'}
                  </button>

                  {/* Mass Submit Trigger */}
                  {isModerator && (
                    <button
                      onClick={handleSaveAllRows}
                      disabled={bulkSavingAll || bulkRows.filter(r => r.status === 'idle' || r.status === 'failed').length === 0}
                      className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-xl shadow-lg shadow-emerald-100/50 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      {bulkSavingAll ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>{isBn ? 'সেভ করা হচ্ছে...' : 'Saving All Payments...'}</span>
                        </>
                      ) : (
                        <>
                          <Save size={14} />
                          <span>{isBn ? 'সব চাঁদা সেভ করুন' : 'Save All Payments'}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

              </div>
            )}

          </div>

          {/* Premium Bottom Features Board */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { titleBn: "অটো লেজার আপডেট", textBn: "রিসিভ ডাটা সাথে সাথে বাৎসরিক লেজারে সিঙ্ক হবে।", icon: "✨" },
              { titleBn: "বকেয়া অটো আপডেট", textBn: "সদস্যের পেমেন্ট আদায়ের পর বকেয়া হিসাব স্বয়ংক্রিয়ভাবে বিয়োগ হবে।", icon: "📊" },
              { titleBn: "রশিদ জেনারেটর", textBn: "প্রতিটি পেমেন্টের জন্য প্রিন্ট ও ফিট-টু-স্ক্রিন পিডিএফ ডাউনলোড রশিদ রেডি।", icon: "🧾" },
              { titleBn: "হোয়াটসঅ্যাপ নোটিফিকেশন", textBn: "পেমেন্ট রেকর্ড জমার পর সরাসরি মেম্বারকে হোয়াটসঅ্যাপ এসএমএস রশিদ পাঠান।", icon: "💬" },
              { titleBn: "অফলাইন লোকাল সিকিউরিটি", textBn: "সার্ভার ডিসকানেক্টের সময় অফলাইনে ক্যাশ জমার ট্র্যাকিং সংরক্ষিত রাখতে পারে।", icon: "🛡️" }
            ].map((f, i) => (
              <div key={i} className="bg-white/5 border border-white/5 shadow-inner p-4 rounded-3xl flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">{f.icon}</span>
                <div>
                  <h5 className="text-[11px] font-black text-emerald-400 capitalize">{f.titleBn}</h5>
                  <p className="text-[10px] text-white/55 mt-1 leading-normal">{f.textBn}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}


      {/* MODAL 1: Physical Scan / camera scanner Simulation Box */}
      <AnimatePresence>
        {isQrModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsQrModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.9, y: 100, opacity: 0 }} 
              animate={{ scale: 1, y: 0, opacity: 1 }} 
              exit={{ scale: 0.9, y: 100, opacity: 0 }}
              className="relative w-full max-w-lg bg-[#02180e] rounded-[2.5rem] p-6 shadow-2xl border border-emerald-900 overflow-hidden text-center text-white"
            >
              <button 
                onClick={() => setIsQrModalOpen(false)}
                className="absolute right-5 top-5 p-2 bg-white/10 hover:bg-white/25 rounded-full text-white transition-all"
              >
                <X size={16} />
              </button>

              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                <QrCode size={22} />
              </div>

              <h4 className="text-lg font-black text-white">{isBn ? 'কিউআর কোড স্ক্যানার সক্রিয়' : 'Webcam Scanner Active'}</h4>
              <p className="text-xs text-white/60 mt-1">
                {isBn 
                  ? 'গ্রাহকের কিউআর আইডি রেডি করুন। ফিজিক্যাল বারকোড স্ক্যানার দিয়ে স্ক্যান করলেও মেম্বার এখানে অটোমেটিক লোড হবে।' 
                  : 'Align QR element code within standard grid framework capture or connect keyboard scanner.'
                }
              </p>

              {/* Glowing camera stream scanner window */}
              <div className="relative w-64 h-64 mx-auto my-6 border-4 border-emerald-500 rounded-3xl overflow-hidden shadow-2xl shadow-emerald-950">
                {/* Laser scan line animation */}
                <div className="absolute left-0 right-0 h-1 bg-rose-500 animate-[bounce_2s_infinite] shadow-[0_0_8px_rgba(239,68,68,1)] z-10" />
                
                {cameraActive ? (
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-[1.03]" />
                ) : (
                  <div className="w-full h-full bg-[#010b06] flex flex-col items-center justify-center text-center p-4">
                    <QrCode size={40} className="text-white/20 animate-pulse mb-2" />
                    <span className="text-[10px] text-white/40">{isBn ? 'ক্যামেরা স্ট্রিম প্রস্তুত হচ্ছে...' : 'Loading Camera Viewfinder...'}</span>
                  </div>
                )}
              </div>

              {/* Flash Alert */}
              {qrSuccessFlash && (
                <div className="bg-emerald-500 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs mx-auto mb-4 max-w-sm shadow-lg border border-emerald-400 animate-bounce">
                  🎉 {qrSuccessFlash}
                </div>
              )}

              {/* Physical/Keyboard Barcode Scanner Simulation Input Receiver (Crucial!) */}
              <div className="max-w-xs mx-auto mb-6">
                <label className="block text-[10px] text-[#d97706] font-black uppercase tracking-wider mb-2">
                  {isBn ? '🔌 ফিজিক্যাল স্ক্যানার কানেকশন পোর্ট (হ্যান্ডহেল্ড):' : '🔌 Handheld Hardware Barcode Scanner Interface:'}
                </label>
                <input 
                  type="text"
                  autoFocus
                  placeholder={isBn ? 'আইডি স্ক্যান করুন...' : 'Ready for barcode input...'}
                  value={qrInputText}
                  onChange={handleQrInputChange}
                  className="w-full text-center bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono font-bold focus:ring-2 focus:ring-emerald-500 outline-none text-white placeholder-slate-500"
                />
                <span className="text-[9px] text-white/50 block mt-1">
                  {isBn ? 'স্ক্যানার কিউআর রিড করলে সংখ্যা ও এন্টার অটো জেনারেট করে।' : 'Physical guns emit string along with Enter carriage.'}
                </span>
              </div>

              {/* Quick Click Demo testing shortcuts */}
              <div className="border-t border-white/10 pt-4 text-left">
                <span className="text-[10px] text-[#d97706] font-black uppercase tracking-wider block mb-2">{isBn ? '⚡ ডেমো স্ক্যান (বাটন টেস্ট):' : '⚡ Quick Test Simulation Buttons:'}</span>
                <div className="flex flex-wrap gap-2 justify-center max-h-24 overflow-y-auto">
                  {members.slice(0, 8).map(m => (
                    <button
                      key={m.id}
                      onClick={() => {
                        appendMemberToBulk(m);
                        setQrSuccessFlash(isBn ? `সনাক্ত: ${m.nameBn || m.name}` : `Active Detected: ${m.name}`);
                        setTimeout(() => setQrSuccessFlash(null), 3000);
                      }}
                      className="px-2.5 py-1.5 bg-white/5 hover:bg-emerald-900/40 text-white/80 rounded-lg text-[10px] font-bold border border-white/5 transition-all"
                    >
                      Scan {m.memberId}
                    </button>
                  ))}
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* MODAL 2: Excel / CSV Import Paste Modality */}
      <AnimatePresence>
        {isExcelModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsExcelModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.9, y: 100, opacity: 0 }} 
              animate={{ scale: 1, y: 0, opacity: 1 }} 
              exit={{ scale: 0.9, y: 100, opacity: 0 }}
              className="relative w-full max-w-xl bg-[#02180e] rounded-[2.5rem] p-6 shadow-2xl border border-emerald-900 overflow-hidden text-white"
            >
              <button 
                onClick={() => setIsExcelModalOpen(false)}
                className="absolute right-5 top-5 p-2 bg-white/10 hover:bg-white/25 rounded-full text-white transition-all"
              >
                <X size={16} />
              </button>

              <div className="w-12 h-12 bg-[#d97706]/10 text-[#d97706] rounded-full flex items-center justify-center mx-auto mb-4 border border-[#d97706]/20">
                <FileSpreadsheet size={22} />
              </div>

              <h4 className="text-lg font-black text-white">{isBn ? 'এক্সেল / গুগল শিট ডাটা ইম্পোর্ট' : 'Excel / Sheet Batch Import'}</h4>
              <p className="text-xs text-white/60 mt-1">
                {isBn 
                  ? 'আপনার এক্সেল ফাইলে যে রো কপি করেছেন (মেম্বার আইডি এবং সংখ্যা), তা সরাসরি নিচের উইন্ডোতে পেস্ট করুন।' 
                  : 'Directly paste columns copied from worksheets into text area bellow. Columns are parsed automatically.'
                }
              </p>

              <div className="my-5">
                <textarea
                  rows={8}
                  value={excelPasteText}
                  onChange={(e) => setExcelPasteText(e.target.value)}
                  placeholder={isBn ? "উদা:\nM-1001\t1000\nM-1002\t500\n01800-000000\t1000" : "Examples:\nM-1001\t1000\nM-1002\t500\nHazid\t1000"}
                  className="w-full bg-[#010905] border border-emerald-900/50 rounded-2xl p-4 font-mono text-xs text-emerald-400 outline-none focus:ring-1 focus:ring-emerald-500 placeholder-emerald-950/70"
                />
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setIsExcelModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[11px] font-black uppercase transition-all"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  onClick={parseExcelPaste}
                  className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[11px] font-black uppercase transition-all shadow-lg"
                >
                  {isBn ? 'মেম্বার ডাটা লোড করুন' : 'Load and Parse rows'}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Modal configurations standard inside PaymentsList */}
      <AnimatePresence>
        {isFormOpen && (
          <PaymentForm onClose={() => setIsFormOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingPayment && (
          <PaymentForm 
            initialData={editingPayment} 
            onClose={() => setEditingPayment(null)} 
            />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewingReceipt && (
          <ReceiptModal 
            payment={viewingReceipt} 
            onClose={() => setViewingReceipt(null)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {paymentToDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setPaymentToDelete(null)}
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
                {isBn ? 'আদায় রসিদটি মুছে ফেলতে চান?' : 'Are you sure you want to delete?'}
              </h3>
              
              <p className="text-slate-500 text-xs font-bold mb-6">
                {isBn 
                  ? `আপনি কি নিশ্চিত যে "${paymentToDelete.memberNameBn || paymentToDelete.memberName}" এর ${paymentToDelete.receiptNo} রশিদ নং এর ৳ ${paymentToDelete.amount.toLocaleString()} পেমেন্টটি ডিলিট করতে চান?`
                  : `Are you sure you want to delete payment of ৳ ${paymentToDelete.amount.toLocaleString()} (Receipt: ${paymentToDelete.receiptNo}) from ${paymentToDelete.memberName}?`
                }
              </p>
              
              <div className="flex gap-4">
                <button
                  onClick={() => setPaymentToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  onClick={async () => {
                    setIsDeleting(true);
                    try {
                      await deletePayment(
                        paymentToDelete.id,
                        paymentToDelete.amount,
                        paymentToDelete.memberId,
                        paymentToDelete.memberName
                      );
                      setPaymentToDelete(null);
                    } catch (err: any) {
                      console.error("Delete failed:", err);
                      alert(isBn 
                        ? 'ডিলিট করতে ব্যর্থ হয়েছে। দয়া করে আবার চেষ্টা করুন।' 
                        : 'Deletion failed. Please try again.'
                      );
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  disabled={isDeleting}
                  className="flex-1 px-6 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-red-100 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <span className="animate-pulse">{isBn ? 'মুছে ফেলা হচ্ছে...' : 'Deleting...'}</span>
                  ) : (
                    <>{isBn ? 'নিশ্চিত ডিলিট' : 'Confirm Delete'}</>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
