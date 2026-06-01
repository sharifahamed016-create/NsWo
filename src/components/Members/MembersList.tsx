/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Filter, MoreHorizontal, UserPlus, Users,
  Phone, MapPin, BadgeCheck, X, Edit2, Trash2, Camera, ExternalLink
} from 'lucide-react';
import { useMembers } from '../../hooks/useMembers';
import { useAppContext } from '../../context/AppContext';
import { getImageUrl } from '../../lib/utils';
import { Member, MemberStatus, MemberRoleType } from '../../types';
import MemberForm from './MemberForm';
import MemberProfile from './MemberProfile';

const toBanglaDigits = (num: number | string): string => {
  const bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(num).split('').map(char => {
    const idx = parseInt(char, 10);
    return isNaN(idx) ? char : bn[idx];
  }).join('');
};

export default function MembersList({ roleFilter }: { roleFilter?: MemberRoleType } = {}) {
  const { t, language, isSuperAdmin, isAdmin, isModerator, settings } = useAppContext();

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

  const { members, loading, deleteMember, moveMember } = useMembers();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MemberStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | MemberRoleType>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [viewingMember, setViewingMember] = useState<Member | null>(null);
  const [isEditorLayout, setIsEditorLayout] = useState(false);

  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      const itemRole = m.roleType || MemberRoleType.GENERAL;
      const matchesCategory = categoryFilter === 'all' || itemRole === categoryFilter;

      const matchesSearch = (
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.nameBn && m.nameBn.toLowerCase().includes(searchTerm.toLowerCase())) ||
        m.memberId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.phone.includes(searchTerm) ||
        (m.designation && m.designation.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (m.country && m.country.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      const matchesFilter = statusFilter === 'all' || m.status === statusFilter;
      return matchesCategory && matchesSearch && matchesFilter;
    });
  }, [members, searchTerm, statusFilter, categoryFilter]);

  const getTitle = () => {
    if (roleFilter === MemberRoleType.ADVISORY) return t.advisory;
    if (roleFilter === MemberRoleType.VOLUNTEER) return t.volunteers;
    return language === 'bn' ? 'সদস্য তালিকা' : 'Members List';
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(language === 'bn' ? 'সদস্য মুছে ফেলবেন?' : 'Are you sure to delete this member?')) {
      await deleteMember(id);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Banner */}
      <div 
        className={`p-6 md:p-8 rounded-3xl ${isThemeLight ? 'text-slate-950' : 'text-white'} shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden`}
        style={{ backgroundColor: settings.themeColor }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <Users size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <div className={`inline-flex items-center gap-2 px-3 py-1 ${isThemeLight ? 'bg-black/10 text-slate-950 font-black' : 'bg-white/20 text-white'} rounded-full text-xs font-semibold uppercase tracking-wider`}>
            👥 {language === 'bn' ? 'সদস্য ব্যবস্থাপনা' : 'Member Directory'}
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            {getTitle()}
          </h2>
          <p className={`${isThemeLight ? 'text-slate-800' : 'text-white/85'} text-xs md:text-sm max-w-xl font-medium`}>
            {language === 'bn' 
              ? `মোট ${filteredMembers.length} জন নিবন্ধিত সদস্যের তথ্য ও পরিচিতি এখানে সংরক্ষিত আছে।` 
              : `Total ${filteredMembers.length} registered members archived securely in current lookup.`
            }
          </p>
        </div>
        {isAdmin && (
          <div className="z-10 flex items-center gap-3 flex-wrap self-start md:self-center">
            {/* Quick-action toggle button between standard list view and full sidebar editor layout */}
            <button 
              type="button"
              onClick={() => {
                setIsEditorLayout(!isEditorLayout);
                setSelectedMember(null); // Reset selection on toggle
              }}
              className="flex items-center justify-center gap-2 px-5 py-3.5 bg-slate-900 border border-slate-700/50 hover:bg-slate-800 text-white font-extrabold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-[1.02] transform transition-all text-sm cursor-pointer"
              title={language === 'bn' ? 'এডিটর এবং মেম্বার লিস্টের মধ্যে স্যুইচ করুন' : 'Instant toggle between List View and Sidebar Full Editor'}
              id="btn-toggle-editor-layout"
            >
              {isEditorLayout ? (
                <>
                  <Users size={16} />
                  <span>{language === 'bn' ? 'তালিকা ভিউ' : 'List View'}</span>
                </>
              ) : (
                <>
                  <Edit2 size={16} />
                  <span>{language === 'bn' ? 'পুর্ণাঙ্গ এডিটর' : 'Full Editor'}</span>
                </>
              )}
            </button>

            <button 
              type="button"
              onClick={() => {
                if (isEditorLayout) {
                  setSelectedMember(null); // In editor layout, clicking "+ Add Member" opens raw new form
                } else {
                  setSelectedMember(null);
                  setIsFormOpen(true);
                }
              }}
              className="flex items-center justify-center gap-2 px-5 py-3.5 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-[1.02] transform transition-all text-sm cursor-pointer"
              id="btn-add-member"
            >
              <UserPlus size={18} />
              {t.addMember}
            </button>
          </div>
        )}
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 pb-1">
        {[
          { id: 'all', label: language === 'bn' ? 'সবাই' : 'All Members', icon: '👥', color: 'bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 font-bold border-slate-200/60' },
          { id: MemberRoleType.GENERAL, label: language === 'bn' ? 'সাধারণ সদস্য' : 'General', icon: '🟢', color: 'bg-emerald-50/80 hover:bg-emerald-100/80 text-emerald-800 font-bold border-emerald-100' },
          { id: MemberRoleType.MANAGEMENT, label: language === 'bn' ? 'ম্যানেজমেন্ট মেম্বার' : 'Management Member', icon: '🛡️', color: 'bg-rose-50/80 hover:bg-rose-100/80 text-rose-800 font-bold border-rose-100' },
          { id: MemberRoleType.ADVISORY, label: language === 'bn' ? 'উপদেষ্টা মণ্ডলী' : 'Advisory Board', icon: '🟣', color: 'bg-indigo-50/80 hover:bg-indigo-100/80 text-indigo-800 font-bold border-indigo-100' },
          { id: MemberRoleType.DONOR, label: language === 'bn' ? 'ডোনার' : 'Donor', icon: '💝', color: 'bg-amber-50/80 hover:bg-amber-100/80 text-amber-800 font-bold border-amber-100' },
          { id: MemberRoleType.VOLUNTEER, label: language === 'bn' ? 'স্বেচ্ছাসেবী' : 'Volunteers', icon: '🟠', color: 'bg-orange-50/80 hover:bg-orange-100/80 text-orange-850 font-bold border-orange-100' }
        ].map(tab => {
          const isActive = categoryFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCategoryFilter(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs transition-all border shadow-sm active:scale-95 ${
                isActive 
                  ? 'bg-slate-900 border-slate-900 text-white font-extrabold shadow-md' 
                  : tab.color
              }`}
            >
              <span className="text-sm">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder={t.search + '...'} 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border-none rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none text-slate-700 font-medium"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full bg-slate-50 border-none rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none text-slate-700 font-bold appearance-none"
          >
            <option value="all">All Status</option>
            <option value={MemberStatus.ACTIVE}>{t.active}</option>
            <option value={MemberStatus.INACTIVE}>{t.inactive}</option>
          </select>
        </div>
      </div>

      {/* Real-time Switchable Layout Render (Regular table list view OR Sidebar Master-Detail Editor view) */}
      {isEditorLayout ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-300" id="editor-layout-container">
          {/* Left Column: Quick Members list Sidebar */}
          <div className="lg:col-span-4 bg-white rounded-[2rem] border border-slate-100 shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-50 pb-3">
              <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                👥 {language === 'bn' ? `${toBanglaDigits(filteredMembers.length)} জন সদস্য` : `${filteredMembers.length} Members`}
              </span>
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className={`text-xs px-3.5 py-1.5 rounded-xl border flex items-center gap-1 transition-all font-extrabold ${
                  selectedMember === null
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md scale-[1.02]'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <Plus size={13} />
                <span>{language === 'bn' ? 'নতুন যোগ' : 'Add New'}</span>
              </button>
            </div>
            
            <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {filteredMembers.map((member) => {
                const isSelected = selectedMember?.id === member.id;
                return (
                  <div
                    key={member.id}
                    onClick={() => setSelectedMember(member)}
                    className={`p-3 rounded-2xl border transition-all duration-250 cursor-pointer flex items-center justify-between group/sidebar relative overflow-hidden ${
                      isSelected
                        ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                        : 'bg-slate-50 border-slate-100 text-slate-900 hover:bg-slate-100/80 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 relative z-10 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-150 overflow-hidden border-2 border-white shadow-sm flex-shrink-0">
                        {getImageUrl(member.photoURL) ? (
                          <img src={getImageUrl(member.photoURL)} alt={member.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center font-black text-xs ${isSelected ? 'bg-slate-850 text-amber-500' : 'bg-emerald-100 text-emerald-600'}`}>
                            {member.name[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-black leading-tight truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                          {language === 'bn' ? (member.nameBn || member.name) : member.name}
                        </p>
                        <p className={`text-[10px] font-bold ${isSelected ? 'text-slate-400' : 'text-slate-405'} mt-0.5`}>
                          {member.memberId}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 relative z-10">
                      <span className={`w-2 h-2 rounded-full ${member.status === MemberStatus.ACTIVE ? 'bg-emerald-500 shadow-sm shadow-emerald-400' : 'bg-slate-400'}`} />
                      
                      {isSuperAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(member.id);
                            if (selectedMember?.id === member.id) {
                              setSelectedMember(null);
                            }
                          }}
                          className={`p-1.5 rounded-lg opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200 ${
                            isSelected 
                              ? 'text-red-400 hover:bg-slate-800' 
                              : 'text-red-500 hover:bg-red-50'
                          }`}
                          title={t.delete}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredMembers.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-slate-400 font-bold text-xs">{language === 'bn' ? 'কোনো সদস্য পাওয়া যায়নি!' : 'No matching members found.'}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Embedded/Inline member editor */}
          <div className="lg:col-span-8">
            <MemberForm 
              isInline={true}
              initialData={selectedMember}
              onClose={() => {
                setSelectedMember(null);
              }}
            />
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden" id="table-layout-container">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    {language === 'bn' ? 'ক্রমিক' : 'SL'}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    {language === 'bn' ? 'পদবি ও বিভাগ' : 'Designation / Category'}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.name}</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.phone}</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.status}</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredMembers.map((member, idx) => (
                  <tr 
                    key={member.id} 
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    onClick={() => setViewingMember(member)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 min-w-6 inline-block">
                          {language === 'bn' ? toBanglaDigits(idx + 1) : idx + 1}
                        </span>
                        {isAdmin && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => moveMember(member.id, 'up')}
                              disabled={idx === 0}
                              className="p-1 rounded bg-slate-100 hover:bg-emerald-600 hover:text-white border border-slate-200 text-[8px] cursor-pointer disabled:opacity-25 transition-all text-slate-650"
                              title={language === 'bn' ? "উপরে নিন" : "Move Up"}
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveMember(member.id, 'down')}
                              disabled={idx === filteredMembers.length - 1}
                              className="p-1 rounded bg-slate-100 hover:bg-emerald-600 hover:text-white border border-slate-200 text-[8px] cursor-pointer disabled:opacity-25 transition-all text-slate-650"
                              title={language === 'bn' ? "নিচে নিন" : "Move Down"}
                            >
                              ▼
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {member.roleType === MemberRoleType.ADVISORY ? (
                        <span className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-800 text-[10px] font-black px-2.5 py-1 rounded-md leading-none">
                          🟣 {member.designation || (language === 'bn' ? 'উপদেষ্টা মহোদয়' : 'Advisor')}
                        </span>
                      ) : member.roleType === MemberRoleType.VOLUNTEER ? (
                        <span className="inline-flex items-center gap-1 bg-orange-50 border border-orange-100 text-orange-810 text-[10px] font-black px-2.5 py-1 rounded-md leading-none">
                          🟠 {member.volunteerType || (language === 'bn' ? 'স্বেচ্ছাসেবী' : 'Volunteer')}
                        </span>
                      ) : member.roleType === MemberRoleType.MANAGEMENT ? (
                        <span className="inline-flex items-center gap-1 bg-rose-50 border border-rose-100 text-rose-800 text-[10px] font-black px-2.5 py-1 rounded-md leading-none">
                          🛡️ {member.designation || (language === 'bn' ? 'ম্যানেজমেন্ট মেম্বার' : 'Management Member')}
                        </span>
                      ) : member.roleType === MemberRoleType.DONOR ? (
                        <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-1 rounded-md leading-none">
                          💝 {member.designation || (language === 'bn' ? 'ডোনার' : 'Donor')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded-md leading-none">
                          🟢 {member.designation || (language === 'bn' ? 'সাধারণ সদস্য' : 'General Member')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden border-2 border-white shadow-md flex-shrink-0">
                          {getImageUrl(member.photoURL) ? (
                            <img src={getImageUrl(member.photoURL)} alt={member.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-emerald-100 text-emerald-600 font-black">
                              {member.name[0]}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 leading-none">
                            {language === 'bn' ? (member.nameBn || member.name) : member.name}
                          </p>
                          {member.country && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                🌍 {member.country}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-600">
                      {member.phone}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
                        member.status === MemberStatus.ACTIVE 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${member.status === MemberStatus.ACTIVE ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        {member.status === MemberStatus.ACTIVE ? t.active : t.inactive}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setViewingMember(member)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title={t.viewProfile}
                        >
                          <ExternalLink size={16} />
                        </button>
                        {isAdmin && (
                          <button 
                            onClick={() => {
                              setSelectedMember(member);
                              setIsFormOpen(true);
                            }}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title={language === 'bn' ? 'সরাসরি এডিট করুন' : 'Edit Member Details'}
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                        {isAdmin && (
                          <button 
                            onClick={() => {
                              setSelectedMember(member);
                              setIsEditorLayout(true);
                            }}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title={language === 'bn' ? 'পুর্ণাঙ্গ এডিটরে খুলুন (ইনলাইন)' : 'Open in Full Editor Layout (Inline)'}
                          >
                            <Edit2 size={16} className="text-indigo-600 stroke-[3.5]" />
                          </button>
                        )}
                        {isSuperAdmin && (
                          <button 
                            onClick={() => handleDelete(member.id)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title={t.delete}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredMembers.length === 0 && !loading && (
              <div className="p-12 text-center max-w-2xl mx-auto space-y-4">
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500 border border-amber-100">
                  <Search size={32} />
                </div>
                {members.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-slate-800 font-black text-base">
                      {language === 'bn' ? 'ডাটাবেসে কোনো সদস্য পাওয়া যায়নি!' : 'No members found in database!'}
                    </p>
                    <p className="text-slate-500 text-xs leading-relaxed font-semibold">
                      {language === 'bn'
                        ? 'আপনার ডাটাবেসটি এই মুহূর্তে খালি রয়েছে অথবা পূর্বের কোনো ডাটা লিমিট বা কোটা লকের কারণে ডাটা প্রদর্শন হচ্ছে না। অনুগ্রহ করে "গুগল শিট সিঙ্ক" মডিউল ব্যবহার করে আপনার সব সদস্য ও পেমেন্ট রেকর্ড নিমেষেই পুনরুদ্ধার করুন অথবা সেটিংস থেকে ট্রাবলশুটার ক্লিয়ার করুন।'
                        : 'Your database is currently empty or blocked by a sticky cached connection limit. Please use the Google Sheets Sync utility to restore all historical data or clear the local storage cache in Settings.'}
                    </p>
                    <div className="p-2 border border-slate-100 rounded-2xl bg-slate-50/50 text-[10px] text-slate-400 font-semibold leading-normal">
                      💡 {language === 'bn'
                        ? 'বাম পাশের মেনু থেকে "📊 গুগল শিট সিঙ্ক" এ ক্লিক করুন অথবা "⚙️ সেটিংস" পেজের নিচে ট্রাবলশুট বাটন চাপুন।'
                        : 'Navigate to "Google Sheets Sync" from the sidebar menu to sync members and receipt records.'}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-slate-500 font-bold">{language === 'bn' ? 'সদস্য পাওয়া যায়নি' : 'No matching members found'}</p>
                    <p className="text-slate-400 text-xs font-medium">
                      {language === 'bn' ? 'অনুগ্রহ করে সার্চ কীওয়ার্ড অথবা ফিল্টার বদলে পুনরায় চেষ্টা করুন।' : 'Search with different terms or check status filter.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Member Form Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <MemberForm 
            onClose={() => setIsFormOpen(false)} 
            initialData={selectedMember}
          />
        )}
      </AnimatePresence>

      {/* Member Profile Modal */}
      <AnimatePresence>
        {viewingMember && (
          <MemberProfile 
            member={viewingMember}
            onClose={() => setViewingMember(null)}
            onEdit={() => {
              setSelectedMember(viewingMember);
              setViewingMember(null);
              setIsFormOpen(true);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
