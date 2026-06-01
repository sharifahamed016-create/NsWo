/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { LogIn, ShieldCheck, Users, PieChart, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { getImageUrl } from '../lib/utils';

export default function Login() {
  const { login, loginWithEmail, resetPassword, t, language, setLanguage, settings } = useAppContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'ADMIN' | 'MODERATOR' | 'VIEWER'>('ADMIN');
  const [isInIframe] = useState(() => {
    try {
      return window.self !== window.top;
    } catch {
      return false;
    }
  });

  const appName = language === 'bn' ? settings.nameBn : settings.name;

  const getPortalName = () => {
    if (selectedRole === 'ADMIN') return t.adminPortal;
    if (selectedRole === 'MODERATOR') return t.moderatorPortal;
    return t.viewerPortal;
  };

  const getLoginLabel = () => {
    if (selectedRole === 'ADMIN') return t.adminLogin;
    if (selectedRole === 'MODERATOR') return t.moderatorLogin;
    return t.viewerLogin;
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (loginMethod === 'email') {
        await loginWithEmail(email, password);
      } else {
        // Firebase Phone Auth would go here
        setError('Phone authentication is currently in demo mode. Please use Email login.');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await resetPassword(email);
      alert('Password reset link sent to your email!');
      setShowForgotPassword(false);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      await login();
    } catch (err: any) {
      console.error("Google login failed", err);
      if (err?.code === 'auth/cancelled-popup-request' || err?.code === 'auth/popup-blocked') {
        setError(
          language === 'bn' 
            ? 'পপআপ লক হয়ে গিয়েছে। আইফ্রেম সিকিউরিটি পলিসির কারণে এটি হতে পারে। দয়া করে নিচের "নতুন ট্যাবে অ্যাপ খুলুন" বাটন বা লিংক ব্যবহার করুন।' 
            : 'Authentication popup blocked inside the sandbox iframe. To resolve instantly, please open the application in a new browser tab using the button below.'
        );
      } else {
        setError(err.message || 'Google authentication failed. Please retry.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden transition-colors duration-700"
      style={{ backgroundColor: `${settings.themeColor}dd` }}
    >
      {/* Background patterns */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl -mr-64 -mt-64" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-black/10 rounded-full blur-3xl -ml-64 -mb-64" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-8 lg:p-12 z-10"
      >
        <div className="flex flex-col items-center text-center mb-8">
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 overflow-hidden shadow-inner"
          >
            {getImageUrl(settings.logoURL) ? (
              <img src={getImageUrl(settings.logoURL)} alt="Logo" className="w-full h-full object-cover p-2" referrerPolicy="no-referrer" />
            ) : (
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg"
                style={{ backgroundColor: settings.themeColor }}
              >
                {appName.charAt(0)}
              </div>
            )}
          </motion.div>
          
          <h1 className="text-2xl lg:text-3xl font-black text-slate-900 mb-2 leading-tight">
            {appName}
          </h1>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] bg-slate-100 px-3 py-1 rounded-lg">
            {getPortalName()}
          </p>
        </div>

        <div className="flex p-1 bg-slate-50 rounded-2xl mb-6">
           {(['ADMIN', 'MODERATOR', 'VIEWER'] as const).map((role) => (
             <button
               key={role}
               onClick={() => setSelectedRole(role)}
               className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                 selectedRole === role 
                   ? 'bg-white shadow-sm' 
                   : 'text-slate-400 hover:text-slate-600'
               }`}
               style={selectedRole === role ? { color: settings.themeColor } : {}}
             >
               {role}
             </button>
           ))}
        </div>

        <div className="flex justify-center gap-4 mb-6">
          <button 
            type="button"
            onClick={() => setLoginMethod('email')}
            className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all ${
              loginMethod === 'email' ? 'bg-slate-100 text-slate-900' : 'text-slate-400'
            }`}
          >
            {t.useEmail}
          </button>
          <button 
            type="button"
            onClick={() => setLoginMethod('phone')}
            className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all ${
              loginMethod === 'phone' ? 'bg-slate-100 text-slate-900' : 'text-slate-400'
            }`}
          >
            {t.usePhone}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-rose-500 mt-0.5 shrink-0" />
              <p className="text-xs font-bold text-rose-600 leading-relaxed">{error}</p>
            </div>
            {isInIframe && (
              <a 
                href={window.location.href} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full text-center py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-colors inline-block"
              >
                {language === 'bn' ? 'নতুন ট্যাবে অ্যাপ খুলুন 🚀' : 'Open in New Tab 🚀'}
              </a>
            )}
          </div>
        )}

        {isInIframe && !error && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex flex-col gap-2">
            <p className="text-[11px] font-bold text-emerald-800 leading-relaxed">
              {language === 'bn' 
                ? '💡 ব্রাউজার সিকিউরিটি ফ্রেমের জন্য লগইন সমস্যা হলে নিচের লিংকে ক্লিক করে নতুন ট্যাবে অ্যাপটি ওপেন করুন।' 
                : '💡 To ensure popups and permissions synchronize seamlessly, open the app in a full tab.'}
            </p>
            <a 
              href={window.location.href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-center py-2 px-4 bg-emerald-650 hover:bg-emerald-555 text-white font-black rounded-xl text-[10px] uppercase tracking-wider transition-all inline-block"
            >
              {language === 'bn' ? 'নতুন ট্যাবে ওপেন করুন ↗' : 'Open in New Tab ↗'}
            </a>
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
          {loginMethod === 'email' ? (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.email}</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-4 py-4 text-sm transition-all outline-none text-slate-700 font-bold focus:ring-4 focus:ring-slate-100"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.phoneNumber}</label>
              <div className="relative">
                <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="tel" 
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+8801xxxxxxxxx"
                  className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-4 py-4 text-sm transition-all outline-none text-slate-700 font-bold focus:ring-4 focus:ring-slate-100"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.password}</label>
              <button 
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-[10px] font-black uppercase tracking-widest"
                style={{ color: settings.themeColor }}
              >
                {t.forgotPassword}
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-4 py-4 text-sm transition-all outline-none text-slate-700 font-bold focus:ring-4 focus:ring-slate-100"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 px-1 py-1">
            <button
              type="button"
              onClick={() => setRememberMe(!rememberMe)}
              className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                rememberMe ? 'bg-slate-900 border-transparent' : 'bg-slate-50 border-2 border-slate-100'
              }`}
              style={rememberMe ? { backgroundColor: settings.themeColor } : {}}
            >
              {rememberMe && <ShieldCheck size={12} className="text-white" />}
            </button>
            <span 
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer"
              onClick={() => setRememberMe(!rememberMe)}
            >
              {t.rememberMe}
            </span>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full text-white font-black py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-70 disabled:active:scale-100 mt-2 uppercase tracking-[0.2em] text-xs shadow-xl"
            style={{ backgroundColor: settings.themeColor, boxShadow: `0 20px 25px -5px ${settings.themeColor}33` }}
          >
            {isLoading ? 'Processing...' : getLoginLabel()}
          </button>
        </form>

        <div className="relative flex items-center gap-4 mb-6">
          <div className="h-px flex-1 bg-slate-100" />
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{t.or}</span>
          <div className="h-px flex-1 bg-slate-100" />
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-100 hover:bg-slate-50 text-slate-600 font-bold py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-70 group mb-8"
        >
          <img src="https://www.gstatic.com/firebaseui/webjs/1.3.0/images/google.svg" alt="Google" className="w-5 h-5" />
          <span className="text-sm">{t.loginWithGoogle}</span>
        </button>

        {showForgotPassword && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForgotPassword(false)} />
            <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-8">
              <h3 className="text-lg font-black text-slate-900 mb-2">{t.forgotPassword}</h3>
              <p className="text-slate-500 text-xs font-medium mb-6">Enter your email and we'll send you a link to reset your password.</p>
              <div className="space-y-4">
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-sm outline-none font-bold"
                />
                <button 
                  onClick={handleForgotPassword}
                  className="w-full text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest"
                  style={{ backgroundColor: settings.themeColor }}
                >
                  Send Reset Link
                </button>
                <button 
                  onClick={() => setShowForgotPassword(false)}
                  className="w-full text-slate-400 font-bold text-xs uppercase tracking-widest mt-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <div className="flex items-center gap-6 opacity-30">
           <ShieldCheck size={16} className="text-white" />
           <PieChart size={16} className="text-white" />
           <Users size={16} className="text-white" />
        </div>
        <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em]">
          Secure Infrastructure System
        </p>
      </div>
    </div>
  );
}
