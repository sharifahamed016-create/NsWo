/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, RefreshCw, Layers, Lock, AlertCircle, 
  Check, Play, ArrowRight, ExternalLink, User, Settings,
  CheckCircle, Database, HelpCircle, ChevronRight, CheckSquare, Square,
  Trash2, AlertTriangle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useMembers } from '../hooks/useMembers';
import { usePayments } from '../hooks/usePayments';
import { useExpenses } from '../hooks/useExpenses';
import { Member, PaymentType, Payment, Expense, ExpenseCategory } from '../types';
import { logActivity } from '../lib/activity';

const MONTH_MAP_BN: { [key: string]: string } = {
  'জানু': '01',
  'জানুয়ারি': '01',
  'ফেব্রু': '02',
  'ফেব্রুয়ারি': '02',
  'মার্চ': '03',
  'এপ্রিল': '04',
  'মে': '05',
  'জুন': '06',
  'জুলাই': '07',
  'আগস্ট': '08',
  'সেপ্টে': '09',
  'সেপ্টেম্বর': '09',
  'অক্টো': '10',
  'অক্টোবর': '10',
  'নভে': '11',
  'নভেম্বর': '11',
  'ডিসে': '12',
  'ডিসেম্বর': '12'
};

const MONTH_MAP_EN: { [key: string]: string } = {
  'jan': '01', 'january': '01',
  'feb': '02', 'february': '02',
  'mar': '03', 'march': '03',
  'apr': '04', 'april': '04',
  'may': '05',
  'jun': '06', 'june': '06',
  'jul': '07', 'july': '07',
  'aug': '08', 'august': '08',
  'sep': '09', 'september': '09',
  'oct': '10', 'october': '10',
  'nov': '11', 'november': '11',
  'dec': '12', 'december': '12'
};

const BANGLA_NUMBERS: { [key: string]: string } = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
};

function toBanglaDigits(num: number | string): string {
  const bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(num).split('').map(char => {
    const idx = parseInt(char, 10);
    return isNaN(idx) ? char : bn[idx];
  }).join('');
}

function parseBanglaInt(str: string): number {
  if (!str) return 0;
  let cleansed = String(str).replace(/[,৳\s]/g, '');
  let englishStr = '';
  for (let char of cleansed) {
    if (BANGLA_NUMBERS[char] !== undefined) {
      englishStr += BANGLA_NUMBERS[char];
    } else {
      englishStr += char;
    }
  }
  const parsed = parseInt(englishStr, 10);
  return isNaN(parsed) ? 0 : parsed;
}

interface MonthlyDepositRowSync {
  id: string; // generated unique comparison key
  sheetRowIndex: number;
  rawName: string;
  monthLabel: string; // Jan, Feb, etc.
  monthCode: string; // YYYY-MM
  amount: number;
  mappedMember: Member | null;
  manualMappedMemberId?: string;
  status: 'new' | 'already_paid' | 'mismatch' | 'unmapped';
  existingPayment?: Payment;
}

interface LedgerRowSync {
  id: string;
  sheetRowIndex: number;
  date: string;
  description: string;
  income: number;
  expense: number;
  status: 'new_income' | 'new_expense' | 'already_logged' | 'ignored';
  existingPayment?: Payment;
  existingExpense?: Expense;
}

export default function GoogleSheetsSync() {
  const { 
    language, t, settings, updateSettings, 
    googleAccessToken, setGoogleAccessToken, login, userRole, isAdmin
  } = useAppContext();
  
  const { members, loading: membersLoading } = useMembers();
  const { payments, addPayment, updatePayment, deletePayment } = usePayments();
  const { expenses, addExpense } = useExpenses();

  const [activeTab, setActiveTab] = useState<'monthly' | 'ledger' | 'settings'>('monthly');
  const [spreadsheetUrl, setSpreadsheetUrl] = useState(
    settings.googleSpreadsheetId 
      ? `https://docs.google.com/spreadsheets/d/${settings.googleSpreadsheetId}` 
      : ''
  );
  const [monthlySheetName, setMonthlySheetName] = useState(settings.monthlyDepositSheetName || 'Monthly Deposit 2026');
  const [ledgerSheetName, setLedgerSheetName] = useState(settings.ledgerSheetName || 'Ledger');
  
  // Custom Sync configuration
  const [syncYear, setSyncYear] = useState<number>(2026);
  
  // Loading and State Managers
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [detectedSheetNames, setDetectedSheetNames] = useState<string[]>([]);
  const [isFetchingSheetNames, setIsFetchingSheetNames] = useState(false);
  
  // Preview Items
  const [monthlyRows, setMonthlyRows] = useState<MonthlyDepositRowSync[]>([]);
  const [ledgerRows, setLedgerRows] = useState<LedgerRowSync[]>([]);
  const [selectedMonthlyIds, setSelectedMonthlyIds] = useState<Set<string>>(new Set());
  const [selectedLedgerIds, setSelectedLedgerIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);

  // Custom persistent handle for manually mapped spreadsheet names to member IDs
  const [customMappings, setCustomMappings] = useState<Record<string, string>>(() => {
    try {
      const cached = localStorage.getItem('nswo_custom_mappings');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });

  // Reconcile confirming and execution states
  const [showReconcileConfirm, setShowReconcileConfirm] = useState(false);
  const [isForceReconciling, setIsForceReconciling] = useState(false);

  // Find duplicate subscription payments in the system
  const duplicatePaymentsList = useMemo(() => {
    const keyToPayments: Record<string, Payment[]> = {};
    payments.forEach(p => {
      if (p.type === PaymentType.SUBSCRIPTION && p.memberId && p.month) {
        const key = `${p.memberId}_${p.month}`;
        if (!keyToPayments[key]) keyToPayments[key] = [];
        keyToPayments[key].push(p);
      }
    });

    const duplicates: { key: string; memberName: string; month: string; records: Payment[] }[] = [];
    Object.entries(keyToPayments).forEach(([key, items]) => {
      if (items.length > 1) {
        const first = items[0];
        const member = members.find(m => m.id === first.memberId);
        duplicates.push({
          key,
          memberName: member ? (member.nameBn || member.name) : first.memberName,
          month: first.month,
          records: items
        });
      }
    });
    return duplicates;
  }, [payments, members]);

  const [isFixingDuplicates, setIsFixingDuplicates] = useState(false);

  const handleFixDuplicates = async () => {
    if (duplicatePaymentsList.length === 0) return;
    setIsFixingDuplicates(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    
    let deleteCount = 0;
    try {
      for (const item of duplicatePaymentsList) {
        // Keep the first record, delete the rest: records[1], records[2]...
        const recordsToDelete = item.records.slice(1);
        for (const record of recordsToDelete) {
          await deletePayment(record.id, record.amount, record.memberId, record.memberName);
          deleteCount++;
        }
      }
      
      await logActivity(
        'google_sheets_sync_recovery',
        `Database audit and clean up: merged and deleted ${deleteCount} duplicate/inflated subscription records.`,
        `ডাটাবেস সফল অডিট ও ক্লিনআপ: ${deleteCount}টি ডুপ্লিকেট চাঁদা পেমেন্ট মুছে দিয়ে ডাটা নিখুঁত করা হয়েছে।`
      ).catch(() => {});

      setSuccessMsg(
        language === 'bn'
          ? `সাফল্যের সাথে ডাটাবেস চেক করা হয়েছে। ${deleteCount}টি অনাকাঙ্ক্ষিত ডুপ্লিকেট পেমেন্ট সংশোধন ও ডিলিট করা হয়েছে! এখন মেম্বার ব্যালেন্স এবং রিপোর্ট শতভাগ নিখুঁত।`
          : `Audit completed! Cleaned up and deleted ${deleteCount} duplicate payment records to restore account integrity.`
      );
    } catch (e: any) {
      setErrorMsg(e.message || 'Error occurred while fixing duplicates.');
    } finally {
      setIsFixingDuplicates(false);
    }
  };

  const [isInIframe] = useState(() => {
    try {
      return window.self !== window.top;
    } catch {
      return false;
    }
  });

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    try {
      await login();
    } catch (err: any) {
      console.error("Google login failed", err);
      if (err?.code === 'auth/cancelled-popup-request' || err?.code === 'auth/popup-blocked') {
        setErrorMsg(
          language === 'bn' 
            ? 'পপআপ লক হয়ে গিয়েছে। আইফ্রেম সিকিউরিটি পলিসির কারণে এটি হতে পারে। দয়া করে নতুন রিক্সিলিয়েশন ট্যাবে অ্যাপটি ওপেন করে লগইন সম্পন্ন করুন।' 
            : 'Authentication popup blocked because of the sandbox iframe settings. To complete synchronization, please open the application in a new tab.'
        );
      } else {
        setErrorMsg(err.message || 'Google Authentication failed.');
      }
    }
  };

  // Parse Google Sheets URL
  const extractSpreadsheetId = (url: string) => {
    if (!url) return '';
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : url;
  };

  const fetchAvailableSheets = async (targetUrl?: string) => {
    const urlToUse = targetUrl !== undefined ? targetUrl : spreadsheetUrl;
    const spreadId = extractSpreadsheetId(urlToUse);
    if (!spreadId || !googleAccessToken) return;
    
    setIsFetchingSheetNames(true);
    setErrorMsg(null);
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadId}?fields=sheets.properties.title`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${googleAccessToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        const names: string[] = data.sheets?.map((s: any) => s.properties?.title).filter(Boolean) || [];
        setDetectedSheetNames(names);
        
        // Auto-align current monthlySheetName to the active syncYear from newly detected sheet names
        if (names.length > 0) {
          const yearStr = String(syncYear);
          let bestMatch = names.find((name: string) => {
            const ln = name.toLowerCase();
            return (ln.includes('monthly') || ln.includes('deposit') || ln.includes('চাঁদা')) && ln.includes(yearStr);
          });

          if (!bestMatch && syncYear === 2025) {
            bestMatch = names.find((name: string) => {
              const ln = name.toLowerCase();
              return (ln.includes('monthly') || ln.includes('deposit') || ln.includes('চাঁদা')) && !ln.includes('2026') && !ln.includes('2027');
            });
          }

          if (bestMatch) {
            setMonthlySheetName(bestMatch);
            updateSettings({ monthlyDepositSheetName: bestMatch });
          }
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        const apiErrorMsg = errJson?.error?.message || res.statusText;
        console.warn("Autofetch sheets error JSON:", errJson);

        if (res.status === 401 || res.status === 403) {
          setGoogleAccessToken(null);
          setErrorMsg(
            language === 'bn'
              ? `আপনার গুগল লগইন সেশন শেষ হয়ে গিয়েছে বা অবৈধ। বিবরণ: ${apiErrorMsg}। দয়া করে পুনরায় লগইন করুন এবং শিটটি শেয়ার করা আছে কিনা নিশ্চিত করুন।`
              : `Your Google login session has expired or is invalid. Details: ${apiErrorMsg}. Please sign in again and verify sheet access.`
          );
        } else {
          setErrorMsg(
            language === 'bn'
              ? `গুগল শিট থেকে ট্যাব বা পাতার তালিকা লোড করতে ব্যর্থ হয়েছে। বিবরণ: ${apiErrorMsg}। দয়া করে স্প্রেডশিট লিঙ্কটি সংশোধন করুন বা শিটটি অ্যাক্সেসযোগ্য কিনা পরীক্ষা করুন।`
              : `Failed to load sheets list. Details: ${apiErrorMsg}. Please check your spreadsheet link and ensure it is accessible.`
          );
        }
      }
    } catch (e: any) {
      console.warn("Failed to autofetch sheet names:", e);
      setErrorMsg(
        language === 'bn'
          ? `নেটওয়ার্ক বা সংযোগজনিত সমস্যা। বিবরণ: ${e.message || e}`
          : `Network or connections error. Details: ${e.message || e}`
      );
    } finally {
      setIsFetchingSheetNames(false);
    }
  };

  // Name Normalization for robust member mapping
  const normalize = (name: string): string => {
    if (!name) return '';
    let clean = name.toLowerCase();
    
    // Remove parentheses and their contents
    clean = clean.replace(/\([^)]*\)/g, '');
    
    // Remove standard English/Bengali honorific prefixes
    const prefixes = [
      /md\.?/g, /md\s+/g, /mrs\.?/g, /mr\.?/g, /mst\.?/g,
      /মোহাম্মদ/g, /মোহাম্মাদ/g, /মোঃ/g, /মো:/g, /মো/g,
      /হাজী/g, /হাজি/g, /হাজ্জি/g, /হাজ্বী/g, /হাজ্ব/g,
      /সদস্য/g, /আলহাজ্ব/g, /আলহাজ/g, /মুফতি/g, /মাওলানা/g,
      /ডাঃ/g, /ডাক্তার/g, /প্রকৌশলী/g
    ];
    prefixes.forEach(p => {
      clean = clean.replace(p, '');
    });

    // Dissolve spaces and punctuation
    clean = clean.replace(/[\s\-_.,’'"]/g, '');

    // Normalize Bengali Unicode spelling variations:
    // 1. Dissolve hasant (U+09CD) to match conjunct vs split letters (e.g. আব্দুল vs আবদুল)
    clean = clean.split('\u09cd').join('');

    // 2. Normalize Bengali characters that sound identical or are written differently
    const maps: [RegExp, string][] = [
      // Normalize Ye/Ya variations: (U+09DF is য়, U+09AF is য)
      [/[\u09df\u09af\u09bc]/g, 'য'],
      // S variations (শ, ষ, স) -> স
      [/[\u09b6\u09b7\u09b8]/g, 'স'],
      // R/Rh/Rha variations (র, ড়, ঢ়) -> র
      [/[\u09b0\u09dc\u09dd]/g, 'র'],
      // N variations (ন, ণ) -> ন
      [/[\u09a8\u09a9]/g, 'ন'],
      // Vowel variations
      [/[\u09bf\u09c0]/g, 'ি'], // ি, ী -> ি
      [/[\u09c1\u09c2]/g, 'ু'], // ু, ূ -> ু
      [/[\u0987\u0988]/g, 'ই'], // ই, ঈ -> ই
      [/[\u0989\u098a]/g, 'উ']  // উ, ঊ -> উ
    ];

    maps.forEach(([from, to]) => {
      clean = clean.replace(from, to);
    });

    return clean.trim();
  };

  // Helper to calculate Levenshtein distance for fuzzy matching of Bengali names with minor typos
  const getLevenshteinDistance = (a: string, b: string): number => {
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1, // deletion
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j - 1] + 1 // substitution
          );
        }
      }
    }
    return matrix[a.length][b.length];
  };

  const getMappedMember = (rawName: string, customMapId?: string): Member | null => {
    if (customMapId) {
      const manual = members.find(m => m.id === customMapId);
      if (manual) return manual;
    }

    // 0. Check persistent manual mapping first
    const cleanRawLabel = rawName ? rawName.trim() : '';
    if (cleanRawLabel && customMappings[cleanRawLabel]) {
      const manualId = customMappings[cleanRawLabel];
      const matchedManual = members.find(m => m.id === manualId);
      if (matchedManual) return matchedManual;
    }

    const cleanRaw = normalize(rawName);
    if (!cleanRaw) return null;

    // 1. Exact Match
    let matched = members.find(m => normalize(m.nameBn) === cleanRaw || normalize(m.name) === cleanRaw);
    if (matched) return matched;

    // 2. Partial/Sub-word Match
    matched = members.find(m => {
      const cmName = normalize(m.name);
      const cmNameBn = normalize(m.nameBn || '');
      return cmName.includes(cleanRaw) || cleanRaw.includes(cmName) || 
             cmNameBn.includes(cleanRaw) || cleanRaw.includes(cmNameBn);
    });
    if (matched) return matched;

    // 3. Levenshtein Fuzzy Match for typos (e.g. "আবদদুল" vs "আবদুল")
    if (cleanRaw.length >= 3) {
      let bestFuzzyMember: Member | null = null;
      let minDistance = 999;

      members.forEach(m => {
        const normName = normalize(m.name);
        const normNameBn = normalize(m.nameBn || '');

        if (normName) {
          const dist = getLevenshteinDistance(cleanRaw, normName);
          if (dist < minDistance) {
            minDistance = dist;
            bestFuzzyMember = m;
          }
        }
        if (normNameBn) {
          const dist = getLevenshteinDistance(cleanRaw, normNameBn);
          if (dist < minDistance) {
            minDistance = dist;
            bestFuzzyMember = m;
          }
        }
      });

      // A distance of <= 2 indicates a highly similar spelling Match (such as extra letters or character swaps)
      if (minDistance <= 2 && bestFuzzyMember) {
        console.log(`Fuzzy matched "${rawName}" to "${(bestFuzzyMember as Member).nameBn || (bestFuzzyMember as Member).name}" with distance ${minDistance}`);
        return bestFuzzyMember;
      }
    }

    return null;
  };

  // Load configuration from settings object on mount
  useEffect(() => {
    if (settings.googleSpreadsheetId) {
      setSpreadsheetUrl(`https://docs.google.com/spreadsheets/d/${settings.googleSpreadsheetId}`);
    }
    if (settings.monthlyDepositSheetName) {
      setMonthlySheetName(settings.monthlyDepositSheetName);
    }
    if (settings.ledgerSheetName) {
      setLedgerSheetName(settings.ledgerSheetName);
    }
  }, [settings]);

  // Automically fetch actual tab names on auth or url change
  useEffect(() => {
    if (googleAccessToken && spreadsheetUrl) {
      const spreadId = extractSpreadsheetId(spreadsheetUrl);
      if (spreadId && spreadId.length > 5) {
        fetchAvailableSheets();
      }
    }
  }, [googleAccessToken, spreadsheetUrl]);

  // Reset compiled list views whenever targeting parameters are modified to prevent stale data
  useEffect(() => {
    setMonthlyRows([]);
    setSelectedMonthlyIds(new Set());
    setSuccessMsg(null);
  }, [monthlySheetName, syncYear, spreadsheetUrl]);

  useEffect(() => {
    setLedgerRows([]);
    setSelectedLedgerIds(new Set());
    setSuccessMsg(null);
  }, [ledgerSheetName, spreadsheetUrl]);

  // Fetch Monthly Deposits Google Sheet
  const fetchMonthlyDeposits = async () => {
    if (!googleAccessToken) {
      setErrorMsg(language === 'bn' ? 'গুগল সাইন-ইন প্রয়োজন। অনুগ্রহ করে গুগল লগইন করুন।' : 'Google Sign-in required. Please authenticate.');
      return;
    }
    const spreadId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadId) {
      setErrorMsg(language === 'bn' ? 'সঠিক স্প্রেডশিট লিংক লিখুন।' : 'Please enter a valid Google Spreadsheet Link.');
      return;
    }

    setIsFetchingInfo(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // 1. Save settings
      await updateSettings({
        googleSpreadsheetId: spreadId,
        monthlyDepositSheetName: monthlySheetName,
      });

      // 2. Query Google sheets API
      // Fetch full sheet rows
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadId}/values/${encodeURIComponent(monthlySheetName)}?valueRenderOption=FORMATTED_VALUE`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${googleAccessToken}`
        }
      });

      if (res.status === 401 || res.status === 403) {
        setGoogleAccessToken(null);
        throw new Error(
          language === 'bn'
            ? 'আপনার গুগল লগইন সেশন শেষ হয়ে গিয়েছে বা অবৈধ। দয়া করে পুনরায় গুগল অথেনটিকেশন দিন।'
            : 'Your Google login session has expired or is invalid. Please sign in with Google again.'
        );
      }

      let rows: string[][] | null = null;
      let currentSheetName = monthlySheetName;

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || '';
        if (res.status === 400 && errMsg.includes('Unable to parse range')) {
          console.warn(`Tab '${currentSheetName}' not found. Fetching actual tabs list to match...`);
          const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadId}?fields=sheets.properties.title`;
          const metaRes = await fetch(metaUrl, {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
          });
          if (metaRes.ok) {
            const metaData = await metaRes.json();
            const realSheetNames = metaData.sheets?.map((s: any) => s.properties?.title).filter(Boolean) || [];
            if (realSheetNames.length > 0) {
              setDetectedSheetNames(realSheetNames);
              // Find a sheet name that resembles the monthly deposit sheets for the targeted syncYear
              const syncYearStr = String(syncYear);
              const syncYearBn = toBanglaDigits(syncYear);
              
              // Level 1: Matches both keyword and the targeted sync year
              let match = realSheetNames.find((name: string) => {
                const ln = name.toLowerCase();
                const hasKeyword = ln.includes('monthly') || ln.includes('deposit') || ln.includes('চাঁদা');
                const hasYear = ln.includes(syncYearStr) || ln.includes(syncYearBn);
                return hasKeyword && hasYear;
              });

              // Level 2: Matches only year
              if (!match) {
                match = realSheetNames.find((name: string) => {
                  const ln = name.toLowerCase();
                  return ln.includes(syncYearStr) || ln.includes(syncYearBn);
                });
              }

              // Level 3: Matches keywords only
              if (!match) {
                match = realSheetNames.find((name: string) => {
                  const ln = name.toLowerCase();
                  return ln.includes('monthly') || ln.includes('deposit') || ln.includes('চাঁদা');
                });
              }
              
              if (!match) {
                match = realSheetNames[0];
              }

              if (match && match !== currentSheetName) {
                console.log(`Auto-matched tab to: ${match}`);
                const retryUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadId}/values/${encodeURIComponent(match)}?valueRenderOption=FORMATTED_VALUE`;
                const retryRes = await fetch(retryUrl, {
                  headers: { 'Authorization': `Bearer ${googleAccessToken}` }
                });
                if (retryRes.ok) {
                  const retryData = await retryRes.json();
                  rows = retryData.values as string[][];
                  currentSheetName = match;
                  setMonthlySheetName(match);
                  updateSettings({ monthlyDepositSheetName: match });
                }
              }
            }
          }
        }
        
        if (!rows) {
          throw new Error(errMsg || `Google Sheets API Error: ${res.statusText}`);
        }
      } else {
        const resData = await res.json();
        rows = resData.values as string[][];
      }

      if (!rows || rows.length === 0) {
        throw new Error(language === 'bn' ? 'শিটে কোনো তথ্য পাওয়া যায়নি।' : 'No data found in the specified Sheet.');
      }

      // Looking for Header row which contains month headers
      // Let's find the row that contains the most month-like headers
      let headerRowIndex = 0;
      let bestMonthCols: { colIndex: number; label: string; monthIndex: string }[] = [];
      let maxMonthCount = 0;

      const parseMonthIndex = (cellText: string): string | null => {
        if (!cellText) return null;
        const clean = cellText.trim().toLowerCase();
        if (!clean) return null;

        // Strip numbers, spaces, and formatting to get pure letters/word
        const normalized = clean
          .replace(/[0-9\s০১২৩৪৫৬৭৮৯()\-–—_৳]/g, '')
          .replace(/month/gi, '')
          .replace(/ছিল/gi, '')
          .replace(/সাল/gi, '')
          .trim();

        if (!normalized) return null;

        if (/^(january|jan|জানুয়ারি|জানুয়ারী|জানুয়ারি|জানুয়ারী|জানু)$/i.test(normalized)) return '01';
        if (/^(february|feb|ফেব্রুয়ারি|ফেব্রুয়ারী|ফেব্রুয়ারি|ফেব্রুয়ারী|ফেব্রু)$/i.test(normalized)) return '02';
        if (/^(march|mar|মার্চ)$/i.test(normalized)) return '03';
        if (/^(april|apr|এপ্রিল)$/i.test(normalized)) return '04';
        if (/^(may|মে)$/i.test(normalized)) return '05';
        if (/^(june|jun|জুন)$/i.test(normalized)) return '06';
        if (/^(july|jul|জুলাই)$/i.test(normalized)) return '07';
        if (/^(august|aug|আগস্ট|আগষ্ট)$/i.test(normalized)) return '08';
        if (/^(september|sep|sept|সেপ্টেম্বর|সেপ্টেম্বার|সেপ্টে)$/i.test(normalized)) return '09';
        if (/^(october|oct|অক্টোবর|অক্টোবার|অক্টো)$/i.test(normalized)) return '10';
        if (/^(november|nov|নভেম্বর|নভেম্বার|নভে)$/i.test(normalized)) return '11';
        if (/^(december|dec|ডিসেম্বর|ডিসেম্বার|ডিসে)$/i.test(normalized)) return '12';

        return null;
      };

      for (let i = 0; i < Math.min(rows.length, 25); i++) {
        const row = rows[i];
        if (!row) continue;
        
        const currentMonthCols: { colIndex: number; label: string; monthIndex: string }[] = [];
        row.forEach((cell, colIdx) => {
          if (!cell) return;
          const mIdx = parseMonthIndex(cell);
          if (mIdx) {
            currentMonthCols.push({
              colIndex: colIdx,
              label: cell.trim(),
              monthIndex: mIdx
            });
          }
        });

        // We want the row with the maximum number of identified month columns
        if (currentMonthCols.length > maxMonthCount) {
          maxMonthCount = currentMonthCols.length;
          headerRowIndex = i;
          bestMonthCols = currentMonthCols;
        }
      }

      const parseYearFromHeader = (cellText: string): number | null => {
        if (!cellText) return null;
        
        // Convert Bengali digits to English digits
        const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        let clean = cellText.trim();
        for (let j = 0; j < 10; j++) {
          clean = clean.split(bnDigits[j]).join(String(j));
        }
        
        // Look for 4-digit numbers first, e.g. 2025, 2026, 2050
        const fourDigitMatch = clean.match(/(?:^|\D)(20\d{2})(?:\D|$)/);
        if (fourDigitMatch) {
          return parseInt(fourDigitMatch[1], 10);
        }
        
        // Look for 2-digit numbers inside word boundary, e.g. 24, 25, 26, 50
        // Years from 20 to 99 are considered valid
        const twoDigitMatches = clean.match(/(?:^|\D)(\d{2})(?:\D|$)/g);
        if (twoDigitMatches) {
          for (const match of twoDigitMatches) {
            const numStr = match.replace(/\D/g, '');
            const num = parseInt(numStr, 10);
            if (num >= 20 && num <= 99) {
              return 2000 + num;
            }
          }
        }
        
        return null;
      };

      if (bestMonthCols.length === 0) {
        console.warn("Could not find dynamic month headers. Applying standard fallback columns (Cols B to M as Jan to Dec) for robustness.");
        
        // Define fallback months with Bengali and English labels
        const fallbackMonths = [
          { monthIndex: '01', labelBn: 'জানুয়ারি', labelEn: 'January' },
          { monthIndex: '02', labelBn: 'ফেব্রুয়ারি', labelEn: 'February' },
          { monthIndex: '03', labelBn: 'মার্চ', labelEn: 'March' },
          { monthIndex: '04', labelBn: 'এপ্রিল', labelEn: 'April' },
          { monthIndex: '05', labelBn: 'মে', labelEn: 'May' },
          { monthIndex: '06', labelBn: 'জুন', labelEn: 'June' },
          { monthIndex: '07', labelBn: 'জুলাই', labelEn: 'July' },
          { monthIndex: '08', labelBn: 'আগস্ট', labelEn: 'August' },
          { monthIndex: '09', labelBn: 'সেপ্টেম্বর', labelEn: 'September' },
          { monthIndex: '10', labelBn: 'অক্টোবর', labelEn: 'October' },
          { monthIndex: '11', labelBn: 'নভেম্বর', labelEn: 'November' },
          { monthIndex: '12', labelBn: 'ডিসেম্বর', labelEn: 'December' }
        ];

        bestMonthCols = fallbackMonths.map((m, idx) => ({
          colIndex: idx + 1, // Columns B to M (ColIndex 1 to 12)
          label: language === 'bn' ? m.labelBn : m.labelEn,
          monthIndex: m.monthIndex
        }));

        headerRowIndex = 0; // Assume first row (index 0) is header or title, and member data starts at row 1
      }

      // Filter to target only specified year's columns
      const monthCols = bestMonthCols.filter(mCol => {
        const parsedY = parseYearFromHeader(mCol.label);
        return parsedY === null || parsedY === syncYear;
      });

      if (monthCols.length === 0) {
        const syncY_bn = toBanglaDigits(syncYear);
        throw new Error(
          language === 'bn'
            ? `শিটের হেডারগুলোতে আপনার সিলেক্ট করা চাঁদার বছর "${syncY_bn}" এর কোনো কলাম খুঁজে পাওয়া যায়নি। দয়া করে শিটের হেডার কলাম চেক করুন বা বছর পরিবর্তন করুন।`
            : `No column headers matching your selected subscription year "${syncYear}" were found. Please verify column headers or select a different year.`
        );
      }

      // Performance Optimization: Construct an O(1) Map lookup of existing local sub/payment records list
      // which prevents freezing or infinite spinner on sheets containing many columns/records
      const existingPaymentsMap = new Map<string, typeof payments[0]>();
      payments.forEach(p => {
        if (p.type === PaymentType.SUBSCRIPTION && p.memberId && p.month) {
          existingPaymentsMap.set(`${p.memberId}_${p.month}`, p);
        }
      });

      // Parse members rows starting from headerRowIndex + 1
      const syncList: MonthlyDepositRowSync[] = [];
      const newSelectedIds = new Set<string>();

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        const rawName = row[0]; // Columns A
        if (!rawName || rawName.trim() === '' || rawName.trim().includes('Month') || rawName.trim().includes('Deposit') || rawName.trim().includes('মোট')) {
          continue;
        }

        const mapped = getMappedMember(rawName);

        // For each identified month column
        monthCols.forEach(mCol => {
          const val = row[mCol.colIndex];
          const amount = parseBanglaInt(val);
          const monthCode = `${syncYear}-${mCol.monthIndex}`;

          // Check if payment already registered using O(1) Map lookup
          const existing = mapped ? existingPaymentsMap.get(`${mapped.id}_${monthCode}`) : undefined;

          if (amount <= 0 && !existing) return; // ignore completely empty cells and no existing payment

          const id = `row_${i}_col_${mCol.colIndex}_${monthCode}`;

          let status: 'new' | 'already_paid' | 'mismatch' | 'unmapped' = 'new';
          if (!mapped) {
            status = 'unmapped';
          } else if (existing) {
            if (amount <= 0) {
              status = 'mismatch';
            } else if (existing.amount === amount) {
              status = 'already_paid';
            } else {
              status = 'mismatch';
            }
          }

          syncList.push({
            id,
            sheetRowIndex: i,
            rawName: rawName.trim(),
            monthLabel: mCol.label,
            monthCode,
            amount,
            mappedMember: mapped,
            status,
            existingPayment: existing
          });

          // Pre-select new or mismatched payments
          if (status === 'new' || status === 'mismatch') {
            newSelectedIds.add(id);
          }
        });
      }

      setMonthlyRows(syncList);
      setSelectedMonthlyIds(newSelectedIds);
      setSuccessMsg(
        language === 'bn' 
          ? `সাফল্যের সাথে ${syncList.length}টি চাঁদার রেকর্ড স্প্রেডশিট থেকে পড়া হয়েছে! তথ্যগুলো অ্যাপে যুক্ত করতে নিচে তালিকাটি দেখে নিয়ে অবশ্যই "নির্বাচিত রেকর্ড সিঙ্ক করুন 🚀" বাটনে ক্লিক করুন।` 
          : `Successfully loaded ${syncList.length} subscription rows! Please scroll down and click the "Commit Sync to App 🚀" button below to save these updates.`
      );
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'Fetching failed. Please check your sheet names or configuration.');
    } finally {
      setIsFetchingInfo(false);
    }
  };

  // Fetch Ledger (Income & Expense Ledger)
  const fetchLedger = async () => {
    if (!googleAccessToken) {
      setErrorMsg(language === 'bn' ? 'গুগল সাইন-ইন প্রয়োজন। অনুগ্রহ করে গুগল লগইন করুন।' : 'Google Sign-in required. Please authenticate.');
      return;
    }
    const spreadId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadId) {
      setErrorMsg(language === 'bn' ? 'সদস্য স্প্রেডশিট লিংক লিখুন।' : 'Please enter a valid Google Spreadsheet Link.');
      return;
    }

    setIsFetchingInfo(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // 1. Save settings
      await updateSettings({
        googleSpreadsheetId: spreadId,
        ledgerSheetName: ledgerSheetName,
      });

      // 2. Fetch ledger sheet values
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadId}/values/${encodeURIComponent(ledgerSheetName)}?valueRenderOption=FORMATTED_VALUE`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${googleAccessToken}`
        }
      });

      if (res.status === 401 || res.status === 403) {
        setGoogleAccessToken(null);
        throw new Error(
          language === 'bn'
            ? 'আপনার গুগল লগইন সেশন শেষ হয়ে গিয়েছে বা অবৈধ। দয়া করে পুনরায় গুগল অথেনটিকেশন দিন।'
            : 'Your Google login session has expired or is invalid. Please sign in with Google again.'
        );
      }

      let rows: string[][] | null = null;
      let currentSheetName = ledgerSheetName;

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || '';
        if (res.status === 400 && errMsg.includes('Unable to parse range')) {
          console.warn(`Tab '${currentSheetName}' not found. Fetching actual tabs list to match...`);
          const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadId}?fields=sheets.properties.title`;
          const metaRes = await fetch(metaUrl, {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
          });
          if (metaRes.ok) {
            const metaData = await metaRes.json();
            const realSheetNames = metaData.sheets?.map((s: any) => s.properties?.title).filter(Boolean) || [];
            if (realSheetNames.length > 0) {
              setDetectedSheetNames(realSheetNames);
              // Find a sheet name that resembles the ledger / accounts
              let match = realSheetNames.find((name: string) => {
                const ln = name.toLowerCase();
                return ln.includes('ledger') || ln.includes('আয়') || ln.includes('ব্যয়') || ln.includes('হিসাব');
              });
              
              if (!match) {
                // Return second sheet or sheet with index 1 if available
                match = realSheetNames[1] || realSheetNames[0];
              }

              if (match && match !== currentSheetName) {
                console.log(`Auto-matched ledger tab to: ${match}`);
                const retryUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadId}/values/${encodeURIComponent(match)}?valueRenderOption=FORMATTED_VALUE`;
                const retryRes = await fetch(retryUrl, {
                  headers: { 'Authorization': `Bearer ${googleAccessToken}` }
                });
                if (retryRes.ok) {
                  const retryData = await retryRes.json();
                  rows = retryData.values as string[][];
                  currentSheetName = match;
                  setLedgerSheetName(match);
                  updateSettings({ ledgerSheetName: match });
                }
              }
            }
          }
        }
        
        if (!rows) {
          throw new Error(errMsg || `Google Sheets API Error: ${res.statusText}`);
        }
      } else {
        const resData = await res.json();
        rows = resData.values as string[][];
      }

      if (!rows || rows.length === 0) {
        throw new Error(language === 'bn' ? 'লেজার শিটে কোনো তথ্য পাওয়া যায়নি।' : 'No data found in Ledger Sheet.');
      }

      // Match Headers index
      // Column expectation: Date (তারিখ), Description (বিবরণ), Income (স-জমা আয়), Expense (ব্যয়)
      let dateCol = 1;
      let descCol = 2;
      let incomeCol = 3;
      let expenseCol = 4;

      // Dynamically probe headers in the first 10 rows
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const r = rows[i];
        if (r && (r.includes('তারিখ') || r.includes('বিবরণ') || r.includes('Date') || r.includes('Description'))) {
          r.forEach((cell, idx) => {
            if (!cell) return;
            const cStr = cell.trim();
            if (cStr.includes('তারিখ') || cStr.toLowerCase().includes('date')) dateCol = idx;
            if (cStr.includes('বিবরণ') || cStr.toLowerCase().includes('desc') || cStr.toLowerCase().includes('particular')) descCol = idx;
            if (cStr.includes('আয়') || cStr.includes('জমা') || cStr.toLowerCase().includes('income') || cStr.toLowerCase().includes('received')) incomeCol = idx;
            if (cStr.includes('ব্যয়') || cStr.includes('খরচ') || cStr.toLowerCase().includes('expense') || cStr.toLowerCase().includes('paid')) expenseCol = idx;
          });
          break;
        }
      }

      const parsedLedger: LedgerRowSync[] = [];
      const newSelectedIds = new Set<string>();

      // Skip the first cells/header block
      for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 3) continue;

        const rawNo = row[0];
        const rawDate = row[dateCol];
        const rawDesc = row[descCol];
        const rawIncome = row[incomeCol];
        const rawExpense = row[expenseCol];

        if (!rawDesc || rawDesc.trim() === '' || rawDesc.includes('হিসাব') || rawDesc.includes('Total') || rawDesc.includes('সাল')) {
          continue;
        }

        const incomeVal = parseBanglaInt(rawIncome);
        const expenseVal = parseBanglaInt(rawExpense);

        if (incomeVal === 0 && expenseVal === 0) continue;

        // format date cleanly. If it's a relative number or serial, skip or convert
        const finalDate = rawDate ? String(rawDate).trim() : new Date().toISOString().substring(0, 10);
        const uniqueId = `ledger_row_${i}_${finalDate}_${incomeVal}_${expenseVal}`;

        // Verify duplicates in local payments / expenses lists
        let status: 'new_income' | 'new_expense' | 'already_logged' | 'ignored' = 'new_income';
        let matchedPayment: Payment | undefined;
        let matchedExpense: Expense | undefined;

        if (incomeVal > 0) {
          status = 'new_income';
          matchedPayment = payments.find(p => 
            p.amount === incomeVal && 
            p.remarks === rawDesc.trim()
          );
          if (matchedPayment) {
            status = 'already_logged';
          }
        } else if (expenseVal > 0) {
          status = 'new_expense';
          matchedExpense = expenses.find(e => 
            e.amount === expenseVal && 
            e.description === rawDesc.trim()
          );
          if (matchedExpense) {
            status = 'already_logged';
          }
        }

        parsedLedger.push({
          id: uniqueId,
          sheetRowIndex: i,
          date: finalDate,
          description: rawDesc.trim(),
          income: incomeVal,
          expense: expenseVal,
          status,
          existingPayment: matchedPayment,
          existingExpense: matchedExpense
        });

        if (status === 'new_income' || status === 'new_expense') {
          newSelectedIds.add(uniqueId);
        }
      }

      setLedgerRows(parsedLedger);
      setSelectedLedgerIds(newSelectedIds);
      setSuccessMsg(language === 'bn' ? `লেজার শিট থেকে ${parsedLedger.length}টি রেকর্ড সংকলন করা হয়েছে।` : `Compiled ${parsedLedger.length} records from Ledger Sheet.`);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'Fetching Ledger failed. Check configuration.');
    } finally {
      setIsFetchingInfo(false);
    }
  };

  // Perform updates programmatically
  const executeMonthlySync = async () => {
    if (selectedMonthlyIds.size === 0) {
      setErrorMsg(language === 'bn' ? 'নতুন কোনো চাঁদা এন্ট্রি সিলেক্ট করা হয়নি।' : 'No entries selected to synchronize.');
      return;
    }

    setIsSyncing(true);
    setErrorMsg(null);
    let countAdded = 0;
    let countUpdated = 0;
    let countDeleted = 0;

    try {
      const itemsToSync = monthlyRows.filter(r => selectedMonthlyIds.has(r.id));
      
      for (let item of itemsToSync) {
        const m = item.mappedMember;
        if (!m) continue;

        // Find ALL matching payments inside Firestore array to resolve duplicates fully
        const matchingPayments = payments.filter(p => 
          p.memberId === m.id && 
          p.month === item.monthCode && 
          p.type === PaymentType.SUBSCRIPTION
        );

        if (item.amount <= 0) {
          // If amount is zero/empty, delete any associated payments for this month
          if (matchingPayments.length > 0) {
            for (const ep of matchingPayments) {
              await deletePayment(ep.id, ep.amount, m.id, m.name);
              countDeleted++;
            }
          }
        } else {
          // If amount > 0:
          if (matchingPayments.length === 0) {
            // Generate paid subscription record automatically
            await addPayment({
              memberId: m.id,
              memberName: m.name,
              memberNameBn: m.nameBn || m.name,
              amount: item.amount,
              date: new Date().toISOString().substring(0, 10),
              month: item.monthCode,
              year: parseInt(item.monthCode.substring(0, 4), 10),
              type: PaymentType.SUBSCRIPTION,
              method: 'Google Sheets Live Sync',
              remarks: `Google Sheet Sync (${item.monthLabel}) - Automatically Generated Receipt.`
            });
            countAdded++;
          } else {
            // Update the main payment
            const mainPayment = matchingPayments[0];
            if (mainPayment.amount !== item.amount) {
              await updatePayment(mainPayment.id, mainPayment.amount, {
                amount: item.amount,
                memberName: m.name,
                memberNameBn: m.nameBn || m.name,
                remarks: `Google Sheet Sync (${item.monthLabel}) - Automatically Updated Amount.`
              });
              countUpdated++;
            }

            // Remove any other duplicates for this month to ensure exact match with Sheet values
            if (matchingPayments.length > 1) {
              const duplicatesToDelete = matchingPayments.slice(1);
              for (const ep of duplicatesToDelete) {
                await deletePayment(ep.id, ep.amount, m.id, m.name);
                countDeleted++;
              }
            }
          }
        }
      }

      await logActivity(
        'google_sheets_sync',
        `Google Sheet Monthly Deposit synchronized: added ${countAdded}, updated ${countUpdated}, and deleted ${countDeleted} subscription receipts in Firebase.`,
        `গুগল শিট মাসিক চাঁদা সিঙ্ক্রোনাইজেশন সম্পন্ন: ${countAdded} টি নতুন রশিদ তৈরি করা, ${countUpdated} টি রশিদ আপডেট এবং ${countDeleted} টি রশিদ ডিলিট করা হয়েছে।`
      ).catch(() => {});

      // Clear sync lists
      setMonthlyRows([]);
      setSelectedMonthlyIds(new Set());
      
      const newSyncAt = Date.now();
      await updateSettings({ googleSheetsLastSyncedAt: newSyncAt });

      setSuccessMsg(
        language === 'bn' 
          ? `সাফল্য! ${countAdded}টি নতুন চাঁদা পেমেন্ট যুক্ত, ${countUpdated}টি আপডেট এবং ${countDeleted}টি খালি বা শূন্য হওয়া পেমেন্ট সফলভাবে ডিলিট ও সমন্বয় করা হয়েছে!` 
          : `Success! Added ${countAdded} new verified receipts, updated ${countUpdated} existing, and deleted ${countDeleted} cleared/zeroed entries successfully!`
      );
    } catch (e: any) {
      setErrorMsg(e.message || 'Error occurred during sync execution.');
    } finally {
      setIsSyncing(false);
    }
  };

  const executeLedgerSync = async () => {
    if (selectedLedgerIds.size === 0) {
      setErrorMsg(language === 'bn' ? 'কোনো লেজার এন্ট্রি সিলেক্ট করা হয়নি।' : 'No ledger items selected.');
      return;
    }

    setIsSyncing(true);
    setErrorMsg(null);
    let paidAdded = 0;
    let expAdded = 0;

    try {
      const itemsToSync = ledgerRows.filter(r => selectedLedgerIds.has(r.id));

      for (let item of itemsToSync) {
        if (item.income > 0) {
          // Log general income payment
          await addPayment({
            memberId: 'external',
            memberName: 'External Source / Google Sheets Sync',
            memberNameBn: 'বাহ্যিক উৎস (গুগল শিট)',
            amount: item.income,
            date: item.date,
            month: item.date.substring(0, 7),
            year: parseInt(item.date.substring(0, 4), 10),
            type: PaymentType.OTHER,
            method: 'Google Sheets Sync',
            remarks: item.description
          });
          paidAdded++;
        } else if (item.expense > 0) {
          // Log expense
          await addExpense({
            amount: item.expense,
            date: item.date,
            category: ExpenseCategory.OTHER,
            description: item.description,
            requestedBy: 'Super Admin Ledger Sync'
          });
          expAdded++;
        }
      }

      await logActivity(
        'google_sheets_sync',
        `Google Sheet General Ledger synced: added ${paidAdded} earnings and ${expAdded} expense records to the cloud.`,
        `গুগল শিট হিসাব লেজার সিঙ্ক সম্পন্ন: ${paidAdded} টি আয় এবং ${expAdded} টি নতুন খরচ ট্রানজেকশন সফলভাবে যুক্ত হয়েছে।`
      ).catch(() => {});

      setLedgerRows([]);
      setSelectedLedgerIds(new Set());
      setSuccessMsg(language === 'bn' ? `লেজার হিসাব সফলভাবে সম্পন্ন! ${paidAdded}টি আয় এবং ${expAdded}টি খরচ সফলভাবে ডাটাবেসে সিঙ্ক করা হয়েছে।` : `Ledger synchronized! Added ${paidAdded} earnings & ${expAdded} expense records.`);
    } catch (e: any) {
      setErrorMsg(e.message || 'Ledger sync failed.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle selection checklists
  const toggleMonthlyAll = () => {
    const nextList = new Set<string>();
    if (selectedMonthlyIds.size < monthlyRows.length) {
      monthlyRows.forEach(row => {
        if (row.status !== 'already_paid') nextList.add(row.id);
      });
    }
    setSelectedMonthlyIds(nextList);
  };

  const toggleLedgerAll = () => {
    const nextList = new Set<string>();
    if (selectedLedgerIds.size < ledgerRows.length) {
      ledgerRows.forEach(row => {
        if (row.status !== 'already_logged') nextList.add(row.id);
      });
    }
    setSelectedLedgerIds(nextList);
  };

  const updateManualMapping = (rowId: string, memberId: string) => {
    // Find the row to get its rawName for persistent custom mapping memory
    const targetingRow = monthlyRows.find(row => row.id === rowId);
    if (targetingRow && memberId) {
      const updatedDict = { ...customMappings, [targetingRow.rawName]: memberId };
      setCustomMappings(updatedDict);
      localStorage.setItem('nswo_custom_mappings', JSON.stringify(updatedDict));
    }

    setMonthlyRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      const mapped = members.find(m => m.id === memberId) || null;
      
      // Update status after mapping
      let status: 'new' | 'already_paid' | 'mismatch' | 'unmapped' = 'new';
      const existing = payments.find(p => 
        p.type === PaymentType.SUBSCRIPTION &&
        mapped && p.memberId === mapped.id &&
        p.month === row.monthCode
      );

      if (!mapped) status = 'unmapped';
      else if (existing) {
        status = existing.amount === row.amount ? 'already_paid' : 'mismatch';
      }

      return {
        ...row,
        mappedMember: mapped,
        manualMappedMemberId: memberId,
        status
      };
    }));
  };

  const clearSingleMapping = (sheetName: string) => {
    const updated = { ...customMappings };
    delete updated[sheetName];
    setCustomMappings(updated);
    localStorage.setItem('nswo_custom_mappings', JSON.stringify(updated));
    setSuccessMsg(
      language === 'bn' 
        ? `"${sheetName}" এর ম্যানুয়াল ম্যাপিং মুছে ফেলা হয়েছে।` 
        : `Removed manual mapping override for "${sheetName}".`
    );
  };

  const clearAllMappings = () => {
    setCustomMappings({});
    localStorage.removeItem('nswo_custom_mappings');
    setSuccessMsg(
      language === 'bn' 
        ? 'সকল ম্যানুয়াল ম্যাপিং মুছে ফেলা হয়েছে। এখন মেম্বারদের স্বয়ংক্রিয়ভাবে মিলানো হবে।' 
        : 'All manual mappings erased. Reverted to automatic fuzzy matching.'
    );
  };

  const executeForceCleanReconcile = async () => {
    setIsForceReconciling(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setShowReconcileConfirm(false);

    let countDeleted = 0;
    let countAdded = 0;

    try {
      // 1. Fetch and delete ALL subscription payments matching syncYear
      const paymentsToDelete = payments.filter(
        p => p.year === syncYear && p.type === PaymentType.SUBSCRIPTION
      );
      
      console.log(`Force Reconcile: Erasing ${paymentsToDelete.length} subscription records for year ${syncYear}`);
      for (const p of paymentsToDelete) {
        await deletePayment(p.id, p.amount, p.memberId || '', p.memberName || '');
        countDeleted++;
      }

      // 2. Loop through ALL monthlyRows and add payments where amount > 0
      for (const r of monthlyRows) {
        const m = r.mappedMember;
        if (!m || r.amount <= 0) continue;

        await addPayment({
          memberId: m.id,
          memberName: m.name,
          memberNameBn: m.nameBn || m.name,
          amount: r.amount,
          date: new Date().toISOString().substring(0, 10),
          month: r.monthCode,
          year: syncYear,
          type: PaymentType.SUBSCRIPTION,
          method: 'Google Sheets Clean Reset Sync',
          remarks: `Clean Slate Re-Sync (${r.monthLabel}) - Automatically Restored.`
        });
        countAdded++;
      }

      await logActivity(
        'google_sheets_sync',
        `Clean Slate Reconciliation executed for year ${syncYear}: Erased ${countDeleted} payments & successfully imported ${countAdded} receipts from Google Sheets.`,
        `ক্লিন স্লেট মেম্বারশিপ রিকনসিলেশন সম্পন্ন (${syncYear}): ${countDeleted} টি পূর্ববর্তী রসিদ মুছে ${countAdded} টি নতুন রসিদ শিট থেকে হুবহু ইমপোর্ট করা হয়েছে।`
      ).catch(() => {});

      // Clear sync lists to force re-evaluation of UI
      setMonthlyRows([]);
      setSelectedMonthlyIds(new Set());
      
      const newSyncAt = Date.now();
      await updateSettings({ googleSheetsLastSyncedAt: newSyncAt });

      setSuccessMsg(
        language === 'bn'
          ? `সাফল্য! ${toBanglaDigits(syncYear)} সালের সকল পূর্ববর্তী রেকর্ড মুছে গুগুল শিট অনুযায়ী মেম্বারদের মোট ${toBanglaDigits(countAdded)}টি রসিদ হুবহু নতুন করে তৈরি ও সমন্বয় করা হয়েছে!`
          : `Fully Reconciled! Erased ${countDeleted} existing registers and generated ${countAdded} fresh receipts based strictly on latest Google Sheet values.`
      );
    } catch (e: any) {
      setErrorMsg(e.message || 'Error occurred during force reconciliation.');
    } finally {
      setIsForceReconciling(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Dynamic Header */}
      <div 
        className="p-6 md:p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden"
        style={{ backgroundColor: settings.themeColor || '#059669' }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <FileSpreadsheet size={180} />
        </div>
        <div className="z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-semibold uppercase tracking-wider">
            📊 Google Workspace Sync
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight font-sans">
            {language === 'bn' ? 'গুগল স্প্রেডশিট সিঙ্ক ম্যানেজার' : 'Google Sheets Sync Center'}
          </h2>
          <p className="text-white/85 text-xs md:text-sm max-w-xl font-medium">
            {language === 'bn' 
              ? 'আপনার গুগল স্প্রেডশিটের পেমেন্ট এবং হিসাব লেজার রেকর্ড সরাসরি অ্যাপ্লিকেশনের সাথে রিয়েল-টাইম রিকনসিল করুন।' 
              : "Reconcile, sync, and generate receipts dynamically using Google Spreadsheet records."}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-emerald-900/20 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => { setActiveTab('monthly'); setErrorMsg(null); setSuccessMsg(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm tracking-wide transition-all shrink-0 ${
            activeTab === 'monthly'
              ? 'bg-amber-500 text-slate-950 font-black shadow-lg transform scale-102 border border-amber-450/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          👥 {language === 'bn' ? 'চাঁদা ট্র্যাকার সিঙ্ক' : 'Monthly Contributions Sync'}
        </button>
        <button
          onClick={() => { setActiveTab('ledger'); setErrorMsg(null); setSuccessMsg(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm tracking-wide transition-all shrink-0 ${
            activeTab === 'ledger'
              ? 'bg-amber-500 text-slate-950 font-black shadow-lg transform scale-102 border border-amber-450/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          ⚖️ {language === 'bn' ? 'হিসাব লেজার সিঙ্ক (Ledger)' : 'Ledger Sheet Sync'}
        </button>
        <button
          onClick={() => { setActiveTab('settings'); setErrorMsg(null); setSuccessMsg(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm tracking-wide transition-all shrink-0 ${
            activeTab === 'settings'
              ? 'bg-amber-500 text-slate-950 font-black shadow-lg transform scale-102 border border-amber-450/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          ⚙️ {language === 'bn' ? 'ম্যাপিং কনফিগারেশন' : 'Mapping Settings'}
        </button>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-4 bg-rose-950/40 border border-rose-500/20 rounded-2xl flex flex-col gap-3 text-rose-200 text-xs md:text-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-black text-rose-300">{language === 'bn' ? 'সমস্যা হয়েছে' : 'Reconciliation Alert'}</p>
              <p className="opacity-90">{errorMsg}</p>
            </div>
          </div>
          
          {(errorMsg.toLowerCase().includes('office file') || errorMsg.toLowerCase().includes('office') || errorMsg.toLowerCase().includes('not supported for this document')) && (
            <div className="mt-2 p-4 bg-amber-955/20 border border-amber-500/30 rounded-xl space-y-3 text-amber-250 bg-amber-950/20">
              <p className="font-extrabold text-xs md:text-sm text-amber-400 flex items-center gap-1.5">
                💡 {language === 'bn' 
                  ? 'মাইক্রোসফট এক্সেল (.xlsx) ফাইল ব্যবহারের সমস্যা সমাধান:' 
                  : 'How to fix Microsoft Excel (.xlsx) file error:'}
              </p>
              <ul className="text-[11px] md:text-xs space-y-2 list-decimal pl-4 leading-relaxed font-semibold text-amber-200">
                {language === 'bn' ? (
                  <>
                    <li>আপনার গুগল ড্রাইভ (Google Drive) এ যান এবং এই এক্সেল ফাইলটি নতুন ট্যাবে ওপেন করুন।</li>
                    <li>উপরে বাম পাশে থাকা <strong className="text-amber-100 font-bold">File (ফাইল)</strong> মেনুতে ক্লিক করুন।</li>
                    <li>সেখান থেকে <strong className="text-amber-100 font-bold">Save as Google Sheets (গুগল শিটস হিসেবে সেভ করুন)</strong> অপশনে ক্লিক করুন।</li>
                    <li>সেভ হওয়ার পর একটি নতুন উইন্ডোতে আসল গুগল শিটটি তৈরি হবে। নতুন সেই গুগল শিটটির লিঙ্কটি কপি করে উপরে স্প্রেডশিট লিঙ্ক ফিল্ডে পেস্ট করুন এবং আবার চেষ্টা করুন।</li>
                  </>
                ) : (
                  <>
                    <li>Go to your Google Drive and open this Excel (.xlsx) file.</li>
                    <li>Click on the <strong className="text-amber-100 font-bold">File</strong> menu in the top-left corner of the Google Sheets viewer.</li>
                    <li>Choose <strong className="text-amber-100 font-bold">Save as Google Sheets</strong>. This creates a native Google Sheets copy of the file.</li>
                    <li>Copy the URL / link of the newly opened Sheet, paste it in the configuration input above, and retry the synchronization!</li>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/20 rounded-2xl flex items-start gap-3 text-emerald-250 text-xs md:text-sm">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">{language === 'bn' ? 'সাফল্য' : 'Success Operation'}</p>
            <p className="opacity-90">{successMsg}</p>
          </div>
        </div>
      )}

      {duplicatePaymentsList.length > 0 && (
        <div className="p-5 bg-amber-955/20 border border-amber-500/30 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-pulse-slow">
          <div className="space-y-1">
            <h4 className="font-extrabold text-xs md:text-sm text-amber-400 flex items-center gap-2">
              ⚠️ {language === 'bn' ? 'ডাটাবেস ডুপ্লিকেট চাঁদা সনাক্ত করা হয়েছে' : 'Duplicate Contributions Detected'}
            </h4>
            <p className="text-[11px] md:text-xs text-amber-200/90 leading-relaxed max-w-2xl font-medium">
              {language === 'bn'
                ? `আমরা আপনার ডাটাবেস অডিট করে মোট ${duplicatePaymentsList.length}টি ক্ষেত্রে একই মেম্বারের এক মাসে একাধিক ডুপ্লিকেট পেমেন্ট স্লিপ (যেমন: হাজি আবদুল কাইয়ূম এর ডাবল ও অতিরিক্ত পেমেন্ট স্লিপ) সনাক্ত করেছি। এর কারণে অ্যাপলিকেশনের হিসাবের সাথে শিটের হিসাব মিলছে না।`
                : `We detected ${duplicatePaymentsList.length} instances where members have duplicate subscription payment entries for the same month, bloating overall balances compared to Google Sheets.`}
            </p>
          </div>
          <button
            onClick={handleFixDuplicates}
            disabled={isFixingDuplicates}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs md:text-sm rounded-xl shrink-0 cursor-pointer shadow-lg hover:scale-102 transition-all flex items-center gap-2"
          >
            {isFixingDuplicates ? '🔄 Fixing...' : '🛠️ ' + (language === 'bn' ? 'ডুপ্লিকেটগুলো ডিলিট ও ঠিক করুন' : 'Auto-Merge & Clean Duplicates')}
          </button>
        </div>
      )}

      {/* Main Body */}
      {!googleAccessToken ? (
        <div className="p-8 md:p-12 text-center border border-dashed border-emerald-900/30 rounded-[2rem] bg-black/40 backdrop-blur-sm space-y-6 max-w-2xl mx-auto">
          <div className="w-16 h-16 bg-emerald-900/20 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
            <Lock size={32} />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg md:text-xl font-black">{language === 'bn' ? 'গুগল অথেনটিকেশন দিন' : 'Unlock Google Workspace Integration'}</h3>
            <p className="text-slate-400 text-xs md:text-sm leading-relaxed">
              {language === 'bn' 
                ? 'আপনার গুগল ড্রাইভ ও স্প্রেডশিটের তথ্য রিড ও সিঙ্ক করার জন্য গুগল একাউন্ট লগইন জরুরি। আপনার ডাটা সম্পূর্ণ সুরক্ষিত থাকে।' 
                : 'Signing in with your Google account delegates secure read authorizations to synchronize your spreadsheet data.'}
            </p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleGoogleLogin}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-slate-900 font-bold rounded-xl shadow-lg hover:bg-slate-100 font-sans transition-all text-sm uppercase tracking-wide cursor-pointer"
            >
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                <path fill="none" d="M0 0h48v48H0z"></path>
              </svg>
              {language === 'bn' ? 'গুগল দিয়ে লগইন করুন' : 'Sign In with Google'}
            </button>
            
            {isInIframe && (
              <a 
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md transition-all uppercase tracking-wide"
              >
                🚀 {language === 'bn' ? 'অ্যাপটি নতুন ট্যাবে খুলুন' : 'Open Workspace in New Tab'}
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Form settings */}
          <div className="p-6 border border-emerald-900/15 rounded-3xl bg-black/45 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-emerald-900/15 pb-4 gap-4">
              <h3 className="text-sm font-black text-amber-500 uppercase tracking-wider flex items-center gap-2">
                🔌 {language === 'bn' ? 'স্প্রেডশিট লিঙ্ক কনফিগারেশন' : 'Spreadsheet API Parameters'}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                  🟢 {language === 'bn' ? 'গুগল সেশন সংযুক্ত' : 'Google Connected'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setGoogleAccessToken(null);
                    setErrorMsg(null);
                    setSuccessMsg(language === 'bn' ? 'গুগল সেশন ডিসকানেক্ট করা হয়েছে।' : 'Google session disconnected.');
                  }}
                  className="px-3 py-1 bg-rose-950/40 border border-rose-500/20 hover:bg-rose-900/40 text-rose-300 text-xs font-bold rounded-lg transition-all cursor-pointer"
                >
                  {language === 'bn' ? 'লগআউট করুন' : 'Disconnect'}
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">
                  Google Sheet URL / Link
                </label>
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/your-spreadsheet-id/edit"
                  value={spreadsheetUrl}
                  onChange={(e) => setSpreadsheetUrl(e.target.value)}
                  className="w-full px-4 py-2.5 bg-emerald-950/25 border border-emerald-900/35 rounded-xl text-xs md:text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {activeTab === 'monthly' ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">
                    Sheet (Tab) Name (মাসিক চাঁদা পাতা)
                  </label>
                  <input
                    type="text"
                    value={monthlySheetName}
                    onChange={(e) => setMonthlySheetName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-emerald-950/25 border border-emerald-900/35 rounded-xl text-xs md:text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                  {detectedSheetNames.length > 0 ? (
                    <div className="mt-1 space-y-1">
                      <span className="text-[10px] font-bold text-emerald-400 block ml-1">
                        {language === 'bn' ? '📌 আপনার শিটের আসল মেম্বারশিপ ট্যাবটি সিলেক্ট করুন:' : '📌 Tap to select an actual sheet from your Google Sheet:'}
                      </span>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {detectedSheetNames.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              setMonthlySheetName(name);
                              updateSettings({ monthlyDepositSheetName: name });
                            }}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                              monthlySheetName === name
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 scale-102 font-black'
                                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    googleAccessToken && extractSpreadsheetId(spreadsheetUrl) && (
                      <button
                        type="button"
                        onClick={() => fetchAvailableSheets()}
                        className="text-[10px] text-amber-400 hover:underline font-bold transition-all block ml-1 cursor-pointer"
                        disabled={isFetchingSheetNames}
                      >
                        {isFetchingSheetNames ? '🔄 Loading sheet tabs...' : '🔍 Load actual tabs list from this Google Sheet'}
                      </button>
                    )
                  )}
                </div>
              ) : activeTab === 'ledger' ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">
                    Sheet (Tab) Name (আয়-ব্যয় হিসাব পাতা)
                  </label>
                  <input
                    type="text"
                    value={ledgerSheetName}
                    onChange={(e) => setLedgerSheetName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-emerald-950/25 border border-emerald-900/35 rounded-xl text-xs md:text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                  {detectedSheetNames.length > 0 ? (
                    <div className="mt-1 space-y-1">
                      <span className="text-[10px] font-bold text-emerald-400 block ml-1">
                        {language === 'bn' ? '📌 আপনার শিটের আসল লেজার ট্যাবটি সিলেক্ট করুন:' : '📌 Tap to select an actual sheet from your Google Sheet:'}
                      </span>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {detectedSheetNames.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              setLedgerSheetName(name);
                              updateSettings({ ledgerSheetName: name });
                            }}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                              ledgerSheetName === name
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 scale-102 font-black'
                                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    googleAccessToken && extractSpreadsheetId(spreadsheetUrl) && (
                      <button
                        type="button"
                        onClick={() => fetchAvailableSheets()}
                        className="text-[10px] text-amber-400 hover:underline font-bold transition-all block ml-1 cursor-pointer"
                        disabled={isFetchingSheetNames}
                      >
                        {isFetchingSheetNames ? '🔄 Loading sheet tabs...' : '🔍 Load actual tabs list from this Google Sheet'}
                      </button>
                    )
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-slate-400 text-xs">Configure headers logic or sheets sync defaults in the settings screen.</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/5">
              <div className="flex items-center gap-3">
                {activeTab === 'monthly' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-medium">চাঁদার বছর:</span>
                    <select
                      value={syncYear}
                      onChange={(e) => {
                        const newYear = Number(e.target.value);
                        setSyncYear(newYear);
                        // Auto-align sheet name for the selected year
                        if (detectedSheetNames.length > 0) {
                          const yearStr = String(newYear);
                          let bestMatch = detectedSheetNames.find(name => {
                            const ln = name.toLowerCase();
                            return (ln.includes('monthly') || ln.includes('deposit') || ln.includes('চাঁদা')) && ln.includes(yearStr);
                          });

                          if (!bestMatch && newYear === 2025) {
                            bestMatch = detectedSheetNames.find(name => {
                              const ln = name.toLowerCase();
                              return (ln.includes('monthly') || ln.includes('deposit') || ln.includes('চাঁদা')) && !ln.includes('2026') && !ln.includes('2027');
                            });
                          }

                          if (bestMatch) {
                            setMonthlySheetName(bestMatch);
                            updateSettings({ monthlyDepositSheetName: bestMatch });
                          }
                        } else {
                          // Fallback if sheets are not loaded from drive yet
                          if (newYear === 2026) {
                            setMonthlySheetName('Monthly_Deposit-2026');
                            updateSettings({ monthlyDepositSheetName: 'Monthly_Deposit-2026' });
                          } else if (newYear === 2025) {
                            setMonthlySheetName('Monthly_Deposit');
                            updateSettings({ monthlyDepositSheetName: 'Monthly_Deposit' });
                          } else {
                            setMonthlySheetName(`Monthly_Deposit-${newYear}`);
                            updateSettings({ monthlyDepositSheetName: `Monthly_Deposit-${newYear}` });
                          }
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-950/30 border border-emerald-900/40 rounded-lg text-xs font-bold text-white focus:outline-none"
                    >
                      <option value="2025">2025</option>
                      <option value="2026">2026</option>
                      <option value="2027">2027</option>
                    </select>
                  </div>
                )}
                {settings.googleSheetsLastSyncedAt && (
                  <span className="text-[10px] font-mono text-slate-400">
                    🔄 {language === 'bn' ? 'সর্বশেষ সিঙ্ক:' : 'Last Synced:'} {new Date(settings.googleSheetsLastSyncedAt).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {activeTab === 'monthly' && (
                  <button
                    disabled={isFetchingInfo}
                    onClick={fetchMonthlyDeposits}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs md:text-sm shadow-md transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isFetchingInfo ? 'animate-spin' : ''}`} />
                    {language === 'bn' ? 'চাঁদা পাতা রিড করুন' : 'Load Contribution Sheets'}
                  </button>
                )}

                {activeTab === 'ledger' && (
                  <button
                    disabled={isFetchingInfo}
                    onClick={fetchLedger}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs md:text-sm shadow-md transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isFetchingInfo ? 'animate-spin' : ''}`} />
                    {language === 'bn' ? 'লেজার পাতা রিড করুন' : 'Load Accounts Ledger'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Monthly Tab Data Grid */}
          {activeTab === 'monthly' && monthlyRows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-emerald-950/20 border border-emerald-900/35 rounded-2xl">
                <div className="space-y-1">
                  <h4 className="font-bold text-xs md:text-sm text-white">
                    {language === 'bn' ? 'শিট এন্ট্রি তালিকা সমাধান ও রিকনসিলেশন' : 'Spreadsheet Values Comparison'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {language === 'bn' 
                      ? `${selectedMonthlyIds.size}টি নতুন / ভিন্ন চাঁদার রেকর্ড সিঙ্ক এর জন্য নির্বাচিত করা হয়েছে` 
                      : `Selected ${selectedMonthlyIds.size} compiled monthly rows to push to Firebase.`}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMonthlyAll}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-slate-300 transition-colors"
                  >
                    {selectedMonthlyIds.size === monthlyRows.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button
                    onClick={executeMonthlySync}
                    disabled={isSyncing || selectedMonthlyIds.size === 0}
                    className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-slate-950 font-black rounded-lg text-xs md:text-sm disabled:opacity-50 cursor-pointer shadow-lg hover:scale-102 transition-all"
                  >
                    <Database className="w-4 h-4" />
                    {language === 'bn' ? 'নির্বাচিত রেকর্ড সিঙ্ক করুন 🚀' : 'Commit Sync to App'}
                  </button>
                </div>
              </div>

              {/* Grid Preview Table */}
              <div className="overflow-x-auto border border-emerald-900/20 rounded-2xl bg-black/35">
                <table className="w-full text-left text-xs text-slate-300 border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-emerald-950/20 text-[10px] uppercase font-black tracking-wider border-b border-emerald-900/20">
                      <th className="p-4 w-12 text-center text-slate-400">#</th>
                      <th className="p-4">{language === 'bn' ? 'সদস্যের নাম (শিট থেকে)' : 'Sheet Member Name'}</th>
                      <th className="p-4">{language === 'bn' ? 'ম্যাপিং রেভোলিউশন' : 'Mapped Member'}</th>
                      <th className="p-4 text-center">{language === 'bn' ? 'মাস' : 'Month'}</th>
                      <th className="p-4 text-right">{language === 'bn' ? 'পরিমাণ' : 'Amount'}</th>
                      <th className="p-4 text-center">{language === 'bn' ? 'রেকর্ড স্ট্যাটাস' : 'Verification Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {monthlyRows.map((row, idx) => {
                      const isSelected = selectedMonthlyIds.has(row.id);
                      return (
                        <tr 
                          key={row.id} 
                          className={`hover:bg-white/5 transition-colors ${
                            row.status === 'already_paid' ? 'opacity-55' : ''
                          }`}
                        >
                          <td className="p-4 text-center">
                            {row.status !== 'already_paid' ? (
                              <button
                                onClick={() => {
                                  setSelectedMonthlyIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(row.id)) next.delete(row.id);
                                    else next.add(row.id);
                                    return next;
                                  });
                                }}
                                className="text-amber-500"
                              >
                                {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                              </button>
                            ) : (
                              <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                            )}
                          </td>
                          <td className="p-4 font-bold text-white flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-500" />
                            {row.rawName}
                          </td>
                          <td className="p-4">
                            {row.mappedMember ? (
                              <span className="inline-flex flex-col">
                                <span className="font-semibold text-slate-200">{row.mappedMember.nameBn || row.mappedMember.name}</span>
                                <span className="text-[10px] font-mono text-slate-500">🔖 ID: {row.mappedMember.memberId}</span>
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 font-bold border border-rose-500/15">
                                  {language === 'bn' ? 'ম্যাপ পাওয়া যায়নি' : 'Unmapped'}
                                </span>
                                <select
                                  onChange={(e) => updateManualMapping(row.id, e.target.value)}
                                  className="px-2 py-1 bg-emerald-950/40 border border-emerald-900/40 rounded text-[11px] font-bold text-slate-200 focus:outline-none"
                                >
                                  <option value="">{language === 'bn' ? '-- সদস্য বেছে নিন --' : '-- Map to Member --'}</option>
                                  {members.map(m => (
                                    <option key={m.id} value={m.id}>{m.nameBn || m.name} ({m.memberId})</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-center font-black text-amber-500">{row.monthLabel} ({row.monthCode})</td>
                          <td className="p-4 text-right font-mono font-bold text-emerald-400">৳{row.amount}</td>
                          <td className="p-4 text-center">
                            {row.status === 'already_paid' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 uppercase">
                                ✓ Paid
                              </span>
                            )}
                            {row.status === 'new' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/15 uppercase">
                                🔔 New Payment
                              </span>
                            )}
                            {row.status === 'mismatch' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/15 uppercase">
                                {row.amount <= 0 ? (
                                  language === 'bn' ? `⚠️ মুছে ফেলা হবে (অ্যাপ: ৳${row.existingPayment?.amount})` : `⚠️ Reset/Delete (App: ৳${row.existingPayment?.amount})`
                                ) : (
                                  language === 'bn' ? `⚠️ অঙ্কের অমিল (অ্যাপ: ৳${row.existingPayment?.amount})` : `⚠️ Amnt Mismatch (App: ৳${row.existingPayment?.amount})`
                                )}
                              </span>
                            )}
                            {row.status === 'unmapped' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/15 uppercase">
                                Unresolved
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ledger Tab Data Grid */}
          {activeTab === 'ledger' && ledgerRows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-emerald-950/20 border border-emerald-900/35 rounded-2xl">
                <div className="space-y-1">
                  <h4 className="font-bold text-xs md:text-sm text-white">
                    {language === 'bn' ? 'অডিট লেজার সিঙ্ক্রোনাইজেশন' : 'Audit Ledger Reconcilation'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {language === 'bn' 
                      ? `${selectedLedgerIds.size}টি হিসাব আপডেট বা নতুন ট্রানজেকশন সিঙ্ক এর জন্য নির্বাচিত` 
                      : `Selected ${selectedLedgerIds.size} transaction rows to sync.`}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleLedgerAll}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-slate-300 transition-colors"
                  >
                    {selectedLedgerIds.size === ledgerRows.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button
                    onClick={executeLedgerSync}
                    disabled={isSyncing || selectedLedgerIds.size === 0}
                    className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-slate-950 font-black rounded-lg text-xs md:text-sm disabled:opacity-50 cursor-pointer shadow-lg hover:scale-102 transition-all"
                  >
                    <Database className="w-4 h-4" />
                    {language === 'bn' ? 'হিসাব লেজার সিঙ্ক করুন ⚖️' : 'Sync Ledger Now'}
                  </button>
                </div>
              </div>

              {/* Grid Preview Table */}
              <div className="overflow-x-auto border border-emerald-900/20 rounded-2xl bg-black/35">
                <table className="w-full text-left text-xs text-slate-300 border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-emerald-950/20 text-[10px] uppercase font-black tracking-wider border-b border-emerald-900/20">
                      <th className="p-4 w-12 text-center text-slate-400">#</th>
                      <th className="p-4">{language === 'bn' ? 'তারিখ' : 'Date'}</th>
                      <th className="p-4">{language === 'bn' ? 'হিসাব বিবরণ' : 'Description'}</th>
                      <th className="p-4 text-right">{language === 'bn' ? 'আয় (৳)' : 'Income (৳)'}</th>
                      <th className="p-4 text-right">{language === 'bn' ? 'ব্যয় (৳)' : 'Expense (৳)'}</th>
                      <th className="p-4 text-center">{language === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {ledgerRows.map((row, idx) => {
                      const isSelected = selectedLedgerIds.has(row.id);
                      return (
                        <tr 
                          key={row.id} 
                          className={`hover:bg-white/5 transition-colors ${
                            row.status === 'already_logged' ? 'opacity-55' : ''
                          }`}
                        >
                          <td className="p-4 text-center">
                            {row.status !== 'already_logged' ? (
                              <button
                                onClick={() => {
                                  setSelectedLedgerIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(row.id)) next.delete(row.id);
                                    else next.add(row.id);
                                    return next;
                                  });
                                }}
                                className="text-amber-500"
                              >
                                {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                              </button>
                            ) : (
                              <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                            )}
                          </td>
                          <td className="p-4 font-mono font-bold text-slate-300">{row.date}</td>
                          <td className="p-4 font-semibold text-white">{row.description}</td>
                          <td className="p-4 text-right font-mono text-emerald-400 font-bold">
                            {row.income > 0 ? `৳${row.income.toLocaleString()}` : '-'}
                          </td>
                          <td className="p-4 text-right font-mono text-rose-450 font-bold">
                            {row.expense > 0 ? `৳${row.expense.toLocaleString()}` : '-'}
                          </td>
                          <td className="p-4 text-center">
                            {row.status === 'already_logged' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 uppercase">
                                ✓ Synced
                              </span>
                            )}
                            {row.status === 'new_income' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/15 uppercase">
                                💰 New Income
                              </span>
                            )}
                            {row.status === 'new_expense' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-450 border border-rose-500/15 uppercase">
                                🧾 New Expense
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Force clean slate reconciliation card */}
              <div className="p-5 md:p-6 border border-rose-500/10 rounded-3xl bg-black/45 space-y-4">
                <h3 className="text-sm font-black text-rose-450 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse-slow" />
                  {language === 'bn' ? 'সম্পূর্ণ বাৎসরিক ডাটা সমন্বয় (Pristine Re-Sync)' : 'Pristine Clean Re-Sync & Reconciliation'}
                </h3>
                <p className="text-rose-205 text-[11px] md:text-xs leading-relaxed max-w-3xl">
                  {language === 'bn' 
                    ? `আপনার যদি ডুপ্লিকেট এন্ট্রি বা ট্রানজেকশনের কারণে এ্যাপের ড্যাশবোর্ডের সাথে এক্সেল শিটের ডাটার অমিল দেখা দেয়, তবে এই ফিচারটি ব্যবহার করুন। এটি বর্তমানে নির্বাচিত বছর (${toBanglaDigits(syncYear)}) এর পূর্বে রেকর্ডকৃত সকল সদস্যের মাসিক চাঁদার রসিদ অ্যাপের ডাটাবেস থেকে মুছে ফেলে আপনার লোড করা স্প্রেডশিটের নিখুঁত তথ্যের কপি হুবহু নতুন করে ইনজেক্ট করবে।`
                    : `If you have duplicated logs or mismatches due to multiple manual sync attempts, this feature clears all member subscription payment receipts recorded in the app for the selected year (${syncYear}), then regenerates them cleanly matching strictly key column entries found in your currently compiled spreadsheet.`}
                </p>
                
                {monthlyRows.length === 0 ? (
                  <div className="p-3 bg-rose-950/20 border border-rose-500/15 rounded-xl text-rose-300 text-[11px] md:text-xs">
                    ⚠️ {language === 'bn' 
                      ? `সতর্কতা: অনুগ্রহ করে প্রথমে "চাঁদা ট্র্যাকার সিঙ্ক" ট্যাবে গিয়ে "${monthlySheetName}" ট্যাব সিলেক্ট করে একবার "চাঁদা পাতা রিড করুন" বাটনে ক্লিক করে শিটের নতুন ডাটা লোড করে নিন।` 
                      : `Warning: You must first navigate to "Monthly Contributions Sync", select "${monthlySheetName}" and click "Load Contribution Sheets" to fetch current records before executing.`}
                  </div>
                ) : (
                  <div className="space-y-4 pt-1">
                    {showReconcileConfirm ? (
                      <div className="p-4 bg-rose-955/20 border border-rose-500/25 rounded-2xl space-y-3">
                        <p className="text-[11px] md:text-xs font-black text-rose-300">
                          ⚠️ {language === 'bn' 
                            ? `সাবধান! আপনি কি নিশ্চিতভাবে ${toBanglaDigits(syncYear)} সালের সব পূর্ববর্তী এন্ট্রি মুছে ফেলে গুগল শিটের ${toBanglaDigits(monthlyRows.filter(r => r.mappedMember && r.amount > 0).length)}টি পেমেন্ট স্লিপ হুবহু নতুন করে তৈরি ও সমন্বয় করতে চান? এটি রিভার্স করা সম্ভব হবে না।` 
                            : `Warning: Are you absolutely sure you want to completely clear previous ${syncYear} records and insert ${monthlyRows.filter(r => r.mappedMember && r.amount > 0).length} verified receipts directly from spreadsheet rows? This action cannot be undone.`}
                        </p>
                        <div className="flex gap-2.5">
                          <button
                            disabled={isForceReconciling}
                            onClick={executeForceCleanReconcile}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            {isForceReconciling ? 'Reconciling...' : (language === 'bn' ? 'হ্যাঁ, ক্লিন সিঙ্ক ও রিকনসিল করুন' : 'Yes, Wipe & Clean Sync')}
                          </button>
                          <button
                            onClick={() => setShowReconcileConfirm(false)}
                            className="px-4 py-2 bg-white/10 hover:bg-white/15 text-slate-300 font-extrabold rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            {language === 'bn' ? 'না, বাতিল করুন' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowReconcileConfirm(true)}
                        className="px-5 py-2.5 bg-rose-600/20 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/30 hover:border-rose-450 font-black rounded-xl text-xs md:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4 text-rose-400" />
                        {language === 'bn' 
                          ? `${toBanglaDigits(syncYear)} সালের সকল চাঁদা হুবহু রিকনসিল করুন (Clean Slate Re-Sync) 🔄` 
                          : `Execute Full Clean Re-Sync for Year ${syncYear} 🔄`}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Custom manual mapping configuration manager */}
              <div className="p-5 md:p-6 border border-emerald-900/15 rounded-3xl bg-black/45 space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-3">
                  <h3 className="text-sm font-black text-amber-500 uppercase tracking-wider flex items-center gap-2">
                    <User className="w-5 h-5 text-amber-500" />
                    {language === 'bn' ? 'ম্যানুয়াল মেম্বার ম্যাপিং ম্যানেজার' : 'Manual Member Mapping Center'}
                  </h3>
                  {Object.keys(customMappings).length > 0 && (
                    <button
                      onClick={clearAllMappings}
                      className="text-[10px] md:text-xs font-black text-rose-400 hover:text-rose-350 bg-rose-950/10 hover:bg-rose-950/20 border border-rose-500/10 px-2.5 py-1.25 rounded-lg transition-colors cursor-pointer"
                    >
                      {language === 'bn' ? 'সকল কাস্টম ম্যাপিং মুছুন' : 'Flush All Mappings'}
                    </button>
                  )}
                </div>

                <p className="text-slate-400 text-[11px] md:text-xs leading-relaxed">
                  {language === 'bn' 
                    ? 'গুগল শিটে থাকা সদস্যদের নাম যখন অ্যাপের সাথে সামান্য বানান অসামঞ্জস্যের কারণে অটোমেটিক মিলে না, তখন সিঙ্ক করার সময় আপনি যে ম্যানুয়াল ড্রপডাউন ম্যাপিং নির্বাচন করে দেন তা এখানে তালিকাভুক্ত থাকে। কোনো নামের সংযোগ ভুল হয়ে থাকলে এখান থেকে ম্যানুয়াল ম্যাপিংটি মুছে পুনরায় অন্য মেম্বার নির্বাচন করার অপশন পাবেন।' 
                    : 'Saved name maps let you bind customized spreadsheet names immediately to actual member accounts. If you mapped a name to the wrong member by mistake, remove its association below to let the auto fuzzy matching engine reset.'}
                </p>

                {Object.keys(customMappings).length === 0 ? (
                  <div className="p-5 border border-dashed border-emerald-900/15 rounded-2xl text-center bg-black/15">
                    <span className="text-slate-500 text-xs">
                      {language === 'bn' ? 'কোনো কাস্টম ম্যানুয়াল ম্যাপিং তৈরি করা নেই।' : 'No custom manual mappings registered in your browser.'}
                    </span>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-emerald-900/15 rounded-2xl bg-black/25">
                    <table className="w-full text-left text-xs text-slate-300 border-collapse min-w-[500px]">
                      <thead>
                        <tr className="bg-emerald-950/20 text-[10px] uppercase font-black tracking-wider border-b border-emerald-950/30">
                          <th className="p-3 bg-emerald-950/5 ">{language === 'bn' ? 'শিটের নাম (স্প্রেডশিট থেকে)' : 'Raw Sheet Name'}</th>
                          <th className="p-3">{language === 'bn' ? 'ম্যাপ করা এ্যাপের সদস্য ' : 'Mapped Application Member Account'}</th>
                          <th className="p-3 w-16 text-center">{language === 'bn' ? 'মুছুন' : 'Delete'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-semibold text-[11px] md:text-xs text-slate-200">
                        {Object.entries(customMappings).map(([rawName, memberId]) => {
                          const mProfile = members.find(m => m.id === memberId);
                          return (
                            <tr key={rawName} className="hover:bg-white/5 transition-colors">
                              <td className="p-3 text-white font-bold">{rawName}</td>
                              <td className="p-3">
                                {mProfile ? (
                                  <span className="inline-flex flex-col">
                                    <span className="font-semibold text-slate-200">{mProfile.nameBn || mProfile.name}</span>
                                    <span className="text-[10px] font-mono text-slate-500">🔖 ID: {mProfile.memberId}</span>
                                  </span>
                                ) : (
                                  <span className="text-rose-450 font-bold">Unknown Member (ID: {memberId})</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => clearSingleMapping(rawName)}
                                  className="text-rose-500 hover:text-rose-400 p-1.5 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                                  title="Remove Mapping Override"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Standard advances automation */}
              <div className="p-5 md:p-6 border border-emerald-900/15 rounded-3xl bg-black/45 space-y-6">
                <h3 className="text-sm font-black text-amber-500 uppercase tracking-wider flex items-center gap-2">
                  ⚙️ {language === 'bn' ? 'উন্নত ম্যাপিং এবং অটোমেশন প্যানেল' : 'Advanced Workspace Automation'}
                </h3>

                <div className="space-y-4 text-slate-350 text-xs md:text-sm leading-relaxed">
                  <p>
                    {language === 'bn' 
                      ? 'গুগল শিটের সাথে ডাটা ডিরেক্ট মিলানোর সময় কিছু নিয়মনীতি সাহায্য করে:' 
                      : 'Configure dynamic mapping guidelines to bridge your exact Google Sheets format to society database tables.'}
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-slate-400">
                    <li>
                      <strong>{language === 'bn' ? 'স্বয়ংক্রিয় নাম নরমালিস্ট' : 'Automated Name Matching List:'}</strong>{' '}
                      {language === 'bn' 
                        ? 'বাঙালি সদস্যের নামের ব্র্যাকেট বা অতিরিক্ত স্পেস মুছে ফেলে নির্ভুল তুলনা সক্রিয় করে।' 
                        : 'Cleans brackets and white spacing inside names automatically to maximize match rates.'}
                    </li>
                    <li>
                      <strong>{language === 'bn' ? 'রশিদ নং এবং আইডি ট্র্যাক' : 'Automated Receipt Numbers:'}</strong>{' '}
                      {language === 'bn' 
                        ? 'শিট থেকে পেমেন্ট আসার সাথে সাথে রশিদ নম্বরের অনুক্রম বজায় রেখে রশিদের পিডিএফ তৈরি হয়।' 
                        : 'Every sync matches transaction records, avoids duplicate ledgering, and updates live dashboards.'}
                    </li>
                  </ul>
                </div>
                
                <div className="pt-4 border-t border-white/5 space-y-4">
                  <div className="flex items-center justify-between p-4 bg-amber-500/5 rounded-2xl border border-amber-500/15">
                    <div className="space-y-1">
                      <span className="font-bold text-xs text-white block">Google Form Integration Advice</span>
                      <span className="text-[11px] text-slate-400 block max-w-lg">
                        You can hook a Google Form to write directly to your Google Sheet. Syncing here will import all member signups!
                      </span>
                    </div>
                    <HelpCircle className="w-5 h-5 text-amber-500 shrink-0" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Guidelines info card */}
          {monthlyRows.length === 0 && ledgerRows.length === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              <div className="p-5 border border-emerald-900/10 rounded-2xl bg-black/30 text-center space-y-3">
                <div className="w-10 h-10 bg-emerald-900/10 text-emerald-400 rounded-xl flex items-center justify-center mx-auto text-lg font-bold">1</div>
                <h4 className="font-bold text-xs md:text-sm text-slate-200">{language === 'bn' ? 'স্প্রেডশিট লিংক দিন' : 'Paste Sheet URL'}</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {language === 'bn' 
                    ? 'আপনার গুগল ড্রাইভের স্প্রেডশিটের লিংক কপি করে এনে প্যারামিটার বক্সে পেস্ট করুন।' 
                    : 'Pasted links are analyzed inside browser sessions securely.'}
                </p>
              </div>

              <div className="p-5 border border-emerald-900/10 rounded-2xl bg-black/30 text-center space-y-3">
                <div className="w-10 h-10 bg-emerald-900/10 text-emerald-400 rounded-xl flex items-center justify-center mx-auto text-lg font-bold">2</div>
                <h4 className="font-bold text-xs md:text-sm text-slate-200">{language === 'bn' ? 'রেকর্ড রিড করুন' : 'Load Sheet Entries'}</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {language === 'bn' 
                    ? 'লোডের মাধ্যমে আপনার শিটের সকল কলাম পেমেন্ট, মাস, বছর এবং পরিমাণ সংকলিত হবে।' 
                    : 'Pulls real values, checks existences, maps names, or requests manual mapping.'}
                </p>
              </div>

              <div className="p-5 border border-emerald-900/10 rounded-2xl bg-black/30 text-center space-y-3">
                <div className="w-10 h-10 bg-emerald-900/10 text-emerald-400 rounded-xl flex items-center justify-center mx-auto text-lg font-bold">3</div>
                <h4 className="font-bold text-xs md:text-sm text-slate-200">{language === 'bn' ? 'সিঙ্ক ও রিকনসিল' : 'Confirm Commit'}</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {language === 'bn' 
                    ? 'নির্বাচিত চাঁদা এন্ট্রি ও ট্রানজেকশন অ্যাপে রিকনসিল করার মাধ্যমে রশিদ ও ব্যালেন্স রেডি হয়ে যাবে।' 
                    : 'Saves subscription updates to Firebase, adding to dashboards and reports dynamically.'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
