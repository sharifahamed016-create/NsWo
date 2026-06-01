import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

export interface AppSettings {
  name: string;
  nameBn: string;
  logoURL?: string;
  themeColor?: string;
  contactPhone?: string;
  updatedAt?: any;
  
  // Smart Reminder Settings
  remindersEnabled?: boolean;
  reminderDays?: number[]; // e.g. [10, 20, 30]
  smsTemplateBn?: string;
  smsTemplateEn?: string;
  whatsappTemplateBn?: string;
  whatsappTemplateEn?: string;
  automaticStopOnPayment?: boolean;
  officialSealURL?: string;
  
  // Google Sheets integration configuration
  googleSpreadsheetId?: string;
  monthlyDepositSheetName?: string;
  ledgerSheetName?: string;
  googleSheetsLastSyncedAt?: number;

  // Custom Expense Categories
  customExpenseCategories?: string[];

  // Robotic Gateway & Automations
  smsGatewayType?: string;
  smsApiKey?: string;
  smsSenderId?: string;
  smsGatewayUrl?: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  name: 'NSWO Management System',
  nameBn: 'এনএসডব্লিউও ম্যানেজমেন্ট সিস্টেম',
  logoURL: '/nswo-logo.png',
  themeColor: '#059669', // Default emerald-600
  contactPhone: '',
  
  // Custom Expense Categories Default
  customExpenseCategories: [],
  
  // Smart Reminder Defaults
  remindersEnabled: true,
  reminderDays: [10, 20, 30],
  smsTemplateBn: 'আপনার মাসিক চাঁদা বকেয়া আছে। দয়া করে পরিশোধ করুন। পরিমাণ: ৳{amount}। - নাছিরেরটেক সমাজ কল্যাণ সংস্থা',
  smsTemplateEn: 'Your monthly subscription of ৳{amount} is due. Please pay soon. - Nashirertek Social Welfare Association',
  whatsappTemplateBn: 'আসসালামু আলাইকুম 🌿\n\nআপনার এই মাসের চাঁদা এখনো বাকি রয়েছে।\n\nপরিমাণ: ৳{amount}\nমাস: {month}\n\nদয়া করে দ্রুত পরিশোধ করুন।\n\nধন্যবাদ ❤️\nনাছিরেরটেক সমাজ কল্যাণ সংস্থা',
  whatsappTemplateEn: 'Assalamu Alaikum 🌿\n\nYour monthly subscription for {month} is still due.\n\nAmount: ৳{amount}\n\nPlease complete the payment as soon as possible.\n\nThank you ❤️\nNashirertek Social Welfare Association',
  automaticStopOnPayment: true,
  officialSealURL: '',

  // Robotic SMS defaults
  smsGatewayType: 'greenweb',
  smsApiKey: '',
  smsSenderId: '',
  smsGatewayUrl: 'https://api.greenweb.com.bd/api.php',

  // Google Sheets defaults
  googleSpreadsheetId: '156eH4EIjbSrvpilcjaqbNlKGRk63LCoX6csZTp-Dx_k',
  monthlyDepositSheetName: 'Monthly Deposit 2026',
  ledgerSheetName: 'Ledger',
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const cached = localStorage.getItem('nswo_settings');
      return cached ? JSON.parse(cached) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'settings', 'config');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      try {
        if (docSnap.exists()) {
          const fetched = docSnap.data() as AppSettings;
          if (!fetched.logoURL) {
            fetched.logoURL = '/nswo-logo.png';
          }
          setSettings(fetched);
          localStorage.setItem('nswo_settings', JSON.stringify(fetched));
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
      } catch (err) {
        console.warn("Settings format cached error:", err);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/config');
      // Graceful fallback to cached state
      try {
        const cached = localStorage.getItem('nswo_settings');
        if (cached) {
          setSettings(JSON.parse(cached));
        }
      } catch {}
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    const updated = {
      ...settings,
      ...newSettings,
      updatedAt: Date.now(),
    };
    
    setSettings(updated);
    try {
      localStorage.setItem('nswo_settings', JSON.stringify(updated));
    } catch {}

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      console.warn("Writing setting local only because Firestore quota exceeded");
      return;
    }

    // Synchronize to Firestore in the background to avoid blocking the UI
    const docRef = doc(db, 'settings', 'config');
    setDoc(docRef, updated, { merge: true })
      .then(() => {
        console.log("Settings synchronized to Firestore.");
      })
      .catch((error) => {
        console.warn("Failed to update settings in Firestore (local copy is fully preserved):", error);
      });
  };

  return { settings, loading, updateSettings };
}
