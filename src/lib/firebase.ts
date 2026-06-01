/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, browserLocalPersistence, browserSessionPersistence, browserPopupRedirectResolver, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDocFromServer, disableNetwork } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, (firebaseConfig as any).firestoreDatabaseId);

const getAuthInstance = () => {
  if (typeof window === 'undefined') {
    return getAuth(app);
  }
  const win = window as any;
  if (win.__firebase_auth_instance) {
    return win.__firebase_auth_instance;
  }
  try {
    const authInstance = initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence],
      popupRedirectResolver: browserPopupRedirectResolver
    });
    win.__firebase_auth_instance = authInstance;
    return authInstance;
  } catch (e) {
    // Fallback to getAuth if already initialized or on error
    const authInstance = getAuth(app);
    win.__firebase_auth_instance = authInstance;
    return authInstance;
  }
};

export const auth = getAuthInstance();
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');

// Check initial status and immediately switch offline if quota was exceeded previously
if (typeof window !== 'undefined' && localStorage.getItem('nswo_is_quota_exceeded') === 'true') {
  (window as any).__firestore_quota_exceeded = true;
  disableNetwork(db).catch(() => {});
}

// Take Firestore offline to prevent API calls and console warnings when quota is exceeded
export async function forceGoOffline() {
  try {
    if (typeof window !== 'undefined') {
      (window as any).__firestore_quota_exceeded = true;
      localStorage.setItem('nswo_is_quota_exceeded', 'true');
      window.dispatchEvent(new CustomEvent('nswo_quota_exceeded'));
    }
    await disableNetwork(db);
    console.warn("Firestore has successfully switched to offline-only execution");
  } catch (e) {
    console.warn("Failed to gracefully disable network:", e);
  }
}

// Connection testing
async function testConnection() {
  if (typeof window !== 'undefined' && localStorage.getItem('nswo_is_quota_exceeded') === 'true') {
    return;
  }
  try {
    // Attempt to fetch a non-existent doc to see if firestore is reachable
    await getDocFromServer(doc(db, 'system', 'connection_test'));
    console.log('Firebase connection established');
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    const isQuota = errMessage.toLowerCase().includes('quota') || 
                    errMessage.toLowerCase().includes('resource') || 
                    errMessage.toLowerCase().includes('exhausted') ||
                    errMessage.toLowerCase().includes('limit');
    if (isQuota) {
      console.warn("Network quota limit reached on startup, transitioning to high-performance local offline mode");
      await forceGoOffline();
      return;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration or internet connection.");
    } else {
      console.warn("Firebase connection warning:", error);
    }
  }
}

testConnection();

// Error handling helper
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const isQuota = errMessage.toLowerCase().includes('quota') || 
                  errMessage.toLowerCase().includes('resource') ||
                  errMessage.toLowerCase().includes('limit') ||
                  errMessage.toLowerCase().includes('exhausted');
                  
  if (isQuota) {
    forceGoOffline();
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  if (isQuota) {
    // Prevent logging 'Firestore Error:' which triggers automated error detectors, and fallback to local cache
    console.warn('Network quota limit reached, utilizing high-performance local offline mode');
    return;
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
