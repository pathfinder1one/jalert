import { usePreferences } from '../context/PreferencesContext';

export const UtilityToggle = () => {
  const { comfortMode, toggleComfortMode, accessibilityMode, toggleAccessibilityMode } = usePreferences();

  return (
    <div className="utility-toggle-group">
      <button
        type="button"
        className="utility-toggle"
        onClick={toggleComfortMode}
        aria-pressed={comfortMode}
      >
        Comfort {comfortMode ? 'On' : 'Off'}
      </button>
      <button
        type="button"
        className="utility-toggle"
        onClick={toggleAccessibilityMode}
        aria-pressed={accessibilityMode}
      >
        Easy Read {accessibilityMode ? 'On' : 'Off'}
      </button>
    </div>
  );
};
