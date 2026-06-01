/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Trash2, Calendar, FileText, CheckCircle, Clock, 
  MapPin, Users, Edit, BookOpen, AlertCircle, Sparkles, Download, 
  Search, ShieldAlert, Heart, Gift, ShoppingBag, ArrowRight, UserCheck, RefreshCw
} from 'lucide-react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAppContext } from '../context/AppContext';
import { logActivity } from '../lib/activity';

interface Beneficiary {
  id: string; // Document ID / local ID
  familyCode: string; // BF-001, BF-002, etc.
  name: string;
  nameBn: string;
  phone: string;
  nidCard?: string;
  address: string;
  addressBn: string;
  familyMembersCount: number;
  category: 'zakat_eligible' | 'poverty_stricken' | 'widowed' | 'disabled' | 'disaster_relief';
  createdBy: string;
  createdAt: number;
}

interface Distribution {
  id: string;
  beneficiaryId: string; // BF-XXX Code or doc ID
  beneficiaryName: string;
  beneficiaryNameBn: string;
  phone: string;
  itemTitle: string; // e.g. "Blanket" / "Ramadan Food Pack" / "Zakat Cash aid"
  itemTitleBn: string;
  quantity: string; // e.g. "1 Pack" / "5 Kg" / "৳2500"
  estimatedValue: number; // For aggregate financial estimates
  date: string;
  remarks?: string;
  createdBy: string;
  createdAt: number;
}

export default function ReliefDistribution() {
  const { language, isModerator, settings } = useAppContext();
  
  const [activeTab, setActiveTab] = useState<'distribution' | 'beneficiaries'>('distribution');
  
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_beneficiaries');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });

  const [distributions, setDistributions] = useState<Distribution[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_distributions');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });

  const [loadingBen, setLoadingBen] = useState(true);
  const [loadingDist, setLoadingDist] = useState(true);

  // Search filters
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [isAddBenOpen, setIsAddBenOpen] = useState(false);
  const [isGiveAidOpen, setIsGiveAidOpen] = useState(false);
  const [selectedBeneficiaryForAid, setSelectedBeneficiaryForAid] = useState<Beneficiary | null>(null);

  // Beneficiary form states
  const [benForm, setBenForm] = useState({
    name: '',
    nameBn: '',
    phone: '',
    nidCard: '',
    address: 'Nasirtek, Nalta',
    addressBn: 'নাছিরটেক, নলতা',
    familyMembersCount: 4,
    category: 'poverty_stricken' as Beneficiary['category']
  });

  // Distribution form states
  const [aidForm, setAidForm] = useState({
    itemTitle: '',
    itemTitleBn: '',
    quantity: '',
    estimatedValue: '',
    date: new Date().toISOString().split('T')[0],
    remarks: ''
  });

  // Load Beneficiary Ledger from Firestore
  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoadingBen(false);
      return;
    }

    const q = query(collection(db, 'beneficiaries'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Beneficiary[];
        setBeneficiaries(data);
        localStorage.setItem('nswo_beneficiaries', JSON.stringify(data));
      } catch (err) {
        console.warn("Exception parsing beneficiaries:", err);
      }
      setLoadingBen(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'beneficiaries');
      setLoadingBen(false);
    });

    return () => unsub();
  }, []);

  // Load Aid Distributions logs from Firestore
  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoadingDist(false);
      return;
    }

    const q = query(collection(db, 'distributions'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Distribution[];
        setDistributions(data);
        localStorage.setItem('nswo_distributions', JSON.stringify(data));
      } catch (err) {
        console.warn("Exception parsing aid distributions:", err);
      }
      setLoadingDist(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'distributions');
      setLoadingDist(false);
    });

    return () => unsub();
  }, []);

  // Aggregate Metrics Computations
  const stats = useMemo(() => {
    const totalFamilies = beneficiaries.length;
    const totalDistsCount = distributions.length;
    const totalAidVal = distributions.reduce((sum, d) => sum + (d.estimatedValue || 0), 0);
    return { totalFamilies, totalDistsCount, totalAidVal };
  }, [beneficiaries, distributions]);

  // Handle addition of beneficiary
  const handleAddBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!benForm.name || !benForm.nameBn || !benForm.phone) return;

    // Duplication Check
    const cleanPhone = benForm.phone.trim();
    const isDuplicate = beneficiaries.some(b => b.phone === cleanPhone);
    if (isDuplicate) {
      alert(language === 'bn' 
        ? '⚠️ এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একজন উপকারভোগী নথিভুক্ত আছেন!' 
        : '⚠️ A beneficiary family with this phone number is already registered!'
      );
      return;
    }

    const newCodeNum = beneficiaries.length + 101;
    const cleanCode = `BF-${newCodeNum}`;
    const localId = `local_ben_${Date.now()}`;
    
    const newBen: Beneficiary = {
      id: localId,
      familyCode: cleanCode,
      name: benForm.name,
      nameBn: benForm.nameBn,
      phone: cleanPhone,
      nidCard: benForm.nidCard,
      address: benForm.address,
      addressBn: benForm.addressBn,
      familyMembersCount: benForm.familyMembersCount,
      category: benForm.category,
      createdBy: 'sharifahamed016@gmail.com',
      createdAt: Date.now()
    };

    const updated = [newBen, ...beneficiaries];
    setBeneficiaries(updated);
    try {
      localStorage.setItem('nswo_beneficiaries', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'beneficiary_add',
      `Registered Needy Beneficiary family ${newBen.name} with code ${newBen.familyCode}`,
      `উপকারভোগী কল্যাণ তালিকায় নতুন পরিবার নথিভুক্তকরণ: '${newBen.nameBn}' (কার্ড কোড: ${newBen.familyCode})`
    ).catch(() => {});

    setIsAddBenOpen(false);

    // Reset Form
    setBenForm({
      name: '',
      nameBn: '',
      phone: '',
      nidCard: '',
      address: 'Nasirtek, Nalta',
      addressBn: 'নাছিরটেক, নলতা',
      familyMembersCount: 4,
      category: 'poverty_stricken'
    });

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return;
    }

    try {
      const dbBen = { ...newBen };
      delete (dbBen as any).id;
      await addDoc(collection(db, 'beneficiaries'), dbBen);
    } catch (err) {
      console.warn("Firestore error saving beneficiary:", err);
    }
  };

  // Handle relief aid dispatch submission
  const handleDispatchAid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBeneficiaryForAid || !aidForm.itemTitle || !aidForm.estimatedValue) return;

    // Safety Duplication warning within 30 days
    const wasHelpedRecently = distributions.some(d => 
      d.beneficiaryId === selectedBeneficiaryForAid.familyCode && 
      d.itemTitle.toLowerCase() === aidForm.itemTitle.toLowerCase()
    );

    if (wasHelpedRecently) {
      const confirmProceed = window.confirm(language === 'bn'
        ? `⚠️ সতর্কতা: এই উপকারভোগী পরিবার (${selectedBeneficiaryForAid.nameBn}) ইতিপূর্বে একই ত্রাণ/উপহার গ্রহণ করেছেন। আপনি কি পুনরায় এই বন্টনটি অনুমোদন করতে চান?`
        : `⚠️ Warning: This family (${selectedBeneficiaryForAid.name}) has already received an item under the same title category. Proceed anyway to log duplicate dispatch?`
      );
      if (!confirmProceed) return;
    }

    const val = parseFloat(aidForm.estimatedValue);
    const localId = `local_dist_${Date.now()}`;
    const newDist: Distribution = {
      id: localId,
      beneficiaryId: selectedBeneficiaryForAid.familyCode,
      beneficiaryName: selectedBeneficiaryForAid.name,
      beneficiaryNameBn: selectedBeneficiaryForAid.nameBn,
      phone: selectedBeneficiaryForAid.phone,
      itemTitle: aidForm.itemTitle,
      itemTitleBn: aidForm.itemTitleBn || aidForm.itemTitle,
      quantity: aidForm.quantity || '1 Units',
      estimatedValue: val,
      date: aidForm.date,
      remarks: aidForm.remarks,
      createdBy: 'sharifahamed016@gmail.com',
      createdAt: Date.now()
    };

    const updated = [newDist, ...distributions];
    setDistributions(updated);
    try {
      localStorage.setItem('nswo_distributions', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'relief_dispatch',
      `Dispatched Aid Pack '${newDist.itemTitle}' of value ৳${val} to Card Code ${selectedBeneficiaryForAid.familyCode}`,
      `ত্রাণ ও উপহার বন্টন সম্পন্ন: উপকারভোগী কার্ড '${selectedBeneficiaryForAid.familyCode}' এর '${selectedBeneficiaryForAid.nameBn}' পরিবারকে ৳${val} মূল্যের সাহায্যে '${newDist.itemTitleBn}' হস্তান্তর রেকর্ড করা হয়েছে।`
    ).catch(() => {});

    setIsGiveAidOpen(false);
    setSelectedBeneficiaryForAid(null);

    // Reset Form
    setAidForm({
      itemTitle: '',
      itemTitleBn: '',
      quantity: '',
      estimatedValue: '',
      date: new Date().toISOString().split('T')[0],
      remarks: ''
    });

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return;
    }

    try {
      const dbDist = { ...newDist };
      delete (dbDist as any).id;
      await addDoc(collection(db, 'distributions'), dbDist);
    } catch (err) {
      console.warn("Firestore error adding distribution log:", err);
    }
  };

  // Delete Beneficiary
  const handleDeleteBeneficiary = async (id: string) => {
    const confirmMsg = language === 'bn'
      ? 'আপনি কি এই উপকারভোগীকে তালিকা থেকে চিরতরে ডিলিট করতে চান?'
      : 'Are you sure you want to delete this beneficiary family from ledger?';
    if (!window.confirm(confirmMsg)) return;

    const filtered = beneficiaries.filter(b => b.id !== id);
    setBeneficiaries(filtered);
    try {
      localStorage.setItem('nswo_beneficiaries', JSON.stringify(filtered));
    } catch {}

    await logActivity('beneficiary_delete', `Removed beneficiary ID ${id}`, `কল্যাণ তালিকা থেকে একজন উপকারভোগীর রেকর্ড প্রত্যাহার করা হয়েছে।`).catch(() => {});

    if (id.startsWith('local_ben_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'beneficiaries', id));
    } catch (err) {
      console.warn("Firestore delete failed:", err);
    }
  };

  // Delete Distribution Log Row
  const handleDeleteDistributionDoc = async (id: string) => {
    const confirmMsg = language === 'bn'
      ? 'আপনি কি এই বিবরণী রসিদ লগটি প্রত্যাহার করতে চান?'
      : 'Are you sure you want to delete this distribution ledger log?';
    if (!window.confirm(confirmMsg)) return;

    const filtered = distributions.filter(d => d.id !== id);
    setDistributions(filtered);
    try {
      localStorage.setItem('nswo_distributions', JSON.stringify(filtered));
    } catch {}

    await logActivity('relief_delete', `Deleted distribution dispatch log ID ${id}`, `ত্রাণ ও যাকাত বন্টন তালিকা থেকে ১টি বন্টন রেকর্ড প্রত্যাহার করা হয়েছে।`).catch(() => {});

    if (id.startsWith('local_dist_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'distributions', id));
    } catch (err) {
      console.warn("Firestore delete failed:", err);
    }
  };

  // Search filter computes
  const filteredBeneficiaries = useMemo(() => {
    if (!searchQuery) return beneficiaries;
    const cq = searchQuery.toLowerCase();
    return beneficiaries.filter(b => 
      b.name.toLowerCase().includes(cq) ||
      b.nameBn.includes(cq) ||
      b.phone.includes(cq) ||
      b.familyCode.toLowerCase().includes(cq)
    );
  }, [beneficiaries, searchQuery]);

  const filteredDistributions = useMemo(() => {
    if (!searchQuery) return distributions;
    const cq = searchQuery.toLowerCase();
    return distributions.filter(d => 
      d.beneficiaryName.toLowerCase().includes(cq) ||
      d.beneficiaryNameBn.includes(cq) ||
      d.beneficiaryId.toLowerCase().includes(cq) ||
      d.itemTitle.toLowerCase().includes(cq) ||
      d.itemTitleBn.includes(cq)
    );
  }, [distributions, searchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Banner */}
      <div 
        className="p-6 md:p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden"
        style={{ backgroundColor: settings.themeColor || '#059669' }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <Gift size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 text-white rounded-full text-xs font-semibold uppercase tracking-wider">
            📦 {language === 'bn' ? 'স্বচ্ছ সাহায্য ও পুনর্বাসন' : 'Benevolent Assistance Ledger'}
          </span>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            {language === 'bn' ? 'ত্রাণ, যাকাত ও উপহার বন্টন রেজিষ্ট্রার' : 'Relief & Benevolent Distribution Hub'}
          </h2>
          <p className="text-white/85 text-xs md:text-sm max-w-xl font-medium">
            {language === 'bn'
              ? 'অসহায় দুস্থ পরিবারগুলোর তালিকা তৈরি এবং বন্যা, শীতবস্ত্র বা ঈদ উপহার বন্টনের ডিজিটাল হিসাব যা ডুপ্লিকেট ত্রাণ প্রদান এড়াতে সক্রিয় সাহায্য করে।'
              : 'Our official verification board to index regional underprivileged families and track the distribution of blanket, food-packs, or zakat funds.'
            }
          </p>
        </div>
        {isModerator && (
          <button
            onClick={() => setIsAddBenOpen(true)}
            className="z-10 flex items-center justify-center gap-2 px-5 py-3.5 bg-white text-slate-900 font-bold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-[1.02] transform transition-all text-sm self-start md:self-center"
          >
            <Plus size={18} />
            {language === 'bn' ? 'উপকারভোগী অন্তর্ভুক্তি' : 'Add Family Card'}
          </button>
        )}
      </div>

      {/* Stats Board */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-105 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <Users size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'নিবন্ধিত কার্ডধারী পরিবার' : 'Registered Beneficiary Families'}
            </p>
            <p className="text-base font-black text-slate-900">{stats.totalFamilies} {language === 'bn' ? 'টি দুস্থ পরিবার' : 'Homes'}</p>
          </div>
        </div>

        <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-rose-500/15 text-rose-400 rounded-2xl flex items-center justify-center shrink-0">
            <ShoppingBag size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-rose-400">
              {language === 'bn' ? 'সম্পন্ন বন্টন খাত' : 'Aid Outlets Dispatched'}
            </p>
            <p className="text-base font-black text-rose-400">{stats.totalDistsCount} {language === 'bn' ? 'বার সাহায্য বন্টন' : 'Dispatches'}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-105 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
            <Gift size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'বিতরণকৃত মোট আর্থিক মূল্য' : 'Total aid fiscal value'}
            </p>
            <p className="text-base font-black text-blue-600">৳{stats.totalAidVal.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Inner Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => { setActiveTab('distribution'); setSearchQuery(''); }}
          className={`pb-3 px-5 text-sm font-black uppercase transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === 'distribution' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          🎁 {language === 'bn' ? 'ত্রাণ ও উপহার বন্টন জাবেদা' : 'Aid Dispatch History'}
        </button>
        <button
          onClick={() => { setActiveTab('beneficiaries'); setSearchQuery(''); }}
          className={`pb-3 px-5 text-sm font-black uppercase transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === 'beneficiaries' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          📜 {language === 'bn' ? 'উপকারভোগী ফ্যামিলি লেজার' : 'Beneficiary Card Ledger'}
        </button>
      </div>

      {/* Operational Actions search */}
      <div className="bg-white p-4 rounded-3xl border border-slate-150 shadow-sm flex items-center gap-3">
        <Search className="text-slate-400" size={18} />
        <input
          type="text"
          placeholder={activeTab === 'distribution'
            ? (language === 'bn' ? 'গ্রহীতার নাম, কার্ড কোড বা ত্রাণের বিবরণ লিখে সার্চ করুন...' : 'Search dispatch registers, item titles, family codes...')
            : (language === 'bn' ? 'দুস্থ পরিবারের নাম, মোবাইল নং বা কার্ড BF কোড দিয়ে সার্চ করুন...' : 'Search by name, registered mobile, card BF-code...')
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full text-xs font-semibold outline-none text-slate-700 placeholder-slate-400"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="text-xs font-bold text-slate-400 hover:text-slate-900 bg-slate-100 p-1.5 rounded-lg">X</button>
        )}
      </div>

      {/* Main Tab Views */}
      {activeTab === 'distribution' ? (
        <div className="space-y-4">
          {loadingDist ? (
            <div className="text-center py-12 bg-white rounded-3xl border">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-slate-400 text-xs animate-pulse">{language === 'bn' ? 'বন্টন তালিকা লোড হচ্ছে...' : 'Loading distributions...'}</p>
            </div>
          ) : filteredDistributions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 text-slate-400 text-xs font-bold font-sans">
              ❌ {language === 'bn' ? 'কোনো বন্টন বা ত্রাণ বিতরণের বিবরণী মেলেনি।' : 'No distribution files found matching indices.'}
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-slate-150 overflow-hidden shadow-sm table-container">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-black tracking-wider text-slate-400 border-b">
                    <th className="p-4">{language === 'bn' ? 'তারিখ' : 'Date'}</th>
                    <th className="p-4">{language === 'bn' ? 'উপকারভোগী পরিবার' : 'Family Card Holder'}</th>
                    <th className="p-4">{language === 'bn' ? 'মোবাইল' : 'Phone'}</th>
                    <th className="p-4">{language === 'bn' ? 'বিতরণকৃত আইটেম' : 'Aid Dispatched Pack'}</th>
                    <th className="p-4">{language === 'bn' ? 'পরিমাণ' : 'Qty'}</th>
                    <th className="p-4 text-right">{language === 'bn' ? 'মূল্যমান (৳)' : 'Est. Cost'}</th>
                    {isModerator && <th className="p-4 text-center">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-650">
                  {filteredDistributions.map((dist) => (
                    <tr key={dist.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-4 font-mono">{dist.date}</td>
                      <td className="p-4">
                        <span className="font-mono text-slate-400 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-md mr-1.5 font-bold">
                          {dist.beneficiaryId}
                        </span>
                        <strong>{language === 'bn' ? dist.beneficiaryNameBn : dist.beneficiaryName}</strong>
                      </td>
                      <td className="p-4 font-mono text-slate-505">{dist.phone}</td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-extrabold text-[9px] uppercase border border-emerald-100">
                          {language === 'bn' ? dist.itemTitleBn : dist.itemTitle}
                        </span>
                        {dist.remarks && <p className="text-[9px] text-slate-400 mt-0.5 font-medium">"{dist.remarks}"</p>}
                      </td>
                      <td className="p-4 font-bold">{dist.quantity}</td>
                      <td className="p-4 text-right font-bold text-slate-900 font-mono">৳{dist.estimatedValue.toLocaleString()}</td>
                      {isModerator && (
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleDeleteDistributionDoc(dist.id)}
                            className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in">
          {loadingBen ? (
            <div className="text-center py-12 bg-white rounded-3xl border">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-slate-400 text-xs">{language === 'bn' ? 'উপকারভোগী তালিকা লোড হচ্ছে...' : 'Loading families ledgers...'}</p>
            </div>
          ) : filteredBeneficiaries.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border text-slate-400 text-xs font-black">
              ❌ {language === 'bn' ? 'কোনো উপকারভোগী নথির সন্ধান মেলেনি।' : 'No registered welfare cards matched searching fields.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredBeneficiaries.map((ben) => {
                const isZakat = ben.category === 'zakat_eligible';
                // Count family previous dispatches
                const historyCount = distributions.filter(d => d.beneficiaryId === ben.familyCode).length;

                return (
                  <div 
                    key={ben.id} 
                    className="bg-white rounded-[2rem] border border-slate-150 p-5 shadow-sm hover:shadow-md transition relative overflow-hidden"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono border">
                            {ben.familyCode}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                            isZakat 
                              ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                              : ben.category === 'widowed'
                              ? 'bg-purple-50 text-purple-700 border border-purple-100'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          }`}>
                            {ben.category === 'zakat_eligible' ? (language === 'bn' ? 'যাকাত যোগ্য' : 'Zakat Eligible') : ben.category === 'poverty_stricken' ? (language === 'bn' ? 'অত্যন্ত দরিদ্র' : 'Poverty Stricken') : ben.category === 'widowed' ? (language === 'bn' ? 'বিধবা সাহায্য' : 'Widowed Support') : (language === 'bn' ? 'প্রতিবন্ধী/দুর্যোগ সাহায্য' : 'Special Assist')}
                          </span>
                        </div>

                        <h3 className="text-sm font-black text-slate-900 tracking-tight">
                          {language === 'bn' ? ben.nameBn : ben.name}
                        </h3>

                        <div className="text-[10px] text-slate-400 mt-1 font-bold space-y-0.5">
                          <p>📱 Mobile: <strong className="text-slate-655 font-mono">{ben.phone}</strong></p>
                          <p>📍 Address: <strong className="text-slate-655">{language === 'bn' ? ben.addressBn : ben.address}</strong></p>
                          <p>👥 Household: <strong className="text-slate-655">{ben.familyMembersCount} members</strong></p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-3 shrink-0">
                        {isModerator && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleDeleteBeneficiary(ben.id)}
                              className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"
                            >
                              <Trash2 size={12} />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedBeneficiaryForAid(ben);
                                setIsGiveAidOpen(true);
                              }}
                              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase transition-all flex items-center gap-1"
                            >
                              🎁 {language === 'bn' ? 'ত্রাণ পাঠান' : 'Issue Aid'}
                            </button>
                          </div>
                        )}

                        <span className="text-[10px] font-black uppercase px-2.5 py-1 bg-slate-50 rounded-xl text-indigo-600 border border-slate-100">
                          {historyCount} Help Logs
                        </span>
                      </div>
                    </div>

                    {/* Miniature history list of items received */}
                    {historyCount > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-50 space-y-1">
                        <p className="text-[8px] font-black uppercase text-slate-450">ইতিপূর্বে সংগৃহীত সাহায্যসমূহ :</p>
                        <div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto">
                          {distributions.filter(d => d.beneficiaryId === ben.familyCode).map((d) => (
                            <span key={d.id} className="text-[9px] font-semibold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-100">
                              {language === 'bn' ? d.itemTitleBn : d.itemTitle} ({d.date})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Slide-over Beneficiary Addition Modal */}
      <AnimatePresence>
        {isAddBenOpen && (
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
                    {language === 'bn' ? '📜 নতুন দুস্থ পরিবার রেজিষ্ট্রেশন' : '📜 Register Beneficiary'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {language === 'bn' ? 'সাহায্য বন্টনের পূর্বে ডেটাবেজে তালিকাভুক্তকরণ' : 'Integrate needy families with localized card credentials'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsAddBenOpen(false)}
                  className="p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800 text-xs font-bold transition-all"
                >
                  X
                </button>
              </div>

              <form onSubmit={handleAddBeneficiary} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Family Representative Full Name (English) *</label>
                    <input
                      type="text"
                      required
                      placeholder="E.g., Momena Begum"
                      value={benForm.name}
                      onChange={(e) => setBenForm({ ...benForm, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold font-bold">গ্রহীতার নাম (বাংলা) *</label>
                    <input
                      type="text"
                      required
                      placeholder="উদা: মোমেনা বেগম"
                      value={benForm.nameBn}
                      onChange={(e) => setBenForm({ ...benForm, nameBn: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Phone / মোবাইল নম্বর *</label>
                    <input
                      type="tel"
                      required
                      placeholder="E.g., 017XXXXXXXX"
                      value={benForm.phone}
                      onChange={(e) => setBenForm({ ...benForm, phone: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">NID National Card No / এনআইডি নম্বর</label>
                    <input
                      type="text"
                      placeholder="Optional NID Number"
                      value={benForm.nidCard}
                      onChange={(e) => setBenForm({ ...benForm, nidCard: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Welfare Assessment Category / ক্যাটাগরি</label>
                    <select
                      value={benForm.category}
                      onChange={(e) => setBenForm({ ...benForm, category: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="zakat_eligible">{language === 'bn' ? '🕌 যাকাত পাওয়ার যোগ্য' : '🕌 Zakat Eligible'}</option>
                      <option value="poverty_stricken">{language === 'bn' ? '🛖 অত্যন্ত দরিদ্র / দিনমজুর' : '🛖 Extreme Poverty'}</option>
                      <option value="widowed">{language === 'bn' ? '👵 বিধবা / স্বামী পরিত্যক্তা' : '👵 Widowed Household'}</option>
                      <option value="disabled">{language === 'bn' ? '🩺 শারীরিক প্রতিবন্ধী পরিবার' : '🩺 Physically Challenged'}</option>
                      <option value="disaster_relief">{language === 'bn' ? '🌊 নদী ভাঙন / দুর্যোগ কবলিত' : '🌊 Emergency / Disaster Hit'}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total family members / সদস্য সংখ্যা</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="20"
                      value={benForm.familyMembersCount}
                      onChange={(e) => setBenForm({ ...benForm, familyMembersCount: parseInt(e.target.value) || 1 })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Village/Word No Address (English)</label>
                    <input
                      type="text"
                      value={benForm.address}
                      onChange={(e) => setBenForm({ ...benForm, address: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">গ্রাম ও ওয়ার্ড নম্বর (বাংলা) *</label>
                    <input
                      type="text"
                      value={benForm.addressBn}
                      onChange={(e) => setBenForm({ ...benForm, addressBn: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                </div>

                <div className="flex justify-end gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAddBenOpen(false)}
                    className="px-5 py-2.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase rounded-lg transition-all shadow-lg"
                  >
                    Register and Issue Card
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Slide-over Gifting / Relief Dispatch modal */}
      <AnimatePresence>
        {isGiveAidOpen && selectedBeneficiaryForAid && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[92] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md border border-slate-100 shadow-2xl p-6 md:p-8 space-y-6"
            >
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                    🎁 {language === 'bn' ? 'ত্রাণ ও যাকাত বন্টন ভাউচার' : 'Relief Goods Dispatch'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
                    Cardholder: {selectedBeneficiaryForAid.familyCode} | {language === 'bn' ? selectedBeneficiaryForAid.nameBn : selectedBeneficiaryForAid.name}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setIsGiveAidOpen(false);
                    setSelectedBeneficiaryForAid(null);
                  }}
                  className="p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800 text-xs font-bold transition-all"
                >
                  X
                </button>
              </div>

              {/* Duplicate collision check dashboard */}
              <div className="bg-amber-50 text-amber-900 p-4 rounded-2xl text-[10px] font-semibold border border-amber-100/60 leading-relaxed">
                📢 {language === 'bn' ? 'ডুপ্লিকেট ত্রাণ রোধ ইঞ্জিন' : 'Duplicate Relief Prevention Engine'} : <br />
                <span className="text-slate-600 font-normal">
                  {language === 'bn'
                    ? 'ব্যবস্থার ম্যাচিং সল্যুশন উপকারভোগীর বিগত ত্রাণ গ্রহণের তালিকা চেক করে। ভুল বা ডুপ্লিকেট সাহায্য এন্ট্রি এড়াতে সাবমিট করার পূর্বে আইটেম নিশ্চিত হোন।'
                    : 'System automatically checks the history logs of the beneficiary cards to safeguard organization buffers from duplicates.'
                  }
                </span>
              </div>

              <form onSubmit={handleDispatchAid} className="space-y-4">
                
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Relief aid title / আইটেমের ধরণ (English) *</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g., Winter Blanket Campaign"
                    value={aidForm.itemTitle}
                    onChange={(e) => setAidForm({ ...aidForm, itemTitle: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">আইটেমের নাম (বাংলা) *</label>
                  <input
                    type="text"
                    required
                    placeholder="উদা: শীতকালীন ত্রাণ সামগ্রী ও কম্বল"
                    value={aidForm.itemTitleBn}
                    onChange={(e) => setAidForm({ ...aidForm, itemTitleBn: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Qty distributed / পরিমাণ</label>
                  <input
                    type="text"
                    placeholder="E.g., 1 Blanket, 5 Kg Rice"
                    value={aidForm.quantity}
                    onChange={(e) => setAidForm({ ...aidForm, quantity: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-101 rounded-xl text-xs font-semibold outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Estimated Cost Value / আনুমানিক মূল্যমান (৳) *</label>
                  <input
                    type="number"
                    required
                    placeholder="E.g. 1500"
                    value={aidForm.estimatedValue}
                    onChange={(e) => setAidForm({ ...aidForm, estimatedValue: e.target.value })}
                    className="w-full px-3.5 py-3 bg-emerald-50 text-emerald-800 border-none rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <p className="text-[8px] text-slate-450 mt-0.5">Will be compiled toward cumulative distribution budget values.</p>
                </div>

                <div className="grid grid-cols-1 gap-1.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Distribution Date / তারিখ</label>
                    <input
                      type="date"
                      required
                      value={aidForm.date}
                      onChange={(e) => setAidForm({ ...aidForm, date: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Welfare notes / সংক্ষিপ্ত মন্তব্য</label>
                    <input
                      type="text"
                      placeholder="E.g., Dispatched directly by Sec Secretary"
                      value={aidForm.remarks}
                      onChange={(e) => setAidForm({ ...aidForm, remarks: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsGiveAidOpen(false);
                      setSelectedBeneficiaryForAid(null);
                    }}
                    className="px-5 py-2.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase rounded-lg transition-all shadow-lg"
                  >
                    Record Aid Handover
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
