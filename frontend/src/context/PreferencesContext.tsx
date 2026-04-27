import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import i18n from '../i18n';
import type { SupportedLanguage } from '../i18n/languages';
import { authService } from '../services/authService';
import { useAuth } from './AuthContext';

interface PreferencesContextValue {
  language: SupportedLanguage;
  setLanguage: (value: SupportedLanguage) => void;
  comfortMode: boolean;
  toggleComfortMode: () => void;
  fieldMode: boolean;
  toggleFieldMode: () => void;
  accessibilityMode: boolean;
  toggleAccessibilityMode: () => void;
  activeVillageId: string | null;
  setActiveVillageId: (value: string | null) => void;
  savedVillageIds: string[];
  toggleSavedVillage: (value: string) => void;
  emailNotifications: boolean;
  toggleEmailNotifications: () => void;
  smsNotifications: boolean;
  toggleSmsNotifications: () => void;
  voiceNotifications: boolean;
  toggleVoiceNotifications: () => void;
  dailySummaryEnabled: boolean;
  toggleDailySummaryEnabled: () => void;
}

interface StoredPreferences {
  language: SupportedLanguage;
  comfortMode: boolean;
  fieldMode: boolean;
  accessibilityMode: boolean;
  activeVillageId: string | null;
  savedVillageIds: string[];
  emailNotifications: boolean;
  smsNotifications: boolean;
  voiceNotifications: boolean;
  dailySummaryEnabled: boolean;
}

const storageKey = 'jalert.preferences';
const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

const buildSnapshot = (prefs: StoredPreferences) =>
  JSON.stringify({
    language: prefs.language,
    comfort_mode: prefs.comfortMode,
    field_mode: prefs.fieldMode,
    accessibility_mode: prefs.accessibilityMode,
    active_village_id: prefs.activeVillageId,
    saved_village_ids: prefs.savedVillageIds,
    email_notifications: prefs.emailNotifications,
    sms_notifications: prefs.smsNotifications,
    voice_notifications: prefs.voiceNotifications,
    daily_summary_enabled: prefs.dailySummaryEnabled,
  });

export const PreferencesProvider = ({ children }: PropsWithChildren) => {
  const { user } = useAuth();
  const remoteSnapshotRef = useRef<string | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [language, setLanguageState] = useState<SupportedLanguage>('en');
  const [comfortMode, setComfortMode] = useState(false);
  const [fieldMode, setFieldMode] = useState(false);
  const [accessibilityMode, setAccessibilityMode] = useState(false);
  const [activeVillageId, setActiveVillageId] = useState<string | null>(null);
  const [savedVillageIds, setSavedVillageIds] = useState<string[]>([]);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(true);
  const [voiceNotifications, setVoiceNotifications] = useState(false);
  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<StoredPreferences>;
        if (parsed.language) {
          setLanguageState(parsed.language);
          void i18n.changeLanguage(parsed.language);
        }
        setComfortMode(Boolean(parsed.comfortMode));
        setFieldMode(Boolean(parsed.fieldMode));
        setAccessibilityMode(Boolean(parsed.accessibilityMode));
        setActiveVillageId(parsed.activeVillageId ?? null);
        setSavedVillageIds(parsed.savedVillageIds ?? []);
        setEmailNotifications(parsed.emailNotifications ?? true);
        setSmsNotifications(parsed.smsNotifications ?? true);
        setVoiceNotifications(parsed.voiceNotifications ?? false);
        setDailySummaryEnabled(parsed.dailySummaryEnabled ?? true);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!user) {
      setRemoteReady(false);
      remoteSnapshotRef.current = null;
      return;
    }

    let cancelled = false;
    setRemoteReady(false);

    void authService
      .getPreferences()
      .then((prefs) => {
        if (cancelled) {
          return;
        }
        const nextLanguage = (prefs.language || user.preferred_language || 'en') as SupportedLanguage;
        setLanguageState(nextLanguage);
        void i18n.changeLanguage(nextLanguage);
        setComfortMode(Boolean(prefs.comfort_mode));
        setFieldMode(Boolean(prefs.field_mode));
        setAccessibilityMode(Boolean(prefs.accessibility_mode));
        setActiveVillageId(prefs.active_village_id ?? user.village_id ?? null);
        setSavedVillageIds(prefs.saved_village_ids ?? (user.village_id ? [user.village_id] : []));
        setEmailNotifications(prefs.email_notifications);
        setSmsNotifications(prefs.sms_notifications);
        setVoiceNotifications(prefs.voice_notifications);
        setDailySummaryEnabled(prefs.daily_summary_enabled);
        remoteSnapshotRef.current = buildSnapshot({
          language: nextLanguage,
          comfortMode: Boolean(prefs.comfort_mode),
          fieldMode: Boolean(prefs.field_mode),
          accessibilityMode: Boolean(prefs.accessibility_mode),
          activeVillageId: prefs.active_village_id ?? user.village_id ?? null,
          savedVillageIds: prefs.saved_village_ids ?? (user.village_id ? [user.village_id] : []),
          emailNotifications: prefs.email_notifications,
          smsNotifications: prefs.sms_notifications,
          voiceNotifications: prefs.voice_notifications,
          dailySummaryEnabled: prefs.daily_summary_enabled,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        if (user.preferred_language) {
          const nextLanguage = user.preferred_language as SupportedLanguage;
          setLanguageState(nextLanguage);
          void i18n.changeLanguage(nextLanguage);
        }
        if (user.village_id && !activeVillageId) {
          setActiveVillageId(user.village_id);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRemoteReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const localState: StoredPreferences = {
      language,
      comfortMode,
      fieldMode,
      accessibilityMode,
      activeVillageId,
      savedVillageIds,
      emailNotifications,
      smsNotifications,
      voiceNotifications,
      dailySummaryEnabled,
    };

    localStorage.setItem(storageKey, JSON.stringify(localState));
    document.documentElement.dataset.comfort = String(comfortMode);
    document.documentElement.dataset.fieldMode = String(fieldMode);
    document.documentElement.dataset.accessibilityMode = String(accessibilityMode);

    if (!user || !remoteReady) {
      return;
    }

    const nextSnapshot = buildSnapshot(localState);
    if (nextSnapshot === remoteSnapshotRef.current) {
      return;
    }

    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      void authService
        .updatePreferences({
          language,
          comfort_mode: comfortMode,
          field_mode: fieldMode,
          accessibility_mode: accessibilityMode,
          active_village_id: activeVillageId,
          saved_village_ids: savedVillageIds,
          email_notifications: emailNotifications,
          sms_notifications: smsNotifications,
          voice_notifications: voiceNotifications,
          daily_summary_enabled: dailySummaryEnabled,
        })
        .then((prefs) => {
          remoteSnapshotRef.current = buildSnapshot({
            language: prefs.language as SupportedLanguage,
            comfortMode: prefs.comfort_mode,
            fieldMode: prefs.field_mode,
            accessibilityMode: prefs.accessibility_mode,
            activeVillageId: prefs.active_village_id ?? null,
            savedVillageIds: prefs.saved_village_ids ?? [],
            emailNotifications: prefs.email_notifications,
            smsNotifications: prefs.sms_notifications,
            voiceNotifications: prefs.voice_notifications,
            dailySummaryEnabled: prefs.daily_summary_enabled,
          });
        })
        .catch(() => undefined);
    }, 350);

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [
    accessibilityMode,
    activeVillageId,
    comfortMode,
    dailySummaryEnabled,
    emailNotifications,
    fieldMode,
    hasHydrated,
    language,
    remoteReady,
    savedVillageIds,
    smsNotifications,
    user,
    voiceNotifications,
  ]);

  const value = useMemo(
    () => ({
      language,
      setLanguage: (value: SupportedLanguage) => {
        setLanguageState(value);
        void i18n.changeLanguage(value);
      },
      comfortMode,
      toggleComfortMode: () => setComfortMode((current) => !current),
      fieldMode,
      toggleFieldMode: () => setFieldMode((current) => !current),
      accessibilityMode,
      toggleAccessibilityMode: () => setAccessibilityMode((current) => !current),
      activeVillageId,
      setActiveVillageId,
      savedVillageIds,
      toggleSavedVillage: (value: string) =>
        setSavedVillageIds((current) =>
          current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
        ),
      emailNotifications,
      toggleEmailNotifications: () => setEmailNotifications((current) => !current),
      smsNotifications,
      toggleSmsNotifications: () => setSmsNotifications((current) => !current),
      voiceNotifications,
      toggleVoiceNotifications: () => setVoiceNotifications((current) => !current),
      dailySummaryEnabled,
      toggleDailySummaryEnabled: () => setDailySummaryEnabled((current) => !current),
    }),
    [
      accessibilityMode,
      activeVillageId,
      comfortMode,
      dailySummaryEnabled,
      emailNotifications,
      fieldMode,
      language,
      savedVillageIds,
      smsNotifications,
      voiceNotifications,
    ],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used inside PreferencesProvider');
  }
  return context;
};
