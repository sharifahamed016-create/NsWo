/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Camera, Save, User } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMembers } from '../../hooks/useMembers';
import { useAppContext } from '../../context/AppContext';
import { Member, MemberStatus, MemberRoleType } from '../../types';
import { uploadFile } from '../../lib/storage';
import { getImageUrl } from '../../lib/utils';

const memberSchema = z.object({
  memberId: z.string().min(1, 'Member ID is required'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  nameBn: z.string().optional(),
  phone: z.string().min(11, 'Invalid phone number'),
  secondaryPhone: z.string().optional(),
  address: z.string().min(5, 'Address is required'),
  monthlySubscription: z.number().min(0),
  status: z.nativeEnum(MemberStatus),
  roleType: z.nativeEnum(MemberRoleType),
  joinedDate: z.string(),
  photoURL: z.string().optional(),
  designation: z.string().optional(),
  designationBn: z.string().optional(),
  responsibilities: z.string().optional(),
  adviceNotes: z.string().optional(),
  country: z.string().optional(),
  volunteerType: z.string().optional(),
  dutyArea: z.string().optional(),
  remindersActive: z.boolean().optional(),
  includeInMonthlyLedger: z.boolean().optional(),
});

type MemberFormData = z.infer<typeof memberSchema>;

interface MemberFormProps {
  onClose: () => void;
  initialData: Member | null;
  isInline?: boolean;
}

export default function MemberForm({ onClose, initialData, isInline }: MemberFormProps) {
  const { t, language } = useAppContext();
  const { members, addMember, updateMember } = useMembers();
  const [photoPreview, setPhotoPreview] = useState(initialData?.photoURL || '');
  const [isUploading, setIsUploading] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Create a local preview first
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to Firebase Storage
      const path = `members/${Date.now()}_${file.name}`;
      const url = await uploadFile(file, path);
      setValue('photoURL', url, { shouldDirty: true, shouldValidate: true });
      setPhotoPreview(url);
    } catch (error: any) {
      console.error("Photo upload failed:", error);
      alert("তসবি আপলোড করতে ব্যর্থ হয়েছে: " + (error.message || "Unknown error"));
    } finally {
      setIsUploading(false);
    }
  };

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<MemberFormData>({
    resolver: zodResolver(memberSchema),
    defaultValues: initialData ? {
      memberId: initialData.memberId,
      name: initialData.name,
      nameBn: initialData.nameBn || initialData.name,
      phone: initialData.phone,
      secondaryPhone: initialData.secondaryPhone || '',
      address: initialData.address,
      monthlySubscription: initialData.monthlySubscription ?? 500,
      status: initialData.status,
      roleType: initialData.roleType || MemberRoleType.GENERAL,
      joinedDate: initialData.joinedDate,
      photoURL: initialData.photoURL || '',
      designation: initialData.designation || '',
      designationBn: initialData.designationBn || '',
      responsibilities: initialData.responsibilities || '',
      adviceNotes: initialData.adviceNotes || '',
      country: initialData.country || '',
      volunteerType: initialData.volunteerType || '',
      dutyArea: initialData.dutyArea || '',
      remindersActive: initialData.remindersActive ?? true,
      includeInMonthlyLedger: initialData.includeInMonthlyLedger ?? true,
    } : {
      monthlySubscription: 500,
      status: MemberStatus.ACTIVE,
      roleType: MemberRoleType.GENERAL,
      joinedDate: new Date().toISOString().split('T')[0],
      photoURL: '',
      designation: '',
      designationBn: '',
      responsibilities: '',
      adviceNotes: '',
      country: '',
      volunteerType: '',
      dutyArea: '',
      remindersActive: true,
      includeInMonthlyLedger: true,
    }
  });

  const roleType = watch('roleType');

  // React to roleType changes to default subscriptions correctly
  React.useEffect(() => {
    if (roleType === MemberRoleType.GENERAL) {
      setValue('monthlySubscription', initialData?.monthlySubscription ?? 500);
    } else {
      setValue('monthlySubscription', 0);
    }
  }, [roleType, setValue, initialData]);

  React.useEffect(() => {
    if (!initialData && members.length > 0) {
      const nextId = members.length + 1;
      setValue('memberId', `NSWO-${String(nextId).padStart(3, '0')}`);
    } else if (!initialData && members.length === 0) {
      setValue('memberId', 'NSWO-001');
    }
  }, [members, initialData, setValue]);

  const onSubmit = async (data: MemberFormData) => {
    try {
      const hasNameChanged = !initialData || data.name !== initialData.name;
      const hasDesignationChanged = !initialData || data.designation !== initialData.designation;

      const payload = {
        ...data,
        photoURL: photoPreview || data.photoURL || '',
        nameBn: hasNameChanged ? data.name : (data.nameBn || data.name),
        designationBn: hasDesignationChanged ? (data.designation || '') : (data.designationBn || data.designation || ''),
      };
      if (initialData) {
        await updateMember(initialData.id, payload);
      } else {
        await addMember(payload);
      }
      onClose();
    } catch (error: any) {
      console.error("Save member failed:", error);
      alert("মেম্বার সংরক্ষণ করতে ব্যর্থ হয়েছে: " + (error.message || "Unknown error"));
    }
  };

  const mainContent = (
    <div className={`relative w-full ${isInline ? '' : 'max-w-2xl bg-white rounded-[2.5rem] shadow-2xl'} overflow-hidden text-slate-900`}>
      <div className="flex items-center justify-between p-6 lg:p-8 border-b border-slate-100 animate-in fade-in duration-300">
        <h2 className="text-xl font-black text-slate-900 tracking-tight">
          {initialData ? t.editMember : t.addMember}
        </h2>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
          <X size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className={`p-6 lg:p-8 space-y-6 ${isInline ? 'max-h-[600px] overflow-y-auto custom-scrollbar' : 'max-h-[70vh] overflow-y-auto custom-scrollbar'}`}>
          <div className="flex flex-col md:flex-row gap-8">
            {/* Photo Upload */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative group">
                <div className="w-32 h-32 lg:w-40 lg:h-40 bg-slate-100 rounded-[2.5rem] overflow-hidden border-4 border-emerald-50 shadow-inner flex items-center justify-center">
                  {getImageUrl(photoPreview) ? (
                    <img src={getImageUrl(photoPreview)} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User size={64} className="text-slate-300" />
                  )}
                </div>
                <label className="absolute bottom-2 right-2 p-3 bg-emerald-600 text-white rounded-2xl cursor-pointer shadow-lg shadow-emerald-200 group-hover:scale-110 transition-transform disabled:opacity-50">
                  <Camera size={20} className={isUploading ? 'animate-pulse' : ''} />
                  <input 
                    type="file" 
                    accept="image/*"
                    className="hidden" 
                    onChange={handlePhotoUpload}
                    disabled={isUploading}
                  />
                </label>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profile Picture</p>
            </div>

            {/* Fields */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category Picker */}
              <div className="space-y-1 md:col-span-2 shadow-sm p-4 bg-slate-50/50 rounded-3xl border border-slate-100 animate-in fade-in">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1 mb-2 block">
                  {language === 'bn' ? 'সদস্যের বিভাগ / ক্যাটাগরি *' : 'Member Category / Type *'}
                </label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[
                    { id: MemberRoleType.GENERAL, label: language === 'bn' ? '🟢 সাধারণ সদস্য' : 'General', color: 'peer-checked:bg-emerald-600 peer-checked:text-white border-emerald-100 text-emerald-800 bg-emerald-50/50 hover:bg-emerald-150' },
                    { id: MemberRoleType.MANAGEMENT, label: language === 'bn' ? '🛡️ ম্যানেজমেন্ট' : 'Management', color: 'peer-checked:bg-rose-600 peer-checked:text-white border-rose-100 text-rose-800 bg-rose-50/50 hover:bg-rose-150' },
                    { id: MemberRoleType.ADVISORY, label: language === 'bn' ? '🟣 উপদেষ্টা' : 'Advisor', color: 'peer-checked:bg-indigo-600 peer-checked:text-white border-indigo-100 text-indigo-805 bg-indigo-50/50 hover:bg-indigo-150' },
                    { id: MemberRoleType.DONOR, label: language === 'bn' ? '💝 ডোনার' : 'Donor', color: 'peer-checked:bg-amber-600 peer-checked:text-white border-amber-100 text-amber-805 bg-amber-50/50 hover:bg-amber-150' },
                    { id: MemberRoleType.VOLUNTEER, label: language === 'bn' ? '🟠 স্বেচ্ছাসেবী' : 'Volunteer', color: 'peer-checked:bg-orange-600 peer-checked:text-white border-orange-100 text-orange-800 bg-orange-50/50 hover:bg-orange-150' }
                  ].map(cat => (
                    <label key={cat.id} className="relative cursor-pointer select-none">
                      <input 
                        type="radio"
                        value={cat.id}
                        {...register('roleType')}
                        className="sr-only peer"
                      />
                      <div className={`px-2 py-3 rounded-2xl border text-[11px] font-black text-center transition-all peer-checked:shadow-sm active:scale-95 ${cat.color} overflow-hidden text-ellipsis whitespace-nowrap`}>
                        {cat.label}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{language === 'bn' ? 'সদস্য আইডি' : 'Member ID'}</label>
                <input 
                  {...register('memberId')}
                  placeholder="EX: NSWO-001"
                  className={`w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none ${errors.memberId ? 'ring-2 ring-red-500' : ''}`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{language === 'bn' ? 'যোগদানের তারিখ' : 'Joined Date'}</label>
                <input 
                  type="date"
                  {...register('joinedDate')}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                />
              </div>

              <div className="space-y-1 md:col-span-2 p-4 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-between gap-4 mt-1">
                <div className="text-left">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block leading-none">
                    {language === 'bn' ? 'অটো চাঁদা রিমাইন্ডার' : 'Auto Due Reminders'}
                  </label>
                  <span className="text-[11px] text-slate-500 font-semibold leading-normal mt-1 block">
                    {language === 'bn' 
                      ? 'এই সদস্যকে কি মাসিক চাঁদার বকেয়ার জন্য রিমাইন্ডার বার্তা পাঠানো হবে?' 
                      : 'Send automated WhatsApp/SMS/App notifications if subscription is in overdue state?'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                  <input 
                    type="checkbox" 
                    {...register('remindersActive')} 
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="space-y-1 md:col-span-2 p-4 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-between gap-4">
                <div className="text-left">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block leading-none">
                    {language === 'bn' ? 'মাসিক চাঁদা সূচি অন্তর্ভুক্তি' : 'Monthly Subscription Inclusion'}
                  </label>
                  <span className="text-[11px] text-slate-500 font-semibold leading-normal mt-1 block">
                    {language === 'bn' 
                      ? 'এই সদস্যকে কি মাসিক চাঁদা তালিকায় অন্তর্ভুক্ত রাখা হবে ও সীটে প্রদর্শন করা হবে?' 
                      : 'Include this member in the monthly subscription list and payment ledger sheets?'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                  <input 
                    type="checkbox" 
                    {...register('includeInMonthlyLedger')} 
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{language === 'bn' ? 'সদস্যের নাম' : 'Member Name'} *</label>
                <input 
                  {...register('name')}
                  placeholder={language === 'bn' ? 'যেমন: শরীফ আহমেদ' : 'E.g. Sharif Ahmed'}
                  className={`w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none ${errors.name ? 'ring-2 ring-red-500' : ''}`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{language === 'bn' ? 'মোবাইল নাম্বার' : 'Mobile Number'} *</label>
                <input 
                  {...register('phone')}
                  placeholder="017XXXXXXXX"
                  className={`w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none ${errors.phone ? 'ring-2 ring-red-500' : ''}`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{language === 'bn' ? 'কোন দেশের প্রবাসী (ঐচ্ছিক)' : 'Country of Residence (Optional)'}</label>
                <input 
                  {...register('country')}
                  placeholder={language === 'bn' ? 'যেমন: সৌদি আরব / কুয়েত / ইতালি' : 'E.g. Saudi Arabia / Kuwait / Italy'}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
                  {language === 'bn' ? 'পদবী / দায়িত্ব (ঐচ্ছিক)' : 'Designation / Role (Optional)'}
                </label>
                <input 
                  {...register('designation')}
                  placeholder={
                    roleType === MemberRoleType.MANAGEMENT 
                      ? (language === 'bn' ? 'যেমন: সভাপতি / সাধারণ সম্পাদক / সাংগঠিনক সম্পাদক' : 'E.g. President / General Secretary') 
                      : roleType === MemberRoleType.ADVISORY
                      ? (language === 'bn' ? 'যেমন: উপদেষ্টা মহোদয় / সাধারণ উপদেষ্টা' : 'E.g. General Advisor')
                      : roleType === MemberRoleType.DONOR
                      ? (language === 'bn' ? 'যেমন: আজীবন দাতা / বিশেষ দাতা' : 'E.g. Lifetime Donor')
                      : roleType === MemberRoleType.VOLUNTEER
                      ? (language === 'bn' ? 'যেমন: রক্তদান সমন্বয়কারী / স্বেচ্ছাসেবী' : 'E.g. Blood Volunteer')
                      : (language === 'bn' ? 'যেমন: সাধারণ সদস্য / সদস্য' : 'E.g. General Member')
                  }
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                />
                
                {/* Dynamic helper presets based on selected category */}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(
                    roleType === MemberRoleType.MANAGEMENT 
                      ? [(language === 'bn' ? 'সভাপতি' : 'President'), (language === 'bn' ? 'সহ-সভাপতি' : 'Vice President'), (language === 'bn' ? 'সাধারণ সম্পাদক' : 'General Secretary'), (language === 'bn' ? 'অর্থ সম্পাদক' : 'Finance Secretary'), (language === 'bn' ? 'সাংগঠনিক সম্পাদক' : 'Organizing Secretary'), (language === 'bn' ? 'দপ্তর সম্পাদক' : 'Office Secretary'), (language === 'bn' ? 'প্রচার সম্পাদক' : 'Publicity Secretary')]
                      : roleType === MemberRoleType.ADVISORY
                      ? [(language === 'bn' ? 'উপদেষ্টা মহোদয়' : 'Advisor'), (language === 'bn' ? 'সহকারী উপদেষ্টা' : 'Assistant Advisor'), (language === 'bn' ? 'আজীবন উপদেষ্টা' : 'Lifetime Advisor')]
                      : roleType === MemberRoleType.DONOR
                      ? [(language === 'bn' ? 'আজীবন দাতা' : 'Lifetime Donor'), (language === 'bn' ? 'বিশেষ দাতা' : 'Special Donor'), (language === 'bn' ? 'মরহুম দাতা' : 'Late Donor Sponsor')]
                      : roleType === MemberRoleType.VOLUNTEER
                      ? [(language === 'bn' ? 'রক্তদান সমন্বয়কারী' : 'Blood Donation Coordinator'), (language === 'bn' ? 'ত্রাণ ও দুর্যোগ সমন্বয়কারী' : 'Relief & Disaster Support'), (language === 'bn' ? 'স্বেচ্ছাসেবী কর্মী' : 'Active Volunteer')]
                      : [(language === 'bn' ? 'সাধারণ সদস্য' : 'General Member'), (language === 'bn' ? 'সদস্য' : 'Member')]
                  ).map(p => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => {
                        setValue('designation', p, { shouldDirty: true, shouldValidate: true });
                        setValue('designationBn', p, { shouldDirty: true, shouldValidate: true });
                      }}
                      className="text-[10px] bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 px-2.5 py-1 rounded-lg border border-slate-200 transition-all font-bold active:scale-95"
                    >
                      +{p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{t.status}</label>
                <select 
                  {...register('status')}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none appearance-none"
                >
                  <option value={MemberStatus.ACTIVE}>{language === 'bn' ? 'সক্রিয় (Active)' : 'Active'}</option>
                  <option value={MemberStatus.INACTIVE}>{language === 'bn' ? 'নিষ্ক্রিয় (Inactive)' : 'Inactive'}</option>
                </select>
              </div>

              {/* Dynamic Fields Section */}
              {roleType === MemberRoleType.GENERAL && (
                <div className="space-y-1 md:col-span-2 p-5 bg-emerald-50/40 rounded-[2rem] border border-emerald-100/50 space-y-4 animate-in fade-in">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider ml-1">{language === 'bn' ? 'মাসিক চাঁদা পরিমাণ (৳) *' : 'Monthly Subscription Amount (৳) *'}</label>
                    <input 
                      type="number"
                      {...register('monthlySubscription', { valueAsNumber: true })}
                      placeholder="500"
                      className="w-full px-4 py-3 bg-white text-emerald-800 border-none rounded-xl text-sm font-black focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                    />
                  </div>
                </div>
              )}

              {roleType === MemberRoleType.MANAGEMENT && (
                <div className="space-y-4 md:col-span-2 p-5 bg-rose-50/40 rounded-[2rem] border border-rose-100/50 animate-in fade-in">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-rose-800 uppercase tracking-wider ml-1">{language === 'bn' ? 'মাসিক চাঁদা পরিমাণ (৳) - চাঁদা না দিলে শূন্য (০) লিখুন *' : 'Monthly Subscription (৳) - Enter 0 if none *'}</label>
                    <input 
                      type="number"
                      {...register('monthlySubscription', { valueAsNumber: true })}
                      placeholder="500"
                      className="w-full px-4 py-3 bg-white text-rose-900 border-none rounded-xl text-sm font-black focus:ring-2 focus:ring-rose-500 transition-all outline-none"
                    />
                  </div>

                  <div className="p-4 bg-rose-50/60 text-slate-700 rounded-3xl border border-rose-100/30 flex flex-col gap-1 text-[11px] leading-relaxed">
                    <p className="font-black uppercase tracking-wider text-rose-900 text-[9px]">{language === 'bn' ? '🛡️ পরিচালনা বা ম্যানেজমেন্ট সদস্য নির্দেশিকা' : '🛡️ Management Member Guidelines'}</p>
                    <p className="font-semibold text-slate-600">
                      {language === 'bn' 
                        ? 'সংগঠনের সার্বিক কার্যক্রম পরিচালনা করবেন। মাসিক চাঁদা দিতেও পারেন বা নাও দিতে পারেন (ডাটাবেসে তার সম্পূর্ণ বকেয়া ও পেমেন্ট হিস্ট্রি হিসাব থাকবে)।' 
                        : 'Directs the standard management activities of the organization. May or may not pay monthly subscription fees (all dues and transaction history will be fully calculated in database).'}
                    </p>
                  </div>
                </div>
              )}

              {roleType === MemberRoleType.DONOR && (
                <div className="space-y-4 md:col-span-2 p-5 bg-amber-50/40 rounded-[2rem] border border-amber-100/50 animate-in fade-in">
                  <div className="p-4 bg-amber-50/60 text-slate-700 rounded-3xl border border-amber-100/30 flex flex-col gap-1 text-[11px] leading-relaxed">
                    <p className="font-black uppercase tracking-wider text-amber-900 text-[9px]">{language === 'bn' ? '💝 ডোনার সদস্য নির্দেশিকা' : '💝 Donor Guidelines'}</p>
                    <p className="font-semibold text-slate-600">
                      {language === 'bn' 
                        ? 'বিশেষ প্রকল্প বা কার্যক্রমে অর্থ স্পন্সর করবেন। যেকোনো সময়ে যেকোনো পরিমাণের অনুদান দিয়ে সাহায্য করবেন (সংগঠনের ফান্ড আদায়ের মোট হিসাব থাকবে)।' 
                        : 'Sponsors special activities or custom tasks on a fluid schedule. The dashboard and financial reports will track aggregate payments history and generate full digital receipts.'}
                    </p>
                  </div>
                </div>
              )}

              {roleType === MemberRoleType.ADVISORY && (
                <div className="space-y-4 md:col-span-2 p-5 bg-indigo-50/40 rounded-[2rem] border border-indigo-100/50 animate-in fade-in">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-indigo-800 uppercase tracking-wider ml-1">{language === 'bn' ? 'উপদেষ্টার দায়িত্ব ও ভূমিকা' : 'Advisory Responsibilities'}</label>
                    <textarea 
                      {...register('responsibilities')}
                      rows={2}
                      placeholder={language === 'bn' ? 'যেমন: সংগঠনকে উপদেশ দেওয়া, ফান্ডিংএ সহযোগিতা করা...' : 'E.g. Providing guidance, supporting fundings...'}
                      className="w-full px-4 py-3 bg-white border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-slate-700"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-indigo-800 uppercase tracking-wider ml-1">{language === 'bn' ? 'পরামর্শ ও নির্দেশনাবলী নোট' : 'Recommendation Notes / Guidelines'}</label>
                    <textarea 
                      {...register('adviceNotes')}
                      rows={2}
                      placeholder={language === 'bn' ? 'উপদেষ্টা মহোদয়ের সাম্প্রতিক গুরুত্বপূর্ণ পরামর্শ ও দিকনির্দেশনা...' : 'E.g. Advice/guidelines shared recently by advisor...'}
                      className="w-full px-4 py-3 bg-white border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-slate-700 animate-in fade-in"
                    />
                  </div>
                </div>
              )}

              {roleType === MemberRoleType.VOLUNTEER && (
                <div className="space-y-4 md:col-span-2 p-5 bg-orange-50/40 rounded-[2rem] border border-orange-100/50">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-orange-800 uppercase tracking-wider ml-1">{language === 'bn' ? 'কাজের ধরন / ভূমিকা' : 'Volunteer Activity / Type'}</label>
                    <input 
                      {...register('volunteerType')}
                      placeholder={language === 'bn' ? 'যেমন: রক্তদান কর্মসূচী / ইভেন্ট ডিরেক্টর / ত্রাণ সমন্বয়কারী' : 'E.g. Blood Donation Coordinator / Event Support'}
                      className="w-full px-4 py-3 bg-white border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none text-slate-800"
                    />
                    <div className="flex flex-wrap gap-1 mt-1">
                      {[(language === 'bn' ? 'রক্তদান সমন্বয়কারী' : 'Blood Donation Coordinator'), (language === 'bn' ? 'ত্রাণ ও দুর্যোগ সমন্বয়কারী' : 'Relief & Disaster Support'), (language === 'bn' ? 'ইভেন্ট ভলান্টিয়ার' : 'Event Volunteer')].map(p => (
                        <button
                          type="button"
                          key={p}
                          onClick={() => {
                            setValue('volunteerType', p, { shouldDirty: true, shouldValidate: true });
                          }}
                          className="text-[9px] bg-white text-orange-700 hover:bg-slate-50 px-2 py-1 rounded-md border border-orange-100 transition-colors font-bold"
                        >
                          +{p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-orange-800 uppercase tracking-wider ml-1">{language === 'bn' ? 'দায়িত্ব এলাকা / কর্মস্থল' : 'Responsibilities Area / Duty Area'}</label>
                    <input 
                      {...register('dutyArea')}
                      placeholder={language === 'bn' ? 'যেমন: ঢাকা বিভাগ / উত্তর বাড্ডা অঞ্চল / মাঠ পর্যায়' : 'E.g. Dhaka Division / North Badda / Field Operations'}
                      className="w-full px-4 py-3 bg-white border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none text-slate-800"
                    />
                  </div>

                  <div className="p-4 bg-orange-50 text-orange-800 rounded-3xl border border-orange-100/50 flex flex-col gap-1 text-[11px] leading-relaxed">
                    <p className="font-black uppercase tracking-wider text-orange-900 text-[9px]">{language === 'bn' ? 'স্বেচ্ছাসেবী (Volunteer) ভূমিকা নির্দেশিকা' : 'Volunteer Guidelines'}</p>
                    <p className="font-semibold text-slate-600">
                      {language === 'bn' 
                        ? '✅ যেকোনো সামাজিক কার্যক্রমে সাধ্যমত কাজের সহযোগিতা করবে ও সময় দিবে।' 
                        : '✅ Assists field workflows, supports fundraising/relief programs, and participates actively.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{language === 'bn' ? 'ঠিকানা (এলাকা / জেলা / দেশের ঠিকানা)' : 'Address'} *</label>
                <textarea 
                  {...register('address')}
                  rows={2}
                  placeholder={language === 'bn' ? 'গ্রাম, ডাকঘর, থানা, জেলা...' : 'Village, P.O, Upazila, District...'}
                  className={`w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none resize-none ${errors.address ? 'ring-2 ring-red-500' : ''}`}
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">{language === 'bn' ? 'ছবির লিংক (ঐচ্ছিক)' : 'Photo URL (Optional)'}</label>
                <input 
                  {...register('photoURL')}
                  onChange={(e) => {
                    register('photoURL').onChange(e);
                    setPhotoPreview(e.target.value);
                  }}
                  placeholder="https://example.com/photo.jpg"
                  className="w-full block px-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
          </div>
        </form>

        <div className="p-6 lg:p-8 bg-slate-50/50 flex items-center justify-end gap-3 border-t border-slate-100">
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all"
          >
            {t.cancel}
          </button>
          <button 
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl text-sm font-bold shadow-lg shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50"
          >
            <Save size={18} />
            {isSubmitting ? 'পরক্রিয়াধীন...' : t.save}
          </button>
        </div>
      </div>
  );

  if (isInline) {
    return (
      <div className="w-full bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden text-slate-900">
        {mainContent}
      </div>
    );
  }

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
        className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl flex flex-col"
      >
        {mainContent}
      </motion.div>
    </div>
  );
}
