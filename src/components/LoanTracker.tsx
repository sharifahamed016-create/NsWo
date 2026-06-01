/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Trash2, Calendar, FileText, CheckCircle, Clock, 
  MapPin, Users, Edit, BookOpen, AlertCircle, Sparkles, Download, MessageSquare,
  DollarSign, TrendingUp, HelpCircle, Activity, ChevronRight, UserPlus, ArrowRightLeft, Percent, ClipboardList
} from 'lucide-react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAppContext } from '../context/AppContext';
import { logActivity } from '../lib/activity';

interface RepaymentEntry {
  date: string;
  amount: number;
  receiver: string;
  receiptNo: string;
}

interface Loan {
  id: string;
  memberId: string; // NSWO-004 etc
  borrowerName: string;
  borrowerNameBn: string;
  phone: string;
  issueDate: string;
  targetReturnDate: string;
  amount: number;
  repaidAmount: number;
  status: 'active' | 'partially_repaid' | 'fully_repaid' | 'overdue';
  remarks?: string;
  repayments: RepaymentEntry[];
  createdAt: number;
}

export default function LoanTracker() {
  const { language, isModerator, settings } = useAppContext();
  
  const [loans, setLoans] = useState<Loan[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_loans');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(true);

  // Global Community Qard-al-Hasanah Welfare Pool Size
  const totalFundPoolSize = 250000; // 2.5 Lakh taka welfare capital

  // Form states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [selectedLoanForRepay, setSelectedLoanForRepay] = useState<Loan | null>(null);

  // New Loan Form
  const [formLoan, setFormLoan] = useState({
    memberId: '',
    borrowerName: '',
    borrowerNameBn: '',
    phone: '',
    issueDate: new Date().toISOString().split('T')[0],
    targetReturnDate: new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0], // 60 days default
    amount: '',
    remarks: ''
  });

  // New Repayment Form
  const [repayAmount, setRepayAmount] = useState('');
  const [repayDate, setRepayDate] = useState(new Date().toISOString().split('T')[0]);
  const [repayReceiver, setRepayReceiver] = useState('');
  const [repayReceiptNo, setRepayReceiptNo] = useState('');

  // Load from Firestore
  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'loans'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Loan[];
        setLoans(data);
        localStorage.setItem('nswo_loans', JSON.stringify(data));
      } catch (err) {
        console.warn("Exception parsing loans:", err);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'loans');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleAddLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLoan.borrowerName || !formLoan.amount) return;

    const principal = parseFloat(formLoan.amount);
    const localId = `local_loan_${Date.now()}`;
    const newLoan: Loan = {
      id: localId,
      memberId: formLoan.memberId.toUpperCase().trim() || 'N/A',
      borrowerName: formLoan.borrowerName,
      borrowerNameBn: formLoan.borrowerNameBn || formLoan.borrowerName,
      phone: formLoan.phone,
      issueDate: formLoan.issueDate,
      targetReturnDate: formLoan.targetReturnDate,
      amount: principal,
      repaidAmount: 0,
      status: 'active',
      remarks: formLoan.remarks,
      repayments: [],
      createdAt: Date.now()
    };

    const updated = [newLoan, ...loans];
    setLoans(updated);
    try {
      localStorage.setItem('nswo_loans', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'loan_add',
      `Issued Qard-al-Hasanah loan of ৳${principal} to ${newLoan.borrowerName}`,
      `নলতা/নাছিরটেক কল্যাণ তহবিল থেকে '${newLoan.borrowerNameBn}' কে কর্জে হাসানা বাবদ ৳${principal} ও ঋণ প্রদান অনুমোদন করা হয়েছে।`
    ).catch(() => {});

    setIsAddOpen(false);

    // Reset Form
    setFormLoan({
      memberId: '',
      borrowerName: '',
      borrowerNameBn: '',
      phone: '',
      issueDate: new Date().toISOString().split('T')[0],
      targetReturnDate: new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0],
      amount: '',
      remarks: ''
    });

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return;
    }

    try {
      const dbLoan = { ...newLoan };
      delete (dbLoan as any).id;
      await addDoc(collection(db, 'loans'), dbLoan);
    } catch (err) {
      console.warn("Firestore error adding loan:", err);
    }
  };

  const handleRepaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoanForRepay || !repayAmount) return;

    const rAmount = parseFloat(repayAmount);
    const logEntry: RepaymentEntry = {
      date: repayDate,
      amount: rAmount,
      receiver: repayReceiver || 'NSWO Office',
      receiptNo: repayReceiptNo || `REPAY-${Date.now().toString().slice(-6)}`
    };

    const totalRepaidNow = Math.min(selectedLoanForRepay.repaidAmount + rAmount, selectedLoanForRepay.amount);
    let newStatus: Loan['status'] = 'partially_repaid';
    if (totalRepaidNow >= selectedLoanForRepay.amount) {
      newStatus = 'fully_repaid';
    }

    const updatedRepayments = [...selectedLoanForRepay.repayments, logEntry];

    const updated = loans.map(l => l.id === selectedLoanForRepay.id ? { 
      ...l, 
      repaidAmount: totalRepaidNow,
      repayments: updatedRepayments,
      status: newStatus 
    } : l);

    setLoans(updated);
    try {
      localStorage.setItem('nswo_loans', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'loan_repay',
      `Recorded repayment check of ৳${rAmount} by borrower ${selectedLoanForRepay.borrowerName}`,
      `${selectedLoanForRepay.borrowerNameBn} এর কর্জে হাসানা খাতের কিস্তি বাবদ ৳${rAmount} আদায় জমা রেকর্ড করা হয়েছে। রসিদ নং: ${logEntry.receiptNo}`
    ).catch(() => {});

    setIsRepayOpen(false);
    setRepayAmount('');
    setRepayReceiver('');
    setRepayReceiptNo('');
    setSelectedLoanForRepay(null);

    if (selectedLoanForRepay.id.startsWith('local_loan_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      const docRef = doc(db, 'loans', selectedLoanForRepay.id);
      await updateDoc(docRef, {
        repaidAmount: totalRepaidNow,
        repayments: updatedRepayments,
        status: newStatus
      });
    } catch (err) {
      console.warn("Firestore error updating loan repayment:", err);
    }
  };

  const handleDeleteLoan = async (id: string) => {
    const confirmMsg = language === 'bn' ? 'কর্জে হাসানা ঋণ রেকর্ডটি মুছে ফেলতে চান?' : 'Are you sure you want to delete this Mutual Aid loan registry row?';
    if (!window.confirm(confirmMsg)) return;

    const filtered = loans.filter(l => l.id !== id);
    setLoans(filtered);
    try {
      localStorage.setItem('nswo_loans', JSON.stringify(filtered));
    } catch {}

    if (id.startsWith('local_loan_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'loans', id));
    } catch (err) {
      console.warn("Firestore delete failed:", err);
    }
  };

  // Pools computations
  const totals = useMemo(() => {
    let borrowed = 0;
    let recovered = 0;
    loans.forEach(l => {
      borrowed += l.amount;
      recovered += l.repaidAmount;
    });

    const netActiveLent = borrowed - recovered;
    const remainingInHandPool = totalFundPoolSize - netActiveLent;

    return { borrowed, recovered, netActiveLent, remainingInHandPool };
  }, [loans]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Banner */}
      <div 
        className="p-6 md:p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden"
        style={{ backgroundColor: settings.themeColor || '#059669' }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <ArrowRightLeft size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 text-white rounded-full text-xs font-semibold uppercase tracking-wider">
            🤝 {language === 'bn' ? 'কর্জে হাসানা ও আপদকালীন সাহায্য' : 'Qard-al-Hasanah Mutual Fund'}
          </span>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            {language === 'bn' ? 'আপদকালীন কল্যাণ সাহায্য ও কর্জে হাসানা ট্র্যাকার' : 'Mutual Welfare & Interest-Free Loans'}
          </h2>
          <p className="text-white/85 text-xs md:text-sm max-w-xl font-medium">
            {language === 'bn'
              ? 'সংস্থার আপদকালীন কল্যাণ তহবিল থেকে বিনা সুদে গরীব বা অসহায় মেম্বারদের সহযোগিতা (কর্জে হাসানা) ও ফেরত কিস্তির হিসাব।'
              : 'Our zero-percent interest welfare assistance fund to assist members facing distress, with fully documented repayment plans.'
            }
          </p>
        </div>
        {isModerator && (
          <button
            onClick={() => setIsAddOpen(true)}
            className="z-10 flex items-center justify-center gap-2 px-5 py-3.5 bg-white text-slate-900 font-bold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-[1.02] transform transition-all text-sm self-start md:self-center"
          >
            <Plus size={18} />
            {language === 'bn' ? 'কর্জ রেকর্ড করুন' : 'Issue New Hasanah Loan'}
          </button>
        )}
      </div>

      {/* Welfare Pool Summary Bento Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-3xl border border-slate-105 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'মোট তহবিল মূলধন' : 'Welfare Fund Size'}
            </p>
            <p className="text-base font-black text-slate-900">৳{totalFundPoolSize.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-rose-500/15 text-rose-400 rounded-2xl flex items-center justify-center shrink-0">
            <Percent size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-rose-400 tracking-wider">
              {language === 'bn' ? 'বর্তমানে লেন্ট/ব্যস্ত টাকা' : 'Currently Lent out'}
            </p>
            <p className="text-base font-black text-rose-400">৳{totals.netActiveLent.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-105 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
            <CheckCircle size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'সংগৃহীত / কিস্তি আদায়' : 'Welfare Recovered'}
            </p>
            <p className="text-base font-black text-blue-600">৳{totals.recovered.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-105 shadow-sm flex items-center gap-4 animate-pulse">
          <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center shrink-0">
            <ClipboardList size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'চলমান লেন্ট কাউন্ট' : 'Active Assistance Registry'}
            </p>
            <p className="text-base font-black text-purple-600 font-mono">
              {loans.filter(l => l.status !== 'fully_repaid').length} {language === 'bn' ? 'টি চলমান' : 'Families Assisted'}
            </p>
          </div>
        </div>

      </div>

      {/* Progress visual representation matching overall recovery progress */}
      <div className="bg-white p-6 rounded-[2.2rem] border border-slate-100 shadow-sm space-y-2">
        <div className="flex justify-between items-center text-xs font-black uppercase text-slate-500">
          <span>{language === 'bn' ? 'তহবিল পুনরুদ্ধার শতাংশ (Welfare Recovery Rate)' : 'Welfare Fund Recovered Rate'}</span>
          <span className="text-emerald-600 font-black">
            {totals.borrowed > 0 ? Math.round((totals.recovered / totals.borrowed) * 100) : 100}% recovered
          </span>
        </div>
        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
          <div 
            className="h-full bg-emerald-500 rounded-full transition-all duration-700"
            style={{ width: `${totals.borrowed > 0 ? Math.min(Math.round((totals.recovered / totals.borrowed) * 100), 100) : 100}%` }}
          />
        </div>
      </div>

      {/* Main loan listings */}
      {loading ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm font-mono">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm font-medium">{language === 'bn' ? 'তহবিলের কিস্তি তালিকা লোড হচ্ছে...' : 'Loading Hasanah logs...'}</p>
        </div>
      ) : loans.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-2 select-none">
          <div className="w-12 h-12 bg-slate-50 text-slate-400 flex items-center justify-center rounded-2xl mx-auto font-black text-lg">🤝</div>
          <p className="text-slate-500 text-xs font-bold leading-relaxed">{language === 'bn' ? 'বর্তমানে কোনো ঋণের বা কর্জের সাহায্য বিবরণী নথিভুক্ত নেই।' : 'No welfare loan cases issued or documented on ledger.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {loans.map(loan => {
            const borrowedAmt = loan.amount;
            const repaidAmt = loan.repaidAmount;
            const dueAmt = borrowedAmt - repaidAmt;
            const percentRecovered = borrowedAmt > 0 ? Math.round((repaidAmt / borrowedAmt) * 100) : 0;

            return (
              <div 
                key={loan.id}
                className="bg-white rounded-[2rem] border border-slate-150 p-6 shadow-sm hover:shadow-md transition-all flex flex-col gap-4 relative overflow-hidden"
              >
                {/* Horizontal status tag colored indicator */}
                <div className={`absolute top-0 left-0 h-1.5 w-full ${
                  loan.status === 'fully_repaid' ? 'bg-emerald-500' : loan.status === 'partially_repaid' ? 'bg-blue-500' : 'bg-rose-500'
                }`} />

                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono">
                        {loan.memberId}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                        loan.status === 'fully_repaid' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          : loan.status === 'partially_repaid'
                          ? 'bg-blue-50 text-blue-600 border border-blue-105'
                          : 'bg-rose-50 text-rose-600 border border-rose-100'
                      }`}>
                        {loan.status === 'fully_repaid' ? (language === 'bn' ? 'পরিশোধিত' : 'Fully Repaid') : loan.status === 'partially_repaid' ? (language === 'bn' ? 'আংশিক পরিশোধিত' : 'Partially Repaid') : (language === 'bn' ? 'সক্রিয় ঋণগ্রহীতা' : 'Active lent')}
                      </span>
                    </div>

                    <h3 className="text-base font-black text-slate-900 leading-tight">
                      {language === 'bn' ? loan.borrowerNameBn : loan.borrowerName}
                    </h3>
                    <p className="text-[9px] text-slate-400 font-bold font-sans">
                      📱 Phone: {loan.phone} | Issue Date: {loan.issueDate}
                    </p>
                  </div>

                  {/* Math columns */}
                  <div className="flex flex-wrap items-center gap-6 text-right">
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{language === 'bn' ? 'কর্জ পরিমাণ' : 'Lent Amount'}</p>
                      <p className="text-sm font-black text-slate-900 font-mono">৳{borrowedAmt.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">{language === 'bn' ? 'আদায়কৃত জমা' : 'Paid Back'}</p>
                      <p className="text-sm font-black text-emerald-600 font-mono">৳{repaidAmt.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest">{language === 'bn' ? 'বকেয়া অবশিষ্টাংশ' : 'Remaining Due'}</p>
                      <p className="text-sm font-black text-rose-600 font-mono">৳{dueAmt.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Progress bar inside the list */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                    <span>{language === 'bn' ? 'ব্যক্তিগত পরিশোধের অগ্রগতি' : 'Individual repayment rate'}</span>
                    <span>{percentRecovered}% Recovered</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-slate-900 transition-all duration-300" 
                      style={{ width: `${percentRecovered}%` }}
                    />
                  </div>
                </div>

                {/* Borrower statement/remarks (if any) */}
                {loan.remarks && (
                  <p className="text-[10px] text-slate-500 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    "{loan.remarks}"
                  </p>
                )}

                {/* Repayment logs list drawer */}
                {loan.repayments.length > 0 && (
                  <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-4 space-y-2 mt-1">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">📜 {language === 'bn' ? 'আদায়ের কিস্তি লগ বিবরণী' : 'Repayment Transactions History'}</p>
                    <div className="divide-y divide-slate-100 text-[10px] font-semibold text-slate-600 max-h-[120px] overflow-y-auto">
                      {loan.repayments.map((entry, idx) => (
                        <div key={idx} className="py-2 flex justify-between items-center">
                          <span className="font-mono">{entry.date}</span>
                          <span>Receipt: <strong className="font-mono text-slate-700">{entry.receiptNo}</strong> | Receiver: <strong className="text-slate-700">{entry.receiver}</strong></span>
                          <span className="font-black text-emerald-600 font-mono">+৳{entry.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions bottom footer for Repay log entries */}
                <div className="border-t border-slate-50 pt-4 flex justify-between items-center">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Clock size={11} /> Expected Return: <strong className="text-slate-600">{loan.targetReturnDate}</strong>
                  </span>

                  <div className="flex items-center gap-2">
                    {isModerator && (
                      <button
                        onClick={() => handleDeleteLoan(loan.id)}
                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    {loan.status !== 'fully_repaid' && (
                      <button
                        onClick={() => {
                          setSelectedLoanForRepay(loan);
                          setRepayAmount('');
                          setRepayReceiver('');
                          setRepayReceiptNo(`REC-${Date.now().toString().slice(-6)}`);
                          setIsRepayOpen(true);
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase transition-all"
                      >
                        + {language === 'bn' ? 'পরিশোধ জমা (Repayment)' : 'Welfare Installment'}
                      </button>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Slide-over Add Loan Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[92] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-xl max-h-[90vh] overflow-y-auto border border-slate-100 shadow-2xl p-6 md:p-8 space-y-6"
            >
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    {language === 'bn' ? '🤝 কর্জে হাসানা প্রদান ফরম' : '🤝 Issue Hasanah Welfare Loan'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {language === 'bn' ? 'তহবিল ব্যালেন্স থেকে বিয়োগ করা হবে' : 'Deducted dynamically from community pool'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsAddOpen(false)}
                  className="p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800 text-xs font-bold transition-all"
                >
                  X
                </button>
              </div>

              <form onSubmit={handleAddLoan} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Recipient Member ID (মেম্বার আইডি)</label>
                    <input
                      type="text"
                      placeholder="E.g., NSWO-007"
                      value={formLoan.memberId}
                      onChange={(e) => setFormLoan({ ...formLoan, memberId: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-105 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500 uppercase placeholder-slate-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Phone / মোবাইল নম্বর *</label>
                    <input
                      type="tel"
                      required
                      placeholder="017XXXXXXXX"
                      value={formLoan.phone}
                      onChange={(e) => setFormLoan({ ...formLoan, phone: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Borrower (English Name) *</label>
                    <input
                      type="text"
                      required
                      placeholder="E.g., Sharif Ahamed"
                      value={formLoan.borrowerName}
                      onChange={(e) => setFormLoan({ ...formLoan, borrowerName: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">গ্রহীতার নাম (বাংলা) *</label>
                    <input
                      type="text"
                      required
                      placeholder="উদা: শরীফ আহমেদ"
                      value={formLoan.borrowerNameBn}
                      onChange={(e) => setFormLoan({ ...formLoan, borrowerNameBn: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lent Issue Date / মঞ্জুর তারিখ *</label>
                    <input
                      type="date"
                      required
                      value={formLoan.issueDate}
                      onChange={(e) => setFormLoan({ ...formLoan, issueDate: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Target Return Date / পরিশোধের শেষ সময় *</label>
                    <input
                      type="date"
                      required
                      value={formLoan.targetReturnDate}
                      onChange={(e) => setFormLoan({ ...formLoan, targetReturnDate: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Hasanah Amount / কর্জের পরিমাণ (৳) *</label>
                    <input
                      type="number"
                      required
                      min="500"
                      max={totals.remainingInHandPool}
                      placeholder={`Principal welfare budget (Max: ৳${totals.remainingInHandPool.toLocaleString()})`}
                      value={formLoan.amount}
                      onChange={(e) => setFormLoan({ ...formLoan, amount: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-rose-50 text-rose-800 border-none rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <p className="text-[8px] text-slate-400 font-semibold mt-0.5">
                      The total theoretical pool remaining is ৳{totals.remainingInHandPool.toLocaleString()}. Interest/markups must remain 0%.
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Welfare Remarks / আপদকালীন কারণ</label>
                  <textarea
                    rows={2}
                    placeholder="E.g., Medical operation aid zero-interest loan..."
                    value={formLoan.remarks}
                    onChange={(e) => setFormLoan({ ...formLoan, remarks: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="px-5 py-2.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase rounded-lg transition-all shadow-lg"
                  >
                    Issue Assistance
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Slide-over Repayment Modal */}
      <AnimatePresence>
        {isRepayOpen && selectedLoanForRepay && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[92] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md border border-slate-100 shadow-2xl p-6 md:p-8 space-y-6"
            >
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {language === 'bn' ? '💸 আদায় পরিশোধ রেকর্ড' : '💸 Record Repayment Installment'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Borrower: {language === 'bn' ? selectedLoanForRepay.borrowerNameBn : selectedLoanForRepay.borrowerName}
                  </p>
                </div>
                <button 
                  onClick={() => setIsRepayOpen(false)}
                  className="p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800 text-xs font-bold transition-all"
                >
                  X
                </button>
              </div>

              <form onSubmit={handleRepaySubmit} className="space-y-4">
                
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Repayment Date / পরিশোধের তারিখ</label>
                  <input
                    type="date"
                    required
                    value={repayDate}
                    onChange={(e) => setRepayDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Repayment Amount / কিস্তি আদায়ের পরিমাণ (৳) *</label>
                  <input
                    type="number"
                    required
                    min="100"
                    max={selectedLoanForRepay.amount - selectedLoanForRepay.repaidAmount}
                    placeholder={`Max remaining: ৳${(selectedLoanForRepay.amount - selectedLoanForRepay.repaidAmount).toLocaleString()}`}
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    className="w-full px-3.5 py-3 bg-emerald-50 text-emerald-800 border-none rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Receiver Agent / গ্রহণকারী কর্মকর্তা *</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g., Sharif Ahamed (Treasurer)"
                    value={repayReceiver}
                    onChange={(e) => setRepayReceiver(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Paper Receipt No / রসিদ নম্বর *</label>
                  <input
                    type="text"
                    required
                    value={repayReceiptNo}
                    onChange={(e) => setRepayReceiptNo(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsRepayOpen(false)}
                    className="px-5 py-2.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase rounded-lg transition-all shadow-lg"
                  >
                    Verify & Deposit Repayment
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
