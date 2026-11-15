import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import { useApp } from './AppContext';

export interface CookieConsentState {
  id?: string | null;
  visitorId?: string;
  policyVersion: string;
  action: 'accept_all' | 'reject_optional' | 'customized' | 'withdrawn';
  necessary: true;
  analytics: boolean;
  personalization: boolean;
  advertising: boolean;
  consentedAt?: string;
  updatedAt?: string;
}

interface ConsentContextValue {
  consent: CookieConsentState | null;
  loading: boolean;
  policyVersion: string;
  showBanner: boolean;
  customizeOpen: boolean;
  openCustomizeModal: () => void;
  closeCustomizeModal: () => void;
  acceptAll: () => Promise<void>;
  rejectOptional: () => Promise<void>;
  saveCustomPreferences: (prefs: {
    analytics: boolean;
    personalization: boolean;
    advertising: boolean;
  }) => Promise<void>;
  withdrawConsent: () => Promise<void>;
  refreshConsent: () => Promise<void>;
}

const ConsentContext = createContext<ConsentContextValue | undefined>(undefined);

function syncOptionalClientStorage(next: CookieConsentState | null) {
  try {
    if (!next || !next.personalization) {
      localStorage.removeItem('2mr_theme');
    }
  } catch {
    // ignore storage errors
  }
}

export const ConsentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, addToast } = useApp();
  const [consent, setConsent] = useState<CookieConsentState | null>(null);
  const [policyVersion, setPolicyVersion] = useState('2026.1');
  const [loading, setLoading] = useState(true);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const refreshConsent = useCallback(async () => {
    try {
      const res = await apiFetch<{
        hasConsent: boolean;
        policyVersion: string;
        consent: CookieConsentState | null;
      }>('/api/privacy/consent');
      setPolicyVersion(res.policyVersion || '2026.1');
      setConsent(res.consent || null);
      syncOptionalClientStorage(res.consent || null);
    } catch {
      // Keep existing state on transient error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshConsent();
  }, [refreshConsent, user?.id]);

  const openCustomizeModal = useCallback(() => setCustomizeOpen(true), []);
  const closeCustomizeModal = useCallback(() => setCustomizeOpen(false), []);

  const acceptAll = useCallback(async () => {
    try {
      const res = await apiFetch<{ consent: CookieConsentState; policyVersion: string }>(
        '/api/privacy/consent',
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'accept_all',
            analytics: true,
            personalization: true,
            advertising: true,
          }),
        }
      );
      setConsent(res.consent);
      setPolicyVersion(res.policyVersion || '2026.1');
      syncOptionalClientStorage(res.consent);
      setCustomizeOpen(false);
      addToast('Cookie preferences saved (All cookies accepted).', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save cookie preferences.', 'error');
    }
  }, [addToast]);

  const rejectOptional = useCallback(async () => {
    try {
      const res = await apiFetch<{ consent: CookieConsentState; policyVersion: string }>(
        '/api/privacy/consent',
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'reject_optional',
            analytics: false,
            personalization: false,
            advertising: false,
          }),
        }
      );
      setConsent(res.consent);
      setPolicyVersion(res.policyVersion || '2026.1');
      syncOptionalClientStorage(res.consent);
      setCustomizeOpen(false);
      addToast('Optional cookies rejected. Only strictly necessary cookies are active.', 'info');
    } catch (err: any) {
      addToast(err.message || 'Failed to save cookie preferences.', 'error');
    }
  }, [addToast]);

  const saveCustomPreferences = useCallback(
    async (prefs: { analytics: boolean; personalization: boolean; advertising: boolean }) => {
      try {
        const res = await apiFetch<{ consent: CookieConsentState; policyVersion: string }>(
          '/api/privacy/consent',
          {
            method: 'POST',
            body: JSON.stringify({
              action: 'customized',
              analytics: Boolean(prefs.analytics),
              personalization: Boolean(prefs.personalization),
              advertising: Boolean(prefs.advertising),
            }),
          }
        );
        setConsent(res.consent);
        setPolicyVersion(res.policyVersion || '2026.1');
        syncOptionalClientStorage(res.consent);
        setCustomizeOpen(false);
        addToast('Custom cookie preferences saved.', 'success');
      } catch (err: any) {
        addToast(err.message || 'Failed to save custom preferences.', 'error');
      }
    },
    [addToast]
  );

  const withdrawConsent = useCallback(async () => {
    try {
      const res = await apiFetch<{ consent: CookieConsentState; policyVersion: string }>(
        '/api/privacy/consent',
        { method: 'DELETE' }
      );
      setConsent(res.consent);
      setPolicyVersion(res.policyVersion || '2026.1');
      syncOptionalClientStorage(res.consent);
      setCustomizeOpen(false);
      addToast('Optional cookie consent withdrawn.', 'info');
    } catch (err: any) {
      addToast(err.message || 'Failed to withdraw consent.', 'error');
    }
  }, [addToast]);

  // Display banner on first visit (when no prior consent decision exists) and modal isn't open
  const showBanner = !loading && consent === null && !customizeOpen;

  return (
    <ConsentContext.Provider
      value={{
        consent,
        loading,
        policyVersion,
        showBanner,
        customizeOpen,
        openCustomizeModal,
        closeCustomizeModal,
        acceptAll,
        rejectOptional,
        saveCustomPreferences,
        withdrawConsent,
        refreshConsent,
      }}
    >
      {children}
    </ConsentContext.Provider>
  );
};

export function useConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used inside ConsentProvider');
  return ctx;
}
