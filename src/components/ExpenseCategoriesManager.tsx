import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Tag, AlertCircle, CheckCircle2, Lock, Sparkles, FolderPlus } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { ExpenseCategory } from '../types';

export default function ExpenseCategoriesManager() {
  const { settings, updateSettings, language, isSuperAdmin } = useAppContext();
  const [newCategory, setNewCategory] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customCategories = settings?.customExpenseCategories || [];
  const systemCategories = Object.values(ExpenseCategory);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    const trimmed = newCategory.trim().toLowerCase();

    if (!trimmed) {
      setErrorMsg(
        language === 'bn' 
          ? 'অনুগ্রহ করে একটি সঠিক ক্যাটাগরির নাম লিখুন।' 
          : 'Please enter a valid category name.'
      );
      return;
    }

    // RegEx block for safe characters (letters, numbers, underscores, spaces, hyphens)
    if (!/^[a-zA-Z0-9_\-\s]+$/.test(trimmed)) {
      setErrorMsg(
        language === 'bn' 
          ? 'ক্যাটাগরির নামে শুধুমাত্র অক্ষর, সংখ্যা, স্পেস, হাইফেন বা আন্ডারস্কোর ব্যবহার করতে পারবেন।' 
          : 'Categories can only contain letters, numbers, spaces, hyphens, or underscores.'
      );
      return;
    }

    // Check if it already exists in system categories
    if (systemCategories.some(c => c.toLowerCase() === trimmed)) {
      setErrorMsg(
        language === 'bn' 
          ? `"${trimmed.toUpperCase()}" একটি সিস্টেম ক্যাটাগরি, এটি আগেই রয়েছে।` 
          : `"${trimmed.toUpperCase()}" is a built-in system category.`
      );
      return;
    }

    // Check if it already exists in custom categories
    if (customCategories.some(c => c.toLowerCase() === trimmed)) {
      setErrorMsg(
        language === 'bn' 
          ? 'এই ক্যাটাগরিটি ইতিমধ্যে তৈরি করা আছে।' 
          : 'This category already exists.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedList = [...customCategories, trimmed];
      await updateSettings({ customExpenseCategories: updatedList });
      setNewCategory('');
      setSuccessMsg(
        language === 'bn' 
          ? `সাফল্য! "${trimmed.toUpperCase()}" ক্যাটাগরি যুক্ত করা হয়েছে।` 
          : `Success! Added category "${trimmed.toUpperCase()}".`
      );
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCategory = async (catToDelete: string) => {
    if (!isSuperAdmin) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const confirmation = window.confirm(
      language === 'bn' 
        ? `আপনি কি নিশ্চিতভাবে "${catToDelete.toUpperCase()}" ক্যাটাগরিটি মুছে দিতে চান? এর ফলে পূর্বে করা ট্রানজেকশন ডাটাবেস থেকে ডিলিট হবে না, কিন্তু নতুন খরচ তৈরির সময় এটি আর সিলেক্ট করা যাবে না।`
        : `Are you sure you want to remove "${catToDelete.toUpperCase()}"? This won't delete recorded expenses, but prevents selecting it for newer entries.`
    );

    if (!confirmation) return;

    try {
      const updatedList = customCategories.filter(c => c !== catToDelete);
      await updateSettings({ customExpenseCategories: updatedList });
      setSuccessMsg(
        language === 'bn' 
          ? `সাফল্য! "${catToDelete.toUpperCase()}" ক্যাটাগরি মুছে ফেলা হয়েছে।` 
          : `Removed category "${catToDelete.toUpperCase()}".`
      );
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete category');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Category Creation Form */}
      <div className="lg:col-span-1 space-y-6">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-xl shadow-slate-200/50 space-y-5"
        >
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
              <Sparkles size={10} /> {language === 'bn' ? 'কাস্টমাইজ করুন' : 'Custom Tracking'}
            </span>
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              {language === 'bn' ? 'নতুন ক্যাটাগরি যোগ করুন' : 'Add New Category'}
            </h3>
            <p className="text-slate-400 text-[10px] md:text-xs">
              {language === 'bn' 
                ? 'আপনার প্রয়োজন অনুযায়ী ক্যাটাগরি যুক্ত করুন, যাতে নির্ভুল মাসিক রিপোর্ট ট্র্যাক করা যায়।' 
                : 'Define organizational divisions or branches to structure precise balance statements.'}
            </p>
          </div>

          <form onSubmit={handleAddCategory} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                <FolderPlus size={12} /> {language === 'bn' ? 'ক্যাটাগরির নাম' : 'Category Title'}
              </label>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                disabled={!isSuperAdmin || isSubmitting}
                className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 transition-all outline-none disabled:bg-slate-100 disabled:opacity-60"
                placeholder={language === 'bn' ? 'যেমন: transport, rent, maintenance' : 'E.g. transport, rent, maintenance'}
                required
              />
            </div>

            {errorMsg && (
              <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-[11px] font-bold flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-[11px] font-bold flex items-start gap-2 animate-pulse-slow">
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {isSuperAdmin ? (
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-13 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl transition-all shadow-lg hover:shadow-slate-200/60 text-xs uppercase tracking-widest cursor-pointer"
              >
                <Plus size={16} />
                {isSubmitting ? (language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...') : (language === 'bn' ? 'ক্যাটাগরি যুক্ত করুন' : 'Create Category')}
              </button>
            ) : (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-800 text-[10px] font-bold text-center">
                {language === 'bn' 
                  ? '⚠️ শুধুমাত্র সুপার এডমিন ক্যাটাগরি যোগ করতে পারবেন।' 
                  : '⚠️ Only Super Admin can add categories.'}
              </div>
            )}
          </form>
        </motion.div>
      </div>

      {/* Categories Inventory List Dashboard */}
      <div className="lg:col-span-2 space-y-6">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-xl shadow-slate-200/50 space-y-5"
        >
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Tag className="text-emerald-500" size={18} />
              {language === 'bn' ? 'ব্যয়ের খাত ক্যাটাগরি তালিকা' : 'Active Account Categories'}
            </h3>
            <p className="text-slate-400 text-[11px] font-semibold mt-1">
              {language === 'bn' 
                ? 'বর্তমানে সিস্টেমে সচল সকল সাধারণ ও কাস্টম ক্যাটাগরির হিসাব বিবরণী।' 
                : 'The complete directory of core system categories and customizable balance dimensions.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Built-in System Categories */}
            <div className="space-y-3">
              <h5 className="text-[10px] font-black text-slate-450 uppercase tracking-[0.15em] pl-1 flex items-center gap-1.5">
                <Lock size={12} className="text-slate-400" />
                {language === 'bn' ? 'সিস্টেম ডিফোল্ট (রিড-অনলি)' : 'System Defaults (Locked)'}
              </h5>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {systemCategories.map((cat) => (
                  <div 
                    key={cat} 
                    className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-2xl select-none"
                  >
                    <span className="font-extrabold text-[11px] md:text-xs text-slate-600 uppercase tracking-widest pl-1">
                      {cat}
                    </span>
                    <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest bg-slate-150 border border-slate-200/40 px-2 py-0.75 rounded-md flex items-center gap-1">
                      <Lock size={8} /> LOCKED
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* User Custom Defined Categories */}
            <div className="space-y-3">
              <h5 className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.15em] pl-1 flex items-center gap-1.5">
                <Tag size={12} className="text-emerald-500 animate-pulse-slow" />
                {language === 'bn' ? 'আপনার তৈরি কাস্টম ক্যাটাগরি' : 'Custom Categories'}
              </h5>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {customCategories.length === 0 ? (
                  <div className="p-8 border border-dashed border-slate-150 rounded-2xl text-center flex flex-col items-center justify-center bg-slate-50/50">
                    <span className="text-slate-400 text-[10px] md:text-xs font-semibold">
                      {language === 'bn' ? 'কোনো কাস্টম ক্যাটাগরি তৈরি করা নেই।' : 'No custom categories created yet.'}
                    </span>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {customCategories.map((cat) => (
                      <motion.div 
                        key={cat}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center justify-between p-3.5 bg-emerald-50/20 border border-emerald-500/10 hover:border-emerald-500/20 rounded-2xl transition-all"
                      >
                        <span className="font-extrabold text-[11px] md:text-xs text-emerald-950 uppercase tracking-widest pl-1">
                          {cat}
                        </span>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            className="text-rose-500 hover:text-white bg-rose-550/0 hover:bg-rose-500 hover:shadow-md border border-rose-500/10 hover:border-rose-400 p-2 rounded-xl transition-all shrink-0 cursor-pointer"
                            title="Delete custom category"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
