/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, Search, Plus, Trash2, Edit, Phone, MapPin, 
  Calendar, CheckCircle, XCircle, Info, PhoneCall
} from 'lucide-react';
import { useBloodDonors } from '../hooks/useBloodDonors';
import { useAppContext } from '../context/AppContext';
import { BloodDonor } from '../types';

export default function BloodDonorsList() {
  const { bloodDonors, loading, addBloodDonor, updateBloodDonor, deleteBloodDonor } = useBloodDonors();
  const { language, t, isModerator, settings } = useAppContext();

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
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState<BloodDonor | null>(null);

  // Sub tab navigation
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'matcher'>('list');

  // Matcher active emergency form states
  const [matchGroup, setMatchGroup] = useState('A+');
  const [matchPatient, setMatchPatient] = useState('');
  const [matchBags, setMatchBags] = useState('1');
  const [matchHospital, setMatchHospital] = useState('');
  const [matchDateTime, setMatchDateTime] = useState('');
  const [matchContact, setMatchContact] = useState('');
  const [matchLocationQuery, setMatchLocationQuery] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    nameBn: '',
    bloodGroup: 'A+',
    phone: '',
    alternatePhone: '',
    location: '',
    locationBn: '',
    isAvailable: true,
    lastDonationDate: '',
    remarks: ''
  });

  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  const filteredDonors = bloodDonors.filter(donor => {
    const matchesSearch = 
      donor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      donor.nameBn?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      donor.phone.includes(searchQuery) ||
      donor.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      donor.locationBn?.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesGroup = selectedGroupFilter === 'ALL' || donor.bloodGroup === selectedGroupFilter;
    const matchesStatus = 
      selectedStatusFilter === 'ALL' || 
      (selectedStatusFilter === 'AVAILABLE' && donor.isAvailable) ||
      (selectedStatusFilter === 'UNAVAILABLE' && !donor.isAvailable);

    return matchesSearch && matchesGroup && matchesStatus;
  });

  // Emergency Matcher helpers
  const checkCanDonate = (lastDonationDate: string | undefined): boolean => {
    if (!lastDonationDate) return true;
    const lastDate = new Date(lastDonationDate);
    if (isNaN(lastDate.getTime())) return true;
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 90; // 3 months
  };

  const getDaysSinceLast = (lastDonationDate: string | undefined): number | null => {
    if (!lastDonationDate) return null;
    const lastDate = new Date(lastDonationDate);
    if (isNaN(lastDate.getTime())) return null;
    const now = new Date();
    const diffTime = now.getTime() - lastDate.getTime();
    if (diffTime < 0) return 0;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Get matched donors for the emergency engine filter
  const matchedDonors = useMemo(() => {
    return bloodDonors.filter(donor => {
      // 1. Must match chosen blood group
      if (donor.bloodGroup !== matchGroup) return false;

      // 2. Proximity search filter (optional)
      if (matchLocationQuery.trim() !== '') {
        const q = matchLocationQuery.toLowerCase();
        const matchesLoc = 
          donor.location.toLowerCase().includes(q) || 
          donor.locationBn?.toLowerCase().includes(q);
        if (!matchesLoc) return false;
      }
      return true;
    });
  }, [bloodDonors, matchGroup, matchLocationQuery]);

  // Split matched donors into eligible (can donate + available) vs resting/unavailable
  const sortedMatchedDonors = useMemo(() => {
    const ready: typeof bloodDonors = [];
    const resting: typeof bloodDonors = [];

    matchedDonors.forEach(donor => {
      const isEligible = checkCanDonate(donor.lastDonationDate) && donor.isAvailable;
      if (isEligible) {
        ready.push(donor);
      } else {
        resting.push(donor);
      }
    });

    return { ready, resting };
  }, [matchedDonors]);

  const handleTriggerEmergencyWhatsApp = (donor: BloodDonor) => {
    const donorName = language === 'bn' ? (donor.nameBn || donor.name) : donor.name;
    const diseaseInfo = matchPatient ? (language === 'bn' ? `রোগীর সমস্যা: ${matchPatient}` : `Patient Condition: ${matchPatient}`) : '';
    const hospitalInfo = matchHospital ? (language === 'bn' ? `হাসপাতাল/স্থান: ${matchHospital}` : `Location/Hospital: ${matchHospital}`) : '';
    const dateInfo = matchDateTime ? (language === 'bn' ? `রক্তদানের সময়: ${matchDateTime}` : `Required Time: ${matchDateTime}`) : '';
    const bagsInfo = matchBags ? (language === 'bn' ? `রক্তের পরিমাণ: ${matchBags} ব্যাগ` : `Required Volume: ${matchBags} bag(s)`) : '';
    const contactInfo = matchContact ? (language === 'bn' ? `যোগাযোগ নম্বর: ${matchContact}` : `Contact Number: ${matchContact}`) : '';

    const message = language === 'bn' ? 
`আসসালামু আলাইকুম, ${donorName} ভাই।
নলতা নাসিরটেক সমাজকল্যাণ সংস্থার জরুরি ব্লাড ম্যাচিং ইঞ্জিন থেকে আপনাকে অনুরোধ জানানো হচ্ছে।

রক্তের গ্রুপ: *${matchGroup}* প্রয়োজন।
${diseaseInfo}
${bagsInfo}
${hospitalInfo}
${dateInfo}
${contactInfo}

আপনি সর্বশেষ ৩ মাস পূর্বে রক্তদান করেছেন এবং আমাদের তালিকায় রক্তদানের জন্য উপযুক্ত আছেন। অনুগ্রহ করে যোগাযোগ করুন। জাজাকাল্লাহু খাইরান!` : 
`As-salamu Alaykum, Br. ${donorName}.
Urgent blood donor service from Nalta Nasirtek Social Welfare Organization.

Required Blood Group: *${matchGroup}*
${diseaseInfo}
${bagsInfo}
${hospitalInfo}
${dateInfo}
${contactInfo}

Our records indicate you are currently eligible and ready. Please respond back if you can save a life today. Jazakallah!`;

    let cleanPhone = donor.phone.trim();
    if (!cleanPhone.startsWith('+')) {
      if (cleanPhone.startsWith('0')) {
        cleanPhone = '+88' + cleanPhone;
      } else if (cleanPhone.startsWith('1')) {
        cleanPhone = '+880' + cleanPhone;
      } else if (cleanPhone.startsWith('880')) {
        cleanPhone = '+' + cleanPhone;
      }
    }
    const cleanNo = cleanPhone.replace('+', '');
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${cleanNo}?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      nameBn: '',
      bloodGroup: 'A+',
      phone: '',
      alternatePhone: '',
      location: '',
      locationBn: '',
      isAvailable: true,
      lastDonationDate: '',
      remarks: ''
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (donor: BloodDonor) => {
    setSelectedDonor(donor);
    setFormData({
      name: donor.name,
      nameBn: donor.nameBn || '',
      bloodGroup: donor.bloodGroup,
      phone: donor.phone,
      alternatePhone: donor.alternatePhone || '',
      location: donor.location,
      locationBn: donor.locationBn || '',
      isAvailable: donor.isAvailable,
      lastDonationDate: donor.lastDonationDate || '',
      remarks: donor.remarks || ''
    });
    setIsEditModalOpen(true);
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.location) return;
    await addBloodDonor({
      ...formData,
      nameBn: formData.nameBn || formData.name,
      locationBn: formData.locationBn || formData.location
    });
    setIsAddModalOpen(false);
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDonor || !formData.name || !formData.phone || !formData.location) return;
    await updateBloodDonor(selectedDonor.id, {
      ...formData,
      nameBn: formData.nameBn || formData.name,
      locationBn: formData.locationBn || formData.location
    });
    setIsEditModalOpen(false);
  };

  const handleDelete = async (donor: BloodDonor) => {
    const confirmMsg = language === 'bn' 
      ? `আপনি কি নিশ্চিত যে রক্তদাতা "${donor.nameBn || donor.name}" এর রেকর্ড মুছে ফেলতে চান?`
      : `Are you sure you want to remove blood donor "${donor.name}"?`;
    if (window.confirm(confirmMsg)) {
      await deleteBloodDonor(donor.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div 
        className={`p-6 md:p-8 rounded-3xl ${isThemeLight ? 'text-slate-950' : 'text-white'} shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden`}
        style={{ backgroundColor: settings.themeColor }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <Heart size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <div className={`inline-flex items-center gap-2 px-3 py-1 ${isThemeLight ? 'bg-black/10 text-slate-950 font-black' : 'bg-white/20 text-white'} rounded-full text-xs font-semibold uppercase tracking-wider`}>
            🩸 {language === 'bn' ? 'জরুরি রক্তসেবা ' : 'Emergency Blood Assist'}
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            {language === 'bn' ? 'রক্তদাতা ডিরেক্টরি' : 'Blood Donors Directory'}
          </h2>
          <p className={`${isThemeLight ? 'text-slate-800' : 'text-white/85'} text-xs md:text-sm max-w-xl font-medium`}>
            {language === 'bn' 
              ? 'নিবন্ধিত রক্তদাতাদের খুঁজুন এবং জরুরি প্রয়োজনে দ্রুত যোগাযোগ করুন। প্রতিটি উজ্জ্বল রক্তদান বাঁচায় একটি নতুন জীবন।' 
              : 'Search registered blood donors and reach out instantly for emergencies. Every donor contribution saves lives!'
            }
          </p>
        </div>
        {isModerator && (
          <button
            onClick={handleOpenAdd}
            className="z-10 flex items-center justify-center gap-2 px-5 py-3.5 bg-white text-slate-900 font-bold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-[1.02] transform transition-all text-sm self-start md:self-center"
          >
            <Plus size={18} />
            {language === 'bn' ? 'রক্তদাতা নিবন্ধন' : 'Register Donor'}
          </button>
        )}
      </div>

      {/* Sub Tabs Toggle for Directory vs Matcher Engine */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-2 w-full max-w-md mx-auto shadow-inner">
        <button
          type="button"
          onClick={() => setActiveSubTab('list')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-black uppercase rounded-xl transition-all ${
            activeSubTab === 'list'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          👥 {language === 'bn' ? 'রক্তদাতা ডিরেক্টরি' : 'Donors Directory'}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('matcher')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-black uppercase rounded-xl transition-all ${
            activeSubTab === 'matcher'
              ? 'bg-rose-500 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          ⚡ {language === 'bn' ? 'জরুরি ব্লাড ম্যাচিং ইঞ্জিন' : 'Blood Matcher Engine'}
        </button>
      </div>

      {activeSubTab === 'list' ? (
        <>
          {/* Control Panel: Search & Filters */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Search size={18} />
              </span>
              <input
                type="text"
                placeholder={language === 'bn' ? 'রক্তদাতার নাম, ফোন বা ঠিকানা দিয়ে খুঁজুন...' : 'Search by name, phone or unit location...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-105 rounded-2xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5 ml-1">
                  {language === 'bn' ? 'রক্তের গ্রুপ' : 'Blood Group Filter'}
                </label>
                <select
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="ALL">{language === 'bn' ? 'সকল গ্রুপ' : 'All Groups'}</option>
                  {bloodGroups.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5 ml-1">
                  {language === 'bn' ? 'প্রাপ্তিসাধ্যতা' : 'Availability Status'}
                </label>
                <select
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="ALL">{language === 'bn' ? 'সবাই' : 'All Status'}</option>
                  <option value="AVAILABLE">{language === 'bn' ? 'রক্তদানে প্রস্তুত (সক্রিয়)' : 'Ready to Donate (Available)'}</option>
                  <option value="UNAVAILABLE">{language === 'bn' ? 'অনুপলব্ধ (ব্যস্ত/অসুস্থ)' : 'Unavailable'}</option>
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-500 text-sm font-medium animate-pulse">
                {language === 'bn' ? 'রক্তদাতা তালিকা লোড হচ্ছে...' : 'Loading donor listings...'}
              </p>
            </div>
          ) : filteredDonors.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-3">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mx-auto text-2xl font-black">🩸</div>
              <h3 className="font-bold text-slate-800 text-lg">
                {language === 'bn' ? 'কোনো রক্তদাতা পাওয়া যায়নি' : 'No Matching Donors Found'}
              </h3>
              <p className="text-slate-500 text-xs md:text-sm max-w-md mx-auto px-4">
                {language === 'bn'
                  ? 'অনুগ্রহ করে অন্য কোনো রক্তের গ্রুপ দিয়ে খুঁজুন অথবা নতুন কোনো রক্তদাতা যুক্ত করতে অ্যাডমিনকে অনুরোধ করুন।'
                  : 'Try matching other criteria or filter groups. Reach admin to list new local blood donors.'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDonors.map(donor => (
                <motion.div
                  layout
                  key={donor.id}
                  className="bg-white rounded-3xl border border-slate-105 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow relative"
                >
                  {/* Card Accent Top Line */}
                  <div className="h-1.5 w-full bg-rose-500" />
                  
                  <div className="p-6 space-y-5 flex-1 select-none">
                    {/* Header Profile Row */}
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 font-extrabold text-lg select-all shrink-0">
                          {donor.bloodGroup}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-black text-slate-800 text-base truncate leading-snug">
                            {language === 'bn' ? donor.nameBn : donor.name}
                          </h4>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              donor.isAvailable 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${donor.isAvailable ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                              {donor.isAvailable
                                ? (language === 'bn' ? 'রক্তদানে প্রস্তুত' : 'Ready')
                                : (language === 'bn' ? 'অনুপলব্ধ' : 'Unavailable')
                              }
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Optional Admin controls */}
                      {isModerator && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleOpenEdit(donor)}
                            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            title={language === 'bn' ? 'সম্পাদনা' : 'Edit'}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(donor)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title={language === 'bn' ? 'ডিলিট' : 'Delete'}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Info Fields */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-50 text-xs text-slate-600 font-medium">
                      {/* Location field */}
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 shrink-0"><MapPin size={14} /></span>
                        <span className="truncate">
                          <strong>{language === 'bn' ? 'ঠিকানা/এলাকা:' : 'Location:'}</strong>{' '}
                          {language === 'bn' ? donor.locationBn : donor.location}
                        </span>
                      </div>

                      {/* Last donation date field */}
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 shrink-0"><Calendar size={14} /></span>
                        <span>
                          <strong>{language === 'bn' ? 'শেষ রক্তদান:' : 'Last Donated:'}</strong>{' '}
                          {donor.lastDonationDate 
                            ? donor.lastDonationDate 
                            : (language === 'bn' ? 'তথ্য নেই' : 'No Record')
                          }
                        </span>
                      </div>

                      {/* Remarks - if any */}
                      {donor.remarks && (
                        <div className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl text-[11px] text-slate-500 leading-relaxed italic">
                          <span className="text-slate-400 shrink-0 mt-0.5"><Info size={12} /></span>
                          <p className="truncate-2-lines">{donor.remarks}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Contact buttons Footer */}
                  <div className="px-6 pb-6 pt-2 border-t border-slate-50 flex items-center gap-2">
                    <a
                      href={`tel:${donor.phone}`}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-2xl shadow-sm hover:shadow-md transition-all text-xs"
                    >
                      <PhoneCall size={14} />
                      {language === 'bn' ? 'সরাসরি কল করুন' : 'Call Primary'}
                    </a>
                    {donor.alternatePhone && (
                      <a
                        href={`tel:${donor.alternatePhone}`}
                        className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-100 rounded-2xl transition-all"
                        title={language === 'bn' ? 'বিকল্প নম্বরে কল করুন' : 'Call Alternate'}
                      >
                        <Phone size={14} />
                      </a>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Emergency Matcher Dashboard Panel */
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 space-y-4">
              <div>
                <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Emergency Dispatch System</p>
                <h3 className="text-lg font-black tracking-tight mt-1">
                  {language === 'bn' ? '🩸 ইমার্জেন্সি ব্লাড রিকোয়েস্ট ম্যাচিং ইঞ্জিন ' : '🩸 Emergency Blood Matching Engine'}
                </h3>
                <p className="text-xs text-slate-300/80 leading-relaxed mt-1">
                  {language === 'bn' 
                    ? 'ম্যাচিং ইঞ্জিনটি রক্তের গ্রুপ অনুযায়ী ৩ মাস পার হওয়া সম্পূর্ণ সুস্থ উপযুক্ত দাতাদের স্বয়ংক্রিয়ভাবে ফিল্টার করে এবং একটি ক্লিকেই সরাসরি রেডিমেড হোয়াটসঅ্যাপ ইমার্জেন্সি বার্তা প্রেরণ করতে সক্ষম করে।' 
                    : 'The matching system automatically tracks donor eligibility (3 months recovery period), highlights nearest fits, and drafts prefilled WhatsApp dispatch notifications of the emergency.'}
                </p>
              </div>

              {/* Emergency Inputs Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-white/10 pt-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    {language === 'bn' ? 'কাঙ্ক্ষিত রক্তের গ্রুপ *' : 'Required Blood Group *'}
                  </label>
                  <select
                    value={matchGroup}
                    onChange={(e) => setMatchGroup(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-rose-500"
                  >
                    {bloodGroups.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    {language === 'bn' ? 'রোগী / রোগের বিবরণ' : 'Patient Name / Disease'}
                  </label>
                  <input
                    type="text"
                    value={matchPatient}
                    onChange={(e) => setMatchPatient(e.target.value)}
                    placeholder="উদা: আব্দুল জলিল (কিডনি রোগী)"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    {language === 'bn' ? 'প্রয়োজনীয় পরিমাণ (ব্যাগ)' : 'Required Amount (Bags)'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={matchBags}
                    onChange={(e) => setMatchBags(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    {language === 'bn' ? 'হাসপাতাল / রক্ত সংগ্রহের স্থান' : 'Hospital / Handover address'}
                  </label>
                  <input
                    type="text"
                    value={matchHospital}
                    onChange={(e) => setMatchHospital(e.target.value)}
                    placeholder="উদা: চট্টগ্রাম মেডিকেল কলেজ, ওয়ার্ড ১৪"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    {language === 'bn' ? 'রক্তদানের সময়সীমা' : 'Required Date & Hour'}
                  </label>
                  <input
                    type="text"
                    value={matchDateTime}
                    onChange={(e) => setMatchDateTime(e.target.value)}
                    placeholder="উদা: আগামী কাল সকাল ১০টা"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    {language === 'bn' ? 'জরুরি যোগাযোগের ফোন নম্বর' : 'Emergency Phone for Dispatch'}
                  </label>
                  <input
                    type="tel"
                    value={matchContact}
                    onChange={(e) => setMatchContact(e.target.value)}
                    placeholder="017XXXXXXXX"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl text-xs font-medium outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2 lg:col-span-3 border-t border-white/5 pt-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    📍 {language === 'bn' ? 'নিকটবর্তী এলাকা দিয়ে ফিল্টার করুন (Proximity filter)' : '📍 Proximity Location Search'}
                  </label>
                  <input
                    type="text"
                    value={matchLocationQuery}
                    onChange={(e) => setMatchLocationQuery(e.target.value)}
                    placeholder={language === 'bn' ? 'দাতাদের ঠিকানা/এলাকা অনুযায়ী ফিল্টার করুন...' : 'Type area/neighborhood to narrow nearest donor proximity...'}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-rose-300 placeholder-slate-500 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Engine Output Matching Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Suitable Donors Column (Ready to Donate) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2 border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                  <h4 className="font-black text-slate-800 text-sm">
                    {language === 'bn' ? '👍 রক্তদানের উপযোগী ও প্রস্তুত দাতা' : '👍 Eligible & Ready Donors'}
                  </h4>
                </div>
                <span className="text-xs bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full font-black">
                  {sortedMatchedDonors.ready.length} Matching
                </span>
              </div>

              {sortedMatchedDonors.ready.length === 0 ? (
                <div className="bg-white p-8 text-center rounded-3xl border border-slate-100 text-slate-400 text-xs">
                  {language === 'bn' ? 'এই গ্রুপে বর্তমানে কোনো উপযুক্ত দাতা খালি নেই।' : 'No verified active ready donors found for this blood group.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedMatchedDonors.ready.map(donor => {
                    const days = getDaysSinceLast(donor.lastDonationDate);
                    return (
                      <div key={donor.id} className="bg-white p-5 rounded-3xl border border-slate-150 shadow-sm hover:border-rose-400 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1.5">
                          <div>
                            <span className="inline-block bg-rose-500 text-white font-extrabold text-[10px] px-2 py-0.5 rounded mr-2">
                              {donor.bloodGroup}
                            </span>
                            <span className="font-black text-slate-900 text-xs">
                              {language === 'bn' ? donor.nameBn : donor.name}
                            </span>
                          </div>
                          
                          <div className="text-[10px] text-slate-600 space-y-0.5 font-semibold">
                            <p className="flex items-center gap-1">
                              <MapPin size={12} className="text-slate-400" />
                              <span>{language === 'bn' ? donor.locationBn : donor.location}</span>
                            </p>
                            <p className="flex items-center gap-1 text-emerald-600 font-bold">
                              <Calendar size={12} className="text-emerald-500" />
                              <span>
                                {language === 'bn' 
                                  ? `শেষ রক্তদান: ${donor.lastDonationDate || 'কখনো দান করেননি'} ${days !== null ? `(${days} দিন পূর্বে)` : '(প্রস্তুত)'}` 
                                  : `Last Donated: ${donor.lastDonationDate || 'Never'} ${days !== null ? `(${days} days ago)` : '(Ready)'}`}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <a 
                            href={`tel:${donor.phone}`}
                            className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 rounded-xl border border-slate-100 transition-all"
                            title={language === 'bn' ? 'সরাসরি কল' : 'Call'}
                          >
                            <PhoneCall size={14} />
                          </a>
                          <button
                            onClick={() => handleTriggerEmergencyWhatsApp(donor)}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-100"
                          >
                            <Phone size={14} />
                            {language === 'bn' ? 'পাঠান (WhatsApp)' : 'Send Notification'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Resting Donors Column (Currently recovery/resting period) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2 border-slate-100">
                <div className="flex items-center gap-2 text-slate-500">
                  <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
                  <h4 className="font-semibold text-slate-600 text-sm">
                    {language === 'bn' ? '⏳ অপেক্ষমাণ বা অনুপলব্ধ দাতা (৩ মাসের কম)' : '⏳ Rest Period / Unavailable Donors (<3m)'}
                  </h4>
                </div>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                  {sortedMatchedDonors.resting.length} Rested
                </span>
              </div>

              {sortedMatchedDonors.resting.length === 0 ? (
                <div className="bg-white p-8 text-center rounded-3xl border border-slate-100 text-slate-400 text-xs">
                  {language === 'bn' ? 'এই তালিকাটি বর্তমানে খালি।' : 'No resting donors listed currently.'}
                </div>
              ) : (
                <div className="space-y-3 opacity-70 hover:opacity-100 transition-opacity">
                  {sortedMatchedDonors.resting.map(donor => {
                    const days = getDaysSinceLast(donor.lastDonationDate);
                    return (
                      <div key={donor.id} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-1">
                          <div>
                            <span className="inline-block bg-slate-400 text-white font-extrabold text-[9px] px-1.5 py-0.5 rounded mr-1.5">
                              {donor.bloodGroup}
                            </span>
                            <span className="font-black text-slate-700">
                              {language === 'bn' ? donor.nameBn : donor.name}
                            </span>
                            {!donor.isAvailable && (
                              <span className="ml-1.5 text-[8px] bg-red-50 text-red-600 border border-red-100 px-1 py-0.5 rounded font-black uppercase">
                                {language === 'bn' ? 'অসুস্থ/অনুপলব্ধ' : 'Unavailable'}
                              </span>
                            )}
                          </div>
                          
                          <div className="text-[10px] text-slate-500 space-y-0.5 font-medium leading-tight">
                            <p>{language === 'bn' ? 'ঠিকানা:' : 'Location:'} {language === 'bn' ? donor.locationBn : donor.location}</p>
                            <p className="text-amber-600 font-semibold">
                              {language === 'bn' 
                                ? `শেষ দান: ${donor.lastDonationDate || 'তথ্য নেই'} ${days !== null ? `(${days} দিন পূর্বে - সুস্থ হতে বাকি ${90 - days} দিন)` : ''}` 
                                : `Last Donated: ${donor.lastDonationDate || 'N/A'} ${days !== null ? `(${days} days ago - rest needed: ${90 - days} days)` : ''}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <a 
                            href={`tel:${donor.phone}`}
                            className="p-2 bg-white hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200 transition-all"
                            title={language === 'bn' ? 'কল দিন' : 'Call'}
                          >
                            <PhoneCall size={12} />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Modal: Add Donor */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col text-slate-900"
            >
              <div 
                className="p-5 text-white flex justify-between items-center"
                style={{ backgroundColor: settings.themeColor }}
              >
                <div className="flex items-center gap-2">
                  <Heart size={18} className="fill-current" />
                  <h3 className="font-bold text-base md:text-lg">
                    {language === 'bn' ? 'নতুন রক্তদাতা নিবন্ধন' : 'Register New Blood Donor'}
                  </h3>
                </div>
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmitAdd} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs md:text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'নাম (ইংরেজিতে)' : 'Name (English)'} *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'নাম (বাংলায়)' : 'Name (Bangla)'}</label>
                    <input
                      type="text"
                      value={formData.nameBn}
                      onChange={(e) => setFormData({ ...formData, nameBn: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'রক্তের গ্রুপ' : 'Blood Group'} *</label>
                    <select
                      value={formData.bloodGroup}
                      onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl font-bold text-slate-700 focus:outline-none"
                    >
                      {bloodGroups.map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'আজই রক্তদানে প্রস্তুত?' : 'Ready to Donate Today?'}</label>
                    <div className="flex items-center gap-4 py-2">
                      <label className="inline-flex items-center gap-2 font-bold text-emerald-600 cursor-pointer">
                        <input
                          type="radio"
                          name="isAvailable"
                          checked={formData.isAvailable === true}
                          onChange={() => setFormData({ ...formData, isAvailable: true })}
                        />
                        {language === 'bn' ? 'হ্যাঁ, প্রস্তুত' : 'Yes, Ready'}
                      </label>
                      <label className="inline-flex items-center gap-2 font-bold text-slate-500 cursor-pointer">
                        <input
                          type="radio"
                          name="isAvailable"
                          checked={formData.isAvailable === false}
                          onChange={() => setFormData({ ...formData, isAvailable: false })}
                        />
                        {language === 'bn' ? 'না (ব্যস্ত)' : 'No (Busy)'}
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'মোবাইল নম্বর' : 'Phone Number'} *</label>
                    <input
                      type="tel"
                      required
                      placeholder="017XXXXXXXX"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'বিকল্প মোবাইল (ঐচ্ছিক)' : 'Alternate Phone'}</label>
                    <input
                      type="tel"
                      value={formData.alternatePhone}
                      onChange={(e) => setFormData({ ...formData, alternatePhone: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'ঠিকানা (ইংরেজিতে)' : 'Location (English)'} *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dhaka, Bangladesh"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'ঠিকানা (বাংলায়)' : 'Location (Bangla)'}</label>
                    <input
                      type="text"
                      placeholder="যেমন: ঢাকা, বাংলাদেশ"
                      value={formData.locationBn}
                      onChange={(e) => setFormData({ ...formData, locationBn: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      {language === 'bn' ? 'সর্বশেষ রক্তদানের তারিখ' : 'Last Donation Date'}
                    </label>
                    <input
                      type="date"
                      value={formData.lastDonationDate}
                      onChange={(e) => setFormData({ ...formData, lastDonationDate: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      {language === 'bn' ? 'অতিরিক্ত মন্তব্য (ঐচ্ছিক)' : 'Remarks (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={formData.remarks}
                      onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                      placeholder={language === 'bn' ? 'যেমন: কোনো দীর্ঘস্থায়ী অসুস্থতা নেই...' : 'e.g. no chronic diseases...'}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-700 font-bold"
                  >
                    {language === 'bn' ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-sm"
                  >
                    {language === 'bn' ? 'নিবন্ধন সম্পন্ন করুন' : 'Confirm Registration'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Edit Donor */}
      <AnimatePresence>
        {isEditModalOpen && selectedDonor && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col text-slate-900"
            >
              <div 
                className="p-5 text-white flex justify-between items-center"
                style={{ backgroundColor: settings.themeColor }}
              >
                <div className="flex items-center gap-2">
                  <Edit size={18} />
                  <h3 className="font-bold text-base md:text-lg">
                    {language === 'bn' ? 'রক্তদাতার তথ্য পরিবর্তন' : 'Edit Blood Donor Details'}
                  </h3>
                </div>
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-1 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmitEdit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs md:text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'নাম (ইংরেজিতে)' : 'Name (English)'} *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'নাম (বাংলায়)' : 'Name (Bangla)'}</label>
                    <input
                      type="text"
                      value={formData.nameBn}
                      onChange={(e) => setFormData({ ...formData, nameBn: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'রক্তের গ্রুপ' : 'Blood Group'} *</label>
                    <select
                      value={formData.bloodGroup}
                      onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl font-bold text-slate-700 focus:outline-none"
                    >
                      {bloodGroups.map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'আজই রক্তদানে প্রস্তুত?' : 'Ready to Donate Today?'}</label>
                    <div className="flex items-center gap-4 py-2">
                      <label className="inline-flex items-center gap-2 font-bold text-emerald-600 cursor-pointer">
                        <input
                          type="radio"
                          name="isAvailableEdit"
                          checked={formData.isAvailable === true}
                          onChange={() => setFormData({ ...formData, isAvailable: true })}
                        />
                        {language === 'bn' ? 'হ্যাঁ, প্রস্তুত' : 'Yes, Ready'}
                      </label>
                      <label className="inline-flex items-center gap-2 font-bold text-slate-500 cursor-pointer">
                        <input
                          type="radio"
                          name="isAvailableEdit"
                          checked={formData.isAvailable === false}
                          onChange={() => setFormData({ ...formData, isAvailable: false })}
                        />
                        {language === 'bn' ? 'না (ব্যস্ত)' : 'No (Busy)'}
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'মোবাইল নম্বর' : 'Phone Number'} *</label>
                    <input
                      type="tel"
                      required
                      placeholder="017XXXXXXXX"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'বিকল্প মোবাইল (ঐচ্ছিক)' : 'Alternate Phone'}</label>
                    <input
                      type="tel"
                      value={formData.alternatePhone}
                      onChange={(e) => setFormData({ ...formData, alternatePhone: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'ঠিকানা (ইংরেজিতে)' : 'Location (English)'} *</label>
                    <input
                      type="text"
                      required
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">{language === 'bn' ? 'ঠিকানা (বাংলায়)' : 'Location (Bangla)'}</label>
                    <input
                      type="text"
                      value={formData.locationBn}
                      onChange={(e) => setFormData({ ...formData, locationBn: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      {language === 'bn' ? 'সর্বশেষ রক্তদানের তারিখ' : 'Last Donation Date'}
                    </label>
                    <input
                      type="date"
                      value={formData.lastDonationDate}
                      onChange={(e) => setFormData({ ...formData, lastDonationDate: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5">
                      {language === 'bn' ? 'অতিরিক্ত মন্তব্য (ঐচ্ছিক)' : 'Remarks (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={formData.remarks}
                      onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-700 font-bold"
                  >
                    {language === 'bn' ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-sm"
                  >
                    {language === 'bn' ? 'পরিবর্তন সংরক্ষণ করুন' : 'Save Changes'}
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
