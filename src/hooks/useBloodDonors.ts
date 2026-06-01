/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  collection, query, onSnapshot, addDoc, doc,
  orderBy, updateDoc, deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { BloodDonor } from '../types';
import { logActivity } from '../lib/activity';

export function useBloodDonors() {
  const [bloodDonors, setBloodDonors] = useState<BloodDonor[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_blood_donors');
      return cached ? JSON.parse(cached) : [];
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

    const q = query(collection(db, 'blood_donors'), orderBy('bloodGroup', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as BloodDonor[];
        setBloodDonors(data);
        localStorage.setItem('nswo_blood_donors', JSON.stringify(data));
      } catch (err) {
        console.warn("Error processing blood donors snapshot:", err);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'blood_donors');
      try {
        const cached = localStorage.getItem('nswo_blood_donors');
        if (cached) {
          setBloodDonors(JSON.parse(cached));
        }
      } catch {}
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const addBloodDonor = async (donorData: Omit<BloodDonor, 'id' | 'createdAt' | 'updatedAt'>) => {
    const localId = `local_bd_${Date.now()}`;
    const newDonor: BloodDonor = {
      id: localId,
      ...donorData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = [newDonor, ...bloodDonors];
    setBloodDonors(updated);
    try {
      localStorage.setItem('nswo_blood_donors', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'blood_donor_add',
      `Blood donor ${donorData.name} (${donorData.bloodGroup}) registered successfully.`,
      `রক্তদাতা ${donorData.nameBn || donorData.name} (${donorData.bloodGroup}) সফলভাবে নিবন্ধিত হয়েছেন।`
    ).catch(() => {});

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return localId;
    }

    try {
      const dbDonor = { ...newDonor };
      delete (dbDonor as any).id;
      const docRef = await addDoc(collection(db, 'blood_donors'), dbDonor);
      const synced = updated.map(d => d.id === localId ? { ...d, id: docRef.id } : d);
      setBloodDonors(synced);
      localStorage.setItem('nswo_blood_donors', JSON.stringify(synced));
      return docRef.id;
    } catch (error) {
      console.warn("Firestore blood donor creation failed, kept local:", error);
      return localId;
    }
  };

  const updateBloodDonor = async (id: string, donorData: Partial<Omit<BloodDonor, 'id' | 'createdAt' | 'updatedAt'>>) => {
    const updated = bloodDonors.map(d => d.id === id ? { ...d, ...donorData, updatedAt: Date.now() } : d);
    setBloodDonors(updated);
    try {
      localStorage.setItem('nswo_blood_donors', JSON.stringify(updated));
    } catch {}

    const name = donorData.name || bloodDonors.find(d => d.id === id)?.name || '';
    const nameBn = donorData.nameBn || bloodDonors.find(d => d.id === id)?.nameBn || name;
    const bg = donorData.bloodGroup || bloodDonors.find(d => d.id === id)?.bloodGroup || '';
    
    await logActivity(
      'blood_donor_update',
      `Blood donor ${name} (${bg}) profile updated.`,
      `রক্তদাতা ${nameBn} (${bg}) এর তথ্য আপডেট করা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_bd_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      const donorRef = doc(db, 'blood_donors', id);
      await updateDoc(donorRef, {
        ...donorData,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.warn("Firestore blood donor update failed, kept local:", error);
    }
  };

  const deleteBloodDonor = async (id: string) => {
    const existing = bloodDonors.find(d => d.id === id);
    const name = existing?.name || '';
    const nameBn = existing?.nameBn || name;
    const bg = existing?.bloodGroup || '';

    const filtered = bloodDonors.filter(d => d.id !== id);
    setBloodDonors(filtered);
    try {
      localStorage.setItem('nswo_blood_donors', JSON.stringify(filtered));
    } catch {}

    await logActivity(
      'blood_donor_delete',
      `Blood donor ${name} (${bg}) was removed.`,
      `রক্তদাতা ${nameBn} (${bg}) এর রেকর্ড মুছে ফেলা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_bd_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'blood_donors', id));
    } catch (error) {
      console.warn("Firestore blood donor deletion failed, kept local:", error);
    }
  };

  return { bloodDonors, loading, addBloodDonor, updateBloodDonor, deleteBloodDonor };
}
