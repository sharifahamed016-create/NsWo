/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Trash2, Calendar, CheckCircle, Clock, 
  MapPin, Users, Edit, BookOpen, AlertCircle, Sparkles, DollarSign,
  TrendingUp, Award, Heart, BarChart2, Briefcase, Gift, Globe
} from 'lucide-react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAppContext } from '../context/AppContext';
import { logActivity } from '../lib/activity';

interface Donation {
  id: string;
  donorName: string;
  donorNameBn: string;
  amount: number;
  date: string;
  location?: string; // e.g. Country or village, e.g. 'United Kingdom' or 'Nasirtek'
  locationBn?: string;
  remarks?: string;
  paymentMethod?: string;
}

interface SpecialProject {
  id: string;
  name: string;
  nameBn: string;
  description: string;
  descriptionBn: string;
  targetBudget: number;
  raisedAmount: number;
  startDate: string;
  endDate: string;
  status: 'planning' | 'active' | 'completed';
  donations: Donation[];
  createdBy: string;
  createdAt: number;
}

export default function SpecialProjects() {
  const { language, isModerator, settings } = useAppContext();
  
  const [projects, setProjects] = useState<SpecialProject[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_special_projects');
      if (cached) return JSON.parse(cached);
    } catch {}
    // Initial defaults if cache is empty
    return [];
  });
  const [loading, setLoading] = useState(true);

  // Modals view trigger
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [isRecordDonationOpen, setIsRecordDonationOpen] = useState(false);
  const [selectedProjectForDonation, setSelectedProjectForDonation] = useState<SpecialProject | null>(null);

  // New Project Form Data
  const [projectForm, setProjectForm] = useState({
    name: '',
    nameBn: '',
    description: '',
    descriptionBn: '',
    targetBudget: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    status: 'active' as SpecialProject['status']
  });

  // New Donation Form Data
  const [donationForm, setDonationForm] = useState({
    donorName: '',
    donorNameBn: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    location: '',
    locationBn: '',
    remarks: '',
    paymentMethod: 'Cash'
  });

  // Load Special Projects from Firestore
  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'special_projects'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as SpecialProject[];
        setProjects(data);
        localStorage.setItem('nswo_special_projects', JSON.stringify(data));
      } catch (err) {
        console.warn("Exception parsing special projects:", err);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'special_projects');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Total projects computations
  const totalStats = useMemo(() => {
    let totalTarget = 0;
    let totalRaised = 0;
    let totalDonationsCount = 0;

    projects.forEach(p => {
      totalTarget += p.targetBudget;
      totalRaised += (p.raisedAmount || 0);
      totalDonationsCount += (p.donations?.length || 0);
    });

    return { totalTarget, totalRaised, totalDonationsCount };
  }, [projects]);

  // Handle add project submission
  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectForm.name || !projectForm.nameBn || !projectForm.targetBudget) return;

    const targetVal = parseFloat(projectForm.targetBudget);
    const localId = `local_proj_${Date.now()}`;
    const newProject: SpecialProject = {
      id: localId,
      name: projectForm.name,
      nameBn: projectForm.nameBn,
      description: projectForm.description,
      descriptionBn: projectForm.descriptionBn,
      targetBudget: targetVal,
      raisedAmount: 0,
      startDate: projectForm.startDate,
      endDate: projectForm.endDate,
      status: projectForm.status,
      donations: [],
      createdBy: 'sharifahamed016@gmail.com',
      createdAt: Date.now()
    };

    const updated = [newProject, ...projects];
    setProjects(updated);
    try {
      localStorage.setItem('nswo_special_projects', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'project_create',
      `Launched Special Welfare Fund Project: '${newProject.name}'`,
      `নতুন বিশেষ সমাজকল্যাণ প্রজেক্ট ফান্ড চালু করা হয়েছে: '${newProject.nameBn}' (বাজেট লক্ষ্যমাত্রা: ৳${targetVal})`
    ).catch(() => {});

    setIsAddProjectOpen(false);
    
    // Reset form
    setProjectForm({
      name: '',
      nameBn: '',
      description: '',
      descriptionBn: '',
      targetBudget: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      status: 'active'
    });

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return;
    }

    try {
      const dbProject = { ...newProject };
      delete (dbProject as any).id;
      await addDoc(collection(db, 'special_projects'), dbProject);
    } catch (err) {
      console.warn("Firestore error adding project:", err);
    }
  };

  // Handle donation submission
  const handleAddDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectForDonation || !donationForm.donorName || !donationForm.amount) return;

    const donationAmt = parseFloat(donationForm.amount);
    const newDonation: Donation = {
      id: `donation_${Date.now()}`,
      donorName: donationForm.donorName,
      donorNameBn: donationForm.donorNameBn || donationForm.donorName,
      amount: donationAmt,
      date: donationForm.date,
      location: donationForm.location,
      locationBn: donationForm.locationBn || donationForm.location,
      remarks: donationForm.remarks,
      paymentMethod: donationForm.paymentMethod
    };

    const updatedDonations = [...(selectedProjectForDonation.donations || []), newDonation];
    const updatedRaised = (selectedProjectForDonation.raisedAmount || 0) + donationAmt;

    const updatedProjects = projects.map(p => {
      if (p.id === selectedProjectForDonation.id) {
        return {
          ...p,
          donations: updatedDonations,
          raisedAmount: updatedRaised
        };
      }
      return p;
    });

    setProjects(updatedProjects);
    try {
      localStorage.setItem('nswo_special_projects', JSON.stringify(updatedProjects));
    } catch {}

    await logActivity(
      'donation_record',
      `Recorded donation of ৳${donationAmt} from ${newDonation.donorName} for project '${selectedProjectForDonation.name}'`,
      `প্রজেক্ট '${selectedProjectForDonation.nameBn}' এ নতুন অনুদান জমা: দাতা '${newDonation.donorNameBn}' এর কাছ থেকে ৳${donationAmt} প্রাপ্তি রেকর্ড করা হয়েছে।`
    ).catch(() => {});

    setIsRecordDonationOpen(false);
    setSelectedProjectForDonation(null);

    // Reset donation form
    setDonationForm({
      donorName: '',
      donorNameBn: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      location: '',
      locationBn: '',
      remarks: '',
      paymentMethod: 'Cash'
    });

    if (selectedProjectForDonation.id.startsWith('local_proj_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      const docRef = doc(db, 'special_projects', selectedProjectForDonation.id);
      await updateDoc(docRef, {
        donations: updatedDonations,
        raisedAmount: updatedRaised
      });
    } catch (err) {
      console.warn("Firestore error adding donation:", err);
    }
  };

  // Delete Project handler
  const handleDeleteProject = async (id: string) => {
    const confirmMsg = language === 'bn' 
      ? 'আপনি কি নিশ্চিত যে এই বিশেষ প্রজেক্ট বিবরণ গুচ্ছটি ডিলিট করতে চান?' 
      : 'Are you sure you want to delete this special welfare project hub?';
    
    if (!window.confirm(confirmMsg)) return;

    const filtered = projects.filter(p => p.id !== id);
    setProjects(filtered);
    try {
      localStorage.setItem('nswo_special_projects', JSON.stringify(filtered));
    } catch {}

    await logActivity(
      'project_delete',
      `Deleted special project ID: ${id}`,
      `সমাজকল্যাণ ক্যাম্প/প্রজেক্ট বিবরণী মুছে ফেলা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_proj_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'special_projects', id));
    } catch (err) {
      console.warn("Firestore delete failed:", err);
    }
  };

  // Delete Individual Donation handler
  const handleDeleteDonation = async (projectId: string, donationId: string) => {
    const confirmMsg = language === 'bn'
      ? 'আপনি কি এই অনুদান বিবরণটি তালিকা থেকে মুছে ফেলতে চান?'
      : 'Are you sure you want to remove this donation record?';
    
    if (!window.confirm(confirmMsg)) return;

    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const donationToRemove = project.donations.find(d => d.id === donationId);
    if (!donationToRemove) return;

    const updatedDonations = project.donations.filter(d => d.id !== donationId);
    const updatedRaised = Math.max((project.raisedAmount || 0) - donationToRemove.amount, 0);

    const updatedProjects = projects.map(p => {
      if (p.id === projectId) {
        return {
          ...p,
          donations: updatedDonations,
          raisedAmount: updatedRaised
        };
      }
      return p;
    });

    setProjects(updatedProjects);
    try {
      localStorage.setItem('nswo_special_projects', JSON.stringify(updatedProjects));
    } catch {}

    await logActivity(
      'donation_delete',
      `Removed donation of ৳${donationToRemove.amount} from project ID ${projectId}`,
      `প্রজেক্ট থেকে ৳${donationToRemove.amount} পরিমাণের একটি শুভাকাঙ্ক্ষী অনুদান এন্ট্রি প্রত্যাহার করা হয়েছে।`
    ).catch(() => {});

    if (projectId.startsWith('local_proj_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      const docRef = doc(db, 'special_projects', projectId);
      await updateDoc(docRef, {
        donations: updatedDonations,
        raisedAmount: updatedRaised
      });
    } catch (err) {
      console.warn("Firestore error removing donation:", err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Banner */}
      <div 
        className="p-6 md:p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden"
        style={{ backgroundColor: settings.themeColor || '#059669' }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <Award size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 text-white rounded-full text-xs font-semibold uppercase tracking-wider">
            🏛️ {language === 'bn' ? 'বিশেষ প্রজেক্ট ও স্পনসর ফান্ড' : 'Special Projects Registry'}
          </span>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            {language === 'bn' ? 'বিশেষ সমাজকল্যাণ প্রজেক্ট ও অনুদান ট্র্যাকার' : 'Special Donor & Projects Hub'}
          </h2>
          <p className="text-white/85 text-xs md:text-sm max-w-xl font-medium">
            {language === 'bn'
              ? 'ফ্রী ক্যাম্প, গভীর নলকূপ স্থাপন বা মসজিদ ভাঙন রোধ কালভার্ট নির্মাণসহ বিশেষ বড় ফান্ডগুলোর অর্থ সংগ্রহ ও খরচ ট্র্যাক করার আধুনিক সেন্ট্রাল ড্যাশবোর্ড।'
              : 'Keep track of large-scale humanitarian drives, medical treatment, tube-wells installation, or construction campaigns with clear donor records.'
            }
          </p>
        </div>
        {isModerator && (
          <button
            onClick={() => setIsAddProjectOpen(true)}
            className="z-10 flex items-center justify-center gap-2 px-5 py-3.5 bg-white text-slate-900 font-bold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-[1.02] transform transition-all text-sm self-start md:self-center"
          >
            <Plus size={18} />
            {language === 'bn' ? 'নতুন প্রজেক্ট অ্যাকাউন্ট' : 'Create Special Project'}
          </button>
        )}
      </div>

      {/* Welfare Pool Summary Bento Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        
        <div className="bg-white p-5 rounded-3xl border border-slate-105 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'প্রজেক্ট প্রাক্কলিত লক্ষ্যমাত্রা' : 'Cumulative target budget'}
            </p>
            <p className="text-base font-black text-slate-900">৳{totalStats.totalTarget.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500/15 text-emerald-400 rounded-2xl flex items-center justify-center shrink-0">
            <Heart size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'সর্বমোট সংগৃহীত অনুদান' : 'Total Special Funds Raised'}
            </p>
            <p className="text-base font-black text-emerald-400">৳{totalStats.totalRaised.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-105 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
            <Users size={18} />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-slate-400">
              {language === 'bn' ? 'সংগৃহীত অনুদান এন্ট্রি' : 'Individual Donors Registries'}
            </p>
            <p className="text-base font-black text-blue-600 font-mono">
              {totalStats.totalDonationsCount} {language === 'bn' ? 'জন শুভাকাঙ্ক্ষী' : 'Contributions'}
            </p>
          </div>
        </div>

      </div>

      {/* Main Special Project Cards */}
      {loading ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm font-mono">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm font-medium">{language === 'bn' ? 'প্রজেক্ট ফান্ড লোড হচ্ছে...' : 'Loading Project registers...'}</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-2 select-none">
          <div className="w-12 h-12 bg-slate-50 text-slate-400 flex items-center justify-center rounded-2xl mx-auto font-black text-lg">🏗️</div>
          <p className="text-slate-500 text-xs font-bold leading-relaxed">{language === 'bn' ? 'কোনো বিশেষ সমাজকল্যাণ প্রজেক্ট অ্যাকাউন্ট রেকর্ড এখনও নেই।' : 'No active welfare campaign or donor project created.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {projects.map((project) => {
            const raised = project.raisedAmount || 0;
            const target = project.targetBudget || 1;
            const progressPct = Math.min(Math.round((raised / target) * 100), 100);

            return (
              <div 
                key={project.id}
                className="bg-white rounded-[2.5rem] border border-slate-150 p-6 md:p-8 shadow-sm hover:shadow-md transition-all flex flex-col gap-5 relative overflow-hidden"
              >
                {/* Thin top gradient representing state */}
                <div className={`absolute top-0 left-0 h-1.5 w-full ${
                  project.status === 'completed' ? 'bg-emerald-500' : 'bg-rose-500'
                }`} />

                {/* Card Title & Target Header block */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                        project.status === 'completed' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          : 'bg-rose-50 text-rose-700 border border-rose-100'
                      }`}>
                        {project.status === 'completed' ? (language === 'bn' ? 'সম্পন্ন' : 'Campaign Closed') : (language === 'bn' ? 'চলমান ফান্ড' : 'Fundraising Active')}
                      </span>
                      <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1 font-mono">
                        <Calendar size={11} /> {project.startDate} to {project.endDate}
                      </span>
                    </div>

                    <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight leading-snug">
                      {language === 'bn' ? project.nameBn : project.name}
                    </h3>

                    <p className="text-xs text-slate-500 leading-relaxed font-semibold max-w-2xl">
                      {language === 'bn' ? project.descriptionBn : project.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 self-end md:self-start shrink-0">
                    <div className="text-right">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{language === 'bn' ? 'ভাণ্ডার সংগ্রহ' : 'Budget Target'}</p>
                      <p className="text-base font-black text-slate-900 font-mono">৳{project.targetBudget.toLocaleString()}</p>
                    </div>

                    {isModerator && (
                      <button 
                        onClick={() => handleDeleteProject(project.id)}
                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Visual meters */}
                <div className="space-y-1 bg-slate-50/60 p-4 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center text-xs font-black">
                    <span className="text-slate-500 font-bold uppercase tracking-wider">{language === 'bn' ? 'তহবিল সংগ্রহ অগ্রগতি' : 'Fundraising progress rate'}</span>
                    <span className="text-rose-600 font-black">৳{raised.toLocaleString()} collected ({progressPct}%)</span>
                  </div>
                  <div className="w-full bg-slate-200 h-3.5 rounded-full overflow-hidden relative">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-500 to-rose-500 transition-all duration-700 rounded-full"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Donations log header */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5ClassName">
                      ❤️ {language === 'bn' ? 'সম্মানিত ডোনারদের তালিকা' : 'Caring Donors Registry'} ({project.donations?.length || 0})
                    </h4>

                    {project.status === 'active' && (
                      <button
                        onClick={() => {
                          setSelectedProjectForDonation(project);
                          setIsRecordDonationOpen(true);
                        }}
                        className="flex items-center gap-1 px-3.5 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[9px] font-black uppercase transition-all shadow-md shadow-rose-100"
                      >
                        <Plus size={11} />
                        {language === 'bn' ? 'অনুদাতা যুক্ত করুন' : 'Record Donor'}
                      </button>
                    )}
                  </div>

                  {/* Donor entries grid list */}
                  {!project.donations || project.donations.length === 0 ? (
                    <p className="text-[10px] text-slate-400 font-bold text-center py-4 select-none">
                      {language === 'bn' ? 'প্রজেক্টটিতে এখনও কোনো অনুদান এন্ট্রি রেকর্ড করা হয়নি।' : 'No verified micro-donations recorded yet for this drive.'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[180px] overflow-y-auto pr-1">
                      {project.donations.map((donation) => (
                        <div 
                          key={donation.id}
                          className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs font-semibold relative group"
                        >
                          <div className="space-y-0.5">
                            <p className="font-black text-slate-900 leading-none">
                              {language === 'bn' ? donation.donorNameBn : donation.donorName}
                            </p>
                            <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold font-sans">
                              {donation.location && (
                                <span className="flex items-center gap-0.5">
                                  <Globe size={10} /> {language === 'bn' ? donation.locationBn : donation.location}
                                </span>
                              )}
                              <span>• {donation.date}</span>
                              {donation.remarks && <span className="italic text-slate-500">• "{donation.remarks}"</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-emerald-600 font-mono">
                              +৳{donation.amount.toLocaleString()}
                            </span>

                            {isModerator && (
                              <button
                                onClick={() => handleDeleteDonation(project.id, donation.id)}
                                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-1 rounded transition-all"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Slide-over Add Project Modal */}
      <AnimatePresence>
        {isAddProjectOpen && (
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
                    {language === 'bn' ? '🏗️ নতুন বিশেষ প্রজেক্ট বিবরণ খুলুন' : '🏗️ Create Special Project Fund'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {language === 'bn' ? 'স্বতন্ত্র সমাজকল্যাণ উদ্যোগ শুরু করুন' : 'Generate focused ledger drive for high-value targets'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsAddProjectOpen(false)}
                  className="p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800 text-xs font-bold transition-all"
                >
                  X
                </button>
              </div>

              <form onSubmit={handleAddProject} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Project Name (English) *</label>
                    <input
                      type="text"
                      required
                      placeholder="E.g., Free Circumcision Camp 2026"
                      value={projectForm.name}
                      onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">প্রজেক্ট নাম (বাংলা) *</label>
                    <input
                      type="text"
                      required
                      placeholder="উদা: নাছিরটেক ফ্রী খৎনা ক্যাম্প ২০২৬"
                      value={projectForm.nameBn}
                      onChange={(e) => setProjectForm({ ...projectForm, nameBn: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Start Date / শুরুর দিন *</label>
                    <input
                      type="date"
                      required
                      value={projectForm.startDate}
                      onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">End Date / সমাপ্তির দিন *</label>
                    <input
                      type="date"
                      required
                      value={projectForm.endDate}
                      onChange={(e) => setProjectForm({ ...projectForm, endDate: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Target Fundraising Budget / বাজেট লক্ষ্যমাত্রা (৳) *</label>
                    <input
                      type="number"
                      required
                      placeholder="Minimum target e.g. 150000"
                      value={projectForm.targetBudget}
                      onChange={(e) => setProjectForm({ ...projectForm, targetBudget: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-rose-50 text-rose-800 border-none rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Camp details / প্রজেক্ট বিবরণ (English) *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="E.g., Medical treatment camp targeting circumcision over 100 poor boys under supervision..."
                    value={projectForm.description}
                    onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">প্রজেক্ট বিবরণ (বাংলা) *</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="বিস্তারিত বাংলায় লিখুন..."
                    value={projectForm.descriptionBn}
                    onChange={(e) => setProjectForm({ ...projectForm, descriptionBn: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAddProjectOpen(false)}
                    className="px-5 py-2.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase rounded-lg transition-all shadow-lg"
                  >
                    Establish Account Dashboard
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Slide-over Record Donation Modal */}
      <AnimatePresence>
        {isRecordDonationOpen && selectedProjectForDonation && (
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
                    {language === 'bn' ? '🤝 অনুদান ভাউচার সংরক্ষণ' : '🤝 Add Donor Contribution'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
                    Project: {language === 'bn' ? selectedProjectForDonation.nameBn : selectedProjectForDonation.name}
                  </p>
                </div>
                <button 
                  onClick={() => setIsRecordDonationOpen(false)}
                  className="p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800 text-xs font-bold transition-all"
                >
                  X
                </button>
              </div>

              <form onSubmit={handleAddDonation} className="space-y-4">
                
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Donor Full Name (English) *</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g., Dr. Sayed Ahmed"
                    value={donationForm.donorName}
                    onChange={(e) => setDonationForm({ ...donationForm, donorName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold font-bold">দাতাদের নাম (বাংলা) *</label>
                  <input
                    type="text"
                    required
                    placeholder="উদা: ড. সাঈদ আহমেদ"
                    value={donationForm.donorNameBn}
                    onChange={(e) => setDonationForm({ ...donationForm, donorNameBn: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Donation Date / তারিখ *</label>
                  <input
                    type="date"
                    required
                    value={donationForm.date}
                    onChange={(e) => setDonationForm({ ...donationForm, date: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Country / বাসরত্ব</label>
                    <input
                      type="text"
                      placeholder="E.g., United Kingdom"
                      value={donationForm.location}
                      onChange={(e) => setDonationForm({ ...donationForm, location: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-101 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">গ্রাম/দেশ বাংলায়</label>
                    <input
                      type="text"
                      placeholder="উদা: যুক্তরাজ্য"
                      value={donationForm.locationBn}
                      onChange={(e) => setDonationForm({ ...donationForm, locationBn: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-101 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Donation Channel / পেমেন্ট মাধ্যম</label>
                  <select
                    value={donationForm.paymentMethod}
                    onChange={(e) => setDonationForm({ ...donationForm, paymentMethod: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="Cash">Cash (নগদ)</option>
                    <option value="BKash">bKash (বিকাশ)</option>
                    <option value="Nagad">Nagad (নগদ অ্যাপ)</option>
                    <option value="Bank Transfer">Bank Wire (ব্যাংক ট্রান্সফার)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Amount / অনুদান মূল্যমান (৳) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Enter taka amount"
                    value={donationForm.amount}
                    onChange={(e) => setDonationForm({ ...donationForm, amount: e.target.value })}
                    className="w-full px-3.5 py-3 bg-emerald-50 text-emerald-800 border-none rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-f font-bold">Wishes / দোয়া বা সংক্ষিপ্ত মন্তব্য</label>
                  <input
                    type="text"
                    placeholder="E.g., For parents' blessings"
                    value={donationForm.remarks}
                    onChange={(e) => setDonationForm({ ...donationForm, remarks: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsRecordDonationOpen(false)}
                    className="px-5 py-2.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase rounded-lg transition-all shadow-lg"
                  >
                    Deposit Donation
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
