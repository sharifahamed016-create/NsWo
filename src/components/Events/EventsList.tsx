/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Edit2, Trash2, Calendar, DollarSign, 
  TrendingUp, Award, ArrowRight, BookOpen, AlertCircle, MapPin
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useEvents } from '../../hooks/useEvents';
import { AppEvent } from '../../types';
import EventForm from './EventForm';
import EventDetails from './EventDetails';
import { getImageUrl } from '../../lib/utils';

export default function EventsList() {
  const { language, t, isAdmin, isModerator, settings } = useAppContext();

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

  const { events, donors, expenses, loading, deleteEvent } = useEvents();

  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
  const [viewingEvent, setViewingEvent] = useState<AppEvent | null>(null);

  // Filter events by title search
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchSearch = (
        e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.titleBn.includes(searchTerm) ||
        (e.location && e.location.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      return matchSearch;
    });
  }, [events, searchTerm]);

  // Aggregate stats across ALL events for global event tracking card
  const globalBudget = useMemo(() => events.reduce((sum, e) => sum + e.budget, 0), [events]);
  const globalDonations = useMemo(() => donors.reduce((sum, d) => sum + d.amount, 0), [donors]);
  const globalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
  const globalBalance = globalDonations - globalExpenses;

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(language === 'bn' ? 'ইভেন্ট সম্পূর্ণ মুছে ফেলতে চান?' : 'Are you sure you want to delete this event entirely?')) {
      await deleteEvent(id);
    }
  };

  const handleEdit = (event: AppEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEvent(event);
    setIsFormOpen(true);
  };

  const statusColors = {
    upcoming: 'bg-blue-50 text-blue-600 border-blue-100',
    ongoing: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    completed: 'bg-slate-50 text-slate-500 border-slate-100',
  };

  const statusLabels = {
    upcoming: language === 'bn' ? 'আসন্ন' : 'Upcoming',
    ongoing: language === 'bn' ? 'চলমান' : 'Ongoing',
    completed: language === 'bn' ? 'সম্পন্ন' : 'Completed',
  };

  if (viewingEvent) {
    return (
      <EventDetails 
        event={viewingEvent} 
        onBack={() => setViewingEvent(null)} 
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Banner */}
      <div 
        className={`p-6 md:p-8 rounded-3xl ${isThemeLight ? 'text-slate-950' : 'text-white'} shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden`}
        style={{ backgroundColor: settings.themeColor }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <Calendar size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <div className={`inline-flex items-center gap-2 px-3 py-1 ${isThemeLight ? 'bg-black/10 text-slate-950 font-black' : 'bg-white/20 text-white'} rounded-full text-xs font-semibold uppercase tracking-wider`}>
            🎉 {language === 'bn' ? 'ইভেন্ট ম্যানেজমেন্ট' : 'Event Records'}
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight font-sans">
            {language === 'bn' ? 'ইভেন্ট ম্যানেজমেন্ট' : 'Event Management'}
          </h2>
          <p className={`${isThemeLight ? 'text-slate-800' : 'text-white/85'} text-xs md:text-sm max-w-xl font-medium`}>
            {language === 'bn' 
              ? `মোট ${events.length}টি সামাজিক ও কল্যাণমূলক ইভেন্ট পরিচালিত হচ্ছে।` 
              : `Total ${events.length} social welfare events managed and tracked below.`}
          </p>
        </div>
        {isModerator && (
          <button 
            type="button"
            onClick={() => {
              setSelectedEvent(null);
              setIsFormOpen(true);
            }}
            className="z-10 flex items-center justify-center gap-2 px-5 py-3.5 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-[1.02] transform transition-all text-sm self-start md:self-center cursor-pointer"
          >
            <Plus size={18} />
            {language === 'bn' ? 'নতুন ইভেন্ট দিন' : 'Create Event'}
          </button>
        )}
      </div>

      {/* Global Event Metrics summary widget */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative space-y-2">
          <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Global Budgets</p>
          <p className="text-2xl font-black">৳{globalBudget.toLocaleString()}</p>
          <p className="text-xs text-slate-400">Total theoretical budget allocated</p>
        </div>

        <div className="relative space-y-2 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6">
          <p className="text-[10px] font-black uppercase text-rose-400 tracking-widest">Global Donations</p>
          <p className="text-2xl font-black text-rose-400">৳{globalDonations.toLocaleString()}</p>
          <p className="text-xs text-slate-400">Aggregate funds contributed by donors</p>
        </div>

        <div className="relative space-y-2 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6">
          <p className="text-[10px] font-black uppercase text-purple-400 tracking-widest">Net Event Balance</p>
          <p className={`text-2xl font-black ${globalBalance >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
            ৳{globalBalance.toLocaleString()}
          </p>
          <p className="text-xs text-slate-400">Active net balance (Donations - Spent)</p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="relative bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder={language === 'bn' ? 'ইভেন্ট শিরোনাম অথবা ঠিকানা দিয়ে খুঁজুন...' : 'Search events & locations...'} 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-50 border-none rounded-xl pl-14 pr-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none text-slate-700 font-medium"
        />
      </div>

      {/* Grid List of Events */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 font-medium">Loading events...</div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-[2.5rem] border border-slate-100 shadow-sm text-slate-400 font-medium animate-in fade-in duration-300">
          {language === 'bn' ? 'কোনো ইভেন্ট খুঁজে পাওয়া যায়নি' : 'No events found.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredEvents.map((item) => {
            const hasBanner = !!item.imageURL;
            return (
              <div 
                key={item.id}
                onClick={() => setViewingEvent(item)}
                className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-emerald-100 transition-all cursor-pointer flex flex-col sm:flex-row overflow-hidden group min-h-[170px]"
              >
                {/* Image block */}
                <div className="w-full sm:w-40 h-32 sm:h-auto relative shrink-0 bg-slate-100">
                  {hasBanner ? (
                    <img 
                      src={getImageUrl(item.imageURL)} 
                      alt="Banner" 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-500/10 to-teal-500/5 flex items-center justify-center text-emerald-600">
                      <BookOpen size={24} />
                    </div>
                  )}
                  <span className={`absolute top-3 left-3 inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${statusColors[item.status]} shadow-sm backdrop-blur-[2px]`}>
                    {statusLabels[item.status]}
                  </span>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-slate-400 mb-1">
                      <div className="flex items-center gap-1">
                        <Calendar size={12} className="text-slate-400" />
                        <span className="text-[9px] font-bold">{item.date}</span>
                      </div>
                      {(item.location || item.locationBn) && (
                        <div className="flex items-center gap-0.5 max-w-[130px] truncate bg-rose-50/50 px-1.5 py-0.5 rounded-full border border-rose-100/30">
                          <MapPin size={11} className="text-rose-500 shrink-0" />
                          <span className="text-[8px] font-black text-rose-600 truncate">
                            {language === 'bn' ? (item.locationBn || item.location) : item.location}
                          </span>
                        </div>
                      )}
                    </div>

                    <h3 className="text-sm font-black text-slate-900 group-hover:text-emerald-600 transition-colors line-clamp-1 leading-tight mb-1">
                      {language === 'bn' ? (item.titleBn || item.title) : item.title}
                    </h3>

                    <p className="text-[11px] text-slate-500 font-medium line-clamp-2 leading-relaxed">
                      {language === 'bn' ? (item.descriptionBn || item.description) : item.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-50 pt-3 mt-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Budget:</span>
                      <span className="text-xs font-black text-slate-900 font-mono">৳{item.budget.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {isModerator && (
                        <button 
                          onClick={(e) => handleEdit(item, e)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <Edit2 size={13} />
                        </button>
                      )}
                      {isAdmin && (
                        <button 
                          onClick={(e) => handleDelete(item.id, e)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      <div className="w-7 h-7 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors ml-1">
                        <ArrowRight size={13} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Creation Modal Form */}
      <AnimatePresence>
        {isFormOpen && (
          <EventForm 
            onClose={() => setIsFormOpen(false)} 
            initialData={selectedEvent} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
