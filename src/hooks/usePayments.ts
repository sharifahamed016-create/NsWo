/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  collection, query, onSnapshot, addDoc, doc, 
  orderBy, runTransaction, where, getDocs, limit 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Payment, PaymentType, Member } from '../types';
import { logActivity } from '../lib/activity';

export function deduplicatePaymentsList(rawPayments: Payment[]): Payment[] {
  if (!Array.isArray(rawPayments)) return [];
  const seen = new Set<string>();
  const deduplicated: Payment[] = [];
  rawPayments.forEach(p => {
    const typeStr = (p.type as string || '').toLowerCase();
    if (typeStr === 'subscription' && p.memberId && p.month) {
      const key = `${p.memberId.trim()}_${p.month.trim()}`;
      if (seen.has(key)) {
        return; // Skip duplicate subscription for same month
      }
      seen.add(key);
    }
    deduplicated.push(p);
  });
  return deduplicated;
}

export function usePayments() {
  const [payments, setPayments] = useState<Payment[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_payments');
      const parsed = cached ? JSON.parse(cached) : [];
      return deduplicatePaymentsList(parsed);
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(500));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Payment[];
        localStorage.setItem('nswo_payments', JSON.stringify(data));
        setPayments(deduplicatePaymentsList(data));
      } catch (err) {
        console.warn("Error processing payments snapshots:", err);
      }
      setLoading(false);
    }, (error) => {
      console.warn("Payments onSnapshot error (likely quota limit reached):", error);
      // Gracefully use local storage
      try {
        const cached = localStorage.getItem('nswo_payments');
        if (cached) {
          setPayments(deduplicatePaymentsList(JSON.parse(cached)));
        }
      } catch {}
      if (typeof window !== 'undefined') {
        (window as any).__firestore_quota_exceeded = true;
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const addPayment = async (paymentData: Omit<Payment, 'id' | 'createdAt' | 'receiptNo'>) => {
    // Determine next receipt number locally safely
    let currentMax = 1000;
    try {
      const cachedPayments = JSON.parse(localStorage.getItem('nswo_payments') || '[]');
      cachedPayments.forEach((p: any) => {
        if (p.receiptNo && p.receiptNo.startsWith('R-')) {
          const num = parseInt(p.receiptNo.replace('R-', ''), 10);
          if (!isNaN(num) && num > currentMax) {
            currentMax = num;
          }
        }
      });
    } catch {}

    const nextNo = currentMax + 1;
    const receiptNo = `R-${nextNo}`;
    const localId = `local_p_${Date.now()}`;
    const newPayment: Payment = {
      id: localId,
      ...paymentData,
      receiptNo,
      createdAt: Date.now(),
    };

    const oldPayments = [...payments];
    const oldMembersCached = localStorage.getItem('nswo_members');

    // Optimistically update live list and local storage
    const updatedPayments = [newPayment, ...payments];
    setPayments(updatedPayments);
    try {
      localStorage.setItem('nswo_payments', JSON.stringify(updatedPayments));
    } catch {}

    // Synchronously update member balance locally so that the receipts/members interface reflects contribution
    if (paymentData.memberId !== 'external') {
      try {
        const cachedMembers = JSON.parse(oldMembersCached || '[]');
        const updatedMembers = cachedMembers.map((m: any) => {
          if (m.id === paymentData.memberId) {
            return {
              ...m,
              totalPaid: (m.totalPaid || 0) + paymentData.amount,
              balance: (m.balance || 0) + paymentData.amount,
              updatedAt: Date.now()
            };
          }
          return m;
        });
        localStorage.setItem('nswo_members', JSON.stringify(updatedMembers));
        window.dispatchEvent(new CustomEvent('nswo_members_updated', { detail: updatedMembers }));
      } catch {}
    }

    const rName = paymentData.memberName || "সদস্য";
    await logActivity(
      'payment_add',
      `Payment contribution of ৳${paymentData.amount} received from ${rName} (Receipt: ${receiptNo}).`,
      `${rName} এর কাছ থেকে ৳${paymentData.amount} আদায় করা হয়েছে (রশিদ নং: ${receiptNo})।`
    ).catch(() => {});

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return receiptNo;
    }

    try {
      // PROPERLY AWAIT transaction to catch errors synchronously and prevent fake successes!
      await runTransaction(db, async (transaction) => {
        const memberRef = doc(db, 'members', paymentData.memberId);
        let memberSnap = null;
        let member: Member | null = null;
        
        if (paymentData.memberId !== 'external') {
          memberSnap = await transaction.get(memberRef);
          if (memberSnap.exists()) {
            member = memberSnap.data() as Member;
          }
        }
        
        const metaRef = doc(db, 'metadata', 'payments');
        const metaSnap = await transaction.get(metaRef);
        let onlineNextNo = nextNo;
        
        if (metaSnap.exists()) {
          onlineNextNo = metaSnap.data().nextReceiptNo || 1001;
        }
        
        const onlineReceiptNo = `R-${onlineNextNo}`;
        
        const newPaymentRef = doc(collection(db, 'payments'));
        const onlinePayment = {
          ...paymentData,
          receiptNo: onlineReceiptNo,
          createdAt: Date.now(),
        };
        
        transaction.set(newPaymentRef, onlinePayment);
        
        if (paymentData.memberId !== 'external' && member) {
          transaction.update(memberRef, {
            totalPaid: (member.totalPaid || 0) + paymentData.amount,
            balance: (member.balance || 0) + paymentData.amount,
            updatedAt: Date.now()
          });
        }
        
        transaction.set(metaRef, { nextReceiptNo: onlineNextNo + 1 }, { merge: true });
        
        // Replace temporary local transaction with real Firestore ID and final online receiptNo
        const verifiedPayments = updatedPayments.map(p => p.id === localId ? { ...p, id: newPaymentRef.id, receiptNo: onlineReceiptNo } : p);
        setPayments(verifiedPayments);
        localStorage.setItem('nswo_payments', JSON.stringify(verifiedPayments));
      });

      return receiptNo;
    } catch (err: any) {
      console.error("Firebase transaction sync failed, reverting optimistic local changes:", err);
      // Revert optimistic changes
      setPayments(oldPayments);
      try {
        localStorage.setItem('nswo_payments', JSON.stringify(oldPayments));
      } catch {}
      
      if (paymentData.memberId !== 'external' && oldMembersCached) {
        try {
          localStorage.setItem('nswo_members', oldMembersCached);
          window.dispatchEvent(new CustomEvent('nswo_members_updated', { detail: JSON.parse(oldMembersCached) }));
        } catch {}
      }
      throw err;
    }
  };

  const getMemberPayments = async (memberId: string) => {
    // Immediately filter local state since it is always synchronized
    const localFiltered = payments.filter(p => p.memberId === memberId);

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return localFiltered.sort((a, b) => b.createdAt - a.createdAt);
    }

    try {
      const q = query(
        collection(db, 'payments'), 
        where('memberId', '==', memberId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Payment[];

      // Merge results with local unsynced structures
      const merged = [...results];
      localFiltered.forEach(localItem => {
        if (localItem.id.startsWith('local_p_') && !merged.some(m => m.receiptNo === localItem.receiptNo)) {
          merged.push(localItem);
        }
      });
      return merged.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return localFiltered.sort((a, b) => b.createdAt - a.createdAt);
    }
  };

  const deletePayment = async (id: string, amount: number, memberId: string, memberName: string) => {
    // Optimistic deletion
    const filteredPayments = payments.filter(p => p.id !== id);
    setPayments(filteredPayments);
    try {
      localStorage.setItem('nswo_payments', JSON.stringify(filteredPayments));
    } catch {}

    // Deduct member balance locally
    if (memberId && memberId !== 'external') {
      try {
        const cachedMembers = JSON.parse(localStorage.getItem('nswo_members') || '[]');
        const updatedMembers = cachedMembers.map((m: any) => {
          if (m.id === memberId) {
            return {
              ...m,
              totalPaid: Math.max(0, (m.totalPaid || 0) - amount),
              balance: (m.balance || 0) - amount,
              updatedAt: Date.now()
            };
          }
          return m;
        });
        localStorage.setItem('nswo_members', JSON.stringify(updatedMembers));
        window.dispatchEvent(new CustomEvent('nswo_members_updated', { detail: updatedMembers }));
      } catch {}
    }

    await logActivity(
      'payment_delete',
      `Payment contribution of ৳${amount} deleted for member ${memberName}.`,
      `${memberName} এর ৳${amount} আদায় ডিলিট করা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_p_') || (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true'))) {
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const paymentRef = doc(db, 'payments', id);
        let memberRef = null;
        let memberSnap = null;
        if (memberId && memberId !== 'external') {
          memberRef = doc(db, 'members', memberId);
          memberSnap = await transaction.get(memberRef);
        }
        
        transaction.delete(paymentRef);
        
        if (memberRef && memberSnap && memberSnap.exists()) {
          const member = memberSnap.data() as Member;
          transaction.update(memberRef, {
            totalPaid: Math.max(0, (member.totalPaid || 0) - amount),
            balance: (member.balance || 0) - amount,
            updatedAt: Date.now()
          });
        }
      });
    } catch (error) {
      console.warn("Firestore delete transaction failed, kept local:", error);
    }
  };

  const updatePayment = async (id: string, oldAmount: number, paymentData: Partial<Payment>) => {
    // 1. Local update
    const updatedPayments = payments.map(p => p.id === id ? { ...p, ...paymentData, updatedAt: Date.now() } : p);
    setPayments(updatedPayments);
    try {
      localStorage.setItem('nswo_payments', JSON.stringify(updatedPayments));
    } catch {}

    const memberId = paymentData.memberId || payments.find(p => p.id === id)?.memberId;
    const newAmount = paymentData.amount;

    // Adjust member balance locally
    if (memberId && memberId !== 'external' && newAmount !== undefined && newAmount !== oldAmount) {
      try {
        const cachedMembers = JSON.parse(localStorage.getItem('nswo_members') || '[]');
        const diff = newAmount - oldAmount;
        const updatedMembers = cachedMembers.map((m: any) => {
          if (m.id === memberId) {
            return {
              ...m,
              totalPaid: Math.max(0, (m.totalPaid || 0) + diff),
              balance: (m.balance || 0) + diff,
              updatedAt: Date.now()
            };
          }
          return m;
        });
        localStorage.setItem('nswo_members', JSON.stringify(updatedMembers));
        window.dispatchEvent(new CustomEvent('nswo_members_updated', { detail: updatedMembers }));
      } catch {}
    }

    const rName = paymentData.memberName || payments.find(p => p.id === id)?.memberName || "সদস্য";
    await logActivity(
      'payment_update',
      `Payment contribution of ৳${oldAmount} updated to ৳${paymentData.amount} for ${rName}.`,
      `${rName} এর আদায় ৳${oldAmount} থেকে পরিবর্তন করে ৳${paymentData.amount} করা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_p_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const paymentRef = doc(db, 'payments', id);
        const paymentSnap = await transaction.get(paymentRef);
        const actualMemberId = paymentData.memberId || (paymentSnap.exists() ? paymentSnap.data().memberId : null);
        
        let memberRef = null;
        let memberSnap = null;
        if (actualMemberId && actualMemberId !== 'external' && newAmount !== undefined && newAmount !== oldAmount) {
          memberRef = doc(db, 'members', actualMemberId);
          memberSnap = await transaction.get(memberRef);
        }
        
        transaction.update(paymentRef, {
          ...paymentData,
          updatedAt: Date.now()
        });
        
        if (memberRef && memberSnap && memberSnap.exists()) {
          const member = memberSnap.data() as Member;
          const diff = newAmount - oldAmount;
          transaction.update(memberRef, {
            totalPaid: Math.max(0, (member.totalPaid || 0) + diff),
            balance: (member.balance || 0) + diff,
            updatedAt: Date.now()
          });
        }
      });
    } catch (error) {
      console.warn("Firestore update transaction failed, kept local:", error);
    }
  };

  return { payments, loading, addPayment, getMemberPayments, updatePayment, deletePayment };
}
