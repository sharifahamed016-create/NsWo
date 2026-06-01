import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, Send, Mail, CheckCircle2, AlertTriangle, Search, Filter, 
  Settings2, RefreshCw, Smartphone, Check, X, CheckSquare, 
  Square, Calendar, ChevronRight, Play, CheckCircle, Edit, Trash2, Sliders, Info,
  Eye, EyeOff, Cpu, Terminal
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useMembers } from '../hooks/useMembers';
import { Member, MemberRoleType, MemberStatus } from '../types';
import { logActivity } from '../lib/activity';
import { addDoc, collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { uploadFile } from '../lib/storage';
import { getImageUrl } from '../lib/utils';
import { Award, UploadCloud } from 'lucide-react';

interface ReminderLog {
  id: string;
  memberId: string;
  memberName: string;
  amount: number;
  type: 'WhatsApp' | 'SMS' | 'Push';
  status: 'Sent' | 'Failed';
  message: string;
  date: string;
  timestamp: number;
}

export default function DueRemindersList() {
  const { language, settings, updateSettings, isAdmin, user } = useAppContext();

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

  const { members, updateMember, loading: membersLoading } = useMembers();
  
  const [activeSubTab, setActiveSubTab] = useState<'monitor' | 'rules' | 'logs' | 'autopilot'>('monitor');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  
  // AppSettings bindings for template controls
  const [remindersEnabled, setRemindersEnabled] = useState(settings?.remindersEnabled ?? true);
  const [reminderDays, setReminderDays] = useState<number[]>(settings?.reminderDays ?? [10, 20, 30]);
  const [whatsappTemplateBn, setWhatsappTemplateBn] = useState(
    settings?.whatsappTemplateBn ?? 
    'আসসালামু আলাইকুম 🌿\n\nআপনার এই মাসের চাঁদা এখনো বাকি রয়েছে।\n\nপরিমাণ: ৳{amount}\nমাস: {month}\n\nদয়া করে দ্রুত পরিশোধ করুন।\n\nধন্যবাদ ❤️\nনাছিরেরটেক সমাজ কল্যাণ সংস্থা'
  );
  const [whatsappTemplateEn, setWhatsappTemplateEn] = useState(
    settings?.whatsappTemplateEn ?? 
    'Assalamu Alaikum 🌿\n\nYour monthly subscription for {month} is still due.\n\nAmount: ৳{amount}\n\nPlease complete the payment as soon as possible.\n\nThank you ❤️\nNashirertek Social Welfare Association'
  );
  const [smsTemplateBn, setSmsTemplateBn] = useState(
    settings?.smsTemplateBn ?? 'আপনার মাসিক চাঁদা বকেয়া আছে। দয়া করে পরিশোধ করুন। পরিমাণ: ৳{amount}। - নাছিরেরটেক সমাজ কল্যাণ সংস্থা'
  );
  const [smsTemplateEn, setSmsTemplateEn] = useState(
    settings?.smsTemplateEn ?? 'Your monthly subscription of ৳{amount} is due. Please pay soon. - Nashirertek Social Welfare Association'
  );
  const [automaticStopOnPayment, setAutomaticStopOnPayment] = useState(settings?.automaticStopOnPayment ?? true);
  const [officialSealURL, setOfficialSealURL] = useState(settings?.officialSealURL ?? '');
  const [isUploadingSeal, setIsUploadingSeal] = useState(false);
  
  // Robotic Automatic SMS integrations
  const [smsGatewayType, setSmsGatewayType] = useState(settings?.smsGatewayType ?? 'greenweb');
  const [smsApiKey, setSmsApiKey] = useState(settings?.smsApiKey ?? '');
  const [smsSenderId, setSmsSenderId] = useState(settings?.smsSenderId ?? '');
  const [smsGatewayUrl, setSmsGatewayUrl] = useState(settings?.smsGatewayUrl ?? 'https://api.greenweb.com.bd/api.php');

  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isAutopilotRunning, setIsAutopilotRunning] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  // Simulation and dynamic stats states
  const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [simulatingStep, setSimulatingStep] = useState<string | null>(null);

  // Synchronize on Settings loading
  useEffect(() => {
    if (settings) {
      setRemindersEnabled(settings.remindersEnabled ?? true);
      setReminderDays(settings.reminderDays ?? [10, 20, 30]);
      setWhatsappTemplateBn(
        settings.whatsappTemplateBn || 
        'আসসালামু আলাইকুম 🌿\n\nআপনার এই মাসের চাঁদা এখনো বাকি রয়েছে।\n\nপরিমাণ: ৳{amount}\nমাস: {month}\n\nদয়া করে দ্রুত পরিশোধ করুন।\n\nধন্যবাদ ❤️\nনাছিরেরটেক সমাজ কল্যাণ সংস্থা'
      );
      setWhatsappTemplateEn(
        settings.whatsappTemplateEn || 
        'Assalamu Alaikum 🌿\n\nYour monthly subscription for {month} is still due.\n\nAmount: ৳{amount}\n\nPlease complete the payment as soon as possible.\n\nThank you ❤️\nNashirertek Social Welfare Association'
      );
      setSmsTemplateBn(
        settings.smsTemplateBn || 
        'আপনার মাসিক চাঁদা বকেয়া আছে। দয়া করে পরিশোধ করুন। পরিমাণ: ৳{amount}। - নাছিরেরটেক সমাজ কল্যাণ সংস্থা'
      );
      setSmsTemplateEn(
        settings.smsTemplateEn || 
        'Your monthly subscription of ৳{amount} is due. Please pay soon. - Nashirertek Social Welfare Association'
      );
      setAutomaticStopOnPayment(settings.automaticStopOnPayment ?? true);
      setOfficialSealURL(settings.officialSealURL ?? '');
      setSmsGatewayType(settings.smsGatewayType ?? 'greenweb');
      setSmsApiKey(settings.smsApiKey ?? '');
      setSmsSenderId(settings.smsSenderId ?? '');
      setSmsGatewayUrl(settings.smsGatewayUrl ?? 'https://api.greenweb.com.bd/api.php');
    }
  }, [settings]);

  // Load trigger logs from Firestore
  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      const cached = localStorage.getItem('nswo_reminder_logs');
      if (cached) {
        setReminderLogs(JSON.parse(cached));
      }
      setLogsLoading(false);
      return;
    }

    const q = query(collection(db, 'reminder_logs'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ReminderLog[];
      setReminderLogs(data);
      localStorage.setItem('nswo_reminder_logs', JSON.stringify(data));
      setLogsLoading(false);
    }, (err) => {
      console.warn("Logs load failed, generating fallback cache", err);
      // Fallback cache
      const cached = localStorage.getItem('nswo_reminder_logs');
      if (cached) {
        setReminderLogs(JSON.parse(cached));
      }
      setLogsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const saveSettings = async () => {
    setIsSavingSettings(true);
    try {
      await updateSettings({
        remindersEnabled,
        reminderDays,
        whatsappTemplateBn,
        whatsappTemplateEn,
        smsTemplateBn,
        smsTemplateEn,
        automaticStopOnPayment,
        officialSealURL,
        smsGatewayType,
        smsApiKey,
        smsSenderId,
        smsGatewayUrl
      });
      setSuccessMsg(language === 'bn' ? 'রিমাইন্ডার কনফিগারেশন সফলভাবে সংরক্ষিত হয়েছে!' : 'Reminder Configuration Saved Successfully!');
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      alert('Error updating configuration parameters: ' + err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSealUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingSeal(true);
    try {
      const path = `branding/seal_${Date.now()}_${file.name}`;
      const url = await uploadFile(file, path);
      setOfficialSealURL(url);
      
      await updateSettings({
        officialSealURL: url
      });
      
      setSuccessMsg(language === 'bn' ? 'অফিসিয়াল সিল/লোগো সফলভাবে আপলোড করা হয়েছে!' : 'Official seal/logo successfully uploaded!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (error: any) {
      console.error("Seal upload failed:", error);
      alert(language === 'bn' ? "সিল আপলোড করতে ব্যর্থ হয়েছে" : "Seal upload failed: " + (error.message || "Unknown error"));
    } finally {
      setIsUploadingSeal(false);
    }
  };

  const clearOfficialSeal = async () => {
    setOfficialSealURL('');
    await updateSettings({
      officialSealURL: ''
    });
    setSuccessMsg(language === 'bn' ? 'অফিসিয়াল সিল মুছে ফেলা হয়েছে।' : 'Official seal/logo removed.');
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  // Helper calculation matching MemberProfile.tsx
  const getMemberFinancials = (member: Member) => {
    const joined = new Date(member.joinedDate);
    const today = new Date();
    
    const years = today.getFullYear() - joined.getFullYear();
    const months = today.getMonth() - joined.getMonth();
    const totalMonths = Math.max(1, (years * 12) + months + 1);
    
    const monthlyFee = typeof member.monthlySubscription === 'number' ? member.monthlySubscription : 500;
    const expectedCollection = totalMonths * monthlyFee;
    const paidMonths = monthlyFee > 0 ? Math.floor((member.totalPaid || 0) / monthlyFee) : totalMonths;
    const dueAmount = Math.max(0, expectedCollection - (member.totalPaid || 0));
    const dueMonths = monthlyFee > 0 ? Math.max(0, totalMonths - paidMonths) : 0;

    return {
      dueAmount,
      dueMonths,
      monthlyFee,
      expectedCollection,
      totalMonths
    };
  };

  const getMonthName = () => {
    const monthNamesEn = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthNamesBn = [
      'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
      'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
    ];
    const date = new Date();
    const name = language === 'bn' ? monthNamesBn[date.getMonth()] : monthNamesEn[date.getMonth()];
    return `${name} ${date.getFullYear()}`;
  };

  const currentMonthLabel = getMonthName();

  // Filter due list
  const dueMembersList = members
    .filter(member => member.status === MemberStatus.ACTIVE && member.includeInMonthlyLedger !== false)
    .map(member => {
      const financials = getMemberFinancials(member);
      return {
        member,
        ...financials
      };
    })
    .filter(item => item.dueAmount > 0 && item.monthlyFee > 0)
    .filter(item => {
      const matchesSearch = item.member.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (item.member.nameBn && item.member.nameBn.includes(searchQuery)) ||
                            item.member.memberId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.member.phone.includes(searchQuery);
                            
      const matchesRole = roleFilter === 'all' || item.member.roleType === roleFilter;
      return matchesSearch && matchesRole;
    });

  const totals = dueMembersList.reduce((acc, curr) => ({
    totalDue: acc.totalDue + curr.dueAmount,
    count: acc.count + 1
  }), { totalDue: 0, count: 0 });

  // Toggle individual selection
  const handleSelectMember = (id: string) => {
    if (selectedMembers.includes(id)) {
      setSelectedMembers(selectedMembers.filter(mId => mId !== id));
    } else {
      setSelectedMembers([...selectedMembers, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedMembers.length === dueMembersList.length) {
      setSelectedMembers([]);
    } else {
      setSelectedMembers(dueMembersList.map(item => item.member.id));
    }
  };

  // Compile individual templates
  const compileMessage = (template: string, member: Member, amount: number) => {
    let result = template;

    // 1. Auto-detect if "পরিমাণ: ৳" is followed by nothing or a newline / whitespace, and insert placeholder
    result = result.replace(/পরিমাণ:\s*৳\s*$/gm, 'পরিমাণ: ৳{amount}');
    result = result.replace(/পরিমাণ:\s*৳\s*\n/gm, 'পরিমাণ: ৳{amount}\n');
    result = result.replace(/পরিমাণ:\s*৳\s*(?!\d|{amount}|\[amount\]|{বকেয়া}|\[বকেয়া\]|{টাকা}|\[টাকা\]|{বকেয়া টাকা}|\[বকেয়া টাকা\])/g, 'পরিমাণ: ৳{amount}');

    // Same for "Amount:" and "Amount: ৳" or "Amount: $"
    result = result.replace(/Amount:\s*৳\s*$/gm, 'Amount: ৳{amount}');
    result = result.replace(/Amount:\s*৳\s*\n/gm, 'Amount: ৳{amount}\n');
    result = result.replace(/Amount:\s*\$\s*$/gm, 'Amount: ${amount}');
    result = result.replace(/Amount:\s*\$\s*\n/gm, 'Amount: ${amount}\n');

    // 2. Auto-detect if "মাস:" is followed by nothing or a newline / whitespace, and insert placeholder
    result = result.replace(/মাস:\s*$/gm, 'মাস: {month}');
    result = result.replace(/মাস:\s*\n/gm, 'মাস: {month}\n');
    result = result.replace(/মাস:\s*(?!\S|{month}|\[month\]|{মাস}|\[মাস\])/g, 'মাস: {month}');

    // Same for "Month:"
    result = result.replace(/Month:\s*$/gm, 'Month: {month}');
    result = result.replace(/Month:\s*\n/gm, 'Month: {month}\n');

    // 3. Robust replacements for all amount formats (curly and square brackets, English and Bangla)
    const amountPlaceholders = [
      /{amount}/gi, /\[amount\]/gi,
      /{Amount}/gi, /\[Amount\]/gi,
      /{বকেয়া টাকা}/g, /\[বকেয়া টাকা\]/g,
      /{বকেয়া}/g, /\[বকেয়া\]/g,
      /{পরিমাণ}/g, /\[পরিমাণ\]/g,
      /{টাকা}/g, /\[টাকা\]/g
    ];
    amountPlaceholders.forEach(regex => {
      result = result.replace(regex, String(amount));
    });

    // 4. Robust replacements for all month formats
    const monthName = currentMonthLabel;
    const monthPlaceholders = [
      /{month}/gi, /\[month\]/gi,
      /{Month}/gi, /\[Month\]/gi,
      /{মাস}/g, /\[মাস\]/g,
      /{মাসের নাম}/g, /\[মাসের নাম\]/g
    ];
    monthPlaceholders.forEach(regex => {
      result = result.replace(regex, monthName);
    });

    // 5. Robust replacements for all name formats
    const mName = language === 'bn' ? (member.nameBn || member.name) : member.name;
    const namePlaceholders = [
      /{name}/gi, /\[name\]/gi,
      /{Name}/gi, /\[Name\]/gi,
      /{নাম}/g, /\[নাম\]/g,
      /{সদস্য নাম}/g, /\[সদস্য নাম\]/g
    ];
    namePlaceholders.forEach(regex => {
      result = result.replace(regex, mName);
    });

    // 6. Robust replacements for all ID formats
    const idPlaceholders = [
      /{id}/gi, /\[id\]/gi,
      /{Id}/gi, /\[Id\]/gi,
      /{আইডি}/g, /\[আইডি\]/g,
      /{সদস্য আইডি}/g, /\[সদস্য আইডি\]/g
    ];
    idPlaceholders.forEach(regex => {
      result = result.replace(regex, member.memberId);
    });

    return result;
  };

  // Dispatch mock or record real triggers
  const recordReminderLog = async (member: Member, amount: number, type: 'WhatsApp' | 'SMS' | 'Push', message: string, status: 'Sent' | 'Failed' = 'Sent') => {
    const newLog = {
      memberId: member.memberId,
      memberName: language === 'bn' ? (member.nameBn || member.name) : member.name,
      amount,
      type,
      status,
      message,
      date: new Date().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }),
      timestamp: Date.now()
    };

    // Update state to render immediately
    setReminderLogs(prev => [newLog as any, ...prev]);
    try {
      const updatedLogs = [newLog, ...reminderLogs].slice(0, 50);
      localStorage.setItem('nswo_reminder_logs', JSON.stringify(updatedLogs));
    } catch {}

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return;
    }

    try {
      await addDoc(collection(db, 'reminder_logs'), newLog);
    } catch (err) {
      console.warn("Failed to write reminder log to firestore:", err);
    }
  };

  // Deep linking for templates
  const triggerWhatsApp = async (member: Member, amount: number) => {
    const template = language === 'bn' ? whatsappTemplateBn : whatsappTemplateEn;
    const finalMessage = compileMessage(template, member, amount);
    
    // Clean phone number (replace leading zero with country code +880)
    let cleanPhone = member.phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '880' + cleanPhone.substring(1);
    }
    
    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(finalMessage)}`;
    window.open(waUrl, '_blank');
    
    await recordReminderLog(member, amount, 'WhatsApp', finalMessage, 'Sent');
    await logActivity(
      'notification_reminder',
      `Manual WhatsApp due reminder launched for ${member.memberId} (${member.name}).`,
      `সদস্য ${member.memberId} (${member.name}) এর জন্য হোয়াটসঅ্যাপ বকেয়া রিমাইন্ডার পাঠানো হয়েছে।`
    ).catch(() => {});
  };

  const triggerSMS = async (member: Member, amount: number) => {
    const template = language === 'bn' ? smsTemplateBn : smsTemplateEn;
    const finalMessage = compileMessage(template, member, amount);
    
    let cleanPhone = member.phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '+880' + cleanPhone.substring(1);
    }

    // Launch direct cell system SMS
    const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(finalMessage)}`;
    window.open(smsUrl, '_blank');

    await recordReminderLog(member, amount, 'SMS', finalMessage, 'Sent');
    await logActivity(
      'notification_reminder',
      `Manual cellular SMS template launched for ${member.memberId} (${member.name}).`,
      `সদস্য ${member.memberId} (${member.name}) এর মোবাইলে রিমাইন্ডার এসএমএস পাঠানো হয়েছে।`
    ).catch(() => {});
  };

  const triggerPush = async (member: Member, amount: number) => {
    const title = language === 'bn' ? 'বকেয়া চাঁদা রিমাইন্ডার 🔔' : 'Subscription Dues Pending 🔔';
    const body = language === 'bn' 
      ? `আপনার মোট ৳${amount} বকেয়া চাঁদা জমা রয়েছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন।`
      : `Your current overdue membership subscription total is ৳${amount}. Please complete payment soon.`;
    
    // Create new firestore in-app notification doc for this member
    const newNotification = {
      title,
      body,
      memberId: member.id,
      timestamp: Date.now(),
      isRead: false,
      sender: user?.email || 'System'
    };

    if (typeof window !== 'undefined' && !(window as any).__firestore_quota_exceeded) {
      try {
        await addDoc(collection(db, 'notifications'), newNotification);
      } catch (err) {
        console.warn('Post notification to Firestore failed, storing offline', err);
      }
    }

    // Store in general notifications inside local storage for backup
    try {
      const cached = localStorage.getItem(`nswo_notifications_${member.id}`) || '[]';
      const parsed = JSON.parse(cached);
      parsed.unshift(newNotification);
      localStorage.setItem(`nswo_notifications_${member.id}`, JSON.stringify(parsed));
    } catch {}

    await recordReminderLog(member, amount, 'Push', body, 'Sent');
    await logActivity(
      'notification_push',
      `App push notification dispatched to member ${member.memberId}.`,
      `সদস্য ${member.memberId} এর অ্যাপে ইন-অ্যাপ পুশ নোটিফিকেশন পাঠানো হয়েছে।`
    ).catch(() => {});

    alert(language === 'bn' ? 'সদস্যের ডিজিটাল অ্যাকাউন্টে সফলভাবে পুশ রিমাইন্ডার পাঠানো হয়েছে!' : 'App Push Notification successfully dispatched to the member portal!');
  };

  // Bulk actions
  const triggerBulkPush = async () => {
    if (selectedMembers.length === 0) {
      alert(language === 'bn' ? 'অনুগ্রহ করে অন্তত একজন সক্রিয় সদস্য নির্বাচন করুন!' : 'Please select at least one active member!');
      return;
    }

    setSimulatingStep('push');
    let successCount = 0;
    
    for (const mId of selectedMembers) {
      const item = dueMembersList.find(i => i.member.id === mId);
      if (item && item.member.remindersActive !== false) {
        const title = language === 'bn' ? 'বকেয়া চাঁদা রিমাইন্ডার 🔔' : 'Subscription Dues Pending 🔔';
        const body = language === 'bn' 
          ? `আপনার মোট ৳${item.dueAmount} বকেয়া চাঁদা জমা রয়েছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন।`
          : `Your current overdue membership subscription total is ৳${item.dueAmount}. Please complete payment soon.`;
        
        const newNotification = {
          title,
          body,
          memberId: item.member.id,
          timestamp: Date.now(),
          isRead: false,
          sender: user?.email || 'Scheduler Daemon'
        };

        if (typeof window !== 'undefined' && !(window as any).__firestore_quota_exceeded) {
          try {
            await addDoc(collection(db, 'notifications'), newNotification);
          } catch {}
        }
        await recordReminderLog(item.member, item.dueAmount, 'Push', body, 'Sent');
        successCount++;
      }
    }

    await logActivity(
      'notification_bulk',
      `Dispatched bulk app push notifications to ${successCount} members.`,
      `একসাথে ${successCount} জন সদস্যকে বাল্ক পুশ নোটিফিকেশন পাঠানো হয়েছে।`
    ).catch(() => {});

    setSimulatingStep(null);
    setSelectedMembers([]);
    alert(language === 'bn' 
      ? `সফলভাবে ${successCount} জন সদস্যকে ইন-অ্যাপ পুশ নোটিফিকেশন পাঠানো হয়েছে!` 
      : `Successfully delivered ${successCount} app notifications into active member screens!`
    );
  };

  const runSchedulerSimulation = async () => {
    if (!remindersEnabled) {
      alert(language === 'bn' ? 'সিস্টেম নিষ্ক্রিয় আছে! অনুগ্রহ করে কনফিগারেশন থেকে অন করুন।' : 'Reminder system is currently disabled! Please toggle ON first.');
      return;
    }

    setSimulatingStep('scheduled');
    
    // Simulate automated scanning
    const scanTotal = dueMembersList.filter(i => i.member.remindersActive !== false);
    
    for (const item of scanTotal) {
      // Create push logs as representative of the Scheduler Daemon
      const body = language === 'bn' 
        ? `[অটো-রিমাইন্ডার শিডিউলার] আপনার মোট বকেয়া চাঁদা পরিমাণ ৳${item.dueAmount}।`
        : `[Auto-Reminder Daemon] Your overdue subscription balances calculated totals of ৳${item.dueAmount}.`;

      const newNotification = {
        title: language === 'bn' ? 'স্বয়ংক্রিয় বকেয়া রিমাইন্ডার 🤖' : 'Automated Overdue Check 🤖',
        body,
        memberId: item.member.id,
        timestamp: Date.now(),
        isRead: false,
        sender: 'Scheduled Daemon Run'
      };

      if (typeof window !== 'undefined' && !(window as any).__firestore_quota_exceeded) {
        try {
          await addDoc(collection(db, 'notifications'), newNotification);
        } catch {}
      }
      
      await recordReminderLog(item.member, item.dueAmount, 'Push', body, 'Sent');
    }

    await logActivity(
      'reminder_automation',
      `Scheduler system auto-run executed on ${reminderDays.join(', ')} of this month. Handled ${scanTotal.length} due alerts.`,
      `স্বয়ংক্রিয় রিমাইন্ডার শিডিউলার এই মাসের ${reminderDays.join(', ')} তারিখের সিঙ্ক রান সম্পন্ন করেছে। মোট ${scanTotal.length} টি বকেয়া ফিল্টার করা হয়েছে।`
    ).catch(() => {});

    setSimulatingStep(null);
    alert(language === 'bn' 
      ? `স্বয়ংক্রিয় সিডিউল সম্পন্ন হয়েছে! ${scanTotal.length} জন সদস্যের জন্য সতর্কতা পাঠানো হয়েছে এবং শিডিউল ট্র্যাকিং ড্যাশবোর্ডে লগ করা হয়েছে।` 
      : `Automated scheduler run mock successfully concluded! Dispatched ${scanTotal.length} alert logs.`
    );
  };

  const toggleMemberReminders = async (member: Member) => {
    const currentState = member.remindersActive !== false;
    try {
      await updateMember(member.id, { remindersActive: !currentState });
      setSuccessMsg(language === 'bn' ? `${member.name} এর রিমাইন্ডার স্ট্যাটাস পরিবর্তিত হয়েছে!` : `Reminder preference updated for ${member.name}!`);
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch (err) {
      alert("Error changing subscriber preference: " + err);
    }
  };

  // Automated Robotic SMS & API Dispatcher Daemon
  const startRoboticDispatch = async () => {
    if (isAutopilotRunning) return;
    setIsAutopilotRunning(true);
    setConsoleLogs([]);

    const timeString = () => new Date().toLocaleTimeString(language === 'bn' ? 'bn-BD' : 'en-US');
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const scanList = dueMembersList.filter(item => item.member.remindersActive !== false);
    const totalCount = scanList.length;

    const addLog = (text: string) => {
      setConsoleLogs(prev => [...prev, `[${timeString()}] ${text}`]);
    };

    addLog(language === 'bn' ? '🤖 এনএসডব্লিউও রোবট এসএমএস ডেমোন সক্রিয় হচ্ছে...' : '🤖 NSWO Robotic SMS Daemon waking up...');
    await sleep(800);
    
    addLog(language === 'bn' ? '🔍 সদস্য ডেটাবেজে বকেয়ার পরিমাণ বিশ্লেষণ করা হচ্ছে...' : '🔍 Scanning member database registries for overdue subscription details...');
    await sleep(900);

    if (totalCount === 0) {
      addLog(language === 'bn' ? '🎉 চমৎকার! ডাটাবেজে এই মুহূর্তে বকেয়া চাদার কোনো সদস্য পাওয়া যায়নি।' : '🎉 Excellent! No members with dues found at this moment.');
      addLog(language === 'bn' ? '🤖 রোবটিক সিস্টেম নিষ্ক্রিয় মোডে ফিরে যাচ্ছে।' : '🤖 Robotic daemon entering idle mode.');
      setIsAutopilotRunning(false);
      return;
    }

    addLog(language === 'bn' ? `📋 বকেয়া সদস্য পাওয়া গেছে: ${totalCount} জন।` : `📋 Found ${totalCount} members with outstanding dues.`);
    await sleep(600);

    addLog(language === 'bn' ? `🛰️ সিলেক্টেড গেটওয়ে: ${smsGatewayType.toUpperCase()} কারেন্ট এপিআই দিয়ে বার্তা প্রেরণ শুরু হচ্ছে...` : `🛰️ Selected Gateway: ${smsGatewayType.toUpperCase()} API initiating dispatch loops...`);
    await sleep(800);

    let successCounter = 0;
    let failedCounter = 0;

    for (let i = 0; i < totalCount; i++) {
      const item = scanList[i];
      const name = language === 'bn' ? (item.member.nameBn || item.member.name) : item.member.name;
      
      addLog(language === 'bn' ? `⚡ (${i + 1}/${totalCount}) সদস্য [ID: ${item.member.memberId}] ${name} এর চাঁদা চেক করা হচ্ছে...` : `⚡ (${i + 1}/${totalCount}) processing member [ID: ${item.member.memberId}] ${name}...`);
      await sleep(1000);

      const template = language === 'bn' ? smsTemplateBn : smsTemplateEn;
      const finalMsg = compileMessage(template, item.member, item.dueAmount);
      
      // Clean phone
      let cleanPhone = item.member.phone.replace(/[^0-9]/g, '');
      if (cleanPhone.startsWith('0')) {
        cleanPhone = '880' + cleanPhone.substring(1);
      }

      addLog(language === 'bn' ? `📬 বকেয়া পরিমাণ: ৳${item.dueAmount} | মোবাইল: +${cleanPhone}` : `📬 Balance due: ৳${item.dueAmount} | mobile number: +${cleanPhone}`);
      await sleep(500);

      let gatewayCallSuccess = false;

      if (smsApiKey) {
        addLog(language === 'bn' ? `📡 গেটওয়েতে রিকোয়েস্ট পাঠানো হচ্ছে...` : `📡 Transmitting API payload request packet...`);
        try {
          let requestUrl = '';
          let options: any = { method: 'GET' };

          if (smsGatewayType === 'greenweb') {
            const endpoint = smsGatewayUrl || 'https://api.greenweb.com.bd/api.php';
            requestUrl = `${endpoint}?token=${encodeURIComponent(smsApiKey)}&to=${cleanPhone}&message=${encodeURIComponent(finalMsg)}&json=1`;
          } else if (smsGatewayType === 'bulksmsbd') {
            const endpoint = smsGatewayUrl || 'http://bulksmsbd.net/api_v3/sendsms/json';
            requestUrl = `${endpoint}?api_key=${encodeURIComponent(smsApiKey)}&senderid=${encodeURIComponent(smsSenderId)}&number=${cleanPhone}&message=${encodeURIComponent(finalMsg)}`;
          } else {
            // General support/custom API webhook endpoint POSTing JSON data
            requestUrl = smsGatewayUrl || 'https://api.example.com/sms';
            options = {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${smsApiKey}` },
              body: JSON.stringify({
                to: cleanPhone,
                message: finalMsg,
                sender: smsSenderId
              })
            };
          }

          // Execute actual fetch with timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          
          const response = await fetch(requestUrl, { ...options, signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            gatewayCallSuccess = true;
          } else {
            console.warn("SMS Gateway returned non-OK code:", response.status);
          }
        } catch (fetchErr: any) {
          console.warn("SMS program fetch request failed:", fetchErr);
        }
      }

      // Record logs
      if (smsApiKey && gatewayCallSuccess) {
        successCounter++;
        addLog(language === 'bn' ? `✅ সদস্য ${name} এর মোবাইলে সফলভাবে রোবোটিক চাদা মেসেজ পাঠানো হয়েছে!` : `✅ Robot SMS successfully delivered to ${name}!`);
        await recordReminderLog(item.member, item.dueAmount, 'SMS', finalMsg, 'Sent');
      } else if (smsApiKey && !gatewayCallSuccess) {
        failedCounter++;
        addLog(language === 'bn' ? `❌ গেটওয়ে এপিআই রেসপন্স ফেইল হয়েছে! মেসেজ কিউতে রাখা হল।` : `❌ SMS gateway endpoint rejected request! Message queued.`);
        await recordReminderLog(item.member, item.dueAmount, 'SMS', finalMsg, 'Failed');
      } else {
        // Fallback demo/simulation mode
        successCounter++;
        addLog(language === 'bn' ? `⚙️ (ডেমো মোড) বকেয়া রিমাইন্ডার হিসাব সম্পন্ন এবং অডিটলগ ফায়ারে রেজিস্টার করা হয়েছে।` : `⚙️ (Demo mode) Dues evaluated and registered to system auditlog.`);
        await recordReminderLog(item.member, item.dueAmount, 'SMS', finalMsg, 'Sent');
      }

      await sleep(800);
    }

    addLog(language === 'bn' ? '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' : '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    addLog(language === 'bn' ? `🏁 রোবট অটো-ডিসপ্যাচ কার্যক্রম সম্পন্ন হয়েছে।` : `🏁 Autopilot dispatch operations completed successfully.`);
    addLog(language === 'bn' ? `📊 সফলভাবে সম্পন্ন: ${successCounter} | ব্যর্থ: ${failedCounter}` : `📊 Outbox processed: ${successCounter} | errors: ${failedCounter}`);
    addLog(language === 'bn' ? '🤖 রোবট নিষ্ক্রিয় স্লিপ মোডে ফিরে যাচ্ছে।' : '🤖 Daemon returning back to idle deep sleep.');
    
    // Log overall activity
    await logActivity(
      'reminder_automation',
      `Robotic Autopilot SMS dispatch loop run completed. Evaluated ${totalCount} members, Gateway: ${smsGatewayType}.`,
      `অটো-এসএমএস রোবটিক ডিসপ্যাচ সফলভাবে সম্পন্ন হয়েছে। ${totalCount} মেম্বার নিরীক্ষণ করা হয়েছে, গেটওয়ে: ${smsGatewayType}।`
    ).catch(() => {});

    setIsAutopilotRunning(false);
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div 
        className={`p-6 md:p-8 rounded-3xl ${isThemeLight ? 'text-slate-950' : 'text-white'} shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden`}
        style={{ backgroundColor: settings?.themeColor }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <Bell size={280} className="fill-current" />
        </div>
        <div className="z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4.5">
          {(officialSealURL || settings?.logoURL) && (
            <img 
              src={getImageUrl(officialSealURL || settings?.logoURL)} 
              alt="Official Seal" 
              className={`w-14 h-14 md:w-16 md:h-16 object-contain rounded-2xl p-1.5 bg-white/10 border ${isThemeLight ? 'border-black/5' : 'border-white/10'} shadow-md shrink-0`}
              referrerPolicy="no-referrer"
            />
          )}
          <div className="space-y-2 text-left">
            <div className={`inline-flex items-center gap-2 px-3 py-1 ${isThemeLight ? 'bg-black/10 text-slate-950 font-black' : 'bg-white/20 text-white'} rounded-full text-[10px] font-black uppercase tracking-wider`}>
              🔔 {remindersEnabled ? (language === 'bn' ? 'অটো চাঁদা রিমাইন্ডার সিস্টেম (সক্রিয়)' : 'Auto Reminders System (ACTIVE)') : (language === 'bn' ? 'অটো চাঁদা রিমাইন্ডার সিস্টেম (বন্ধ)' : 'Auto Reminders System (PAUSED)')}
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight font-sans">
              {language === 'bn' ? 'অটো চাঁদা রিমাইন্ডার সিস্টেম' : 'Auto Due Reminder System'}
            </h2>
            <p className={`${isThemeLight ? 'text-slate-800' : 'text-white/85'} text-xs md:text-sm max-w-xl font-medium`}>
              {language === 'bn' 
                ? 'স্মার্ট স্বয়ংক্রিয় হোয়াটসঅ্যাপ ও সেলুলার এসএমএস বার্তা প্রেরণ কন্ট্রোল সেন্টার।' 
                : 'Smart automated WhatsApp, cellular SMS and Push Notification manager.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={runSchedulerSimulation}
          disabled={simulatingStep !== null || !remindersEnabled}
          className="z-10 flex items-center justify-center gap-2 px-5 py-3.5 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-2xl shadow-lg hover:shadow-2xl hover:scale-[1.02] transform transition-all text-sm self-start md:self-center cursor-pointer disabled:opacity-50"
        >
          <Play size={12} fill="currentColor" />
          <span>{simulatingStep === 'scheduled' ? (language === 'bn' ? 'স্ক্যান হচ্ছে...' : 'SCANNING...') : (language === 'bn' ? 'রিমাইন্ডার শিডিউল রান করুন' : 'EXECUTE AUTO SCHEDULE')}</span>
        </button>
      </div>

      {/* Scheduler Alert Information board */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 p-5 rounded-[2.2rem] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <Calendar size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">{language === 'bn' ? 'স্বয়ংক্রিয় দিনসমূহ' : 'Trigger Days'}</h5>
            <p className="text-sm font-black text-slate-800 leading-none">
              {reminderDays.map(d => `${d}th`).join(', ')} / {language === 'bn' ? 'তারিখ' : 'of Month'}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-[2.2rem] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 shrink-0">
            <AlertTriangle size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">{language === 'bn' ? 'মোট বকেয়া সদস্য' : 'Overdue Members'}</h5>
            <p className="text-xl font-black text-slate-800 leading-none">{totals.count} {language === 'bn' ? 'জন' : 'Members'}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-[2.2rem] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <div className="text-lg font-black leading-none">৳</div>
          </div>
          <div>
            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">{language === 'bn' ? 'অবশিষ্ট মোট বকেয়া' : 'Total Overdue dues'}</h5>
            <p className="text-xl font-black text-emerald-700 leading-none">৳ {totals.totalDue}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-[2.2rem] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <Bell size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">{language === 'bn' ? 'প্রেরিত মোট নোটিফিকেশন' : 'Delivered Alerts'}</h5>
            <p className="text-xl font-black text-slate-800 leading-none">{reminderLogs.length} {language === 'bn' ? 'বার' : 'Logs'}</p>
          </div>
        </div>
      </div>

      {/* Main Container Sub Navigation */}
      <div className="flex border-b border-slate-200 gap-6 select-none">
        <button
          type="button"
          onClick={() => setActiveSubTab('monitor')}
          className={`pb-3 text-xs font-black tracking-wider uppercase transition-all relative cursor-pointer ${
            activeSubTab === 'monitor' ? 'text-slate-900 border-b-2 border-emerald-600' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          {language === 'bn' ? '📋 পেন্ডিং চাঁদা মনিটর' : '📋 Overdue Dues Ledger'}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('rules')}
          className={`pb-3 text-xs font-black tracking-wider uppercase transition-all relative cursor-pointer ${
            activeSubTab === 'rules' ? 'text-slate-900 border-b-2 border-emerald-600' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          {language === 'bn' ? '⚙️ রিমাইন্ডার সেটিংস ও টেমপ্লেট' : '⚙️ Custom Message Control'}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('autopilot')}
          className={`pb-3 text-xs font-black tracking-wider uppercase transition-all relative cursor-pointer ${
            activeSubTab === 'autopilot' ? 'text-slate-900 border-b-2 border-emerald-600' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          {language === 'bn' ? '🤖 রোবোটিক অটো-এসএমএস' : '🤖 Robotic Auto-SMS'}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('logs')}
          className={`pb-3 text-xs font-black tracking-wider uppercase transition-all relative cursor-pointer ${
            activeSubTab === 'logs' ? 'text-slate-900 border-b-2 border-emerald-600' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          {language === 'bn' ? '📊 অটোমেশন লগ ও ইতিহাস' : '📊 Dispatch Queue Logs'}
        </button>
      </div>

      {/* Tab Context Section */}
      <div className="space-y-6">
        
        {/* Sub-Tab 1: Due Members Monitor */}
        {activeSubTab === 'monitor' && (
          <div className="space-y-6">
            
            {/* Control bar with searches & filter category */}
            <div className="flex flex-col md:flex-row gap-4 justify-between bg-white px-6 py-5 rounded-[2rem] border border-slate-100 shadow-3xs">
              <div className="flex-1 flex flex-col md:flex-row gap-3 min-w-0">
                
                {/* Search Text */}
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={language === 'bn' ? 'সদস্যের নাম, আইডি অথবা ফোন দিয়ে খুঁজুন...' : 'Search due member by name, ID or mobile...'}
                    className="w-full pl-11 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>

                {/* Filter Category */}
                <div className="relative shrink-0">
                  <Filter size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="pl-10 pr-8 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black text-slate-600 outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
                  >
                    <option value="all">{language === 'bn' ? 'সকল বিভাগ' : 'All Categories'}</option>
                    <option value={MemberRoleType.GENERAL}>{language === 'bn' ? 'সাধারণ সদস্য' : 'General'}</option>
                    <option value={MemberRoleType.MANAGEMENT}>{language === 'bn' ? 'ম্যানেজমেন্ট' : 'Management'}</option>
                    <option value={MemberRoleType.ADVISORY}>{language === 'bn' ? 'উপদেষ্টা মহোদয়' : 'Advisory'}</option>
                  </select>
                </div>
              </div>

              {/* Bulk operations button on Selection */}
              {selectedMembers.length > 0 && (
                <div className="flex gap-2 shrink-0 self-center animate-in zoom-in duration-200">
                  <span className="text-xs text-slate-500 self-center font-black mr-2">
                    {selectedMembers.length} {language === 'bn' ? 'জন নির্বাচিত' : 'selected'}
                  </span>
                  
                  <button
                    type="button"
                    onClick={triggerBulkPush}
                    disabled={simulatingStep !== null}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10.5px] uppercase rounded-xl transition-all shadow-sm cursor-pointer"
                  >
                    <Bell size={11} />
                    <span>{language === 'bn' ? 'বাল্ক পুশ নোটিফিকেশন' : 'Bulk Push Alerts'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Core Dues Grid Monitor representing database records */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-xl shadow-slate-200/40">
              <div className="overflow-x-auto custom-scrollbar">
                {dueMembersList.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                      <CheckCircle size={32} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-700">{language === 'bn' ? 'কোন বকেয়া পাওয়া যায়নি!' : 'No dues found!'}</p>
                      <p className="text-xs text-slate-400 font-semibold mt-1">
                        {language === 'bn' ? 'সকল সক্রিয় সদস্য সময়মত সাবস্ক্রিপশন সম্পন্ন করেছেন।' : 'All active organization members are fully cleared.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200">
                        <th className="py-4.5 px-6 shrink-0 w-12 text-center">
                          <button
                            type="button"
                            onClick={handleSelectAll}
                            className="p-1 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-slate-500"
                          >
                            {selectedMembers.length === dueMembersList.length ? (
                              <CheckSquare size={16} className="text-emerald-600 font-bold" />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                        </th>
                        <th className="py-4.5 px-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">{language === 'bn' ? 'সদস্য বিবরণ' : 'Member Details'}</th>
                        <th className="py-4.5 px-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">{language === 'bn' ? 'বকেয়া বিবরণ' : 'Dues Outlook'}</th>
                        <th className="py-4.5 px-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">{language === 'bn' ? 'রিমাইন্ডার কন্ট্রোল' : 'Reminders Active'}</th>
                        <th className="py-4.5 px-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">{language === 'bn' ? 'ম্যানুয়াল এলার্ট অ্যাকশন' : 'Manual Reminders Action'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dueMembersList.map((item) => {
                        const isSelected = selectedMembers.includes(item.member.id);
                        const reminderState = item.member.remindersActive !== false;
                        
                        return (
                          <tr key={item.member.id} className={`hover:bg-slate-50/50 transition-colors ${isSelected ? 'bg-slate-50/40' : ''}`}>
                            
                            {/* Selector */}
                            <td className="py-4.5 px-6 text-center">
                              <button
                                type="button"
                                onClick={() => handleSelectMember(item.member.id)}
                                className="p-1 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-slate-400"
                              >
                                {isSelected ? (
                                  <CheckSquare size={16} className="text-emerald-600" />
                                ) : (
                                  <Square size={16} />
                                )}
                              </button>
                            </td>

                            {/* Column 1: Member profile info */}
                            <td className="py-4.5 px-3">
                              <div className="flex items-center gap-3">
                                {item.member.photoURL ? (
                                  <img 
                                    src={item.member.photoURL} 
                                    alt={item.member.name} 
                                    className="w-10 h-10 rounded-full object-cover border border-slate-100 shrink-0" 
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 text-sm font-black flex items-center justify-center shrink-0 border border-slate-200">
                                    {item.member.name.charAt(0)}
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs font-black text-slate-800 leading-snug">
                                    {language === 'bn' ? (item.member.nameBn || item.member.name) : item.member.name}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5 select-none">
                                    <span className="text-[9.5px] font-bold text-slate-400 font-mono">{item.member.memberId}</span>
                                    <span className="w-1 h-1 bg-slate-300 rounded-full" />
                                    <span className="text-[9px] text-[#475569] font-semibold">{item.member.phone}</span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Column 2: Due specifics */}
                            <td className="py-4.5 px-3">
                              <div>
                                <span className="inline-block px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-100 text-rose-750 text-[10px] font-black leading-none">
                                  ৳ {item.dueAmount}
                                </span>
                                <p className="text-[9.5px] text-slate-500 font-bold mt-1.5 leading-none font-mono">
                                  {item.dueMonths} {language === 'bn' ? 'মাসের ওভারডিউ' : 'months outstanding'}
                                </p>
                              </div>
                            </td>

                            {/* Column 3: Indiv Controller */}
                            <td className="py-4.5 px-3">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleMemberReminders(item.member)}
                                  className={`px-3 py-1 text-[9px] font-black tracking-wider uppercase rounded-md border cursor-pointer transition-all ${
                                    reminderState 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-250' 
                                      : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
                                  }`}
                                >
                                  {reminderState ? (language === 'bn' ? 'রিমাইন্ডার অন' : 'Reminders Active') : (language === 'bn' ? 'রিমাইন্ডার অফ' : 'Reminders Blocked')}
                                </button>
                              </div>
                            </td>

                            {/* Column 4: Manual channel launch targets */}
                            <td className="py-4.5 px-6 text-right">
                              <div className="flex items-center justify-end gap-2.5">
                                
                                {/* WhatsApp Trigger */}
                                <button
                                  type="button"
                                  onClick={() => triggerWhatsApp(item.member, item.dueAmount)}
                                  className="p-2 bg-[#25d366]/10 hover:bg-[#25d366]/25 border border-[#25d366]/20 rounded-xl text-[#128c7e] transition-all cursor-pointer shadow-3xs hover:-translate-y-0.5 active:scale-95"
                                  title="WhatsApp Reminder"
                                >
                                  <Smartphone size={14} className="stroke-[2.5]" />
                                </button>

                                {/* Cellular SMS Trigger */}
                                <button
                                  type="button"
                                  onClick={() => triggerSMS(item.member, item.dueAmount)}
                                  className="p-2 bg-sky-50 hover:bg-sky-100/90 border border-sky-150 rounded-xl text-sky-600 transition-all cursor-pointer shadow-3xs hover:-translate-y-0.5 active:scale-95"
                                  title="Send System SMS"
                                >
                                  <Mail size={14} className="stroke-[2.5]" />
                                </button>

                                {/* App Push Notification triggers */}
                                <button
                                  type="button"
                                  onClick={() => triggerPush(item.member, item.dueAmount)}
                                  className="p-2 bg-indigo-50 hover:bg-indigo-100/90 border border-indigo-150 rounded-xl text-indigo-650 transition-all cursor-pointer shadow-3xs hover:-translate-y-0.5 active:scale-95"
                                  title="Push Notification"
                                >
                                  <Bell size={14} className="stroke-[2.5]" />
                                </button>

                              </div>
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sub-Tab 2: Configuration settings & template fields */}
        {activeSubTab === 'rules' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Template Editors Form */}
            <div className="lg:col-span-2">
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl"
              >
                <div className="p-8 space-y-6">
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-wider border-b pb-3 mb-2 flex items-center gap-2">
                    <Sliders size={18} className="text-emerald-600" />
                    <span>{language === 'bn' ? 'বার্তা ও খসড়া বিবরণ' : 'Configure Custom Message Templates'}</span>
                  </h3>

                  {/* WhatsApp Templates Tab */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        📱 WhatsApp Templates
                      </h4>
                      <span className="text-[9.5px] text-indigo-600 font-black tracking-widest font-mono select-none">Supported placeholders: &#123;amount&#125;, &#123;month&#125;, &#123;name&#125;, &#123;id&#125;</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* WhatsApp BN */}
                      <div className="space-y-1.5 text-left">
                        <label className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider ml-1">Bangla WA Template</label>
                        <textarea
                          rows={6}
                          value={whatsappTemplateBn}
                          onChange={(e) => setWhatsappTemplateBn(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-[11px] font-semibold leading-relaxed text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none custom-scrollbar"
                          placeholder="Type WhatsApp Bangla details..."
                        />
                      </div>

                      {/* WhatsApp EN */}
                      <div className="space-y-1.5 text-left">
                        <label className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider ml-1">English WA Template</label>
                        <textarea
                          rows={6}
                          value={whatsappTemplateEn}
                          onChange={(e) => setWhatsappTemplateEn(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-[11px] font-semibold leading-relaxed text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none custom-scrollbar"
                          placeholder="Type WhatsApp English details..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* SMS Templates Tab */}
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-1 flex items-center gap-2">
                      ✉️ Cellular SMS Templates
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* SMS BN */}
                      <div className="space-y-1.5 text-left">
                        <label className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider ml-1">Bangla SMS</label>
                        <textarea
                          rows={4}
                          value={smsTemplateBn}
                          onChange={(e) => setSmsTemplateBn(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-[11px] font-semibold leading-relaxed text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none custom-scrollbar"
                          placeholder="Type mobile cellular Bangla SMS..."
                        />
                      </div>

                      {/* SMS EN */}
                      <div className="space-y-1.5 text-left">
                        <label className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider ml-1">English SMS</label>
                        <textarea
                          rows={4}
                          value={smsTemplateEn}
                          onChange={(e) => setSmsTemplateEn(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-[11px] font-semibold leading-relaxed text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none custom-scrollbar"
                          placeholder="Type mobile cellular English SMS..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Official Seal / Logo Upload Section */}
                  <div className="pt-6 border-t border-slate-100 space-y-3 text-left">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Award size={14} className="text-amber-500" />
                      <span>{language === 'bn' ? 'সংস্থার অফিসিয়াল সিল ও লোগো' : 'Official Organization Seal & Logo'}</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                      {language === 'bn' 
                        ? 'আপনার হোয়াটসঅ্যাপ রিমাইন্ডার এবং ডাউনলোডযোগ্য সদস্য চাঁদা বিবরণীতে সংস্থাপন করার জন্য সংস্থার অফিসিয়াল সিল অথবা লোগো আপলোড করুন।' 
                        : 'Upload your organization\'s official seal or brand logo to display on member notification streams and statement downloads.'}
                    </p>

                    <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      {officialSealURL ? (
                        <div className="relative w-20 h-20 rounded-xl bg-white p-1.5 border border-slate-250 flex items-center justify-center shrink-0 shadow-3xs group">
                          <img 
                            src={getImageUrl(officialSealURL)} 
                            alt="Official Seal" 
                            className="w-full h-full object-contain" 
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={clearOfficialSeal}
                            className="absolute -top-1.5 -right-1.5 bg-rose-500 hover:bg-rose-600 text-white p-1 rounded-full shadow-md transition-colors cursor-pointer flex items-center justify-center"
                            title="Remove Seal"
                          >
                            <X size={10} className="stroke-[3]" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-20 h-20 rounded-xl bg-slate-150 border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 shrink-0">
                          <Award size={24} className="stroke-[1.5]" />
                          <span className="text-[9px] font-black mt-1 uppercase">NO SEAL</span>
                        </div>
                      )}

                      <div className="flex-1 space-y-2 text-center sm:text-left w-full">
                        <span className="text-xs font-black text-slate-700 block">
                          {officialSealURL 
                            ? (language === 'bn' ? 'সিল যুক্ত করা রয়েছে ✓' : 'Official Seal Loaded ✓') 
                            : (language === 'bn' ? 'কোন সিল যুক্ত নেই (ডিফল্ট লোগো ব্যবহার হতে পারে)' : 'No custom seal loaded (Fallback logo is utilized)')}
                        </span>
                        
                        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                          <label className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10.5px] font-black cursor-pointer transition-colors shadow-3xs uppercase tracking-wider">
                            <UploadCloud size={13} />
                            <span>{isUploadingSeal ? (language === 'bn' ? 'আপলোড হচ্ছে...' : 'Uploading...') : (language === 'bn' ? 'নতুন আপলোড' : 'Upload Seal')}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleSealUpload}
                              disabled={isUploadingSeal}
                              className="hidden"
                            />
                          </label>

                          {officialSealURL && (
                            <button
                              type="button"
                              onClick={clearOfficialSeal}
                              className="px-4 py-2 bg-white hover:bg-rose-50 border border-slate-200 text-rose-600 rounded-xl text-[10.5px] font-black transition-colors shadow-3xs uppercase tracking-wider"
                            >
                              {language === 'bn' ? 'মুছে ফেলুন' : 'Remove'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Submission segment */}
                  <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      {successMsg && (
                        <span className="text-emerald-600 font-bold text-xs flex items-center gap-1.5 animate-in slide-in-from-left duration-200">
                          <CheckCircle2 size={13} />
                          {successMsg}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={saveSettings}
                      disabled={isSavingSettings}
                      className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 px-6 py-3.5 text-white rounded-2xl text-xs font-black transition-all cursor-pointer shadow-lg active:scale-95 shadow-slate-200/55"
                    >
                      <Check size={14} className="stroke-[3]" />
                      <span>{isSavingSettings ? (language === 'bn' ? 'সংরক্ষণ ও আপডেট হচ্ছে...' : 'SAVING RULES...') : (language === 'bn' ? 'সংরক্ষণ করুন' : 'SAVE TEMPLATE RULES')}</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Smart Control Settings panel on right side */}
            <div className="space-y-6">
              
              {/* Trigger Settings Rules card */}
              <div className="bg-white border border-slate-100 p-6 rounded-[2.5rem] shadow-sm space-y-5">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b pb-2">
                  ⏰ Scheduler Parameters
                </h3>

                {/* Switch system on/off */}
                <div className="flex items-center justify-between gap-4 p-3 bg-slate-50/75 rounded-2xl border">
                  <div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide leading-none select-none">Reminder System</span>
                    <p className="text-xs font-black text-slate-700 leading-none mt-1.5">{remindersEnabled ? (language === 'bn' ? 'সরাসরি রান হচ্ছে' : 'SYSTEM ONLINE') : (language === 'bn' ? 'স্থগিত রয়েছে' : 'PAUSED OUT')}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={remindersEnabled}
                      onChange={(e) => setRemindersEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5.5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {/* Days Input array */}
                <div className="space-y-2 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Trigger Days array (e.g. 10th, 20th, 30th)</label>
                  <div className="flex gap-2">
                    {[10, 20, 30].map(day => {
                      const isActive = reminderDays.includes(day);
                      return (
                        <button
                          type="button"
                          key={day}
                          onClick={() => {
                            if (isActive) {
                              setReminderDays(reminderDays.filter(d => d !== day));
                            } else {
                              setReminderDays([...reminderDays, day].sort((a,b)=>a-b));
                            }
                          }}
                          className={`flex-1 max-w-[28%] py-3.5 rounded-2xl font-black text-xs transition-all cursor-pointer border ${
                            isActive 
                              ? 'bg-slate-900 border-slate-900 text-white' 
                              : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Stop after payment option toggle */}
                <div className="flex items-center justify-between gap-4 p-3 bg-slate-50/75 rounded-2xl border">
                  <div>
                    <span className="text-[10px] font-black text-slate-550 uppercase tracking-wide leading-none select-none">Auto Stop After Payment</span>
                    <p className="text-[11px] text-slate-500 font-semibold mt-1 leading-normal">Stop reminder automation runs once monthly ledger dues return to zero.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={automaticStopOnPayment}
                      onChange={(e) => setAutomaticStopOnPayment(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5.5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              {/* Informative card about architecture */}
              <div className="bg-gradient-to-br from-[#0c4a6e] to-[#0369a1] text-sky-50 rounded-[2.5rem] p-6 text-left shadow-lg space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-sky-200 leading-none flex items-center gap-2">
                  <Info size={14} className="stroke-[2.5]" />
                  <span>Cloud Integration Blueprint</span>
                </h4>
                <p className="text-[11px] leading-relaxed text-sky-100 font-medium">
                  Our reminder scheduler integrates clean client deep links (WhatsApp & Local SMS) that prompt mobile cell environments automatically on completion of batch scans. On backend services, Firestore schedules are mapped to auto-trigger App notifications each month on trigger days.
                </p>
                <div className="grid grid-cols-2 gap-2 text-[9px] font-black text-sky-200">
                  <div className="p-2.5 bg-white/10 rounded-xl">🔒 No Spam Policy</div>
                  <div className="p-2.5 bg-white/10 rounded-xl">🛰️ Real-Time Sync</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sub-Tab: Automated Autopilot Robotic SMS Center */}
        {activeSubTab === 'autopilot' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Console output feedback & Start Actions */}
            <div className="lg:col-span-2 space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-xl text-left space-y-6"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Cpu size={18} className="text-emerald-600 animate-pulse" />
                      <span>{language === 'bn' ? 'রোবোটিক অটো-এসএমএস কমান্ড সেন্টার' : 'Robotic Auto-SMS Dispatch Console'}</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 font-semibold">
                      {language === 'bn' 
                        ? 'কোনো মানুষের হস্তক্ষেপ ছাড়া বকেয়া চাঁদা হিসাব করে সরাসরি মেম্বারদের মোবাইলে এসএমএস পাঠায়।' 
                        : 'Calculates subscription dues and transmits dynamic cellular messages automatically.'}
                    </p>
                  </div>
                  
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider select-none ${
                    isAutopilotRunning 
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                      : 'bg-slate-50 text-slate-500 border border-slate-100'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isAutopilotRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    <span>{isAutopilotRunning ? (language === 'bn' ? 'রোবট চলছে...' : 'Robot Running...') : (language === 'bn' ? 'নিষ্ক্রিয় (স্লিপ মোড)' : 'Idle (Sleep Mode)')}</span>
                  </span>
                </div>

                {/* Robotic Live Console Terminal */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1 leading-none select-none">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                      <Terminal size={11} />
                      {language === 'bn' ? 'রোবট লাইভ কনসোল ফিডব্যাক' : 'Robot Live Console'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConsoleLogs([])}
                      disabled={isAutopilotRunning || consoleLogs.length === 0}
                      className="text-[9px] font-black text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-wider cursor-pointer disabled:opacity-40"
                    >
                      {language === 'bn' ? 'কনসোল মুছুন' : 'Clear Terminal'}
                    </button>
                  </div>

                  <div className="bg-slate-950 rounded-[1.8rem] border border-slate-900 shadow-inner p-5 font-mono text-[11px] text-emerald-450 leading-relaxed max-h-72 overflow-y-auto custom-scrollbar flex flex-col gap-2 min-h-48 text-left">
                    {consoleLogs.length === 0 ? (
                      <div className="m-auto text-center text-slate-650 select-none space-y-2 py-6">
                        <Cpu size={32} className="mx-auto opacity-20 hover:scale-105 transition-transform" />
                        <p>{language === 'bn' ? '🤖 রোবোটিক কমান্ডস দেখার জন্য অপেক্ষা করা হচ্ছে।' : '🤖 Waiting for robotic command sequences.'}</p>
                        <p className="text-[9.5px] font-semibold text-slate-500">{language === 'bn' ? 'নিচের বোতাম চেপে স্বয়ংক্রিয় প্রসেস সক্রিয় করুন।' : 'Press the dispatch button below to witness automated bot runs.'}</p>
                      </div>
                    ) : (
                      consoleLogs.map((log, index) => (
                        <div key={index} className="whitespace-pre-wrap break-all tracking-wide select-text">
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Action Trigger Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4.5 bg-slate-50 rounded-2xl border border-slate-100 text-left select-none">
                  <div className="space-y-1 sm:max-w-[65%]">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block font-sans">Autonomous Loop Action</span>
                    <p className="text-xs font-semibold text-slate-600 leading-normal">
                      {language === 'bn' 
                        ? 'এটি ক্লিক করলে রোবট প্রতিটি বকেয়া সদস্যের জন্য নির্ধারিত এসএমএস টেমপ্লেট কম্পাইল করে সরাসরি সেভড এপিআই গেটওয়ে দিয়ে সেন্ড করবে।' 
                        : 'Executes direct REST API request dispatches sequentially for all overdue active members with outstanding amounts.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={startRoboticDispatch}
                    disabled={isAutopilotRunning}
                    className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-black px-6 py-4.5 rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg active:scale-95"
                  >
                    <Cpu size={14} className={isAutopilotRunning ? 'animate-spin' : ''} />
                    <span>{isAutopilotRunning ? (language === 'bn' ? 'প্রসেসিং চলছে...' : 'PROCESSING...') : (language === 'bn' ? 'রোবট এসএমএস শুরু করুন 🚀' : 'LAUNCH ROBOT SMS 🚀')}</span>
                  </button>
                </div>

                {/* Overdue Targets Summary list preview strictly representing calculations */}
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    📌 {language === 'bn' ? 'রোবট টার্গেট লিস্ট' : 'Overdue Robotic Target Queues'} ({totals.count} {language === 'bn' ? 'জন' : 'Members'})
                  </h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {dueMembersList.map(item => (
                      <div key={item.member.id} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-150 relative overflow-hidden text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center border border-emerald-100 shrink-0 select-none">
                            {item.member.name.charAt(0)}
                          </div>
                          <div className="text-left">
                            <p className="font-black text-slate-800 leading-none">
                              {language === 'bn' ? (item.member.nameBn || item.member.name) : item.member.name}
                            </p>
                            <span className="text-[10px] text-slate-400 font-bold font-mono mt-1 block">+{item.member.phone}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black text-amber-600 bg-amber-50 font-sans">৳{item.dueAmount} {language === 'bn' ? 'বকেয়া' : 'due'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Gateway Configuration forms */}
            <div className="space-y-6 text-left">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-[2.5rem] border border-slate-100 p-6 shadow-sm space-y-5"
              >
                <div className="border-b pb-3 space-y-1">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                    <Settings2 size={13} className="text-emerald-600" />
                    <span>{language === 'bn' ? 'এসএমএস গেটওয়ে সার্ভিস' : 'API Gateway settings'}</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    {language === 'bn' ? 'এসএমএস গেটওয়ে এপিআই ডিটেইলস সেটিং' : 'Establish live credentials for robotic message delivery.'}
                  </p>
                </div>

                {/* Gateway selection */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider ml-1">{language === 'bn' ? 'সিলেক্টেড গেটওয়ে' : 'Select SMS Partner'}</label>
                  <select
                    value={smsGatewayType}
                    onChange={(e) => {
                      const type = e.target.value;
                      setSmsGatewayType(type);
                      if (type === 'greenweb') {
                        setSmsGatewayUrl('https://api.greenweb.com.bd/api.php');
                      } else if (type === 'bulksmsbd') {
                        setSmsGatewayUrl('http://bulksmsbd.net/api_v3/sendsms/json');
                      } else {
                        setSmsGatewayUrl('');
                      }
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold font-sans tracking-wide text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer appearance-none"
                  >
                    <option value="greenweb">🟢 Greenweb SMS (Bangladesh)</option>
                    <option value="bulksmsbd">🔵 BulksmsBD (Bangladesh)</option>
                    <option value="custom_webhook">⚙️ Custom Endpoint / JSON Webhook</option>
                  </select>
                </div>

                {/* API Key / TOKEN */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider">{language === 'bn' ? 'এপিআই কী / টোকেন (API Key)' : 'API Token / Key'}</label>
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-[9.5px] font-black text-slate-400 hover:text-slate-650 transition-colors uppercase flex items-center gap-1 cursor-pointer"
                    >
                      {showApiKey ? <EyeOff size={11} /> : <Eye size={11} />}
                      <span>{showApiKey ? (language === 'bn' ? 'লুকান' : 'Hide') : (language === 'bn' ? 'দেখুন' : 'Show')}</span>
                    </button>
                  </div>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={smsApiKey}
                    onChange={(e) => setSmsApiKey(e.target.value)}
                    placeholder={language === 'bn' ? 'আপনার এপিআই কি/টোকেন লিখুন...' : 'Insert your API secret key...'}
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-mono font-bold tracking-wider text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Sender ID / Masking */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider ml-1">{language === 'bn' ? 'সেন্ডার আইডি (Sender ID / Masking)' : 'Sender ID / Caller Masking'}</label>
                  <input
                    type="text"
                    value={smsSenderId}
                    onChange={(e) => setSmsSenderId(e.target.value)}
                    placeholder={language === 'bn' ? 'যেমন: NSWO-MASKS (যদি থাকে)' : 'e.g. 88017XXXXXXXX or Approved Masking...'}
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* API Endpoint URL */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider ml-1">{language === 'bn' ? 'গেটওয়ে এপিআই ইউআরএল (API URL)' : 'Gateway Target API Endpoint URL'}</label>
                  <input
                    type="text"
                    value={smsGatewayUrl}
                    onChange={(e) => setSmsGatewayUrl(e.target.value)}
                    placeholder="https://your-sms-api-domain.com/send"
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-mono font-semibold text-slate-650 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Information guidelines block */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 text-[11px] leading-relaxed text-emerald-850 font-medium space-y-1 select-none">
                  <p className="font-black text-emerald-950">💡 {language === 'bn' ? 'গেটওয়ে যেভাবে কাজ করে' : 'Integration Guidance'}</p>
                  <p>
                    {smsGatewayType === 'greenweb' 
                      ? (language === 'bn' 
                          ? 'গ্রিনওয়েব ডটকম এপিআই সরাসরি বাংলা ইউনিকোড ক্যারেক্টার সাপোর্ট করে। এর জন্য শুধু আপনার টোকেন কীটি এখানে বসিয়ে সেভ করুন।'
                          : 'Greenweb SMS API natively formats Bangla unicode characters. Simply input your secure API token here to sync.')
                      : smsGatewayType === 'bulksmsbd'
                      ? (language === 'bn'
                          ? 'বাল্কএসএমএসবিডি এপিআই-র জন্য প্রয়োজন আপনার নিজস্ব এপিআই কী এবং অনুমোদিত সেন্ডার মাস্কিং আইডি বসানো।'
                          : 'BulksmsBD configuration accepts your custom v3 API keys and synced masking/nonmasking IDs.')
                      : (language === 'bn'
                          ? 'কাস্টম এন্ডপয়েন্ট সিলেক্ট করলে এটি আপনার প্রদত্ত ইউআরএল-এ স্বয়ংক্রিয়ভাবে JSON ফরম্যাটে মেম্বার বকেয়া ফিল্ডগুলোর পেলোড POST রিকোয়েস্ট আকারে পাঠাবে।'
                          : 'Custom Option transmits standard HTTPS POST payload request containing secure JSON objects to your specified URL.')
                    }
                  </p>
                </div>

                {/* Action save Settings button */}
                <div className="pt-2 flex items-center justify-between select-none">
                  <div>
                    {successMsg && (
                      <span className="text-emerald-600 font-bold text-[10px] flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        {successMsg}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={saveSettings}
                    disabled={isSavingSettings}
                    className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 px-5 py-3 text-white rounded-xl text-[10.5px] font-black transition-all cursor-pointer shadow-md select-none"
                  >
                    <Check size={12} className="stroke-[3]" />
                    <span>{isSavingSettings ? (language === 'bn' ? 'সংরক্ষণ হচ্ছে..' : 'SAVING..') : (language === 'bn' ? 'সেটিংস সংরক্ষণ করুন' : 'SAVE CREDS')}</span>
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}

        {/* Sub-Tab 3: Batch simulation and transaction triggers log history */}
        {activeSubTab === 'logs' && (
          <div className="space-y-6">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden text-left">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                    📜 SYSTEM LOGS HISTORY // বার্তা ট্র্যাকিং বিবরণী
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold mt-1">Audit trail tracking all automated due alerts dispatched to general members</p>
                </div>
              </div>

              {logsLoading ? (
                <div className="p-12 text-center text-slate-400">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                  <span className="text-xs font-bold">Loading audit logs...</span>
                </div>
              ) : reminderLogs.length === 0 ? (
                <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                    <Info size={28} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-700 uppercase">{language === 'bn' ? 'কোন লগ পাওয়া যায়নি' : 'No reminder logs found'}</h4>
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed mt-1">Logs are saved automatically upon dispatching WhatsApp, SMS, or Push notifications.</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200">
                        <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Timestamp</th>
                        <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Member Recipient</th>
                        <th className="py-4 px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Channel / Type</th>
                        <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Message Body Preview</th>
                        <th className="py-4 px-6 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Delivery status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reminderLogs.map((log, index) => (
                        <tr key={log.id || index} className="hover:bg-slate-50/30 transition-colors">
                          <td className="py-4 px-6 text-xs text-slate-500 font-bold font-mono whitespace-nowrap">{log.date}</td>
                          <td className="py-4 px-4">
                            <span className="text-xs font-black text-slate-800 block">{log.memberName}</span>
                            <span className="text-[9.5px] font-black text-slate-400 font-mono mt-0.5 block">{log.memberId}</span>
                          </td>
                          <td className="py-4 px-3">
                            {log.type === 'WhatsApp' ? (
                              <span className="inline-flex items-center text-[8.5px] font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-wider font-mono">WhatsApp</span>
                            ) : log.type === 'SMS' ? (
                              <span className="inline-flex items-center text-[8.5px] font-black px-2 py-0.5 rounded-md bg-sky-50 text-sky-600 border border-sky-100 uppercase tracking-wider font-mono">Cellular SMS</span>
                            ) : (
                              <span className="inline-flex items-center text-[8.5px] font-black px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-650 border border-indigo-100 uppercase tracking-wider font-mono">App Push</span>
                            )}
                          </td>
                          <td className="py-4 px-4 max-w-sm">
                            <span className="text-[11px] text-slate-600 leading-relaxed block truncate mt-0.5" title={log.message}>
                              {log.message}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50/80 border border-emerald-110 px-2.5 py-0.5 rounded-full select-none justify-center">
                              <span className="w-1 h-1 bg-emerald-500 rounded-full" />
                              <span>Delivered</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
