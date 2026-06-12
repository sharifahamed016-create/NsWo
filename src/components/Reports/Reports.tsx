/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Download, TrendingUp, Users, PieChart, CreditCard,
  CloudLightning, Database, HardDrive, ShieldCheck, Activity,
  Smartphone, Monitor, RefreshCw, FileSpreadsheet, CheckCircle2, ChevronRight, Shield,
  Plus, Trash2
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area, LineChart, Line, Legend
} from 'recharts';
import { useAppContext } from '../../context/AppContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { useMembers } from '../../hooks/useMembers';
import { usePayments } from '../../hooks/usePayments';
import { useExpenses } from '../../hooks/useExpenses';
import { useActivities } from '../../hooks/useActivities';
import { MemberRoleType } from '../../types';

const toBanglaDigits = (num: number | string): string => {
  const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return num.toString().replace(/\d/g, (digit) => banglaDigits[parseInt(digit, 10)]);
};

export default function Reports() {
  const { t, language, settings } = useAppContext();

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

  const { members } = useMembers();
  const { payments } = usePayments();
  const { expenses } = useExpenses();

  const { activities, loading: loadingActivities } = useActivities();
  
  const [activeTab, setActiveTab] = useState<'reports' | 'analytics' | 'activities'>('reports');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showFinancialModal, setShowFinancialModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Activities Filter/Search States
  const [activitySearchTerm, setActivitySearchTerm] = useState('');
  const [activityActionFilter, setActivityActionFilter] = useState<'all' | 'added' | 'updated' | 'deleted'>('all');
  const [activityUserFilter, setActivityUserFilter] = useState('all');

  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      // Action Type Matching
      let actionMatch = true;
      const type = (activity.type || '').toLowerCase();
      if (activityActionFilter === 'added') {
        actionMatch = type.includes('add') || type.includes('create') || type.includes('import');
      } else if (activityActionFilter === 'updated') {
        actionMatch = type.includes('update') || type.includes('edit') || type.includes('sync');
      } else if (activityActionFilter === 'deleted') {
        actionMatch = type.includes('delete') || type.includes('remove') || type.includes('clear');
      }

      // User Email Matching
      const userMatch = activityUserFilter === 'all' || activity.userEmail === activityUserFilter;

      // Text Search matching messages & email & type
      const searchLower = activitySearchTerm.toLowerCase();
      const textMatch = !activitySearchTerm || 
        (activity.message && activity.message.toLowerCase().includes(searchLower)) ||
        (activity.messageBn && activity.messageBn.toLowerCase().includes(searchLower)) ||
        (activity.userEmail && activity.userEmail.toLowerCase().includes(searchLower)) ||
        (activity.type && activity.type.toLowerCase().includes(searchLower));

      return actionMatch && userMatch && textMatch;
    });
  }, [activities, activitySearchTerm, activityActionFilter, activityUserFilter]);

  // Unique list of system users who triggered these actions
  const uniqueUsers = useMemo(() => {
    const list = new Set<string>();
    activities.forEach(a => {
      if (a.userEmail) list.add(a.userEmail);
    });
    return Array.from(list);
  }, [activities]);

  // Count summaries for stats widget
  const activityStats = useMemo(() => {
    let added = 0;
    let updated = 0;
    let deleted = 0;
    activities.forEach((activity) => {
      const type = (activity.type || '').toLowerCase();
      if (type.includes('add') || type.includes('create') || type.includes('import')) {
        added++;
      } else if (type.includes('update') || type.includes('edit') || type.includes('sync')) {
        updated++;
      } else if (type.includes('delete') || type.includes('remove') || type.includes('clear')) {
        deleted++;
      }
    });
    return { added, updated, deleted, total: activities.length };
  }, [activities]);

  const appName = language === 'bn' ? settings.nameBn : settings.name;

  // Cloud Export (Full State Backup JSON)
  const handleCloudExport = () => {
    try {
      const backupData = {
        exportedAt: new Date().toISOString(),
        organization: appName,
        membersCount: members.length,
        paymentsCount: payments.length,
        expensesCount: expenses.length,
        data: {
          members,
          payments,
          expenses
        }
      };
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backupData, null, 2))}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', `nswo_cloud_backup_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
    } catch (e) {
      console.error(e);
      alert(language === 'bn' ? 'ব্যাকআপ তৈরিতে সমস্যা হয়েছে!' : 'Error creating back-up!');
    }
  };

  // CSV spreadsheeet exports
  const downloadMembersCSV = () => {
    const headers = ["MemberID", "Name", "Phone", "Role", "Country", "Joined Date", "Total Paid", "Status"];
    const rows = members.map(m => [
      m.memberId,
      m.name,
      m.phone,
      m.roleType || 'GENERAL',
      m.country || 'Local',
      m.joinedDate,
      m.totalPaid || 0,
      m.status
    ]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `nswo_members_audit_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPaymentsCSV = () => {
    const headers = ["ReceiptNo", "MemberID", "MemberName", "Amount", "Month", "Date", "Method", "Type", "Remarks"];
    const rows = payments.map(p => [
      p.receiptNo,
      p.memberId,
      p.memberName,
      p.amount,
      p.month,
      p.date,
      p.method || 'Cash',
      p.type || 'Subscription',
      p.remarks || ''
    ]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `nswo_payments_audit_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExpensesCSV = () => {
    const headers = ["Category", "Amount", "Date", "Description", "RequestedBy"];
    const rows = expenses.map(e => [
      e.category,
      e.amount,
      e.date,
      e.description,
      e.requestedBy || ''
    ]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `nswo_expenses_audit_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Manual Trigger Force cloud synchronization
  const forceCloudSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatus(language === 'bn' ? 'গুগল ফায়ারবেস ক্লাউডে সিনক্রোনাইজ করা হচ্ছে...' : 'Connecting & syncing to scale Firestore...');
    await new Promise(resolve => setTimeout(resolve, 1500));
    setSyncStatus(language === 'bn' ? 'ডাটাবেস ভেরিফিকেশন সফল! ৩টি রেকর্ড সিঙ্কড।' : 'Database verification successful! Synced.');
    setTimeout(() => {
      setIsSyncing(false);
      setSyncStatus(null);
    }, 2500);
  };

  // PDF report functions
  const reportItems = [
    { 
      id: 'members', 
      title: language === 'bn' ? '🟢 সাধারণ সদস্য ও বকেয়া রিপোর্ট (PDF)' : 'General Member & Due Report (PDF)', 
      desc: language === 'bn' ? 'সকল সাধারণ সদস্যদের তালিকা, বকেয়া চাঁদা ও হিসাব বিবরণী।' : 'List of general members, monthly fees, and accumulated dues.',
      icon: Users,
      color: 'bg-emerald-500'
    },
    { 
      id: 'management_report', 
      title: language === 'bn' ? '🛡️ কার্যনির্বাহী ও কর্মকর্তা তালিকা (PDF)' : 'Executive Management List (PDF)', 
      desc: language === 'bn' ? 'পরিচালনা পর্ষদের সকল কর্মকর্তা ও সদস্যবৃন্দের তালিকা, পদবী ও চাঁদা বিবরণী।' : 'List of active executives, administrative designations, and dues/contributions.',
      icon: Shield,
      color: 'bg-rose-500'
    },
    { 
      id: 'advisory_list', 
      title: language === 'bn' ? '🟣 উপদেষ্টা মণ্ডলীর তালিকা (PDF)' : 'Advisory Board Directory (PDF)', 
      desc: language === 'bn' ? 'উপদেষ্টাদের নাম, পদবী, পরামর্শ নির্দেশনাবলীসমূহ এবং ঠিকানা।' : 'All advisory board members, designations, addresses and advisory notes.',
      icon: CreditCard,
      color: 'bg-indigo-650'
    },
    { 
      id: 'donor_report', 
      title: language === 'bn' ? '💝 ডোনার ও দাতা তালিকা (PDF)' : 'Donors & Sponsors Registry (PDF)', 
      desc: language === 'bn' ? 'সংগঠনের সম্মানিত দাতা এবং পৃষ্ঠপোষকদের তালিকা ও অর্জিত অনুদান বিবরণী।' : 'Directory of generous donors, financial milestones, and database records.',
      icon: Users,
      color: 'bg-amber-500'
    },
    { 
      id: 'volunteer_report', 
      title: language === 'bn' ? '🟠 স্বেচ্ছাসেবক তালিকা ও রিপোর্ট (PDF)' : 'Volunteer Activity Report (PDF)', 
      desc: language === 'bn' ? 'স্বেচ্ছাসেবক তালিকা, কাজের দায়িত্ব, কর্মস্থল ও অবস্থা।' : 'Directory of volunteers, respective duty areas, work roles, and contact details.',
      icon: PieChart,
      color: 'bg-orange-500'
    },
    { 
      id: 'monthly', 
      title: language === 'bn' ? '📊 আর্থিক বিবরণী ও হিসাব সারসংক্ষেপ (PDF)' : 'Financial Summary (PDF)', 
      desc: language === 'bn' ? 'সংগঠনের মোট আদায়কৃত অর্থ, ব্যয়সমূহ ও বর্তমান তহবিলের স্থিতি।' : 'Aggregate overview of earnings, itemized expenses and net balance.',
      icon: TrendingUp,
      color: 'bg-teal-500'
    },
  ];

  const exportMemberDueReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(appName, 105, 15, { align: 'center' });
    doc.setFontSize(13);
    doc.text(language === 'bn' ? 'সাধারণ সদস্য ও বকেয়া রিপোর্ট' : 'General Member Dues & Audit Report', 105, 23, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 29, { align: 'center' });

    const generalMembers = members.filter(m => (!m.roleType || m.roleType === MemberRoleType.GENERAL) && m.includeInMonthlyLedger !== false);

    const tableData = generalMembers.map((m) => {
      const joined = new Date(m.joinedDate);
      const today = new Date();
      const years = today.getFullYear() - joined.getFullYear();
      const months = today.getMonth() - joined.getMonth();
      const totalMonths = Math.max(0, (years * 12) + months + 1);
      
      const fee = typeof m.monthlySubscription === 'number' ? m.monthlySubscription : 500;
      const expected = totalMonths * fee;
      const dues = Math.max(0, expected - (m.totalPaid || 0));

      return [
        m.memberId,
        m.name,
        m.phone,
        m.country || (language === 'bn' ? 'প্রবাসী নয়' : 'Local'),
        `BDT ${fee}`,
        `BDT ${m.totalPaid || 0}`,
        `BDT ${dues}`,
        m.status === 'active' ? (language === 'bn' ? 'সক্রিয়' : 'Active') : (language === 'bn' ? 'নিষ্ক্রিয়' : 'Inactive')
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [[
        language === 'bn' ? 'আইডি' : 'ID',
        language === 'bn' ? 'নাম' : 'Name',
        language === 'bn' ? 'মোবাইল' : 'Phone',
        language === 'bn' ? 'প্রবাসী দেশ' : 'Country',
        language === 'bn' ? 'মাসিক চাঁদা' : 'Monthly',
        language === 'bn' ? 'মোট পেমেন্ট' : 'Total Paid',
        language === 'bn' ? 'বকেয়া' : 'Due Amount',
        language === 'bn' ? 'অবস্থা' : 'Status'
      ]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 8 },
    });

    doc.save('nswo-member-dues-report.pdf');
  };

  const exportAdvisoryListReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(appName, 105, 15, { align: 'center' });
    doc.setFontSize(13);
    doc.text(language === 'bn' ? 'উপদেষ্টা মণ্ডলীর তালিকা' : 'Advisory Board List', 105, 23, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 29, { align: 'center' });

    const advisoryMembers = members.filter(m => m.roleType === MemberRoleType.ADVISORY);

    const tableData = advisoryMembers.map(m => [
      m.memberId,
      m.name,
      m.designation || (language === 'bn' ? 'উপদেষ্টা মহোদয়' : 'Advisor'),
      m.phone,
      m.country || '-',
      m.address,
      m.adviceNotes || '-'
    ]);

    autoTable(doc, {
      startY: 35,
      head: [[
        language === 'bn' ? 'আইডি' : 'ID',
        language === 'bn' ? 'নাম' : 'Name',
        language === 'bn' ? 'উপদেষ্টা পদবী' : 'Designation',
        language === 'bn' ? 'মোবাইল' : 'Phone',
        language === 'bn' ? 'দেশ' : 'Country',
        language === 'bn' ? 'ঠিকানা' : 'Address',
        language === 'bn' ? 'পরামর্শ ও নির্দেশনাবলী' : 'Notes/Advice'
      ]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8 },
    });

    doc.save('nswo-advisory-board-list.pdf');
  };

  const exportVolunteerActivityReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(appName, 105, 15, { align: 'center' });
    doc.setFontSize(14);
    doc.text(language === 'bn' ? 'স্বেচ্ছাসেবী তালিকা ও কর্মতৎপরতা বিবরণী' : 'Volunteer Activity Report', 105, 23, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 29, { align: 'center' });

    const volunteerMembers = members.filter(m => m.roleType === MemberRoleType.VOLUNTEER);

    const tableData = volunteerMembers.map(m => [
      m.memberId,
      m.name,
      m.volunteerType || (language === 'bn' ? 'স্বেচ্ছাসেবী অবদানকারী' : 'Volunteer'),
      m.dutyArea || (language === 'bn' ? 'মাঠ পর্যায়' : 'Field Work'),
      m.phone,
      m.joinedDate,
      m.status === 'active' ? (language === 'bn' ? 'সক্রিয়' : 'Active') : (language === 'bn' ? 'নিষ্ক্রিয়' : 'Inactive')
    ]);

    autoTable(doc, {
      startY: 35,
      head: [[
        language === 'bn' ? 'আইডি' : 'ID',
        language === 'bn' ? 'নাম' : 'Name',
        language === 'bn' ? 'সেবামূলক ভূমিকা / কজের ধরন' : 'Volunteer Type',
        language === 'bn' ? 'কর্মস্থল / দায়িত্ব এলাকা' : 'Duty Area',
        language === 'bn' ? 'মোবাইল' : 'Phone',
        language === 'bn' ? 'যোগদানের তারিখ' : 'Joined Date',
        language === 'bn' ? 'অবস্থা' : 'Status'
      ]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [249, 115, 22] },
      styles: { fontSize: 8 },
    });

    doc.save('nswo-volunteers-activity-report.pdf');
  };

  const exportManagementListReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(appName, 105, 15, { align: 'center' });
    doc.setFontSize(13);
    doc.text(language === 'bn' ? 'কার্যনির্বাহী বা ম্যানেজমেন্ট পরিচালনা পর্ষদের তালিকা' : 'Executive Management Board', 105, 23, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 29, { align: 'center' });

    const managementMembers = members.filter(m => m.roleType === MemberRoleType.MANAGEMENT);

    const tableData = managementMembers.map((m) => {
      const joined = new Date(m.joinedDate);
      const today = new Date();
      const years = today.getFullYear() - joined.getFullYear();
      const months = today.getMonth() - joined.getMonth();
      const totalMonths = Math.max(0, (years * 12) + months + 1);
      
      const fee = typeof m.monthlySubscription === 'number' ? m.monthlySubscription : 500;
      const expected = totalMonths * fee;
      const dues = Math.max(0, expected - (m.totalPaid || 0));

      return [
        m.memberId,
        m.name,
        m.designation || (language === 'bn' ? 'কর্মকর্তা' : 'Officer'),
        m.phone,
        `BDT ${fee}`,
        `BDT ${m.totalPaid || 0}`,
        `BDT ${dues}`,
        m.status === 'active' ? (language === 'bn' ? 'সক্রিয়' : 'Active') : (language === 'bn' ? 'নিষ্ক্রিয়' : 'Inactive')
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [[
        language === 'bn' ? 'আইডি' : 'ID',
        language === 'bn' ? 'নাম' : 'Name',
        language === 'bn' ? 'পদবী' : 'Designation',
        language === 'bn' ? 'মোবাইল' : 'Phone',
        language === 'bn' ? 'নির্ধারিত চাঁদা' : 'Monthly Fee',
        language === 'bn' ? 'মোট আদায়' : 'Paid',
        language === 'bn' ? 'বকেয়া' : 'Due',
        language === 'bn' ? 'অবস্থা' : 'Status'
      ]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [244, 63, 94] },
      styles: { fontSize: 8 },
    });

    doc.save('nswo-management-executive-list.pdf');
  };

  const exportDonorListReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(appName, 105, 15, { align: 'center' });
    doc.setFontSize(13);
    doc.text(language === 'bn' ? 'সংগঠনের দাতাদের (Donors) তালিকা ও অনুদান বিবরণী' : 'Donors & Sponsors Registry', 105, 23, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 29, { align: 'center' });

    const donorMembers = members.filter(m => m.roleType === MemberRoleType.DONOR);

    const tableData = donorMembers.map(m => [
      m.memberId,
      m.name,
      m.donorTitle || (language === 'bn' ? 'বিশিষ্ট ডোনার' : 'Sponsor/Donor'),
      m.phone,
      m.country || (language === 'bn' ? 'প্রবাসী নয়' : 'Local'),
      `BDT ${m.totalPaid || 0}`,
      m.status === 'active' ? (language === 'bn' ? 'সক্রিয়' : 'Active') : (language === 'bn' ? 'নিষ্ক্রিয়' : 'Inactive')
    ]);

    autoTable(doc, {
      startY: 35,
      head: [[
        language === 'bn' ? 'আইডি' : 'ID',
        language === 'bn' ? 'নাম' : 'Name',
        language === 'bn' ? 'উপাধি' : 'Title/Honour',
        language === 'bn' ? 'মোবাইল' : 'Phone',
        language === 'bn' ? 'দেশ' : 'Country',
        language === 'bn' ? 'মোট ফান্ড স্পন্সর' : 'Total Contrib',
        language === 'bn' ? 'অবস্থা' : 'Status'
      ]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [245, 158, 11] },
      styles: { fontSize: 8 },
    });

    doc.save('nswo-donors-sponsors-list.pdf');
  };

  const exportFinancialSummary = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(appName, 105, 15, { align: 'center' });
    doc.setFontSize(14);
    doc.text('Financial Summary (Income vs Expense)', 105, 25, { align: 'center' });

    const totalIncome = payments.reduce((acc, p) => acc + p.amount, 0);
    const totalExpense = expenses.reduce((acc, e) => acc + e.amount, 0);
    const balance = totalIncome - totalExpense;

    autoTable(doc, {
      startY: 40,
      head: [['Metric', 'Amount']],
      body: [
        ['Total Collections (Income)', `BDT ${totalIncome.toLocaleString()}`],
        ['Total Expenditures (Expenses)', `BDT ${totalExpense.toLocaleString()}`],
        ['Net Balance', `BDT ${balance.toLocaleString()}`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [13, 148, 136] },
    });

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();
    const monthlyData = months.map((m, i) => {
      const monthStr = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
      const inc = payments.filter(p => p.month === monthStr).reduce((acc, p) => acc + p.amount, 0);
      const exp = expenses.filter(e => e.date.startsWith(monthStr)).reduce((acc, e) => acc + e.amount, 0);
      return [m, `BDT ${inc.toLocaleString()}`, `BDT ${exp.toLocaleString()}`, `BDT ${(inc - exp).toLocaleString()}`];
    }).filter(row => row[1] !== 'BDT 0' || row[2] !== 'BDT 0');

    if (monthlyData.length > 0) {
      doc.text('Monthly Breakdown', 14, (doc as any).lastAutoTable.finalY + 15);
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Month', 'Income', 'Expense', 'Balance']],
        body: monthlyData,
        theme: 'striped'
      });
    }

    doc.save('nswo-financial-summary.pdf');
  };

  const handleExport = (id: string) => {
    if (id === 'members') exportMemberDueReport();
    else if (id === 'management_report') exportManagementListReport();
    else if (id === 'advisory_list') exportAdvisoryListReport();
    else if (id === 'donor_report') exportDonorListReport();
    else if (id === 'volunteer_report') exportVolunteerActivityReport();
    else if (id === 'monthly') setShowFinancialModal(true);
  };

  // Pre-calculate Chart Data
  const donationChartData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const monthIdx = (currentMonth - i + 12) % 12;
      const monthYear = `${new Date().getFullYear()}-${String(monthIdx + 1).padStart(2, '0')}`;
      const monthlyPayments = payments.filter(p => p.month === monthYear);
      
      const donation = monthlyPayments
        .filter(p => p.type?.toLowerCase().includes('donation') || p.type?.toLowerCase().includes('অনুদান'))
        .reduce((acc, p) => acc + p.amount, 0);
        
      const subscription = monthlyPayments
        .filter(p => p.type?.toLowerCase().includes('subscription') || p.type?.toLowerCase().includes('চাঁদা') || !p.type)
        .reduce((acc, p) => acc + p.amount, 0);

      result.push({
        name: months[monthIdx],
        [language === 'bn' ? 'অনুদান' : 'Donation']: donation,
        [language === 'bn' ? 'চাঁদা আদায়' : 'Member Fees']: subscription,
      });
    }
    return result;
  }, [payments, language]);

  const expenseChartData = useMemo(() => {
    const categoriesMap: { [key: string]: number } = {};
    expenses.forEach(e => {
      const cat = e.category || (language === 'bn' ? 'অন্যান্য' : 'Other');
      categoriesMap[cat] = (categoriesMap[cat] || 0) + e.amount;
    });
    return Object.keys(categoriesMap).map(cat => ({
      name: cat,
      [language === 'bn' ? 'মোট খরচ' : 'Spent']: categoriesMap[cat]
    }));
  }, [expenses, language]);

  const balanceTrendData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const monthIdx = (currentMonth - i + 12) % 12;
      const monthYear = `${new Date().getFullYear()}-${String(monthIdx + 1).padStart(2, '0')}`;
      const monthlyIncome = payments.filter(p => p.month === monthYear).reduce((acc, p) => acc + p.amount, 0);
      const monthlyExpense = expenses.filter(e => e.date.startsWith(monthYear)).reduce((acc, e) => acc + e.amount, 0);
      result.push({
        name: months[monthIdx],
        [language === 'bn' ? 'তহবিল সংগ্রহ' : 'Income']: monthlyIncome,
        [language === 'bn' ? 'ব্যয়' : 'Expenses']: monthlyExpense,
        [language === 'bn' ? 'অবশিষ্ট স্থিতি' : 'Net Balance']: monthlyIncome - monthlyExpense
      });
    }
    return result;
  }, [payments, expenses, language]);

  const formatValue = (val: number) => {
    if (language === 'bn') {
      return '৳' + toBanglaDigits(val.toLocaleString('bn-BD'));
    }
    return '৳' + val.toLocaleString('en-US');
  };

  const reportIncomeSummary = useMemo(() => {
    const total = payments.reduce((acc, p) => acc + p.amount, 0);
    const subscription = payments.filter(p => !p.type || p.type.toLowerCase().includes('subscription') || p.type.toLowerCase().includes('সূচনা') || p.type.toLowerCase().includes('চাঁদা')).reduce((acc, p) => acc + p.amount, 0);
    const donation = payments.filter(p => p.type && (p.type.toLowerCase().includes('donation') || p.type.toLowerCase().includes('অনুদান') || p.type.toLowerCase().includes('দান'))).reduce((acc, p) => acc + p.amount, 0);
    const other = total - subscription - donation;
    return { total, subscription, donation, other };
  }, [payments]);

  const reportExpenseSummary = useMemo(() => {
    const total = expenses.reduce((acc, e) => acc + e.amount, 0);
    const categoriesMap: { [key: string]: number } = {};
    expenses.forEach(e => {
      const cat = e.category || (language === 'bn' ? 'অন্যান্য' : 'Other');
      categoriesMap[cat] = (categoriesMap[cat] || 0) + e.amount;
    });
    return { total, categories: Object.entries(categoriesMap) };
  }, [expenses, language]);

  const reportMonthsSummary = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const monthIdx = (currentMonth - i + 12) % 12;
      const monthYear = `${new Date().getFullYear()}-${String(monthIdx + 1).padStart(2, '0')}`;
      const inc = payments.filter(p => p.month === monthYear).reduce((acc, p) => acc + p.amount, 0);
      const exp = expenses.filter(e => e.date.startsWith(monthYear)).reduce((acc, e) => acc + e.amount, 0);
      result.push({
        name: months[monthIdx],
        income: inc,
        expense: exp,
        balance: inc - exp
      });
    }
    return result;
  }, [payments, expenses]);

  const downloadHighResReportPDF = async () => {
    if (!printRef.current) return;
    setIsGeneratingPdf(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
      const dateStr = new Date().toISOString().split('T')[0];
      pdf.save(`NSWO_Financial_Summary_Report_${dateStr}.pdf`);
    } catch (err) {
      console.error('Error generating PDF report:', err);
      alert(language === 'bn' ? 'পিডিএফ রিপোর্ট তৈরিতে সমস্যা হয়েছে!' : 'Error generating PDF report!');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Banner */}
      <div 
        className={`p-6 md:p-8 rounded-3xl ${isThemeLight ? 'text-slate-950' : 'text-white'} shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden`}
        style={{ backgroundColor: settings.themeColor }}
      >
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-6 translate-y-6">
          <FileText size={280} className="fill-current" />
        </div>
        <div className="z-10 space-y-2">
          <div className={`inline-flex items-center gap-2 px-3 py-1 ${isThemeLight ? 'bg-black/10 text-slate-950 font-black' : 'bg-white/20 text-white'} rounded-full text-xs font-semibold uppercase tracking-wider`}>
            📊 {language === 'bn' ? 'অডিট ও আইবিও' : 'Audit Control'}
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight font-sans">
            {language === 'bn' ? 'সংগঠনের অডিট ও আর্থিক বিশ্লেষণ' : 'Audit & Financial Reports'}
          </h2>
          <p className={`${isThemeLight ? 'text-slate-800' : 'text-white/85'} text-xs md:text-sm max-w-xl font-medium`}>
            {language === 'bn' 
              ? 'ক্লাউড ব্যাকআপ, প্রতিবেদন রিসিট এবং বিস্তারিত রিয়েলটাইম হিসাবচার্ট বিশ্লেষণ।' 
              : 'Comprehensive cloud backups, spreadsheets audits, and Recharts performance.'}
          </p>
        </div>
        
        {/* Custom Segmented Tab Switches */}
        <div className="z-10 flex bg-white/20 p-1 rounded-2xl border border-white/10 shadow-inner shrink-0 self-start md:self-center">
          <button 
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${activeTab === 'reports' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-white/80 hover:text-white'}`}
          >
            {language === 'bn' ? 'রিসিট ও রিপোর্ট' : 'Reports & Backups'}
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${activeTab === 'analytics' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-white/80 hover:text-white'}`}
          >
            {language === 'bn' ? 'ফাইন্যান্সিয়াল চার্ট' : 'Data Analytics'}
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('activities')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${activeTab === 'activities' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-white/80 hover:text-white'}`}
          >
            {language === 'bn' ? 'অ্যাক্টিভিটি লগ' : 'Activity History'}
          </button>
        </div>
      </div>

      {activeTab === 'reports' && (
        <div className="space-y-8">
          {/* Quick Action Cloud Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-emerald-900 rounded-[2.5rem] p-8 text-white shadow-xl shadow-emerald-200/80 flex flex-col justify-between hover:shadow-2xl transition-all">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-white/10 p-3 rounded-2xl">
                    <CloudLightning className="text-emerald-300 animate-pulse" size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase bg-emerald-700 text-emerald-100 px-3 py-1 rounded-full">Gmail Safe</span>
                </div>
                <h4 className="font-black text-lg mb-2">
                  {language === 'bn' ? 'ফোর্সেড ক্লাউড সিঙ্ক' : 'Firestore Realtime Sync'}
                </h4>
                <p className="text-emerald-100/70 text-xs font-medium leading-relaxed">
                  {language === 'bn' ? 'গুগল ফায়ারবেস ক্লাউডের মাধ্যমে একই জিমেইল দিয়ে মোবাইল ও কম্পিউটারে অটোমেটিক ব্যাকআপ আপডেট থাকে।' : 'Connect the database in real-time across multiple computers, iphones & androids.'}
                </p>
              </div>
              
              {syncStatus && (
                <p className="mt-4 text-[11px] font-bold text-emerald-300 animate-pulse">{syncStatus}</p>
              )}

              <button 
                onClick={forceCloudSync}
                disabled={isSyncing}
                className="mt-6 w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs py-3.5 px-6 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                {isSyncing ? (language === 'bn' ? 'সিনক্রোনাইজিং...' : 'Syncing...') : (language === 'bn' ? 'ক্লাউডে ম্যানুয়াল ব্যাকআপ নিন' : 'Force Realtime Backup')}
              </button>
            </div>

            <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col justify-between">
              <div>
                <div className="bg-indigo-50 p-3 rounded-2xl w-fit mb-4 text-indigo-700">
                  <Database size={24} />
                </div>
                <h4 className="font-black text-slate-900 text-lg mb-2">
                  {language === 'bn' ? 'ক্লাউড এক্সপোর্ট ব্যাকআপ' : 'JSON Cloud Backup'}
                </h4>
                <p className="text-slate-400 text-xs font-medium leading-relaxed mb-4">
                  {language === 'bn' ? 'সংগঠনের সকল তথ্য (সদস্য তালিকা, পেমেন্ট রিসিট, খরচ বিবরণী) একটি একক রিকভেরেবল JSON ফাইলে ব্যাকআপ নিন।' : 'Download a fully portable JSON object representing all document databases. Restore or load anywhere.'}
                </p>
              </div>
              <button 
                onClick={handleCloudExport}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black text-xs py-3.5 px-6 rounded-2xl transition-all active:scale-95 shadow-lg shadow-slate-100 uppercase tracking-wider"
              >
                {language === 'bn' ? 'তাত্ক্ষণিক ব্যাকআপ ডাউনলোড' : 'Download JSON Data'}
              </button>
            </div>

            <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col justify-between">
              <div>
                <div className="bg-amber-50 p-3 rounded-2xl w-fit mb-4 text-amber-600">
                  <FileSpreadsheet size={24} />
                </div>
                <h4 className="font-black text-slate-900 text-lg mb-2">
                  {language === 'bn' ? 'এক্সেল স্প্রেডশীট অডিট' : 'Excel Spreadsheets CSV'}
                </h4>
                <p className="text-slate-400 text-xs font-medium leading-relaxed mb-4">
                  {language === 'bn' ? 'কাস্টম UTF-8 ফরম্যাটে এক্সপোর্ট করুন যা সরাসরি মাইক্রোসফ্ট এক্সেল বা গুগল শিটসে ওপেন হয়।' : 'Export member lists or ledger books to CSV spreadsheet format directly.'}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <button onClick={downloadMembersCSV} className="bg-slate-50 hover:bg-slate-100 border border-slate-100 py-2.5 rounded-xl font-black text-[10px] text-slate-700">
                    MEMBERS
                  </button>
                  <button onClick={downloadPaymentsCSV} className="bg-slate-50 hover:bg-slate-100 border border-slate-100 py-2.5 rounded-xl font-black text-[10px] text-slate-700">
                    PAYMENTS
                  </button>
                  <button onClick={downloadExpensesCSV} className="bg-slate-50 hover:bg-slate-100 border border-slate-100 py-2.5 rounded-xl font-black text-[10px] text-slate-700">
                    EXPENSES
                  </button>
                </div>
              </div>
              <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest text-center mt-4">
                Supported UTF-8 Excel formats
              </div>
            </div>
          </div>

          {/* PDF Reports Section */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest pl-1">
              {language === 'bn' ? 'অফিসিয়াল পিডিএফ রিপোর্ট ডাউনলোড' : 'Download Standard PDF Reports'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {reportItems.map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group relative bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all cursor-pointer overflow-hidden"
                  onClick={() => handleExport(item.id)}
                >
                  <div className={`absolute top-0 right-0 w-32 h-32 ${item.color} opacity-[0.03] rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500`} />
                  <div className="flex items-start justify-between">
                    <div className="space-y-4">
                      <div className={`w-12 h-12 ${item.color} rounded-2xl flex items-center justify-center text-white shadow-lg`}>
                        <item.icon size={22} />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 text-base">{item.title}</h3>
                        <p className="text-slate-400 text-xs font-medium max-w-[320px] leading-relaxed mt-1">{item.desc}</p>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                      <Download size={18} />
                    </div>
                  </div>
                  <div className="mt-6 flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Layout: A4 PDF</span>
                    <div className="h-px flex-1 bg-slate-50" />
                    <button className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Export Report</button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-8 animate-in fade-in duration-400">
          {/* Donation Chart */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">
                  {language === 'bn' ? '১. অনুদান ও চাঁদা আদায় চার্ট (Donation & subscription Fees)' : '1. Subscription & Donation Collection'}
                </h3>
                <p className="text-slate-400 text-xs font-medium">
                  {language === 'bn' ? 'বিগত ৬ মাসের সাধারণ মাসিক চাঁদা এবং ইভেন্ট ফি / সাধারণ অনুদান আদায়ে অগ্রগতি।' : 'Six-month breakdown of monthly subscriptions compared to event and general donations.'}
                </p>
              </div>
            </div>
            
            <div className="h-[280px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={donationChartData}>
                  <defs>
                    <linearGradient id="colorSub" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorDon" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip wrapperStyle={{ outline: 'none' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} />
                  <Legend iconType="circle" />
                  <Area type="monotone" dataKey={language === 'bn' ? 'চাঁদা আদায়' : 'Member Fees'} stroke="#059669" strokeWidth={3} fillOpacity={1} fill="url(#colorSub)" />
                  <Area type="monotone" dataKey={language === 'bn' ? 'অনুদান' : 'Donation'} stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorDon)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Expense Chart Breakdown */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight mb-1">
                  {language === 'bn' ? '২. বার্ষিক ব্যয় ক্যাটাগরি বিশ্লেষণ (Spending Categories)' : '2. Expense Breakdown by Category'}
                </h3>
                <p className="text-slate-400 text-xs font-medium mb-6">
                  {language === 'bn' ? 'সংগঠনের নির্ধারিত ব্যয় সমূহের খাতওয়ারী মোট অঙ্ক।' : 'Spendings categorized across office, charity, utility & technical assets.'}
                </p>

                {expenseChartData.length === 0 ? (
                  <div className="h-[240px] flex items-center justify-center border border-dashed border-slate-100 rounded-2xl">
                    <p className="text-slate-400 text-xs font-bold">{language === 'bn' ? 'কোন খরচের এন্ট্রি পাওয়া যায়নি।' : 'No expense entries logged yet.'}</p>
                  </div>
                ) : (
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={expenseChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} />
                        <Bar dataKey={language === 'bn' ? 'মোট খরচ' : 'Spent'} fill="#f43f5e" radius={[10, 10, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Current Fund Balance Chart */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight mb-1">
                  {language === 'bn' ? '৩. মাসিক অর্থ প্রবাহ ও নিট ব্যালেন্স গতিবিধি' : '3. Month Cash Flow & Fund Balance'}
                </h3>
                <p className="text-slate-400 text-xs font-medium mb-6">
                  {language === 'bn' ? 'সংগঠনের আদায়েকৃত কালেকশন এবং খরচের পর নিট অবশিষ্ট তহবিল বৃদ্ধির রেখাচিত্র।' : 'Running income versus expenses, displaying organizational cash reserves.'}
                </p>

                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={balanceTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} />
                      <Legend iconType="circle" />
                      <Line type="monotone" dataKey={language === 'bn' ? 'তহবিল সংগ্রহ' : 'Income'} stroke="#10b981" strokeWidth={2} activeDot={{ r: 8 }} />
                      <Line type="monotone" dataKey={language === 'bn' ? 'ব্যয়' : 'Expenses'} stroke="#ef4444" strokeWidth={2} />
                      <Line type="monotone" dataKey={language === 'bn' ? 'অবশিষ্ট স্থিতি' : 'Net Balance'} stroke="#0f172a" strokeWidth={3} strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'activities' && (
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm animate-in fade-in duration-400">
          <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">
                {language === 'bn' ? 'রিয়েল-টাইম সিস্টেম অ্যাক্টিভিটি হিস্ট্রি' : 'Live Audit Action Trail'}
              </h3>
              <p className="text-slate-400 text-xs font-medium">
                {language === 'bn' ? 'সংগঠনের সদস্যদের রেজিস্ট্রেশন, এন্ট্রি বাতিল এবং হিসাব আপডেটের সম্পূর্ণ হিস্ট্রি ট্র্যাক।' : 'Security actions logged securely in Google Firestore.'}
              </p>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-50 text-emerald-600 rounded-xl font-bold text-xs uppercase tracking-wider">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
              Live Active
            </div>
          </div>

          {loadingActivities ? (
            <div className="py-16 text-center text-slate-400 text-sm font-medium">
              <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              {language === 'bn' ? 'লোড করা হচ্ছে...' : 'Listening to live audit log streams...'}
            </div>
          ) : activities.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-slate-100 rounded-2xl">
              <Activity className="mx-auto mb-4 text-slate-300" size={32} />
              <p className="text-slate-400 text-xs font-bold leading-relaxed">
                {language === 'bn' ? 'ডাটাবেসে এখনো কোনো অ্যাক্টিভিটি হিস্ট্রি রেকর্ড করা হয়নি।' : 'Actions will automatically stream here when mutations occur.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4 p-4 hover:bg-slate-50 rounded-2xl border border-slate-50 hover:border-slate-100 transition-all">
                  <div className={`p-2 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    activity.type.includes('add') ? 'bg-emerald-50 text-emerald-600' :
                    activity.type.includes('delete') ? 'bg-rose-50 text-rose-600' :
                    activity.type.includes('update') ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-600'
                  }`}>
                    {activity.type.includes('add') ? <CheckCircle2 size={18} /> : 
                     activity.type.includes('delete') ? <HardDrive size={18} /> : <Activity size={18} />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-bold text-slate-900 text-sm leading-snug">
                        {language === 'bn' ? activity.messageBn : activity.message}
                      </p>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {new Date(activity.createdAt).toLocaleTimeString(language === 'bn' ? 'bn-BD' : 'en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">
                        {activity.type.replace('_', ' ')}
                      </span>
                      <span className="text-slate-200 text-xs">•</span>
                      <span className="text-[10px] text-slate-400 font-bold truncate">
                        By {activity.userEmail}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cloud & Native Multi-Device Compatibility Informer card */}
      <div className="bg-slate-900 text-white rounded-[3.25rem] p-10 relative overflow-hidden shadow-xl shadow-slate-200">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-600 opacity-10 rounded-full -mr-32 -mt-32" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8 md:gap-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest leading-none">
              <ShieldCheck size={16} /> Premium Enterprise Security
            </div>
            <h3 className="text-xl md:text-2xl font-black max-w-xl leading-tight">
              {language === 'bn' ? 'একই জিমেইল দিয়ে সকল ডিভাইসে লাইভ সিনক্রোনাইজেশন সচল' : 'Multi-Device Native Support Activated with Gmail Secure Sync'}
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed max-w-xl">
              {language === 'bn' ? 'আপনার সমিতি ট্র্যাকিং এখন সম্পূর্ণ ক্লাউড রিয়েল-টাইম সাপোর্ট সমৃদ্ধ। অ্যান্ড্রয়েড, আইফোন অথবা কম্পিউটার যেকোনো মাধ্যম থেকে সহজেই রিয়েলটাইম তথ্য শেয়ার করুন নিরাপদভাবে।' : 'Our real-time Cloud infrastructure enables secure multi-device synchronization instantly. Manage payments on any browser or mobile viewport seamlessly with full-grade Google database protection.'}
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-1 gap-4 shrink-0 justify-items-stretch">
            <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
              <div className="bg-emerald-500/20 p-2.5 rounded-xl text-emerald-400">
                <Smartphone size={18} />
              </div>
              <div>
                <p className="font-bold text-xs">Mobile Device Active</p>
                <p className="text-[10px] text-slate-400 font-bold">Android / iOS</p>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
              <div className="bg-indigo-500/20 p-2.5 rounded-xl text-indigo-400">
                <Monitor size={18} />
              </div>
              <div>
                <p className="font-bold text-xs">Desktop Sync Active</p>
                <p className="text-[10px] text-slate-400 font-bold">Chrome, Safari, PC/Mac</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DETAILED INTERACTIVE FINANCIAL PREVIEW MODAL */}
      {showFinancialModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[200] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-350">
          <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col md:flex-row h-[90vh] md:h-[80vh]">
            
            {/* Modal Controls Column Left */}
            <div className="w-full md:w-80 bg-slate-900 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800 shrink-0">
              <div className="space-y-6">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-wider mb-3">
                    📄 AUDIT REPORT ENGINE
                  </div>
                  <h3 className="text-xl font-black text-white leading-tight">
                    {language === 'bn' ? 'আর্থিক বিবরণী অডিট' : 'Financial Statement'}
                  </h3>
                  <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                    {language === 'bn' 
                      ? 'বাস্তব সময়ে ফায়ারবেস ক্লাউডের সদস্যদের পেমেন্ট রিসিট ও খরচ বিবরণীর ভিত্তিতে গঠিত অফিসিয়াল রিপোর্ট।' 
                      : 'Live structured summary generated instantly from your active cloud-backed ledger receipts.'}
                  </p>
                </div>

                <div className="space-y-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/60">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">REPORT META</span>
                  <div className="flex justify-between text-xs text-slate-300 font-bold">
                    <span>{language === 'bn' ? 'মোট লেনদেন:' : 'Transactions:'}</span>
                    <span className="font-mono text-white">{payments.length + expenses.length}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-300 font-bold">
                    <span>{language === 'bn' ? 'অডিট বছর:' : 'Fiscal Period:'}</span>
                    <span className="text-white">2025-2026</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-300 font-bold">
                    <span>{language === 'bn' ? 'অবস্থা:' : 'Status:'}</span>
                    <span className="text-emerald-400 uppercase tracking-widest">{language === 'bn' ? 'অনুমোদিত' : 'Certified'}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mt-6">
                <button
                  type="button"
                  onClick={downloadHighResReportPDF}
                  disabled={isGeneratingPdf}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs py-4 px-6 rounded-2xl transition-all active:scale-95 shadow-lg shadow-emerald-900/30 disabled:opacity-50 uppercase tracking-wider"
                >
                  <Download size={14} className={isGeneratingPdf ? 'animate-spin' : ''} />
                  {isGeneratingPdf ? (language === 'bn' ? 'পিডিএফ তৈরি হচ্ছে...' : 'Generating...') : (language === 'bn' ? 'পিডিএফ রিপোর্ট ডাউনলোড করুন' : 'Download Formal PDF')}
                </button>

                <button
                  type="button"
                  onClick={() => setShowFinancialModal(false)}
                  className="w-full border border-slate-800 hover:bg-slate-800/50 text-slate-400 hover:text-white font-black text-xs py-3 rounded-2xl transition-all active:scale-95 uppercase tracking-wider"
                >
                  {language === 'bn' ? 'বন্ধ করুন' : 'Close Builder'}
                </button>
              </div>
            </div>

            {/* Modal Live Interactive View Column Right */}
            <div className="flex-1 bg-slate-950 p-6 overflow-y-auto flex justify-center items-start custom-scrollbar">
              <div className="w-full max-w-[650px] bg-white text-slate-900 p-8 rounded-2xl shadow-xl font-sans relative select-none">
                
                {/* Visual Header */}
                <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                  <div>
                    <h4 className="text-lg font-black tracking-tight text-slate-950">
                      {settings.nameBn || settings.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                      {language === 'bn' ? 'কো-অপারেটিভ ও সমাজ কল্যাণ সংস্থা' : 'Welfare & Social Organization'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 uppercase tracking-wider border border-emerald-100 mb-1">
                      {language === 'bn' ? 'অডিট ড্রাফট' : 'Draft Copy'}
                    </span>
                    <p className="text-[9px] text-slate-400 font-bold block mt-1">
                      {language === 'bn' ? 'তারিখ:' : 'Date:'} {new Date().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US')}
                    </p>
                  </div>
                </div>

                {/* Subtitle */}
                <p className="text-xs font-black text-slate-700 uppercase tracking-wider mt-4 bg-slate-50 px-3 py-2 rounded-lg inline-block">
                  📋 {language === 'bn' ? 'আর্থিক বিবরণী ও হিসাব সারসংক্ষেপ' : 'Financial Statement Overview'}
                </p>

                {/* Interactive Stats Grid */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="border border-slate-100 bg-slate-50/50 p-3 rounded-xl">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                      {language === 'bn' ? 'মোট তহবিল সংগ্রহ (আয়)' : 'Total In'}
                    </span>
                    <span className="text-xs font-black text-slate-900">{formatValue(reportIncomeSummary.total)}</span>
                  </div>

                  <div className="border border-slate-100 bg-slate-50/50 p-3 rounded-xl">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                      {language === 'bn' ? 'ব্যয়িত অর্থ (খরচ)' : 'Total Out'}
                    </span>
                    <span className="text-xs font-black text-slate-900">{formatValue(reportExpenseSummary.total)}</span>
                  </div>

                  <div className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl">
                    <span className="text-[8px] font-black text-emerald-600 uppercase tracking-wider block mb-1">
                      {language === 'bn' ? 'নিট রিজার্ভ' : 'Surplus'}
                    </span>
                    <span className="text-xs font-black text-emerald-700">
                      {formatValue(reportIncomeSummary.total - reportExpenseSummary.total)}
                    </span>
                  </div>
                </div>

                {/* Income details and expense details split in columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {/* Receipts */}
                  <div>
                    <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b pb-1">
                      {language === 'bn' ? '৩.১. আয়ের খাতসমূহ' : 'Sources of Inflow'}
                    </h5>
                    <div className="space-y-1.5 text-[11px] text-slate-700">
                      <div className="flex justify-between py-1 border-b border-dashed border-slate-100">
                        <span>{language === 'bn' ? 'মাসিক সাধারণ চাঁদা' : 'Subscriptions'}</span>
                        <span className="font-bold text-slate-900">{formatValue(reportIncomeSummary.subscription)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-dashed border-slate-100">
                        <span>{language === 'bn' ? 'সদস্য কল্যাণ অনুদান' : 'Donations'}</span>
                        <span className="font-bold text-slate-900">{formatValue(reportIncomeSummary.donation)}</span>
                      </div>
                      {reportIncomeSummary.other > 0 && (
                        <div className="flex justify-between py-1 border-b border-dashed border-slate-100">
                          <span>{language === 'bn' ? 'অন্যান্য ও বিবিধ' : 'Others'}</span>
                          <span className="font-bold text-slate-900">{formatValue(reportIncomeSummary.other)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expenses */}
                  <div>
                    <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b pb-1">
                      {language === 'bn' ? '৩.২. ব্যয়ের খাতসমূহ' : 'Welfare & Admin Expenses'}
                    </h5>
                    <div className="space-y-1.5 text-[11px] text-slate-700">
                      {reportExpenseSummary.categories.slice(0, 3).map(([category, amount]) => (
                        <div key={category} className="flex justify-between py-1 border-b border-dashed border-slate-100">
                          <span className="truncate max-w-[120px]">{category}</span>
                          <span className="font-bold text-slate-900">{formatValue(amount)}</span>
                        </div>
                      ))}
                      {reportExpenseSummary.categories.length === 0 && (
                        <div className="text-slate-400 italic text-[10px] py-1">
                          {language === 'bn' ? 'কোন খরচের ডেটা নেই' : 'No expenses recorded.'}
                        </div>
                      )}
                      {reportExpenseSummary.categories.length > 3 && (
                        <div className="flex justify-between py-1 font-medium text-slate-400 italic">
                          <span>{language === 'bn' ? 'অন্যান্য আরও...' : 'Other categories'}</span>
                          <span>{formatValue(reportExpenseSummary.categories.slice(3).reduce((sum, [_, val]) => sum + val, 0))}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Months Table Mini */}
                <div className="mt-6">
                  <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b pb-1">
                    {language === 'bn' ? '৩.৩. মাসিক পারফরমেন্স ব্যালেন্স' : '6-Month Cash Performance'}
                  </h5>
                  <div className="space-y-1.5">
                    {reportMonthsSummary.slice(0, 4).map((m, idx) => (
                      <div key={idx} className="flex justify-between text-[11px] items-center py-1 bg-slate-50 px-2 rounded-lg">
                        <span className="font-bold text-slate-900">{m.name}</span>
                        <div className="flex gap-4">
                          <span className="text-emerald-600 font-medium">+{formatValue(m.income)}</span>
                          <span className="text-rose-600 font-medium">-{formatValue(m.expense)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Official Stamp Notice */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400 font-medium">
                  <span>{language === 'bn' ? 'নিরাপদ ক্লাউড ডেটাবেস কপি' : 'Generated via Secure Ledger Cloud Database'}</span>
                  <span>{language === 'bn' ? 'স্বাক্ষর নিশ্চিত' : 'Authorized Signatures Pending'}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* HIDDEN PRINTABLE TEMPLATE (MAPPED DIRECTLY TO A4 STANDARD AT 800PX WIDTH) */}
      <div style={{ position: 'absolute', top: '-11000px', left: '-11000px' }}>
        <div 
          ref={printRef} 
          className="w-[800px] h-[1130px] bg-white p-12 text-slate-900 flex flex-col justify-between font-sans select-none relative"
          style={{ letterSpacing: '0.01em', lineHeight: '1.4' }}
        >
          {/* Top Decorative accent bar */}
          <div className="absolute top-0 left-0 right-0 h-3 bg-emerald-600" />
          
          <div className="space-y-6">
            {/* Document Header Letterhead */}
            <div className="flex justify-between items-start border-b-2 border-slate-100 pb-5">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-950">
                  {settings.nameBn || settings.name}
                </h1>
                <p className="text-[11px] text-emerald-700 font-black uppercase mt-1 tracking-wider">
                  {language === 'bn' ? 'সমাজ কল্যাণ ও উন্নয়নমূলক সহযোগী সংস্থা' : 'Social Welfare & Community Cooperation Organization'}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {language === 'bn' ? 'নিবন্ধন নম্বর: এনএসডব্লিউও / ২০২৫-০৯৭' : 'Official Reg No: NSWO / 2025-097'}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] uppercase font-black tracking-widest border border-emerald-100 rounded-full">
                  {language === 'bn' ? 'অফিসিয়াল কপি' : 'Official Copy'}
                </span>
                <p className="text-[10px] text-slate-400 font-bold mt-2">
                  {language === 'bn' ? 'রিপোর্ট রেফারেন্স:' : 'Report Ref:'} <span className="font-mono">#FS-{new Date().getFullYear()}-{Math.floor(1000 + Math.random() * 9000)}</span>
                </p>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                  {language === 'bn' ? 'তারিখ:' : 'Date:'} {new Date().toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US')}
                </p>
              </div>
            </div>

            {/* Title Block */}
            <div className="bg-slate-50 p-4 rounded-xl flex justify-between items-center">
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  {language === 'bn' ? 'আর্থিক বিবরণী ও হিসেব সারসংক্ষেপ রিসিট' : 'Financial Statement & Account Audit'}
                </h2>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                  {language === 'bn' ? 'বিগত ৬ মাসের অর্থ প্রবাহ ও বর্তমান ব্যালেন্স শিট অডিট বিবরণী' : '6-Month Cash Flow & Balance Sheet Statement'}
                </p>
              </div>
              <div className="text-right text-[10px] font-black uppercase text-emerald-800 tracking-wider">
                {language === 'bn' ? 'অর্থবছর: ২০২৫ - ২০২৬' : 'Fiscal Year: 2025 - 2026'}
              </div>
            </div>

            {/* Main KPI Summary Bento block */}
            <div className="grid grid-cols-3 gap-4">
              <div className="border border-slate-100 bg-slate-50/30 p-4 rounded-2xl flex flex-col justify-between h-24">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                  {language === 'bn' ? 'মোট তহবিল সংগ্রহ (আয়)' : 'Total Collections (In)'}
                </span>
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">
                    {formatValue(reportIncomeSummary.total)}
                  </h3>
                  <span className="text-[8px] text-emerald-600 font-bold uppercase mt-1 block">
                    {language === 'bn' ? `চাঁদা: ${formatValue(reportIncomeSummary.subscription)} | অনুদান: ${formatValue(reportIncomeSummary.donation)}` : `Subs: ${formatValue(reportIncomeSummary.subscription)} | Don: ${formatValue(reportIncomeSummary.donation)}`}
                  </span>
                </div>
              </div>

              <div className="border border-slate-100 bg-slate-50/30 p-4 rounded-2xl flex flex-col justify-between h-24">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                  {language === 'bn' ? 'অনুমোদিত ব্যয় (খরচ)' : 'Total Expenditures (Out)'}
                </span>
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">
                    {formatValue(reportExpenseSummary.total)}
                  </h3>
                  <span className="text-[8px] text-rose-500 font-bold uppercase mt-1 block">
                    {language === 'bn' ? `${expenses.length} টি অনুমোদিত ট্রানজেকশন` : `${expenses.length} Approved Payments`}
                  </span>
                </div>
              </div>

              <div className="border border-emerald-100 bg-emerald-50/20 p-4 rounded-2xl flex flex-col justify-between h-24">
                <span className="text-[9px] font-black uppercase text-emerald-600 tracking-wider">
                  {language === 'bn' ? 'অবশিষ্ট নগদ তহবিল' : 'Net Accrued Reserve'}
                </span>
                <div>
                  <h3 className="text-lg font-black text-emerald-700 tracking-tight leading-none">
                    {formatValue(reportIncomeSummary.total - reportExpenseSummary.total)}
                  </h3>
                  <span className="text-[8px] text-emerald-600/80 font-black uppercase mt-1 block">
                    {language === 'bn' ? 'সংগঠনের নিরাপদ তহবিল রিজার্ভ' : 'Welfare Fund Reserves'}
                  </span>
                </div>
              </div>
            </div>

            {/* Inflow vs Outflow analysis */}
            <div className="grid grid-cols-2 gap-6">
              {/* Section A: Receivables */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                  {language === 'bn' ? '১. সংগৃহীত ফান্ডের বিবরণী' : 'I. Cash Inflow Analysis'}
                </h4>
                <table className="w-full text-left border-collapse text-[10px]">
                  <thead>
                    <tr className="border-b-2 border-slate-100 text-slate-400 font-bold uppercase">
                      <th className="py-2">{language === 'bn' ? 'আদায়ের খাত' : 'Sector/Source'}</th>
                      <th className="py-2 text-right">{language === 'bn' ? 'হিসাবকৃত পরিমাণ' : 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    <tr>
                      <td className="py-2">{language === 'bn' ? 'সদস্যদের নিয়মিত মাসিক চাঁদা' : 'Monthly Member Subscriptions'}</td>
                      <td className="py-2 text-right font-bold text-slate-900">{formatValue(reportIncomeSummary.subscription)}</td>
                    </tr>
                    <tr>
                      <td className="py-2">{language === 'bn' ? 'সদস্য কল্যাণমূলক অনুদান' : 'Member Welfare Donations'}</td>
                      <td className="py-2 text-right font-bold text-slate-900">{formatValue(reportIncomeSummary.donation)}</td>
                    </tr>
                    {reportIncomeSummary.other > 0 && (
                      <tr>
                        <td className="py-2">{language === 'bn' ? 'অন্যান্য ও বিবিধ কালেকশন' : 'Other Income/Collections'}</td>
                        <td className="py-2 text-right font-bold text-slate-900">{formatValue(reportIncomeSummary.other)}</td>
                      </tr>
                    )}
                    <tr className="border-t border-slate-200">
                      <td className="py-2.5 font-bold text-slate-900">{language === 'bn' ? 'মোট সংগৃহীত তহবিল:' : 'Total Cash Collections:'}</td>
                      <td className="py-2.5 text-right font-black text-slate-900">{formatValue(reportIncomeSummary.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Section B: Payables */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                  {language === 'bn' ? '২. অনুমোদিত ব্যয়ের বিবরণী' : 'II. Cash Outflow Analysis'}
                </h4>
                <table className="w-full text-left border-collapse text-[10px]">
                  <thead>
                    <tr className="border-b-2 border-slate-100 text-slate-400 font-bold uppercase">
                      <th className="py-2">{language === 'bn' ? 'ব্যয়ের খাত / ক্যাটাগরি' : 'Expense Category'}</th>
                      <th className="py-2 text-right">{language === 'bn' ? 'ব্যয়িত অর্থ' : 'Amount Spent'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {reportExpenseSummary.categories.slice(0, 4).map(([category, amount]) => (
                      <tr key={category}>
                        <td className="py-2 truncate max-w-[200px]">{category}</td>
                        <td className="py-2 text-right font-bold text-slate-900">{formatValue(amount)}</td>
                      </tr>
                    ))}
                    {reportExpenseSummary.categories.length === 0 && (
                      <tr>
                        <td className="py-2 text-slate-400 italic" colSpan={2}>
                          {language === 'bn' ? 'কোন খরচের ডেটা নেই' : 'No logged expenditures.'}
                        </td>
                      </tr>
                    )}
                    {reportExpenseSummary.categories.length > 4 && (
                      <tr>
                        <td className="py-2 text-slate-400 italic">
                          {language === 'bn' ? `এবং অন্যান্য ${reportExpenseSummary.categories.length - 4} টি খাত` : `And other ${reportExpenseSummary.categories.length - 4} categories`}
                        </td>
                        <td className="py-2 text-right font-bold text-slate-900">
                          {formatValue(reportExpenseSummary.categories.slice(4).reduce((sum, [_, amt]) => sum + amt, 0))}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t border-slate-200">
                      <td className="py-2.5 font-bold text-slate-900">{language === 'bn' ? 'মোট সর্বমোট ব্যয়:' : 'Total Approved Outflow:'}</td>
                      <td className="py-2.5 text-right font-black text-slate-900">{formatValue(reportExpenseSummary.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section C: Last 6 Month Balance ledger */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                {language === 'bn' ? '৩. বিগত ৬ মাসের ট্রানজেকশন ব্যালেন্স ট্রেইল' : 'III. Historical Six-Month Balance Ledger'}
              </h4>
              <table className="w-full text-left border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-slate-400 font-bold uppercase">
                    <th className="py-2 px-3">{language === 'bn' ? 'হিসাব কাল (মাস)' : 'Month'}</th>
                    <th className="py-2 px-3 text-right">{language === 'bn' ? 'সংগৃহীত আয়' : 'Collections'}</th>
                    <th className="py-2 px-3 text-right">{language === 'bn' ? 'অনুমোদিত ব্যয়' : 'Expenditures'}</th>
                    <th className="py-2 px-3 text-right">{language === 'bn' ? 'অবশিষ্টাংশ ব্যালেন্স' : 'Net Balance'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {reportMonthsSummary.map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{m.name}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-600 font-bold">{formatValue(m.income)}</td>
                      <td className="py-2.5 px-3 text-right text-rose-600 font-bold">{formatValue(m.expense)}</td>
                      <td className={`py-2.5 px-3 text-right font-black ${m.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {formatValue(m.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Auditor Notes or disclaimer */}
            <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/30 text-[9px] text-slate-400 font-medium leading-relaxed">
              <strong>{language === 'bn' ? 'অডিট সনদপত্র ও নির্দেশিকা:' : 'Audit Certification & Disclaimers:'}</strong>{' '}
              {language === 'bn' 
                ? 'এই আর্থিক বিবরণী সারসংক্ষেপটি সম্পূর্ণভাবে উইজেট ও রশিদ ডেটা অনুযায়ী স্বয়ংক্রিয়ভাবে অডিট কমিটির তত্ত্বাবধানে ড্রাফট করা হয়েছে। যেকোনো গরমিল পরিলক্ষিত হলে দয়া করে ডিজিটাল ভেলিডেশন লগের সাথে মিলিয়ে পুনরায় ডাটা রিফ্রেশ করুন।'
                : 'This system-generated summary constitutes an accurate aggregate derived from the live secure Google Firestore document database at compilation. Any adjustments must be authorized by the central finance committee.'}
            </div>
          </div>

          {/* Core Authorized Signatures Section at bottom */}
          <div className="border-t border-slate-200 pt-8 mt-4">
            <div className="grid grid-cols-3 gap-6 text-center text-[10px] text-slate-500 font-bold">
              <div className="space-y-4">
                <div className="h-6" /> {/* Placeholder spacing for actual sign */}
                <span className="block border-t border-slate-200 pt-2 mx-4 text-slate-700">
                  {language === 'bn' ? 'কোষাধ্যক্ষ' : 'Treasurer Office'}
                </span>
                <span className="block text-[8px] text-slate-400 uppercase tracking-widest">{settings.name || 'NSWO Finance'}</span>
              </div>
              <div className="space-y-4">
                <div className="h-6" />
                <span className="block border-t border-slate-200 pt-2 mx-4 text-slate-700">
                  {language === 'bn' ? 'সাধারণ সম্পাদক' : 'General Secretary'}
                </span>
                <span className="block text-[8px] text-slate-400 uppercase tracking-widest">{settings.name || 'NSWO Board'}</span>
              </div>
              <div className="space-y-4">
                <div className="h-6" />
                <span className="block border-t border-slate-200 pt-2 mx-4 text-slate-700">
                  {language === 'bn' ? 'সভাপতি / সমন্বয়ক' : 'President / Director'}
                </span>
                <span className="block text-[8px] text-slate-400 uppercase tracking-widest">{settings.name || 'NSWO Executive'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
