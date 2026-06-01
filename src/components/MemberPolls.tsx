/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Trash2, Calendar, Vote, CheckCircle, BarChart2, 
  Clock, Lock, Unlock, AlertTriangle, Sparkles, UserCheck, Eye
} from 'lucide-react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAppContext } from '../context/AppContext';
import { logActivity } from '../lib/activity';

interface PollVote {
  voterId: string; // Member Custom ID (e.g. NSWO-001) or email
  voterName: string;
  optionIndex: number;
  votedAt: number;
}

interface Poll {
  id: string;
  question: string;
  questionBn: string;
  options: string[];
  optionsBn?: string[];
  endDate: string;
  votes: PollVote[];
  isClosed: boolean;
  createdBy: string;
  createdAt: number;
}

export default function MemberPolls() {
  const { language, isModerator, settings } = useAppContext();
  
  const [polls, setPolls] = useState<Poll[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_polls');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(true);

  // Form states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newQuestionBn, setNewQuestionBn] = useState('');
  const [newEndDate, setNewEndDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]); // Default 7 days
  const [optionInputs, setOptionInputs] = useState<string[]>(['Yes', 'No']);
  const [optionInputsBn, setOptionInputsBn] = useState<string[]>(['হ্যাঁ', 'না']);

  // Voting action state
  const [activeVotingPoll, setActiveVotingPoll] = useState<string | null>(null);
  const [voterNameInput, setVoterNameInput] = useState('');
  const [voterIdInput, setVoterIdInput] = useState('');
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);

  // Load from Firestore
  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Poll[];
        setPolls(data);
        localStorage.setItem('nswo_polls', JSON.stringify(data));
      } catch (err) {
        console.warn("Exception parsing polls:", err);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'polls');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion || optionInputs.some(o => !o.trim())) return;

    const localId = `local_poll_${Date.now()}`;
    const newPoll: Poll = {
      id: localId,
      question: newQuestion,
      questionBn: newQuestionBn || newQuestion,
      options: optionInputs.filter(o => o.trim() !== ''),
      optionsBn: optionInputsBn.filter(o => o.trim() !== ''),
      endDate: newEndDate,
      votes: [],
      isClosed: false,
      createdBy: 'sharifahamed016@gmail.com',
      createdAt: Date.now()
    };

    const updated = [newPoll, ...polls];
    setPolls(updated);
    try {
      localStorage.setItem('nswo_polls', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'poll_create', 
      `Launched New Decision Poll: '${newPoll.question}'`, 
      `নতুন ডিজিটাল পোল ও ভোটিং চালু করা হয়েছে: '${newPoll.questionBn}'`
    ).catch(() => {});

    setIsCreateOpen(false);
    setNewQuestion('');
    setNewQuestionBn('');
    setOptionInputs(['Yes', 'No']);
    setOptionInputsBn(['হ্যাঁ', 'না']);

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return;
    }

    try {
      const dbPoll = { ...newPoll };
      delete (dbPoll as any).id;
      await addDoc(collection(db, 'polls'), dbPoll);
    } catch (err) {
      console.warn("Firestore error adding poll:", err);
    }
  };

  const handleVoteSubmit = async (pollId: string) => {
    if (selectedOptionIndex === null || !voterIdInput.trim() || !voterNameInput.trim()) {
      alert(language === 'bn' ? 'অনুগ্রহ করে সকল তথ্য পূর্ণ করুন।' : 'Please fill in all voting credentials.');
      return;
    }

    const targetPoll = polls.find(p => p.id === pollId);
    if (!targetPoll) return;

    const cleanVoterId = voterIdInput.trim().toUpperCase();

    // Check if member already voted in this poll
    const alreadyVoted = targetPoll.votes.some(v => v.voterId === cleanVoterId);
    if (alreadyVoted) {
      alert(language === 'bn' ? 'দুঃখিত, এই মেম্বার আইডি থেকে ইতিপূর্বে ভোট দেওয়া হয়েছে!' : 'This Member ID representation has already submitted a ballot on this poll!');
      return;
    }

    const newVote: PollVote = {
      voterId: cleanVoterId,
      voterName: voterNameInput.trim(),
      optionIndex: selectedOptionIndex,
      votedAt: Date.now()
    };

    const updatedVotes = [...targetPoll.votes, newVote];
    const updated = polls.map(p => p.id === pollId ? { ...p, votes: updatedVotes } : p);
    setPolls(updated);
    try {
      localStorage.setItem('nswo_polls', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'poll_vote',
      `Member '${newVote.voterName}' voted in poll ID ${pollId}`,
      `সদস্য '${newVote.voterName}' পোল আইডি ${pollId} এ তাঁর বহুমূল্য ভোট প্রদান করেছেন।`
    ).catch(() => {});

    // Clear state
    setVoterIdInput('');
    setVoterNameInput('');
    setSelectedOptionIndex(null);
    setActiveVotingPoll(null);

    alert(language === 'bn' ? 'আপনার ভোটটি সফলভাবে গৃহীত হয়েছে!' : 'Your democratic ballot was submitted successfully!');

    if (pollId.startsWith('local_poll_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      const docRef = doc(db, 'polls', pollId);
      await updateDoc(docRef, { votes: updatedVotes });
    } catch (err) {
      console.warn("Firestore error saving vote:", err);
    }
  };

  const handleToggleClosePoll = async (pollId: string, currentStatus: boolean) => {
    const updated = polls.map(p => p.id === pollId ? { ...p, isClosed: !currentStatus } : p);
    setPolls(updated);
    try {
      localStorage.setItem('nswo_polls', JSON.stringify(updated));
    } catch {}

    if (pollId.startsWith('local_poll_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      const docRef = doc(db, 'polls', pollId);
      await updateDoc(docRef, { isClosed: !currentStatus });
    } catch (err) {
      console.warn("Firestore status toggle failed:", err);
    }
  };

  const handleDeletePoll = async (id: string) => {
    const confirmMsg = language === 'bn' ? 'ডিজিটাল পোলটি কি সম্পূর্ণ ডিলিট করতে চান?' : 'Are you sure you want to delete this decision poll?';
    if (!window.confirm(confirmMsg)) return;

    const filtered = polls.filter(p => p.id !== id);
    setPolls(filtered);
    try {
      localStorage.setItem('nswo_polls', JSON.stringify(filtered));
    } catch {}

    if (id.startsWith('local_poll_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'polls', id));
    } catch (err) {
      console.warn("Firestore delete failed:", err);
    }
  };

  const addOptionField = () => {
    setOptionInputs([...optionInputs, '']);
    setOptionInputsBn([...optionInputsBn, '']);
  };

  const checkIsExpired = (endDateStr: string): boolean => {
    return new Date().getTime() > new Date(endDateStr).getTime();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Banner */}
      <div 
        className="p-6 md:p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden"
        style={{ backgroundColor: settings.themeColor || '#059669' }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <Vote size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 text-white rounded-full text-xs font-semibold uppercase tracking-wider">
            🗳️ {language === 'bn' ? 'ডিজিটাল ভোটিং প্যানেল' : 'Member Poll Panel'}
          </span>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            {language === 'bn' ? 'ডিজিটাল মেম্বার ভোটিং ও পোলিং সিস্টেম' : 'Digital Member Voting & Poll System'}
          </h2>
          <p className="text-white/85 text-xs md:text-sm max-w-xl font-medium">
            {language === 'bn'
              ? 'সংস্থার সাধারণ কার্যসম্পাদন, গুরুত্বপূর্ণ সিদ্ধান্ত গ্রহণ, বা বাজেট অনুমোদনে সকল মেম্বারদের সমান ভোটাধিকার প্রয়োগ।'
              : 'Empower our democratic council. Members can cast their premium ballots securely to make key society declarations.'
            }
          </p>
        </div>
        {isModerator && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="z-10 flex items-center justify-center gap-2 px-5 py-3.5 bg-white text-slate-900 font-bold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-[1.02] transform transition-all text-sm self-start md:self-center"
          >
            <Plus size={18} />
            {language === 'bn' ? 'নতুন ভোট চালু করুন' : 'Create Decision Poll'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4 font-mono"></div>
          <p className="text-slate-500 text-sm font-medium animate-pulse">{language === 'bn' ? 'লোড হচ্ছে...' : 'Loading active polls...'}</p>
        </div>
      ) : polls.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-2">
          <div className="w-12 h-12 bg-slate-50 text-slate-400 flex items-center justify-center rounded-2xl mx-auto font-black text-lg">🗳️</div>
          <p className="text-slate-500 text-xs font-bold leading-relaxed">{language === 'bn' ? 'বর্তমানে কোনো চালু ভোটিং পোল নেই।' : 'No democratic polls are actively running currently.'}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {polls.map((poll) => {
            const isFinished = poll.isClosed || checkIsExpired(poll.endDate);
            const totalVotes = poll.votes.length;

            // Calculate ratios for progress bar metrics
            const optionStats = poll.options.map((option, idx) => {
              const optionVotesCount = poll.votes.filter(v => v.optionIndex === idx).length;
              const pct = totalVotes > 0 ? Math.round((optionVotesCount / totalVotes) * 100) : 0;
              return { option, optionBn: poll.optionsBn?.[idx] || option, count: optionVotesCount, percentage: pct };
            });

            return (
              <div 
                key={poll.id}
                className="bg-white rounded-[2.2rem] border border-slate-150 p-6 md:p-8 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
              >
                {/* Finish status header wrapper */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 mb-5 border-slate-50">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      isFinished 
                        ? 'bg-slate-100 text-slate-500' 
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-100 animate-pulse'
                    }`}>
                      {isFinished ? (
                        <span className="flex items-center gap-1"><Lock size={10} /> {language === 'bn' ? 'সমাপ্ত' : 'Closed / Paused'}</span>
                      ) : (
                        <span className="flex items-center gap-1"><Unlock size={10} /> {language === 'bn' ? 'সক্রিয় ভোটদান' : 'Active Polling'}</span>
                      )}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                      <Calendar size={11} /> {language === 'bn' ? `শেষ সময়: ${poll.endDate}` : `Deadline: ${poll.endDate}`}
                    </span>
                  </div>

                  {isModerator && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleClosePoll(poll.id, poll.isClosed)}
                        className="text-[10px] font-black uppercase text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-all"
                      >
                        {poll.isClosed ? (language === 'bn' ? 'পুনরায় খুলুন' : 'Reopen') : (language === 'bn' ? 'বন্ধ করুন' : 'Force Close')}
                      </button>
                      <button
                        onClick={() => handleDeletePoll(poll.id)}
                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                  
                  {/* Left Column: Question details & Options visual bars */}
                  <div className="lg:col-span-3 space-y-5">
                    <h3 className="text-base font-black text-slate-900 tracking-tight leading-snug">
                      ❓ {language === 'bn' ? poll.questionBn : poll.question}
                    </h3>

                    {/* Progress bars of continuous voting ratios */}
                    <div className="space-y-4">
                      {optionStats.map((stat, idx) => (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs font-black">
                            <span className="text-slate-700 font-bold">
                              {language === 'bn' ? stat.optionBn : stat.option}
                            </span>
                            <span className="text-slate-500">
                              {stat.count} {language === 'bn' ? 'ভোট' : 'ballots'} ({stat.percentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden relative">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${stat.percentage}%` }}
                              transition={{ duration: 0.6 }}
                              className={`h-full rounded-full ${
                                idx === 0 ? 'bg-emerald-500' : idx === 1 ? 'bg-blue-500' : idx === 2 ? 'bg-purple-500' : 'bg-amber-500'
                              }`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1.5">
                      <BarChart2 size={14} className="text-slate-300" />
                      <span>{language === 'bn' ? `সর্বমোট সংগৃহীত ভোট: ${totalVotes} টি` : `Total Democratic Ballots: ${totalVotes}`}</span>
                    </div>
                  </div>

                  {/* Right Column: Ballot casting card or Finished receipt */}
                  <div className="lg:col-span-2">
                    {isFinished ? (
                      <div className="bg-slate-50 border border-slate-150 p-5 rounded-3xl text-center space-y-2 select-none">
                        <Lock size={24} className="mx-auto text-slate-400" />
                        <h4 className="font-black text-slate-800 text-xs uppercase tracking-wider">
                          {language === 'bn' ? 'ভোটদান বন্ধ রয়েছে' : 'Ballot Closed'}
                        </h4>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                          {language === 'bn'
                            ? 'এই পোলের নির্দিষ্ট সময়সীমা অতিক্রান্ত হয়ে যাওয়ায় বা স্থগিত করায় বর্তমানে নতুন কোনো ব্যালট পেপার গ্রহণ করা হচ্ছে না।'
                            : 'This specific civic issue has closed and compiled its results. No further voting entries are active.'}
                        </p>
                      </div>
                    ) : activeVotingPoll === poll.id ? (
                      <div className="bg-emerald-50/50 border border-emerald-100 p-5 rounded-3xl space-y-4 animate-in fade-in duration-300">
                        <div className="text-xs font-black text-emerald-900 uppercase tracking-widest border-b border-emerald-100/60 pb-1.5">
                          🗳️ {language === 'bn' ? 'ব্যালট পেপার সাবমিট' : 'Cast Your Ballot'}
                        </div>
                        
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Voter Full Name / নাম *</label>
                            <input 
                              type="text" 
                              required
                              placeholder="उदा: শরীফ আহমেদ"
                              value={voterNameInput}
                              onChange={(e) => setVoterNameInput(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-emerald-100 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Voter System ID / মেম্বার আইডি *</label>
                            <input 
                              type="text" 
                              required
                              placeholder="NSWO-016"
                              value={voterIdInput}
                              onChange={(e) => setVoterIdInput(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-emerald-100 rounded-lg text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500 placeholder-slate-400"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Option Choice *</label>
                            <div className="grid grid-cols-2 gap-2">
                              {poll.options.map((option, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setSelectedOptionIndex(idx)}
                                  className={`p-2.5 rounded-lg text-[10px] font-black uppercase text-center border transition-all ${
                                    selectedOptionIndex === idx 
                                      ? 'bg-rose-500 text-white border-rose-600' 
                                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {language === 'bn' ? (poll.optionsBn?.[idx] || option) : option}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2.5 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveVotingPoll(null);
                              setSelectedOptionIndex(null);
                            }}
                            className="flex-1 py-2 bg-white border text-slate-600 rounded-lg text-[10px] font-bold uppercase transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVoteSubmit(poll.id)}
                            className="flex-1 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase transition shadow-md shadow-rose-100"
                          >
                            Submit Vote
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-6 bg-slate-50 hover:bg-slate-100/60 border border-slate-150 rounded-[2rem] transition-all cursor-pointer select-none space-y-1"
                        onClick={() => {
                          setActiveVotingPoll(poll.id);
                          setVoterNameInput('');
                          setVoterIdInput('');
                          setSelectedOptionIndex(null);
                        }}
                      >
                        <UserCheck size={20} className="mx-auto text-emerald-600" />
                        <h4 className="font-extrabold text-slate-900 text-xs">
                          {language === 'bn' ? 'পোলটিতে ভোট দিন' : 'Cast Your Vote Here'}
                        </h4>
                        <p className="text-[9px] text-slate-400 font-semibold font-sans">
                          {language === 'bn' ? 'আইডি ভেরিফিকেশনের মাধ্যমে ভোট দিন' : 'Enter registered member credentials to vote'}
                        </p>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-over Create Modal */}
      <AnimatePresence>
        {isCreateOpen && (
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
                    {language === 'bn' ? '🗳️ নতুন মেম্বার পোল বা ভোটিং সেটআপ' : '🗳️ Assemble Member Poll'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {language === 'bn' ? 'কাউন্সিল মেম্বাররা ব্যালট নির্বাচন করতে পারবেন' : 'Members cast choice with individual ID checks'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsCreateOpen(false)}
                  className="p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-slate-800 text-xs font-bold transition-all"
                >
                  X
                </button>
              </div>

              <form onSubmit={handleCreatePoll} className="space-y-4">
                
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Decision Question (English) *</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g., Should we approve the community health camp budget?"
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">ভোটদানের প্রশ্ন (বাংলা) *</label>
                  <input
                    type="text"
                    required
                    placeholder="উদা: আমাদের ফ্রী খৎনা ক্যাম্পের ২০,০০০ টাকার বাজেট কি পাশ করা উচিত?"
                    value={newQuestionBn}
                    onChange={(e) => setNewQuestionBn(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-bold">Deadline Date / সমাপ্তির তারিখ *</label>
                  <input
                    type="date"
                    required
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Option fields */}
                <div className="space-y-3.5 border-t border-slate-100 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Voting Options (ব্যালট অপশন)</span>
                    <button
                      type="button"
                      onClick={addOptionField}
                      className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-1 rounded"
                    >
                      + Add Option
                    </button>
                  </div>

                  <div className="space-y-2">
                    {optionInputs.map((opt, idx) => (
                      <div key={idx} className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          placeholder={`Option #${idx+1} (English)`}
                          value={opt}
                          onChange={(e) => {
                            const updated = [...optionInputs];
                            updated[idx] = e.target.value;
                            setOptionInputs(updated);
                          }}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <input
                          type="text"
                          required
                          placeholder={`অপশন #${idx+1} (বাংলা)`}
                          value={optionInputsBn[idx] || ''}
                          onChange={(e) => {
                            const updated = [...optionInputsBn];
                            updated[idx] = e.target.value;
                            setOptionInputsBn(updated);
                          }}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-120 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-5 py-2.5 bg-slate-105 text-slate-500 rounded-lg text-[10px] font-black uppercase transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase rounded-lg transition-all shadow-lg"
                  >
                    Launch Poll
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
