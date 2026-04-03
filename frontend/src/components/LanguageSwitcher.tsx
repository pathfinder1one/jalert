import { useId } from 'react';
import { LANGUAGES, type SupportedLanguage } from '../i18n/languages';
import { usePreferences } from '../context/PreferencesContext';

export const LanguageSwitcher = () => {
  const id = useId();
  const { language, setLanguage } = usePreferences();

  return (
    <label htmlFor={id} className="field">
      <span className="sr-only">Language</span>
      <select
        id={id}
        className="language-select"
        value={language}
        onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
        aria-label="Select language"
      >
        {LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
};
