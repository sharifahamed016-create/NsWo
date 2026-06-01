import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, Users, UserPlus, Trash2, Key, CheckCircle2, 
  XCircle, AlertTriangle, ShieldCheck, Database, HelpCircle
} from 'lucide-react';
import { useAppContext, UserRole } from '../context/AppContext';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

interface RoleAssignment {
  email: string;
  role: UserRole;
  assignedBy?: string;
  assignedAt?: number;
}

export default function AdminRoleManagement() {
  const { language, isSuperAdmin, user, t } = useAppContext();
  const [emailInput, setEmailInput] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('VIEWER');
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Simulated high-security actions for database sandbox testing
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);

  // Subscribe to user roles live
  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoading(false);
      return;
    }

    const rolesRef = collection(db, 'user_roles');
    const unsubscribe = onSnapshot(rolesRef, (snapshot) => {
      const assignments: RoleAssignment[] = [];
      snapshot.forEach((doc) => {
        assignments.push({
          email: doc.id,
          role: doc.data().role as UserRole,
          assignedBy: doc.data().assignedBy,
          assignedAt: doc.data().assignedAt,
        });
      });
      setRoleAssignments(assignments);
      setLoading(false);
    }, (error) => {
      console.error("Failed to load roles: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!isSuperAdmin) {
      setErrorMsg(language === 'bn' ? 'শুধুমাত্র সুপার অ্যাডমিনরা রোল যোগ বা পরিবর্তন করতে পারেন।' : 'Only Super Admirators can assign or overwrite roles.');
      return;
    }

    const targetEmail = emailInput.trim().toLowerCase();
    if (!targetEmail) {
      setErrorMsg(language === 'bn' ? 'অনুগ্রহ করে একটি বৈধ ইমেল প্রদান করুন।' : 'Please enter a valid Google email.');
      return;
    }

    if (targetEmail === 'sharifahamed016@gmail.com') {
      setErrorMsg(language === 'bn' ? 'প্রধান সুপার অ্যাডমিনের রোল পরিবর্তন করা অসম্ভব।' : 'Cannot modify root Super Administrator role.');
      return;
    }

    setSaving(true);
    try {
      const docRef = doc(db, 'user_roles', targetEmail);
      await setDoc(docRef, {
        role: selectedRole,
        assignedBy: user?.email || 'sharifahamed016@gmail.com',
        assignedAt: Date.now()
      });
      
      setSuccessMsg(language === 'bn' 
        ? `${targetEmail} কে সফলভাবে ${selectedRole} হিসেবে নিযুক্ত করা হয়েছে।` 
        : `Successfully assigned ${targetEmail} as ${selectedRole}.`
      );
      setEmailInput('');
      setSelectedRole('VIEWER');
      
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (error: any) {
      setErrorMsg(language === 'bn' ? `সংরক্ষণ করতে ব্যর্থ: ${error.message || 'Error'}` : `Save failed: ${error.message || 'Unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (email: string) => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!isSuperAdmin) {
      setErrorMsg(language === 'bn' ? 'শুধুমাত্র সুপার অ্যাডমিন রোল ডিলিট করতে পারেন।' : 'Only Super Admin can remove user roles.');
      return;
    }

    if (email.toLowerCase() === 'sharifahamed016@gmail.com') {
      setErrorMsg(language === 'bn' ? 'প্রধান সুপার অ্যাডমিন ডিলিট করা নিষিদ্ধ।' : 'Root Super Admin removal forbidden.');
      return;
    }

    if (!window.confirm(language === 'bn' ? `${email} এর রোল মুছে দিতে চান?` : `Are you sure to revoke accesses for ${email}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'user_roles', email.toLowerCase()));
      setSuccessMsg(language === 'bn' ? 'রোল সফলভাবে বাতিল করা হয়েছে।' : 'Role access revoked successfully.');
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch (error: any) {
      setErrorMsg(language === 'bn' ? `ডিলিট করতে ব্যর্থ: ${error.message}` : `Revocation failed: ${error.message}`);
    }
  };

  // Run dynamic permission simulation
  const checkActionPermission = (actionName: string, requiredRole: 'super' | 'admin' | 'mod') => {
    const timestamp = new Date().toLocaleTimeString();
    
    if (requiredRole === 'super' && !isSuperAdmin) {
      setSimulationLogs(prev => [
        `[${timestamp}] ❌ Attempted "${actionName}": ACCESS DENIED (Requires Super Admin Role)`,
        ...prev.slice(0, 7)
      ]);
      return;
    }

    // Checking of Admin level (Super Admin is also Admin)
    const isCurrentUserAdmin = isSuperAdmin || roleAssignments.find(r => r.email === user?.email?.toLowerCase())?.role === 'ADMIN';
    if (requiredRole === 'admin' && !isCurrentUserAdmin && !isSuperAdmin) {
      setSimulationLogs(prev => [
        `[${timestamp}] ❌ Attempted "${actionName}": ACCESS DENIED (Requires Admin or Super Admin Role)`,
        ...prev.slice(0, 7)
      ]);
      return;
    }

    setSimulationLogs(prev => [
      `[${timestamp}] ✅ Triggered "${actionName}": Operation completed successfully!`,
      ...prev.slice(0, 7)
    ]);
  };

  // Matrix specification
  const matrixData = [
    { feature: language === 'bn' ? 'Add Member (সদস্য যোগ)' : 'Add Member', super: true, admin: true, mod: false, viewer: false },
    { feature: language === 'bn' ? 'Delete Member (সদস্য ডিলিট)' : 'Delete Member', super: true, admin: false, mod: false, viewer: false },
    { feature: language === 'bn' ? 'Add Payment (পেমেন্ট যোগ)' : 'Add Payment', super: true, admin: true, mod: true, viewer: false },
    { feature: language === 'bn' ? 'View Reports (রিপোর্ট দেখা)' : 'View Reports', super: true, admin: true, mod: true, ...{ viewer: true } },
    { feature: language === 'bn' ? 'Settings Access (সেটিংস পরিবর্তন)' : 'Settings Access', super: true, admin: false, mod: false, viewer: false },
    { feature: language === 'bn' ? 'Database Control (রোল ও ডাটাবেস পরিবর্তন)' : 'Database Control', super: true, admin: false, mod: false, viewer: false },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      
      {/* Brand Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-emerald-950 via-slate-950 to-emerald-950 rounded-[2.5rem] border border-emerald-900/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center border border-amber-400/30 shadow-lg shadow-amber-500/10">
            <Shield className="text-slate-950 w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase bg-amber-500/10 text-amber-400 px-2.5 py-0.5 rounded-full border border-amber-500/20">Security Hub</span>
              <span className="text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20">Authorized Roles</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight mt-1">
              {language === 'bn' ? 'অ্যাডমিন রোল ও পারমিশন কন্ট্রোল' : 'Admin Role & Permission Control'}
            </h1>
            <p className="text-slate-400 text-xs font-semibold">সংস্থার ৪ স্তরের নিরাপত্তা এবং মেম্বার ডেটা সুরক্ষা অ্যাক্সেস প্যানেল।</p>
          </div>
        </div>
      </div>

      {/* Role Warnings */}
      {!isSuperAdmin && (
        <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-[2rem] flex items-start gap-4 shadow-sm">
          <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
          <div>
            <h5 className="text-xs font-black text-amber-400 uppercase tracking-widest leading-none">
              {language === 'bn' ? 'সীমিত অ্যাক্সেস মোড সক্রিয়' : 'Restricted Security Mode Active'}
            </h5>
            <p className="text-slate-300 text-[11px] font-semibold leading-relaxed mt-2">
              {language === 'bn' 
                ? 'আপনার বর্তমান লগইন ইমেলে "সুপার অ্যাডমিন" রোল নেই। আপনি শুধুমাত্র পারমিশন ম্যাট্রিক্স ও অ্যাসাইন করা অন্যান্য অ্যাকাউন্ট দেখতে পারবেন।' 
                : 'Your current account does not hold the root Super Administrator privilege. You have read-only view on existing mappings.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Adding & Managing User Roles mapped in Firestore */}
        <div className="lg:col-span-7 space-y-6">
          
          <div className="premium-glass p-6 rounded-[2rem] border border-emerald-900/30 space-y-6">
            <div className="flex items-center gap-2 border-b border-emerald-950 pb-3">
              <UserPlus className="text-amber-400 w-5 h-5" />
              <h2 className="text-sm font-black uppercase text-white tracking-wider">
                {language === 'bn' ? 'নতুন অ্যাডমিন বা মডারেটর নিযুক্ত করুন' : 'Assign New Administrator Role'}
              </h2>
            </div>

            <form onSubmit={handleAddRole} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">
                    Google Account Email
                  </label>
                  <input 
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="user@gmail.com"
                    disabled={!isSuperAdmin || saving}
                    className="w-full px-4 py-3 bg-black/60 border border-emerald-900/20 rounded-xl text-xs text-white font-bold focus:border-amber-500 focus:outline-none placeholder-slate-600 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">
                    {language === 'bn' ? 'নিযুক্ত রোল' : 'Role Hierarchy Tier'}
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                    disabled={!isSuperAdmin || saving}
                    className="w-full px-4 py-3 bg-black/60 border border-emerald-900/20 rounded-xl text-xs text-slate-100 font-bold focus:border-amber-500 focus:outline-none disabled:opacity-55"
                  >
                    <option value="SUPER_ADMIN">👑 Super Admin</option>
                    <option value="ADMIN">🛠 Admin</option>
                    <option value="MODERATOR">🧑💻 Moderator</option>
                    <option value="VIEWER">👀 Viewer</option>
                  </select>
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-semibold">
                  <XCircle size={14} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 size={14} />
                  <span>{successMsg}</span>
                </div>
              )}

              {isSuperAdmin && (
                <button
                  type="submit"
                  disabled={saving || !emailInput.trim()}
                  className="w-full text-xs font-black uppercase tracking-wider text-slate-950 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 py-3.5 rounded-xl cursor-pointer transition-all active:scale-95"
                >
                  {saving ? (language === 'bn' ? 'সংরক্ষণ করা হচ্ছে...' : 'Saving Role Mapping...') : (language === 'bn' ? 'রোল নির্ধারণ করুন' : 'Apply Role Access')}
                </button>
              )}
            </form>
          </div>

          {/* Current Mapped Roles List */}
          <div className="premium-glass p-6 rounded-[2rem] border border-emerald-900/30 space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-950 pb-3">
              <div className="flex items-center gap-2">
                <Users className="text-emerald-400 w-5 h-5" />
                <h2 className="text-xs font-black uppercase text-white tracking-widest">
                  {language === 'bn' ? 'বর্তমান অ্যাক্টিভ রোলস ডিরেক্টরি' : 'Roles & Privileges Directory'}
                </h2>
              </div>
              <span className="text-[10px] font-bold bg-black/40 border border-emerald-500/10 px-2.5 py-0.5 rounded-full text-slate-300">
                {roleAssignments.length + 1} {language === 'bn' ? 'নিযুক্ত অ্যাকাউন্ট' : 'accounts'}
              </span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-500 text-xs font-bold uppercase animate-pulse">
                Loading role registry...
              </div>
            ) : (
              <div className="divide-y divide-emerald-950/40">
                
                {/* Always show Root Super Admin */}
                <div className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                      <span className="text-amber-400 text-xs font-black">👑</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-100 flex items-center gap-1.5">
                        sharifahamed016@gmail.com
                        <span className="text-[8px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-md">ROOT</span>
                      </h4>
                      <p className="text-[9px] text-slate-500 font-semibold">{language === 'bn' ? 'প্রধান সিস্টেম সুপার অ্যাডমিন' : 'Primary system core architect'}</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider bg-amber-500/5 border border-amber-500/10 px-3 py-1 rounded-full">
                    Super Admin
                  </span>
                </div>

                {roleAssignments.map((assignment, id) => {
                  let badgeColor = "text-sky-400 border-sky-400/20 bg-sky-400/5";
                  let emoji = "👀";
                  if (assignment.role === "SUPER_ADMIN") {
                    badgeColor = "text-amber-400 border-amber-400/20 bg-amber-400/5";
                    emoji = "👑";
                  } else if (assignment.role === "ADMIN") {
                    badgeColor = "text-emerald-400 border-emerald-400/20 bg-emerald-400/5";
                    emoji = "🛠";
                  } else if (assignment.role === "MODERATOR") {
                    badgeColor = "text-indigo-400 border-indigo-400/20 bg-indigo-400/5";
                    emoji = "🧑💻";
                  }

                  return (
                    <div key={id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-900 border border-emerald-900/10 flex items-center justify-center">
                          <span className="text-xs">{emoji}</span>
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-200">{assignment.email}</h4>
                          <p className="text-[8px] text-slate-500 font-semibold">
                            {language === 'bn' ? `দ্বারা নির্ধারিত: ${assignment.assignedBy || 'system'}` : `By: ${assignment.assignedBy || 'system'}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] font-black uppercase tracking-wider border px-2.5 py-1 rounded-full ${badgeColor}`}>
                          {assignment.role}
                        </span>
                        {isSuperAdmin && (
                          <button
                            onClick={() => handleDeleteRole(assignment.email)}
                            className="p-1 px-2 text-rose-500 hover:text-white hover:bg-rose-500/20 border border-transparent hover:border-rose-500/20 rounded-lg transition-all cursor-pointer"
                            title="Revoke Roles"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right Side: Security Matrix & Sandbox Testing Simulation Controls */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Permissions Matrix */}
          <div className="premium-glass p-5 rounded-[2rem] border border-emerald-900/30 space-y-4">
            <div className="flex items-center gap-2 border-b border-emerald-950 pb-3">
              <ShieldCheck className="text-amber-400 w-5 h-5" />
              <h2 className="text-xs font-black uppercase text-white tracking-widest">
                {language === 'bn' ? 'নিরাপত্তা পারমিশন কন্ট্রোল মডিউল' : 'Detailed Security Access Matrix'}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-semibold text-slate-300">
                <thead>
                  <tr className="border-b border-emerald-950 text-slate-400">
                    <th className="py-2">{language === 'bn' ? 'ফিচার' : 'Feature'}</th>
                    <th className="py-2 text-center">Super</th>
                    <th className="py-2 text-center">Admin</th>
                    <th className="py-2 text-center font-bold">Mod</th>
                    <th className="py-2 text-center">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-950/20">
                  {matrixData.map((row, id) => (
                    <tr key={id} className="hover:bg-slate-900/10">
                      <td className="py-2.5 pr-2 font-bold text-slate-100">{row.feature}</td>
                      <td className="py-2.5 text-center">{row.super ? <span className="text-emerald-400 font-extrabold text-xs">✅</span> : <span className="text-rose-500 font-bold text-xs">❌</span>}</td>
                      <td className="py-2.5 text-center">{row.admin ? <span className="text-emerald-400 font-extrabold text-xs">✅</span> : <span className="text-rose-500 font-bold text-xs">❌</span>}</td>
                      <td className="py-2.5 text-center">{row.mod ? <span className="text-emerald-400 font-extrabold text-xs">✅</span> : <span className="text-rose-500 font-bold text-xs">❌</span>}</td>
                      <td className="py-2.5 text-center">{row.viewer ? <span className="text-emerald-400 font-extrabold text-xs">✅</span> : <span className="text-rose-500 font-bold text-xs">❌</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sandbox Access Testing Deck */}
          <div className="premium-glass p-5 rounded-[2rem] border border-emerald-900/30 space-y-4">
            <div className="flex items-center gap-2 border-b border-emerald-950 pb-3">
              <Database className="text-purple-400 w-5 h-5" />
              <h2 className="text-xs font-black uppercase text-white tracking-widest">
                {language === 'bn' ? 'অ্যাক্সেস ট্রায়াল ও টেস্ট স্যান্ডবক্স' : 'Access Simulation Trial-Sandbox'}
              </h2>
            </div>
            
            <p className="text-[10px] text-slate-400 leading-normal font-semibold">
              {language === 'bn' 
                ? 'আপনার বর্তমান লগইন রোল অ্যাক্সেস পরীক্ষা করতে নিচের বোতামগুলোতে ক্লিক করুন। নিরাপত্তা মডিউল রিয়েল-টাইমে প্রতিক্রিয়া জানাবে:' 
                : 'Click any secure actions below to verify sandbox state transitions. The security core will respond dynamically:'}
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => checkActionPermission('Delete Members Entry', 'super')}
                className="px-3 py-2.5 bg-rose-950/40 border border-rose-500/20 hover:border-rose-500 text-rose-400 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-copy transition-all"
              >
                Delete Member
              </button>
              <button
                onClick={() => checkActionPermission('Database Flush / Rollback', 'super')}
                className="px-3 py-2.5 bg-amber-950/40 border border-amber-500/20 hover:border-amber-500 text-amber-400 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-copy transition-all"
              >
                Database Control
              </button>
              <button
                onClick={() => checkActionPermission('Modify Software Settings', 'super')}
                className="px-3 py-2.5 bg-[#032014] border border-emerald-500/20 hover:border-emerald-500 text-emerald-400 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-copy transition-all"
              >
                Edit App Settings
              </button>
              <button
                onClick={() => checkActionPermission('Insert New Ledger/Expense Record', 'admin')}
                className="px-3 py-2.5 bg-blue-950/40 border border-blue-500/20 hover:border-blue-500 text-blue-400 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-copy transition-all"
              >
                Add Ledger Expense
              </button>
            </div>

            {/* Simulation Trial Logs */}
            <div className="space-y-1.5 pt-3">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Simulation Trial Logs</label>
              <div className="bg-black/80 rounded-xl p-3 border border-emerald-950 h-32 overflow-y-auto no-scrollbar font-mono text-[9px] space-y-1 leading-normal">
                {simulationLogs.length === 0 ? (
                  <div className="text-slate-600 italic">No trials logs captured. Click sandbox actions above to logs.</div>
                ) : (
                  simulationLogs.map((log, idx) => (
                    <div key={idx} className={log.includes('❌') ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
