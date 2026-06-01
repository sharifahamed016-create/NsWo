/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  collection, query, onSnapshot, addDoc, doc,
  orderBy, limit, updateDoc, deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Expense } from '../types';
import { logActivity } from '../lib/activity';

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_expenses');
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

    const q = query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(100));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Expense[];
        setExpenses(data);
        localStorage.setItem('nswo_expenses', JSON.stringify(data));
      } catch (err) {
        console.warn("Error processing expenses snapshot:", err);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
      try {
        const cached = localStorage.getItem('nswo_expenses');
        if (cached) {
          setExpenses(JSON.parse(cached));
        }
      } catch {}
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>) => {
    const localId = `local_e_${Date.now()}`;
    const newExpense: Expense = {
      id: localId,
      ...expenseData,
      createdAt: Date.now(),
    };

    const updated = [newExpense, ...expenses];
    setExpenses(updated);
    try {
      localStorage.setItem('nswo_expenses', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'expense_add',
      `Expense of ৳${expenseData.amount} recorded for category: ${expenseData.category}.`,
      `${expenseData.category} খাতের জন্য ৳${expenseData.amount} এর খরচ রেকর্ড করা হয়েছে।`
    ).catch(() => {});

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return localId;
    }

    const oldExpenses = [...expenses];
    try {
      const dbExpense = { ...newExpense };
      delete (dbExpense as any).id;
      const docRef = await addDoc(collection(db, 'expenses'), dbExpense);
      const synced = updated.map(e => e.id === localId ? { ...e, id: docRef.id } : e);
      setExpenses(synced);
      localStorage.setItem('nswo_expenses', JSON.stringify(synced));
      return docRef.id;
    } catch (error) {
      console.error("Firestore expense creation failed, reverting local changes:", error);
      setExpenses(oldExpenses);
      try {
        localStorage.setItem('nswo_expenses', JSON.stringify(oldExpenses));
      } catch {}
      throw error;
    }
  };

  const updateExpense = async (id: string, expenseData: Partial<Expense>) => {
    const updated = expenses.map(e => e.id === id ? { ...e, ...expenseData, updatedAt: Date.now() } : e);
    setExpenses(updated);
    try {
      localStorage.setItem('nswo_expenses', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'expense_update',
      `Expense entry updated: ৳${expenseData.amount || ''} for category: ${expenseData.category || ''}.`,
      `খরচ এন্ট্রি পরিবর্তন করা হয়েছে: ৳${expenseData.amount || ''} ক্যাটাগরি: ${expenseData.category || ''}।`
    ).catch(() => {});

    if (id.startsWith('local_e_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      const expenseRef = doc(db, 'expenses', id);
      await updateDoc(expenseRef, {
        ...expenseData,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.warn("Firestore expense update failed, kept local:", error);
    }
  };

  const deleteExpense = async (id: string, amount: number, category: string) => {
    const filtered = expenses.filter(e => e.id !== id);
    setExpenses(filtered);
    try {
      localStorage.setItem('nswo_expenses', JSON.stringify(filtered));
    } catch {}

    await logActivity(
      'expense_delete',
      `Expense of ৳${amount} deleted from ${category}.`,
      `ক্যাটাগরি ${category} থেকে ৳${amount} এর খরচ ডিলিট করা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_e_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      const expenseRef = doc(db, 'expenses', id);
      await deleteDoc(expenseRef);
    } catch (error) {
      console.warn("Firestore expense delete failed, kept local:", error);
    }
  };

  return { expenses, loading, addExpense, updateExpense, deleteExpense };
}
