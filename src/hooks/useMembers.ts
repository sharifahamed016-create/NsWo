/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  collection, query, onSnapshot, addDoc, updateDoc, 
  doc, deleteDoc, orderBy, Timestamp, where, getDocs 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Member, MemberStatus } from '../types';
import { logActivity } from '../lib/activity';

function recalculateMemberStats(rawMembers: Member[]): Member[] {
  if (!Array.isArray(rawMembers)) return [];
  let cachedPayments: any[] = [];
  try {
    const cached = localStorage.getItem('nswo_payments');
    if (cached) {
      cachedPayments = JSON.parse(cached);
    }
  } catch {}
  
  // Deduplicate the payments first
  const seenSub = new Set<string>();
  const validPayments = cachedPayments.filter(p => {
    if (p.type && (p.type.toLowerCase() === 'subscription' || p.type === 'SUBSCRIPTION') && p.memberId && p.month) {
      const key = `${p.memberId.trim()}_${p.month.trim()}`;
      if (seenSub.has(key)) return false;
      seenSub.add(key);
    }
    return true;
  });

  // Calculate sum of payments for each member
  const memberSums: Record<string, number> = {};
  validPayments.forEach(p => {
    if (p.memberId && p.memberId !== 'external' && typeof p.amount === 'number') {
      memberSums[p.memberId] = (memberSums[p.memberId] || 0) + p.amount;
    }
  });

  // Override totalPaid and balance for each member
  return rawMembers.map(m => {
    const totalPaid = memberSums[m.id] !== undefined ? memberSums[m.id] : 0;
    return {
      ...m,
      totalPaid,
      balance: totalPaid
    };
  });
}

export function useMembers() {
  const [members, setMembers] = useState<Member[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_members');
      if (cached) {
        const parsed = JSON.parse(cached) as Member[];
        const sorted = parsed.sort((a, b) => {
          const sA = typeof a.sortOrder === 'number' ? a.sortOrder : 999999;
          const sB = typeof b.sortOrder === 'number' ? b.sortOrder : 999999;
          if (sA !== sB) return sA - sB;
          return a.memberId.localeCompare(b.memberId, undefined, { numeric: true, sensitivity: 'base' });
        });
        return recalculateMemberStats(sorted);
      }
      return [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Custom event listener to synchronize local updates across hooks
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<Member[]>;
      if (customEvent.detail) {
        setMembers(recalculateMemberStats(customEvent.detail));
      }
    };
    window.addEventListener('nswo_members_updated', handleSync);

    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoading(false);
      return () => {
        window.removeEventListener('nswo_members_updated', handleSync);
      };
    }

    const q = query(collection(db, 'members'), orderBy('memberId', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Member[];
        
        // Sort mapped docs by sortOrder in-memory
        const sorted = data.sort((a, b) => {
          const sA = typeof a.sortOrder === 'number' ? a.sortOrder : 999999;
          const sB = typeof b.sortOrder === 'number' ? b.sortOrder : 999999;
          if (sA !== sB) return sA - sB;
          return a.memberId.localeCompare(b.memberId, undefined, { numeric: true, sensitivity: 'base' });
        });
        
        const enriched = recalculateMemberStats(sorted);
        setMembers(enriched);
        localStorage.setItem('nswo_members', JSON.stringify(sorted));
      } catch (err) {
        console.warn("Error processing members data:", err);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'members');
      // Gracefully load from local storage
      try {
        const cached = localStorage.getItem('nswo_members');
        if (cached) {
          setMembers(recalculateMemberStats(JSON.parse(cached)));
        }
      } catch {}
      setLoading(false);
    });

    return () => {
      unsubscribe();
      window.removeEventListener('nswo_members_updated', handleSync);
    };
  }, []);

  const addMember = async (memberData: Omit<Member, 'id' | 'createdAt' | 'updatedAt' | 'totalPaid' | 'totalDue' | 'balance'>) => {
    const localId = `local_m_${Date.now()}`;
    const newMember: Member = {
      id: localId,
      ...memberData,
      balance: 0,
      totalPaid: 0,
      totalDue: 0,
      sortOrder: members.length, // Add at the bottom of sequence
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = [...members, newMember];
    setMembers(updated);
    try {
      localStorage.setItem('nswo_members', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'member_add',
      `Member ${memberData.memberId} (${memberData.name}) was registered successfully.`,
      `সদস্য ${memberData.memberId} (${memberData.name}) সফলভাবে নিবন্ধিত হয়েছেন।`
    ).catch(() => {});

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return localId;
    }

    try {
      const dbMember = { ...newMember };
      delete (dbMember as any).id; // Delete temporary ID to let Firestore auto-assign
      const docRef = await addDoc(collection(db, 'members'), dbMember);
      
      // Update with matching real Firestore ID
      const synced = updated.map(m => m.id === localId ? { ...m, id: docRef.id } : m);
      setMembers(synced);
      localStorage.setItem('nswo_members', JSON.stringify(synced));
      return docRef.id;
    } catch (error) {
      console.warn("Firestore save failed, using local member ID:", error);
      const errMessage = error instanceof Error ? error.message : String(error);
      if (errMessage.toLowerCase().includes('quota') || 
          errMessage.toLowerCase().includes('resource') || 
          errMessage.toLowerCase().includes('exhausted') ||
          errMessage.toLowerCase().includes('limit')) {
        if (typeof window !== 'undefined') {
          (window as any).__firestore_quota_exceeded = true;
          window.dispatchEvent(new CustomEvent('nswo_quota_exceeded'));
        }
      }
      return localId;
    }
  };

  const updateMember = async (id: string, data: Partial<Member>) => {
    const updated = members.map(m => m.id === id ? { ...m, ...data, updatedAt: Date.now() } : m);
    setMembers(updated);
    try {
      localStorage.setItem('nswo_members', JSON.stringify(updated));
    } catch {}

    const name = data.name || members.find(m => m.id === id)?.name || '';
    const mId = data.memberId || members.find(m => m.id === id)?.memberId || '';
    await logActivity(
      'member_update',
      `Member ${mId} (${name}) profiles updated.`,
      `সদস্য ${mId} (${name}) এর প্রোফাইল আপডেট করা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_m_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      const memberRef = doc(db, 'members', id);
      await updateDoc(memberRef, {
        ...data,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.warn("Firestore update failed, kept local:", error);
      const errMessage = error instanceof Error ? error.message : String(error);
      if (errMessage.toLowerCase().includes('quota') || 
          errMessage.toLowerCase().includes('resource') || 
          errMessage.toLowerCase().includes('exhausted') ||
          errMessage.toLowerCase().includes('limit')) {
        if (typeof window !== 'undefined') {
          (window as any).__firestore_quota_exceeded = true;
          window.dispatchEvent(new CustomEvent('nswo_quota_exceeded'));
        }
      }
    }
  };

  const deleteMember = async (id: string) => {
    const existing = members.find(m => m.id === id);
    const name = existing?.name || '';
    const mId = existing?.memberId || '';

    const filtered = members.filter(m => m.id !== id);
    setMembers(filtered);
    try {
      localStorage.setItem('nswo_members', JSON.stringify(filtered));
    } catch {}

    await logActivity(
      'member_delete',
      `Member ${mId} (${name}) was removed from the database.`,
      `সদস্য ${mId} (${name}) এর রেকর্ড ডাটাবেস থেকে মুছে ফেলা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_m_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'members', id));
    } catch (error) {
      console.warn("Firestore delete failed, kept local:", error);
      const errMessage = error instanceof Error ? error.message : String(error);
      if (errMessage.toLowerCase().includes('quota') || 
          errMessage.toLowerCase().includes('resource') || 
          errMessage.toLowerCase().includes('exhausted') ||
          errMessage.toLowerCase().includes('limit')) {
        if (typeof window !== 'undefined') {
          (window as any).__firestore_quota_exceeded = true;
          window.dispatchEvent(new CustomEvent('nswo_quota_exceeded'));
        }
      }
    }
  };

  const moveMember = async (id: string, direction: 'up' | 'down') => {
    const currentIndex = members.findIndex(m => m.id === id);
    if (currentIndex === -1) return;
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === members.length - 1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    const memberA = members[currentIndex];
    const memberB = members[targetIndex];

    // Determine original sortOrders, falling back to array index
    const orderA = typeof memberA.sortOrder === 'number' ? memberA.sortOrder : currentIndex;
    const orderB = typeof memberB.sortOrder === 'number' ? memberB.sortOrder : targetIndex;

    // To swap them, A gets B's sortOrder and B gets A's sortOrder
    let newOrderA = orderB;
    let newOrderB = orderA;

    // Guard against identical orders
    if (newOrderA === newOrderB) {
      newOrderA = targetIndex;
      newOrderB = currentIndex;
    }

    // Create the updated list with swapped sortOrders
    const updatedList = members.map((m, idx) => {
      if (m.id === memberA.id) {
        return { ...m, sortOrder: newOrderA, updatedAt: Date.now() };
      }
      if (m.id === memberB.id) {
        return { ...m, sortOrder: newOrderB, updatedAt: Date.now() };
      }
      if (typeof m.sortOrder !== 'number') {
        return { ...m, sortOrder: idx };
      }
      return m;
    });

    // Sort to keep local state deterministic
    const sortedList = [...updatedList].sort((a, b) => {
      const sA = typeof a.sortOrder === 'number' ? a.sortOrder : 999999;
      const sB = typeof b.sortOrder === 'number' ? b.sortOrder : 999999;
      if (sA !== sB) return sA - sB;
      return a.memberId.localeCompare(b.memberId, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Optimistically update states
    setMembers(sortedList);
    try {
      localStorage.setItem('nswo_members', JSON.stringify(sortedList));
    } catch {}

    // Dispatch custom event to let other custom hooks synchronize immediately
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nswo_members_updated', { detail: sortedList }));
    }

    // Save to Firestore ONLY for the two elements whose order swapped
    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return;
    }

    const changedMembers = [
      { id: memberA.id, sortOrder: newOrderA },
      { id: memberB.id, sortOrder: newOrderB }
    ];

    await Promise.all(changedMembers.map(async (m) => {
      if (m.id.startsWith('local_m_')) return;
      try {
        const memberRef = doc(db, 'members', m.id);
        await updateDoc(memberRef, { 
          sortOrder: m.sortOrder, 
          updatedAt: Date.now() 
        });
      } catch (e) {
        console.warn("Error persisting member order in firebase:", e);
        const errMessage = e instanceof Error ? e.message : String(e);
        if (errMessage.toLowerCase().includes('quota') || 
            errMessage.toLowerCase().includes('resource') || 
            errMessage.toLowerCase().includes('exhausted') ||
            errMessage.toLowerCase().includes('limit')) {
          if (typeof window !== 'undefined') {
            (window as any).__firestore_quota_exceeded = true;
            window.dispatchEvent(new CustomEvent('nswo_quota_exceeded'));
          }
        }
      }
    }));
  };

  return { members, loading, addMember, updateMember, deleteMember, moveMember };
}
