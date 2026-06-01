import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Calendar, Filter, Download, Printer, Users, 
  CreditCard, AlertTriangle, TrendingUp, UserPlus, 
  FileSpreadsheet, PlusCircle, CheckCircle2, Share2, 
  DollarSign, FileText, ChevronRight, RefreshCw, Send, ArrowUpRight,
  Image, Eye, MoreVertical, Edit2, UserCheck, UserMinus
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { cleanCssText, getImageUrl } from '../lib/utils';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useAppContext } from '../context/AppContext';
import { useMembers } from '../hooks/useMembers';
import { usePayments } from '../hooks/usePayments';
import { Member, MemberStatus, PaymentType, Payment } from '../types';
import MemberProfile from './Members/MemberProfile';
import ReceiptModal from './Payments/ReceiptModal';

// Helper to convert English digits to Bangla
export const toBanglaDigits = (num: number | string): string => {
  const bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(num).split('').map(char => {
    const idx = parseInt(char, 10);
    return isNaN(idx) ? char : bn[idx];
  }).join('');
};

// Indian/Bangladeshi Currency Formatter (e.g., 1,10,750)
export const formatCurrency = (amount: number, isBn: boolean) => {
  const formatter = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const formatted = formatter.format(amount);
  return isBn ? toBanglaDigits(formatted) : formatted;
};

export const monthsList = [
  { numeric: '01', key: 'Jan', labelBn: 'জান', labelEn: 'Jan' },
  { numeric: '02', key: 'Feb', labelBn: 'ফের', labelEn: 'Feb' },
  { numeric: '03', key: 'Mar', labelBn: 'মার্চ', labelEn: 'Mar' },
  { numeric: '04', key: 'Apr', labelBn: 'এপ্রিল', labelEn: 'Apr' },
  { numeric: '05', key: 'May', labelBn: 'মে', labelEn: 'May' },
  { numeric: '06', key: 'Jun', labelBn: 'জুন', labelEn: 'Jun' },
  { numeric: '07', key: 'Jul', labelBn: 'জুলাই', labelEn: 'Jul' },
  { numeric: '08', key: 'Aug', labelBn: 'আগ', labelEn: 'Aug' },
  { numeric: '09', key: 'Sep', labelBn: 'সেন্ট', labelEn: 'Sep' },
  { numeric: '10', key: 'Oct', labelBn: 'অক্টো', labelEn: 'Oct' },
  { numeric: '11', key: 'Nov', labelBn: 'নভে', labelEn: 'Nov' },
  { numeric: '12', key: 'Dec', labelBn: 'ডিসে', labelEn: 'Dec' },
];

interface YearlyLedgerProps {
  setActiveTab?: (tab: string) => void;
}

export default function YearlyLedger({ setActiveTab }: YearlyLedgerProps) {
  const { language, settings, user, t, isAdmin } = useAppContext();
  const { members, loading: membersLoading, moveMember } = useMembers();
  const { payments, loading: paymentsLoading, addPayment, updatePayment, deletePayment } = usePayments();

  const printAreaRef = useRef<HTMLDivElement>(null);
  const ledgerTableRef = useRef<HTMLDivElement>(null);

  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'due' | 'partial'>('all');
  const [viewMode, setViewMode] = useState<'auto' | 'table' | 'cards'>('auto');
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingMemberImg, setIsGeneratingMemberImg] = useState<Record<string, boolean>>({});
  const [viewingMember, setViewingMember] = useState<Member | null>(null);
  const [editingCell, setEditingCell] = useState<{
    member: Member;
    month: { numeric: string; key: string; labelBn: string; labelEn: string };
    currentAmount: number;
    monthCode: string;
  } | null>(null);
  const [inputAmount, setInputAmount] = useState<string>('');
  const [isSubmittingAmount, setIsSubmittingAmount] = useState(false);
  const [isLedgerEditable, setIsLedgerEditable] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<Payment | null>(null);
  const [downloadImageSrc, setDownloadImageSrc] = useState<string | null>(null);
  const [downloadImageName, setDownloadImageName] = useState<string>('');

  // Bulk multi-month editing modal states
  const [bulkEditMemberLedger, setBulkEditMemberLedger] = useState<{
    member: Member;
    monthlyFee: number;
    joinedYear: number;
    joinedMonthIdx: number;
  } | null>(null);
  const [bulkEditInputs, setBulkEditInputs] = useState<Record<string, string>>({});
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const isBn = language === 'bn';

  const handleOpenBulkEdit = (item: any) => {
    const joinedDate = item.member.joinedDate ? new Date(item.member.joinedDate) : new Date(2020, 0, 1);
    const joinedYear = joinedDate.getFullYear();
    const joinedMonthIdx = joinedDate.getMonth() + 1;

    const initialInputs: Record<string, string> = {};
    monthsList.forEach(m => {
      initialInputs[m.numeric] = String(item.months[m.numeric]?.amount || 0);
    });

    setBulkEditInputs(initialInputs);
    setBulkEditMemberLedger({
      member: item.member,
      monthlyFee: item.monthlyFee,
      joinedYear,
      joinedMonthIdx,
    });
  };

  const handleBulkInputChange = (numeric: string, value: string) => {
    setBulkEditInputs(prev => ({
      ...prev,
      [numeric]: value
    }));
  };

  const modalCalculations = useMemo(() => {
    if (!bulkEditMemberLedger) return { totalPaid: 0, totalDue: 0, totalExpected: 0 };
    const { member, monthlyFee, joinedYear, joinedMonthIdx } = bulkEditMemberLedger;
    
    let totalPaid = 0;
    let totalDue = 0;
    let totalExpected = 0;

    monthsList.forEach(m => {
      const isJoined = selectedYear > joinedYear || (selectedYear === joinedYear && parseInt(m.numeric, 10) >= joinedMonthIdx);
      const isApplicable = member.status !== MemberStatus.INACTIVE && isJoined && monthlyFee > 0;
      
      const val = parseFloat(bulkEditInputs[m.numeric] || '0') || 0;
      totalPaid += val;

      if (isApplicable) {
        totalExpected += monthlyFee;
        if (val < monthlyFee) {
          totalDue += (monthlyFee - val);
        }
      }
    });

    return { totalPaid, totalDue, totalExpected };
  }, [bulkEditMemberLedger, bulkEditInputs, monthsList, selectedYear]);

  const handleSaveBulkAmounts = async () => {
    if (!bulkEditMemberLedger || isSavingBulk) return;
    setIsSavingBulk(true);
    
    const { member } = bulkEditMemberLedger;
    let hasChanges = false;
    let anyError = false;

    try {
      // Process months sequentially
      for (const m of monthsList) {
        const monthCode = `${selectedYear}-${m.numeric}`;
        const newStr = bulkEditInputs[m.numeric] || '0';
        const newAmount = Math.max(0, parseFloat(newStr) || 0);

        const matchingPayments = payments.filter(
          p => p.memberId === member.id && 
               p.month === monthCode && 
               p.type === PaymentType.SUBSCRIPTION
        );

        const currentAmount = matchingPayments.reduce((sum, p) => sum + p.amount, 0);

        if (newAmount !== currentAmount) {
          hasChanges = true;
          if (newAmount === 0) {
            if (matchingPayments.length > 0) {
              for (const p of matchingPayments) {
                await deletePayment(p.id, p.amount, member.id, member.name);
              }
            }
          } else {
            if (matchingPayments.length > 0) {
              const firstPayment = matchingPayments[0];
              await updatePayment(firstPayment.id, firstPayment.amount, {
                ...firstPayment,
                amount: newAmount,
              });
              if (matchingPayments.length > 1) {
                for (let i = 1; i < matchingPayments.length; i++) {
                  await deletePayment(matchingPayments[i].id, matchingPayments[i].amount, member.id, member.name);
                }
              }
            } else {
              await addPayment({
                memberId: member.id,
                memberName: member.name,
                memberNameBn: member.nameBn || member.name,
                amount: newAmount,
                date: new Date().toISOString().split('T')[0],
                month: monthCode,
                year: selectedYear,
                type: PaymentType.SUBSCRIPTION,
                method: 'Cash',
                remarks: isBn 
                  ? `${m.labelBn} ${toBanglaDigits(selectedYear)} এর চাঁদা (মাসিক কালেকশন এডিট)` 
                  : `${m.labelEn} ${selectedYear} Subscription (Monthly Collection Edit)`
              });
            }
          }
        }
      }

      if (hasChanges) {
        setSaveSuccessMessage(isBn ? "সদস্যের মাসিক চাঁদা সফলভাবে আপডেট করা হয়েছে!" : "Member's monthly collection updated successfully!");
        setTimeout(() => setSaveSuccessMessage(null), 3500);
      }
      setBulkEditMemberLedger(null);
    } catch (err) {
      console.error("Bulk saving failed:", err);
      anyError = true;
    } finally {
      setIsSavingBulk(false);
      if (anyError) {
        alert(isBn ? "চাঁদা সেভ করার সময় কিছু ত্রূটি ঘটেছে।" : "Some errors occurred while saving the collection.");
      }
    }
  };

  const handleEditCell = (member: Member, month: { numeric: string; key: string; labelBn: string; labelEn: string }, currentAmount: number) => {
    if (!isAdmin) return;
    const monthCode = `${selectedYear}-${month.numeric}`;
    setEditingCell({
      member,
      month,
      currentAmount,
      monthCode
    });
    setInputAmount(String(currentAmount));
  };

  const handleSaveCellAmount = async (newAmount: number) => {
    if (!editingCell) return;
    const { member, month, currentAmount, monthCode } = editingCell;

    const matchingPayments = payments.filter(
      p => p.memberId === member.id && 
           p.month === monthCode && 
           p.type === PaymentType.SUBSCRIPTION
    );

    try {
      if (newAmount === 0) {
        if (matchingPayments.length > 0) {
          for (const p of matchingPayments) {
            await deletePayment(p.id, p.amount, member.id, member.name);
          }
        }
      } else {
        if (matchingPayments.length > 0) {
          const firstPayment = matchingPayments[0];
          await updatePayment(firstPayment.id, firstPayment.amount, {
            ...firstPayment,
            amount: newAmount,
          });
          if (matchingPayments.length > 1) {
            for (let i = 1; i < matchingPayments.length; i++) {
              await deletePayment(matchingPayments[i].id, matchingPayments[i].amount, member.id, member.name);
            }
          }
        } else {
          await addPayment({
            memberId: member.id,
            memberName: member.name,
            memberNameBn: member.nameBn || member.name,
            amount: newAmount,
            date: new Date().toISOString().split('T')[0],
            month: monthCode,
            year: selectedYear,
            type: PaymentType.SUBSCRIPTION,
            method: 'Cash',
            remarks: isBn ? `${month.labelBn} ${toBanglaDigits(selectedYear)} এর চাঁদা (সরাসরি লেজার এডিট)` : `${month.labelEn} ${selectedYear} Subscription (Direct Ledger Edit)`
          });
        }
      }
      setEditingCell(null);
    } catch (error) {
      console.error("Failed to update ledger cell:", error);
      alert(isBn ? "চাঁদা আপডেট করতে সমস্যা হয়েছে! দয়া করে ইন্টারনেট কানেকশন বা কোটা লিমিট চেক করুন।" : "Error updating subscription. Please verify connection or system limitations.");
    }
  };

  const handleDoubleClickCell = (member: Member, m: { numeric: string; key: string; labelBn: string; labelEn: string }, amount: number) => {
    const monthCode = `${selectedYear}-${m.numeric}`;
    const matchedPayment = payments.find(p => p.memberId === member.id && p.month === monthCode && p.type === PaymentType.SUBSCRIPTION);
    
    if (matchedPayment) {
      setViewingReceipt(matchedPayment);
    } else if (amount > 0) {
      const virtualReceipt: Payment = {
        id: `virtual_p_${member.id}_${monthCode}`,
        memberId: member.id,
        memberName: member.name,
        memberNameBn: member.nameBn || member.name,
        amount: amount,
        date: `${selectedYear}-${m.numeric}-01`,
        month: monthCode,
        year: selectedYear,
        type: PaymentType.SUBSCRIPTION,
        receiptNo: `R-${selectedYear}${m.numeric}-${member.memberId || '101'}`,
        method: 'Cash / Manual Sync',
        remarks: isBn ? 'লেজার থেকে ডাবল ক্লিক করে অটো-জেনারেটেড রসিদ' : 'Auto-generated receipt from ledger',
        createdAt: Date.now()
      };
      setViewingReceipt(virtualReceipt);
    } else {
      alert(isBn 
        ? `${member.nameBn || member.name} এর জন্য ${m.labelBn} ${toBanglaDigits(selectedYear)} মাসে কোনো চাঁদা পরিশোধ করা নেই।`
        : `No paid receipt found for ${member.name} in ${m.labelEn} ${selectedYear}.`
      );
    }
  };

  // Available Years
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearsSet = new Set<number>([currentYear, currentYear - 1, currentYear + 1]);
    payments.forEach(p => {
      if (p.year) yearsSet.add(p.year);
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [payments]);

  // Compute stats and structures
  const ledgerData = useMemo(() => {
    if (membersLoading || paymentsLoading) return [];

    const activeMonthlyMembers = members.filter(member => member.includeInMonthlyLedger !== false);

    return activeMonthlyMembers.map(member => {
      const monthlyFee = typeof member.monthlySubscription === 'number' ? member.monthlySubscription : 500;
      
      // Parse joined date
      const joinedDate = member.joinedDate ? new Date(member.joinedDate) : new Date(2020, 0, 1);
      const joinedYear = joinedDate.getFullYear();
      const joinedMonthIdx = joinedDate.getMonth() + 1; // 1-12

      // Monthly payments map
      const monthsPayments: Record<string, { amount: number; status: 'paid' | 'partial' | 'due' | 'not_applicable' }> = {};
      let totalMemberPaid = 0;
      let totalMemberDue = 0;

      monthsList.forEach(m => {
        const monthCode = `${selectedYear}-${m.numeric}`;
        
        // Sum matching payments
        const monthPaid = payments
          .filter(p => p.memberId === member.id && p.month === monthCode && p.type === PaymentType.SUBSCRIPTION)
          .reduce((sum, p) => sum + p.amount, 0);

        // Check if joined yet
        const checkMonthVal = parseInt(m.numeric, 10);
        const isJoined = selectedYear > joinedYear || (selectedYear === joinedYear && checkMonthVal >= joinedMonthIdx);

        let status: 'paid' | 'partial' | 'due' | 'not_applicable' = 'not_applicable';
        let dueForThisMonth = 0;

        if (member.status === MemberStatus.INACTIVE) {
          status = 'not_applicable';
        } else if (!isJoined) {
          status = 'not_applicable';
        } else if (monthlyFee <= 0) {
          status = 'not_applicable';
        } else {
          if (monthPaid >= monthlyFee) {
            status = 'paid';
          } else if (monthPaid > 0) {
            status = 'partial';
            dueForThisMonth = monthlyFee - monthPaid;
          } else {
            status = 'due';
            dueForThisMonth = monthlyFee;
          }
        }

        monthsPayments[m.numeric] = {
          amount: monthPaid,
          status
        };

        totalMemberPaid += monthPaid;
        totalMemberDue += dueForThisMonth;
      });

      // Overall yearly member payment status
      let overallStatus: 'paid' | 'partial' | 'due' | 'not_applicable' = 'not_applicable';
      const statusList = Object.values(monthsPayments).map(v => v.status);
      
      if (statusList.includes('due')) {
        overallStatus = 'due';
      } else if (statusList.includes('partial')) {
        overallStatus = 'partial';
      } else if (statusList.includes('paid')) {
        overallStatus = 'paid';
      }

      return {
        member,
        months: monthsPayments,
        totalPaid: totalMemberPaid,
        totalDue: totalMemberDue,
        overallStatus,
        monthlyFee
      };
    });
  }, [members, payments, selectedYear, membersLoading, paymentsLoading, monthsList]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totalMembers = ledgerData.length;
    let totalCollection = 0;
    let totalDue = 0;
    let paidMembersCount = 0;
    let dueMembersCount = 0;

    ledgerData.forEach(item => {
      totalCollection += item.totalPaid;
      totalDue += item.totalDue;
      
      // Calculate active monthly paying vs draft dues
      if (item.totalDue === 0 && item.totalPaid > 0) {
        paidMembersCount++;
      } else if (item.totalDue > 0) {
        dueMembersCount++;
      }
    });

    const collectionRate = totalCollection + totalDue > 0 
      ? (totalCollection / (totalCollection + totalDue)) * 100 
      : 100;

    // Calculate this month's collection
    const today = new Date();
    const currentMonthNum = (today.getMonth() + 1).toString().padStart(2, '0');
    const currentYearNum = today.getFullYear();
    const currentMonthCode = `${currentYearNum}-${currentMonthNum}`;
    
    const thisMonthCollection = payments
      .filter(p => p.month === currentMonthCode && p.type === PaymentType.SUBSCRIPTION)
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      totalMembers,
      totalCollection,
      totalDue,
      collectionRate,
      paidMembersCount,
      dueMembersCount,
      thisMonthCollection
    };
  }, [ledgerData, payments]);

  // Top Payers
  const topPayers = useMemo(() => {
    return [...ledgerData]
      .filter(item => item.totalPaid > 0)
      .sort((a, b) => b.totalPaid - a.totalPaid)
      .slice(0, 5);
  }, [ledgerData]);

  // Chart data: collection per month vs active members
  const chartData = useMemo(() => {
    const activeMonthlyMemberIds = new Set(
      members
        .filter(member => member.includeInMonthlyLedger !== false)
        .map(member => member.id)
    );

    return monthsList.map(m => {
      const monthCode = `${selectedYear}-${m.numeric}`;
      const sum = payments
        .filter(p => p.month === monthCode && p.type === PaymentType.SUBSCRIPTION && activeMonthlyMemberIds.has(p.memberId))
        .reduce((s, p) => s + p.amount, 0);

      const checkMonthVal = parseInt(m.numeric, 10);
      const activeCount = members.filter(member => {
        if (member.status === MemberStatus.INACTIVE) return false;
        if (member.includeInMonthlyLedger === false) return false;
        
        const joinedDate = member.joinedDate ? new Date(member.joinedDate) : new Date(2020, 0, 1);
        const joinedYear = joinedDate.getFullYear();
        const joinedMonthIdx = joinedDate.getMonth() + 1; // 1-12
        const isJoined = selectedYear > joinedYear || (selectedYear === joinedYear && checkMonthVal >= joinedMonthIdx);
        
        return isJoined;
      }).length;

      return {
        name: isBn ? m.labelBn : m.labelEn,
        collection: sum,
        activeMembers: activeCount
      };
    });
  }, [payments, members, selectedYear, isBn, monthsList]);

  // Filtered ledger list
  const filteredLedger = useMemo(() => {
    return ledgerData.filter(item => {
      const nameMatch = item.member.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       (item.member.nameBn && item.member.nameBn.includes(searchQuery)) ||
                       item.member.memberId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       item.member.phone.includes(searchQuery);

      if (!nameMatch) return false;

      if (statusFilter === 'all') return true;
      if (statusFilter === 'paid') return item.overallStatus === 'paid';
      if (statusFilter === 'due') return item.overallStatus === 'due';
      if (statusFilter === 'partial') return item.overallStatus === 'partial';
      return true;
    });
  }, [ledgerData, searchQuery, statusFilter]);

  // Export CSV Excel
  const handleExportCSV = () => {
    const csvHeaders = [
      isBn ? 'ক্রমিক নং' : 'SL',
      isBn ? 'সদস্যের নাম' : 'Member Name',
      isBn ? 'সদস্য আইডি' : 'Member ID',
      ...monthsList.map(m => isBn ? m.labelBn : m.labelEn),
      isBn ? 'মোট জমা' : 'Total Paid',
      isBn ? 'মোট বকেয়া' : 'Total Due',
      isBn ? 'স্ট্যাটাস' : 'Status'
    ];

    const csvRows = filteredLedger.map((item, idx) => {
      const mTexts = monthsList.map(m => {
        const mon = item.months[m.numeric];
        if (mon.status === 'not_applicable') return '-';
        return mon.amount;
      });

      return [
        idx + 1,
        item.member.nameBn || item.member.name,
        item.member.memberId,
        ...mTexts,
        item.totalPaid,
        item.totalDue,
        item.overallStatus === 'paid' ? (isBn ? 'পরিশোধিত' : 'Paid') :
        item.overallStatus === 'partial' ? (isBn ? 'আংশিক' : 'Partial') :
        item.overallStatus === 'due' ? (isBn ? 'বকেয়া' : 'Due') : (isBn ? 'প্রযোজ্য নয়' : 'N/A')
      ];
    });

    // Handle Unicode with standard BOM prefix
    const csvContent = "\uFEFF" + [csvHeaders, ...csvRows].map(row => 
      row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
    ).join('\r\n');

    // Robust Download with standard and uri data fallbacks in sandboxed contexts
    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${isBn ? 'বাৎসরিক_মেম্বার_লেজার' : 'Yearly_Member_Ledger'}_${selectedYear}.csv`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 150);
    } catch (e) {
      console.warn("Standard Blob export blocked inside iframe, falling back to data URI...", e);
      try {
        const encodedUri = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${isBn ? 'বাৎসরিক_মেম্বার_লেজার' : 'Yearly_Member_Ledger'}_${selectedYear}.csv`);
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
        }, 150);
      } catch (err) {
        console.error("All file triggers blocked inside iframe layout:", err);
      }
    }

    // Always copy to clipboard as a secure, ultimate backup block!
    try {
      navigator.clipboard.writeText(csvContent).then(() => {
        alert(isBn 
          ? '📊 বাৎসরিক মেম্বার লেজার এক্সেল শীট ডাউনলোড আহ্বান করা হয়েছে!\n\n💡 (অতিরিক্ত সুরক্ষার্থে পুরো রিপোর্টের ডাটা আপনার ক্লিপবোর্ডে কপি করে রাখা হয়েছে। যদি আপনার ব্রাউজার সিকিউরিটি ডাউনলোড ব্লক করে অথবা ০ কেবি ফাইল ডাউনলোড হয়, তবে সরাসরি এক্সেল বা নোটপ্যাডে গিয়ে পেস্ট (Ctrl + V বা চাপ দিয়ে ধরে Paste) করলেই পুরো চমৎকার রিপোর্টটি পেয়ে যাবেন!)' 
          : '📊 Yearly member ledger Excel sheet download triggered!\n\n💡 (As an extra secure fallback, the complete report data has been copied to your clipboard. If your browser security blocks the file download or downloads an empty 0KB file, simply open Excel or Notepad and Paste (Ctrl + V) the clipboard content to view it instantly!)'
        );
      });
    } catch (clipErr) {
      console.warn("Clipboard access denied:", clipErr);
    }
  };

  // Modern Clean Printing
  const handlePrint = () => {
    const printContent = printAreaRef.current?.innerHTML || '';
    const win = window.open('', '', 'height=700,width=1000');
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>${isBn ? 'বাৎসরিক মেম্বার পেমেন্ট লেজার' : 'Yearly Member Payments Ledger'} - ${selectedYear}</title>
          <style>
            body { font-family: 'Inter', system-ui, sans-serif; padding: 20px; color: #1e293b; background-color: #fff; }
            h1 { text-align: center; font-size: 20px; margin-bottom: 2px; }
            h2 { text-align: center; font-size: 14px; color: #64748b; margin-top: 0; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: bold; }
            .badge { display: inline-block; padding: 2px 6px; font-size: 9px; font-weight: bold; border-radius: 4px; }
            .badge-paid { background-color: #dcfce7; color: #166534; }
            .badge-due { background-color: #fee2e2; color: #991b1b; }
            .badge-partial { background-color: #fef9c3; color: #854d0e; }
            .text-green { color: #166534; font-weight: bold; }
            .text-red { color: #991b1b; font-weight: bold; }
            .text-yellow { color: #854d0e; font-weight: bold; }
            .text-slate { color: #64748b; }
            .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px; }
            .card { border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; background: #fafafa; }
            .card-title { font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; font-weight: bold; }
            .card-val { font-size: 18px; font-weight: bold; color: #0f172a; }
            @media print {
              input, button, .no-print { display: none !important; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <h1>${isBn ? 'নাছিরেরটেক সমাজ কল্যাণ সংস্থা' : 'Nasirertech Society Welfare Organization'}</h1>
          <h2>${isBn ? `মেম্বার পেমেন্ট ও চাঁদা লেজার - বছর ${toBanglaDigits(selectedYear)}` : `Member Subscription Ledger - Year ${selectedYear}`}</h2>
          
          <div class="summary-cards">
            <div class="card">
              <div class="card-title">${isBn ? 'মোট সদস্য সংখ্যা' : 'TOTAL MEMBERS'}</div>
              <div class="card-val">${isBn ? toBanglaDigits(stats.totalMembers) : stats.totalMembers}</div>
            </div>
            <div class="card">
              <div class="card-title">${isBn ? 'মোট বাৎসরিক জমা' : 'TOTAL COLLECTION'}</div>
              <div class="card-val">৳ ${formatCurrency(stats.totalCollection, isBn)}</div>
            </div>
            <div class="card">
              <div class="card-title">${isBn ? 'মোট বছরভিত্তিক বকেয়া' : 'TOTAL DUE'}</div>
              <div class="card-val">৳ ${formatCurrency(stats.totalDue, isBn)}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>${isBn ? 'SL' : 'SL'}</th>
                <th>${isBn ? 'মেম্বার বিবরণ' : 'Member Detail'}</th>
                ${monthsList.map(m => `<th>${isBn ? m.labelBn : m.labelEn}</th>`).join('')}
                <th>${isBn ? 'মোট জমা' : 'Total'}</th>
                <th>${isBn ? 'অবস্থা' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              ${filteredLedger.map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>
                    <strong>${item.member.nameBn || item.member.name}</strong><br/>
                    <small style="color:#64748b">${item.member.memberId}</small>
                  </td>
                  ${monthsList.map(m => {
                    const mon = item.months[m.numeric];
                    if (mon.status === 'not_applicable') return `<td class="text-slate">-</td>`;
                    if (mon.status === 'paid') return `<td class="text-green">${mon.amount}</td>`;
                    if (mon.status === 'partial') return `<td class="text-yellow">${mon.amount}</td>`;
                    return `<td class="text-red">0</td>`;
                  }).join('')}
                  <td><strong>৳ ${formatCurrency(item.totalPaid, isBn)}</strong></td>
                  <td>
                    ${item.overallStatus === 'paid' ? `<span class="badge badge-paid">${isBn ? 'পরিশোধিত' : 'Paid'}</span>` : ''}
                    ${item.overallStatus === 'partial' ? `<span class="badge badge-partial">${isBn ? 'আংশিক' : 'Partial'}</span>` : ''}
                    ${item.overallStatus === 'due' ? `<span class="badge badge-due">${isBn ? 'বকেয়া' : 'Due'}</span>` : ''}
                    ${item.overallStatus === 'not_applicable' ? `<span class="badge" style="background:#f1f5f9;color:#475569">${isBn ? 'প্রযোজ্য নয়' : 'N/A'}</span>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div style="margin-top: 50px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b;">
            <div>${isBn ? 'রিপোর্ট তৈরির তারিখ:' : 'Generated At:'} ${toBanglaDigits(new Date().toLocaleDateString('bn-BD'))}</div>
            <div>${isBn ? 'স্বাক্ষর ও মোহর' : 'Authorized Signature & Seal'} _________________________</div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 450);
  };

  // WhatsApp Share text exporter helper
  const handleShareWhatsApp = () => {
    const summaryText = isBn 
      ? `🌿 *নাছিরেরটেক সমাজ কল্যাণ সংস্থা* 🌿\n📅 *বাৎসরিক লেজার রিপোর্ট - ${toBanglaDigits(selectedYear)}*\n\n👥 মোট সদস্য: ${toBanglaDigits(stats.totalMembers)} জন\n💰 মোট জমা: ৳ ${formatCurrency(stats.totalCollection, true)}\n🔴 মোট বকেয়া: ৳ ${formatCurrency(stats.totalDue, true)}\n📈 আদায় হার: ${toBanglaDigits(stats.collectionRate.toFixed(2))}%\n\nচেক করুন এবং নিয়মিত সমাজসেবায় অবদান রাখুন। ধন্যবাদ ❤️`
      : `🌿 *Nasirertech Welfare Organization* 🌿\n📅 *Yearly Ledger Report - ${selectedYear}*\n\n👥 Total Members: ${stats.totalMembers}\n💰 Collected Amount: ৳ ${formatCurrency(stats.totalCollection, false)}\n🔴 Unpaid/Due: ৳ ${formatCurrency(stats.totalDue, false)}\n📈 Collection Rate: ${stats.collectionRate.toFixed(2)}%\n\nVerify and support our community missions regularly. Thank you ❤️`;

    const encodedText = encodeURIComponent(summaryText);
    window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank');
  };

  // Function to save the full ledger sheet as a beautiful, high-quality image
  const handleSaveAsImage = async () => {
    const element = ledgerTableRef.current;
    if (!element) {
      alert(isBn ? 'লেজার টেবিল খুঁজে পাওয়া যায়নি।' : 'Ledger table element not found.');
      return;
    }

    try {
      setIsGeneratingImage(true);

      // Clone the element to render a pristine version offscreen without any layout constraints
      const clone = element.cloneNode(true) as HTMLDivElement;
      
      // Clear responsive hiding wrappers and styling, add clean padding and rich background/borders
      clone.className = "bg-[#020b06] border-2 border-emerald-900 rounded-3xl overflow-hidden p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)] text-slate-200";
      clone.style.position = 'fixed';
      clone.style.top = '0';
      clone.style.left = '0';
      clone.style.zIndex = '-9999';
      clone.style.width = '1450px'; // Give plenty of landscape width to prevent horizontal column squeeze
      clone.style.maxWidth = 'none';
      clone.style.opacity = '1';
      clone.style.pointerEvents = 'none';

      // Find any element with hidden property/class matching buttons or switchers and hide them from the image
      const searchAndSelectors = clone.querySelector('.flex.flex-col.sm\\:flex-row');
      if (searchAndSelectors) {
        (searchAndSelectors as HTMLElement).style.display = 'none';
      }

      // Ensure that overflow horizontal is fully visible so html2canvas captures all months column headers
      const scrollBox = clone.querySelector('.overflow-x-auto');
      if (scrollBox) {
        (scrollBox as HTMLElement).style.overflow = 'visible';
        (scrollBox as HTMLElement).style.width = '100%';
        (scrollBox as HTMLElement).className = "w-full";
      }

      // Add a clean official title label inside the captured image
      const headerDiv = document.createElement('div');
      headerDiv.style.marginBottom = '24px';
      headerDiv.style.paddingBottom = '20px';
      headerDiv.style.borderBottom = '1px solid rgba(16,185,129,0.2)';
      headerDiv.style.display = 'flex';
      headerDiv.style.alignItems = 'center';
      headerDiv.style.justifyContent = 'space-between';
      headerDiv.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      
      headerDiv.innerHTML = `
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 28px;">🌿</span>
            <h2 style="font-size: 24px; font-weight: 900; color: #ffffff; margin: 0;">
              ${isBn ? 'নাছিরেরটেক সমাজ কল্যাণ সংস্থা' : 'Nasirertech Society Welfare Organization'}
            </h2>
          </div>
          <p style="font-size: 13px; font-weight: bold; color: #10b981; margin: 6px 0 0 0; font-family: monospace; letter-spacing: 1px;">
            ${isBn ? `বাৎসরিক মেম্বার চাঁদা ও পেমেন্ট লেজার - বছর ${toBanglaDigits(selectedYear)}` : `Annual Member Contribution Ledger - Year ${selectedYear}`}
          </p>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 11px; font-weight: 800; color: #fbbf24; background-color: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.25); padding: 5px 12px; border-radius: 8px; display: inline-block;">
            ${isBn ? 'অফিসিয়াল রিপোর্ট স্টেটমেন্ট' : 'OFFICIAL STATEMENT'}
          </span>
          <p style="font-size: 10px; color: #94a3b8; margin: 8px 0 0 0; font-family: monospace;">
            ${isBn ? 'সংগ্রহের হার:' : 'Collection Rate:'} ${isBn ? toBanglaDigits(stats.collectionRate.toFixed(2)) : stats.collectionRate.toFixed(2)}% | 
            ${isBn ? 'সদস্য:' : 'Members:'} ${isBn ? toBanglaDigits(stats.totalMembers) : stats.totalMembers}
          </p>
        </div>
      `;
      clone.insertBefore(headerDiv, clone.firstChild);

      document.body.appendChild(clone);

      // Brief delay to trigger proper layout pass inside clone
      await new Promise((resolve) => setTimeout(resolve, 100));

      const canvas = await html2canvas(clone, {
        backgroundColor: '#020b06',
        scale: 2, // 2x device pixel ratio for crystal clear image
        useCORS: true,
        logging: false,
        width: 1450, // Force complete table width inside canvas (resolves mobile clipping!)
        windowWidth: 1450, // Force window width to render fully as landscape
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          // Fix oklch and oklab color parsing crash in html2canvas (e.g. from Tailwind v4)
          const win = clonedDoc.defaultView;
          if (win) {
            // Hook CSSStyleDeclaration prototype
            if (win.CSSStyleDeclaration && win.CSSStyleDeclaration.prototype) {
              const originalGetPropertyValue = win.CSSStyleDeclaration.prototype.getPropertyValue;
              win.CSSStyleDeclaration.prototype.getPropertyValue = function(prop) {
                const val = originalGetPropertyValue.call(this, prop);
                return cleanCssText(val);
              };
            }

            const originalGetComputedStyle = win.getComputedStyle;
            win.getComputedStyle = function(el, pseudoElt) {
              const styles = originalGetComputedStyle.call(win, el, pseudoElt);
              return new Proxy(styles, {
                get(target, prop) {
                  if (prop === 'getPropertyValue') {
                    return function(propertyName: string) {
                      const val = target.getPropertyValue(propertyName);
                      return cleanCssText(val);
                    };
                  }
                  const val = Reflect.get(target, prop);
                  if (typeof val === 'string') {
                    return cleanCssText(val);
                  }
                  if (typeof val === 'function') {
                    return val.bind(target);
                  }
                  return val;
                }
              });
            };
          }

          // Replace oklch/oklab/color-mix inside embedded style tags to prevent parsing crash
          clonedDoc.querySelectorAll('style').forEach(styleTag => {
            if (styleTag.textContent) {
              styleTag.textContent = cleanCssText(styleTag.textContent);
            }
          });

          // Also clean up inline styles
          clonedDoc.querySelectorAll('[style]').forEach(el => {
            const styleAttr = el.getAttribute('style');
            if (styleAttr) {
              el.setAttribute('style', cleanCssText(styleAttr));
            }
          });

          // Process and replace linked stylesheets to resolve oklab/oklch parser crashes in compiled Tailwind files
          clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            try {
              const sheet = (link as any).sheet as CSSStyleSheet | null;
              if (sheet) {
                let cssText = '';
                const rules = sheet.cssRules || sheet.rules;
                if (rules) {
                  for (let i = 0; i < rules.length; i++) {
                    cssText += rules[i].cssText + '\n';
                  }
                  const newStyle = clonedDoc.createElement('style');
                  newStyle.textContent = cleanCssText(cssText);
                  link.parentNode?.insertBefore(newStyle, link);
                  link.parentNode?.removeChild(link);
                }
              }
            } catch (e) {
              console.warn('Could not process external stylesheet:', e);
            }
          });
        }
      });

      document.body.removeChild(clone);

      // Process and trigger instant download
      const dataUrl = canvas.toDataURL('image/png');
      const filename = `${isBn ? 'বাৎসরিক_লেজার_শিট' : 'Yearly_Ledger_Sheet'}_${selectedYear}.png`;
      
      try {
        const downloadLink = document.createElement('a');
        downloadLink.download = filename;
        downloadLink.href = dataUrl;
        downloadLink.target = '_blank';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        setTimeout(() => {
          document.body.removeChild(downloadLink);
        }, 150);
      } catch (err) {
        console.warn("Direct navigation download failed, falling back to overlay previews", err);
      }

      // Always show our stunning custom visual preview modal!
      setDownloadImageSrc(dataUrl);
      setDownloadImageName(filename);
    } catch (error) {
      console.error('Error rendering ledger table to image:', error);
      alert(isBn ? 'দুঃখিত, ছবিটি তৈরি করার সময়ে কোনো বিঘ্ন ঘটেছে।' : 'Failed to save ledger as an image. Please try again.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Function to save a single member's annual records as a beautiful digital statement card
  const handleSaveMemberStatementImage = async (item: any) => {
    const memberId = item.member.id;
    setIsGeneratingMemberImg(prev => ({ ...prev, [memberId]: true }));

    try {
      // Create beautifully styled staging container in the viewport layout region (Zero mobile cut-offs)
      const card = document.createElement('div');
      card.style.position = 'fixed';
      card.style.top = '0';
      card.style.left = '0';
      card.style.zIndex = '-9999';
      card.style.width = '480px'; 
      card.style.boxSizing = 'border-box';
      card.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      card.style.color = '#1e293b'; // High-contrast slate-800 text
      card.style.backgroundColor = '#fcfdfc'; // Pristine ivory-white paper background for optimal readability
      card.style.border = '5px solid #064e3b'; // Royal deep forest green border frame
      card.style.borderRadius = '16px';
      card.style.padding = '24px';
      card.style.boxShadow = '0 25px 50px -12px rgba(0,0,0,0.3)';
      
      // Inset luxury gold/bronze decorative line to make it look like an official certificate
      const innerBorder = document.createElement('div');
      innerBorder.style.position = 'absolute';
      innerBorder.style.top = '6px';
      innerBorder.style.left = '6px';
      innerBorder.style.right = '6px';
      innerBorder.style.bottom = '6px';
      innerBorder.style.border = '1px dashed #d97706'; // Gold accent
      innerBorder.style.borderRadius = '11px';
      innerBorder.style.pointerEvents = 'none';
      card.appendChild(innerBorder);

      const contentWrapper = document.createElement('div');
      contentWrapper.style.position = 'relative';
      contentWrapper.style.zIndex = '1';

      const memberName = isBn ? (item.member.nameBn || item.member.name) : item.member.name;
      const totalPaidStr = formatCurrency(item.totalPaid, isBn);
      const totalDueStr = formatCurrency(item.totalDue, isBn);
      
      const totalExpected = item.totalPaid + item.totalDue;
      const progressPercent = totalExpected > 0 ? Math.round((item.totalPaid / totalExpected) * 100) : 100;
      const progressPercentBn = toBanglaDigits(progressPercent);

      const sealOrLogoUrl = settings?.officialSealURL || settings?.logoURL || '/nswo-logo.png';
      const logoMarkup = `<img src="${getImageUrl(sealOrLogoUrl)}" style="width: 44px; height: 44px; object-fit: contain; border-radius: 50%; border: 2px solid #064e3b; background-color: #ffffff;" crossorigin="anonymous" referrerPolicy="no-referrer" />`;

      const headerHtml = `
        <div style="text-align: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 14px; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 8px;">
            ${logoMarkup}
            <span style="font-size: 17px; font-weight: 900; color: #064e3b; letter-spacing: -0.3px;">${isBn ? 'নাছিরেরটেক সমাজ কল্যাণ সংস্থা' : 'Nasirertech Society Welfare Org.'}</span>
          </div>
          <div style="font-size: 10px; font-weight: 850; color: #b45309; background-color: #fef3c7; border: 1px solid #fde68a; display: inline-block; padding: 4.5px 14px; border-radius: 99px; text-transform: uppercase;">
            ${isBn ? `বাৎসরিক চাঁদা ও পেমেন্ট বিবরণী - বছর ${toBanglaDigits(selectedYear)}` : `Annual Subscription Statement - Year ${selectedYear}`}
          </div>
        </div>
      `;

      let photoHtml = '';
      if (item.member.photoURL) {
        photoHtml = `<img src="${getImageUrl(item.member.photoURL)}" style="width: 68px; height: 76px; border-radius: 12px; object-fit: cover; border: 2.5px solid #064e3b; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);" crossorigin="anonymous" referrerPolicy="no-referrer" />`;
      } else {
        photoHtml = `<div style="width: 68px; height: 76px; border-radius: 12px; background-color: #f1f5f9; border: 2.5px dashed #94a3b8; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; color: #475569;">${item.member.name.slice(0, 2).toUpperCase()}</div>`;
      }

      const isVIP = item.member.memberId.toLowerCase().includes('vip') || 
                    (item.member.designation && item.member.designation.toLowerCase().includes('vip'));

      const profileHtml = `
        <div style="display: flex; align-items: center; gap: 14px; background-color: #f8fafc; border: 1.5px solid #e2e8f0; padding: 12px 14px; border-radius: 12px; margin-bottom: 16px;">
          ${photoHtml}
          <div style="flex: 1; min-w: 0; text-align: left;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <h4 style="font-size: 15px; font-weight: 950; color: #0f172a; margin: 0;">${memberName}</h4>
              ${isVIP ? `<span style="font-size: 8.5px; font-weight: 900; background-color: #f59e0b; color: #ffffff; padding: 1.5px 5px; border-radius: 4px; text-transform: uppercase;">VIP</span>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; gap: 3.5px;">
              <span style="font-size: 11px; color: #475569; font-weight: 700;">🤝 সদস্য আইডি: <span style="font-family: monospace; font-weight: 850; color: #064e3b;">${item.member.memberId}</span></span>
              ${item.member.phone ? `<span style="font-size: 11px; color: #475569; font-weight: 700;">📞 মোবাইল নং: <span style="font-family: monospace; font-weight: 850; color: #0f172a;">${item.member.phone}</span></span>` : ''}
            </div>
          </div>
        </div>
      `;

      // Compose monthly grid boxes stably using Flexbox floating boxes with percentages to bypass CSS Grid html2canvas bugs
      let monthsGridHtml = `<div style="display: block; width: 100%; margin-bottom: 12px; clear: both; overflow: hidden;">`;
      monthsList.forEach((m, idx) => {
        const mon = item.months[m.numeric];
        let bgColor = '#f8fafc';
        let borderColor = '#cbd5e1';
        let textColor = '#475569';
        let statusText = isBn ? 'বকেয়া' : 'Due';
        let iconHtml = '🔴';
        
        if (mon.status === 'paid') {
          bgColor = '#ecfdf5'; // emerald 50
          borderColor = '#a7f3d0';
          textColor = '#047857'; // high contrast green
          statusText = `৳${isBn ? toBanglaDigits(mon.amount) : mon.amount}`;
          iconHtml = '🟢';
        } else if (mon.status === 'partial') {
          bgColor = '#fffbeb'; // amber 50
          borderColor = '#fde68a';
          textColor = '#b45309';
          statusText = `৳${isBn ? toBanglaDigits(mon.amount) : mon.amount}`;
          iconHtml = '🟡';
        } else if (mon.status === 'due') {
          bgColor = '#fff5f5'; // rose/red 50
          borderColor = '#fecaca';
          textColor = '#dc2626';
          statusText = isBn ? 'বকেয়া' : 'Due';
          iconHtml = '🔴';
        } else if (mon.status === 'not_applicable') {
          bgColor = '#f1f5f9';
          borderColor = '#cbd5e1';
          textColor = '#475569';
          statusText = isBn ? '✖ প্রযোজ্য নয়' : 'N/A';
          iconHtml = '⚪';
        }

        monthsGridHtml += `
          <div style="width: 31.3%; margin: 1%; box-sizing: border-box; display: inline-block; vertical-align: top; background-color: ${bgColor}; border: 1.5px solid ${borderColor}; border-radius: 9px; padding: 8px 3px; text-align: center; min-height: 52px; font-family: inherit;">
            <div style="font-size: 9.5px; font-weight: 900; color: #334155; margin-bottom: 2.5px;">${isBn ? m.labelBn : m.labelEn}</div>
            <div style="font-size: 10.5px; font-weight: 950; color: ${textColor}; display: flex; align-items: center; justify-content: center; gap: 2px;">
              <span style="font-size: 8.5px;">${iconHtml}</span> ${statusText}
            </div>
          </div>
        `;
      });
      monthsGridHtml += `</div>`;

      // Stunning Unique Visual Progress Indicator of Membership Complete
      const progressMeterHtml = `
        <div style="margin: 16px 0; background-color: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 10px 14px; text-align: left; box-sizing: border-box;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-weight: 900; font-size: 11px; color: #334155;">
            <span>📈 চাঁদা পরিশোধের অগ্রগতি (Payment Progress)</span>
            <span style="color: #047857; font-weight: 900; font-size: 12.5px;">${progressPercentBn}%</span>
          </div>
          <div style="background-color: #e2e8f0; height: 10px; border-radius: 99px; overflow: hidden; display: flex; width: 100%;">
            <div style="background-color: #047857; width: ${progressPercent}%; height: 100%; border-radius: 99px;"></div>
          </div>
        </div>
      `;

      // Aggregate statistics block
      const aggregateHtml = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; box-sizing: border-box;">
          <div style="flex: 1; text-align: center; background-color: #ecfdf5; border: 2px solid #a7f3d0; padding: 10px; border-radius: 12px; box-sizing: border-box;">
            <p style="font-size: 10.5px; font-weight: 850; color: #047857; margin: 0 0 3px 0;">💰 ${isBn ? 'মোট পরিশোধিত' : 'Total Paid'}</p>
            <p style="font-size: 17px; font-weight: 950; color: #047857; margin: 0; font-family: system-ui;">৳ ${totalPaidStr}</p>
          </div>
          <div style="flex: 1; text-align: center; background-color: ${item.totalDue > 0 ? '#fff5f5' : '#ecfdf5'}; border: 2px solid ${item.totalDue > 0 ? '#fecaca' : '#a7f3d0'}; padding: 10px; border-radius: 12px; box-sizing: border-box;">
            <p style="font-size: 10.5px; font-weight: 850; color: ${item.totalDue > 0 ? '#b91c1c' : '#047857'}; margin: 0 0 3px 0;">🔴 ${isBn ? 'মোট বকেয়া পরিমাণ' : 'Total Due'}</p>
            <p style="font-size: 17px; font-weight: 950; color: ${item.totalDue > 0 ? '#b91c1c' : '#047857'}; margin: 0; font-family: system-ui;">৳ ${totalDueStr}</p>
          </div>
        </div>
      `;

      // Verified digital footer with official seal stamp
      const footerHtml = `
        <div style="border-top: 2px dashed #cbd5e1; padding-top: 12px; display: flex; align-items: center; font-size: 9px; color: #475569; box-sizing: border-box;">
          <div style="text-align: left;">
            <p style="margin: 0; font-weight: 850; color: #064e3b; font-size: 10px;">✔ অফিসিয়াল বিবরণী যাচাইকৃত</p>
            <p style="margin: 3px 0 0 0; font-weight: bold; color: #64748b;">${isBn ? 'প্রিন্ট তারিখ:' : 'Generated date:'} ${toBanglaDigits(new Date().toLocaleDateString('bn-BD'))}</p>
          </div>
          <div style="margin-left: auto; text-align: right; display: flex; align-items: center; justify-content: flex-end;">
            ${settings?.officialSealURL ? `
              <img src="${getImageUrl(settings.officialSealURL)}" style="width: 52px; height: 52px; object-fit: contain; transform: rotate(-6deg); margin-right: 4px; border-radius: 4px;" crossorigin="anonymous" referrerPolicy="no-referrer" />
            ` : `<span style="font-size: 22px; filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.15));">🌿</span>`}
          </div>
        </div>
      `;

      contentWrapper.innerHTML = `${headerHtml}${profileHtml}${monthsGridHtml}${progressMeterHtml}${aggregateHtml}${footerHtml}`;
      card.appendChild(contentWrapper);
      document.body.appendChild(card);

      // Brief layout buffer
      await new Promise(resolve => setTimeout(resolve, 150));

      const canvas = await html2canvas(card, {
        backgroundColor: '#fcfdfc',
        scale: 2.5, // Crisp high pixel density for beautiful sharing quality
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: 480, // Force portrait statement container width (no mobile resizing or scaling cutoff!)
        windowWidth: 480, // Force window width to render fully at exact resolution
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          // Fix oklch and oklab color parsing crash in html2canvas (e.g. from Tailwind v4)
          const win = clonedDoc.defaultView;
          if (win) {
            // Hook CSSStyleDeclaration prototype
            if (win.CSSStyleDeclaration && win.CSSStyleDeclaration.prototype) {
              const originalGetPropertyValue = win.CSSStyleDeclaration.prototype.getPropertyValue;
              win.CSSStyleDeclaration.prototype.getPropertyValue = function(prop) {
                const val = originalGetPropertyValue.call(this, prop);
                return cleanCssText(val);
              };
            }

            const originalGetComputedStyle = win.getComputedStyle;
            win.getComputedStyle = function(el, pseudoElt) {
              const styles = originalGetComputedStyle.call(win, el, pseudoElt);
              return new Proxy(styles, {
                get(target, prop) {
                  if (prop === 'getPropertyValue') {
                    return function(propertyName: string) {
                      const val = target.getPropertyValue(propertyName);
                      return cleanCssText(val);
                    };
                  }
                  const val = Reflect.get(target, prop);
                  if (typeof val === 'string') {
                    return cleanCssText(val);
                  }
                  if (typeof val === 'function') {
                    return val.bind(target);
                  }
                  return val;
                }
              });
            };
          }

          // Replace oklch/oklab/color-mix inside embedded style tags to prevent parsing crash
          clonedDoc.querySelectorAll('style').forEach(styleTag => {
            if (styleTag.textContent) {
              styleTag.textContent = cleanCssText(styleTag.textContent);
            }
          });

          // Also clean up inline styles
          clonedDoc.querySelectorAll('[style]').forEach(el => {
            const styleAttr = el.getAttribute('style');
            if (styleAttr) {
              el.setAttribute('style', cleanCssText(styleAttr));
            }
          });

          // Process and replace linked stylesheets to resolve oklab/oklch parser crashes in compiled Tailwind files
          clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            try {
              const sheet = (link as any).sheet as CSSStyleSheet | null;
              if (sheet) {
                let cssText = '';
                const rules = sheet.cssRules || sheet.rules;
                if (rules) {
                  for (let i = 0; i < rules.length; i++) {
                    cssText += rules[i].cssText + '\n';
                  }
                  const newStyle = clonedDoc.createElement('style');
                  newStyle.textContent = cleanCssText(cssText);
                  link.parentNode?.insertBefore(newStyle, link);
                  link.parentNode?.removeChild(link);
                }
              }
            } catch (e) {
              console.warn('Could not process external stylesheet:', e);
            }
          });
        }
      });

      document.body.removeChild(card);

      // Save output file download trigger
      const dataUrl = canvas.toDataURL('image/png');
      const filename = `${item.member.name}_চাঁদা_স্টেটমেন্ট_${selectedYear}.png`.replace(/\s+/g, '_');
      
      try {
        const downloadLink = document.createElement('a');
        downloadLink.download = filename;
        downloadLink.href = dataUrl;
        downloadLink.target = '_blank';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        setTimeout(() => {
          document.body.removeChild(downloadLink);
        }, 150);
      } catch (err) {
        console.warn("Direct direct download failed, showing modal fallback preview:", err);
      }

      // Always show our stunning custom visual preview modal!
      setDownloadImageSrc(dataUrl);
      setDownloadImageName(filename);
    } catch (error) {
      console.error('Error generating individual statement card as image:', error);
      alert(isBn ? 'দুঃখিত, সদস্যের ছবি বিবরণী তৈরি করা সম্ভব হয়নি।' : 'Failed to save statement image.');
    } finally {
      setIsGeneratingMemberImg(prev => ({ ...prev, [memberId]: false }));
    }
  };

  if (membersLoading || paymentsLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[500px]">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-amber-400 font-bold animate-pulse">লেজার কলাম লোড করা হচ্ছে...</p>
      </div>
    );
  }

  const isLightColor = (hex?: string) => {
    if (!hex) return false;
    const c = hex.replace('#', '');
    if (c.length !== 6) return false;
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 170;
  };
  const isLight = isLightColor(settings.themeColor);

  return (
    <div className="space-y-6">
      {/* Top action header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 id="yearly-ledger-title" className={`text-2xl lg:text-3xl font-black ${isLight ? 'text-slate-900 font-extrabold' : 'text-white'} tracking-tight flex items-center gap-3`}>
             <span>📅</span>
             {isBn ? `মাসিক চাঁদা (লেজার) - ${toBanglaDigits(selectedYear)}` : `Monthly Subscription Ledger - ${selectedYear}`}
          </h1>
          <p className={`${isLight ? 'text-slate-600' : 'text-slate-400'} text-xs mt-1.5 font-medium`}>
            {isBn ? 'সদস্যদের ১২ মাসের মাসিক চাঁদা এবং সর্বমোট হিসাব এক পাতায় তদারকি করুন' : 'Monitor all 12 monthly payments, subscription statuses, and aggregate totals in a single panel'}
          </p>
        </div>

        {/* Filters and export settings */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Year Select */}
          <div className="relative">
            <select
              id="year-select-dropdown"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="appearance-none bg-emerald-950/40 border border-emerald-800/60 rounded-xl px-4 py-2.5 pr-10 text-white text-xs font-bold focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
            >
              {availableYears.map(y => (
                <option key={y} value={y} className="bg-slate-950 text-white">
                  {isBn ? `${toBanglaDigits(y)} সাল` : `Year ${y}`}
                </option>
              ))}
            </select>
            <Calendar className="absolute right-3.5 top-1/2 -translate-y-1/2 text-amber-500 pointer-events-none" size={14} />
          </div>

          {/* Export button dropdown-like or single buttons */}
          <button
            id="excel-export-btn"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-400 hover:text-emerald-300 border border-emerald-800/40 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all"
            title={isBn ? 'এক্সেল ফাইলে এক্সপোর্ট করুন' : 'Export to Excel File'}
          >
            <FileSpreadsheet size={15} />
            <span>{isBn ? 'এক্সপোর্ট' : 'Export'}</span>
          </button>

          <button
            id="print-ledger-btn"
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-sky-950/50 hover:bg-sky-900/75 text-sky-400 hover:text-sky-300 border border-sky-900/55 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all"
            title={isBn ? 'লেজার শিট প্রিন্ট করুন' : 'Print Ledger sheet'}
          >
            <Printer size={15} />
            <span>{isBn ? 'প্রিন্ট / PDF' : 'Print / PDF'}</span>
          </button>

          <button
            id="wa-share-btn"
            onClick={handleShareWhatsApp}
            className="flex items-center gap-1.5 bg-green-950/50 hover:bg-green-900/75 text-green-400 hover:text-green-300 border border-green-900/55 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all"
            title={isBn ? 'হোয়াটসঅ্যাপে শেয়ার করুন' : 'Share on WhatsApp'}
          >
            <Share2 size={15} />
            <span>{isBn ? 'হোয়াটসঅ্যাপ' : 'Share'}</span>
          </button>

          <button
            id="image-export-btn"
            disabled={isGeneratingImage}
            onClick={handleSaveAsImage}
            className="flex items-center gap-1.5 bg-amber-950/55 hover:bg-amber-900/75 text-amber-500 hover:text-amber-400 border border-amber-900/55 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:pointer-events-none"
            title={isBn ? 'বাৎসরিক লেজার শিট ইমেজ হিসেবে সেভ করুন' : 'Save full ledger sheet as PNG Image'}
          >
            {isGeneratingImage ? (
              <RefreshCw size={15} className="animate-spin text-amber-500" />
            ) : (
              <Image size={15} />
            )}
            <span>{isGeneratingImage ? (isBn ? 'তৈরি হচ্ছে...' : 'Generating...') : (isBn ? 'ছবি ডাউনলোড' : 'Save Image')}</span>
          </button>
        </div>
      </div>

      {/* Dynamic 6-Card Bento Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Card 1: All Members */}
        <div className={`p-4 rounded-3xl border transition-all duration-300 flex items-center gap-3 ${
          isLight 
            ? 'bg-white border-slate-100 shadow-sm text-slate-800 hover:shadow-md' 
            : 'bg-[#03150d] border-emerald-900/20 text-slate-100'
        }`}>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
            <Users size={18} />
          </div>
          <div className="leading-tight min-w-0">
            <p className={`text-[10px] uppercase font-bold tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {isBn ? 'সর্বমোট সদস্য' : 'Total Members'}
            </p>
            <p className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {isBn ? `${toBanglaDigits(stats.totalMembers)} জন` : `${stats.totalMembers} Members`}
            </p>
            <p className="text-[9px] text-slate-400 mt-0.5 font-medium">{isBn ? 'সকল সদস্য সংখ্যা' : 'All members list'}</p>
          </div>
        </div>

        {/* Card 2: Paying Members */}
        <div className={`p-4 rounded-3xl border transition-all duration-300 flex items-center gap-3 ${
          isLight 
            ? 'bg-white border-slate-100 shadow-sm text-slate-800 hover:shadow-md' 
            : 'bg-[#03150d] border-emerald-900/20 text-slate-100'
        }`}>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
            <UserCheck size={18} />
          </div>
          <div className="leading-tight min-w-0">
            <p className={`text-[10px] uppercase font-bold tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {isBn ? 'মাসিক চাঁদা প্রদান করছে' : 'Paying Subscription'}
            </p>
            <p className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {isBn ? `${toBanglaDigits(stats.paidMembersCount)} জন` : `${stats.paidMembersCount} Active`}
            </p>
            <p className="text-[9px] text-[#10b981] mt-0.5 font-black">{isBn ? 'সক্রিয় সদস্য' : 'Active Members'}</p>
          </div>
        </div>

        {/* Card 3: Due Members */}
        <div className={`p-4 rounded-3xl border transition-all duration-300 flex items-center gap-3 ${
          isLight 
            ? 'bg-white border-slate-100 shadow-sm text-slate-800 hover:shadow-md' 
            : 'bg-[#03150d] border-emerald-900/20 text-slate-100'
        }`}>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
            <UserMinus size={18} />
          </div>
          <div className="leading-tight min-w-0">
            <p className={`text-[10px] uppercase font-bold tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {isBn ? 'বকেয়া সদস্য' : 'Overdue Members'}
            </p>
            <p className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {isBn ? `${toBanglaDigits(stats.dueMembersCount)} জন` : `${stats.dueMembersCount} Overdue`}
            </p>
            <p className="text-[9px] text-rose-500 mt-0.5 font-black">{isBn ? 'বকেয়া সদস্য' : 'Due Members'}</p>
          </div>
        </div>

        {/* Card 4: Total Due */}
        <div className={`p-4 rounded-3xl border transition-all duration-300 flex items-center gap-3 ${
          isLight 
            ? 'bg-white border-slate-100 shadow-sm text-slate-800 hover:shadow-md' 
            : 'bg-[#03150d] border-emerald-900/20 text-slate-100'
        }`}>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
            <span className="font-extrabold text-sm">৳</span>
          </div>
          <div className="leading-tight min-w-0">
            <p className={`text-[10px] uppercase font-bold tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {isBn ? 'মোট বকেয়া টাকা' : 'Total Overdue'}
            </p>
            <p className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
              ৳ {formatCurrency(stats.totalDue, isBn)}
            </p>
            <p className="text-[9px] text-slate-400 mt-0.5 font-medium">{isBn ? 'সকলের মোট বকেয়া' : 'Grand Total Due'}</p>
          </div>
        </div>

        {/* Card 5: This Month Revenue */}
        <div className={`p-4 rounded-3xl border transition-all duration-300 flex items-center gap-3 ${
          isLight 
            ? 'bg-white border-slate-100 shadow-sm text-slate-800 hover:shadow-md' 
            : 'bg-[#03150d] border-emerald-900/20 text-slate-100'
        }`}>
          <div className="w-10 h-10 rounded-xl bg-[#10b981]/10 flex items-center justify-center text-[#10b981] shrink-0">
            <TrendingUp size={18} />
          </div>
          <div className="leading-tight min-w-0">
            <p className={`text-[10px] uppercase font-bold tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {isBn ? 'এই মাসের আয়' : 'This Month Collection'}
            </p>
            <p className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
              ৳ {formatCurrency(stats.thisMonthCollection, isBn)}
            </p>
            <p className="text-[9px] text-[#10b981] mt-0.5 font-black">{isBn ? 'মোট আয়' : 'Target Income'}</p>
          </div>
        </div>

        {/* Card 6: Report Download Button */}
        <button
          onClick={handlePrint}
          className={`p-4 rounded-3xl border text-left transition-all duration-300 flex items-center gap-3 cursor-pointer group hover:scale-[1.02] ${
            isLight 
              ? 'bg-blue-50/50 hover:bg-blue-50 border-blue-100 shadow-sm text-slate-800' 
              : 'bg-[#031c11] hover:bg-emerald-900/20 border-emerald-800/20 text-slate-100'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0 group-hover:bg-blue-500 group-hover:text-white transition-all">
            <Download size={18} />
          </div>
          <div className="leading-tight min-w-0">
            <p className={`text-[10px] uppercase font-bold tracking-wider ${isLight ? 'text-blue-600' : 'text-emerald-400'}`}>
              {isBn ? 'রিপোর্ট ডাউনলোড' : 'Download Report'}
            </p>
            <p className={`text-xs font-black ${isLight ? 'text-slate-800' : 'text-white'}`}>
              {isBn ? `${monthsList[new Date().getMonth()].labelBn} / পিডিএফ` : 'PDF Document'}
            </p>
          </div>
        </button>
      </div>

      {/* Grid Layout: Left ledger table spreadsheet & Right widget details */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* Statistics and Widgets Column for responsive screens */}
        <div className="xl:col-span-1 space-y-6 order-last xl:order-first">
          
          {/* Year Summary Card */}
          <div className={`${
            isLight 
              ? 'bg-white border border-slate-200 text-slate-800' 
              : 'bg-gradient-to-br from-[#0c2417] to-[#040f0a] border border-[#d97706]/20 text-white'
          } rounded-3xl p-5 shadow-xl space-y-4`}>
            <h3 className={`text-sm font-black ${isLight ? 'text-slate-850 border-b border-slate-100 pb-2' : 'text-amber-400 border-b border-emerald-950/60 pb-3'} tracking-wider uppercase flex items-center justify-between`}>
              <span>📊 {isBn ? `${toBanglaDigits(selectedYear)} সালের সমীকরণ` : `Year ${selectedYear} Stats`}</span>
              <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2.5 py-0.5 rounded-md font-bold uppercase">LIVE</span>
            </h3>

            <div className="grid grid-cols-1 gap-3">
              {/* Stat Card 1 */}
              <div className={`border rounded-2xl p-3.5 flex items-center justify-between ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-black/20 border border-emerald-950/70 text-white'
              }`}>
                <div className="space-y-1">
                  <p className={`text-[10px] uppercase tracking-widest ${isLight ? 'text-slate-500' : 'text-slate-400'} font-bold`}>{isBn ? 'মোট সদস্য সংখ্যা' : 'TOTAL MEMBERS'}</p>
                  <p className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>{isBn ? toBanglaDigits(stats.totalMembers) : stats.totalMembers}</p>
                </div>
                <div className={`w-10 h-10 ${isLight ? 'bg-amber-100/30 border-amber-500/10 text-amber-600' : 'bg-emerald-900/35 border-emerald-800/40 text-emerald-400'} border rounded-xl flex items-center justify-center font-black text-lg`}>
                  <Users size={18} />
                </div>
              </div>

              {/* Stat Card 2 */}
              <div className={`border rounded-2xl p-3.5 flex items-center justify-between ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-black/20 border border-[#10b981]/15 text-white'
              }`}>
                <div className="space-y-1">
                  <p className={`text-[10px] uppercase tracking-widest ${isLight ? 'text-emerald-700' : 'text-[#10b981]'} font-bold`}>{isBn ? 'মোট সংগৃহীত চাঁদা' : 'TOTAL COLLECTION'}</p>
                  <p className="text-xl font-black text-emerald-500">৳ {formatCurrency(stats.totalCollection, isBn)}</p>
                </div>
                <div className={`w-10 h-10 ${isLight ? 'bg-emerald-100/40 border-emerald-500/10 text-emerald-600' : 'bg-emerald-900/35 border-emerald-800/40 text-emerald-400'} border rounded-xl flex items-center justify-center`}>
                  <span>৳</span>
                </div>
              </div>

              {/* Stat Card 3 */}
              <div className={`border rounded-2xl p-3.5 flex items-center justify-between ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-black/20 border border-rose-500/15 text-white'
              }`}>
                <div className="space-y-1">
                  <p className={`text-[10px] uppercase tracking-widest ${isLight ? 'text-rose-600' : 'text-rose-400'} font-bold`}>{isBn ? 'মোট বকেয়া পরিমাণ' : 'TOTAL DUE_AMOUNT'}</p>
                  <p className="text-xl font-black text-rose-500">৳ {formatCurrency(stats.totalDue, isBn)}</p>
                </div>
                <div className={`w-10 h-10 ${isLight ? 'bg-rose-100/30 border-rose-500/10 text-rose-600' : 'bg-rose-950/20 border-rose-900/30 text-rose-400'} border rounded-xl flex items-center justify-center`}>
                  <AlertTriangle size={17} />
                </div>
              </div>
            </div>

            {/* Collection Percentage Rate Radial */}
            <div className={`border rounded-2xl p-4 flex items-center gap-4 ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-black/30 border border-emerald-950/80 text-white'
            }`}>
              <div className="relative shrink-0 flex items-center justify-center">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="26"
                    stroke={isLight ? '#e2e8f0' : '#101a14'}
                    strokeWidth="5"
                    fill="transparent"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="26"
                    stroke="#10b981"
                    strokeWidth="5"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 26}
                    strokeDashoffset={2 * Math.PI * 26 * (1 - Math.min(100, Math.max(0, stats.collectionRate)) / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute text-[11px] font-black text-emerald-500">
                  {toBanglaDigits(stats.collectionRate.toFixed(1))}%
                </div>
              </div>
              <div className="leading-tight">
                <p className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-white'} uppercase tracking-wide`}>{isBn ? 'আদায়ের সার্থকতা হার' : 'Collection Rate'}</p>
                <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'} mt-1`}>
                  {isBn ? 'মোট ধার্যকৃত চাঁদার ভিত্তিতে আদায় শতকরা হার হিসাব করা হয়েছে' : 'Percentage calculation of current subscription target vs paid records.'}
                </p>
              </div>
            </div>
          </div>

          {/* Monthly Subscription Line/Area chart overview */}
          <div className={`${
            isLight 
              ? 'bg-white border border-slate-200 text-slate-800' 
              : 'bg-[#03150d] border border-emerald-900/20 text-white'
          } rounded-3xl p-4 shadow-xl`}>
            <h3 className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-slate-300'} uppercase tracking-wider mb-4 flex items-center justify-between`}>
              <span>📈 {isBn ? 'মাসভিত্তিক আদায়ের গ্রাফ' : 'Monthly Collection Overview'}</span>
              <span className={`text-[9px] font-mono ${isLight ? 'text-emerald-700 font-extrabold' : 'text-emerald-500 font-black'}`}>{selectedYear}</span>
            </h3>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCollection" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={isLight ? '#f1f5f9' : '#092215'} strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke={isLight ? '#64748b' : '#64748b'} fontSize={9} tickLine={false} />
                  <YAxis stroke={isLight ? '#64748b' : '#64748b'} fontSize={9} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: isLight ? '#ffffff' : '#020b06', 
                      borderColor: isLight ? '#cbd5e1' : '#10b981', 
                      borderRadius: '12px' 
                    }}
                    labelStyle={{ color: isLight ? '#475569' : '#94a3b8', fontWeight: 'bold', fontSize: '11px' }}
                    itemStyle={{ color: '#10b981', fontSize: '11px', fontWeight: 'black' }}
                  />
                  <Area type="monotone" dataKey="collection" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCollection)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Payers list Widget */}
          <div className={`${
            isLight 
              ? 'bg-white border border-slate-200 text-slate-800' 
              : 'bg-[#03150d] border border-emerald-900/20 text-white'
          } rounded-3xl p-5 shadow-xl space-y-4`}>
            <h3 className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-slate-300'} uppercase tracking-widest border-b ${isLight ? 'border-slate-100' : 'border-emerald-950'} pb-2.5 flex items-center justify-between`}>
              <span>🏆 {isBn ? 'শীর্ষ দাতাগণ' : 'Top Payers'}</span>
              <span className="text-[10px] text-amber-500 font-bold">{isBn ? 'চলতি বছর' : 'Current Year'}</span>
            </h3>
            {topPayers.length === 0 ? (
              <p className="text-slate-500 text-center text-xs py-3">{isBn ? 'কোনো ডাটা পাওয়া যায়নি।' : 'No data records found.'}</p>
            ) : (
              <div className="space-y-3">
                {topPayers.map((item, index) => (
                  <div key={item.member.id} className={`flex items-center justify-between p-2.5 rounded-xl ${
                    isLight 
                      ? 'bg-slate-50 border border-slate-100 hover:bg-slate-100/60' 
                      : 'bg-black/15 border border-emerald-950 hover:bg-emerald-950/20'
                  } transition-colors border`}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-6.5 h-6.5 font-bold text-xs shrink-0 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500">
                        {isBn ? toBanglaDigits(index + 1) : index + 1}
                      </div>
                      <div className="leading-tight">
                        <p className={`text-xs font-bold ${isLight ? 'text-slate-850' : 'text-slate-100'} truncate max-w-[120px]`}>
                          {item.member.nameBn || item.member.name}
                        </p>
                        <p className={`text-[9px] ${isLight ? 'text-slate-450' : 'text-slate-400'}`}>{item.member.memberId}</p>
                      </div>
                    </div>
                    <div className="text-xs font-black text-emerald-500 bg-emerald-500/10 border border-emerald-800/10 px-2.5 py-1 rounded-lg">
                      ৳ {formatCurrency(item.totalPaid, isBn)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Shortcuts Actions */}
          <div className={`${
            isLight 
              ? 'bg-white border border-slate-200 text-slate-800' 
              : 'bg-[#03150d] border border-emerald-900/20 text-white'
          } rounded-3xl p-5 shadow-xl space-y-3.5`}>
            <h4 className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-slate-300'} uppercase tracking-wider`}>{isBn ? 'কুইক অ্যাকশন' : 'Quick Actions'}</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setActiveTab && setActiveTab('members')}
                className={`p-3 border rounded-xl transition-all text-center flex flex-col items-center gap-1.5 focus:outline-none ${
                  isLight 
                    ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-850' 
                    : 'bg-emerald-950/30 border border-emerald-900/40 hover:bg-emerald-900/30 text-white'
                }`}
              >
                <UserPlus size={16} className={isLight ? 'text-emerald-600' : 'text-slate-200'} />
                <span className={`text-[10px] font-extrabold ${isLight ? 'text-slate-800' : 'text-white'}`}>{isBn ? 'সদস্য যোগ করুন' : 'Add Member'}</span>
              </button>

              <button
                onClick={() => setActiveTab && setActiveTab('payments')}
                className={`p-3 border rounded-xl transition-all text-center flex flex-col items-center gap-1.5 focus:outline-none ${
                  isLight 
                    ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-850' 
                    : 'bg-emerald-950/30 border border-emerald-900/40 hover:bg-emerald-900/30 text-white'
                }`}
              >
                <PlusCircle size={16} className="text-amber-500" />
                <span className={`text-[10px] font-extrabold ${isLight ? 'text-slate-800' : 'text-white'}`}>{isBn ? 'পেমেন্ট এন্ট্রি' : 'Add Receipt'}</span>
              </button>

              <button
                onClick={() => setActiveTab && setActiveTab('expenses')}
                className={`p-3 border rounded-xl transition-all text-center flex flex-col items-center gap-1.5 focus:outline-none ${
                  isLight 
                    ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-850' 
                    : 'bg-emerald-950/30 border border-emerald-900/40 hover:bg-emerald-900/30 text-white'
                }`}
              >
                <DollarSign size={16} className="text-rose-500" />
                <span className={`text-[10px] font-extrabold ${isLight ? 'text-slate-800' : 'text-white'}`}>{isBn ? 'খরচ হিসাব' : 'Add Expense'}</span>
              </button>

              <button
                onClick={() => setActiveTab && setActiveTab('google-sheets')}
                className={`p-3 border rounded-xl transition-all text-center flex flex-col items-center gap-1.5 focus:outline-none ${
                  isLight 
                    ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-850' 
                    : 'bg-emerald-950/30 border border-emerald-900/40 hover:bg-emerald-900/30 text-white'
                }`}
              >
                <FileSpreadsheet size={16} className="text-[#10b981]" />
                <span className={`text-[10px] font-extrabold ${isLight ? 'text-slate-800' : 'text-white'}`}>{isBn ? 'গুগল শিট সিঙ্ক' : 'Sheet Sync'}</span>
              </button>
            </div>
          </div>

        </div>

        {/* Ledger grid system main body (Spreadsheet layout) */}
        <div className="xl:col-span-3 space-y-4">
          
          {/* Filtration Header inside Ledger body */}
          <div className={`${
            isLight 
              ? 'bg-white border border-slate-200 text-slate-800' 
              : 'bg-gradient-to-r from-[#031c11] to-[#010906] border border-emerald-900/30'
          } rounded-3xl p-4 shadow-md flex flex-col md:flex-row items-center justify-between gap-3`}>
            
            {/* Search inputs */}
            <div className="relative w-full md:w-80">
              <input
                id="ledger-search-input"
                type="text"
                placeholder={isBn ? 'মেম্বার নাম, আইডি বা মোবাইল খুঁজুন...' : 'Search name, custom ID or phone...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full border rounded-2xl py-2.5 pl-10 pr-4 text-xs tracking-wide focus:outline-none transition-colors ${
                  isLight 
                    ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-emerald-500' 
                    : 'bg-black/30 border border-emerald-900/60 text-white placeholder-slate-500 focus:border-amber-400'
                }`}
              />
              <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-400' : 'text-emerald-500'}`} size={14} />
            </div>

            {/* Filter and View mode segments */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full md:w-auto">
              <div className="flex items-center gap-1 flex-wrap">
                <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'} font-black uppercase tracking-wider mr-2 hidden md:inline`}>
                  {isBn ? 'ফিল্টার:' : 'Filter:'}
                </span>
                {[
                  { id: 'all', labelBn: 'সব সদস্য', labelEn: 'All Member' },
                  { id: 'paid', labelBn: 'পরিশোধিত', labelEn: 'Paid Only' },
                  { id: 'due', labelBn: 'সব বকেয়া', labelEn: 'Due Only' },
                  { id: 'partial', labelBn: 'আংশিক', labelEn: 'Partial Only' }
                ].map((grp) => (
                  <button
                    key={grp.id}
                    onClick={() => setStatusFilter(grp.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all border cursor-pointer ${
                      statusFilter === grp.id 
                        ? 'bg-amber-500 text-slate-950 border-amber-400/30 font-extrabold shadow-sm' 
                        : (isLight 
                            ? 'bg-slate-100 text-slate-600 border-slate-200/60 hover:bg-slate-200/50 hover:text-slate-800' 
                            : 'bg-black/10 text-slate-400 border-emerald-900/40 hover:text-slate-200')
                    }`}
                  >
                    {isBn ? grp.labelBn : grp.labelEn}
                  </button>
                ))}
              </div>

              {/* View switcher */}
              <div className={`flex items-center gap-1 p-1 rounded-xl shrink-0 border ${
                isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-black/40 border-emerald-900/40'
              }`}>
                <span className={`text-[9px] ${isLight ? 'text-slate-500' : 'text-slate-400'} font-extrabold uppercase mr-1.5 ml-1 hidden sm:inline`}>{isBn ? 'ভিউ:' : 'View:'}</span>
                {[
                  { id: 'auto', labelBn: 'অটো', labelEn: 'Auto' },
                  { id: 'table', labelBn: 'টেবিল', labelEn: 'Table' },
                  { id: 'cards', labelBn: 'কার্ড', labelEn: 'Cards' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setViewMode(opt.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-wide uppercase transition-all cursor-pointer ${
                      viewMode === opt.id 
                        ? 'bg-emerald-500 text-[#020b06] font-extrabold shadow-sm' 
                        : (isLight ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-300')
                    }`}
                  >
                    {isBn ? opt.labelBn : opt.labelEn}
                  </button>
                ))}
              </div>

              {/* Edit Mode Toggle */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsLedgerEditable(!isLedgerEditable)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold tracking-wide uppercase transition-all flex items-center gap-1.5 border shrink-0 cursor-pointer ${
                    isLedgerEditable 
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-lg shadow-amber-500/10' 
                      : (isLight 
                          ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 hover:text-emerald-700 border border-emerald-500/20' 
                          : 'bg-[#10b981]/15 hover:bg-[#10b981]/25 text-[#10b981] hover:text-white border border-[#10b981]/30')
                  }`}
                  title={isBn ? (isLedgerEditable ? 'এডিট মোড বন্ধ করুন' : 'চাঁদা এডিট করুন') : (isLedgerEditable ? 'Lock edits' : 'Edit subscriptions')}
                >
                  <Edit2 size={11} className={`stroke-[2.5] ${isLedgerEditable ? 'animate-pulse' : ''}`} />
                  <span>{isBn ? (isLedgerEditable ? 'লক করুন' : 'এডিট করুন') : (isLedgerEditable ? 'Lock' : 'Edit')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Edit Mode Guide Banner */}
          {isAdmin && isLedgerEditable && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-2.5 px-4 flex items-center justify-between text-amber-400 text-xs font-bold leading-normal animate-fade-in shadow-sm">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <p>
                  {isBn 
                    ? 'এডিট মোড সক্রিয়! এখন সরাসরি যেকোনো মাসের ঘরের উপর ক্লিক করে টাকা এডিট করতে পারবেন।' 
                    : 'Edit mode active! Click directly on any month amount grid cell to update.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLedgerEditable(false)}
                className="text-[9px] bg-amber-500 text-slate-950 px-2.5 py-1 rounded-lg font-extrabold hover:bg-amber-450 transition-colors uppercase cursor-pointer"
              >
                {isBn ? 'লক' : 'Lock'}
              </button>
            </div>
          )}

          {/* Comparative Bar Chart: Subscription Collections vs Active Members per Month */}
          <div className={`${
            isLight 
              ? 'bg-white border-slate-200 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.06),0_10px_30px_-10px_rgba(0,0,0,0.03)] text-slate-800' 
              : 'bg-gradient-to-br from-[#031c11] to-[#010906] border border-emerald-900/30'
          } border rounded-3xl p-5 shadow-xl space-y-4`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2">
              <div>
                <h3 className={`text-sm font-black tracking-wider uppercase flex items-center gap-2 ${
                  isLight ? 'text-emerald-700' : 'text-amber-400'
                }`}>
                  <span>📊 {isBn ? `${toBanglaDigits(selectedYear)} সালের মাসিক চাঁদা আদায় বনাম সদস্য তুলনা` : `Monthly Collections vs. Active Members for ${selectedYear}`}</span>
                </h3>
                <p className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isBn 
                    ? 'প্রতি মাসের মোট চাঁদা সংগ্রহ এবং উক্ত মাসে সক্রিয় থাকা মোট সদস্য সংখ্যার তুলনামূলক গ্রাফ চিত্র।' 
                    : 'Comparison between the total raw subscriptions fetched and active members status for each month.'}
                </p>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold">
                <div className="flex items-center gap-1.5 font-sans">
                  <span className="w-3 h-3 rounded-md bg-[#10b981]"></span>
                  <span className={isLight ? 'text-slate-600' : 'text-slate-300'}>{isBn ? 'সংগ্রহ (৳)' : 'Collections (৳)'}</span>
                </div>
                <div className="flex items-center gap-1.5 font-sans">
                  <span className="w-3 h-3 rounded-md bg-[#fbbf24]"></span>
                  <span className={isLight ? 'text-slate-600' : 'text-slate-300'}>{isBn ? 'সক্রিয় সদস্য' : 'Active Members'}</span>
                </div>
              </div>
            </div>

            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid stroke={isLight ? '#f1f5f9' : '#092215'} strokeDasharray="3 3" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke={isLight ? '#64748b' : '#94a3b8'} 
                    fontSize={10} 
                    tickLine={false}
                    axisLine={{ stroke: isLight ? '#f1f5f9' : '#092215' }}
                  />
                  <YAxis 
                    yAxisId="left" 
                    stroke={isLight ? '#059669' : '#10b981'} 
                    fontSize={10} 
                    tickLine={false}
                    axisLine={{ stroke: isLight ? '#f1f5f9' : '#092215' }}
                    tickFormatter={(value) => `৳${value}`}
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    stroke={isLight ? '#d97706' : '#fbbf24'} 
                    fontSize={10} 
                    tickLine={false}
                    axisLine={{ stroke: isLight ? '#f1f5f9' : '#092215' }}
                  />
                  <Tooltip 
                    cursor={{ fill: isLight ? 'rgba(0, 0, 0, 0.02)' : 'rgba(16, 185, 129, 0.05)' }}
                    contentStyle={{ 
                      backgroundColor: isLight ? '#ffffff' : '#020b06', 
                      borderColor: isLight ? '#cbd5e1' : '#10b981', 
                      borderRadius: '14px', 
                      padding: '10px' 
                    }}
                    labelStyle={{ color: isLight ? '#334155' : '#94a3b8', fontWeight: 'bold', fontSize: '11px', marginBottom: '4px' }}
                    formatter={(value: any, name: any, props: any) => {
                      if (props.yAxisId === "left") {
                        return [`৳${Number(value).toLocaleString()}`, isBn ? 'মোট চাঁদা সংগ্রহ' : 'Total Collection'];
                      }
                      return [isBn ? `${toBanglaDigits(value)} জন` : `${value} Members`, isBn ? 'সক্রিয় সদস্য সংখ্যা' : 'Active Members Count'];
                    }}
                  />
                  <Bar 
                    yAxisId="left" 
                    dataKey="collection" 
                    fill="#10b981" 
                    radius={[4, 4, 0, 0]} 
                    maxBarSize={20} 
                  />
                  <Bar 
                    yAxisId="right" 
                    dataKey="activeMembers" 
                    fill="#fbbf24" 
                    radius={[4, 4, 0, 0]} 
                    maxBarSize={20} 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* DESKTOP SPREADSHEET TABLE CARD */}
          <div ref={ledgerTableRef} className={`${
            viewMode === 'cards' ? 'hidden' : 'block'
          } ${
            isLight 
              ? 'bg-white border-slate-200 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.06),0_10px_30px_-10px_rgba(0,0,0,0.03)] hover:shadow-[0_24px_60px_-10px_rgba(0,0,0,0.09),0_12px_40px_-12px_rgba(0,0,0,0.04)]' 
              : 'bg-[#020b06] border-emerald-900/25 shadow-2xl'
          } border rounded-3xl overflow-hidden transition-all duration-300`}>
            <div className="overflow-x-auto w-full no-scrollbar">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className={`${
                    isLight 
                      ? 'bg-slate-50 text-slate-700 border-slate-200' 
                      : 'bg-[#031d10] text-[#ccd] border-[#d97706]/15 hover:bg-emerald-950/20'
                  } border-b font-extrabold tracking-wide uppercase`}>
                    <th className="py-4.5 px-2 font-black text-center w-14 min-w-[56px] max-w-[64px]">{isBn ? 'ক্রমিক' : 'SL'}</th>
                    <th className="py-4.5 pl-1 pr-4 font-black min-w-[210px]">{isBn ? 'সদস্যের নাম' : "Member Name"}</th>
                    <th className="py-4.5 px-3 font-black text-center min-w-[125px] hidden md:table-cell">{isBn ? 'মোবাইল নম্বর' : 'Mobile Number'}</th>
                    {monthsList.map(m => (
                      <th key={m.numeric} className="py-4.5 px-2.5 text-center font-black min-w-[55px]">
                        {isBn ? m.labelBn : m.labelEn}
                      </th>
                    ))}
                    <th className={`py-4.5 px-3 font-black text-right min-w-[95px] ${isLight ? 'text-emerald-700 border-x border-slate-200' : 'text-emerald-400 border-x border-emerald-900/15'}`}>{isBn ? 'মোট জমা' : 'Total Paid'}</th>
                    <th className={`py-4.5 px-3 font-black text-right min-w-[95px] ${isLight ? 'text-rose-600 border-x border-slate-200' : 'text-rose-450 border-x border-emerald-900/15'}`}>{isBn ? 'বাকি' : 'Total Due'}</th>
                    <th className="py-4.5 px-4 font-black text-center min-w-[105px]">{isBn ? 'অবস্থা' : 'Status'}</th>
                    <th className="py-4.5 px-4 font-black text-center min-w-[100px]">{isBn ? 'অ্যাকশন' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-[#d97706]/10'}`}>
                  {filteredLedger.length === 0 ? (
                    <tr>
                      <td colSpan={19} className="text-center py-20 text-slate-500">
                        <p className="text-sm font-bold">{isBn ? 'কোনো তথ্য পাওয়া যায়নি!' : 'No matching members ledger records found.'}</p>
                        <p className="text-xs text-slate-600 mt-1">{isBn ? 'দয়া করে সার্চ কিওয়ার্ড চেক করুন বা পরিবর্তন করুন।' : 'Please verify spelling/member details or change page filters.'}</p>
                      </td>
                    </tr>
                  ) : (
                    filteredLedger.map((item, idx) => {
                      const isVIP = item.member.memberId.toLowerCase().includes('vip') || 
                                    (item.member.designation && item.member.designation.toLowerCase().includes('vip'));
                      return (
                        <tr key={item.member.id} className={`${isLight ? 'hover:bg-slate-50' : 'hover:bg-emerald-950/15'} group transition-colors`}>
                          {/* SL Column */}
                          <td className={`py-3 px-2 font-bold ${isLight ? 'text-slate-500 group-hover:text-emerald-600' : 'text-slate-400 group-hover:text-white'} transition-colors text-center w-14 min-w-[56px] max-w-[64px]`}>
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="select-none leading-none text-xs">
                                {isBn ? toBanglaDigits(idx + 1) : idx + 1}
                              </span>
                              {isAdmin && (
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ml-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveMember(item.member.id, 'up');
                                    }}
                                    disabled={idx === 0}
                                    className={`p-1 rounded border text-[9px] cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed transition-all ${
                                      isLight 
                                        ? 'bg-slate-100 hover:bg-emerald-500 hover:text-white border-slate-200 text-slate-700' 
                                        : 'bg-[#031d10] hover:bg-emerald-500 hover:text-[#020b06] border-emerald-800/40 text-[#10b981]'
                                    }`}
                                    title={isBn ? "উপরে নিন" : "Move Up"}
                                  >
                                    ▲
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveMember(item.member.id, 'down');
                                    }}
                                    disabled={idx === filteredLedger.length - 1}
                                    className={`p-1 rounded border text-[9px] cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed transition-all ${
                                      isLight 
                                        ? 'bg-slate-100 hover:bg-emerald-500 hover:text-white border-slate-200 text-slate-700' 
                                        : 'bg-[#031d10] hover:bg-emerald-500 hover:text-[#020b06] border-emerald-800/40 text-[#10b981]'
                                    }`}
                                    title={isBn ? "নিচে নিন" : "Move Down"}
                                  >
                                    ▼
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Member info Column */}
                          <td className="py-3 pl-1 pr-4 min-w-[210px]">
                            <div className="flex items-center gap-3">
                              {/* circular photo container with white border */}
                              <div className={`relative shrink-0 w-8.5 h-8.5 rounded-full overflow-hidden border-2 ${isLight ? 'border-slate-200' : 'border-white/20'} shadow-sm`}>
                                {item.member.photoURL ? (
                                  <img src={getImageUrl(item.member.photoURL)} alt="" className="w-full h-full object-cover" referrerPolicy="referrer" />
                                ) : (
                                  <div className={`w-full h-full flex items-center justify-center text-[10px] font-black uppercase ${
                                    isLight ? 'bg-slate-100 text-amber-600' : 'bg-emerald-900/40 text-amber-400'
                                  }`}>
                                    {item.member.name.slice(0, 2)}
                                  </div>
                                )}
                              </div>
                              <div className="leading-tight">
                                <h4 className={`font-extrabold ${isLight ? 'text-slate-800' : 'text-slate-100'} group-hover:text-emerald-500 transition-colors text-xs`}>
                                  {isBn ? (item.member.nameBn || item.member.name) : item.member.name}
                                </h4>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className={`text-[9.5px] ${isLight ? 'text-slate-500' : 'text-slate-400'} font-mono font-bold`}>
                                    ID: {item.member.memberId}
                                  </span>
                                  {isVIP && (
                                    <span className="inline-flex items-center px-1.5 py-0.2 text-[8px] font-black leading-none bg-purple-500/15 border border-purple-500/30 text-purple-400 rounded-md">
                                      VIP
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          
                          {/* Mobile Number Column (hidden on mobile phones but shown on md+) */}
                          <td className="py-3 px-3 text-center hidden md:table-cell">
                            <span className={`font-mono text-[11.5px] font-black ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                              {item.member.phone ? (isBn ? toBanglaDigits(item.member.phone) : item.member.phone) : (isBn ? 'নেই' : 'None')}
                            </span>
                          </td>
                          
                          {/* 12 Months payment columns */}
                          {monthsList.map(m => {
                            const mon = item.months[m.numeric];
                            const isClickable = isAdmin && isLedgerEditable;
                            const tdClasses = `py-3 px-1 text-center transition-all ${
                              isClickable 
                                ? `cursor-pointer hover:bg-amber-500/10 hover:shadow-inner ${isLight ? 'bg-amber-500/[0.01]' : 'bg-amber-500/[0.03]'} ring-1 ring-inset ring-amber-500/15` 
                                : 'select-none'
                            }`;
                            
                            const handleClick = () => {
                              if (isClickable) {
                                handleEditCell(item.member, m, mon.amount);
                              }
                            };

                            if (mon.status === 'paid' || mon.status === 'partial') {
                              return (
                                <td 
                                  key={m.numeric} 
                                  className={tdClasses} 
                                  onClick={handleClick}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handleDoubleClickCell(item.member, m, mon.amount);
                                  }}
                                  title={isBn ? 'ডাবল-ক্লিক করে রশিদ দেখুন / চাঁদার পরিমাণ পরিবর্তন করুন' : 'Double click to view receipt / Click to edit amount'}
                                >
                                  <div className={`inline-flex items-center justify-center font-black tracking-tight px-2 py-1 rounded-md text-[10.5px] min-w-[48px] transition-all group-hover/cell:scale-105 shadow-xs ${
                                    isLight 
                                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-600' 
                                      : 'bg-emerald-500/10 border border-emerald-500/25 text-[#10b981]'
                                  }`}>
                                    {isBn ? toBanglaDigits(mon.amount) : mon.amount}
                                  </div>
                                </td>
                              );
                            } else if (mon.status === 'due') {
                              return (
                                <td 
                                  key={m.numeric} 
                                  className={tdClasses} 
                                  onClick={handleClick}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handleDoubleClickCell(item.member, m, mon.amount);
                                  }}
                                  title={isBn ? 'ডাবল-ক্লিক করে রশিদ দেখুন / চাঁদার পরিমাণ নির্ধারণ করুন' : 'Double click to view receipt / Click to establish amount'}
                                >
                                  <span className={`text-[11px] font-bold ${isLight ? 'text-slate-400' : 'text-slate-500/70'} group-hover/cell:text-emerald-500 group-hover/cell:font-extrabold transition-all`}>
                                    {isBn ? toBanglaDigits(0) : 0}
                                  </span>
                                </td>
                              );
                            } else {
                              return (
                                <td 
                                  key={m.numeric} 
                                  className={tdClasses} 
                                  onClick={handleClick}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handleDoubleClickCell(item.member, m, mon.amount);
                                  }}
                                  title={isBn ? 'ডাবল-ক্লিক করে রশিদ দেখুন' : 'Double click to view receipt'}
                                >
                                  <span className={`text-[11px] font-bold ${isLight ? 'text-slate-300' : 'text-slate-600/50'} group-hover/cell:text-emerald-500 group-hover/cell:font-extrabold transition-all`}>
                                    -
                                  </span>
                                </td>
                              );
                            }
                          })}

                          {/* Total Paid Column */}
                          <td className="py-3 px-3 text-right border-x border-emerald-900/10">
                            <span className="font-extrabold text-[#10b981] text-[12.5px] font-mono whitespace-nowrap">
                              ৳ {formatCurrency(item.totalPaid, isBn)}
                            </span>
                          </td>

                          {/* Total Due Column */}
                          <td className="py-3 px-3 text-right border-x border-emerald-900/10">
                            <span className="font-extrabold text-rose-450 text-[12.5px] font-mono whitespace-nowrap">
                              ৳ {formatCurrency(item.totalDue, isBn)}
                            </span>
                          </td>

                          {/* Status Badge */}
                          <td className="py-3 px-4 text-center">
                            {item.overallStatus === 'paid' && (
                              <span className="inline-flex items-center text-[10px] font-bold bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981] px-2 py-0.5 rounded-lg whitespace-nowrap leading-none">
                                {isBn ? 'আদায় হয়েছে' : 'Fully Paid'}
                              </span>
                            )}
                            {item.overallStatus === 'partial' && (
                              <span className="inline-flex items-center text-[10px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-0.5 rounded-lg whitespace-nowrap leading-none">
                                {isBn ? 'আংশিক আদায়' : 'Partial Paid'}
                              </span>
                            )}
                            {item.overallStatus === 'due' && (
                              <span className="inline-flex items-center text-[10px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-450 px-2 py-0.5 rounded-lg whitespace-nowrap leading-none">
                                {isBn ? 'বাকি আছে' : 'Due'}
                              </span>
                            )}
                            {item.overallStatus === 'not_applicable' && (
                              <span className="inline-flex items-center text-[10px] font-bold bg-slate-800/40 border border-slate-700/30 text-slate-400 px-2 py-0.5 rounded-lg whitespace-nowrap leading-none">
                                {isBn ? 'প্রযোজ্য নয়' : 'N/A'}
                              </span>
                            )}
                          </td>

                          {/* Action Column */}
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setViewingMember(item.member)}
                                className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/25 text-blue-400 hover:text-blue-300 border border-blue-500/20 transition-all cursor-pointer shadow-xs"
                                title={isBn ? 'সদস্যের প্রোফাইল দেখুন' : 'View member profile'}
                              >
                                <Eye size={12} className="stroke-[2.5]" />
                              </button>

                              <button
                                onClick={() => handleSaveMemberStatementImage(item)}
                                disabled={isGeneratingMemberImg[item.member.id]}
                                className="p-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-450 hover:text-emerald-300 border border-emerald-950/45 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                                title={isBn ? 'চাঁদা বিবরণী ছবি হিসেবে সেভ করুন' : 'Save member statement image'}
                              >
                                {isGeneratingMemberImg[item.member.id] ? (
                                  <RefreshCw size={11} className="animate-spin text-amber-500" />
                                ) : (
                                  <Download size={11} />
                                )}
                              </button>

                              {isAdmin && (
                                <button
                                  onClick={() => handleOpenBulkEdit(item)}
                                  className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/25 text-amber-500 hover:text-amber-400 border border-amber-500/20 transition-all cursor-pointer shadow-xs"
                                  title={isBn ? 'পুরা বছরের চাঁদা একসাথে এডিট করুন' : 'Edit entire year collection'}
                                >
                                  <Edit2 size={11} className="stroke-[2.5]" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Smart color explanation row */}
            <div className={`${
              isLight ? 'bg-slate-50 border-t border-slate-100 text-slate-500' : 'bg-[#03150d] border-t border-emerald-900/30 text-slate-400'
            } p-4.5 text-[10px] font-bold flex flex-col sm:flex-row items-center justify-between gap-3`}>
              <div className="flex items-center gap-4 flex-wrap">
                <span className={`${isLight ? 'text-slate-500' : 'text-slate-400'} uppercase tracking-widest`}>{isBn ? 'রং কোড নির্দেশিকা:' : 'Status Colors:'}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></span>
                  <span className={isLight ? 'text-slate-800' : 'text-slate-200'}>{isBn ? 'পরিশোধিত (Paid)' : 'Paid'}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span className={isLight ? 'text-slate-800' : 'text-slate-200'}>{isBn ? 'আংশিক (Partial)' : 'Partial'}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  <span className={isLight ? 'text-slate-800' : 'text-slate-200'}>{isBn ? 'বকেয়া (Due)' : 'Due'}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600" style={{backgroundColor: '#4b5563'}}></span>
                  <span className={isLight ? 'text-slate-600' : 'text-slate-305'}>{isBn ? 'প্রযোজ্য নয় (Not Applicable)' : 'Not Active'}</span>
                </span>
              </div>

              <div className={`${isLight ? 'text-slate-800' : 'text-slate-100'} uppercase tracking-wider font-extrabold text-[11px] shrink-0`}>
                {isBn ? 'বাৎসরিক মোট চাঁদা সংগ্রহ:' : 'Grand Total Collection:'}{' '}
                <span className={isLight ? 'text-emerald-600 font-black' : 'text-emerald-400 font-black'}>৳ {formatCurrency(stats.totalCollection, isBn)}</span>
              </div>
            </div>
          </div>

          {/* MOBILE RESPONSIVE ACCORDION CARDS CARD */}
          <div className={`${
            viewMode === 'cards' ? 'block' : 'hidden'
          } space-y-3.5`}>
            {filteredLedger.length === 0 ? (
              <div className="bg-[#020b06] border border-emerald-900/25 rounded-3xl p-10 text-center text-slate-500">
                <p className="text-sm font-bold">{isBn ? 'কোনো তথ্য পাওয়া যায়নি!' : 'No matching members ledger records found.'}</p>
              </div>
            ) : (
              filteredLedger.map((item, idx) => {
                const isExpanded = expandedMemberId === item.member.id;
                
                // Calculate status counts
                const monthsArray = Object.values(item.months) as Array<{ amount: number; status: string }>;
                const paidCount = monthsArray.filter(m => m.status === 'paid').length;
                const partialCount = monthsArray.filter(m => m.status === 'partial').length;
                const dueCount = monthsArray.filter(m => m.status === 'due').length;

                return (
                  <div 
                    key={item.member.id} 
                    className="backdrop-blur-xl bg-slate-950/45 border-t border-l border-emerald-400/35 border-b-2 border-r border-black/85 rounded-[1.25rem] sm:rounded-[2rem] overflow-hidden transition-all duration-300 shadow-[0_15px_30px_-5px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.12)] relative group hover:scale-[1.01] hover:-translate-y-0.5 active:scale-[0.99]"
                  >
                    {/* iOS Specular diagonal sheen and real 3D light reflection highlights */}
                    <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none z-10" />
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.01] via-transparent to-white/[0.03] pointer-events-none" />
                    
                    {/* Glowing brand-colored nodes floating inside back layers */}
                    <div className="absolute -right-8 -bottom-8 w-20 h-20 rounded-full blur-2xl opacity-40 bg-emerald-500/10 pointer-events-none transition-all duration-500 group-hover:scale-150" />
                    <div className="absolute -left-8 -top-8 w-20 h-20 rounded-full blur-2xl opacity-20 bg-emerald-500/10 pointer-events-none transition-all duration-500 group-hover:scale-150" />

                    {/* Collapsible Card Header Bar */}
                    <div 
                      onClick={() => setExpandedMemberId(isExpanded ? null : item.member.id)}
                      className="p-3 xs:p-4.5 flex flex-row items-center justify-between gap-2.5 xs:gap-4.5 cursor-pointer hover:bg-emerald-950/15 active:bg-emerald-950/25 transition-all select-none border-b border-white/[0.03] relative z-10 bg-gradient-to-b from-white/[0.02] to-transparent"
                    >
                      {/* Left: Avatar + Details */}
                      <div className="flex items-center gap-2.5 xs:gap-3.5 min-w-0 flex-1">
                        {isAdmin && (
                          <div className="flex flex-col gap-1 shrink-0 bg-emerald-950/50 p-1 rounded-lg border border-emerald-900/40">
                            <button
                              onClick={(e) => {
                                  e.stopPropagation();
                                  moveMember(item.member.id, 'up');
                                }}
                              disabled={idx === 0}
                              className="p-1 rounded hover:bg-emerald-800/40 active:bg-emerald-500 active:text-[#020b06] text-[10px] cursor-pointer disabled:opacity-20 transition-all text-emerald-400"
                              title={isBn ? "উপরে নিন" : "Move Up"}
                            >
                              ▲
                            </button>
                            <button
                              onClick={(e) => {
                                  e.stopPropagation();
                                  moveMember(item.member.id, 'down');
                                }}
                              disabled={idx === filteredLedger.length - 1}
                              className="p-1 rounded hover:bg-emerald-800/40 active:bg-emerald-500 active:text-[#020b06] text-[10px] cursor-pointer disabled:opacity-20 transition-all text-emerald-400"
                              title={isBn ? "নিচে নিন" : "Move Down"}
                            >
                              ▼
                            </button>
                          </div>
                        )}
                        
                        {/* Avatar container */}
                        <div className="relative shrink-0">
                          {item.member.photoURL ? (
                            <img 
                              src={item.member.photoURL} 
                              alt="" 
                              className="w-10 h-10 xs:w-12 xs:h-12 rounded-2xl object-cover border-2 border-emerald-500/15 shadow-md shadow-emerald-950/50" 
                              referrerPolicy="referrer" 
                            />
                          ) : (
                            <div className="w-10 h-10 xs:w-12 xs:h-12 rounded-2xl bg-gradient-to-br from-emerald-950 to-emerald-900 border-2 border-emerald-500/15 flex items-center justify-center text-xs xs:text-sm text-amber-500 font-extrabold uppercase shadow-md shadow-emerald-950/50">
                              {item.member.name.slice(0, 2)}
                            </div>
                          )}
                        </div>

                        {/* Name, ID and Paid/Due Counter Badges */}
                        <div className="leading-tight min-w-0 flex-1">
                          <h4 className="font-black text-[#f8fafc] text-xs xs:text-sm sm:text-base md:text-lg tracking-tight hover:text-emerald-350 transition-colors duration-200 truncate">
                            {isBn ? (item.member.nameBn || item.member.name) : item.member.name}
                          </h4>
                          
                          {/* Rich Badge Row */}
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            <span className="bg-emerald-950/80 border border-emerald-800/35 px-1 py-0.5 rounded text-[8.5px] xs:text-[9.5px] sm:text-[10px] font-mono font-bold text-emerald-400 tracking-wider">
                              ID: {item.member.memberId}
                            </span>
                            <span className="bg-[#10b981]/15 border border-[#10b981]/30 px-1 py-0.5 rounded text-[8.5px] xs:text-[9.5px] sm:text-[10px] font-extrabold text-[#10b981]">
                              {isBn ? `${toBanglaDigits(paidCount)} পেইড` : `${paidCount} Paid`}
                            </span>
                            {dueCount > 0 && (
                              <span className="bg-[#f43f5e]/15 border border-[#f43f5e]/30 px-1 py-0.5 rounded text-[8.5px] xs:text-[9.5px] sm:text-[10px] font-extrabold text-rose-450">
                                {isBn ? `${toBanglaDigits(dueCount)} বাকি` : `${dueCount} Due`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Total Paid Amount Box & Expand Indicator */}
                      <div className="flex items-center gap-2 xs:gap-3 shrink-0 relative z-10">
                        {/* Unique display box representing Total Paid */}
                        <div className="bg-gradient-to-b from-emerald-950/85 to-[#020b06]/95 border-t border-l border-emerald-500/20 border-b border-r border-[#020b06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_4px_12px_rgba(0,0,0,0.45)] rounded-xl px-2.5 py-1.5 xs:px-3.5 xs:py-2 text-center xs:text-right min-w-[96px] xs:min-w-[125px] sm:min-w-[145px] flex flex-col justify-center gap-1.5 leading-none transition-all duration-300 group-hover:border-emerald-500/35">
                          <p className="text-[9px] xs:text-[10px] sm:text-[11px] font-black text-emerald-350 tracking-wider uppercase leading-none">
                            {isBn ? 'মোট পরিশোধ' : 'Total Paid'}
                          </p>
                          <p className="text-xs xs:text-sm sm:text-base md:text-lg font-black text-emerald-400 leading-none font-mono">
                            ৳{formatCurrency(item.totalPaid, isBn)}
                          </p>
                        </div>

                        {/* Expandable Chevron Arrow indicator */}
                        <div className={`w-8 h-8 xs:w-8.5 xs:h-8.5 rounded-xl bg-gradient-to-b from-slate-900/60 to-black/60 border-t border-l border-white/10 border-b border-r border-black flex items-center justify-center text-emerald-450 transition-all duration-300 hover:bg-emerald-950/50 shadow-md ${isExpanded ? 'rotate-90 text-amber-500 border-amber-500/30' : ''}`}>
                          <ChevronRight size={16} className="stroke-[2.5]" />
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Mobile Details container with 3D glass aesthetic */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden border-t border-white/[0.04] bg-gradient-to-b from-black/55 to-black/80 px-3 py-4 space-y-4 relative z-10"
                        >
                          {/* 4 columns layout containing 12 months with larger texts & 3D styling */}
                          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                            {monthsList.map(m => {
                              const mon = item.months[m.numeric];
                              let bg = "bg-slate-950/20 border-t border-l border-white/5 border-b-2 border-r border-black/80 text-slate-500 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]";
                              let labelSuffix = isBn ? "বাকি" : "Due";
                              
                              if (mon.status === 'paid') {
                                bg = "bg-emerald-500/5 border-t border-l border-emerald-400/40 border-b-2 border-r border-black/85 text-emerald-450 shadow-[0_6px_12px_rgba(0,0,0,0.55),inset_0_1px_1px_rgba(16,185,129,0.18)]";
                                labelSuffix = isBn ? "পরিশোধ" : "Paid";
                              } else if (mon.status === 'partial') {
                                bg = "bg-amber-500/5 border-t border-l border-amber-400/40 border-b-2 border-r border-black/85 text-amber-400 shadow-[0_6px_12px_rgba(0,0,0,0.55),inset_0_1px_1px_rgba(245,158,11,0.18)]";
                                labelSuffix = isBn ? "আংশিক" : "Part";
                              } else if (mon.status === 'due') {
                                bg = "bg-rose-500/5 border-t border-l border-rose-400/40 border-b-2 border-r border-black/85 text-rose-450 shadow-[0_6px_12px_rgba(0,0,0,0.55),inset_0_1px_1px_rgba(244,63,94,0.18)]";
                                labelSuffix = isBn ? "বকেয়া" : "Due";
                              } else if (mon.status === 'not_applicable') {
                                bg = "bg-slate-950/20 border-t border-l border-white/5 border-b-2 border-r border-black/85 text-slate-400 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]";
                                labelSuffix = isBn ? "N/A" : "N/A";
                              }
                              
                              const isClickable = isAdmin && isLedgerEditable;
                              const borderAndHoverClass = isClickable 
                                ? 'cursor-pointer border-amber-500/50 ring-2 ring-amber-500/35 hover:border-amber-400 brightness-110 active:scale-95 bg-amber-500/[0.08] shadow-[0_0_10px_rgba(245,158,11,0.25)]' 
                                : 'cursor-pointer opacity-95 hover:brightness-110';

                              return (
                                <button
                                  key={m.numeric}
                                  type="button"
                                  onClick={() => isClickable && handleEditCell(item.member, m, mon.amount)}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handleDoubleClickCell(item.member, m, mon.amount);
                                  }}
                                  className={`p-1.5 xs:p-2 sm:p-2.5 rounded-lg xs:rounded-xl flex flex-col items-center justify-center text-center transition-all duration-300 border border-transparent ${bg} ${borderAndHoverClass}`}
                                  title={isClickable 
                                    ? (isBn ? 'ডাবল-ক্লিক করে রশিদ দেখুন / চাঁদা পরিবর্তন করুন' : 'Double click to view receipt / Click to edit amount') 
                                    : (isBn ? 'ডাবল-ক্লিক করে রশিদ দেখুন' : 'Double click to view receipt')
                                  }
                                >
                                  <span className="text-[10.5px] xs:text-[12.5px] sm:text-sm font-extrabold uppercase text-slate-400 tracking-tight leading-none mb-1">
                                    {isBn ? m.labelBn : m.labelEn}
                                  </span>
                                  <span className="text-[11px] xs:text-[13px] sm:text-base font-black tracking-tight leading-tight">
                                    {mon.status === 'paid' || mon.status === 'partial' 
                                      ? `৳${isBn ? toBanglaDigits(mon.amount) : mon.amount}`
                                      : labelSuffix
                                    }
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          
                          {/* Official logo / seal watermark with luxurious Glass-box 3D style */}
                          <div className="flex items-center justify-between gap-3 px-3.5 py-3 bg-gradient-to-r from-emerald-950/45 to-slate-950/45 border-t border-l border-emerald-500/15 border-b border-r border-[#020b06] shadow-inner rounded-xl relative overflow-hidden group/seal">
                            {/* Inner ambient light reflection path */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.01] to-white/[0.03] pointer-events-none" />
                            
                            <div className="flex items-center gap-2 relative z-10">
                              {settings?.officialSealURL || settings?.logoURL ? (
                                <img 
                                  src={getImageUrl(settings.officialSealURL || settings.logoURL)} 
                                  alt="Organization Seal/Logo" 
                                  className="w-7.5 h-7.5 object-contain rounded-md filter drop-shadow-[0_2px_4px_rgba(16,185,129,0.3)]"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-7.5 h-7.5 rounded-md bg-emerald-950 flex items-center justify-center font-black text-xs text-amber-500 border border-emerald-500/20 shadow-sm">
                                  ★
                                </div>
                              )}
                              <div className="text-left">
                                <p className="text-[10px] font-black text-[#f8fafc] uppercase tracking-wider leading-none">
                                  {isBn ? 'অথরাইজড রিমাইন্ডার সেন্টার' : 'Reminders Dispatch Hub'}
                                </p>
                                <p className="text-[8.5px] font-bold text-slate-400 mt-1.5 leading-none">
                                  {isBn ? 'ডিজিটাল ট্র্যাকিং ভেরিফাইড' : 'Official Org Seal & Credentials active'}
                                </p>
                              </div>
                            </div>
                            <span className="text-[8.5px] font-black uppercase text-emerald-400 bg-emerald-500/15 border border-emerald-500/35 px-2 py-0.5 rounded-full select-none shadow-[0_2px_6px_rgba(16,185,129,0.2)]">
                              {isBn ? 'অফিসিয়াল' : 'Official'}
                            </span>
                          </div>

                          {/* Remind or quick contact actions styled as gorgeous premium glossy buttons */}
                          <div className="flex items-center gap-2 pt-3 border-t border-white/[0.04] flex-wrap sm:flex-nowrap relative z-10">
                            {item.totalDue > 0 && (
                              <a
                                href={`https://api.whatsapp.com/send?phone=${item.member.phone}&text=${encodeURIComponent(
                                  isBn 
                                    ? `আসসালামু আলাইকুম ${item.member.name}, নাছিরেরটেক সমাজ কল্যাণ সংস্থা থেকে জানানো যাচ্ছে যে, আপনার বাৎসরিক মেম্বার চাঁদা ${toBanglaDigits(selectedYear)} খাতের মোট বকেয়া ৳${formatCurrency(item.totalDue, true)}। অনুগ্রহ করে তা পরিশোধ করতে সহায়তা করুন।`
                                    : `Assalamu Alaikum ${item.member.name}, this is a gentle reminder from Nasirertech Welfare Organization that your subscription due for the year ${selectedYear} is ৳${formatCurrency(item.totalDue, false)}. Kindly assist with payment.`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-b from-rose-500/15 to-rose-600/10 hover:from-rose-500/25 hover:to-rose-600/15 border-t border-l border-rose-400/25 border-b-2 border-r border-[#020b06] text-rose-450 text-xs font-black text-center flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 shadow-[0_4px_12px_rgba(244,63,94,0.15)] min-w-[120px]"
                              >
                                <Send size={13} className="stroke-[2.5]" />
                                {isBn ? 'রিমাইন্ডার' : 'Remind'}
                              </a>
                            )}
                            <button
                              onClick={() => {
                                if (setActiveTab) {
                                  setActiveTab('payments');
                                }
                              }}
                              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-b from-emerald-500/10 to-emerald-600/5 hover:from-emerald-500/20 hover:to-emerald-600/10 border-t border-l border-emerald-400/20 border-b-2 border-r border-[#020b06] text-emerald-400 text-xs font-black text-center flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 shadow-[0_4px_12px_rgba(16,185,129,0.1)] min-w-[120px]"
                            >
                              <CreditCard size={13} className="stroke-[2.5]" />
                              {isBn ? 'রশিদ দিন' : 'Receipt'}
                            </button>
                            <button
                              onClick={() => handleSaveMemberStatementImage(item)}
                              disabled={isGeneratingMemberImg[item.member.id]}
                              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-b from-amber-500/10 to-amber-600/5 hover:from-amber-500/20 hover:to-amber-600/10 border-t border-l border-amber-450/20 border-b-2 border-r border-[#020b06] text-amber-500 text-xs font-black text-center flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 disabled:opacity-50 shadow-[0_4px_12px_rgba(245,158,11,0.15)] min-w-[120px]"
                            >
                              {isGeneratingMemberImg[item.member.id] ? (
                                <RefreshCw size={13} className="animate-spin text-amber-500" />
                              ) : (
                                <Image size={13} className="stroke-[2.5]" />
                              )}
                              <span>{isGeneratingMemberImg[item.member.id] ? (isBn ? 'তৈরি...' : 'Loading...') : (isBn ? 'স্টেটমেন্ট ছবি' : 'Save Image')}</span>
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleOpenBulkEdit(item)}
                                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-b from-amber-500/22 to-amber-600/12 hover:from-amber-500/32 hover:to-amber-600/12 border-t border-l border-amber-500/35 border-b-2 border-r border-[#020b06] text-amber-400 text-xs font-black text-center flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 shadow-[0_4px_12px_rgba(245,158,11,0.2)] min-w-[120px]"
                                title={isBn ? "পুরা বছরের চাঁদা একসাথে এডিট করুন" : "Edit entire year collection"}
                              >
                                <Edit2 size={13} className="stroke-[2.5]" />
                                <span>{isBn ? 'বাৎসরিক এডিট' : 'Edit Year'}</span>
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}

            {/* Smart color explanation row for mobile cards */}
            <div className="bg-[#020b06] border border-emerald-900/25 p-4 rounded-2xl text-[10px] font-bold text-slate-400 flex flex-col gap-3 shadow-md">
              <div className="flex items-center gap-3.5 flex-wrap">
                <span className="text-slate-400 uppercase tracking-widest">{isBn ? 'রং কোড নির্দেশিকা:' : 'Status Colors:'}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2 rounded-full h-2 bg-[#10b981]"></span>
                  <span className="text-slate-200">{isBn ? 'পরি.' : 'Paid'}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2 rounded-full h-2 bg-amber-500"></span>
                  <span className="text-slate-200">{isBn ? 'আংশিক' : 'Part'}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2 rounded-full h-2 bg-rose-500"></span>
                  <span className="text-slate-200">{isBn ? 'বকেয়া' : 'Due'}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2 rounded-full h-2 bg-slate-600" style={{backgroundColor: '#4b5563'}}></span>
                  <span className="text-slate-200">{isBn ? 'প্রযোজ্য নয়' : 'N/A'}</span>
                </span>
              </div>

              <div className="text-slate-100 uppercase tracking-wider font-extrabold text-[11px] border-t border-emerald-950 pt-2.5 flex justify-between items-center">
                <span>{isBn ? 'বাৎসরিক মোট চাঁদা সংগ্রহ:' : 'Grand Total:'}</span>
                <span className="text-emerald-400 font-extrabold">৳ {formatCurrency(stats.totalCollection, isBn)}</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* HIDDEN PRINT-READY TARGET */}
      <div className="hidden">
        <div ref={printAreaRef} id="printable-ledger-view">
          {/* Content constructed dynamically inside print function */}
        </div>
      </div>

      {/* Member Profile Modal */}
      <AnimatePresence>
        {viewingMember && (
          <MemberProfile 
            member={viewingMember} 
            onClose={() => setViewingMember(null)} 
          />
        )}
      </AnimatePresence>

      {/* Edit Month Subscription Amount Modal */}
      <AnimatePresence>
        {editingCell && (
          <div className="fixed inset-0 bg-[#020b06]/85 backdrop-blur-md z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#05180e] border border-emerald-500/30 text-white w-full max-w-sm rounded-[1.8rem] overflow-hidden shadow-2xl p-6 relative"
            >
              {/* Top border ambient glow */}
              <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-500" />
              
              <div className="flex items-center gap-3.5 pb-4 border-b border-white/[0.08]">
                {/* Avatar with emerald ring */}
                <div className="relative shrink-0 w-11 h-11 rounded-full overflow-hidden border-2 border-emerald-400/40 shadow-sm">
                  {editingCell.member.photoURL ? (
                    <img src={getImageUrl(editingCell.member.photoURL)} alt="" className="w-full h-full object-cover" referrerPolicy="referrer" />
                  ) : (
                    <div className="w-full h-full bg-emerald-950 flex items-center justify-center text-xs text-amber-500 font-extrabold pb-0.5">
                      {editingCell.member.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-[#10b981] text-[10px] uppercase tracking-wider">
                    {isBn ? 'চাঁদা হিসাব এডিট' : 'Edit Subscription Amount'}
                  </h3>
                  <h4 className="font-extrabold text-sm text-slate-100">
                    {isBn ? (editingCell.member.nameBn || editingCell.member.name) : editingCell.member.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono font-medium mt-0.5">
                    Member ID: {editingCell.member.memberId}
                  </p>
                </div>
              </div>

              {/* Month label banner */}
              <div className="my-4 bg-slate-950/40 border border-white/[0.05] p-3 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">
                  {isBn ? 'নির্বাচিত মাস ও বছর:' : 'Target Month & Year:'}
                </span>
                <span className="text-xs font-black text-amber-400 font-mono">
                  {isBn ? `${editingCell.month.labelBn} ${toBanglaDigits(selectedYear)}` : `${editingCell.month.labelEn} ${selectedYear}`}
                </span>
              </div>

              {/* Amount Inputs */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2">
                    {isBn ? 'চাঁদার পরিমাণ (টাকা):' : 'Enter Amount (BDT):'}
                  </label>
                  <div className="relative flex items-center bg-slate-950/50 border-2 border-emerald-950 rounded-2xl overflow-hidden focus-within:border-emerald-500/50 transition-all">
                    <span className="pl-4 text-emerald-500 font-extrabold text-lg select-none">৳</span>
                    <input
                      id="edit-amount-input"
                      type="number"
                      value={inputAmount}
                      onChange={(e) => setInputAmount(e.target.value)}
                      className="w-full py-3.5 pl-2.5 pr-4 bg-transparent text-white font-mono font-black text-xl focus:outline-none placeholder-slate-600"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Preset Fast Selection Buttons */}
                <div>
                  <span className="block text-[9px] uppercase font-black tracking-widest text-slate-500 mb-1.5 leading-none">
                    {isBn ? 'দ্রুত নির্বাচন করুন' : 'Quick Amount Presets'}
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setInputAmount('0')}
                      className="py-2.5 rounded-xl text-[11px] font-black bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-950 transition-all cursor-pointer"
                    >
                      {isBn ? '০' : '0'}
                    </button>
                    {editingCell.member.monthlySubscription > 0 && (
                      <button
                        type="button"
                        onClick={() => setInputAmount(String(editingCell.member.monthlySubscription))}
                        className="py-2.5 rounded-xl text-[11px] font-black bg-emerald-500/10 border border-emerald-500/20 text-[#10b981] hover:bg-emerald-500/20 transition-all cursor-pointer font-mono"
                        title={isBn ? 'সদস্যের নির্ধারিত ফি' : "Member's Standard Fee"}
                      >
                        ৳{isBn ? toBanglaDigits(editingCell.member.monthlySubscription) : editingCell.member.monthlySubscription}
                      </button>
                    )}
                    {editingCell.member.monthlySubscription !== 500 && (
                      <button
                        type="button"
                        onClick={() => setInputAmount('500')}
                        className="py-2.5 rounded-xl text-[11px] font-black bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-950 transition-all cursor-pointer font-mono"
                      >
                        ৳{isBn ? '৫০০' : '500'}
                      </button>
                    )}
                    {editingCell.member.monthlySubscription !== 1000 && (
                      <button
                        type="button"
                        onClick={() => setInputAmount('1000')}
                        className="py-2.5 rounded-xl text-[11px] font-black bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-950 transition-all cursor-pointer font-mono"
                      >
                        ৳{isBn ? '১,০০০' : '1000'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex gap-3 mt-6 pt-4 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setEditingCell(null)}
                  className="flex-1 py-3 bg-slate-900 border border-slate-850 hover:bg-slate-850 text-slate-300 rounded-xl text-[11px] font-bold transition-all cursor-pointer"
                  disabled={isSubmittingAmount}
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseFloat(inputAmount);
                    if (isNaN(parsed) || parsed < 0) {
                      alert(isBn ? 'সদস্যের নির্ধারিত চাঁদার সঠিক অঙ্ক ইনপুট দিন!' : 'Please enter a valid positive number');
                      return;
                    }
                    setIsSubmittingAmount(true);
                    handleSaveCellAmount(parsed)
                      .finally(() => setIsSubmittingAmount(false));
                  }}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-[#020b06] border border-emerald-400/25 rounded-xl text-[11px] font-black shadow-lg shadow-emerald-950/40 relative overflow-hidden transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  disabled={isSubmittingAmount}
                >
                  {isSubmittingAmount ? (
                    <RefreshCw size={12} className="animate-spin text-[#020b06]" />
                  ) : (
                    <CheckCircle2 size={12} className="stroke-[2.5]" />
                  )}
                  <span>{isBn ? 'সেভ করুন' : 'Save Amount'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit 12 Months Subscription (Bulk Edit) Modal */}
      <AnimatePresence>
        {bulkEditMemberLedger && (
          <div className="fixed inset-0 bg-[#020b06]/85 backdrop-blur-md z-[150] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#05180e] border border-emerald-500/30 text-white w-full max-w-2xl rounded-[1.8rem] overflow-hidden shadow-2xl p-6 relative my-8"
            >
              {/* Top border ambient glow */}
              <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-500" />
              
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Edit2 size={16} className="stroke-[2.5]" />
                  </span>
                  <div>
                    <h3 className="font-extrabold text-[#10b981] text-[10px] uppercase tracking-wider font-mono">
                      {isBn ? 'বার্ষিক চাঁদা এডিট' : 'Edit Monthly Collection'}
                    </h3>
                    <h4 className="font-extrabold text-sm text-slate-100">
                      {isBn ? 'পুরা বছরের চাঁদা একসাথে সংরক্ষণ' : 'Update collection for the entire year'}
                    </h4>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBulkEditMemberLedger(null)}
                  className="p-1.5 rounded-full hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Member Info Banner */}
              <div className="mt-4 bg-[#031d10] border border-emerald-500/15 p-4 rounded-2xl flex items-center gap-4">
                {/* Avatar with emerald ring */}
                <div className="relative shrink-0 w-12 h-12 rounded-full overflow-hidden border-2 border-emerald-400/40 shadow-sm">
                  {bulkEditMemberLedger.member.photoURL ? (
                    <img src={getImageUrl(bulkEditMemberLedger.member.photoURL)} alt="" className="w-full h-full object-cover" referrerPolicy="referrer" />
                  ) : (
                    <div className="w-full h-full bg-emerald-950 flex items-center justify-center text-xs text-amber-500 font-extrabold pb-0.5">
                      {bulkEditMemberLedger.member.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-extrabold text-base text-slate-100 truncate">
                      {isBn ? (bulkEditMemberLedger.member.nameBn || bulkEditMemberLedger.member.name) : bulkEditMemberLedger.member.name}
                    </h4>
                    {(bulkEditMemberLedger.member.memberId.toLowerCase().includes('vip') || 
                      (bulkEditMemberLedger.member.designation && bulkEditMemberLedger.member.designation.toLowerCase().includes('vip'))) && (
                      <span className="bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                        {isBn ? 'ভিআইপি' : 'VIP'}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-emerald-400 font-mono font-bold mt-0.5">
                    ID: {bulkEditMemberLedger.member.memberId}
                  </p>
                  <p className="text-[10px] text-slate-400 leading-normal mt-1">
                    {isBn ? 'আপনি এই সদস্যের মাসিক চাঁদার কিস্তিগুলো এক ক্লিকে এডিট করতে পারবেন।' : 'You can edit monthly collection for this member.'}
                  </p>
                </div>
              </div>

              {/* 12 Months Input Fields Grid */}
              <div className="mt-5 space-y-3">
                <span className="block text-[10px] uppercase font-black tracking-widest text-slate-400 leading-none">
                  {isBn ? 'প্রতি মাসের চাঁদার হার (টাকা)' : 'Monthly Amounts (BDT)'}
                </span>

                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-3 bg-slate-950/20 border border-white/[0.04] p-4 rounded-2xl">
                  {monthsList.map(m => {
                    const checkMonthVal = parseInt(m.numeric, 10);
                    const isJoined = selectedYear > bulkEditMemberLedger.joinedYear || 
                                     (selectedYear === bulkEditMemberLedger.joinedYear && checkMonthVal >= bulkEditMemberLedger.joinedMonthIdx);
                    const isApplicable = bulkEditMemberLedger.member.status !== MemberStatus.INACTIVE && isJoined && bulkEditMemberLedger.monthlyFee > 0;
                    
                    return (
                      <div key={m.numeric} className={`p-2 rounded-xl flex flex-col gap-1.5 ${isApplicable ? 'bg-slate-950/40 border border-white/[0.04]' : 'bg-slate-950/10 border border-white/[0.01] opacity-50'}`}>
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase">
                            {isBn ? m.labelBn : m.labelEn}
                          </span>
                          {!isApplicable && (
                            <span className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded-md font-bold leading-normal">
                              {isBn ? 'এন/এ' : 'N/A'}
                            </span>
                          )}
                        </div>
                        <div className="relative flex items-center bg-slate-950 border border-emerald-950 focus-within:border-amber-500/50 rounded-lg overflow-hidden transition-all">
                          <span className="pl-2.5 text-emerald-500/80 font-bold text-xs select-none">৳</span>
                          <input
                            type="number"
                            disabled={!isApplicable}
                            value={bulkEditInputs[m.numeric] || ''}
                            onChange={(e) => handleBulkInputChange(m.numeric, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="w-full py-2 pl-1 pr-2 bg-transparent text-white font-mono font-extrabold text-xs focus:outline-none disabled:cursor-not-allowed text-center"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Real-time Dynamic Calculations */}
              <div className="mt-5 bg-[#031d10]/40 border border-[#10b981]/15 rounded-2xl p-4 flex items-center justify-around gap-2 text-center">
                <div>
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {isBn ? 'মোট পরিশোধ' : 'Total Paid'}
                  </h5>
                  <p className="text-sm font-black text-[#10b981] font-mono">
                    ৳ {formatCurrency(modalCalculations.totalPaid, isBn)}
                  </p>
                </div>
                <div className="w-px h-8 bg-white/[0.06]" />
                <div>
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {isBn ? 'মোট বকেয়া' : 'Total Due'}
                  </h5>
                  <p className="text-sm font-black text-rose-450 font-mono">
                    ৳ {formatCurrency(modalCalculations.totalDue, isBn)}
                  </p>
                </div>
                <div className="w-px h-8 bg-white/[0.06]" />
                <div>
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {isBn ? 'মোট বাৎসরিক' : 'Annual Total'}
                  </h5>
                  <p className="text-sm font-black text-amber-500 font-mono">
                    ৳ {formatCurrency(modalCalculations.totalExpected, isBn)}
                  </p>
                </div>
              </div>

              {/* Dialog Footer Actions */}
              <div className="flex gap-3 mt-6 pt-4 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setBulkEditMemberLedger(null)}
                  className="flex-1 py-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer"
                  disabled={isSavingBulk}
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveBulkAmounts}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-[#020b06] border border-emerald-400/25 rounded-xl text-[11px] font-black shadow-lg shadow-emerald-950/40 relative overflow-hidden transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  disabled={isSavingBulk}
                >
                  {isSavingBulk ? (
                    <RefreshCw size={12} className="animate-spin text-[#020b06]" />
                  ) : (
                    <CheckCircle2 size={12} className="stroke-[2.5]" />
                  )}
                  <span>{isSavingBulk ? (isBn ? 'সংরক্ষণ হচ্ছে...' : 'Saving...') : (isBn ? 'পরিবর্তন সংরক্ষণ করুন' : 'Save Changes')}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification for Success */}
      <AnimatePresence>
        {saveSuccessMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 bg-[#032e18] border-2 border-[#10b981]/60 text-emerald-300 px-6 py-4 rounded-2xl shadow-xl z-[200] flex items-center gap-3.5 max-w-sm"
          >
            <div className="bg-[#10b981]/20 p-2 rounded-xl text-emerald-400 shrink-0">
              <CheckCircle2 size={18} className="stroke-[2.5]" />
            </div>
            <div className="flex-1 min-w-0">
              <h5 className="font-extrabold text-xs text-white uppercase tracking-wider">{isBn ? 'সফল হয়েছে!' : 'Success!'}</h5>
              <p className="text-[11px] font-bold text-slate-300 mt-0.5">{saveSuccessMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setSaveSuccessMessage(null)}
              className="text-slate-400 hover:text-white text-xs font-bold leading-none p-1 cursor-pointer"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Image Download Preview Fallback Modal */}
      <AnimatePresence>
        {downloadImageSrc && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[210] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#03150d] border border-emerald-500/20 rounded-3xl p-6 shadow-2xl max-w-4xl w-full my-8 flex flex-col gap-4 text-left"
            >
              <div className="flex items-center justify-between border-b border-emerald-950 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📥</span>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">
                      {isBn ? 'ডাউনলোড ও প্রিভিউ সহকারী' : 'Download & Preview Center'}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {isBn ? 'ব্রাউজার সিকিউরিটি ডাউনলোড ব্লক রিকভারি মোড' : 'Browser security download restriction recovery system'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDownloadImageSrc(null)}
                  className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl font-bold text-xs cursor-pointer transition-colors"
                >
                  ✕ {isBn ? 'বন্ধ করুন' : 'Close'}
                </button>
              </div>

              {/* Banner notification */}
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col md:flex-row gap-3">
                <div className="text-xl">💡</div>
                <div className="text-xs text-amber-100 font-medium leading-relaxed">
                  <p className="font-extrabold text-amber-400 mb-1">
                    {isBn 
                      ? 'রিপোর্ট ছবিটি ডাউনলোড বা সংরক্ষণ করতে সমস্যা হচ্ছে?' 
                      : 'Having trouble saving your ledger report image?'}
                  </p>
                  <p>
                    {isBn 
                      ? 'মোবাইল বা আইফ্রেম সিকিউরিটির কারণে অনেক সময় ব্রাউজার ডাউনলোড ট্রিগার ব্লক করে দেয়। আপনি নিচের চিত্রে কিছুক্ষণ চেপে ধরুন (মোবাইলে) অথবা মাউসের ডান ক্লিক করুন (কম্পিউটারে) এবং "Save Image / ছবি সংরক্ষণ করুন" এ প্রেস করুন। এটি অত্যন্ত নিরাপদ ও ১০০% সফল পদ্ধতি!' 
                      : 'Embedded iframes and browser sandboxes sometimes block dynamic downloads. Simply long-press on the image below (on mobile) or right-click (on PC) and choose "Save Image As" to keep it directly in your gallery!'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-center">
                <a
                  href={downloadImageSrc}
                  download={downloadImageName}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-[#020b06] border border-emerald-400/25 rounded-xl text-center text-[11px] font-black shadow-lg shadow-emerald-950/40 uppercase transition-colors"
                >
                  🚀 {isBn ? 'ডিরেক্ট ডাউনলোড ট্রাই করুন' : 'Try Direct Download'}
                </a>
              </div>

              {/* Actual Image Rendered */}
              <div className="border border-emerald-950/80 rounded-2xl overflow-hidden bg-[#020b06] shadow-inner max-h-[450px] overflow-auto flex justify-center p-2">
                <img
                  src={downloadImageSrc}
                  alt="Ledger Report"
                  className="max-w-full h-auto object-contain rounded-lg border-2 border-slate-800"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receipt Modal for Double Click View */}
      {viewingReceipt && (
        <ReceiptModal 
          payment={viewingReceipt} 
          onClose={() => setViewingReceipt(null)} 
        />
      )}

    </div>
  );
}
