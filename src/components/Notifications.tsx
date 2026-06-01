import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, AlertTriangle, ChevronRight, X, MessageSquare } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useMembers } from '../hooks/useMembers';
import { getImageUrl } from '../lib/utils';
import { MemberRoleType } from '../types';

interface NotificationsProps {
  isOpen: boolean;
  onClose: () => void;
  onViewMember: (memberId: string) => void;
}

export default function Notifications({ isOpen, onClose, onViewMember }: NotificationsProps) {
  const { language } = useAppContext();
  const { members } = useMembers();

  const dueMembers = React.useMemo(() => {
    return members.map(m => {
      // Donors, volunteers, and advisors have no monthly dues or subscriptions
      if (m.roleType && m.roleType !== MemberRoleType.GENERAL && m.roleType !== MemberRoleType.MANAGEMENT) {
        return { ...m, due: 0, dueMonths: 0 };
      }
      
      const joined = new Date(m.joinedDate);
      const today = new Date();
      const years = today.getFullYear() - joined.getFullYear();
      const months = today.getMonth() - joined.getMonth();
      const totalMonths = Math.max(0, (years * 12) + months + 1);
      
      const monthlyFee = typeof m.monthlySubscription === 'number' ? m.monthlySubscription : 500;
      const expected = totalMonths * monthlyFee;
      const due = Math.max(0, expected - (m.totalPaid || 0));
      const dueMonths = monthlyFee > 0 ? Math.max(0, totalMonths - Math.floor((m.totalPaid || 0) / monthlyFee)) : 0;

      return { ...m, due, dueMonths };
    }).filter(m => m.dueMonths >= 2); // Show if 2 or more months due
  }, [members]);

  const sendWhatsAppReminder = (member: any) => {
    const appName = language === 'bn' ? 'NSWO' : 'NSWO';
    const text = language === 'bn' 
      ? `আসসালামু আলাইকুম ${member.nameBn}, ${appName} থেকে আপনার ${member.dueMonths} মাসের চাঁদা (৳${member.due}) বকেয়া আছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন। ধন্যবাদ।`
      : `Assalamu Alaikum ${member.name}, you have ${member.dueMonths} months of pending subscription (Total: ৳${member.due}) at ${appName}. Please pay as soon as possible. Thank you.`;
    
    const url = `https://wa.me/${member.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-end p-4 lg:p-6 pointer-events-none">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/10 backdrop-blur-[2px] pointer-events-auto"
      />
      
      <motion.div 
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden pointer-events-auto mt-16 lg:mt-0"
      >
        <div className="p-5 border-b border-slate-50 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-rose-50 text-rose-500 rounded-lg flex items-center justify-center">
              <Bell size={18} fill="currentColor" fillOpacity={0.2} />
            </div>
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">
              {language === 'bn' ? 'সতর্কবার্তা' : 'Critical Alerts'}
            </h3>
            {dueMembers.length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {dueMembers.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full text-slate-400">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-2">
          {dueMembers.length > 0 ? (
            <div className="space-y-2">
              {dueMembers.slice(0, 10).map((member) => (
                <button 
                  key={member.id}
                  onClick={() => {
                    onViewMember(member.id);
                    onClose();
                  }}
                  className="w-full text-left p-4 hover:bg-rose-50 rounded-2xl transition-all group border border-transparent hover:border-rose-100"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden bg-rose-100/50 flex items-center justify-center font-black border-2 border-white shadow-sm shrink-0">
                      {getImageUrl(member.photoURL) ? (
                        <img src={getImageUrl(member.photoURL)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        member.name[0]
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {language === 'bn' ? member.nameBn : member.name}
                      </p>
                      <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">
                        {member.dueMonths} {language === 'bn' ? 'মাস বাকি' : 'Months Overdue'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          sendWhatsAppReminder(member);
                        }}
                        className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                        title="Send WhatsApp Reminder"
                      >
                        <MessageSquare size={16} fill="currentColor" fillOpacity={0.1} />
                      </button>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-rose-400 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300">
                <Bell size={24} />
              </div>
              <p className="text-sm font-bold text-slate-400">No critical alerts</p>
            </div>
          )}
        </div>

        {dueMembers.length > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-100">
             <button 
               onClick={onClose}
               className="w-full py-3 bg-white text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-colors"
             >
               Dismiss All
             </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
