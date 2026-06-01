/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Save, Calendar, DollarSign, Edit3, MapPin, Image, Upload, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useEvents } from '../../hooks/useEvents';
import { useAppContext } from '../../context/AppContext';
import { AppEvent } from '../../types';
import { uploadFile } from '../../lib/storage';
import { getImageUrl } from '../../lib/utils';

const eventSchema = z.object({
  title: z.string().min(2, 'English title must be at least 2 characters'),
  titleBn: z.string().min(2, 'বাংলা শিরোনাম কমপক্ষে ২ অক্ষর হতে হবে'),
  description: z.string().min(5, 'English description is required'),
  descriptionBn: z.string().min(5, 'বাংলা বিবরণ কমপক্ষে ৫ অক্ষর হতে হবে'),
  budget: z.number().min(0, 'Budget must be positive'),
  date: z.string(),
  location: z.string().min(2, 'Location is required'),
  locationBn: z.string().min(2, 'লোকেশন আবশ্যক'),
  imageURL: z.string().optional(),
  status: z.enum(['upcoming', 'ongoing', 'completed']),
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventFormProps {
  onClose: () => void;
  initialData: AppEvent | null;
}

export default function EventForm({ onClose, initialData }: EventFormProps) {
  const { t, language } = useAppContext();
  const { addEvent, updateEvent } = useEvents();
  const [imagePreview, setImagePreview] = useState(initialData?.imageURL || '');
  const [isUploading, setIsUploading] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: initialData ? {
      title: initialData.title,
      titleBn: initialData.titleBn,
      description: initialData.description,
      descriptionBn: initialData.descriptionBn,
      budget: initialData.budget,
      date: initialData.date,
      location: initialData.location || '',
      locationBn: initialData.locationBn || '',
      imageURL: initialData.imageURL || '',
      status: initialData.status,
    } : {
      budget: 10000,
      date: new Date().toISOString().split('T')[0],
      location: '',
      locationBn: '',
      imageURL: '',
      status: 'upcoming',
    }
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Create local preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Upload file to storage
      const path = `events/${Date.now()}_${file.name}`;
      const url = await uploadFile(file, path);
      setValue('imageURL', url, { shouldDirty: true, shouldValidate: true });
      setImagePreview(url);
    } catch (error: any) {
      console.error("Banner upload failed:", error);
      alert(language === 'bn' ? "ব্যানার আপলোড ব্যর্থ হয়েছে!" : "Image upload failed!");
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = async (data: EventFormData) => {
    try {
      const payload = {
        ...data,
        imageURL: imagePreview || data.imageURL || '',
      };
      if (initialData) {
        await updateEvent(initialData.id, payload);
      } else {
        await addEvent(payload);
      }
      onClose();
    } catch (error: any) {
      console.error("Save event failed:", error);
      alert(language === 'bn' ? "ইভেন্ট সংরক্ষণ করতে ব্যর্থ হয়েছে" : "Failed to save event");
    }
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
        <div className="flex items-center justify-between p-6 lg:p-8 border-b border-slate-100">
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Edit3 size={20} className="text-emerald-600" />
            {initialData 
              ? (language === 'bn' ? 'ইভেন্ট সংশোধন' : 'Edit Event')
              : (language === 'bn' ? 'নতুন ইভেন্ট তৈরি' : 'Create Event')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 lg:p-8 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Banner Upload Section */}
          <div className="space-y-1.5 col-span-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
              {language === 'bn' ? 'ইভেন্ট ব্যানার / ফটো' : 'Event Banner / Photo'}
            </label>
            <div className="relative border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-3xl p-4 transition-all duration-300 bg-slate-50/50 flex flex-col items-center justify-center text-center group cursor-pointer overflow-hidden min-h-[140px]">
              {imagePreview ? (
                <>
                  <img 
                    src={getImageUrl(imagePreview)} 
                    alt="Event Banner" 
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover rounded-3xl opacity-90 group-hover:opacity-100 transition-opacity" 
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <p className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-1">
                      <Upload size={14} />
                      {language === 'bn' ? 'নতুন ছবি দিন' : 'Change Image'}
                    </p>
                  </div>
                </>
              ) : (
                <div className="py-2">
                  <div className="mx-auto w-10 h-10 bg-white shadow-sm flex items-center justify-center text-slate-400 rounded-2xl mb-2 group-hover:text-emerald-500 transition-colors">
                    <Image size={20} />
                  </div>
                  <p className="text-xs font-bold text-slate-500">
                    {language === 'bn' ? 'ফটো আপলোড করতে ক্লিক করুন' : 'Click to upload flyer banner'}
                  </p>
                  <p className="text-[9px] text-slate-400 font-medium uppercase mt-0.5">PNG, JPG up to 5MB</p>
                </div>
              )}
              {isUploading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-10 animate-in fade-in">
                  <Loader2 className="animate-spin text-emerald-600" size={24} />
                  <p className="text-xs font-black text-slate-900 uppercase tracking-widest">Uploading...</p>
                </div>
              )}
              <input 
                type="file" 
                accept="image/*"
                onChange={handleImageUpload}
                disabled={isUploading}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
                {language === 'bn' ? 'শিরোনাম (ইংরেজী)' : 'Title (English)'}
              </label>
              <input 
                {...register('title')}
                placeholder="E.g., Winter Relief Drive"
                className={`w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none ${errors.title ? 'ring-2 ring-red-500' : ''}`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
                {language === 'bn' ? 'শিরোনাম (বাংলা)' : 'Title (Bangla)'}
              </label>
              <input 
                {...register('titleBn')}
                placeholder="উদা: শীতবস্ত্র বিতরণ উৎসব"
                className={`w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none ${errors.titleBn ? 'ring-2 ring-red-500' : ''}`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
                {language === 'bn' ? 'ইভেন্ট তারিখ' : 'Event Date'}
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="date"
                  {...register('date')}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
                {language === 'bn' ? 'বাজেট পরিমাণ' : 'Budget Amount'}
              </label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="number"
                  {...register('budget', { valueAsNumber: true })}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                />
              </div>
            </div>

            {/* Location fields */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
                {language === 'bn' ? 'লোকেশন (ইংরেজী)' : 'Location (English)'}
              </label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  {...register('location')}
                  placeholder="E.g., Central Park Plaza"
                  className={`w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none ${errors.location ? 'ring-2 ring-red-500' : ''}`}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
                {language === 'bn' ? 'লোকেশন (বাংলা)' : 'Location (Bangla)'}
              </label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  {...register('locationBn')}
                  placeholder="উদা: কেন্দ্রীয় পার্ক প্রাঙ্গণ"
                  className={`w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none ${errors.locationBn ? 'ring-2 ring-red-500' : ''}`}
                />
              </div>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
                {language === 'bn' ? 'স্ট্যাটাস' : 'Status'}
              </label>
              <select 
                {...register('status')}
                className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none appearance-none"
              >
                <option value="upcoming">{language === 'bn' ? 'আসন্ন ইভেন্ট (Upcoming)' : 'Upcoming'}</option>
                <option value="ongoing">{language === 'bn' ? 'চলমান ইভেন্ট (Ongoing)' : 'Ongoing'}</option>
                <option value="completed">{language === 'bn' ? 'সম্পন্ন ইভেন্ট (Completed)' : 'Completed'}</option>
              </select>
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
                {language === 'bn' ? 'উদ্দেশ্য / বিবরণ (ইংরেজী)' : 'Purpose / Description (English)'}
              </label>
              <textarea 
                {...register('description')}
                rows={3}
                placeholder="Explain the goals of this event..."
                className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none resize-none"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
                {language === 'bn' ? 'উদ্দেশ্য / বিবরণ (বাংলা)' : 'উদ্দেশ্য / বিবরণ (বাংলা)'}
              </label>
              <textarea 
                {...register('descriptionBn')}
                rows={3}
                placeholder="বাংলায় বর্ণনা করুন..."
                className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none resize-none"
              />
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
            {isSubmitting ? 'প্রসেসিং...' : t.save}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
