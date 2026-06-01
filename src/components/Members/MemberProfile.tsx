/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Phone, MapPin, Calendar, CreditCard, 
  ChevronRight, BadgeCheck, User, ArrowRight, ArrowLeft, Receipt, Edit2, ChevronLeft,
  QrCode, Download, RefreshCw
} from 'lucide-react';
import { Member, MemberStatus, Payment, MemberRoleType } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { usePayments } from '../../hooks/usePayments';
import { useMembers } from '../../hooks/useMembers';
import { getImageUrl, cleanCssText } from '../../lib/utils';

const getCountryFlag = (country?: string) => {
  if (!country) return '';
  const c = country.toLowerCase().trim();
  if (c.includes('bangladesh') || c.includes('বাংলাদেশ') || c === 'bd') return '🇧🇩';
  if (c.includes('saudi') || c.includes('সৌদি') || c.includes('ksa') || c.includes('madinah') || c.includes('makkah')) return '🇸🇦';
  if (c.includes('emirates') || c.includes('uae') || c.includes('ইউএই') || c.includes('দুবাই') || c.includes('dubai') || c.includes('sharijah') || c.includes('sharjah') || c.includes('abudhabi') || c.includes('abu dhabi')) return '🇦🇪';
  if (c.includes('qatar') || c.includes('কাতার')) return '🇶🇦';
  if (c.includes('oman') || c.includes('ওমান')) return '🇴🇲';
  if (c.includes('kuwait') || c.includes('কুয়েত')) return '🇰🇼';
  if (c.includes('bahrain') || c.includes('বাহরাইন')) return '🇧🇭';
  if (c.includes('malaysia') || c.includes('মালয়েশিয়া')) return '🇲🇾';
  if (c.includes('singapore') || c.includes('সিঙ্গাপুর')) return '🇸🇬';
  if (c.includes('usa') || c.includes('america') || c.includes('ইউএসএ') || c.includes('আমেরিকা')) return '🇺🇸';
  if (c.includes('uk') || c.includes('britain') || c.includes('লন্ডন') || c.includes('london')) return '🇬🇧';
  if (c.includes('italy') || c.includes('ইতালি')) return '🇮🇹';
  if (c.includes('canada') || c.includes('কানাডা')) return '🇨🇦';
  return '🌍'; // default fallback globe
};

const getWhatsAppLink = (phone: string) => {
  let digits = phone.replace(/\D/g, '');
  
  // If it starts with 880, it's already full country code format
  if (digits.startsWith('880')) {
    return `https://wa.me/${digits}`;
  }
  
  // If it's 11 digits starting with 0, add 88
  if (digits.startsWith('0') && digits.length === 11) {
    return `https://wa.me/88${digits}`;
  }
  
  // If it's 10 digits and starts with 1, add 880
  if (digits.startsWith('1') && digits.length === 10) {
    return `https://wa.me/880${digits}`;
  }
  
  return `https://wa.me/${digits}`;
};

const formatCountryText = (countryStr: string, language: 'bn' | 'en') => {
  const trimmed = countryStr.trim();
  if (language === 'bn') {
    if (trimmed.includes('প্রবাসী')) return trimmed;
    return `${trimmed} প্রবাসী`;
  } else {
    if (trimmed.toLowerCase().includes('expatriate') || trimmed.toLowerCase().includes('expat')) return trimmed;
    return `${trimmed} Expatriate`;
  }
};

interface MemberProfileProps {
  member: Member;
  onClose: () => void;
  onEdit?: () => void;
}

export default function MemberProfile({ member, onClose, onEdit }: MemberProfileProps) {
  const { t, language, isAdmin, settings } = useAppContext();
  const { getMemberPayments } = usePayments();
  const { updateMember } = useMembers();
  const [includeInMonthlyLedger, setIncludeInMonthlyLedger] = useState(member.includeInMonthlyLedger !== false);
  const [isUpdatingLedger, setIsUpdatingLedger] = useState(false);

  useEffect(() => {
    setIncludeInMonthlyLedger(member.includeInMonthlyLedger !== false);
  }, [member.includeInMonthlyLedger]);

  const handleToggleLedger = async () => {
    const newValue = !includeInMonthlyLedger;
    setIncludeInMonthlyLedger(newValue);
    setIsUpdatingLedger(true);
    try {
      await updateMember(member.id, {
        includeInMonthlyLedger: newValue
      });
    } catch (err) {
      console.error("Failed to update membership ledger status:", err);
      setIncludeInMonthlyLedger(member.includeInMonthlyLedger !== false);
    } finally {
      setIsUpdatingLedger(false);
    }
  };
  
  const triggerDirectCall = (phoneStr: string) => {
    const formattedPhone = phoneStr.replace(/[^0-9+]/g, '');
    try {
      window.location.href = `tel:${formattedPhone}`;
    } catch (err) {
      console.error("Direct Call trigger error:", err);
    }
  };

  const triggerWhatsAppChat = (phoneStr: string) => {
    const link = getWhatsAppLink(phoneStr);
    try {
      const win = window.open(link, '_blank');
      if (win) {
        win.focus();
      } else {
        window.location.href = link;
      }
    } catch (err) {
      window.location.href = link;
    }
  };

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Payment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (showHistory) {
      loadHistory();
    }
  }, [showHistory]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    const data = await getMemberPayments(member.id);
    setHistory(data);
    setLoadingHistory(false);
  };

  const [activeCardSide, setActiveCardSide] = useState<'front' | 'back'>('front');
  const [downloadingPDF, setDownloadingPDF] = useState(false);

  const downloadIDCardPDF = async () => {
    setDownloadingPDF(true);
    const frontEl = document.getElementById('id-card-front');
    const backEl = document.getElementById('id-card-back');
    if (!frontEl || !backEl) {
      alert(language === 'bn' ? 'আইডি কার্ড রেন্ডার হচ্ছে না, অনুগ্রহ করে একটু অপেক্ষা করুন।' : 'ID card element not ready, please wait.');
      setDownloadingPDF(false);
      return;
    }

    try {
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      // Force heavy quality rendering and resolve crossOrigin images (like profile photos)
      const canvasFront = await html2canvas(frontEl, { 
        scale: 3, 
        useCORS: true, 
        allowTaint: true,
        backgroundColor: null,
        logging: false,
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
      const canvasBack = await html2canvas(backEl, { 
        scale: 3, 
        useCORS: true, 
        allowTaint: true,
        backgroundColor: null,
        logging: false,
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

      const imgFront = canvasFront.toDataURL('image/png');
      const imgBack = canvasBack.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Standard CR80 Card Dimensions: 85.6mm x 53.98mm
      const cardW = 85.6;
      const cardH = 53.98;
      const x = (210 - cardW) / 2; // Center horizontally on A4 (210mm width)
      const y1 = 45;
      const y2 = y1 + cardH + 20;

      // Render Header Title on PDF page
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(15, 23, 42); // slate-900
      pdf.text(language === 'bn' ? 'স্মার্ট ডিজিটাল আইডি কার্ড' : 'Smart Digital Membership ID Card', 105, 25, { align: 'center' });
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(100, 116, 139); // slate-500
      pdf.text(language === 'bn' ? 'নাছিরেরটেক সমাজ কল্যাণ সংস্থা - ডিজিটাল মেম্বার ভেরিফিকেশন' : 'Nashirertek Social Welfare Association - Member Verification Ledger', 105, 31, { align: 'center' });

      // ID Card FRONT Label & Frame
      pdf.setLineWidth(0.3);
      pdf.setDrawColor(226, 232, 240); // slate-200
      pdf.line(15, 38, 195, 38);

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(71, 85, 105); // slate-600
      pdf.text(language === 'bn' ? 'ID CARD FRONT' : 'ID CARD FRONT', 105, y1 - 4, { align: 'center' });
      pdf.addImage(imgFront, 'PNG', x, y1, cardW, cardH);

      // ID CARD BACK Label & Frame
      pdf.text(language === 'bn' ? 'ID CARD BACK' : 'ID CARD BACK', 105, y2 - 4, { align: 'center' });
      pdf.addImage(imgBack, 'PNG', x, y2, cardW, cardH);

      pdf.line(15, y2 + cardH + 12, 195, y2 + cardH + 12);

      // Footer Organization Guidelines
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(148, 163, 184); // slate-400
      pdf.text(
        language === 'bn' 
          ? 'যাচাই করতে পিছনের কিউআর কোডটি স্ক্যান করুন। এই কার্ডটি সংস্থার প্রশাসনিক ব্যবহারের জন্য।' 
          : 'To verify membership, scan the QR code on the back. This card is official property of NSWA.',
        105, 
        y2 + cardH + 18, 
        { align: 'center' }
      );

      pdf.save(`Smart_ID_Card_${member.memberId || 'NSWO'}.pdf`);
    } catch (err) {
      console.error('Error compiled PDF ID Card generate failed:', err);
      alert('PDF download failed. Working dynamically in offline cashmode.');
    } finally {
      setDownloadingPDF(false);
    }
  };

  const calculateFinancials = () => {
    const joined = new Date(member.joinedDate);
    const today = new Date();
    
    // Calculate total months (inclusive of the joined month)
    const years = today.getFullYear() - joined.getFullYear();
    const months = today.getMonth() - joined.getMonth();
    const totalMonths = Math.max(1, (years * 12) + months + 1);
    
    const monthlyFee = typeof member.monthlySubscription === 'number' ? member.monthlySubscription : 500;
    const expectedCollection = totalMonths * monthlyFee;
    const paidMonths = monthlyFee > 0 ? Math.floor((member.totalPaid || 0) / monthlyFee) : totalMonths;
    const dueAmount = Math.max(0, expectedCollection - (member.totalPaid || 0));
    const dueMonths = monthlyFee > 0 ? Math.max(0, totalMonths - paidMonths) : 0;

    // Calculate collection rate (percentage of paid vs expected)
    const collectionRate = expectedCollection > 0 
      ? Math.min(100, Math.round(((member.totalPaid || 0) / expectedCollection) * 100))
      : 100;

    return {
      totalMonths,
      paidMonths,
      dueMonths,
      dueAmount,
      monthlyFee,
      collectionRate,
      expectedCollection
    };
  };

  const financials = calculateFinancials();

  const getRoleTheme = () => {
    const role = member.roleType || MemberRoleType.GENERAL;
    if (role === MemberRoleType.ADVISORY) {
      return {
        bg: 'bg-indigo-900',
        gradient: 'from-indigo-800 to-indigo-950',
        text: 'text-indigo-750',
        lightBg: 'bg-indigo-50/50',
        border: 'border-indigo-100',
        badge: 'bg-indigo-50 text-indigo-750 border border-indigo-100',
        iconBg: 'bg-indigo-50/70 text-indigo-600',
        label: member.designation || (language === 'bn' ? 'উপদেষ্টা মহোদয়' : 'Advisory Board'),
        labelColor: 'bg-indigo-100/80 text-indigo-900 border-indigo-200'
      };
    }
    if (role === MemberRoleType.VOLUNTEER) {
      return {
        bg: 'bg-orange-800',
        gradient: 'from-orange-700 to-orange-950',
        text: 'text-orange-750',
        lightBg: 'bg-orange-50/50',
        border: 'border-orange-100',
        badge: 'bg-orange-50 text-orange-750 border border-orange-100',
        iconBg: 'bg-orange-50/70 text-orange-600',
        label: member.volunteerType || (language === 'bn' ? 'স্বেচ্ছাসেবী' : 'Volunteer'),
        labelColor: 'bg-orange-100/80 text-orange-900 border-orange-200'
      };
    }
    if (role === MemberRoleType.MANAGEMENT) {
      return {
        bg: 'bg-rose-900',
        gradient: 'from-rose-800 to-rose-955',
        text: 'text-rose-750',
        lightBg: 'bg-rose-50/50',
        border: 'border-rose-100',
        badge: 'bg-rose-50 text-rose-750 border border-rose-100',
        iconBg: 'bg-rose-50/70 text-rose-600',
        label: member.designation || (language === 'bn' ? 'ম্যানেজমেন্ট মেম্বার' : 'Management Member'),
        labelColor: 'bg-rose-100/80 text-rose-900 border-rose-200'
      };
    }
    if (role === MemberRoleType.DONOR) {
      return {
        bg: 'bg-amber-900',
        gradient: 'from-amber-800 to-amber-955',
        text: 'text-amber-700',
        lightBg: 'bg-amber-50/50',
        border: 'border-amber-100',
        badge: 'bg-amber-50 text-amber-755 border border-amber-100',
        iconBg: 'bg-amber-50/70 text-amber-600',
        label: member.designation || (language === 'bn' ? 'ডোনার সদস্য' : 'Donor / Sponsor'),
        labelColor: 'bg-amber-100/80 text-amber-900 border-amber-200'
      };
    }
    const labelMain = (language === 'bn' ? 'সাধারণ সদস্য' : 'General Member');
    return {
      bg: 'bg-emerald-900',
      gradient: 'from-emerald-850 to-emerald-950',
      text: 'text-emerald-750',
      lightBg: 'bg-emerald-50/50',
      border: 'border-emerald-100',
      badge: 'bg-emerald-50 text-emerald-750 border border-emerald-100',
      iconBg: 'bg-emerald-50/70 text-emerald-600',
      label: labelMain,
      labelColor: 'bg-emerald-100/80 text-emerald-900 border-emerald-250'
    };
  };

  const theme = getRoleTheme();

  const getRoleCardStyles = () => {
    const role = member.roleType || MemberRoleType.GENERAL;
    switch (role) {
      case MemberRoleType.ADVISORY:
        return {
          bgGradient: 'from-[#0c0f24] via-[#101332] to-[#040514]',
          borderColor: 'border-indigo-500/30',
          logoGlow: 'shadow-indigo-500/20',
          sealColor: '#4f46e5',
          goldAccent: 'text-indigo-300',
          statusActiveBg: 'bg-indigo-500/20 border-indigo-400/30 text-indigo-200',
          ribbonBg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-200',
        };
      case MemberRoleType.MANAGEMENT:
        return {
          bgGradient: 'from-[#200307] via-[#2d050c] to-[#0f0103]',
          borderColor: 'border-rose-500/40',
          logoGlow: 'shadow-rose-500/35',
          sealColor: '#e11d48',
          goldAccent: 'text-rose-350',
          statusActiveBg: 'bg-rose-500/20 border-rose-400/30 text-rose-200',
          ribbonBg: 'bg-rose-500/10 border-rose-500/20 text-rose-200',
        };
      case MemberRoleType.DONOR:
        return {
          bgGradient: 'from-[#1e1002] via-[#2d1803] to-[#0b0501]',
          borderColor: 'border-amber-500/50',
          logoGlow: 'shadow-amber-500/40',
          sealColor: '#d97706',
          goldAccent: 'text-amber-300',
          statusActiveBg: 'bg-amber-500/20 border-amber-400/30 text-amber-200',
          ribbonBg: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
        };
      case MemberRoleType.VOLUNTEER:
        return {
          bgGradient: 'from-[#1f0e03] via-[#2a1304] to-[#0c0501]',
          borderColor: 'border-orange-500/40',
          logoGlow: 'shadow-orange-500/30',
          sealColor: '#ea580c',
          goldAccent: 'text-orange-300',
          statusActiveBg: 'bg-orange-500/25 border-orange-450/25 text-orange-200',
          ribbonBg: 'bg-orange-500/10 border-orange-500/20 text-orange-200',
        };
      case MemberRoleType.GENERAL:
      default:
        return {
          bgGradient: 'from-[#021d10] via-[#01351c] to-[#001007]',
          borderColor: 'border-emerald-500/30',
          logoGlow: 'shadow-emerald-500/25',
          sealColor: '#10b981',
          goldAccent: 'text-emerald-300',
          statusActiveBg: 'bg-emerald-500/20 border-emerald-400/35 text-emerald-250',
          ribbonBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200',
        };
    }
  };

  const cardStyle = getRoleCardStyles();

  const formatJoinDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const currentYear = new Date().getFullYear();

  const getSleekBadge = () => {
    const role = member.roleType || MemberRoleType.GENERAL;
    switch (role) {
      case MemberRoleType.ADVISORY:
        return (
          <span className="inline-flex items-center gap-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span>🟣</span>
            <span>{member.designation || (language === 'bn' ? 'উপদেষ্টা মহোদয়' : 'Advisor')}</span>
          </span>
        );
      case MemberRoleType.MANAGEMENT:
        return (
          <span className="inline-flex items-center gap-1 bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-450 animate-pulse" />
            <span>🔴</span>
            <span>{member.designation || (language === 'bn' ? 'ম্যানেজমেন্ট মেম্বার' : 'Management')}</span>
          </span>
        );
      case MemberRoleType.DONOR:
        return (
          <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>🟡</span>
            <span>{member.designation || (language === 'bn' ? 'আজীবন দাতা' : 'Donor')}</span>
          </span>
        );
      case MemberRoleType.VOLUNTEER:
        return (
          <span className="inline-flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 text-orange-300 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span>🟠</span>
            <span>{member.volunteerType || (language === 'bn' ? 'স্বেচ্ছাসেবী' : 'Volunteer')}</span>
          </span>
        );
      case MemberRoleType.GENERAL:
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>🟢</span>
            <span>{language === 'bn' ? 'সাধারণ সদস্য' : 'General Member'}</span>
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
      />
      
      {/* Responsive Premium Modal Container Frame (Perfect on both mobile & desktop) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 50 }}
        className="relative w-full max-w-md bg-[#fafbfe] sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden border-t sm:border border-slate-200/60 max-h-[95vh] sm:max-h-[90vh] flex flex-col bottom-0 sm:bottom-auto absolute sm:relative"
      >
        {/* Top Sticky bar layout (Sleek Compact Side-by-side Layout) */}
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3 bg-white border-b border-slate-100 shrink-0 sticky top-0 z-10">
          <button 
            onClick={onClose} 
            className="p-1 rounded-full text-slate-700 hover:bg-slate-100 active:scale-90 transition-all justify-self-start"
          >
            <ChevronLeft size={20} className="stroke-[2.5]" />
          </button>
          
          <div className="flex items-center justify-center gap-2 min-w-0">
            {getImageUrl(settings?.logoURL) && (
              <img 
                src={getImageUrl(settings.logoURL)} 
                alt="Logo" 
                className="w-6 h-6 rounded-md object-cover border border-slate-150 shadow-xs shrink-0" 
                referrerPolicy="no-referrer" 
              />
            )}
            <div className="text-left min-w-0">
              <span className="text-[9px] font-black text-emerald-800 tracking-tight uppercase leading-none block truncate max-w-[170px]">
                {language === 'bn' ? 'নাছিরেরটেক সমাজ কল্যাণ সংস্থা' : 'Nashirertek Social Welfare Association'}
              </span>
              <span className="text-[8px] font-semibold text-slate-500 tracking-tight mt-0.5 leading-none block">
                {language === 'bn' ? 'ডিজিটাল সদস্য পরিচয়পত্র' : 'Digital Member ID Card'}
              </span>
            </div>
          </div>

          {isAdmin && onEdit ? (
            <button 
              onClick={onEdit}
              className="p-1 rounded-full text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 active:scale-95 transition-all justify-self-end border border-slate-100"
            >
              <Edit2 size={14} />
            </button>
          ) : (
            <div className="w-6 h-6" />
          )}
        </div>

        {/* Scrollable area of the Screen Mockup */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">

          {/* Premium Membership Identity Card (Completely stable, solid design with no layouts shifting) */}
          <div className="relative w-full overflow-hidden shadow-lg rounded-[1.8rem] border border-white/10 mt-1" id="membership-identity-card-front-static">
            {/* Front side of the card (Encodes front graphical layout) */}
            <div 
              id="id-card-front"
              className={`bg-gradient-to-br ${cardStyle.bgGradient} text-white overflow-hidden flex flex-col w-full relative`}
            >
              {/* Glassmorphic reflecting surface overlay */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/[0.03] to-white/[0.08] pointer-events-none" />
              <div className="absolute top-0 right-[-10%] w-[120%] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
              
              {/* Background luxury highlights and dynamic stamps */}
              <div className="absolute top-0 right-0 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
              <div className="absolute bottom-0 left-8 w-16 h-16 bg-white/5 rounded-full blur-lg pointer-events-none" />
              
              {/* Security official-looking watermark stamp */}
              <div className="absolute -right-4 -bottom-4 w-28 h-28 opacity-[0.04] pointer-events-none text-white">
                <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <circle cx="50" cy="50" r="45" strokeDasharray="3 3" />
                  <circle cx="50" cy="50" r="38" />
                  <path d="M50 20 L50 80 M20 50 L80 50 M29 29 L71 71 M29 71 L71 29" strokeLinecap="round" />
                </svg>
              </div>

              {/* Top Organization Header inside the card */}
              <div className="bg-black/35 px-3 py-2.5 border-b border-white/10 relative z-10 shrink-0 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {getImageUrl(settings?.logoURL) && (
                    <img 
                      src={getImageUrl(settings.logoURL)} 
                      alt="Logo" 
                      className="w-7 h-7 rounded-md object-cover border border-white/20 shadow-xs bg-white shrink-0" 
                      referrerPolicy="no-referrer" 
                    />
                  )}
                  <div className="text-left min-w-0">
                    <h4 className="text-[9.5px] font-black text-white tracking-wide leading-none select-none truncate max-w-[130px] sm:max-w-[160px]">
                      {language === 'bn' ? 'নাছিরেরটেক সমাজ কল্যাণ সংস্থা' : 'Nashirertek Social Welfare Association'}
                    </h4>
                    <p className="text-[6.5px] font-extrabold text-amber-200/90 leading-none mt-1 uppercase tracking-wider select-none truncate max-w-[130px] sm:max-w-[160px]">
                      {language === 'bn' ? 'একটি অরাজনৈতিক সামাজিক সংগঠন' : 'A Non-Political Social Organization'}
                    </p>
                  </div>
                </div>
                
                {/* Premium Gold Category badge */}
                <span className="flex items-center gap-0.5 bg-amber-550/25 border border-amber-500/35 text-amber-300 text-[6.5px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full shadow-xs select-none shrink-0">
                  <span className="animate-spin text-[5.5px]" style={{ animationDuration: '6s' }}>✦</span>
                  <span>VIP</span>
                </span>
              </div>
              
              <div className="p-3.5 flex items-center gap-3.5 relative z-10 w-full">
                {/* Photo on left side */}
                <div className="relative shrink-0 flex flex-col items-center gap-1.5">
                  <div className="relative">
                    {/* Glowing VIP ring photo display */}
                    <div className="relative w-18 h-18 rounded-full overflow-hidden p-0.5 border border-amber-500/20 shadow-lg bg-black/20">
                      <div className="w-full h-full rounded-full overflow-hidden border-2 border-white bg-slate-800">
                        {getImageUrl(member.photoURL) ? (
                          <img 
                            src={getImageUrl(member.photoURL)} 
                            alt={member.name} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-teal-950 text-white text-2xl font-black">
                            {member.name[0]}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Facebook style active status indicator circle */}
                    <div className={`absolute bottom-0 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-900 flex items-center justify-center shadow-md ${
                      member.status === MemberStatus.ACTIVE ? 'bg-emerald-400' : 'bg-slate-400'
                    }`}>
                      {member.status === MemberStatus.ACTIVE && (
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                      )}
                    </div>
                  </div>
                  
                  {/* Small Status underneath the photo */}
                  <span className={`inline-flex items-center gap-1 text-[7.5px] px-1.5 py-0.5 rounded-full border leading-none font-bold shadow-sm ${
                    member.status === MemberStatus.ACTIVE 
                      ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-200' 
                      : 'bg-slate-500/20 border-slate-400/20 text-slate-300'
                  }`}>
                    <span className={`w-0.5 h-0.5 rounded-full ${member.status === MemberStatus.ACTIVE ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                    {member.status === MemberStatus.ACTIVE ? (
                      language === 'bn' ? 'সক্রিয়' : 'Active'
                    ) : (
                      language === 'bn' ? 'নিষ্ক্রিয়' : 'Inactive'
                    )}
                  </span>
                </div>

                {/* Profile info column on right side */}
                <div className="min-w-0 flex-1 pl-1 space-y-1.5 flex flex-col items-start justify-center text-left self-center">
                  <h2 className="text-base font-black text-white tracking-tight leading-snug drop-shadow-md text-left">
                    {language === 'bn' ? (member.nameBn || member.name) : member.name}
                  </h2>
                  
                  {/* 3 meta lines grouped and perfectly left-aligned together */}
                  <div className="flex flex-col items-start justify-center gap-1.5 w-full text-left">
                    {/* 1. Designation */}
                    {(member.designation || member.roleType !== MemberRoleType.GENERAL) && (
                      <div className="text-[10px] font-extrabold text-[#ffd700] tracking-wide drop-shadow-sm flex items-center justify-start gap-1 leading-none text-left">
                        <span className="text-amber-400 text-[11px] font-normal shrink-0">🏅</span>
                        <span className="leading-tight">
                          {member.roleType === MemberRoleType.ADVISORY ? (
                            member.designation || (language === 'bn' ? 'উপдеষ্টা মহোদয়' : 'Advisor')
                          ) : member.roleType === MemberRoleType.VOLUNTEER ? (
                            member.volunteerType || (language === 'bn' ? 'স্বেচ্ছাসেবী' : 'Volunteer')
                          ) : member.roleType === MemberRoleType.MANAGEMENT ? (
                            member.designation || (language === 'bn' ? 'ম্যানেজমেন্ট মেম্বার' : 'Management Member')
                          ) : member.roleType === MemberRoleType.DONOR ? (
                            member.designation || (language === 'bn' ? 'ডোনার' : 'Donor / Sponsor')
                          ) : (
                            member.designation
                          )}
                        </span>
                      </div>
                    )}

                    {/* 2. Country of Residence */}
                    {member.country && (
                      <div className="flex items-center justify-start text-left">
                        <div className="inline-flex items-center justify-start gap-1 bg-white/10 border border-white/15 px-2 py-0.5 rounded-full text-[8.5px] text-amber-100 font-extrabold shadow-sm leading-none text-left">
                          <span className="shrink-0 text-xs">{getCountryFlag(member.country)}</span>
                          <span>{formatCountryText(member.country, language)}</span>
                        </div>
                      </div>
                    )}

                    {/* 3. Official Category Flag */}
                    <div className="pt-0.5 leading-none flex items-center justify-start text-left">
                      {getSleekBadge()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info Section Cards (Beautiful & Compact Mobile-Skin Responsive Grid Layout) */}
          <div className="grid grid-cols-2 gap-2">
            {/* 1. Phone & Call Card */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-3xs p-2 flex items-center justify-between group hover:border-[#01582e]/25 transition-colors col-span-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                  <Phone size={12} className="stroke-[2.5]" />
                </div>
                <div className="min-w-0">
                  <span className="text-[8px] font-extrabold text-slate-400 block uppercase tracking-wider leading-none">
                    {language === 'bn' ? 'মোবাইল নাম্বার' : 'Mobile Number'}
                  </span>
                  <span className="text-xs font-bold text-slate-800 block mt-0.5 leading-none select-all font-mono">
                    {member.phone}
                  </span>
                </div>
              </div>

              {/* Instant Call Button inside the card */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  triggerDirectCall(member.phone);
                }}
                id="direct-call-link"
                className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100/90 active:scale-95 text-[#01582e] px-2 py-1 rounded-lg text-[8px] font-black shadow-3xs transition-all shrink-0 cursor-pointer"
              >
                <Phone size={8} strokeWidth={3} />
                <span>{language === 'bn' ? 'কল' : 'Call'}</span>
              </button>
            </div>

            {/* 2. Address Location Card */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-3xs p-2 flex items-center gap-2 group hover:border-amber-500/25 transition-colors col-span-2 min-w-0">
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg shrink-0">
                <MapPin size={12} className="stroke-[2.5]" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[8px] font-extrabold text-slate-400 block uppercase tracking-wider leading-none">
                  {language === 'bn' ? 'ঠিকানা / অঞ্চল' : 'Address / Residence'}
                </span>
                <span className="text-xs font-semibold text-slate-700 block mt-0.5 leading-normal max-w-full">
                  {member.address}
                </span>
              </div>
            </div>

            {/* 3. Join Date Card */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-3xs p-2 flex items-center gap-2 group hover:border-indigo-500/25 transition-colors min-w-0">
              <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                <Calendar size={12} className="stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <span className="text-[8px] font-extrabold text-slate-400 block uppercase tracking-wider leading-none">
                  {language === 'bn' ? 'যোগদানের তারিখ' : 'Date of Joining'}
                </span>
                <span className="text-xs font-extrabold text-slate-800 block mt-0.5 leading-none">
                  {formatJoinDate(member.joinedDate)}
                </span>
              </div>
            </div>

            {/* 4. Monthly Subscription Card */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-3xs p-2 flex items-center gap-2 group hover:border-emerald-500/25 transition-colors min-w-0">
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                <CreditCard size={12} className="stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <span className="text-[8px] font-extrabold text-slate-400 block uppercase tracking-wider leading-none">
                  {language === 'bn' ? 'নির্ধারিত মাসিক চাঁদা' : 'Monthly Fee'}
                </span>
                <span className="text-xs font-black text-[#01582e] block mt-0.5 leading-none">
                  ৳{financials.monthlyFee}
                </span>
              </div>
            </div>
          </div>

          {/* Monthly Subscription Inclusion Toggle (Only admins can toggle, but others can see the status) */}
          <div className="bg-white rounded-[1.8rem] border border-slate-100 shadow-sm p-4 flex items-center justify-between gap-4 group transition-colors">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl shrink-0 transition-colors ${includeInMonthlyLedger ? 'bg-emerald-55 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                <CreditCard size={20} className="stroke-[2.5]" />
              </div>
              <div className="text-left min-w-0">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">
                  {language === 'bn' ? 'মাসিক চাঁদা তালিকা অন্তর্ভুক্তি' : 'Monthly subscription list'}
                </h4>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-relaxed">
                  {language === 'bn' 
                    ? (includeInMonthlyLedger 
                        ? 'সদস্যটি মাসিক চাঁদার আওতায় আছেন ও সীটে প্রদর্শিত হবেন' 
                        : 'সদস্যটি মাসিক চাঁদা তালিকার বাইরে আছেন')
                    : (includeInMonthlyLedger 
                        ? 'Included in monthly subscriptions & ledger sheets' 
                        : 'Excluded from monthly subscription ledger')}
                </p>
              </div>
            </div>
            
            {isAdmin ? (
              <button
                type="button"
                onClick={handleToggleLedger}
                disabled={isUpdatingLedger}
                className={`w-12 h-6 rounded-full p-0.5 transition-colors focus:ring-2 focus:ring-emerald-500 focus:outline-none flex ${includeInMonthlyLedger ? 'bg-emerald-600 justify-end' : 'bg-slate-200 justify-start'} ${isUpdatingLedger ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                id="toggle-subscription-inclusion"
              >
                <span className="w-5 h-5 rounded-full bg-white shadow-md block" />
              </button>
            ) : (
              <div className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg tracking-wider ${includeInMonthlyLedger ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                {language === 'bn' 
                  ? (includeInMonthlyLedger ? 'চালু' : 'বন্ধ') 
                  : (includeInMonthlyLedger ? 'ON' : 'OFF')}
              </div>
            )}
          </div>

          {/* Conditional Role attributes for Advisory */}
          {member.roleType === MemberRoleType.ADVISORY && (
            <div className="bg-white rounded-[1.8rem] border border-slate-100 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-black text-indigo-850 uppercase tracking-wider">
                {language === 'bn' ? 'উপদেষ্টা তথ্য ও ভূমিকা' : 'Advisory Notes'}
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-100/60">
                  <span className="text-xs text-slate-500 font-bold">{language === 'bn' ? 'পদবী' : 'Designation'}</span>
                  <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
                    {member.designation}
                  </span>
                </div>
                {member.responsibilities && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{language === 'bn' ? 'দায়িত্ব' : 'Responsibilities'}</span>
                    <p className="text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {member.responsibilities}
                    </p>
                  </div>
                )}
                {member.adviceNotes && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{language === 'bn' ? 'পরামর্শ' : 'Advice'}</span>
                    <p className="text-xs font-semibold text-indigo-900 bg-indigo-50/30 p-3 rounded-xl border border-indigo-100/50 italic">
                      "{member.adviceNotes}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conditional Role attributes for Volunteer */}
          {member.roleType === MemberRoleType.VOLUNTEER && (
            <div className="bg-white rounded-[1.8rem] border border-slate-100 shadow-sm p-4 space-y-3">
              <h3 className="text-sm font-black text-orange-850 uppercase tracking-wider">
                {language === 'bn' ? 'স্বেচ্ছাসেবী বিবরণ' : 'Volunteer Details'}
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-xs text-slate-500 font-bold">{language === 'bn' ? 'ভূমিকা' : 'Role'}</span>
                  <span className="text-xs font-black text-orange-700 bg-orange-50 px-2.5 py-1 rounded-lg">
                    {member.volunteerType || 'Volunteer'}
                  </span>
                </div>
                {member.dutyArea && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{language === 'bn' ? 'রিসোর্স এরিয়া / অঞ্চল' : 'Duty Area'}</span>
                    <p className="text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl">
                      {member.dutyArea}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* General subscription information/financial tables inside mockup cards */}
          {(!member.roleType || member.roleType === MemberRoleType.GENERAL || member.roleType === MemberRoleType.MANAGEMENT || member.roleType === MemberRoleType.DONOR) && (
            <>
              {/* Collection Summary Segment */}
              <div className="bg-white rounded-[1.8rem] border border-slate-100 shadow-sm p-3.5 space-y-2.5">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                  <span>{member.roleType === MemberRoleType.DONOR ? (language === 'bn' ? 'ফান্ডিং বা মহত অনুদান হিসেব' : 'Donation Summary') : (language === 'bn' ? 'আদায়ের সারসংক্ষেপ' : 'Collection Summary')}</span>
                  <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    {currentYear}
                  </span>
                </h3>
                
                {member.roleType === MemberRoleType.DONOR ? (
                  /* 2-Column Grid for Donors */
                  <div className="grid grid-cols-2 gap-2">
                    {/* Total Paid block */}
                    <div className="bg-amber-50/15 border border-amber-500/10 rounded-2xl p-4 text-center flex flex-col justify-center py-5 shadow-xs">
                      <span className="text-xs font-bold text-amber-850 tracking-tight leading-tight">
                        {language === 'bn' ? 'মোট অনুদান পরিমাণ' : 'Total Contributed'}
                      </span>
                      <span className="text-lg md:text-xl font-black text-amber-700 tracking-tight leading-none mt-2">
                        ৳{(member.totalPaid || 0).toLocaleString()}
                      </span>
                    </div>

                    {/* Total Donation times */}
                    <div className="bg-indigo-55/15 border border-indigo-500/10 rounded-2xl p-4 text-center flex flex-col justify-center py-5 shadow-xs">
                      <span className="text-xs font-bold text-indigo-850 tracking-tight leading-tight">
                        {language === 'bn' ? 'মোট প্রদেয় রসিদ সংখ্যা' : 'Receipt Count'}
                      </span>
                      <span className="text-lg md:text-xl font-black text-indigo-700 leading-none mt-2">
                        {history.length || financials.paidMonths || 0}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* 4-Column Grid mapping identically to sketch illustration */
                  <div className="grid grid-cols-4 gap-1.5">
                    
                    {/* Total Paid block */}
                    <div className="bg-emerald-50/15 border border-emerald-500/10 rounded-2xl p-2 text-center flex flex-col justify-center py-2.5 shadow-xs">
                      <span className="text-[9px] md:text-[10px] font-bold text-emerald-800 tracking-tight leading-tight">
                        {language === 'bn' ? 'মোট জমা' : 'Total Paid'}
                      </span>
                      <span className="text-xs md:text-sm font-black text-emerald-700 tracking-tight leading-none mt-1">
                        ৳{(member.totalPaid || 0).toLocaleString()}
                      </span>
                    </div>

                    {/* Total Due block */}
                    <div className="bg-rose-50/15 border border-rose-500/10 rounded-2xl p-2 text-center flex flex-col justify-center py-2.5 shadow-xs animate-pulse-slow">
                      <span className="text-[9px] md:text-[10px] font-bold text-rose-800 tracking-tight leading-tight">
                        {language === 'bn' ? 'মোট বাকি' : 'Total Due'}
                      </span>
                      <span className="text-xs md:text-sm font-black text-rose-600 tracking-tight leading-none mt-1">
                        ৳{financials.dueAmount.toLocaleString()}
                      </span>
                    </div>

                    {/* Paid Months block */}
                    <div className="bg-sky-50/15 border border-sky-500/10 rounded-2xl p-2 text-center flex flex-col justify-center py-2.5 shadow-xs">
                      <span className="text-[9px] md:text-[10px] font-bold text-sky-800 tracking-tight leading-tight">
                        {language === 'bn' ? 'জমা মাস' : 'Paid Months'}
                      </span>
                      <span className="text-sm md:text-base font-black text-slate-800 leading-none mt-1">
                        {financials.paidMonths}
                      </span>
                    </div>

                    {/* Due Months block */}
                    <div className="bg-amber-50/15 border border-amber-550/15 rounded-2xl p-2 text-center flex flex-col justify-center py-2.5 shadow-xs">
                      <span className="text-[9px] md:text-[10px] font-bold text-amber-900 tracking-tight leading-tight">
                        {language === 'bn' ? 'বাকি মাস' : 'Due Months'}
                      </span>
                      <span className="text-sm md:text-base font-black text-[#854d0e] leading-none mt-1">
                        {financials.dueMonths}
                      </span>
                    </div>

                  </div>
                )}
              </div>

              {/* Progress Bar Container: "Member Overview" block */}
              {member.roleType !== MemberRoleType.DONOR && (
                <div className="bg-white rounded-[1.8rem] border border-slate-100 shadow-sm p-3.5 space-y-2">
                  <h3 className="text-sm font-black text-slate-800">
                    {language === 'bn' ? 'সদস্য পরিচিতি চিত্র' : 'Member Overview'}
                  </h3>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-500">
                        {language === 'bn' ? 'আদায়ের হার (শতকরা)' : 'Collection Rate'}
                      </span>
                      <span className="font-black text-emerald-700 font-mono">
                        {financials.collectionRate}%
                      </span>
                    </div>
                    
                    {/* Premium track and slide effect indicator */}
                    <div className="w-full bg-slate-150 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#01582e] h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${financials.collectionRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Action: Payment History Drawer click */}
              <div className="pt-2">
                <button 
                  onClick={() => setShowHistory(true)}
                  className="w-full flex items-center justify-between bg-slate-900 hover:bg-slate-800 active:scale-98 text-white p-4 px-5 rounded-[1.5rem] transition-all shadow-lg shadow-slate-200 group font-bold text-sm"
                >
                  <span>
                    {language === 'bn' ? 'পেমেন্ট রশিদ বা ইতিহাস দেখুন' : 'View Core Payment History'}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 font-medium group-hover:text-white transition-colors">
                      {history.length || financials.paidMonths}
                    </span>
                    <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>
            </>
          )}

        </div>

        {/* Fixed/Sticky Floating Action Footer Bar (WhatsApp & Direct Call combo) */}
        <div className="px-4 py-2.5 bg-white/95 backdrop-blur-md border-t border-slate-100/90 shrink-0 flex items-center gap-2.5 relative z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
          <button 
            onClick={() => triggerDirectCall(member.phone)}
            id="floating-phone-btn"
            className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl text-xs font-black shadow-xs active:scale-[0.97] transition-all cursor-pointer"
          >
            <Phone size={13} className="stroke-[2.5]" />
            <span>{language === 'bn' ? 'সরাসরি কল' : 'Direct Call'}</span>
          </button>
          <button 
            onClick={() => triggerWhatsAppChat(member.phone)}
            id="floating-whatsapp-btn"
            className="flex-1 flex-center flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-xl text-xs font-black shadow-md shadow-emerald-500/10 active:scale-[0.97] transition-all cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.18 1.449 4.825 1.451 5.436 0 9.86-4.42 9.864-9.864.002-2.637-1.03-5.114-2.903-6.989-1.873-1.873-4.351-2.903-6.99-2.903-5.44 0-9.865 4.423-9.87 9.869-.001 1.768.468 3.49 1.357 5.02l-.994 3.63 3.716-.974zm11.332-6.522c-.3-.15-1.776-.877-2.047-.976-.27-.099-.467-.149-.662.15-.195.298-.755.95-.926 1.149-.17.199-.34.224-.64.075-.3-.15-1.266-.467-2.41-1.485-.89-.794-1.49-1.774-1.665-2.073-.175-.3-.019-.463.13-.612.135-.133.3-.349.45-.523.15-.174.2-.299.3-.499.1-.199.05-.374-.025-.523-.075-.15-.662-1.595-.91-2.189-.24-.576-.484-.499-.662-.499-.17 0-.365-.01-.56-.01-.195 0-.51.074-.775.358-.265.283-1.01.986-1.01 2.404s1.025 2.787 1.17 2.986c.145.199 2.016 3.078 4.885 4.317.682.295 1.216.471 1.632.603.685.218 1.31.187 1.805.114.55-.082 1.776-.726 2.027-1.428.25-.705.25-1.31.175-1.43-.075-.12-.275-.195-.575-.345z"/>
            </svg>
            <span>WhatsApp</span>
          </button>
        </div>

        {/* Drawer slide-out panel for Payment Records (Highly integrated) */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="absolute inset-0 bg-white z-[30] flex flex-col"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                <button 
                  onClick={() => setShowHistory(false)}
                  className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-extrabold text-xs uppercase tracking-wide transition-colors active:scale-95"
                >
                  <ArrowLeft size={18} />
                  <span>{language === 'bn' ? 'পেছনে' : 'Back'}</span>
                </button>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                  {language === 'bn' ? 'পেমেন্ট রসিদ সমূহ' : 'Payment History'}
                </h3>
                <div className="w-8" />
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-slate-50">
                {loadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-10 h-10 border-4 border-[#01582e] border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs font-bold text-slate-400">Loading history cards...</p>
                  </div>
                ) : history.length > 0 ? (
                  history.map((payment) => (
                    <div 
                      key={payment.id}
                      className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm group hover:border-[#01582e]/40 transition-all duration-350"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-[#01582e] uppercase tracking-wide bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                          #{payment.receiptNo}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">
                          {payment.date || new Date(payment.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-base font-black text-slate-900 leading-none">৳{payment.amount.toLocaleString()}</p>
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 font-bold">
                            <Calendar size={12} className="text-slate-350" />
                            <span>{payment.month}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-450 uppercase tracking-wide">{payment.method}</p>
                          <div className="flex items-center justify-end gap-1 text-[10px] font-black text-emerald-600 uppercase mt-0.5">
                            <BadgeCheck size={12} />
                            <span>Paid</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                    <div className="w-16 h-16 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-300">
                      <Receipt size={28} />
                    </div>
                    <p className="text-sm font-bold text-slate-400">
                      {language === 'bn' ? 'কোন পেমেন্ট রেকর্ড পাওয়া যায়নি' : 'No payment records found'}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </div>
  );
}
