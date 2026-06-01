/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, 
  signInWithEmailAndPassword, sendPasswordResetEmail,
  GoogleAuthProvider,
  browserPopupRedirectResolver
} from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Language, translations } from '../lib/i18n';
import { useSettings, AppSettings } from '../hooks/useSettings';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'VIEWER';

interface AppContextType {
  user: User | null;
  loading: boolean;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: any;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  isViewer: boolean;
  userRole: UserRole | null;
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  googleAccessToken: string | null;
  setGoogleAccessToken: (token: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [language, setLanguageState] = useState<Language>('bn');
  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  
  const [googleAccessToken, setGoogleAccessTokenState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('nswo_g_access_token');
    } catch {
      return null;
    }
  });

  const setGoogleAccessToken = (token: string | null) => {
    setGoogleAccessTokenState(token);
    try {
      if (token) {
        localStorage.setItem('nswo_g_access_token', token);
      } else {
        localStorage.removeItem('nswo_g_access_token');
      }
    } catch {}
  };

  useEffect(() => {
    let unsubscribeRole: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      if (unsubscribeRole) {
        unsubscribeRole();
        unsubscribeRole = undefined;
      }

      if (authUser && authUser.email) {
        const emailLower = authUser.email.toLowerCase();
        const roleDocRef = doc(db, 'user_roles', emailLower);

        setAuthLoading(true);

        // Real-time listener for current user's role mapping (or local fallback if offline/quota)
        if (typeof window !== 'undefined' && ((window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true')) {
          if (emailLower === 'sharifahamed016@gmail.com') {
            setUserRole('SUPER_ADMIN');
          } else if (emailLower === 'moderator@example.com') {
            setUserRole('MODERATOR');
          } else {
            setUserRole('VIEWER');
          }
          setAuthLoading(false);
        } else {
          unsubscribeRole = onSnapshot(roleDocRef, (snap) => {
            if (snap.exists() && snap.data().role) {
              setUserRole(snap.data().role as UserRole);
            } else {
              // Hardcoded default rules
              if (emailLower === 'sharifahamed016@gmail.com') {
                setUserRole('SUPER_ADMIN');
              } else if (emailLower === 'moderator@example.com') {
                setUserRole('MODERATOR');
              } else {
                setUserRole('VIEWER');
              }
            }
            setAuthLoading(false);
          }, (error) => {
            console.warn("User roles snapshot failed, falling back to offline defaults:", error);
            if (emailLower === 'sharifahamed016@gmail.com') {
              setUserRole('SUPER_ADMIN');
            } else if (emailLower === 'moderator@example.com') {
              setUserRole('MODERATOR');
            } else {
              setUserRole('VIEWER');
            }
            setAuthLoading(false);
          });
        }
      } else {
        setUserRole(null);
        setAuthLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubscribeRole) unsubscribeRole();
    };
  }, []);

  useEffect(() => {
    // Process redirect sign-in results (highly recommended for constraints inside framed sandboxes)
    getRedirectResult(auth, browserPopupRedirectResolver)
      .then((result) => {
        if (result) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken) {
            setGoogleAccessToken(credential.accessToken);
          }
        }
      })
      .catch((error) => {
        console.warn("Google Redirect Login processing info:", error);
      });
  }, []);

  const isSuperAdmin = userRole === 'SUPER_ADMIN' || user?.email === 'sharifahamed016@gmail.com';
  const isAdmin = userRole === 'ADMIN' || isSuperAdmin;
  const isModerator = userRole === 'MODERATOR' || isAdmin;
  const isViewer = userRole === 'VIEWER' || isModerator;

  const login = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
      }
    } catch (error: any) {
      console.warn("Popup authentication blocked or failed, triggering fallback redirect login...", error);
      if (
        error?.code === 'auth/cancelled-popup-request' ||
        error?.code === 'auth/popup-blocked' ||
        error?.code === 'auth/iframe-userAgent-not-supported' ||
        error?.code === 'auth/popup-closed-by-user'
      ) {
        try {
          await signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
        } catch (redirectErr) {
          console.error("Redirect authentication failed", redirectErr);
          throw redirectErr;
        }
      } else {
        throw error;
      }
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      console.error("Email login failed", error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error("Reset password failed", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setGoogleAccessToken(null);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const t = translations[language];
  const loading = authLoading || settingsLoading;

  return (
    <AppContext.Provider value={{ 
      user, loading, language, setLanguage, t, login, loginWithEmail, resetPassword, logout, isSuperAdmin, isAdmin, isModerator, isViewer, userRole,
      settings, updateSettings, googleAccessToken, setGoogleAccessToken
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
