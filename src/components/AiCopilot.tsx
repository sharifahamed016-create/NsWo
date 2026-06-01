import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Send, Loader2, ArrowRight, HelpCircle, 
  TrendingUp, FileText, Bell, Users, ShieldAlert,
  Wallet, RefreshCw, Bookmark, ArrowUpRight, Activity
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useMembers } from '../hooks/useMembers';
import { usePayments } from '../hooks/usePayments';
import { useExpenses } from '../hooks/useExpenses';
import { useEvents } from '../hooks/useEvents';
import { MemberStatus, MemberRoleType } from '../types';

export default function AiCopilot() {
  const { language, t } = useAppContext();
  const { members } = useMembers();
  const { payments } = usePayments();
  const { expenses } = useExpenses();
  const { events, donors } = useEvents();

  const [input, setInput] = useState('');
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const responseEndRef = useRef<HTMLDivElement>(null);

  // Compile deep live database context securely for Gemini
  const statsContext = useMemo(() => {
    const totalMembers = members.length;
    const activeMembersCount = members.filter(m => m.status === MemberStatus.ACTIVE).length;
    const totalCollection = payments.reduce((acc, p) => acc + p.amount, 0);
    const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
    const currentBalance = totalCollection - totalExpenses;

    const dueMembers = members
      .filter(m => !m.roleType || m.roleType === MemberRoleType.GENERAL || m.roleType === MemberRoleType.MANAGEMENT)
      .map(m => {
        const joined = new Date(m.joinedDate);
        const today = new Date();
        const years = today.getFullYear() - joined.getFullYear();
        const months = today.getMonth() - joined.getMonth();
        const totalMonthsPassed = Math.max(0, (years * 12) + months + 1);
        
        const monthlyFee = typeof m.monthlySubscription === 'number' ? m.monthlySubscription : 500;
        const expectedCollection = totalMonthsPassed * monthlyFee;
        const dueAmount = Math.max(0, expectedCollection - (m.totalPaid || 0));
        
        return {
          memberId: m.memberId || m.id,
          name: language === 'bn' ? (m.nameBn || m.name) : m.name,
          phone: m.phone || 'N/A',
          dueAmount
        };
      })
      .filter(m => m.dueAmount > 0)
      .sort((a, b) => b.dueAmount - a.dueAmount);

    const totalDue = dueMembers.reduce((acc, m) => acc + m.dueAmount, 0);

    const recentPayments = payments.slice(0, 5).map(p => ({
      name: language === 'bn' ? (p.memberNameBn || p.memberName) : p.memberName,
      amount: p.amount,
      date: p.date
    }));

    const recentExpenses = expenses.slice(0, 5).map(e => ({
      description: e.description,
      amount: e.amount,
      category: e.category,
      date: e.date
    }));

    return {
      membersCount: totalMembers,
      activeMembersCount,
      totalCollection,
      totalExpenses,
      currentBalance,
      totalDue,
      dueMembers,
      recentPayments,
      recentExpenses
    };
  }, [members, payments, expenses, language]);

  // Handle Preset Execution
  const runPreset = async (presetId: string, promptText: string) => {
    setInput('');
    setActivePreset(presetId);
    setLoading(true);
    setResponse('');
    
    try {
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          context: statsContext
        })
      });
      const data = await res.json();
      if (data.error) {
        setResponse(`ত্রুটি ঘটেছে: ${data.error}`);
      } else {
        setResponse(data.text);
      }
    } catch (err) {
      setResponse(language === 'bn' 
        ? 'সার্ভারে সংযোগ ব্যর্থ হয়েছে। অনুগ্রহ করে আপনার GEMINI_API_KEY চেক করুন।' 
        : 'Connection to server failed. Please check your GEMINI_API_KEY installation.');
    } finally {
      setLoading(false);
    }
  };

  // Custom Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    
    const userPrompt = input;
    setInput('');
    setActivePreset('custom');
    setLoading(true);
    setResponse('');

    try {
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          context: statsContext
        })
      });
      const data = await res.json();
      if (data.error) {
        setResponse(`ত্রুটি ঘটেছে: ${data.error}`);
      } else {
        setResponse(data.text);
      }
    } catch (err) {
      setResponse(language === 'bn' 
        ? 'সার্ভারে সংযোগ ব্যর্থ হয়েছে। অনুগ্রহ করে সেটিংস চেক করুন।' 
        : 'Connection to server failed. Please check your setup.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [response, loading]);

  const presets = [
    {
      id: 'due-prediction',
      titleBn: 'বকেয়া পূর্বাভাস',
      titleEn: 'Due Prediction',
      descBn: 'কে বকেয়া পরিশোধ করতে পারে বা কার তাগিদ দেওয়া প্রয়োজন তার ডেডিকেটেড AI প্রেডিকশন।',
      descEn: 'Forecast who has high overdue risk and estimate monthly cash receipts.',
      prompt: 'কারা বকেয়া রয়েছে তাদের বকেয়া পড়ার হার, সম্ভাব্য পরিশোধের সক্ষমতা এবং মাসিক আদায়ের একটি বকেয়া পূর্বাভাস (Due Prediction) রিপোর্ট দাও। কোন সদস্যদের আগে তাগিদ দেওয়া উচিত?',
      icon: ShieldAlert,
      color: 'text-amber-400 border-amber-500/30'
    },
    {
      id: 'smart-report',
      titleBn: 'স্মার্ট ফাইনান্সিয়াল রিপোর্ট',
      titleEn: 'Smart Financial Report',
      descBn: 'আদায় এবং ব্যয়ের ওপর ভিত্তি করে সামগ্রিক আর্থিক গতিবিধি বিশ্লেষণ রিপোর্ট।',
      descEn: 'Synthesis of collections, spending flow, and financial health statement.',
      prompt: 'নাছিরেরটেক সমাজ কল্যাণ সংস্থার বর্তমান আদায় এবং খরচের ডেটা বিশ্লেষণ করে একটি সুন্দর স্মার্ট রিপোর্ট (Smart Report) তৈরি করো। সংস্থার ফাইনান্সিয়াল ব্যালেন্স বৃদ্ধি করার জন্য ৩টি পরামর্শ দাও।',
      icon: FileText,
      color: 'text-emerald-400 border-emerald-500/30'
    },
    {
      id: 'auto-notice',
      titleBn: 'স্বয়ংক্রিয় বকেয়া নোটিশ',
      titleEn: 'Auto Custom Notice',
      descBn: 'গ্রুপে বা মোবাইলে পাঠানোর উপযোগী প্রফেশনাল বকেয়া নোটিশ ও শুভেচ্ছা বার্তা তৈরি।',
      descEn: 'Generate polite notifications and templates for outstanding balances.',
      prompt: 'বকেয়া থাকা সদস্যদের জন্য একটি বিনম্র ও চমৎকার গ্রুপ নোটিশ খসড়া করো (Bengali Auto Notice)। এতে বকেয়া পরিমাণ বুঝিয়ে পরিশোধ করার ব্যবস্থা গ্রহণের জন্য অনুরোধ থাকবে। সমাজকল্যাণ সংস্থার নামের নিচে সভাপতির স্বাক্ষরও রেখো।',
      icon: Bell,
      color: 'text-sky-400 border-sky-500/30'
    },
    {
      id: 'donation-analysis',
      titleBn: 'অনুদান ও ডোনেশন বিশ্লেষণ',
      titleEn: 'Donation Analysis',
      descBn: 'শুভাকাঙ্ক্ষী ও পৃষ্ঠপোষকদের অনুদান প্রবাহ, সাহায্যকারী খাতের গতিপথ বিশ্লেষণ।',
      descEn: 'Analyze sponsor, advisor, and donor support flows.',
      prompt: 'আমাদের সমাজ কল্যাণ সংস্থার উপদেষ্টা ও ডোনারদের সহযোগিতা বিশ্লেষণের সাথে অনুদান বৃদ্ধির জন্য চমৎকার কোনো পরিকল্পনা (Donation Analysis) থাকলে তা উপস্থাপন করো।',
      icon: TrendingUp,
      color: 'text-rose-400 border-rose-500/30'
    },
    {
      id: 'expense-suggestion',
      titleBn: 'ব্যয় সাশ্রয়ী পরামর্শ',
      titleEn: 'Expense Optimization',
      descBn: 'পূর্ববর্তী ব্যয়ের ধারা পর্যবেক্ষণ করে অপচয় কমানোর প্র্যাক্টিক্যাল উপায়।',
      descEn: 'Optimize budget margins and detect luxury expenditure leaks.',
      prompt: 'আমাদের সংস্থার বর্তমান ৩টি বড় ব্যয় পোল চিহ্নিত করো এবং অপচয় রোধ বা ব্যয় সাশ্রয় করে তহবিল শক্তিশালী করার ৫টি বুদ্ধিমান কৌশল উপস্থাপন করো।',
      icon: Wallet,
      color: 'text-indigo-400 border-indigo-500/30'
    }
  ];

  // Helper function to render a formatted AI response nicely
  const parseMarkdown = (text: string) => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
      // Headers
      if (line.startsWith('### ')) {
        return <h4 key={idx} className="text-sm font-black text-amber-300 mt-4 mb-2 tracking-tight flex items-center gap-2">{line.replace('### ', '')}</h4>;
      }
      if (line.startsWith('## ')) {
        return <h3 key={idx} className="text-base font-black text-emerald-400 mt-5 border-b border-emerald-950 pb-1 mb-3 flex items-center gap-2">{line.replace('## ', '')}</h3>;
      }
      if (line.startsWith('# ')) {
        return <h2 key={idx} className="text-lg font-black text-yellow-500 mt-6 mb-4">{line.replace('# ', '')}</h2>;
      }
      
      // Horizontal Rule
      if (line === '---') {
        return <hr key={idx} className="border-emerald-900/30 my-4" />;
      }

      // Bullet Lists
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const cleanContent = line.replace(/^[\s\*\-]+/, '').trim();
        // Check for bold parts within the list
        return (
          <li key={idx} className="text-xs text-slate-200 leading-relaxed list-none pl-5 relative before:content-['⚡'] before:absolute before:left-0 before:top-0.5 before:text-[10px] before:text-amber-500/85 mb-1.5 font-medium">
            {formatBold(cleanContent)}
          </li>
        );
      }

      // Default paragraph
      return line.trim() === '' ? <div key={idx} className="h-2" /> : <p key={idx} className="text-xs text-slate-300 leading-relaxed font-semibold mb-2">{formatBold(line)}</p>;
    });
  };

  const formatBold = (str: string) => {
    const parts = str.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <strong key={i} className="text-amber-400 font-extrabold gold-dim-glow">{part}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      
      {/* Upper Brand Intro Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-emerald-950 via-slate-950 to-emerald-950 rounded-[2.5rem] border border-emerald-900/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center border border-amber-400/30 shadow-lg shadow-amber-500/10">
            <Sparkles className="text-slate-950 w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase bg-amber-500/10 text-amber-400 px-2.5 py-0.5 rounded-full border border-amber-500/20">AI CoPilot & Assistant</span>
              <span className="text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20">Active</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight mt-1">
              {language === 'bn' ? 'NSWO স্মার্ট এআই কো-পাইলট' : 'NSWO Smart AI Co-Pilot'}
            </h1>
            <p className="text-slate-400 text-xs font-semibold">আপনার সমাজকল্যাণ সংস্থার মেম্বারশিপ ও আর্থিক ডেটা দিয়ে চালিত লাইভ এআই হাব।</p>
          </div>
        </div>
        
        {/* Short metrics strip */}
        <div className="relative z-10 flex items-center gap-2 bg-black/60 px-4 py-3 rounded-2xl border border-emerald-500/10 max-w-fit">
          <Activity className="text-amber-400 w-4 h-4 shrink-0 animate-bounce" />
          <div className="leading-none">
            <span className="text-[9px] font-black uppercase text-slate-500 block">System State</span>
            <span className="text-xs font-bold text-white whitespace-nowrap">
              {members.length} Members • ৳{statsContext.totalDue.toLocaleString()} Due
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        
        {/* Presets List and Input Deck (Left side) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="premium-glass p-5 rounded-[2rem] border border-emerald-900/30 space-y-4">
            <div className="flex items-center gap-2 border-b border-emerald-950 pb-3">
              <Sparkles className="text-amber-400 w-4 h-4" />
              <h2 className="text-xs font-black uppercase text-white tracking-wider">
                {language === 'bn' ? 'স্মার্ট এআই প্যানেল অপশন' : 'Co-pilot AI Smart Features'}
              </h2>
            </div>
            
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
              {language === 'bn' 
                ? 'একটি নির্দিষ্ট এআই মডিউল সিলেক্ট করে সম্পূর্ণ সিস্টেমের লাইভ ডাটার ওপর ভিত্তি করে তাৎক্ষণিক বিশ্লেষণ রিপোর্ট ও পূর্বাভাস পেতে ক্লিক করুন:' 
                : 'Click an AI category below to compile instantaneous predictions, suggestions, and auto notice generators built on live local entries:'}
            </p>

            <div className="space-y-2.5 pt-1">
              {presets.map((preset) => {
                const Icon = preset.icon;
                const isActive = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => runPreset(preset.id, preset.prompt)}
                    disabled={loading}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-300 flex items-start gap-3.5 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActive 
                        ? 'bg-amber-500/10 border-amber-500' 
                        : 'bg-black/45 border-emerald-950/45 hover:border-amber-500/30'
                    }`}
                  >
                    <div className={`p-2 rounded-xl border ${
                      isActive ? 'bg-amber-500/20 border-amber-400' : 'bg-white/5 border-white/5 group-hover:bg-amber-500/10 group-hover:border-amber-500/30'
                    } ${preset.color} shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-black uppercase tracking-tight ${isActive ? 'text-amber-400' : 'text-slate-100'}`}>
                          {language === 'bn' ? preset.titleBn : preset.titleEn}
                        </span>
                        <ArrowUpRight className={`w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition-colors ${isActive ? 'text-amber-400 animate-bounce' : ''}`} />
                      </div>
                      <p className="text-[9px] text-slate-400 font-bold mt-1 line-clamp-1 group-hover:text-slate-300 transition-colors">
                        {language === 'bn' ? preset.descBn : preset.descEn}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt Question Input Field (Beautiful Minimalist Deck) */}
          <form onSubmit={handleSubmit} className="premium-glass p-5 rounded-[2rem] border border-emerald-900/30 space-y-3">
            <label className="text-slate-300 text-[10px] font-black uppercase tracking-widest block mb-1">
              {language === 'bn' ? 'যেকোনো কাস্টম প্রশ্ন টাইপ করুন' : 'Ask Custom Organization Question'}
            </label>
            <div className="text-[10px] text-slate-500 mb-2 leading-tight">
              {language === 'bn' 
                ? 'উদাহরণ: "কারা বকেয়া?" বা "এই মাসের পেমেন্ট বৃদ্ধি করার নোটিশ লেখো" অথবা "মোট ক্যাশ কত?"' 
                : 'e.g. "Who has dues?", "Draft an invitation message for next advisory event" or "analyze the top expenses"'}
            </div>
            
            <div className="relative flex items-center bg-black/50 border border-emerald-900/40 focus-within:border-amber-500 rounded-2xl p-1.5 transition-all">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={language === 'bn' ? 'কো-পাইলটকে জিজ্ঞাসা করুন...' : 'Ask AI smart copilot...'}
                disabled={loading}
                className="flex-1 bg-transparent px-3 text-xs text-white focus:outline-none placeholder-slate-600 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="bg-amber-500 hover:bg-amber-600 active:scale-95 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 p-2 rounded-xl transition-all cursor-pointer shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </form>
        </div>

        {/* Dynamic Response Box & Report Display Frame (Right side) */}
        <div className="lg:col-span-3">
          <div className="bg-slate-950 border border-emerald-990/40 rounded-[2.5rem] overflow-hidden min-h-[500px] flex flex-col shadow-2xl relative">
            
            {/* Header of Response Screen */}
            <div className="px-6 py-5.5 bg-gradient-to-r from-emerald-950 to-black border-b border-emerald-900/35 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  {language === 'bn' ? 'স্মার্ট এআই এনালাইজার স্ক্রিন' : 'Analytical AI Monitor Screen'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[8px] font-bold font-mono tracking-wider text-slate-600">MODEL: GEMINI-3.5-FLASH</span>
              </div>
            </div>

            {/* Main Interactive Screen Workspace */}
            <div className="flex-1 p-6 overflow-y-auto max-h-[550px] custom-scrollbar bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(6,78,59,0.15),rgba(0,0,0,0))]">
              <AnimatePresence mode="wait">
                {!response && !loading ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex flex-col items-center justify-center text-center py-20 space-y-4"
                  >
                    <div className="w-16 h-16 bg-gradient-to-br from-emerald-900/10 to-amber-500/5 rounded-full flex items-center justify-center border border-emerald-900/20 text-emerald-600 animate-pulse">
                      <Sparkles className="w-8 h-8 text-amber-500" />
                    </div>
                    <div className="max-w-md space-y-2">
                      <h4 className="text-sm font-black text-white">
                        {language === 'bn' ? 'কো-পাইলট আপনার নির্দেশের অপেক্ষায়...' : 'AI smart copilot is ready...'}
                      </h4>
                      <p className="text-xs text-slate-500 leading-normal font-semibold">
                        {language === 'bn' 
                          ? 'বামে দেওয়া যেকোনো বকেয়া পূর্বাভাস, স্মার্ট ফাইনান্সিয়াল রিপোর্ট বা নোটিশ বোতামে ক্লিক করুন অথবা কাস্টম ইনপুটে আপনার প্রশ্ন টাইপ করুন।' 
                          : 'Click any module prediction button on the left or type your custom inquiry to compile an automated strategic summary instantly.'}
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {/* Display ongoing loader */}
                    {loading && (
                      <div className="flex items-center gap-3 bg-emerald-950/15 border border-emerald-900/40 p-4.5 rounded-2xl">
                        <Loader2 className="w-5 h-5 text-amber-500 animate-spin shrink-0" />
                        <div className="leading-tight">
                          <p className="text-xs text-white font-bold animate-pulse">
                            {language === 'bn' ? 'লাইভ ডাটাবেস যাচাই করা হচ্ছে...' : 'Verifying organization database...'}
                          </p>
                          <p className="text-[9px] text-slate-500 font-semibold">
                            {language === 'bn' ? 'Gemini 3.5 ফ্ল্যাশের মাধ্যমে স্মার্ট এনালাইসিস রিপোর্ট কম্পাইল করা হচ্ছে।' : 'Synthesizing report via Gemini 3.5 Flash.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Show Response Content rendered nicely */}
                    {response && (
                      <div className="space-y-3 bg-[#020a06]/40 p-1 sm:p-2 rounded-2xl text-slate-100">
                        {parseMarkdown(response)}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={responseEndRef} />
            </div>

            {/* Footer Status Indicators */}
            <div className="px-6 py-4 bg-emerald-950/10 border-t border-emerald-900/20 text-slate-500 flex items-center justify-between text-[9px] font-bold">
              <span className="flex items-center gap-1.5">
                <RefreshCw size={10} className="animate-spin text-emerald-500" />
                {language === 'bn' ? 'লাইভ ডাটা সিঙ্কড' : 'Local Sandbox Connected'}
              </span>
              <span> নাছিরেরটেক সমাজ কল্যাণ সংস্থা ©️ 2026</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
