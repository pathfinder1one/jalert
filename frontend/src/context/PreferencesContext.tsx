import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import i18n from '../i18n';
import type { SupportedLanguage } from '../i18n/languages';
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
}

const storageKey = 'jalert.preferences';

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export const PreferencesProvider = ({ children }: PropsWithChildren) => {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<SupportedLanguage>('en');
  const [comfortMode, setComfortMode] = useState(false);
  const [fieldMode, setFieldMode] = useState(false);
  const [accessibilityMode, setAccessibilityMode] = useState(false);
  const [activeVillageId, setActiveVillageId] = useState<string | null>(null);
  const [savedVillageIds, setSavedVillageIds] = useState<string[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        language?: SupportedLanguage;
        comfortMode?: boolean;
        fieldMode?: boolean;
        accessibilityMode?: boolean;
        activeVillageId?: string | null;
        savedVillageIds?: string[];
      };
      if (parsed.language) {
        setLanguageState(parsed.language);
        void i18n.changeLanguage(parsed.language);
      }
      setComfortMode(Boolean(parsed.comfortMode));
      setFieldMode(Boolean(parsed.fieldMode));
      setAccessibilityMode(Boolean(parsed.accessibilityMode));
      setActiveVillageId(parsed.activeVillageId ?? null);
      setSavedVillageIds(parsed.savedVillageIds ?? []);
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    if (user?.preferred_language) {
      const nextLanguage = user.preferred_language as SupportedLanguage;
      setLanguageState(nextLanguage);
      void i18n.changeLanguage(nextLanguage);
    }
    if (user?.village_id && !activeVillageId) {
      setActiveVillageId(user.village_id);
    }
  }, [activeVillageId, user?.preferred_language, user?.village_id]);

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ language, comfortMode, fieldMode, accessibilityMode, activeVillageId, savedVillageIds }),
    );
    document.documentElement.dataset.comfort = String(comfortMode);
    document.documentElement.dataset.fieldMode = String(fieldMode);
    document.documentElement.dataset.accessibilityMode = String(accessibilityMode);
  }, [activeVillageId, comfortMode, fieldMode, accessibilityMode, language, savedVillageIds]);

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
          current.includes(value)
            ? current.filter((item) => item !== value)
            : [...current, value],
        ),
    }),
    [activeVillageId, comfortMode, fieldMode, accessibilityMode, language, savedVillageIds],
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
