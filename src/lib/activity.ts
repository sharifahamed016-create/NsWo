import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

export async function logActivity(type: string, message: string, messageBn: string) {
  try {
    const userEmail = auth.currentUser?.email || 'system_guest';
    await addDoc(collection(db, 'activities'), {
      type,
      message,
      messageBn,
      userEmail,
      createdAt: Date.now()
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}
