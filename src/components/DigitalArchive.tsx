/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Filter, Folder, FileText, Image, Calendar, Trash2, 
  Download, Eye, ExternalLink, Sparkles, X, FileMinus, UploadCloud, Info
} from 'lucide-react';
import { collection, query, onSnapshot, addDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAppContext } from '../context/AppContext';
import { logActivity } from '../lib/activity';

export interface ArchiveItem {
  id: string;
  title: string;
  titleBn: string;
  description: string;
  descriptionBn: string;
  category: 'report' | 'photo' | 'document';
  date: string;
  url: string;
  uploadedBy: string;
  createdAt: number;
}

export default function DigitalArchive() {
  const { language, isModerator, user, t } = useAppContext();
  const isBn = language === 'bn';

  const [archive, setArchive] = useState<ArchiveItem[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_digital_archive');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'report' | 'photo' | 'document'>('all');
  
  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ArchiveItem | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    titleBn: '',
    description: '',
    descriptionBn: '',
    category: 'report' as 'report' | 'photo' | 'document',
    date: new Date().toISOString().split('T')[0],
    url: ''
  });

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Fetch archives from Firestore
  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'digital_archive'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ArchiveItem[];
        setArchive(data);
        localStorage.setItem('nswo_digital_archive', JSON.stringify(data));
      } catch (err) {
        console.warn("Exception parsing archive database:", err);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'digital_archive');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Filter items
  const filteredItems = useMemo(() => {
    return archive.filter(item => {
      const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const cleanSearch = searchTerm.toLowerCase();
      const matchSearch = item.title.toLowerCase().includes(cleanSearch) || 
                          item.titleBn.toLowerCase().includes(cleanSearch) ||
                          item.description.toLowerCase().includes(cleanSearch) || 
                          item.descriptionBn.toLowerCase().includes(cleanSearch);
      return matchCategory && matchSearch;
    });
  }, [archive, categoryFilter, searchTerm]);

  // Handle actual file upload and convert to base64
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit check to prevent Firestore field size limit (max 2MB for base64 storage)
    if (file.size > 2 * 1024 * 1024) {
      alert(isBn ? "অনুগ্রহ করে ২ মেগাবাইটের কম সাইজের ছবি বা ফাইল আপলোড করুন।" : "Please upload a file smaller than 2MB.");
      return;
    }

    setUploadProgress(10);
    const reader = new FileReader();
    
    // Simulate progress while loading
    let progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev === null) {
          clearInterval(progressInterval);
          return null;
        }
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 15;
      });
    }, 100);

    reader.onload = () => {
      clearInterval(progressInterval);
      setUploadProgress(100);
      setTimeout(() => {
        setFormData(f => ({ ...f, url: reader.result as string }));
        setUploadProgress(null);
      }, 300);
    };

    reader.onerror = () => {
      clearInterval(progressInterval);
      alert(isBn ? "ফাইল লোড করতে ব্যর্থ হয়েছে!" : "Failed to load the selected file!");
      setUploadProgress(null);
    };

    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titleBn && !formData.title) return;
    if (!formData.date) return;

    // Use simulated or input link
    const fileUrl = formData.url || 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80';

    const localId = `local_arc_${Date.now()}`;
    const mainTitle = formData.titleBn || formData.title;
    const mainDesc = formData.descriptionBn || formData.description || '';

    const newItem: ArchiveItem = {
      id: localId,
      title: mainTitle,
      titleBn: mainTitle,
      description: mainDesc,
      descriptionBn: mainDesc,
      category: formData.category,
      date: formData.date,
      url: fileUrl,
      uploadedBy: user?.displayName || user?.email || 'Admin',
      createdAt: Date.now()
    };

    const updated = [newItem, ...archive];
    setArchive(updated);
    try {
      localStorage.setItem('nswo_digital_archive', JSON.stringify(updated));
    } catch {}

    const actMsg = `Uploaded new digital archive document: ${newItem.title}`;
    const actMsgBn = `নতুন ডিজিটাল আর্কাইভ ডকুমেন্ট এন্ট্রি করা হয়েছে: ${newItem.titleBn}`;
    await logActivity('archive_add', actMsg, actMsgBn).catch(() => {});

    setIsAddOpen(false);
    // Reset form
    setFormData({
      title: '',
      titleBn: '',
      description: '',
      descriptionBn: '',
      category: 'report',
      date: new Date().toISOString().split('T')[0],
      url: ''
    });

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return;
    }

    try {
      const dbItem = { ...newItem };
      delete (dbItem as any).id;
      await addDoc(collection(db, 'digital_archive'), dbItem);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'digital_archive');
    }
  };

  const handleDelete = async (item: ArchiveItem) => {
    if (!window.confirm(isBn ? 'আপনি কি নিশ্চিতভাবে এই ডকুমেন্টটি ডিলিট করতে চান?' : 'Are you sure you want to permanently delete this digital document archive record?')) {
      return;
    }

    const updated = archive.filter(i => i.id !== item.id);
    setArchive(updated);
    try {
      localStorage.setItem('nswo_digital_archive', JSON.stringify(updated));
    } catch {}

    const actMsg = `Deleted digital archive item: ${item.title}`;
    const actMsgBn = `ডিজিটাল আর্কাইভ ডকুমেন্ট ডিলিট করা হয়েছে: ${item.titleBn}`;
    await logActivity('archive_delete', actMsg, actMsgBn).catch(() => {});

    if (selectedItem?.id === item.id) setSelectedItem(null);

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return;
    }

    if (item.id.startsWith('local_')) return;

    try {
      await deleteDoc(doc(db, 'digital_archive', item.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `digital_archive/${item.id}`);
    }
  };

  return (
    <div className="space-y-6" id="digital-archive-panel">
      {/* Upper Glass Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-6 rounded-[2rem] border border-emerald-900/30 bg-black/40 backdrop-blur-xl shadow-xl gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1 px-2.5 rounded-full bg-amber-500/10 text-amber-400 font-mono text-[10px] uppercase tracking-wider border border-amber-500/20">
              📂 {isBn ? 'তথ্য ও ইতিহাস আর্কাইভ' : 'Secure Vault'}
            </span>
          </div>
          <h2 className="text-xl lg:text-2xl font-black text-white tracking-tight">
            {isBn ? 'ডিজিটাল আর্কাইভ ও পুরনো ফাইলসমূহ' : 'Digital Resource Archive'}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            {isBn 
              ? 'পূরাতন সভার কার্যবিবরণী, বার্ষিক কর্মপরিকল্পনা রিপোর্ট, প্রামাণ্য চিত্র ও সংস্থার গুরুত্বপূর্ণ কাগজপত্রের ডিজিটাল সংরক্ষিত রূপ।' 
              : 'Digital archive vault of old formal reports, legal organization papers, historical photos, resolutions.'
            }
          </p>
        </div>

        {isModerator && (
          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-605 text-slate-950 font-black px-5 py-3 rounded-2xl transition-all duration-300 shadow-md hover:scale-[1.03] cursor-pointer"
          >
            <Plus size={18} />
            <span>{isBn ? 'নতুন ফাইল রাখুন' : 'Archive New Document'}</span>
          </button>
        )}
      </div>

      {/* Control Filtering Hub */}
      <div className="p-4 rounded-2xl border border-white/5 bg-white/5 flex flex-col md:flex-row gap-4 items-center justify-between shadow-lg">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder={isBn ? 'ডকুমেন্ট বা বিবরণের নাম খুঁজুন...' : 'Search document keyword...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/40 text-sm pl-10 pr-4 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-amber-500 text-white placeholder-slate-400 transition-all"
          />
        </div>

        {/* Categories Tab */}
        <div className="flex gap-1.5 bg-black/40 p-1 rounded-xl overflow-x-auto max-w-full">
          {[
            { id: 'all', labelBn: 'সব ফাইল', labelEn: 'All Files', icon: Folder },
            { id: 'report', labelBn: 'পুরনো রিপোর্ট', labelEn: 'Old Reports', icon: FileText },
            { id: 'photo', labelBn: 'ছবি গ্যালারি', labelEn: 'Photos & Album', icon: Image },
            { id: 'document', labelBn: 'কাগজপত্র', labelEn: 'Documents', icon: FileText },
          ].map(tab => {
            const Icon = tab.icon;
            const active = categoryFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setCategoryFilter(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  active 
                    ? 'bg-amber-500 text-slate-950 shadow-sm' 
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={14} />
                <span>{isBn ? tab.labelBn : tab.labelEn}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid View */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-slate-400 text-xs">{isBn ? 'আর্কাইভ লোড হচ্ছে...' : 'Loading resources vault...'}</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 py-20 text-center rounded-[2rem] border border-white/5 bg-white/5/30">
          <div className="w-16 h-16 rounded-2xl bg-slate-900/40 border border-white/5 flex items-center justify-center mb-4 text-slate-500">
            <FileMinus size={32} />
          </div>
          <h3 className="font-bold text-white text-base mb-1">{isBn ? 'কোনো ফাইল খুঁজে পাওয়া যায়নি' : 'No Vault Items Found'}</h3>
          <p className="text-xs text-slate-400 max-w-[280px]">
            {isBn ? 'অনুসন্ধান ফিল্টার পরিবর্তন করুন অথবা অ্যাডমিন মারফত প্রয়োজনীয় ফাইল যুক্ত করুন।' : 'Change category filter keywords or upload new entries.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="group p-5 rounded-2xl border border-white/5 bg-gradient-to-br from-[#02180d] via-[#010c07] to-black hover:border-amber-500/30 transition-all duration-300 shadow-md relative overflow-hidden flex flex-col justify-between"
            >
              {/* Category tag */}
              <div className="flex items-center justify-between mb-4">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                  item.category === 'report' ? 'bg-[#1e293b]/80 text-blue-300 border border-blue-500/20' :
                  item.category === 'photo' ? 'bg-[#581c87]/65 text-purple-300 border border-purple-500/20' :
                  'bg-[#064e3b]/80 text-emerald-300 border border-emerald-500/20'
                }`}>
                  {item.category === 'report' ? <FileText size={11} /> : item.category === 'photo' ? <Image size={11} /> : <FileText size={11} />}
                  {item.category === 'report' 
                    ? (isBn ? 'রিপোর্ট' : 'Report') 
                    : item.category === 'photo' 
                      ? (isBn ? 'ছবি' : 'Photo') 
                      : (isBn ? 'ডকুমেন্ট' : 'Document')
                  }
                </span>

                <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                  <Calendar size={11} />
                  {item.date}
                </span>
              </div>

              {/* Title representation */}
              <div className="mb-4 flex-1">
                <h4 className="font-bold text-white text-base leading-tight tracking-tight group-hover:text-amber-400 transition-colors">
                  {isBn ? item.titleBn : item.title}
                </h4>
                <p className="text-xs text-slate-400 mt-2 line-clamp-3">
                  {isBn ? item.descriptionBn : item.description}
                </p>
              </div>

              {/* Action layout */}
              <div className="border-t border-white/5 pt-4.5 flex items-center justify-between gap-2 mt-4">
                <button
                  onClick={() => setSelectedItem(item)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-amber-300 transition-colors"
                >
                  <Eye size={14} />
                  <span>{isBn ? 'দেখুন' : 'View'}</span>
                </button>

                <div className="flex gap-2">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 hover:bg-white/5 text-slate-300 hover:text-white rounded-lg transition-colors border border-white/5"
                    title={isBn ? 'লিঙ্ক ওপেন' : 'Open Link'}
                  >
                    <ExternalLink size={14} />
                  </a>
                  
                  {isModerator && (
                    <button
                      onClick={() => handleDelete(item)}
                      className="p-1.5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-lg transition-colors border border-white/5"
                      title={isBn ? 'ডিলিট করুন' : 'Delete'}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Details Viewer Overlay Modal */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-2xl rounded-3xl bg-[#03150b] border border-white/10 p-6 shadow-2xl z-10 max-h-[90vh] overflow-y-auto custom-scrollbar text-white flex flex-col justify-between"
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-white/10 pb-4 mb-4">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-amber-400">
                    {selectedItem.category} • {selectedItem.date}
                  </span>
                  <h3 className="text-lg lg:text-xl font-bold leading-tight mt-1">
                    {isBn ? selectedItem.titleBn : selectedItem.title}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content body */}
              <div className="space-y-4 mb-6">
                {/* Visualizer Frame */}
                {selectedItem.category === 'photo' ? (
                  <div className="w-full h-64 rounded-xl border border-white/10 overflow-hidden bg-black flex items-center justify-center">
                    <img
                      src={selectedItem.url}
                      alt={selectedItem.title}
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="w-full bg-[#010905] p-5 rounded-xl border border-white/5 flex flex-col items-center justify-center text-center py-8">
                    <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-400 border border-amber-500/20 mb-3">
                      <FileText size={24} />
                    </div>
                    <span className="text-xs text-emerald-400 font-bold mb-1 uppercase tracking-widest">{selectedItem.category} format pdf</span>
                    <p className="text-[10px] text-slate-400 truncate max-w-[240px] mb-3">{selectedItem.url}</p>
                    <a
                      href={selectedItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs font-black bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2 rounded-xl"
                    >
                      <span>{isBn ? 'মূল ডকুমেন্টে যান' : 'Access Original Document'}</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}

                {/* Description */}
                <div>
                  <h5 className="text-xs font-bold uppercase text-slate-440 mb-1">{isBn ? 'ডকুমেন্ট বিবরণ' : 'Description'}</h5>
                  <p className="text-xs text-slate-300 leading-relaxed bg-black/30 p-3 rounded-lg border border-white/5">
                    {isBn ? selectedItem.descriptionBn : selectedItem.description}
                  </p>
                </div>

                {/* Meta details */}
                <div className="grid grid-cols-2 gap-4 text-xs border-t border-white/5 pt-4">
                  <div>
                    <span className="text-slate-400 block">{isBn ? 'সংযোজনকারী' : 'Uploaded By'}</span>
                    <span className="font-semibold text-white">{selectedItem.uploadedBy}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isBn ? 'সংযোজন তারিখ' : 'Timestamp Added'}</span>
                    <span className="font-semibold text-white">{new Date(selectedItem.createdAt).toLocaleDateString(isBn ? 'bn-BD' : 'en-US')}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-white/10 pt-4 flex gap-3 justify-end">
                <button
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/5 transition-colors border border-white/10"
                >
                  {isBn ? 'বন্ধ করুন' : 'Close'}
                </button>
                <a
                  href={selectedItem.url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2 rounded-xl text-xs font-black"
                >
                  <Download size={13} />
                  <span>{isBn ? 'ডাউনলোড' : 'Download File'}</span>
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upload/Add Modal */}
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
              className="relative w-full max-w-lg rounded-3xl bg-[#03150b] border border-white/10 p-6 shadow-2xl z-10 max-h-[90vh] overflow-y-auto custom-scrollbar text-white flex flex-col justify-between"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-400 animate-pulse" />
                  {isBn ? 'আর্কাইভে নতুন ফাইল রাখুন' : 'Archive Documents'}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Category select */}
                  <div>
                    <label className="block text-xs text-slate-300 font-bold mb-1">
                      {isBn ? 'ফাইল ক্যাটাগরি *' : 'Archive Category *'}
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData(f => ({ ...f, category: e.target.value as any }))}
                      className="w-full bg-black/40 text-xs px-3.5 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="report">{isBn ? 'রিপোর্ট / মিটিং কার্যবিবরণী' : 'Old Report'}</option>
                      <option value="photo">{isBn ? 'সংস্থার ছবি / ফটো অ্যালবাম' : 'Historical Photo'}</option>
                      <option value="document">{isBn ? 'দালিলিক কাগজপত্র' : 'General Document'}</option>
                    </select>
                  </div>

                  {/* Date select */}
                  <div>
                    <label className="block text-xs text-slate-300 font-bold mb-1">
                      {isBn ? 'ফাইল এর প্রকৃত তারিখ *' : 'Record Date *'}
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData(f => ({ ...f, date: e.target.value }))}
                      className="w-full bg-black/40 text-xs px-3.5 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Only Bangla Title (the main title input) */}
                <div>
                  <label className="block text-xs text-slate-300 font-bold mb-1">
                    {isBn ? 'ফাইলের বিবরণী নাম *' : 'File Identifier Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={isBn ? "যেমনঃ বাৎসরিক নিরীক্ষা রিপোর্ট ২০২৪" : "e.g. Annual Audit Report 2024"}
                    value={formData.titleBn}
                    onChange={(e) => setFormData(f => ({ ...f, titleBn: e.target.value, title: e.target.value }))}
                    className="w-full bg-black/40 text-xs px-3.5 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none focus:border-amber-500 placeholder-slate-500"
                  />
                </div>

                {/* Only Bangla Description (the main description input) */}
                <div>
                  <label className="block text-xs text-slate-300 font-bold mb-1">
                    {isBn ? 'সংক্ষিপ্ত তথ্যসার' : 'Brief Summary'}
                  </label>
                  <textarea
                    rows={3}
                    placeholder={isBn ? "যেমনঃ সাধারণ নির্বাহী কমিটির অধীনে নিরীক্ষা কার্যক্রমের চূড়ান্ত সিদ্ধান্ত সমূহ..." : "e.g. Summary findings and legal reports..."}
                    value={formData.descriptionBn}
                    onChange={(e) => setFormData(f => ({ ...f, descriptionBn: e.target.value, description: e.target.value }))}
                    className="w-full bg-black/40 text-xs p-3 rounded-xl border border-white/10 text-white focus:outline-none focus:border-amber-500 placeholder-slate-500"
                  />
                </div>

                {/* File Upload Area */}
                <div>
                  <label className="block text-xs text-slate-300 font-bold mb-1">
                    {isBn ? 'ফাইল/ছবি আপলোড করুন' : 'Upload File/Image'}
                  </label>
                  <input 
                    type="file"
                    id="real-file-picker"
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div 
                    onClick={() => document.getElementById('real-file-picker')?.click()}
                    className="rounded-xl border border-dashed border-white/20 hover:border-amber-400 hover:bg-amber-400/5 p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-black/25"
                  >
                    {uploadProgress !== null ? (
                      <div className="space-y-1 w-full max-w-[200px]">
                        <div className="flex justify-between text-[10px] text-amber-400 font-mono">
                          <span>{isBn ? 'ফাইল প্রস্তুত হচ্ছে...' : 'Processing...'}</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </div>
                    ) : formData.url && formData.url.startsWith('data:') ? (
                      <div className="flex flex-col items-center gap-1 text-xs text-emerald-400 font-bold">
                        <span className="p-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-1">✓</span>
                        <span>{isBn ? 'আপনার ফাইলটি সঠিকভাবে সংযুক্ত হয়েছে!' : 'Local document attached as Base64!'}</span>
                        <span className="text-[10px] text-slate-400 font-normal">({formData.url.substring(0, 30)}...)</span>
                      </div>
                    ) : formData.url ? (
                      <div className="flex flex-col items-center gap-1 text-xs text-emerald-400 font-bold">
                        <span className="p-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-1">✓</span>
                        <span>{isBn ? 'ফাইল সংযুক্ত হয়েছে!' : 'Document Attached Successfully!'}</span>
                        <span className="text-[10px] text-slate-400 font-normal">({formData.url})</span>
                      </div>
                    ) : (
                      <>
                        <UploadCloud size={28} className="text-amber-400 mb-2 animate-bounce" />
                        <p className="text-xs font-bold text-slate-200">{isBn ? 'মোবাইল বা পিসি থেকে ফাইল/ছবি সিলেক্ট করুন' : 'Click here to choose an actual file or image'}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{isBn ? 'পিডিএফ, জেপিজি, পিএনজি অথবা অফিস ডকুমেন্টস (সর্বোচ্চ ২ মেগাবাইট)' : 'Supports PDF, images, docs (max 2MB)'}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Direct Link Input Optional */}
                <div>
                  <label className="block text-xs text-slate-400 font-bold mb-1">
                    {isBn ? 'অথবা সরাসরি ফাইলের ওয়েব লিঙ্ক (URL)' : 'Or specify direct document URL link'}
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com/report.pdf"
                    value={formData.url}
                    onChange={(e) => setFormData(f => ({ ...f, url: e.target.value }))}
                    className="w-full bg-black/40 text-xs px-3.5 py-2.5 rounded-xl border border-white/10 text-white focus:outline-none focus:border-amber-500 placeholder-slate-500"
                  />
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
                    <span>{isBn ? 'ফাইল সংরক্ষণ করুন' : 'Save Document'}</span>
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
