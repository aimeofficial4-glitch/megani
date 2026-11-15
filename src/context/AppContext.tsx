import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch } from '../services/api';
import { AppUser, NotificationItem, ToastMessage } from '../types';

interface AppContextValue {
  user: AppUser | null;
  authLoading: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  notifications: NotificationItem[];
  unreadCount: number;
  refreshNotifications: () => Promise<void>;
  refreshUser: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<AppUser>;
  registerWithEmail: (payload: {
    fullName: string;
    email: string;
    password: string;
    organization?: string;
    acceptTerms: boolean;
  }) => Promise<AppUser>;
  loginWithGoogle: () => Promise<AppUser>;
  logout: () => Promise<void>;
  saveToLibrary: (item: {
    type: string;
    title: string;
    url?: string;
    snippet?: string;
    notes?: string;
    category?: string;
    tags?: string[];
  }) => Promise<boolean>;
  toasts: ToastMessage[];
  addToast: (message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
  searchModalOpen: boolean;
  setSearchModalOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

function hasPersonalizationConsentCookie(): boolean {
  try {
    const match = document.cookie
      .split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith('2mr_consent='));
    if (!match) return false;
    const raw = decodeURIComponent(match.slice('2mr_consent='.length));
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.personalization);
  } catch {
    return false;
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const [theme, setThemeState] = useState<'dark' | 'light'>(() => {
    if (!hasPersonalizationConsentCookie()) return 'dark';
    const saved = localStorage.getItem('2mr_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    if (hasPersonalizationConsentCookie()) {
      localStorage.setItem('2mr_theme', theme);
    } else {
      localStorage.removeItem('2mr_theme');
    }
  }, [theme]);

  // Keyboard shortcut Ctrl+K / Cmd+K for Global Search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(data.notifications || []);
    } catch {
      setNotifications([]);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: AppUser | null }>('/api/auth/me');
      setUser(data.user || null);
      if (data.user) {
        if (data.user.preferredTheme === 'light' || data.user.preferredTheme === 'dark') {
          setThemeState(data.user.preferredTheme);
        }
        refreshNotifications();
      } else {
        setNotifications([]);
      }
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, [refreshNotifications]);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = onAuthStateChanged(auth, () => {
      if (mounted) refreshUser();
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [refreshUser]);

  const setTheme = useCallback(
    (nextTheme: 'dark' | 'light') => {
      setThemeState(nextTheme);
      if (user) {
        apiFetch('/api/user/settings', {
          method: 'PATCH',
          body: JSON.stringify({ preferredTheme: nextTheme }),
        }).catch(() => {});
      }
    },
    [user]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch<{ user: AppUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      refreshNotifications();
      return data.user;
    },
    [refreshNotifications]
  );

  const registerWithEmail = useCallback(
    async (payload: {
      fullName: string;
      email: string;
      password: string;
      organization?: string;
      acceptTerms: boolean;
    }) => {
      const data = await apiFetch<{ user: AppUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUser(data.user);
      refreshNotifications();
      return data.user;
    },
    [refreshNotifications]
  );

  const loginWithGoogle = useCallback(async () => {
    const result = await signInWithPopup(auth, googleAuthProvider);
    const token = await result.user.getIdToken();
    const data = await apiFetch<{ user: AppUser }>('/api/auth/google', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setUser(data.user);
    refreshNotifications();
    return data.user;
  }, [refreshNotifications]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    try {
      await firebaseSignOut(auth);
    } catch {
      // ignore
    }
    setUser(null);
    setNotifications([]);
    addToast('Signed out cleanly.', 'info');
  }, [addToast]);

  const saveToLibrary = useCallback(
    async (item: {
      type: string;
      title: string;
      url?: string;
      snippet?: string;
      notes?: string;
      category?: string;
      tags?: string[];
    }) => {
      if (!user) {
        addToast('Please sign in to save items to My Knowledge.', 'warning');
        return false;
      }
      try {
        await apiFetch('/api/library/items', {
          method: 'POST',
          body: JSON.stringify(item),
        });
        addToast(`Saved "${item.title.slice(0, 42)}" to My Knowledge.`, 'success');
        return true;
      } catch (err: any) {
        addToast(err.message || 'Unable to save item.', 'error');
        return false;
      }
    },
    [user, addToast]
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <AppContext.Provider
      value={{
        user,
        authLoading,
        theme,
        toggleTheme,
        setTheme,
        notifications,
        unreadCount,
        refreshNotifications,
        refreshUser,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        logout,
        saveToLibrary,
        toasts,
        addToast,
        removeToast,
        searchModalOpen,
        setSearchModalOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
