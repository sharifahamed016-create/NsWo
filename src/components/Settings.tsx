import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Save, Globe, Phone, Image as ImageIcon, CheckCircle2, Shield, Camera, Settings as SettingsIcon, RefreshCw, Database, AlertTriangle, Copy, Link2, ExternalLink } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { uploadFile } from '../lib/storage';
import { getImageUrl } from '../lib/utils';
import AdminRoleManagement from './AdminRoleManagement';
import ExpenseCategoriesManager from './ExpenseCategoriesManager';

export default function Settings() {
  const { settings, updateSettings, t, language, isSuperAdmin, loading } = useAppContext();

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

  const [activeSettingTab, setActiveSettingTab] = useState<'general' | 'roles' | 'categories'>('general');
  const [formData, setFormData] = useState({
    name: settings.name || '',
    nameBn: settings.nameBn || '',
    logoURL: settings.logoURL || '',
    officialSealURL: settings.officialSealURL || '',
    contactPhone: settings.contactPhone || '',
    themeColor: settings.themeColor || '#059669',
    portalPasscode: settings.portalPasscode || '7890',
  });
  const [copiedPortalUrl, setCopiedPortalUrl] = useState(false);
  const [copiedBypassUrl, setCopiedBypassUrl] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingSeal, setIsUploadingSeal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const handleResetQuota = () => {
    localStorage.removeItem('nswo_is_quota_exceeded');
    if (typeof window !== 'undefined') {
      (window as any).__firestore_quota_exceeded = false;
    }
    alert(language === 'bn' 
      ? 'কোটা লিমিট ফ্ল্যাগ সফলভাবে রিসেট করা হয়েছে! পেজটি পুনরায় লোড হচ্ছে...' 
      : 'Quota limit block has been successfully reset! Reloading the page...');
    window.location.reload();
  };

  const handleClearLocalCache = () => {
    localStorage.removeItem('nswo_members');
    localStorage.removeItem('nswo_payments');
    localStorage.removeItem('nswo_expenses');
    localStorage.removeItem('nswo_is_quota_exceeded');
    if (typeof window !== 'undefined') {
      (window as any).__firestore_quota_exceeded = false;
    }
    alert(language === 'bn' 
      ? 'লোকাল ক্যাশ সফলভাবে রিসেট করা হয়েছে! ডাটাবেস থেকে ফ্রেশ তথ্য লোড করার জন্য পেজটি পুনরায় লোড হচ্ছে...' 
      : 'Local browser cache has been cleared! Reloading the page to retrieve fresh data from the server...');
    window.location.reload();
  };

  React.useEffect(() => {
    if (!loading && settings && !isInitialized) {
      setFormData({
        name: settings.name || '',
        nameBn: settings.nameBn || '',
        logoURL: settings.logoURL || '',
        officialSealURL: settings.officialSealURL || '',
        contactPhone: settings.contactPhone || '',
        themeColor: settings.themeColor || '#059669',
        portalPasscode: settings.portalPasscode || '7890',
      });
      setIsInitialized(true);
    }
  }, [settings, loading, isInitialized]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const path = `branding/${Date.now()}_${file.name}`;
      const url = await uploadFile(file, path);
      const updatedFormData = { ...formData, logoURL: url };
      setFormData(updatedFormData);
      await updateSettings(updatedFormData);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error: any) {
      console.error("Logo upload failed:", error);
      alert(language === 'bn' ? "লোগো আপলোড করতে ব্যর্থ হয়েছে" : "Logo upload failed: " + (error.message || "Unknown error"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSealUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingSeal(true);
    try {
      const path = `branding/seal_${Date.now()}_${file.name}`;
      const url = await uploadFile(file, path);
      const updatedFormData = { ...formData, officialSealURL: url };
      setFormData(updatedFormData);
      await updateSettings(updatedFormData);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error: any) {
      console.error("Seal upload failed:", error);
      alert(language === 'bn' ? "সিল আপলোড করতে ব্যর্থ হয়েছে" : "Seal upload failed: " + (error.message || "Unknown error"));
    } finally {
      setIsUploadingSeal(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateSettings(formData);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error: any) {
      console.error("Failed to update settings", error);
      alert(language === 'bn' ? "সেটিংস সংরক্ষণ করতে ব্যর্থ হয়েছে" : "Failed to update settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div 
        className={`p-6 md:p-8 rounded-3xl ${isThemeLight ? 'text-slate-950' : 'text-white'} shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden`}
        style={{ backgroundColor: settings.themeColor }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <SettingsIcon size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <div className={`inline-flex items-center gap-2 px-3 py-1 ${isThemeLight ? 'bg-black/10 text-slate-950 font-black' : 'bg-white/20 text-white'} rounded-full text-xs font-semibold uppercase tracking-wider`}>
            ⚙️ {language === 'bn' ? 'কার্যনির্বাহী প্যানেল' : 'Branding Panel'}
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight font-sans">
            {language === 'bn' ? 'সফটওয়্যার সেটিংস' : 'Software Settings'}
          </h2>
          <p className={`${isThemeLight ? 'text-slate-800' : 'text-white/85'} text-xs md:text-sm max-w-xl font-medium`}>
            {language === 'bn' 
              ? 'ডিজিটাল আইডেন্টিটি, ব্র্যান্ডিং ডিজাইন কালার ও অ্যাডমিন অ্যাক্সেস কন্ট্রোল।' 
              : "Control your association's digital presence, core theme colors, and admin access levels."}
          </p>
        </div>
      </div>

      {/* Tabs Row for settings internal options */}
      <div className="flex items-center gap-2 border-b border-emerald-900/40 pb-3">
        <button
          type="button"
          onClick={() => setActiveSettingTab('general')}
          className={`px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer ${
            activeSettingTab === 'general'
              ? 'bg-white text-slate-900 shadow-lg shadow-slate-950/20'
              : 'text-slate-300 hover:text-white hover:bg-emerald-950/60 bg-emerald-950/20 border border-emerald-900/30'
          }`}
        >
          ⚙️ {language === 'bn' ? 'সাধারণ সেটিংস' : 'General Settings'}
        </button>
        <button
          type="button"
          onClick={() => setActiveSettingTab('roles')}
          className={`px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer ${
            activeSettingTab === 'roles'
              ? 'bg-white text-slate-900 shadow-lg shadow-slate-950/20'
              : 'text-slate-300 hover:text-white hover:bg-emerald-950/60 bg-emerald-950/20 border border-emerald-900/30'
          }`}
        >
          🔐 {language === 'bn' ? 'অ্যাডমিন রোলস' : 'Admin Roles'}
        </button>
        <button
          type="button"
          onClick={() => setActiveSettingTab('categories')}
          className={`px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer ${
            activeSettingTab === 'categories'
              ? 'bg-white text-slate-900 shadow-lg shadow-slate-950/20'
              : 'text-slate-300 hover:text-white hover:bg-emerald-950/60 bg-emerald-950/20 border border-emerald-900/30'
          }`}
        >
          🏷️ {language === 'bn' ? 'ব্যয়ের খাতসমূহ (Categories)' : 'Expense Categories'}
        </button>
      </div>

      {activeSettingTab === 'roles' ? (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <AdminRoleManagement />
        </motion.div>
      ) : activeSettingTab === 'categories' ? (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <ExpenseCategoriesManager />
        </motion.div>
      ) : (
        <>
          {!isSuperAdmin && (
            <div className="p-6 bg-amber-50 border border-amber-100/70 rounded-[2rem] flex items-start gap-4 shadow-sm">
              <Shield className="text-amber-600 shrink-0 mt-0.5" size={20} />
              <div>
                <h5 className="text-xs font-black text-amber-900 uppercase tracking-widest leading-none">
                  {language === 'bn' ? 'শুধুমাত্র রিড-অনলি মোড সক্রিয়' : 'Read-Only Mode Active'}
                </h5>
                <p className="text-amber-700/80 text-[11px] font-bold leading-relaxed mt-2">
                  {language === 'bn' 
                    ? 'এই মডিউলের সেটিংস পরিবর্তন করার একমাত্র এক্সেস প্রধান অ্যাডমিনের (sharifahamed016@gmail.com) রয়েছে।' 
                    : 'You can inspect current configurations, but editing branding or colors is exclusively reserved for the primary Administrator.'}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden"
              >
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                        <Globe size={12} /> Association Name (English)
                      </label>
                      <input 
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        disabled={!isSuperAdmin}
                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:opacity-100 disabled:cursor-not-allowed"
                        placeholder="Enter association name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                        <Globe size={12} /> সমিতির নাম (বাংলা)
                      </label>
                      <input 
                        type="text"
                        value={formData.nameBn}
                        onChange={(e) => setFormData({...formData, nameBn: e.target.value})}
                        disabled={!isSuperAdmin}
                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:opacity-100 disabled:cursor-not-allowed"
                        placeholder="সমিতির নাম লিখুন"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                        <Phone size={12} /> Contact Number / যোগাযোগ নম্বর
                      </label>
                      <input 
                        type="text"
                        value={formData.contactPhone}
                        onChange={(e) => setFormData({...formData, contactPhone: e.target.value})}
                        disabled={!isSuperAdmin}
                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:opacity-100 disabled:cursor-not-allowed"
                        placeholder="+880 1XXX-XXXXXX"
                      />
                    </div>
                  </div>

                  <div className="pt-8 border-t border-slate-100">
                     <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                       <Shield size={12} /> {t.appearance}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                           <ImageIcon size={12} /> {t.logoUrl}
                        </label>
                        <div className="flex gap-3">
                           <input 
                             type="text"
                             value={formData.logoURL}
                             onChange={(e) => setFormData({...formData, logoURL: e.target.value})}
                             disabled={!isSuperAdmin}
                              className="flex-1 px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:opacity-100 disabled:cursor-not-allowed"
                             placeholder="https://example.com/logo.png"
                           />
                           {isSuperAdmin && (
                             <label className="relative flex items-center justify-center h-14 w-14 bg-emerald-600 text-white rounded-2xl cursor-pointer shadow-lg shadow-emerald-250 hover:bg-emerald-700 transition-all shrink-0">
                               <Camera size={20} className={isUploading ? 'animate-pulse' : ''} />
                               <input 
                                 type="file" 
                                 accept="image/*"
                                 className="hidden" 
                                 onChange={handleLogoUpload}
                                 disabled={isUploading}
                                />
                             </label>
                           )}
                        </div>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                           <div className="w-3 h-3 rounded-full border border-slate-200" style={{ backgroundColor: formData.themeColor }} /> {t.themeColor}
                        </label>
                        <div className="flex gap-3">
                           <input 
                             type="color"
                             value={formData.themeColor}
                             onChange={(e) => setFormData({...formData, themeColor: e.target.value})}
                             disabled={!isSuperAdmin}
                             className="h-14 w-14 bg-slate-50 border-none rounded-2xl cursor-pointer p-1 disabled:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                           />
                           <input 
                             type="text"
                             value={formData.themeColor}
                             onChange={(e) => setFormData({...formData, themeColor: e.target.value})}
                             disabled={!isSuperAdmin}
                              className="flex-1 px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:opacity-100 disabled:cursor-not-allowed"
                             placeholder="#059669"
                           />
                        </div>
                      </div>

                      {/* Official Seal Upload Option */}
                      <div className="space-y-2 col-span-1 md:col-span-2 pt-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                          <ImageIcon size={12} /> {language === 'bn' ? 'সংস্থার অফিসিয়াল সিল এবং লোগো' : 'Official Organization Seal/Logo'}
                        </label>
                        <div className="flex gap-3">
                          <input 
                            type="text"
                            value={formData.officialSealURL}
                            onChange={(e) => setFormData({...formData, officialSealURL: e.target.value})}
                            disabled={!isSuperAdmin}
                            className="flex-1 px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:opacity-100 disabled:cursor-not-allowed"
                            placeholder="https://example.com/seal.png"
                          />
                          {isSuperAdmin && (
                            <label className="relative flex items-center justify-center h-14 w-14 bg-emerald-600 text-white rounded-2xl cursor-pointer shadow-lg shadow-emerald-250 hover:bg-emerald-700 transition-all shrink-0">
                              <Camera size={20} className={isUploadingSeal ? 'animate-pulse' : ''} />
                              <input 
                                type="file" 
                                accept="image/*"
                                className="hidden" 
                                onChange={handleSealUpload}
                                disabled={isUploadingSeal}
                              />
                            </label>
                          )}
                        </div>
                        <p className="text-[9.5px] text-slate-400 font-bold ml-1">
                          {language === 'bn' 
                            ? 'এটি চাঁদা বিবরণী রশিদ এবং বিজ্ঞপ্তি ডিসপ্যাচ ড্যাশবোর্ডে অফিসিয়াল ভেরিফাইড সিল হিসেবে ব্যবহৃত হবে।' 
                            : 'This is used as the verified stamp/seal in member statements and reminder logs.'}
                        </p>
                      </div>

                      {/* Collection Shared Portal Link Setup Section */}
                      <div className="space-y-4 col-span-1 md:col-span-2 pt-6 border-t border-slate-100">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Link2 size={12} className="text-emerald-600" />
                          {language === 'bn' ? 'স্মার্ট চাঁদা কালেকশন পোর্টাল লিঙ্ক' : 'Collection Portal Link Setup'}
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                              🔐 {language === 'bn' ? 'কালেকশন পিন কোড (Passcode PIN)' : 'Portal Access Bypass PIN'}
                            </label>
                            <input 
                              type="text"
                              maxLength={8}
                              value={formData.portalPasscode}
                              onChange={(e) => setFormData({...formData, portalPasscode: e.target.value.replace(/[^\d]/g, '')})}
                              disabled={!isSuperAdmin}
                              className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 transition-all outline-none disabled:bg-slate-100 disabled:opacity-100"
                              placeholder="7890"
                            />
                            <p className="text-[9px] text-slate-400 font-semibold ml-1">
                              {language === 'bn' 
                                ? 'এই পিনের মাধ্যমে অনুমোদিত কালেক্টর সরাসরি লিংক খুলে কাজ শুরু করতে পারবেন।' 
                                : 'PIN used to authorize sub-admins bypassing raw Google login.'}
                            </p>
                          </div>

                          <div className="space-y-3 bg-emerald-50/50 border border-emerald-100 rounded-3xl p-4 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">
                                  {language === 'bn' ? 'কালেকশন লিঙ্ক প্রস্তুত' : 'Shared Link Online'}
                                </span>
                              </div>
                              <p className="text-[10px] font-bold text-slate-600 mt-1 leading-normal">
                                {language === 'bn' 
                                  ? 'নিচের কপি বাটনে ক্লিক করে লিঙ্কটি অন্যান্য কালেকশন ম্যানেজার বা অ্যাডমিনকে পাঠান।' 
                                  : 'Copy and send this path so managers can record collections seamlessly.'}
                              </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2 pt-1.5">
                              {/* Option A: Bypass Login Link */}
                              <button
                                type="button"
                                onClick={() => {
                                  const pin = formData.portalPasscode || '7890';
                                  const baseUrl = window.location.origin;
                                  const finalUrl = `${baseUrl}/?portal=data-entry&key=${pin}`;
                                  navigator.clipboard.writeText(finalUrl);
                                  setCopiedBypassUrl(true);
                                  setTimeout(() => setCopiedBypassUrl(false), 2000);
                                }}
                                className="flex-1 px-3 py-2.5 bg-slate-900 text-white font-extrabold text-[10px] rounded-xl flex items-center justify-center gap-1.5 hover:bg-slate-800 transition-all cursor-pointer whitespace-nowrap"
                              >
                                <Copy size={12} />
                                {copiedBypassUrl ? (language === 'bn' ? 'কপি সফল!' : 'Copied!') : (language === 'bn' ? 'অটো-লগইন লিংক কপি' : 'Copy Auto-Login Url')}
                              </button>

                              {/* Option B: Clear PIN Entrance Link */}
                              <button
                                type="button"
                                onClick={() => {
                                  const baseUrl = window.location.origin;
                                  const finalUrl = `${baseUrl}/?portal=data-entry`;
                                  navigator.clipboard.writeText(finalUrl);
                                  setCopiedPortalUrl(true);
                                  setTimeout(() => setCopiedPortalUrl(false), 2000);
                                }}
                                className="flex-1 px-3 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/15 text-emerald-700 font-extrabold text-[10px] rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                              >
                                <ExternalLink size={12} />
                                {copiedPortalUrl ? (language === 'bn' ? 'কপি সফল!' : 'Copied!') : (language === 'bn' ? 'স্ট্যান্ডার্ড লিংক কপি' : 'Copy Clean Url')}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {showSuccess && (
                        <motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-2 text-emerald-600 font-bold text-sm"
                        >
                          <CheckCircle2 size={18} />
                          {language === 'bn' ? 'সেটিংস সফলভাবে সংরক্ষিত হয়েছে' : 'Settings saved successfully'}
                        </motion.div>
                      )}
                    </div>
                    {isSuperAdmin && (
                      <button 
                        type="submit"
                        disabled={isSaving}
                        className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-slate-200"
                      >
                        <Save size={18} />
                        {isSaving ? (language === 'bn' ? 'সংরক্ষণ করা হচ্ছে...' : 'Saving...') : (language === 'bn' ? 'পরিবর্তন সংরক্ষণ করুন' : 'Save Changes')}
                      </button>
                    )}
                  </div>
                </form>
              </motion.div>
            </div>

            <div className="space-y-6">
              <div className="bg-emerald-900 rounded-[2.5rem] p-8 text-white shadow-xl shadow-emerald-200">
                <h3 className="text-xl font-black mb-4 flex items-center gap-2">
                  <Shield size={24} className="text-emerald-400" />
                  {language === 'bn' ? 'নিরাপত্তা' : 'Security'}
                </h3>
                <p className="text-emerald-100/70 text-sm leading-relaxed mb-6 font-medium">
                  {language === 'bn' 
                    ? 'আপনার অ্যাপ্লিকেশন গুগল লগইন দ্বারা সুরক্ষিত। শুধুমাত্র অনুমোদিত অ্যাডমিনরাই এই সেটিংস পরিবর্তন করতে পারেন।' 
                    : 'Your application is secured with Google Authentication. Only authorized administrators can modify these settings.'}
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-xs font-bold">Google Login Active</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-xs font-bold">Firestore Security Rules V2</span>
                  </div>
                </div>
              </div>

              {/* Database Troubleshooter & Quota Limit Recovery Card */}
              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl shadow-slate-200/60 space-y-5">
                <div className="space-y-2">
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <Database size={20} className="text-amber-500" />
                    {language === 'bn' ? 'ডাটা সংযোগ ট্রাবলশুটার' : 'Database Troubleshooter'}
                  </h3>
                  <p className="text-slate-500 text-xs font-bold leading-relaxed">
                    {language === 'bn'
                      ? 'কোটা লিমিট বা ব্রাউজার অফলাইন লকের কারণে মেম্বার বা পেমেন্ট ডাটা লোড না হলে নিচের মডিউলগুলো ব্যবহার করে সংযোগ রিসেট করুন।'
                      : 'If data fails to load due to previous network limit triggers or sticky local storage offline locks, reset them here.'}
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    onClick={handleResetQuota}
                    className="w-full flex items-center justify-between p-4 bg-amber-50 hover:bg-amber-100 border border-amber-250 rounded-2xl text-amber-900 transition-all font-black text-xs uppercase tracking-wider"
                  >
                    <span className="flex items-center gap-2 text-left">
                      🔌 {language === 'bn' ? 'অফলাইন ও কোটা লক দূর করুন' : 'Reset Quota / Force Online'}
                    </span>
                    <RefreshCw size={14} className="shrink-0 animate-spin-slow" />
                  </button>

                  <button
                    type="button"
                    onClick={handleClearLocalCache}
                    className="w-full flex items-center justify-between p-4 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-2xl text-rose-950 transition-all font-black text-xs uppercase tracking-wider"
                  >
                    <span className="flex items-center gap-2 text-left">
                      🗑️ {language === 'bn' ? 'ব্রাউজার ক্যাশ ও ডাটা রিসেট করুন' : 'Clear Local Cache'}
                    </span>
                    <AlertTriangle size={14} className="shrink-0" />
                  </button>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl text-[10px] text-slate-400 font-bold leading-normal">
                  💡 {language === 'bn' 
                    ? 'ডাটাবেস নতুনভাবে রি-প্রোভিশন করা হলে সেটি প্রথমে শূন্য থাকে। আপনি গুগল শিট সিঙ্ক সেকশন থেকে গুগল শিটের সব পুরনো মেম্বার ও পেমেন্ট রেকর্ড পুনরায় লোড করতে পারবেন।'
                    : 'A newly provisioned database is initially empty. Use the Google Sheets Sync utility to restore all historical records.'}
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-xl shadow-slate-200/60">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Preview Branding</h4>
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                  {getImageUrl(formData.logoURL) ? (
                    <img src={getImageUrl(formData.logoURL)} alt="Preview" className="w-12 h-12 rounded-xl object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-12 h-12 bg-emerald-700 rounded-xl flex items-center justify-center text-white font-black text-xl">
                      {(language === 'bn' ? formData.nameBn : formData.name).charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate">
                      {language === 'bn' ? formData.nameBn : formData.name}
                    </p>
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Active Branding</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
