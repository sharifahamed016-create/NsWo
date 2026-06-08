/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Receipt, Calendar, User, 
  ArrowUpRight, Download, Printer, Share2, X,
  Edit, Trash2
} from 'lucide-react';
import { usePayments } from '../../hooks/usePayments';
import { useMembers } from '../../hooks/useMembers';
import { useAppContext } from '../../context/AppContext';
import { getImageUrl } from '../../lib/utils';
import PaymentForm from './PaymentForm';
import ReceiptModal from './ReceiptModal';
import { Payment } from '../../types';

export default function PaymentsList() {
  const { t, language, isModerator, isAdmin, settings } = useAppContext();

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

  const { payments, loading, deletePayment } = usePayments();
  const { members } = useMembers();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<Payment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Banner */}
      <div 
        className={`p-6 md:p-8 rounded-3xl ${isThemeLight ? 'text-slate-950' : 'text-white'} shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden`}
        style={{ backgroundColor: settings.themeColor }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <Receipt size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <div className={`inline-flex items-center gap-2 px-3 py-1 ${isThemeLight ? 'bg-black/10 text-slate-950 font-black' : 'bg-white/20 text-white'} rounded-full text-xs font-semibold uppercase tracking-wider`}>
            🪙 {language === 'bn' ? 'আর্থিক জমার রশিদ' : 'Receipt Desk'}
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            {t.payments}
          </h2>
          <p className={`${isThemeLight ? 'text-slate-800' : 'text-white/85'} text-xs md:text-sm max-w-xl font-medium`}>
            {language === 'bn' 
              ? `মোট ${payments.length} টি সফল জমার ট্র্যাকিং ও রশিদ রেকর্ড সংরক্ষিত রয়েছে।` 
              : `Total ${payments.length} successful payment tracking & statement records verified below.`
            }
          </p>
        </div>
        {isModerator && (
          <button 
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="z-10 flex items-center justify-center gap-2 px-5 py-3.5 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-[1.02] transform transition-all text-sm self-start md:self-center cursor-pointer"
          >
            <Plus size={18} />
            {language === 'bn' ? 'টাকা জমা' : 'Add Payment'}
          </button>
        )}
      </div>

      {/* Search Bar & Filters */}
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder={t.search + ' by Name or Receipt...'} 
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
              {language === 'bn' ? tab.labelBn : tab.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Payments History */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
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
                      #{payment.receiptNo}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-emerald-100 flex items-center justify-center text-emerald-600 font-black text-lg shrink-0 border-2 border-white shadow-md">
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
                          {language === 'bn' ? (payment.memberNameBn || payment.memberName) : payment.memberName}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          {payment.method === 'bKash' ? (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded-md bg-pink-50 text-pink-600 border border-pink-100 uppercase font-mono tracking-wider">bKash</span>
                          ) : payment.method === 'Nagad' ? (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-600 border border-orange-100 uppercase font-mono tracking-wider">Nagad</span>
                          ) : payment.method === 'Rocket' ? (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-600 border border-purple-100 uppercase font-mono tracking-wider">Rocket</span>
                          ) : payment.method === 'Bank Transfer' ? (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100 uppercase font-mono tracking-wider">Bank</span>
                          ) : payment.method === 'Visa' ? (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-600 border border-sky-100 uppercase font-mono tracking-wider">Visa</span>
                          ) : payment.method === 'MasterCard' ? (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-100 uppercase font-mono tracking-wider">Mastercard</span>
                          ) : payment.method === 'Apple Pay' ? (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded-md bg-slate-900 text-white border border-slate-800 uppercase font-mono tracking-wider">Apple Pay</span>
                          ) : payment.method === 'Google Pay' ? (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-100 uppercase font-mono tracking-wider">G-Pay</span>
                          ) : (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-150 uppercase font-mono tracking-wider">{payment.method || 'Cash'}</span>
                          )}

                          {/* Payment Type Badge */}
                          {(!payment.type || payment.type === 'SUBSCRIPTION') ? (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-850 border border-emerald-100 uppercase tracking-wider">
                              {language === 'bn' ? 'মাসিক চাঁদা' : 'Sub'}
                            </span>
                          ) : payment.type === 'ADMISSION' ? (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-750 border border-blue-100 uppercase tracking-wider">
                              {language === 'bn' ? 'ভর্তি ফি 🎟️' : 'Admission 🎟️'}
                            </span>
                          ) : payment.type === 'DONATION' ? (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-750 border border-amber-100 uppercase tracking-wider">
                              {language === 'bn' ? 'দান / অনুদান 💝' : 'Donation 💝'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[8px] font-black px-1.5 py-0.5 rounded bg-purple-50 text-purple-750 border border-purple-100 uppercase tracking-wider">
                              {language === 'bn' ? 'অন্যান্য ফান্ড 🪙' : 'Other Fund 🪙'}
                            </span>
                          )}

                          {(payment.paymentStatus === 'verified' || payment.trxId) && (
                            <span className="inline-flex items-center gap-0.5 text-[7px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-650 border border-emerald-100 uppercase tracking-wider">
                              ✓ Verified
                            </span>
                          )}
                        </div>
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
                      {payment.month}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setViewingReceipt(payment)}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-black uppercase"
                      >
                        <Receipt size={14} />
                        View
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => setEditingPayment(payment)}
                            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-all cursor-pointer active:scale-90"
                            title={language === 'bn' ? 'সম্পাদনা করুন' : 'Edit Payment'}
                          >
                            <Edit size={14} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => setPaymentToDelete(payment)}
                            className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all cursor-pointer active:scale-90"
                            title={language === 'bn' ? 'ডিলিট করুন' : 'Delete Payment'}
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
            <div className="p-12 text-center">
              <p className="text-slate-400 text-sm font-bold">কোন পেমেন্ট রেকর্ড পাওয়া যায়নি</p>
            </div>
          )}
        </div>
      </div>

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
                {language === 'bn' ? 'আদায় রসিদটি মুছে ফেলতে চান?' : 'Are you sure you want to delete?'}
              </h3>
              
              <p className="text-slate-500 text-xs font-bold mb-6">
                {language === 'bn' 
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
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
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
                      alert(language === 'bn' 
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
                    <span className="animate-pulse">{language === 'bn' ? 'মুছে ফেলা হচ্ছে...' : 'Deleting...'}</span>
                  ) : (
                    <>{language === 'bn' ? 'নিশ্চিত ডিলিট' : 'Confirm Delete'}</>
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
