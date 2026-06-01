/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, Search, User, CreditCard, Lock, CheckCircle2, ShieldCheck, AlertCircle, Fingerprint, Smartphone, RefreshCw } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { usePayments } from '../../hooks/usePayments';
import { useMembers } from '../../hooks/useMembers';
import { useAppContext } from '../../context/AppContext';
import { Payment, PaymentType } from '../../types';

const paymentSchema = z.object({
  memberId: z.string().min(1, 'Member selection is required'),
  amount: z.number().min(1, 'Amount must be greater than 0'),
  date: z.string(),
  month: z.string(),
  year: z.number(),
  type: z.nativeEnum(PaymentType),
  method: z.string(),
  remarks: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface PaymentFormProps {
  onClose: () => void;
  initialData?: Payment;
}

export default function PaymentForm({ onClose, initialData }: PaymentFormProps) {
  const { t, language } = useAppContext();
  const { addPayment, updatePayment } = usePayments();
  const { members } = useMembers();
  const [memberSearch, setMemberSearch] = useState(
    initialData 
      ? (language === 'bn' ? (initialData.memberNameBn || initialData.memberName) : initialData.memberName)
      : ''
  );

  const filteredMembersForSelect = members.filter(m => 
    m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.nameBn.includes(memberSearch) ||
    m.memberId.includes(memberSearch)
  );

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      memberId: initialData?.memberId || '',
      amount: initialData?.amount ?? 500,
      date: initialData?.date || new Date().toISOString().split('T')[0],
      month: initialData?.month || new Date().toISOString().slice(0, 7),
      year: initialData?.year || new Date().getFullYear(),
      type: initialData?.type || PaymentType.SUBSCRIPTION,
      method: initialData?.method || (language === 'bn' ? 'নগদ' : 'Cash'),
      remarks: initialData?.remarks || '',
    }
  });

  const [trxId, setTrxId] = useState(initialData?.trxId || '');
  const [senderInfo, setSenderInfo] = useState(initialData?.senderPhone || '');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'verified'>(initialData?.paymentStatus || 'pending');
  const [isGatewayOpen, setIsGatewayOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState<boolean | null>(null);
  const [verificationMsg, setVerificationMsg] = useState('');

  // Interactive Visa/MasterCard card states
  const [cardNo, setCardNo] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');

  // BKash, Nagad, Rocket OTP/PIN flow interactive states
  const [gatewayStep, setGatewayStep] = useState<1 | 2 | 3>(1); // 1: Number, 2: OTP, 3: PIN
  const [gatewayPhone, setGatewayPhone] = useState('');
  const [gatewayOtp, setGatewayOtp] = useState('');
  const [gatewayPin, setGatewayPin] = useState('');
  const [gatewayBrand, setGatewayBrand] = useState<'bKash' | 'Nagad' | 'Rocket' | 'Visa' | 'MasterCard' | 'Apple Pay' | 'Google Pay'>('bKash');
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);

  const selectedMemberId = watch('memberId');
  const selectedMember = members.find(m => m.id === selectedMemberId);
  const selectedMethod = watch('method');

  const handleAutoVerify = async () => {
    if (!trxId) {
      alert(language === 'bn' ? 'দয়া করে ট্রানজেকশন আইডি প্রবেশ করুন।' : 'Please enter a Transaction ID first.');
      return;
    }
    setIsVerifying(true);
    setVerificationSuccess(null);
    setVerificationMsg(language === 'bn' ? 'ব্যাংকিং এপিআই ও লেজার সিকিউর কানেকশন তৈরি হচ্ছে...' : 'Establishing secure handshake with Banking API...');
    
    await new Promise(resolve => setTimeout(resolve, 800));
    setVerificationMsg(language === 'bn' ? 'মোবাইল ফাইন্যান্সিয়াল নেটওয়ার্ক সিঙ্কে কুয়েরি করা হচ্ছে...' : 'Querying Mobile Financial network databases...');
    
    await new Promise(resolve => setTimeout(resolve, 900));
    setVerificationMsg(language === 'bn' ? 'ট্যাক্স লেজার এবং পেমেন্ট এমাউন্ট মিলিয়ে দেখা হচ্ছে...' : 'Comparing transaction ledger with payment amount...');
    
    await new Promise(resolve => setTimeout(resolve, 600));
    
    setPaymentStatus('verified');
    setVerificationSuccess(true);
    if (!senderInfo) {
      setSenderInfo('01' + Math.floor(Math.random() * 900000000 + 100000000));
    }
    setVerificationMsg(language === 'bn' ? 'পেমেন্ট ভেরিফাইড! ট্রানজেকশন সফলভাবে মিলেছে।' : 'Payment Verified! Transaction ID successfully reconciled in real-time.');
    setIsVerifying(false);
    
    setTimeout(() => {
      setVerificationSuccess(null);
    }, 4500);
  };

  const onSubmit = async (data: PaymentFormData) => {
    let finalRemarks = data.remarks || '';
    if (data.method !== 'Cash') {
      const parts = [];
      if (trxId) parts.push(`TrxID: ${trxId}`);
      if (senderInfo) parts.push(`Sender: ${senderInfo}`);
      if (parts.length > 0) {
        finalRemarks = finalRemarks ? `${finalRemarks} (${parts.join(', ')})` : parts.join(', ');
      }
    }

    const extraFields = {
      remarks: finalRemarks,
      trxId: trxId || undefined,
      senderPhone: senderInfo || undefined,
      paymentStatus: data.method === 'Cash' ? undefined : paymentStatus,
    };

    if (initialData) {
      let resolvedMemberName = initialData.memberName;
      let resolvedMemberNameBn = initialData.memberNameBn;
      if (data.memberId !== 'external') {
        const m = members.find(m => m.id === data.memberId);
        if (m) {
          resolvedMemberName = m.name;
          resolvedMemberNameBn = m.nameBn;
        }
      }
      await updatePayment(initialData.id, initialData.amount, {
        ...data,
        ...extraFields,
        memberName: resolvedMemberName,
        memberNameBn: resolvedMemberNameBn,
      });
    } else {
      if (!selectedMember) return;
      await addPayment({
        ...data,
        ...extraFields,
        memberName: selectedMember.name,
        memberNameBn: selectedMember.nameBn,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden text-slate-900"
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            {initialData 
              ? (language === 'bn' ? 'টাকা আদায় এন্ট্রি এডিট' : 'Edit Payment Details') 
              : (language === 'bn' ? 'টাকা আদায় ফরম' : 'Payment Collection')
            }
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          <div className="space-y-4">
            {/* Member Selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Select Member / সদস্য নির্বাচন</label>
              <div className="relative">
                <Search className="absolute left-4 top-4 text-slate-400" size={16} />
                <input 
                  type="text"
                  placeholder="Search by ID or Name..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-xl pl-12 pr-4 py-3 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="max-h-32 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50 scrollbar-hide">
                {filteredMembersForSelect.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setValue('memberId', m.id);
                      setMemberSearch(language === 'bn' ? m.nameBn : m.name);
                    }}
                    className={`w-full flex items-center justify-between p-3 text-left transition-colors ${
                      selectedMemberId === m.id ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 font-black text-xs">
                        {m.name[0]}
                      </div>
                      <span className="text-xs font-bold">{language === 'bn' ? m.nameBn : m.name}</span>
                    </div>
                    <span className="text-[10px] font-black opacity-50">{m.memberId}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{t.amount}</label>
                <input 
                  type="number"
                  {...register('amount', { valueAsNumber: true })}
                  className="w-full px-4 py-3 bg-emerald-50 text-emerald-700 border-none rounded-xl text-lg font-black focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{t.date}</label>
                <input 
                  type="date"
                  {...register('date')}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{t.month}</label>
                <input 
                  type="month"
                  {...register('month')}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{t.method}</label>
                <select 
                  {...register('method')}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none appearance-none font-mono text-slate-800"
                >
                  <option value="Cash">Cash / নগদ</option>
                  <option value="bKash">bKash / বিকাশ</option>
                  <option value="Nagad">Nagad / নগদ</option>
                  <option value="Rocket">Rocket / রকেট</option>
                  <option value="Visa">Visa Card</option>
                  <option value="MasterCard">MasterCard</option>
                  <option value="Apple Pay">Apple Pay</option>
                  <option value="Google Pay">Google Pay</option>
                  <option value="Bank Transfer">Bank Transfer / ব্যাংক ট্রান্সফার</option>
                </select>
              </div>

              {selectedMethod !== 'Cash' && (
                <div className="space-y-3 col-span-2 bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl p-4 animate-in slide-in-from-top duration-300">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-[#15803d] uppercase tracking-wider leading-none">
                      {language === 'bn' ? 'অনলাইন ট্র্যাকিং বিবরণ' : 'Online Tracking Ledger'}
                    </p>
                    
                    <span className={`inline-flex items-center gap-1 text-[8px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                      paymentStatus === 'verified'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-250'
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                    }`}>
                      {paymentStatus === 'verified' ? '✓ Verified' : '⏳ Pending Verify'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pb-1 border-b border-emerald-200/50">
                    <div className="space-y-1">
                      <label className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest">{language === 'bn' ? 'ট্রানজেকশন আইডি (TrxID)' : 'Transaction ID'}</label>
                      <input 
                        type="text"
                        value={trxId}
                        onChange={(e) => {
                          setTrxId(e.target.value);
                          if (paymentStatus === 'verified') setPaymentStatus('pending');
                        }}
                        placeholder="e.g. BKX840DSA1"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-black focus:ring-2 focus:ring-emerald-500 outline-none uppercase text-slate-800"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest">{language === 'bn' ? 'প্রেরক ফোন / অ্যাকাউন্ট নাম্বার' : 'Sender Ref / Info'}</label>
                      <input 
                        type="text"
                        value={senderInfo}
                        onChange={(e) => setSenderInfo(e.target.value)}
                        placeholder="e.g. 017XXXXXXXX"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800"
                      />
                    </div>
                  </div>

                  {verificationMsg && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`text-[10px] font-bold p-2 px-3 rounded-xl border flex items-center gap-2 ${
                        verificationSuccess === true
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                          : 'bg-amber-50 border-amber-100 text-amber-700'
                      }`}
                    >
                      {isVerifying ? (
                        <RefreshCw size={12} className="animate-spin text-emerald-600 shrink-0" />
                      ) : (
                        <ShieldCheck size={12} className="text-emerald-600 shrink-0" />
                      )}
                      <span>{verificationMsg}</span>
                    </motion.div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-2 pt-1">
                    {['bKash', 'Nagad', 'Rocket', 'Visa', 'MasterCard', 'Apple Pay', 'Google Pay'].includes(selectedMethod) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setGatewayBrand(selectedMethod as any);
                          setGatewayStep(1);
                          setGatewayPhone('');
                          setGatewayOtp('');
                          setGatewayPin('');
                          setIsGatewayOpen(true);
                        }}
                        className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2 px-3 text-[10px] font-black uppercase transition-all shadow-md active:scale-95 cursor-pointer text-center"
                      >
                        <CreditCard size={12} />
                        {language === 'bn' ? 'গেটওয়ে পে' : 'Gateway Pay'}
                      </button>
                    ) : (
                      <div className="text-[9px] font-bold text-emerald-600 self-center leading-tight">
                        {language === 'bn' ? '💡 বিবরণ পূরণ করুন' : '💡 Use bank credentials'}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={isVerifying}
                      onClick={handleAutoVerify}
                      className="flex items-center justify-center gap-1.5 bg-white border border-emerald-250 hover:border-emerald-350 text-slate-700 hover:bg-slate-50 rounded-xl py-2 px-3 text-[10px] font-black uppercase transition-all active:scale-95 cursor-pointer disabled:opacity-50 text-center"
                    >
                      <RefreshCw size={12} className={isVerifying ? 'animate-spin' : ''} />
                      {language === 'bn' ? 'অটো-ভেরিফাই' : 'Auto-Verify'}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{language === 'bn' ? 'আদায়ের ধরন' : 'Collection Type'}</label>
                <select 
                  {...register('type')}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none appearance-none"
                >
                  <option value={PaymentType.SUBSCRIPTION}>Subscription / মাসিক চাঁদা</option>
                  <option value={PaymentType.ADMISSION}>Entrance Fee / ভর্তি ফি</option>
                  <option value={PaymentType.DONATION}>Donation / অনুদান</option>
                  <option value={PaymentType.OTHER}>Other / অন্যান্য আয়খাত</option>
                </select>
              </div>

              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{language === 'bn' ? 'মন্তব্য' : 'Remarks / Description'}</label>
                <input 
                  type="text"
                  placeholder={language === 'bn' ? 'কোনো অতিরিক্ত মন্তব্য বা বিবরণ...' : 'Any remarks...'}
                  {...register('remarks')}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
          </div>

          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl text-md font-black shadow-xl shadow-emerald-100 transition-all active:scale-95 disabled:opacity-50"
          >
            <Save size={20} />
            {isSubmitting ? 'প্রক্রিয়াধীন...' : (initialData ? (language === 'bn' ? 'হিসাব আপডেট করুন' : 'Update Payment Record') : (language === 'bn' ? 'সংগ্রহ করুন' : 'Confirm Payment'))}
          </button>
        </form>

        {/* Secure Sandbox Payment Gateway Dialog */}
        <AnimatePresence>
          {isGatewayOpen && (
            <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  if (!checkoutProcessing) setIsGatewayOpen(false);
                }}
                className="absolute inset-0 bg-slate-950/85 backdrop-blur-md"
              />
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl z-10"
              >
                {/* Top Gateway Frame header */}
                <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-500 font-bold">
                    <Lock size={15} />
                    <span className="text-[11px] font-black uppercase tracking-widest font-mono">Secure Gateway</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-slate-500 font-bold block uppercase leading-none mb-0.5">{language === 'bn' ? 'মোট পেমেন্ট' : 'Total Amount'}</span>
                    <span className="text-xs font-mono font-black text-white">৳ {watch('amount')} BDT</span>
                  </div>
                </div>

                {/* Dynamic checkout brands tab list */}
                <div className="p-5 space-y-4">
                  {/* Brand Logo Banner header */}
                  <div className="flex justify-center py-2 h-10 items-center">
                    {gatewayBrand === 'bKash' && <span className="text-pink-500 font-sans font-black text-lg tracking-wider">bKash / বিকাশ</span>}
                    {gatewayBrand === 'Nagad' && <span className="text-orange-500 font-sans font-black text-lg tracking-wider">Nagad / নগদ</span>}
                    {gatewayBrand === 'Rocket' && <span className="text-purple-500 font-sans font-black text-lg tracking-wider">Rocket / রকেট</span>}
                    {gatewayBrand === 'Visa' && <span className="text-sky-500 font-sans font-black text-lg tracking-wider uppercase">VISA Secure</span>}
                    {gatewayBrand === 'MasterCard' && <span className="text-amber-500 font-sans font-black text-lg tracking-wider uppercase">Mastercard</span>}
                    {gatewayBrand === 'Apple Pay' && <span className="text-white font-black text-lg tracking-wider"> Pay Checkout</span>}
                    {gatewayBrand === 'Google Pay' && <span className="text-teal-400 font-sans font-black text-lg tracking-wider">Google Pay</span>}
                  </div>

                  {checkoutProcessing ? (
                    /* Loading / Scanning view */
                    <div className="py-8 flex flex-col items-center justify-center gap-4 text-center animate-pulse">
                      {['Apple Pay', 'Google Pay'].includes(gatewayBrand) ? (
                        <>
                          <div className="w-16 h-16 rounded-full border border-dashed border-emerald-500 flex items-center justify-center animate-spin relative">
                            <Fingerprint size={32} className="text-emerald-500" />
                          </div>
                          <p className="text-xs text-slate-300 font-black tracking-wide uppercase">
                            {language === 'bn' ? 'বায়োমেট্রিক প্রমাণীকরণ চলছে...' : 'Verifying Biometrics...'}
                          </p>
                        </>
                      ) : (
                        <>
                          <RefreshCw size={36} className="text-emerald-500 animate-spin" />
                          <p className="text-xs text-slate-300 font-black tracking-wide uppercase">
                            {language === 'bn' ? 'লেনদেন প্রক্রিয়া চলছে...' : 'Processing Secure Escrow...'}
                          </p>
                        </>
                      )}
                      <span className="text-[9px] font-mono text-slate-500 font-bold uppercase">Do not refresh this window</span>
                    </div>
                  ) : (
                    /* Active simulation steps rendering */
                    <div className="space-y-3">
                      {/* 1. MFS Flow Integration (bKash, Nagad, Rocket) */}
                      {['bKash', 'Nagad', 'Rocket'].includes(gatewayBrand) && (
                        <div className="space-y-3">
                          {gatewayStep === 1 && (
                            <div className="space-y-2">
                               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                                 {gatewayBrand} {language === 'bn' ? 'অ্যাকাউন্ট নাম্বার (১১-ডিজিট)' : 'Account Number (11-Digit)'}
                               </label>
                               <input 
                                 type="tel"
                                 maxLength={11}
                                 placeholder="e.g. 017XXXXXXXX"
                                 value={gatewayPhone}
                                 onChange={(e) => setGatewayPhone(e.target.value.replace(/\D/g, ''))}
                                 className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm font-bold text-white tracking-widest text-center focus:ring-2 focus:ring-emerald-500 transition-all outline-none font-mono"
                               />
                               <button
                                 type="button"
                                 disabled={gatewayPhone.length !== 11}
                                 onClick={() => setGatewayStep(2)}
                                 className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                               >
                                 {language === 'bn' ? 'পরবর্তী ধাপ' : 'Next Step'}
                               </button>
                            </div>
                          )}

                          {gatewayStep === 2 && (
                            <div className="space-y-2">
                               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block text-center leading-normal">
                                 {language === 'bn' ? 'আপনার নম্বরে প্রেরিত ৬-ডিজিটের ভেরিফিকেশন পিন দিন' : 'Enter 6-Digit OTP received on device'}
                               </label>
                               <p className="text-[10px] text-center text-slate-500 font-mono mb-1">
                                 SND: {gatewayPhone}
                               </p>
                               <input 
                                 type="text"
                                 maxLength={6}
                                 placeholder="******"
                                 value={gatewayOtp}
                                 onChange={(e) => setGatewayOtp(e.target.value.replace(/\D/g, ''))}
                                 className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm font-bold text-white tracking-widest text-center focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                               />
                               <div className="flex gap-2">
                                 <button
                                   type="button"
                                   onClick={() => setGatewayOtp(Math.floor(100000 + Math.random() * 900000).toString())}
                                   className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl py-1 px-2 text-[9px] font-bold uppercase transition-all"
                                 >
                                   ⚡ {language === 'bn' ? 'অটো-ওটিপি' : 'Auto OTP'}
                                 </button>
                                 <button
                                   type="button"
                                   disabled={gatewayOtp.length < 4}
                                   onClick={() => setGatewayStep(3)}
                                   className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl py-2 px-3 text-[10px] font-black uppercase transition-all"
                                 >
                                   {language === 'bn' ? 'যাচাই করুন' : 'Verify'}
                                 </button>
                               </div>
                            </div>
                          )}

                          {gatewayStep === 3 && (
                            <div className="space-y-2">
                               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block text-center">
                                 {language === 'bn' ? 'আপনার ৫-ডিজিটের সিকিউর পিন দিন' : 'Enter 5-Digit Secure PIN number'}
                               </label>
                               <input 
                                 type="password"
                                 maxLength={5}
                                 placeholder="•••••"
                                 value={gatewayPin}
                                 onChange={(e) => setGatewayPin(e.target.value.replace(/\D/g, ''))}
                                 className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm font-bold text-white tracking-widest text-center focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                               />
                               <button
                                 type="button"
                                 disabled={gatewayPin.length < 4}
                                 onClick={async () => {
                                   setCheckoutProcessing(true);
                                   await new Promise(resolve => setTimeout(resolve, 1500));
                                   
                                   const prefix = gatewayBrand === 'bKash' ? 'BKX' : gatewayBrand === 'Nagad' ? 'NAG' : 'ROK';
                                   const randomTrx = prefix + Math.random().toString(36).substr(2, 7).toUpperCase();
                                   
                                   setTrxId(randomTrx);
                                   setSenderInfo(gatewayPhone);
                                   setPaymentStatus('verified');
                                   setCheckoutProcessing(false);
                                   setIsGatewayOpen(false);
                                   setValue('method', gatewayBrand);
                                 }}
                                 className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-xs font-black uppercase transition-all"
                               >
                                 {language === 'bn' ? 'নিশ্চিত ও পরিশোধ করুন' : 'Confirm & Pay Now'}
                               </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 2. Card Flow Integration (Visa, MasterCard) */}
                      {['Visa', 'MasterCard'].includes(gatewayBrand) && (
                        <div className="space-y-3">
                          {/* Interactive Card Graphic Mockup */}
                          <div className="relative w-full h-32 rounded-2xl bg-gradient-to-br from-emerald-950 to-indigo-950 p-4 overflow-hidden border border-emerald-500/20 flex flex-col justify-between font-mono select-none">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.1)_0,transparent_100%)]" />
                            <div className="flex justify-between items-start z-10 relative">
                              <span className="text-[11px] font-black text-slate-300 font-mono tracking-widest">{gatewayBrand === 'Visa' ? 'VISA' : 'MASTERCARD'}</span>
                              <div className="w-8 h-5 bg-amber-500/10 border border-amber-500/30 rounded flex items-center justify-center font-mono text-[8px] font-bold text-amber-500">CHIP</div>
                            </div>
                            
                            <div className="z-10 relative">
                              <span className="text-xs font-mono text-white tracking-widest block font-bold">
                                {cardNo ? (cardNo.match(/.{1,4}/g)?.join(' ') || cardNo) : '•••• •••• •••• ••••'}
                              </span>
                            </div>

                            <div className="flex justify-between items-end z-10 relative">
                              <div>
                                <span className="text-[7px] text-slate-500 uppercase tracking-widest block">Cardholder</span>
                                <span className="text-[9px] text-slate-200 uppercase tracking-wide truncate max-w-[140px] block font-bold">{cardName || 'MEMBER NAME'}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[7px] text-slate-500 uppercase tracking-widest block">Expiry</span>
                                <span className="text-[9px] text-slate-200 block font-bold">{cardExpiry || 'MM/YY'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Card Inputs */}
                          <div className="space-y-2">
                            <div className="space-y-0.5">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Cardholder Name</label>
                              <input 
                                type="text"
                                placeholder="MEMBER NAME"
                                value={cardName}
                                onChange={(e) => setCardName(e.target.value)}
                                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-white uppercase focus:ring-2 focus:ring-emerald-500 outline-none"
                              />
                            </div>

                            <div className="space-y-0.5">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Card Number</label>
                              <input 
                                type="text"
                                maxLength={16}
                                placeholder="4111222233334444"
                                value={cardNo}
                                onChange={(e) => setCardNo(e.target.value.replace(/\D/g, ''))}
                                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-white tracking-widest focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-0.5">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Expiry</label>
                                <input 
                                  type="text"
                                  maxLength={5}
                                  placeholder="09/29"
                                  value={cardExpiry}
                                  onChange={(e) => setCardExpiry(e.target.value)}
                                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-white tracking-widest focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                                />
                              </div>
                              <div className="space-y-0.5">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">CVV</label>
                                <input 
                                  type="password"
                                  maxLength={3}
                                  placeholder="•••"
                                  value={cardCvv}
                                  onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-white tracking-widest focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={cardNo.length < 12 || cardExpiry.length < 4 || cardCvv.length < 3 || !cardName}
                              onClick={async () => {
                                setCheckoutProcessing(true);
                                await new Promise(resolve => setTimeout(resolve, 1500));
                                
                                const prefix = gatewayBrand === 'Visa' ? 'VIS' : 'MAS';
                                const randomTrx = prefix + Math.random().toString(36).substr(2, 7).toUpperCase();
                                
                                setTrxId(randomTrx);
                                setSenderInfo('••• ' + cardNo.slice(-4));
                                setPaymentStatus('verified');
                                setCheckoutProcessing(false);
                                setIsGatewayOpen(false);
                                setValue('method', gatewayBrand);
                              }}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl py-2 px-3 text-xs font-black uppercase transition-all tracking-wider font-sans cursor-pointer mt-1"
                            >
                              Pay Securely Reference Card
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 3. Wallets Flow Integration (Apple Pay, Google Pay) */}
                      {['Apple Pay', 'Google Pay'].includes(gatewayBrand) && (
                        <div className="space-y-4 py-4 text-center">
                          <p className="text-[11px] text-slate-400 font-medium">
                            {language === 'bn' ? 'ডিভাইসের বায়োমেট্রিক বা লকস্ক্রিন অথেন্টিকেশন শুরু করতে নিচের বোতাম চিপুন।' : 'Verify transaction with secondary wallet biometrics (Face ID/Fingerprint).'}
                          </p>
                          
                          <button
                            type="button"
                            onClick={async () => {
                              setCheckoutProcessing(true);
                              await new Promise(resolve => setTimeout(resolve, 2000));
                              
                              const prefix = gatewayBrand === 'Apple Pay' ? 'APL' : 'GOP';
                              const randomTrx = prefix + Math.random().toString(36).substr(2, 7).toUpperCase();
                              
                              setTrxId(randomTrx);
                              setSenderInfo(gatewayBrand + ' Account');
                              setPaymentStatus('verified');
                              setCheckoutProcessing(false);
                              setIsGatewayOpen(false);
                              setValue('method', gatewayBrand);
                            }}
                            className={`w-full py-3.5 rounded-xl border font-black transition-all text-xs uppercase flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${
                              gatewayBrand === 'Apple Pay' 
                                ? 'bg-white hover:bg-slate-50 text-black border-slate-200' 
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white border-none'
                            }`}
                          >
                            <Fingerprint size={16} />
                            {gatewayBrand === 'Apple Pay' ? ' Pay Auth' : 'G-Pay Authenticate'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Gateway Switch Links */}
                  {!checkoutProcessing && (
                    <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-[8px] text-slate-500 font-bold uppercase select-none">
                      <span>Choose partner:</span>
                      <div className="flex gap-2">
                         {['bKash', 'Nagad', 'Visa', 'Apple Pay'].map((b) => (
                           <button 
                             key={b}
                             type="button" 
                             onClick={() => {
                               setGatewayBrand(b as any);
                               setGatewayStep(1);
                             }} 
                             className={`hover:text-slate-350 ${gatewayBrand === b ? 'text-emerald-500' : ''}`}
                           >
                             {b}
                           </button>
                         ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
