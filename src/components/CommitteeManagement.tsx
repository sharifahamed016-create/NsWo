/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, ShieldCheck, Award, Users, Trash2, Calendar, Sparkles, X,
  TrendingUp, User, LayoutGrid, Network, Layers, ChevronDown, Check
} from 'lucide-react';
import { collection, query, onSnapshot, addDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAppContext } from '../context/AppContext';
import { useMembers } from '../hooks/useMembers';
import { logActivity } from '../lib/activity';

export interface CommitteeMember {
  id: string;
  memberId: string; // References actual Member document id
  name: string;
  nameBn: string;
  role: string;     // e.g. President, General Secretary, Advisor, Treasurer, Vice President
  roleBn: string;   // সভাপতি, সাধারণ সম্পাদক, advisor
  termYears: string; // e.g. "2026-2027", "2024-2025"
  weightRank: number; // sort rank (1 = Advisor, 2 = President, 3 = VP, 4 = Secretary, 5 = Treasurer, etc)
  photoURL?: string;
  phone?: string;
  createdAt: number;
}

export default function CommitteeManagement() {
  const { language, isModerator, t } = useAppContext();
  const isBn = language === 'bn';

  // Load actual organization members
  const { members: orgMembers = [], loading: membersLoading = false } = useMembers();

  const [committee, setCommittee] = useState<CommitteeMember[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_committee_members');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(true);
  const [selectedTerm, setSelectedTerm] = useState<string>('2026-2027');
  const [activeLayout, setActiveLayout] = useState<'hierarchy' | 'list'>('hierarchy');

  // Form state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    memberId: '',
    roleKey: 'advisor', // advisor, president, vice_president, secretary, treasurer, executive
    customRole: '',
    customRoleBn: '',
    termYears: '2026-2027',
  });

  // Default weight rankings & translations helper
  const roleMetadata = {
    advisor: { rank: 1, title: 'Advisor', titleBn: 'উপদেষ্টা মণ্ডলী' },
    president: { rank: 2, title: 'President', titleBn: 'সভাপতি' },
    vice_president: { rank: 3, title: 'Vice President', titleBn: 'সহ-সভাপতি' },
    secretary: { rank: 4, title: 'General Secretary', titleBn: 'সাধারণ সম্পাদক' },
    treasurer: { rank: 5, title: 'Treasurer', titleBn: 'কোষাধ্যক্ষ' },
    executive: { rank: 6, title: 'Executive Member', titleBn: 'কার্যনির্বাহী সদস্য' },
  };

  // Fetch committee from Firestore
  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'committee_members'), orderBy('weightRank', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CommitteeMember[];
        // Deduplicate and fallback
        setCommittee(data);
        localStorage.setItem('nswo_committee_members', JSON.stringify(data));
      } catch (err) {
        console.warn("Exception parsing committee roster:", err);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'committee_members');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Filter committee by term
  const termCommittee = useMemo(() => {
    // Sort primarily by weightRank and secondarily by date/creation
    return committee
      .filter(item => item.termYears === selectedTerm)
      .sort((a, b) => a.weightRank - b.weightRank);
  }, [committee, selectedTerm]);

  // List unique term years available in database or fallback presets
  const availableTerms = useMemo(() => {
    const terms = new Set<string>(['2026-2027', '2024-2025', '2022-2023']);
    committee.forEach(c => {
      if (c.termYears) terms.add(c.termYears);
    });
    return Array.from(terms).sort((a, b) => b.localeCompare(a));
  }, [committee]);

  // Tree representation partitions
  const treeLayout = useMemo(() => {
    return {
      advisors: termCommittee.filter(m => m.weightRank === 1),
      president: termCommittee.find(m => m.weightRank === 2),
      vps: termCommittee.filter(m => m.weightRank === 3),
      secretary: termCommittee.find(m => m.weightRank === 4),
      treasurer: termCommittee.find(m => m.weightRank === 5),
      others: termCommittee.filter(m => m.weightRank >= 6 || ![1, 2, 3, 4, 5].includes(m.weightRank))
    };
  }, [termCommittee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.memberId) return;

    // Resolve member names
    const matchedMember = orgMembers.find(m => m.id === formData.memberId);
    if (!matchedMember) return;

    const meta = roleMetadata[formData.roleKey as keyof typeof roleMetadata] || { rank: 10, title: 'Advisor', titleBn: 'উপদেষ্টা' };
    
    // Check custom overrides
    const finalRole = formData.roleKey === 'executive' && formData.customRole ? formData.customRole : meta.title;
    const finalRoleBn = formData.roleKey === 'executive' && formData.customRoleBn ? formData.customRoleBn : meta.titleBn;

    const localId = `local_cmt_${Date.now()}`;
    const newOfficer: CommitteeMember = {
      id: localId,
      memberId: formData.memberId,
      name: matchedMember.name,
      nameBn: matchedMember.nameBn || matchedMember.name,
      role: finalRole,
      roleBn: finalRoleBn,
      termYears: formData.termYears,
      weightRank: meta.rank,
      photoURL: matchedMember.photoURL || '',
      phone: matchedMember.phone || '',
      createdAt: Date.now()
    };

    const updated = [newOfficer, ...committee];
    setCommittee(updated);
    try {
      localStorage.setItem('nswo_committee_members', JSON.stringify(updated));
    } catch {}

    const detailText = `Appointed ${newOfficer.name} as ${newOfficer.role} for term ${newOfficer.termYears}`;
    const detailTextBn = `${newOfficer.nameBn}-কে ${newOfficer.termYears} মেয়াদের জন্য "${newOfficer.roleBn}" হিসেবে নিয়োগ প্রদান করা হয়েছে।`;
    await logActivity('committee_add', detailText, detailTextBn).catch(() => {});

    setIsAddOpen(false);
    setFormData({
      memberId: '',
      roleKey: 'advisor',
      customRole: '',
      customRoleBn: '',
      termYears: '2026-2027'
    });

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return;
    }

    try {
      const dbOfficer = { ...newOfficer };
      delete (dbOfficer as any).id;
      await addDoc(collection(db, 'committee_members'), dbOfficer);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'committee_members');
    }
  };

  const handleDelete = async (officer: CommitteeMember) => {
    if (!window.confirm(isBn ? 'আপনি কি কমিটি তালিকা থেকে এই সদস্যকে অপসারণ করতে চান?' : 'Are you sure you want to dismiss this member from executive committee role?')) {
      return;
    }

    const updated = committee.filter(c => c.id !== officer.id);
    setCommittee(updated);
    try {
      localStorage.setItem('nswo_committee_members', JSON.stringify(updated));
    } catch {}

    const detailText = `Dismissed ${officer.name} from committee role ${officer.role}`;
    const detailTextBn = `${officer.nameBn}-কে কমিটি থেকে প্রত্যাহার করা হয়েছে।`;
    await logActivity('committee_dismiss', detailText, detailTextBn).catch(() => {});

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return;
    }

    if (officer.id.startsWith('local_')) return;

    try {
      await deleteDoc(doc(db, 'committee_members', officer.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `committee_members/${officer.id}`);
    }
  };

  return (
    <div className="space-y-6" id="committee-mgmt-panel">
      {/* Premium Glass Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-6 rounded-[2rem] border border-emerald-900/30 bg-black/40 backdrop-blur-xl shadow-xl gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1 px-2.5 rounded-full bg-amber-500/10 text-amber-400 font-mono text-[10px] uppercase tracking-wider border border-amber-500/20">
              💎 {isBn ? 'সাংগঠনিক পরিষদ' : 'Executive Board'}
            </span>
          </div>
          <h2 className="text-xl lg:text-2xl font-black text-white tracking-tight">
            {isBn ? 'কমিটি ব্যবস্থাপনা ও পর্ষদ তালিকা' : 'Committee & Administrative Board'}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            {isBn 
              ? 'নিবন্ধিত সাধারণ সদস্যদের মধ্য থেকে বিভিন্ন কার্যকারী মেয়াদে দায়িত্বপ্রাপ্ত কর্মকর্তা ও উপদেষ্টা মণ্ডলীর তালিকা।' 
              : 'Appoint registered association members to administrative designations and track executive rosters.'
            }
          </p>
        </div>

        {isModerator && (
          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-5 py-3 rounded-2xl transition-all duration-300 shadow-md hover:scale-[1.03] cursor-pointer"
          >
            <Plus size={18} />
            <span>{isBn ? 'নতুন দায়িত্ব অর্পণ' : 'Assign New Role'}</span>
          </button>
        )}
      </div>

      {/* Roster Controls: layout selectors and terms selector */}
      <div className="p-4 rounded-2xl border border-white/5 bg-white/5 flex flex-col sm:flex-row gap-4 items-center justify-between">
        {/* Term Select tabs */}
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-400 whitespace-nowrap">
            📅 {isBn ? 'কার্যকাল মেয়াদী:' : 'Term Period:'}
          </span>
          <div className="flex gap-1.5 p-1 bg-black/35 rounded-xl">
            {availableTerms.map(term => (
              <button
                key={term}
                onClick={() => setSelectedTerm(term)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  selectedTerm === term 
                    ? 'bg-amber-500 text-slate-950 shadow-sm' 
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {term} {term === '2026-2027' && (isBn ? '(চলতি)' : '(Current)')}
              </button>
            ))}
          </div>
        </div>

        {/* Layout Select switch */}
        <div className="flex gap-1.5 bg-black/35 p-1 rounded-xl">
          <button
            onClick={() => setActiveLayout('hierarchy')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeLayout === 'hierarchy' 
                ? 'bg-[#064e3b] text-emerald-100 border border-emerald-500/20' 
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Network size={14} />
            <span>{isBn ? 'সাংগঠনিক চার্ট' : 'Hierarchy Chart'}</span>
          </button>
          <button
            onClick={() => setActiveLayout('list')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeLayout === 'list' 
                ? 'bg-[#064e3b] text-emerald-100 border border-emerald-500/20' 
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users size={14} />
            <span>{isBn ? 'সদস্য তালিকা সূচী' : 'Roster Table'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-slate-400 text-xs">{isBn ? 'কমিটি লোড হচ্ছে...' : 'Loading committee details...'}</p>
        </div>
      ) : termCommittee.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 py-20 text-center rounded-[2rem] border border-white/5 bg-white/5">
          <div className="w-16 h-16 rounded-2xl bg-slate-900/40 border border-white/5 flex items-center justify-center mb-4 text-slate-500">
            <Users size={32} />
          </div>
          <h3 className="font-bold text-white text-base mb-1">{isBn ? 'এই মেয়াদে কোনো পরিচালনা কমিটি কমিটি নেই' : 'No Roster for this Term'}</h3>
          <p className="text-xs text-slate-400 max-w-[340px]">
            {isBn ? 'ডান পাশের "নতুন দায়িত্ব অর্পণ" বাটন ক্লিক করে সদস্যদের অফিশিয়াল রোলগুলোতে বসান।' : 'Create mapping lists using "Assign New Role" action button.'}
          </p>
        </div>
      ) : activeLayout === 'hierarchy' ? (
        /* HIERARCHICAL ORG ALIGNMENT */
        <div className="space-y-12 pb-10" id="executive-hierarchy-map">
          {/* 1. Advisors level */}
          {treeLayout.advisors.length > 0 && (
            <div className="text-center space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center justify-center gap-1.5">
                <ShieldCheck size={14} />
                <span>{isBn ? 'উপদেষ্টা মণ্ডলী' : 'Advisory Board'}</span>
              </h4>
              <div className="flex flex-wrap justify-center gap-6">
                {treeLayout.advisors.map(adv => (
                  <CommitteeMemberCard officer={adv} key={adv.id} onDelete={handleDelete} isBn={isBn} isModerator={isModerator} isPremium />
                ))}
              </div>
            </div>
          )}

          {/* Connective visual string */}
          <div className="hidden md:flex justify-center -my-8">
            <div className="w-0.5 h-10 bg-gradient-to-b from-amber-500/10 to-emerald-500/20" />
          </div>

          {/* 2. President level */}
          {treeLayout.president && (
            <div className="text-center space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-[#10b981] flex items-center justify-center gap-1.5">
                <Award size={14} />
                <span>{isBn ? 'পরিষদ প্রধান' : 'President'}</span>
              </h4>
              <div className="flex justify-center">
                <CommitteeMemberCard officer={treeLayout.president} onDelete={handleDelete} isBn={isBn} isModerator={isModerator} isPresident />
              </div>
            </div>
          )}

          {/* Connective visual strings split */}
          <div className="hidden md:block w-full max-w-xl mx-auto -my-8">
            <div className="w-1/2 h-0.5 bg-emerald-500/10 mx-auto" />
            <div className="flex justify-between w-full h-10">
              <div className="w-0.5 h-10 bg-emerald-500/10 shadow-md ml-[25%]" />
              <div className="w-0.5 h-10 bg-emerald-500/10 shadow-md mr-[25%]" />
            </div>
          </div>

          {/* 3. Secretary and Treasurer levels */}
          {(treeLayout.secretary || treeLayout.treasurer) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto text-center">
              {treeLayout.secretary && (
                <div className="space-y-4 flex flex-col items-center">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-[#10b981] flex items-center gap-1.5 justify-center">
                    <Users size={14} />
                    <span>{isBn ? 'সম্পাদকীয় সচিব' : 'General Secretary'}</span>
                  </h4>
                  <CommitteeMemberCard officer={treeLayout.secretary} onDelete={handleDelete} isBn={isBn} isModerator={isModerator} />
                </div>
              )}
              {treeLayout.treasurer && (
                <div className="space-y-4 flex flex-col items-center">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-[#10b981] flex items-center gap-1.5 justify-center">
                    <TrendingUp size={14} />
                    <span>{isBn ? 'আর্থিক কোষাধ্যক্ষ' : 'Treasurer'}</span>
                  </h4>
                  <CommitteeMemberCard officer={treeLayout.treasurer} onDelete={handleDelete} isBn={isBn} isModerator={isModerator} />
                </div>
              )}
            </div>
          )}

          {/* 4. Exec / Volunteers lists */}
          {treeLayout.others.length > 0 && (
            <div className="text-center space-y-6 pt-6">
              <div className="w-12 h-0.5 bg-white/10 mx-auto" />
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {isBn ? 'কার্যনির্বাহী সংসদ সদস্যবৃন্দ' : 'Executive Board & Other Officers'}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {treeLayout.others.map(oth => (
                  <CommitteeMemberCard officer={oth} key={oth.id} onDelete={handleDelete} isBn={isBn} isModerator={isModerator} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ROSTER TABLE LISTING view */
        <div className="border border-white/5 bg-black/45 rounded-2xl overflow-hidden shadow-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-slate-300 font-bold">
                <th className="p-4">{isBn ? 'কর্মকর্তার নাম' : 'Officer Name'}</th>
                <th className="p-4">{isBn ? 'সাংগঠনিক পদবী' : 'Official Role'}</th>
                <th className="p-4">{isBn ? 'যোগাযোগ ফোন' : 'Contact Phone'}</th>
                <th className="p-4">{isBn ? 'কার্য মেয়াদ' : 'Term Years'}</th>
                {isModerator && <th className="p-4 text-center">{isBn ? 'অ্যাকশন' : 'Action'}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-100 font-semibold">
              {termCommittee.map(officer => (
                <tr key={officer.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 flex items-center gap-3">
                    <img
                      src={officer.photoURL || 'https://ui-avatars.com/api/?name=' + officer.name}
                      alt="Officer"
                      className="w-8 h-8 rounded-full border border-white/10"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <p className="font-bold text-white leading-tight">{isBn ? officer.nameBn : officer.name}</p>
                    </div>
                  </td>
                  <td className="p-4 text-amber-400 font-bold">{isBn ? officer.roleBn : officer.role}</td>
                  <td className="p-4 text-slate-300 font-mono">{officer.phone || 'N/A'}</td>
                  <td className="p-4 font-bold text-emerald-400">{officer.termYears}</td>
                  {isModerator && (
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleDelete(officer)}
                        className="p-1 px-2.5 rounded-lg border border-[#e11d48]/20 bg-rose-950/15 text-rose-400 hover:bg-rose-900/35 hover:text-rose-300 transition-all cursor-pointer text-[10px]"
                      >
                        {isBn ? 'অপসারণ' : 'Remove'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Appoint Officer Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md rounded-3xl bg-[#03150b] border border-white/10 p-6 shadow-2xl z-10 max-h-[90vh] overflow-y-auto custom-scrollbar text-white flex flex-col justify-between"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-400 antialiased animate-pulse" />
                  {isBn ? 'কমিটিতে সদস্য নির্ধারণ' : 'Assign Officer'}
                </h3>
                <button
                  onClick={() => setIsAddOpen(false)}
                  className="p-1 px-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg text-sm"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Form submit */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 1. Member Choice dropdown */}
                <div>
                  <label className="block text-xs text-slate-300 font-bold mb-1">
                    {isBn ? 'সাধারণ সদস্য নির্বাচন করুন *' : 'Select Registered Member *'}
                  </label>
                  {membersLoading ? (
                    <div className="text-xs text-slate-400 italic">Loading active members list...</div>
                  ) : (
                    <select
                      required
                      value={formData.memberId}
                      onChange={(e) => setFormData(f => ({ ...f, memberId: e.target.value }))}
                      className="w-full bg-black/40 text-xs px-3.5 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none focus:border-amber-500 whitespace-nowrap"
                    >
                      <option value="">{isBn ? '-- সদস্য নির্বাচন করুন --' : '-- Choose Member --'}</option>
                      {orgMembers.map(m => (
                        <option value={m.id} key={m.id}>
                          [{m.memberId}] {isBn ? m.nameBn : m.name} ({m.phone})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 2. Position select */}
                <div>
                  <label className="block text-xs text-slate-300 font-bold mb-1">
                    {isBn ? 'পর্ষদীয় পদবী নির্বাচন *' : 'Administrative Role *'}
                  </label>
                  <select
                    value={formData.roleKey}
                    onChange={(e) => setFormData(f => ({ ...f, roleKey: e.target.value }))}
                    className="w-full bg-black/40 text-xs px-3.5 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="advisor">{isBn ? 'উপদেষ্টা (Advisor)' : 'Advisor'}</option>
                    <option value="president">{isBn ? 'সভাপতি (President)' : 'President'}</option>
                    <option value="vice_president">{isBn ? 'সহ-সভাপতি (Vice President)' : 'Vice President'}</option>
                    <option value="secretary">{isBn ? 'সাধারণ সম্পাদক (General Secretary)' : 'General Secretary'}</option>
                    <option value="treasurer">{isBn ? 'কোষাধ্যক্ষ (Treasurer)' : 'Treasurer'}</option>
                    <option value="executive">{isBn ? 'অন্যান্য / কাস্টম পদবী (Custom Office)' : 'Custom Position'}</option>
                  </select>
                </div>

                {/* 3. Custom Position fields if selected */}
                {formData.roleKey === 'executive' && (
                  <div className="grid grid-cols-2 gap-3 bg-black/20 p-3 rounded-xl border border-white/5 animate-fadeIn">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-1">Role Title (EN)</label>
                      <input
                        type="text"
                        placeholder="e.g. Media Officer"
                        required
                        value={formData.customRole}
                        onChange={(e) => setFormData(f => ({ ...f, customRole: e.target.value }))}
                        className="w-full bg-black/60 text-xs px-3 py-2 rounded-lg border border-white/10 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-1">পদবী নাম (BN)</label>
                      <input
                        type="text"
                        placeholder="যেমনঃ তথ্য কর্মকর্তা"
                        required
                        value={formData.customRoleBn}
                        onChange={(e) => setFormData(f => ({ ...f, customRoleBn: e.target.value }))}
                        className="w-full bg-black/60 text-xs px-3 py-2 rounded-lg border border-white/10 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                )}

                {/* 4. Term select */}
                <div>
                  <label className="block text-xs text-slate-300 font-bold mb-1">
                    {isBn ? 'কার্যকাল মেয়াদ সেশন *' : 'Roster Active Term *'}
                  </label>
                  <select
                    value={formData.termYears}
                    onChange={(e) => setFormData(f => ({ ...f, termYears: e.target.value }))}
                    className="w-full bg-black/40 text-xs px-3.5 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="2026-2027">2026-2027</option>
                    <option value="2024-2025">2024-2025</option>
                    <option value="2022-2023">2022-2023</option>
                  </select>
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-3 border-t border-white/10 pt-4 mt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/5 transition-colors border border-white/10"
                  >
                    {isBn ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{isBn ? 'সদস্য নিয়োগ করুন' : 'Assign Duty'}</span>
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

/* EXTRACTED PRESTIGE MEMBER BIO CARD WIDGET */
interface CardProps {
  key?: any;
  officer: CommitteeMember;
  onDelete: (item: CommitteeMember) => void;
  isBn: boolean;
  isModerator: boolean;
  isPremium?: boolean;
  isPresident?: boolean;
}

function CommitteeMemberCard({ officer, onDelete, isBn, isModerator, isPremium = false, isPresident = false }: CardProps) {
  return (
    <div className={`p-4 rounded-2xl border transition-all duration-300 flex items-center gap-4 text-left shadow-md relative group text-white min-w-[240px] max-w-[310px] overflow-hidden ${
      isPremium 
        ? 'bg-gradient-to-r from-amber-950/20 via-[#10301a]/30 to-[#0c2a16]/40 border-amber-500/20' 
        : isPresident
          ? 'bg-gradient-to-r from-emerald-950/30 via-[#10301a]/30 to-black border-[#10b981]/30 hover:border-[#10b981]/50 scale-[1.05]'
          : 'bg-[#03150b] border-white/5 hover:border-emerald-500/30'
    }`}>
      {/* Mini gold crown for premium advisors */}
      {isPremium && (
        <span className="absolute top-1 right-2.5 text-[9px] font-bold text-amber-400 font-mono tracking-widest leading-none drop-shadow-lg">
          ADVISOR
        </span>
      )}

      {/* Avatar */}
      <img
        src={officer.photoURL || 'https://ui-avatars.com/api/?name=' + officer.name}
        alt="officer bio"
        className="w-13 h-13 rounded-xl border border-white/10 object-cover shadow-sm bg-slate-950"
        referrerPolicy="no-referrer"
      />

      {/* Rationale details */}
      <div className="flex-1 min-w-0 pr-4">
        <h5 className="font-extrabold text-white text-sm truncate leading-tight">
          {isBn ? officer.nameBn : officer.name}
        </h5>
        <p className={`text-[10px] font-black mt-1 py-0.5 px-2 rounded-md inline-block tracking-wider uppercase ${
          isPremium 
            ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' 
            : 'bg-emerald-950/40 text-emerald-300'
        }`}>
          {isBn ? officer.roleBn : officer.role}
        </p>
        <p className="text-[10px] text-slate-400 font-mono mt-1 pr-1 truncate">
          📞 {officer.phone || 'No phone'}
        </p>
      </div>

      {/* Delete trigger for moderators */}
      {isModerator && (
        <button
          onClick={() => onDelete(officer)}
          className="absolute right-2.5 bottom-2.5 p-1 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded-lg transition-colors border border-transparent hover:border-rose-500/10"
          title={isBn ? 'পদ প্রত্যাহার' : 'Dismiss Role'}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
