/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Trash2, Calendar, FileText, CheckCircle, Clock, 
  MapPin, Users, Edit, BookOpen, AlertCircle, Sparkles, Download, MessageSquare
} from 'lucide-react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAppContext } from '../context/AppContext';
import { logActivity } from '../lib/activity';

interface Notice {
  id: string;
  title: string;
  titleBn: string;
  type: 'notice' | 'resolution' | 'announcement';
  date: string;
  time?: string;
  location?: string;
  locationBn?: string;
  content: string;
  contentBn: string;
  presentMembers?: string; // Comma-separated or bullet list of presenters
  decisions?: string; // Resolution decisions
  decisionsBn?: string;
  createdBy: string;
  createdAt: number;
}

export default function NoticeBoard() {
  const { language, isModerator, settings } = useAppContext();
  
  const [notices, setNotices] = useState<Notice[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_notices');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'notice' | 'resolution' | 'announcement'>('all');

  // Form states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    titleBn: '',
    type: 'notice' as 'notice' | 'resolution' | 'announcement',
    date: new Date().toISOString().split('T')[0],
    time: '',
    location: '',
    locationBn: '',
    content: '',
    contentBn: '',
    presentMembers: '',
    decisions: '',
    decisionsBn: ''
  });

  // Load from Firestore
  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Notice[];
        setNotices(data);
        localStorage.setItem('nswo_notices', JSON.stringify(data));
      } catch (err) {
        console.warn("Exception parsing notices:", err);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notices');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.content) return;

    const localId = `local_ntc_${Date.now()}`;
    const newNotice: Notice = {
      id: localId,
      title: formData.title,
      titleBn: formData.titleBn || formData.title,
      type: formData.type,
      date: formData.date,
      time: formData.time,
      location: formData.location || '',
      locationBn: formData.locationBn || formData.location || '',
      content: formData.content,
      contentBn: formData.contentBn || formData.content,
      presentMembers: formData.presentMembers,
      decisions: formData.decisions,
      decisionsBn: formData.decisionsBn,
      createdBy: 'sharifahamed016@gmail.com',
      createdAt: Date.now()
    };

    const updated = [newNotice, ...notices];
    setNotices(updated);
    try {
      localStorage.setItem('nswo_notices', JSON.stringify(updated));
    } catch {}

    const detailText = `Created Notice '${newNotice.title}'`;
    const detailTextBn = `ডিজিটাল নোটিশ ও নোটিশ বোর্ড ফাইল '${newNotice.titleBn}' তৈরি করা হয়েছে।`;
    await logActivity('notice_add', detailText, detailTextBn).catch(() => {});

    setIsAddOpen(false);

    // Reset Form
    setFormData({
      title: '',
      titleBn: '',
      type: 'notice',
      date: new Date().toISOString().split('T')[0],
      time: '',
      location: '',
      locationBn: '',
      content: '',
      contentBn: '',
      presentMembers: '',
      decisions: '',
      decisionsBn: ''
    });

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return;
    }

    try {
      const dbNotice = { ...newNotice };
      delete (dbNotice as any).id;
      await addDoc(collection(db, 'notices'), dbNotice);
    } catch (err) {
      console.warn("Firestore error adding notice:", err);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmMsg = language === 'bn' 
      ? 'আপনি কি নিশ্চিত যে এই নোটিশ/রেজোলিউশনটি মুছে ফেলতে চান?' 
      : 'Are you sure you want to delete this notice/resolution?';
    
    if (!window.confirm(confirmMsg)) return;

    const filtered = notices.filter(n => n.id !== id);
    setNotices(filtered);
    try {
      localStorage.setItem('nswo_notices', JSON.stringify(filtered));
    } catch {}

    await logActivity('notice_delete', `Deleted Notice ID ${id}`, `একটি নোটিশ/রেজোলিউশন এন্ট্রি মুছে ফেলা হয়েছে।`).catch(() => {});

    if (id.startsWith('local_ntc_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'notices', id));
    } catch (err) {
      console.warn("Firestore delete failed:", err);
    }
  };

  const filteredNotices = useMemo(() => {
    if (activeTab === 'all') return notices;
    return notices.filter(n => n.type === activeTab);
  }, [notices, activeTab]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Banner */}
      <div 
        className="p-6 md:p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden"
        style={{ backgroundColor: settings.themeColor || '#059669' }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <BookOpen size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 text-white rounded-full text-xs font-semibold uppercase tracking-wider">
            🏛️ {language === 'bn' ? 'ডিজিটাল নোটিশ ও রেজোলিউশন' : 'Official Secretariat'}
          </span>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            {language === 'bn' ? 'ডিজিটাল নোটিশ বোর্ড ও রেজোলিউশন বুক' : 'Notice Board & Resolution Book'}
          </h2>
          <p className="text-white/85 text-xs md:text-sm max-w-xl font-medium">
            {language === 'bn'
              ? 'সংস্থার সাধারণ নোটিশ, মিটিংয়ের আলোচ্য সূচি, ও রেজোলিউশন বুক বা গৃহিত সিদ্ধান্তের ডিজিটাল সংগ্রহশালা।'
              : 'Our official central registry for announcements, urgent meeting circulars, and historical resolution archives.'
            }
          </p>
        </div>
        {isModerator && (
          <button
            onClick={() => setIsAddOpen(true)}
            className="z-10 flex items-center justify-center gap-2 px-5 py-3.5 bg-white text-slate-900 font-bold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-[1.02] transform transition-all text-sm self-start md:self-center"
          >
            <Plus size={18} />
            {language === 'bn' ? 'নতুন নোটিশ প্রদান' : 'Add Board Notice'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-2xl gap-2 w-full max-w-lg mx-auto">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-2 px-3 text-xs font-black uppercase rounded-xl transition-all ${
            activeTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          {language === 'bn' ? 'সব নোটিশ' : 'All Board'}
        </button>
        <button
          onClick={() => setActiveTab('notice')}
          className={`flex-1 py-2 px-3 text-xs font-black uppercase rounded-xl transition-all ${
            activeTab === 'notice' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          📢 {language === 'bn' ? 'মিটিং নোটিশ' : 'Notices'}
        </button>
        <button
          onClick={() => setActiveTab('resolution')}
          className={`flex-1 py-2 px-3 text-xs font-black uppercase rounded-xl transition-all ${
            activeTab === 'resolution' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          📜 {language === 'bn' ? 'রেজোলিউশন বুক' : 'Resolutions'}
        </button>
        <button
          onClick={() => setActiveTab('announcement')}
          className={`flex-1 py-2 px-3 text-xs font-black uppercase rounded-xl transition-all ${
            activeTab === 'announcement' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          🔔 {language === 'bn' ? 'সাধারণ ঘোষণা' : 'Announcements'}
        </button>
      </div>

      {/* Notice List Cards */}
      {loading ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm font-medium animate-pulse">{language === 'bn' ? 'লোড হচ্ছে...' : 'Loading announcements...'}</p>
        </div>
      ) : filteredNotices.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-2">
          <div className="w-12 h-12 bg-slate-100 text-slate-500 flex items-center justify-center rounded-2xl mx-auto font-black text-lg">📄</div>
          <p className="text-slate-500 text-xs font-bold">{language === 'bn' ? 'কোনো বিষয় পাওয়া যায়নি।' : 'No notice items posted yet on this board.'}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredNotices.map((notice) => (
            <motion.div 
              key={notice.id} 
              layout
              className="bg-white rounded-[2rem] border border-slate-150 p-6 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
            >
              {/* Corner badge indicating type */}
              <div className="absolute top-0 right-0 h-1.5 w-full bg-slate-100">
                <div 
                  className={`h-full ${
                    notice.type === 'notice' ? 'bg-blue-500' : notice.type === 'resolution' ? 'bg-emerald-500' : 'bg-purple-500'
                  }`}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        notice.type === 'notice' 
                          ? 'bg-blue-50 text-blue-600 border border-blue-100'
                          : notice.type === 'resolution'
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          : 'bg-purple-50 text-purple-600 border border-purple-100'
                      }`}>
                        {notice.type === 'notice' ? (language === 'bn' ? 'মিটিং নোটিশ' : 'Meeting Notice') : notice.type === 'resolution' ? (language === 'bn' ? 'রেজোলিউশন বুক/সিদ্ধান্ত' : 'Resolution Book') : (language === 'bn' ? 'সাধারণ ঘোষণা' : 'General Announcement')}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                        <Clock size={11} /> {notice.date} {notice.time ? `@ ${notice.time}` : ''}
                      </span>
                    </div>
                    <h3 className="text-base font-black text-slate-900 tracking-tight leading-snug">
                      {language === 'bn' ? notice.titleBn : notice.title}
                    </h3>
                  </div>

                  {isModerator && (
                    <button 
                      onClick={() => handleDelete(notice.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all self-start"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Content text */}
                <div className="text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-line bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  {language === 'bn' ? notice.contentBn : notice.content}
                </div>

                {/* Additional metadata for Meeting Notices or Resolutions */}
                {(notice.location || notice.locationBn) && (
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
                    <MapPin size={12} className="text-slate-400" />
                    <span>{language === 'bn' ? notice.locationBn : notice.location}</span>
                  </div>
                )}

                {/* Resolution extra: Present members & decisions taken */}
                {notice.type === 'resolution' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4 mt-1 text-[11px] leading-relaxed">
                    {notice.presentMembers && (
                      <div className="space-y-1 bg-emerald-50/30 p-3 rounded-xl border border-emerald-50">
                        <p className="font-black text-emerald-800 flex items-center gap-1">
                          <Users size={12} />
                          {language === 'bn' ? 'উপস্থিত সদস্যবৃন্দ:' : 'Attended Members:'}
                        </p>
                        <p className="text-slate-600 font-semibold">{notice.presentMembers}</p>
                      </div>
                    )}
                    {(notice.decisions || notice.decisionsBn) && (
                      <div className="space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <p className="font-black text-slate-800 flex items-center gap-1">
                          <CheckCircle size={12} className="text-emerald-500" />
                          {language === 'bn' ? 'গৃহিত সিদ্ধান্তসমূহ:' : 'Decisions Approved:'}
                        </p>
                        <p className="text-slate-600 font-medium whitespace-pre-line">
                          {language === 'bn' ? notice.decisionsBn : notice.decisions}
                        </p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Slide-over Add Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[92] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-100 shadow-2xl p-6 md:p-8 space-y-6"
            >
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    {language === 'bn' ? '🏛️ নতুন নোটিশ ও দলিল যুক্ত করুন' : '🏛️ Publish Official Document'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {language === 'bn' ? 'মেম্বার ড্যাশবোর্ডে সরাসরি প্রদর্শিত হবে' : 'Broadcasts instantly to member logs'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsAddOpen(false)}
                  className="p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800 text-xs font-bold transition-all"
                >
                  X
                </button>
              </div>

              <form onSubmit={handleAddSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Document Type / ধরন *</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="notice">{language === 'bn' ? '📢 মিটিং নোটিশ' : '📢 Meeting Notice'}</option>
                      <option value="resolution">{language === 'bn' ? '📜 রেজোলিউশন বুক/সিদ্ধান্ত' : '📜 Meeting Resolution'}</option>
                      <option value="announcement">{language === 'bn' ? '🔔 সাধারণ ঘোষণা' : '🔔 General Announcement'}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Publish Date / তারিখ *</label>
                    <input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Title (English) *</label>
                    <input
                      type="text"
                      required
                      placeholder="E.g., Special Advisory AGM Meeting"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">শিরোনাম (বাংলা) *</label>
                    <input
                      type="text"
                      required
                      placeholder="উদা: বিশেষ সাধারণ উপদেষ্টা সভা"
                      value={formData.titleBn}
                      onChange={(e) => setFormData({ ...formData, titleBn: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {formData.type === 'notice' && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Meeting Time / সময়</label>
                        <input
                          type="text"
                          placeholder="E.g., 04:30 PM"
                          value={formData.time}
                          onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Location / স্থান (English)</label>
                        <input
                          type="text"
                          placeholder="E.g., Secretariat Office"
                          value={formData.location}
                          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">মিটিং স্থান (বাংলা)</label>
                        <input
                          type="text"
                          placeholder="উদা: সংস্থার কার্যালয়"
                          value={formData.locationBn}
                          onChange={(e) => setFormData({ ...formData, locationBn: e.target.value })}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Content Body (English) *</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Write detailed document details..."
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">নোটিশ বিবরণ (বাংলা) *</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="বিস্তারিত বিবরণ বাংলায় লিখুন..."
                    value={formData.contentBn}
                    onChange={(e) => setFormData({ ...formData, contentBn: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  />
                </div>

                {formData.type === 'resolution' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Present Members (English/বাংলা)</label>
                      <input
                        type="text"
                        placeholder="E.g., S. Ahamed, M. Rahman"
                        value={formData.presentMembers}
                        onChange={(e) => setFormData({ ...formData, presentMembers: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Approved Decisions (English)</label>
                      <textarea
                        rows={2}
                        placeholder="Decisions taken in meeting..."
                        value={formData.decisions}
                        onChange={(e) => setFormData({ ...formData, decisions: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">নেওয়া সিদ্ধান্তসমূহ (বাংলা)</label>
                      <textarea
                        rows={2}
                        placeholder="মিটিংয়ে সই হওয়া গুরুত্বপূর্ণ সিদ্ধান্তগুলো..."
                        value={formData.decisionsBn}
                        onChange={(e) => setFormData({ ...formData, decisionsBn: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-100 border-none rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="px-5 py-2.5 bg-slate-100 text-slate-500 hover:bg-slate-200 text-[10px] font-black uppercase rounded-lg transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase rounded-lg transition-all shadow-lg"
                  >
                    Publish Post
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
