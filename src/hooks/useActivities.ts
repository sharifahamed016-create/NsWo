import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Activity } from '../types';

export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'activities'), orderBy('createdAt', 'desc'), limit(100));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Activity[];
      setActivities(data);
      setLoading(false);
    }, (error) => {
      console.warn("Activities load error (likely missing index initially):", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { activities, loading };
}
