/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  collection, query, onSnapshot, addDoc, updateDoc, 
  doc, deleteDoc, orderBy
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { AppEvent, EventDonor, EventExpense } from '../types';
import { logActivity } from '../lib/activity';

export function useEvents() {
  const [events, setEvents] = useState<AppEvent[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_events');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [donors, setDonors] = useState<EventDonor[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_event_donors');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [expenses, setExpenses] = useState<EventExpense[]>(() => {
    try {
      const cached = localStorage.getItem('nswo_event_expenses');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoading(false);
      return;
    }

    const qEvents = query(collection(db, 'events'), orderBy('date', 'desc'));
    const qDonors = query(collection(db, 'event_donors'), orderBy('createdAt', 'desc'));
    const qExpenses = query(collection(db, 'event_expenses'), orderBy('createdAt', 'desc'));

    let eventsLoaded = false;
    let donorsLoaded = false;
    let expensesLoaded = false;

    const checkLoading = () => {
      if (eventsLoaded && donorsLoaded && expensesLoaded) {
        setLoading(false);
      }
    };

    const unsubEvents = onSnapshot(qEvents, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as AppEvent[];
        setEvents(data);
        localStorage.setItem('nswo_events', JSON.stringify(data));
      } catch (err) {
        console.warn("Error processing events:", err);
      }
      eventsLoaded = true;
      checkLoading();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'events');
      try {
        const cached = localStorage.getItem('nswo_events');
        if (cached) {
          setEvents(JSON.parse(cached));
        }
      } catch {}
      eventsLoaded = true;
      checkLoading();
    });

    const unsubDonors = onSnapshot(qDonors, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as EventDonor[];
        setDonors(data);
        localStorage.setItem('nswo_event_donors', JSON.stringify(data));
      } catch (err) {
        console.warn("Error processing donors:", err);
      }
      donorsLoaded = true;
      checkLoading();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'event_donors');
      try {
        const cached = localStorage.getItem('nswo_event_donors');
        if (cached) {
          setDonors(JSON.parse(cached));
        }
      } catch {}
      donorsLoaded = true;
      checkLoading();
    });

    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as EventExpense[];
        setExpenses(data);
        localStorage.setItem('nswo_event_expenses', JSON.stringify(data));
      } catch (err) {
        console.warn("Error processing event expenses:", err);
      }
      expensesLoaded = true;
      checkLoading();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'event_expenses');
      try {
        const cached = localStorage.getItem('nswo_event_expenses');
        if (cached) {
          setExpenses(JSON.parse(cached));
        }
      } catch {}
      expensesLoaded = true;
      checkLoading();
    });

    return () => {
      unsubEvents();
      unsubDonors();
      unsubExpenses();
    };
  }, []);

  const addEvent = async (eventData: Omit<AppEvent, 'id' | 'createdAt'>) => {
    const localId = `local_evt_${Date.now()}`;
    const newEvent = {
      id: localId,
      ...eventData,
      createdAt: Date.now(),
    };

    const updated = [newEvent, ...events];
    setEvents(updated);
    try {
      localStorage.setItem('nswo_events', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'event_add',
      `New Event '${eventData.title}' was scheduled on ${eventData.date}.`,
      `নতুন ইভেন্ট '${eventData.titleBn || eventData.title}' (${eventData.date}) সফলভাবে সিডিউল করা হয়েছে।`
    ).catch(() => {});

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return localId;
    }

    try {
      const dbEvent = { ...newEvent };
      delete (dbEvent as any).id;
      const docRef = await addDoc(collection(db, 'events'), dbEvent);
      
      const synced = updated.map(e => e.id === localId ? { ...e, id: docRef.id } : e);
      setEvents(synced);
      localStorage.setItem('nswo_events', JSON.stringify(synced));
      return docRef.id;
    } catch (error) {
      console.warn("Firestore event add failed, kept local:", error);
      return localId;
    }
  };

  const updateEvent = async (id: string, data: Partial<AppEvent>) => {
    const updated = events.map(e => e.id === id ? { ...e, ...data } : e);
    setEvents(updated);
    try {
      localStorage.setItem('nswo_events', JSON.stringify(updated));
    } catch {}

    const title = data.title || events.find(e => e.id === id)?.title || 'Event';
    const titleBn = data.titleBn || events.find(e => e.id === id)?.titleBn || title;
    await logActivity(
      'event_update',
      `Event '${title}' details were updated.`,
      `ইভেন্ট '${titleBn}' এর বিবরণ আপডেট করা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_evt_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      const eventRef = doc(db, 'events', id);
      await updateDoc(eventRef, data);
    } catch (error) {
      console.warn("Firestore event update failed, kept local:", error);
    }
  };

  const deleteEvent = async (id: string) => {
    const existing = events.find(e => e.id === id);
    const title = existing?.title || 'Event';
    const titleBn = existing?.titleBn || title;

    const filtered = events.filter(e => e.id !== id);
    setEvents(filtered);
    try {
      localStorage.setItem('nswo_events', JSON.stringify(filtered));
    } catch {}

    await logActivity(
      'event_delete',
      `Event '${title}' scheduled for ${existing?.date || ''} was deleted.`,
      `${existing?.date || ''} তারিখে সিডিউলকৃত ইভেন্ট '${titleBn}' মুছে ফেলা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_evt_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'events', id));
    } catch (error) {
      console.warn("Firestore event delete failed, kept local:", error);
    }
  };

  const addEventDonor = async (donorData: Omit<EventDonor, 'id' | 'createdAt'>) => {
    const localId = `local_dnr_${Date.now()}`;
    const newDonor = {
      id: localId,
      ...donorData,
      createdAt: Date.now(),
    };

    const updated = [newDonor, ...donors];
    setDonors(updated);
    try {
      localStorage.setItem('nswo_event_donors', JSON.stringify(updated));
    } catch {}

    const eventTitle = events.find(e => e.id === donorData.eventId)?.title || 'Event';
    const eventTitleBn = events.find(e => e.id === donorData.eventId)?.titleBn || eventTitle;
    await logActivity(
      'payment_add',
      `Donation contribution of ৳${donorData.amount} received from '${donorData.name}' for event '${eventTitle}'.`,
      `ইভেন্ট '${eventTitleBn}' এর জন্য '${donorData.name}' এর কাছ থেকে ৳${donorData.amount} অনুদান আদায় করা হয়েছে।`
    ).catch(() => {});

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return localId;
    }

    try {
      const dbDonor = { ...newDonor };
      delete (dbDonor as any).id;
      const docRef = await addDoc(collection(db, 'event_donors'), dbDonor);
      
      const synced = updated.map(d => d.id === localId ? { ...d, id: docRef.id } : d);
      setDonors(synced);
      localStorage.setItem('nswo_event_donors', JSON.stringify(synced));
      return docRef.id;
    } catch (error) {
      console.warn("Firestore donor create failed, kept local:", error);
      return localId;
    }
  };

  const deleteEventDonor = async (id: string) => {
    const existing = donors.find(d => d.id === id);
    const donorName = existing?.name || '';
    const eventTitle = events.find(e => e.id === existing?.eventId)?.title || 'Event';
    const eventTitleBn = events.find(e => e.id === existing?.eventId)?.titleBn || eventTitle;

    const filtered = donors.filter(d => d.id !== id);
    setDonors(filtered);
    try {
      localStorage.setItem('nswo_event_donors', JSON.stringify(filtered));
    } catch {}

    await logActivity(
      'payment_delete',
      `Donation entry of ৳${existing?.amount || 0} by '${donorName}' for event '${eventTitle}' was deleted.`,
      `ইভেন্ট '${eventTitleBn}' এর জন্য '${donorName}' এর ৳${existing?.amount || 0} অনুদান এন্ট্রিটি মুছে ফেলা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_dnr_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'event_donors', id));
    } catch (error) {
      console.warn("Firestore donor delete failed, kept local:", error);
    }
  };

  const addEventExpense = async (expenseData: Omit<EventExpense, 'id' | 'createdAt'>) => {
    const localId = `local_etx_${Date.now()}`;
    const newExpense = {
      id: localId,
      ...expenseData,
      createdAt: Date.now(),
    };

    const updated = [newExpense, ...expenses];
    setExpenses(updated);
    try {
      localStorage.setItem('nswo_event_expenses', JSON.stringify(updated));
    } catch {}

    const eventTitle = events.find(e => e.id === expenseData.eventId)?.title || 'Event';
    const eventTitleBn = events.find(e => e.id === expenseData.eventId)?.titleBn || eventTitle;
    await logActivity(
      'expense_add',
      `Event expense of ৳${expenseData.amount} for '${expenseData.title}' recorded under event '${eventTitle}'.`,
      `ইভেন্ট '${eventTitleBn}' এর জন্য '${expenseData.titleBn || expenseData.title}' খাতে ৳${expenseData.amount} খরচ রেকর্ড করা হয়েছে।`
    ).catch(() => {});

    if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded) {
      return localId;
    }

    try {
      const dbExpense = { ...newExpense };
      delete (dbExpense as any).id;
      const docRef = await addDoc(collection(db, 'event_expenses'), dbExpense);
      
      const synced = updated.map(ex => ex.id === localId ? { ...ex, id: docRef.id } : ex);
      setExpenses(synced);
      localStorage.setItem('nswo_event_expenses', JSON.stringify(synced));
      return docRef.id;
    } catch (error) {
      console.warn("Firestore event expense create failed, kept local:", error);
      return localId;
    }
  };

  const deleteEventExpense = async (id: string) => {
    const existing = expenses.find(e => e.id === id);
    const expenseTitle = existing?.title || '';
    const expenseTitleBn = existing?.titleBn || expenseTitle;
    const eventTitle = events.find(e => e.id === existing?.eventId)?.title || 'Event';
    const eventTitleBn = events.find(e => e.id === existing?.eventId)?.titleBn || eventTitle;

    const filtered = expenses.filter(ex => ex.id !== id);
    setExpenses(filtered);
    try {
      localStorage.setItem('nswo_event_expenses', JSON.stringify(filtered));
    } catch {}

    await logActivity(
      'expense_delete',
      `Expense entry of ৳${existing?.amount || 0} for '${expenseTitle}' under event '${eventTitle}' was deleted.`,
      `ইভেন্ট '${eventTitleBn}' এর জন্য '${expenseTitleBn}' খাতের ৳${existing?.amount || 0} খরচ এন্ট্রিটি মুছে ফেলা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_etx_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'event_expenses', id));
    } catch (error) {
      console.warn("Firestore event expense delete failed, kept local:", error);
    }
  };

  const updateEventDonor = async (id: string, donorData: Partial<EventDonor>) => {
    const updated = donors.map(d => d.id === id ? { ...d, ...donorData } : d);
    setDonors(updated);
    try {
      localStorage.setItem('nswo_event_donors', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'payment_update',
      `Event donor entry ID ${id} was updated.`,
      `ইভেন্ট অনুদান দাতা এন্ট্রি ID ${id} আপডেট করা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_dnr_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      const donorRef = doc(db, 'event_donors', id);
      await updateDoc(donorRef, donorData);
    } catch (error) {
      console.warn("Firestore event donor update failed, kept local:", error);
    }
  };

  const updateEventExpense = async (id: string, expenseData: Partial<EventExpense>) => {
    const updated = expenses.map(ex => ex.id === id ? { ...ex, ...expenseData } : ex);
    setExpenses(updated);
    try {
      localStorage.setItem('nswo_event_expenses', JSON.stringify(updated));
    } catch {}

    await logActivity(
      'expense_update',
      `Event expense entry ID ${id} was updated.`,
      `ইভেন্টের খরচ এন্ট্রি ID ${id} আপডেট করা হয়েছে।`
    ).catch(() => {});

    if (id.startsWith('local_etx_') || (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded)) {
      return;
    }

    try {
      const expenseRef = doc(db, 'event_expenses', id);
      await updateDoc(expenseRef, expenseData);
    } catch (error) {
      console.warn("Firestore event expense update failed, kept local:", error);
    }
  };

  return {
    events,
    donors,
    expenses,
    loading,
    addEvent,
    updateEvent,
    deleteEvent,
    addEventDonor,
    deleteEventDonor,
    updateEventDonor,
    addEventExpense,
    deleteEventExpense,
    updateEventExpense
  };
}
