/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Printer, Download, Share2, ShieldCheck, CheckCircle2, FileText, Check, Copy, Calendar, User, Users, MessageSquare } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Payment } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { getImageUrl, cleanCssText } from '../../lib/utils';
import { useMembers } from '../../hooks/useMembers';

interface ReceiptModalProps {
  payment: Payment;
  onClose: () => void;
}

export default function ReceiptModal({ payment, onClose }: ReceiptModalProps) {
  const { language, t, settings } = useAppContext();
  const { members } = useMembers();
  const receiptRef = useRef<HTMLDivElement>(null);
  const member = members.find(m => m.id === payment.memberId);
  const paymentYear = (() => {
    const match = payment.month.match(/\d{4}/);
    if (match) {
      const yr = parseInt(match[0], 10);
      return `${yr}-${(yr + 1).toString().slice(2)}`;
    }
    return '2025-26';
  })();

  const getMethodDetails = () => {
    const m = payment.method?.toLowerCase() || '';
    if (m.includes('sheet') || m.includes('google')) {
      return {
        title: 'Google Sheets',
        subtitle: language === 'bn' ? 'অনলাইন পেমেন্ট' : 'Online Payment'
      };
    }
    if (m.includes('bkash') || m.includes('nagad') || m.includes('rocket') || m.includes('online') || payment.trxId) {
      return {
        title: payment.method || 'Mobile Banking',
        subtitle: language === 'bn' ? 'অনলাইন পেমেন্ট' : 'Online Payment'
      };
    }
    return {
      title: payment.method || (language === 'bn' ? 'নগদ / ক্যাশ' : 'Cash / Hand'),
      subtitle: language === 'bn' ? 'অফলাইন পেমেন্ট' : 'Offline Payment'
    };
  };
  const methodInfo = getMethodDetails();
  const remarksText = payment.remarks || (language === 'bn' ? 'Google Sheet Sync (সেন্ট:) - Automatic Sync' : 'Google Sheet Sync - Automatic Sync');
  const remarksStatusText = language === 'bn' ? 'LIVE SYNC' : 'LIVE SYNC';

  const [isGenerating, setIsGenerating] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<'whatsapp' | 'messenger' | null>(null);
  const [pendingShareUrl, setPendingShareUrl] = useState<string>('');

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Receipt_${payment.receiptNo}`,
  });

  // Synchronous conversion of dataURL to File to avoid fetch context / security restrictions inside secure tabs
  const dataURLToFile = (dataUrl: string, filename: string): File => {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  // Render high-fidelity canvas snapshot of the HTML receipt
  const generateReceiptImageFile = async (): Promise<{ file: File; dataUrl: string; base64: string } | null> => {
    const element = receiptRef.current;
    if (!element) return null;
    try {
      // Create high-pixel canvas (scale = 2 for ultra premium high-res outputs)
      const canvas = await html2canvas(element, {
        scale: 2.2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        height: element.offsetHeight,
        width: element.offsetWidth,
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
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.replace(/^data:image\/(png|jpg);base64,/, "");
      
      const file = dataURLToFile(dataUrl, `Receipt_${payment.receiptNo}.png`);
      return { file, dataUrl, base64 };
    } catch (error) {
      console.error("Error drawing high-res receipt canvas:", error);
      return null;
    }
  };

  // 📥 SAVE RECEIPT IMAGE (PNG)
  const handleDownloadImage = async () => {
    setIsGenerating(true);
    const result = await generateReceiptImageFile();
    setIsGenerating(false);
    if (result) {
      const link = document.createElement('a');
      link.href = result.dataUrl;
      link.download = `Receipt_${payment.receiptNo}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setCopyStatus(language === 'bn' ? 'রসিদের ছবি ডাউনলোড হয়েছে! 📥' : 'Receipt image saved! 📥');
      setTimeout(() => setCopyStatus(null), 2500);
    } else {
      alert(language === 'bn' ? "রসিদ ছবি তৈরিতে সমস্যা হয়েছে!" : "Failed to generate receipt image!");
    }
  };

  // 📥 SAVE RECEIPT PDF (High fidelity embedding)
  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    const result = await generateReceiptImageFile();
    setIsGenerating(false);

    if (result) {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5'
      });
      
      const pageWidth = pdf.internal.pageSize.getWidth(); // 148 mm
      const margin = 8;
      const imgWidth = pageWidth - (margin * 2); // 132 mm
      
      // Load image proportion to avoid distortion
      const img = new Image();
      img.src = result.dataUrl;
      img.onload = () => {
        const ratio = img.height / img.width;
        const imgHeight = imgWidth * ratio;
        
        pdf.addImage(result.dataUrl, 'PNG', margin, 12, imgWidth, imgHeight);
        pdf.save(`Receipt_${payment.receiptNo}.pdf`);
        setCopyStatus(language === 'bn' ? 'পিডিএফ রসিদ সেভ হয়েছে! 📄' : 'Receipt PDF saved! 📄');
        setTimeout(() => setCopyStatus(null), 2500);
      };
    } else {
      // Simple text fallback
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5'
      });
      doc.setFontSize(16);
      doc.text("NSWO OFFICIAL RECEIPT", 10, 20);
      doc.text(`Receipt No: #${payment.receiptNo}`, 10, 32);
      doc.text(`Member Name: ${payment.memberName}`, 10, 42);
      doc.text(`Donated Month: ${payment.month}`, 10, 49);
      doc.text(`Amount: ৳ ${payment.amount}`, 10, 56);
      doc.save(`Receipt_${payment.receiptNo}.pdf`);
    }
  };

  // Copy receipt info nicely to clipboard
  const copyReceiptToClipboard = async () => {
    const textBn = `*নাছিরেরটেক সমাজ কল্যাণ সংস্থা* 🧾\n━━━━━━━━━━━━━━━━━━━━\nসম্মানিত সদস্য, আপনার টাকা আদায়ের রশিদ:\n\n• *রশিদ নং:* #${payment.receiptNo}\n• *তারিখ:* ${payment.date}\n• *সদস্যের নাম:* ${payment.memberName}\n• *জমাকৃত মাস:* ${payment.month}\n• *মোট টাকা:* ৳${payment.amount.toLocaleString()}\n━━━━━━━━━━━━━━━━━━━━\n🌿 প্রতিটি সহযোগিতা একটি সুন্দর ও মানবিক সমাজ গড়তে ভূমিকা রাখে। ধন্যবাদ!`;
    const textEn = `*Nashirertek Social Welfare Association* 🧾\n━━━━━━━━━━━━━━━━━━━━\nOfficial Donation Receipt Details:\n\n• *Receipt No:* #${payment.receiptNo}\n• *Date:* ${payment.date}\n• *Member Name:* ${payment.memberName}\n• *Month:* ${payment.month}\n• *Paid Amount:* ৳${payment.amount.toLocaleString()}\n━━━━━━━━━━━━━━━━━━━━\n🌿 Thank you for your support in building a better community!`;
    const text = language === 'bn' ? textBn : textEn;
    try {
      await navigator.clipboard.writeText(text);
      return text;
    } catch (err) {
      console.warn("Clipboard access not available:", err);
      return text;
    }
  };

  // Helper as fail-safe image clippboard copy
  const copyImageToClipboard = async (dataUrl: string): Promise<boolean> => {
    try {
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob
        })
      ]);
      return true;
    } catch (err) {
      console.warn("Could not copy actual image to clipboard:", err);
      return false;
    }
  };

  // 🟢 WHATSAPP DIRECT SHARE
  const handleWhatsAppShare = async () => {
    setIsGenerating(true);
    const result = await generateReceiptImageFile();
    setIsGenerating(false);

    if (result) {
      // 1. Silent download so users can select it immediately from gallery
      const link = document.createElement('a');
      link.href = result.dataUrl;
      link.download = `Receipt_${payment.receiptNo}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 2. Try copying actual image blob to system clipboard (works beautifully on PC/Desktop & premium mobile)
      await copyImageToClipboard(result.dataUrl);

      // 3. Copy official text summary
      const text = await copyReceiptToClipboard();

      // Check if member phone is available to auto-target them
      const member = members.find(m => m.id === payment.memberId);
      let targetPhone = member?.phone || '';
      let digits = targetPhone.replace(/\D/g, '');
      let wUrl = '';
      
      if (digits.startsWith('0') && digits.length === 11) {
        wUrl = `https://wa.me/88${digits}?text=${encodeURIComponent(text)}`;
      } else if (digits.length >= 8) {
        wUrl = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
      } else {
        wUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      }

      setPendingShareUrl(wUrl);
      setShowGuide('whatsapp');
    } else {
      alert(language === 'bn' ? "রসিদ ছবি তৈরিতে সমস্যা হয়েছে!" : "Failed to generate receipt image!");
    }
  };

  // 🔵 MESSENGER DIRECT SHARE
  const handleMessengerShare = async () => {
    setIsGenerating(true);
    const result = await generateReceiptImageFile();
    setIsGenerating(false);

    if (result) {
      // 1. Silent download so users can select it immediately from gallery
      const link = document.createElement('a');
      link.href = result.dataUrl;
      link.download = `Receipt_${payment.receiptNo}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 2. Try copying actual image blob to clipboard
      await copyImageToClipboard(result.dataUrl);

      // 3. Fallback to copying text template
      await copyReceiptToClipboard();

      setPendingShareUrl('https://m.me');
      setShowGuide('messenger');
    } else {
      alert(language === 'bn' ? "রসিদ ছবি তৈরিতে সমস্যা হয়েছে!" : "Failed to generate receipt image!");
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-8">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-lg bg-white sm:rounded-[2.5rem] rounded-t-[2.5rem] shadow-2xl overflow-hidden text-slate-900 max-h-[96vh] sm:max-h-[90vh] flex flex-col bottom-0 sm:bottom-auto absolute sm:relative"
      >
        {/* Step-by-step Interactive Share Guidance Overlay */}
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 bg-slate-900/95 backdrop-blur-md z-[130] flex flex-col justify-between p-6 md:p-8 text-white text-center"
            >
              {/* Header Details */}
              <div className="space-y-4 my-auto">
                <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-1">
                  <ShieldCheck size={36} className="animate-pulse" />
                </div>
                
                <h3 className="text-xl md:text-2xl font-black tracking-tight text-white leading-tight">
                  {showGuide === 'whatsapp' 
                    ? (language === 'bn' ? 'হোয়াটসঅ্যাপ শেয়ার নির্দেশনা' : 'WhatsApp Share Guide')
                    : (language === 'bn' ? 'মেসেঞ্জার শেয়ার নির্দেশনা' : 'Messenger Share Guide')
                  }
                </h3>
                
                <p className="text-xs md:text-sm text-slate-300 leading-relaxed max-w-sm mx-auto">
                  {language === 'bn' 
                    ? "সরাসরি ব্রাউজার থেকে হোয়াটসঅ্যাপে ছবি পাঠানো যায় না। তাই আপনার সুবিধার্থে রসিদটি প্রস্তুত করা হয়েছে:"
                    : "Browsers cannot directly feed image attachments to chat apps. We have run everything automatically for you:"
                  }
                </p>

                {/* Progress Checkmarks */}
                <div className="space-y-2.5 max-w-xs mx-auto text-left py-1">
                  <div className="flex items-start gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                    <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={16} />
                    <div className="min-w-0">
                      <h4 className="text-[11px] md:text-xs font-black text-white leading-none mb-1">
                        {language === 'bn' ? '১. মেমো ইমেজ ডাউনলোড হয়েছে! 📥' : '1. Memo Image Saved! 📥'}
                      </h4>
                      <p className="text-[9px] md:text-[10px] text-slate-400 leading-tight">
                        {language === 'bn' ? 'রসিদের নিখুঁত ছবি আপনার মোবাইলের গ্যালারি বা ফাইলে সেভ করা হয়েছে।' : 'A premium copy has been saved to your device gallery.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                    <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={16} />
                    <div className="min-w-0">
                      <h4 className="text-[11px] md:text-xs font-black text-white leading-none mb-1">
                        {language === 'bn' ? '২. রসিদ তথ্য কপি করা হয়েছে! 📋' : '2. Receipt Details Copied! 📋'}
                      </h4>
                      <p className="text-[9px] md:text-[10px] text-slate-400 leading-tight">
                        {language === 'bn' ? 'রসিদের পুরো বিবরণ ক্লিপবোর্ডে কপি করা হয়েছে।' : 'The receipt details are copied to your system clipboard.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cooperative Tooltip */}
                <div 
                  className="p-3 rounded-xl text-[10px] md:text-xs leading-relaxed max-w-sm mx-auto text-left border"
                  style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', color: '#a7f3d0', borderColor: 'rgba(16, 185, 129, 0.15)' }}
                >
                  💡 <strong>{language === 'bn' ? 'এখন আপনার করণীয়:' : 'Next Steps:'}</strong>{' '}
                  {language === 'bn' 
                    ? "নিচের বাটনে চাপ দিয়ে চ্যাটে যান। সেখানে যাকে রশিদ পাঠাবেন তার চ্যাটবক্সের মেসেজ বক্সে একটু চেপে ধরে 'Paste (পেস্ট)' করুন অথবা (+) বা (📎) আইকন থেকে গ্যালারিতে সদ্য ডাউনলোড হওয়া রসিদ ছবিটি সিলেক্ট করে সেন্ড করুন।" 
                    : "Tap the button below to open chat. Paste the copied text inside the text input, or attach the downloaded receipt image from your gallery."
                  }
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2 mt-4">
                <button
                  onClick={() => {
                    window.open(pendingShareUrl, '_blank');
                    setShowGuide(null);
                  }}
                  className={`w-full py-3 md:py-3.5 rounded-xl text-[11px] md:text-xs font-black tracking-wide shadow-md flex items-center justify-center gap-2 cursor-pointer transition-transform ${
                    showGuide === 'whatsapp' ? 'bg-[#25D366] hover:bg-[#1ebd53] text-white' : 'bg-[#006AFF] hover:bg-[#005ad9] text-white'
                  }`}
                >
                  {showGuide === 'whatsapp' ? (
                    <>
                      <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.18 1.449 4.825 1.451 5.436 0 9.86-4.42 9.864-9.864.002-2.637-1.03-5.114-2.903-6.989-1.873-1.873-4.351-2.903-6.99-2.903-5.44 0-9.865 4.423-9.87 9.869-.001 1.768.468 3.49 1.357 5.02l-.994 3.63 3.716-.974zm11.332-6.522c-.3-.15-1.776-.877-2.047-.976-.27-.099-.467-.149-.662.15-.195.298-.755.95-.926 1.149-.17.199-.34.224-.64.075-.3-.15-1.266-.467-2.41-1.485-.89-.794-1.49-1.774-1.665-2.073-.175-.3-.019-.463.13-.612.135-.133.3-.349.45-.523.15-.174.2-.299.3-.499.1-.199.05-.374-.025-.523-.075-.15-.662-1.595-.91-2.189-.24-.576-.484-.499-.662-.499-.17 0-.365-.01-.56-.01-.195 0-.51.074-.775.358-.265.283-1.01.986-1.01 2.404s1.025 2.787 1.17 2.986c.145.199 2.016 3.078 4.885 4.317.682.295 1.216.471 1.632.603.685.218 1.31.187 1.805.114.55-.082 1.776-.726 2.027-1.428.25-.705.25-1.31.175-1.43-.075-.12-.275-.195-.575-.345z"/>
                      </svg>
                      <span>{language === 'bn' ? 'হোয়াটসঅ্যাপ চ্যাটে যান 🟢' : 'Go to WhatsApp 🟢'}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                        <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.914 1.455 5.517 3.735 7.184.195.143.32.361.32.61v2.308c0 .385.426.613.738.385l2.585-1.89c.154-.113.342-.154.516-.118 1.154.238 2.37.369 3.633.369 5.523 0 10-4.145 10-9.258C22 6.145 17.523 2 12 2zm1.096 11.724L10.74 11.21l-4.116 2.768c-.463.31-.994-.18-.755-.662l4.356-6.17a.643.643 0 0 1 .91-.184l2.355 1.745 4.115-2.766c.463-.31.994.18.755.662l-4.355 6.17a.64.64 0 0 1-.908.181z"/>
                      </svg>
                      <span>{language === 'bn' ? 'মেসেঞ্জার চ্যাটে যান 🔵' : 'Go to Messenger 🔵'}</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowGuide(null)}
                  className="w-full py-2.5 rounded-xl text-[10px] md:text-[11.5px] font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  {language === 'bn' ? 'বন্ধ করুন' : 'Cancel'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loader backdrop during html2canvas render */}
        {isGenerating && (
          <div className="absolute inset-0 bg-white/85 backdrop-blur-xs flex flex-col items-center justify-center z-[120] transition-all">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-2" />
            <span className="text-[11px] font-black text-slate-700 animate-pulse">
              {language === 'bn' ? 'রসিদের নিখুঁত মেমো ফাইল তৈরি হচ্ছে...' : 'Generating high fidelity export...'}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between p-4.5 sm:p-6 border-b border-slate-50 shrink-0">
          <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
            {language === 'bn' ? 'টাকা আদায়ের রশিদ' : 'Payment Receipt'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
            <X size={20} className="sm:size-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 xs:p-4.5 sm:p-6 bg-slate-900/5 select-none md:select-text custom-scrollbar">
          {/* Print container with compressed vertical spacing and premium typography */}
          <div 
            ref={receiptRef} 
            className="w-full max-w-[440px] mx-auto bg-white p-3.5 sm:p-5 rounded-[2rem] relative overflow-hidden border-2 border-dashed border-emerald-300/80 shadow-lg select-text animate-in fade-in zoom-in duration-300"
          >
            {/* Top Pill / Badge */}
            <div className="flex justify-center mb-3 relative z-10">
              <div className="bg-[#01582e] text-white px-5 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm text-xs font-black tracking-wide">
                <span>⭐</span>
                <span>{language === 'bn' ? 'টাকা আদায়ের রশিদ' : 'Payment Receipt'}</span>
                <span>⭐</span>
              </div>
            </div>

            {/* ORGANIZATION HEADER SECTION */}
            <div className="flex items-center gap-3 pb-3 border-b border-dashed border-slate-200 justify-between relative z-10">
              <div className="shrink-0">
                {getImageUrl(settings.logoURL) ? (
                  <img 
                    src={getImageUrl(settings.logoURL)} 
                    alt="Logo" 
                    className="w-13 h-13 sm:w-16 sm:h-16 rounded-full object-cover shadow-xs border border-emerald-100" 
                    referrerPolicy="no-referrer" 
                  />
                ) : (
                  <div 
                    className="w-13 h-13 sm:w-16 sm:h-16 rounded-full flex items-center justify-center font-black bg-[#01582e] text-white"
                    style={{ fontSize: '16px' }}
                  >
                    {settings.name.charAt(0)}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 leading-snug space-y-0.5 text-center">
                <h3 className="font-extrabold text-[#01582e] text-sm sm:text-[17px] tracking-tight leading-snug">
                  {language === 'bn' ? 'নাছিরেরটেক সমাজ কল্যাণ সংস্থা' : settings.name}
                </h3>
                <p className="text-slate-600 font-bold text-[10.5px] sm:text-xs leading-none">
                  {language === 'bn' ? 'নাছিরেরটেক, কবিরহাট, নোয়াখালী।' : 'Nasirtech, Karbarihat, Noakhali'}
                </p>
                <p className="text-slate-400 text-[9px] sm:text-[10px] font-medium italic leading-none pt-0.5 block">
                  {language === 'bn' ? 'একটি অরাজনৈতিক সামাজিক সংগঠন' : 'A non-profit social welfare organization'}
                </p>
              </div>

              {/* MEMBER PHOTO IN EXCLUSIVE EMBEDDED BOX (USER REQUESTED GAP) */}
              {member && (
                <div className="shrink-0 relative">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 border-dashed border-emerald-500/35 shadow-xs bg-[#f8fafc] flex items-center justify-center relative">
                    {getImageUrl(member.photoURL) ? (
                      <img 
                        src={getImageUrl(member.photoURL)} 
                        alt={member.name} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer" 
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-emerald-50/50 text-[#01582e] text-center p-1.5 leading-none">
                        <span className="text-[14px] xs:text-[16px] font-black uppercase leading-none mb-0.5">
                          {member.name ? member.name[0] : 'M'}
                        </span>
                        <span className="text-[7px] font-black text-emerald-600/70 tracking-tighter uppercase whitespace-nowrap block scale-90">
                          {language === 'bn' ? 'সদস্য' : 'MEMBER'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* CONTENT INNER WRAPPER (White block layout with tiny gap) */}
            <div className="mt-3.5 flex flex-col gap-2 relative z-10">
              
              {/* SECTION 2: RECEIPT NUMBER & PAYMENT DATE ROW */}
              <div className="bg-[#f8fafc]/90 border border-slate-100/85 p-2 px-3 rounded-xl flex items-center justify-between gap-3 text-left">
                <div className="w-1/2">
                  <span className="text-slate-400 text-[8px] sm:text-[9.5px] font-black uppercase tracking-wider block leading-none mb-0.5">
                    {language === 'bn' ? 'RECEIPT NUMBER / রশিদ নং' : 'RECEIPT NUMBER'}
                  </span>
                  <span className="font-mono text-xs sm:text-sm font-black text-[#01582e] leading-none">
                    #{payment.receiptNo}
                  </span>
                </div>
                
                <div className="h-5.5 w-px bg-slate-200" />

                <div className="w-1/2 text-right">
                  <span className="text-slate-400 text-[8px] sm:text-[9.5px] font-black uppercase tracking-wider block leading-none mb-0.5">
                    {language === 'bn' ? 'PAYMENT DATE / তারিখ' : 'PAYMENT DATE'}
                  </span>
                  <span className="font-extrabold text-[#111827] text-[10.5px] sm:text-xs leading-none">
                    {payment.date}
                  </span>
                </div>
              </div>

              {/* SECTION 3: MEMBER NAME BANNER */}
              <div className="bg-[#f8fafc]/90 border border-slate-100/85 p-2 px-3 rounded-xl text-left">
                <span className="text-slate-400 text-[8px] sm:text-[9.5px] font-black uppercase tracking-wider block leading-none mb-0.5">
                  {language === 'bn' ? 'MEMBER NAME / সদস্যের নাম' : 'MEMBER NAME'}
                </span>
                <h4 className="text-[#0f172a] font-black text-xs sm:text-sm tracking-tight leading-normal">
                  {payment.memberName}
                </h4>
              </div>

              {/* SECTION 4: DONATED MONTH & AMOUNT */}
              <div className="grid grid-cols-2 gap-2">
                {/* Donated Month */}
                <div className="bg-[#f8fafc]/90 border border-slate-100/85 p-2 px-3 rounded-xl text-left">
                  <span className="text-slate-400 text-[8px] sm:text-[9.5px] font-black uppercase tracking-wider block leading-none mb-0.5 font-sans">
                    {language === 'bn' ? 'DONATED MONTH / জমাকৃত মাস' : 'DONATED MONTH'}
                  </span>
                  <span className="text-slate-800 text-[10.5px] sm:text-xs font-black block truncate uppercase">
                    {payment.month}
                  </span>
                </div>

                {/* Total Amount (Teal gradient card) */}
                <div className="bg-[#01582e] p-2 px-3 rounded-xl flex flex-col justify-between text-left shadow-sm">
                  <span className="text-emerald-100/90 text-[8px] sm:text-[9.5px] font-black uppercase block leading-none mb-0.5">
                    {language === 'bn' ? 'TOTAL AMOUNT / মোট টাকার পরিমাণ' : 'TOTAL AMOUNT'}
                  </span>
                  <span className="text-white text-xs sm:text-sm font-black leading-none tracking-tight">
                    ৳ {payment.amount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* SECTION 5: PAYMENT METHOD & REMARKS */}
              <div className="bg-[#f8fafc]/90 border border-slate-100/85 p-2 px-3 rounded-xl text-left grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 text-[8px] sm:text-[9.5px] font-black uppercase tracking-wider block leading-none mb-0.5">
                    {language === 'bn' ? 'PAYMENT METHOD / পেমেন্ট মাধ্যম' : 'PAYMENT METHOD'}
                  </span>
                  <span className="text-slate-800 text-[10.5px] sm:text-xs font-black block uppercase leading-none">
                    {methodInfo.title}
                  </span>
                  <span className="text-[#01582e] font-extrabold text-[8px] uppercase inline-block mt-0.5 leading-none font-mono">
                    {remarksStatusText}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[8px] sm:text-[9.5px] font-black uppercase tracking-wider block leading-none mb-0.5">
                    {language === 'bn' ? 'REMARKS / মন্তব্য' : 'REMARKS'}
                  </span>
                  <span className="text-slate-700 text-[9.5px] sm:text-[10px] font-bold block truncate leading-tight" title={remarksText}>
                    {remarksText}
                  </span>
                </div>
              </div>

              {/* SECTION 6: BEAUTIFUL QUOTATION */}
              <div className="relative rounded-xl p-2.5 sm:p-3 text-center border border-emerald-100 bg-[#f0fdf4]/50 overflow-hidden">
                <span className="text-emerald-600/10 absolute left-2 top-2 text-2xl font-serif leading-none select-none pointer-events-none">“</span>
                <span className="text-emerald-600/10 absolute right-2 bottom-0 text-2xl font-serif leading-none select-none pointer-events-none">”</span>
                
                <div className="relative z-10 space-y-1.5">
                  <p className="text-[9px] sm:text-[10px] font-bold leading-relaxed tracking-wide text-emerald-950">
                    {language === 'bn'
                      ? '“আপনার মূল্যবান অনুদান সমাজের কল্যাণে আমানত হিসেবে সংরক্ষিত হলো এবং প্রতিটি সহযোগিতা একটি সুন্দর, মানবিক ও কল্যাণময় সমাজ গড়তে সহায়তা করবে ইনশাআল্লাহ 💖”'
                      : '“Your valuable contribution is held as a trust for community welfare, and every support helps build a beautiful, humane, and prosperous society, InshaAllah 💖”'
                    }
                  </p>
                  
                  <div className="pt-1.5 border-t border-emerald-100/60 max-w-[180px] mx-auto space-y-0.5">
                    <p className="text-[8px] sm:text-[8.5px] font-black text-[#01582e] flex items-center justify-center gap-1">
                      🌿 <span>{language === 'bn' ? 'ধন্যবাদ' : 'Thank You'}</span> 🌿
                    </p>
                    <p className="text-[9.5px] sm:text-[10px] font-black text-[#01582e] tracking-tight">
                      {language === 'bn' ? '”নাছিরেরটেক সমাজ কল্যাণ সংস্থা”' : '"Nashirertek Social Welfare Association"'}
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 7: SHARE RECEIPT DOTTED HEAD LINE */}
              <div className="flex items-center gap-2 py-0.5 text-center justify-center">
                <div className="flex-1 h-px border-t border-dashed border-slate-200" />
                <span className="text-[8.5px] font-black text-slate-300 uppercase tracking-widest leading-none">
                  {language === 'bn' ? 'অফিসিয়াল রশিদ মেমো' : 'OFFICIAL MEMO'}
                </span>
                <div className="flex-1 h-px border-t border-dashed border-slate-200" />
              </div>

              {/* Tagline footer details */}
              <div className="text-center text-[#94a3b8] text-[8.5px] font-bold tracking-widest uppercase flex items-center justify-center gap-2 leading-none select-none">
                <span>🔒 Secure</span>
                <span>•</span>
                <span>Trusted</span>
                <span>•</span>
                <span>Transparent</span>
              </div>

            </div>

          </div>
        </div>

        {/* Floating/Sticky feedback alert banner */}
        <AnimatePresence>
          {copyStatus && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-md text-white text-[10px] md:text-xs font-extrabold px-5 py-2.5 rounded-full shadow-lg border border-white/10 flex items-center gap-2 z-50 whitespace-nowrap"
            >
              <CheckCircle2 size={13} className="text-emerald-400" />
              <span>{copyStatus}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex flex-col gap-2.5 relative z-10 shrink-0">
          
          {/* Header Title for Sharing section */}
          <div className="flex items-center gap-1.5 px-1">
            <Share2 size={12} className="text-slate-400" />
            <span className="text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {language === 'bn' ? 'সরাসরি শেয়ার করুন' : 'Share Receipt Directly'}
            </span>
          </div>

          {/* Recommended Primary social buttons block (WhatsApp & Messenger) */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* WhatsApp (🟢) */}
            <button
              onClick={handleWhatsAppShare}
              disabled={isGenerating}
              className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebd53] active:scale-[0.98] text-white py-3 px-4 rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-500/10 cursor-pointer disabled:opacity-50"
            >
              {/* WhatsApp custom SVG for perfect official branding */}
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.18 1.449 4.825 1.451 5.436 0 9.86-4.42 9.864-9.864.002-2.637-1.03-5.114-2.903-6.989-1.873-1.873-4.351-2.903-6.99-2.903-5.44 0-9.865 4.423-9.87 9.869-.001 1.768.468 3.49 1.357 5.02l-.994 3.63 3.716-.974zm11.332-6.522c-.3-.15-1.776-.877-2.047-.976-.27-.099-.467-.149-.662.15-.195.298-.755.95-.926 1.149-.17.199-.34.224-.64.075-.3-.15-1.266-.467-2.41-1.485-.89-.794-1.49-1.774-1.665-2.073-.175-.3-.019-.463.13-.612.135-.133.3-.349.45-.523.15-.174.2-.299.3-.499.1-.199.05-.374-.025-.523-.075-.15-.662-1.595-.91-2.189-.24-.576-.484-.499-.662-.499-.17 0-.365-.01-.56-.01-.195 0-.51.074-.775.358-.265.283-1.01.986-1.01 2.404s1.025 2.787 1.17 2.986c.145.199 2.016 3.078 4.885 4.317.682.295 1.216.471 1.632.603.685.218 1.31.187 1.805.114.55-.082 1.776-.726 2.027-1.428.25-.705.25-1.31.175-1.43-.075-.12-.275-.195-.575-.345z"/>
              </svg>
              <span>{language === 'bn' ? 'হোয়াটসঅ্যাপ' : 'WhatsApp'}</span>
            </button>

            {/* Messenger (🔵) */}
            <button
              onClick={handleMessengerShare}
              disabled={isGenerating}
              className="flex items-center justify-center gap-2 bg-[#006AFF] hover:bg-[#005ad9] active:scale-[0.98] text-white py-3 px-4 rounded-xl text-xs font-black transition-all shadow-md shadow-blue-500/10 cursor-pointer disabled:opacity-50"
            >
              {/* Messenger custom SVG for perfect branding */}
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.914 1.455 5.517 3.735 7.184.195.143.32.361.32.61v2.308c0 .385.426.613.738.385l2.585-1.89c.154-.113.342-.154.516-.118 1.154.238 2.37.369 3.633.369 5.523 0 10-4.145 10-9.258C22 6.145 17.523 2 12 2zm1.096 11.724L10.74 11.21l-4.116 2.768c-.463.31-.994-.18-.755-.662l4.356-6.17a.643.643 0 0 1 .91-.184l2.355 1.745 4.115-2.766c.463-.31.994.18.755.662l-4.355 6.17a.64.64 0 0 1-.908.181z"/>
              </svg>
              <span>{language === 'bn' ? 'মেসেঞ্জার' : 'Messenger'}</span>
            </button>
          </div>

          {/* Separator / Thin Line to divide utility buttons */}
          <div className="border-t border-slate-200/55 my-0.5" />

          {/* Bottom Utility Row (Download Image, Download PDF, Print Receipt) */}
          <div className="grid grid-cols-3 gap-2">
            
            {/* Download Image Link (📥) */}
            <button
              onClick={handleDownloadImage}
              disabled={isGenerating}
              className="flex flex-col md:flex-row items-center justify-center gap-1 bg-[#10b981] hover:bg-[#059669] text-white py-2 px-1 rounded-xl text-[10px] md:text-xs font-extrabold transition-all shadow-xs cursor-pointer disabled:opacity-50 active:scale-[0.97]"
            >
              <Download size={13} className="shrink-0" />
              <span>{language === 'bn' ? 'মেমো সেভ' : 'Save Image'}</span>
            </button>

            {/* Save PDF Link (📄) */}
            <button
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              className="flex flex-col md:flex-row items-center justify-center gap-1 bg-slate-900 hover:bg-slate-800 text-white py-2 px-1 rounded-xl text-[10px] md:text-xs font-extrabold transition-all shadow-xs cursor-pointer disabled:opacity-50 active:scale-[0.97]"
            >
              <FileText size={13} className="shrink-0 text-amber-300" />
              <span>{language === 'bn' ? 'PDF সেভ' : 'Save PDF'}</span>
            </button>

            {/* Print Receipt Link (🖨️) */}
            <button
              onClick={handlePrint}
              disabled={isGenerating}
              className="flex flex-col md:flex-row items-center justify-center gap-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 py-2 px-1 rounded-xl text-[10px] md:text-xs font-extrabold transition-all shadow-2xs cursor-pointer disabled:opacity-50 active:scale-[0.97]"
            >
              <Printer size={13} className="shrink-0 text-slate-500" />
              <span>{language === 'bn' ? 'রশিদ প্রিন্ট' : 'Print'}</span>
            </button>

          </div>

        </div>
      </motion.div>
    </div>
  );
}
