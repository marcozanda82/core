import { useState } from 'react';
import { APP_THEMES, cycleAppTheme, readStoredAppTheme } from './appTheme';

/**
 * Mini-toggle header: cicla Dark → Caldo → Clinico sul documentElement.
 */
export default function ThemeCycleButton() {
  const [themeId, setThemeId] = useState(readStoredAppTheme);
  const current = APP_THEMES.find((theme) => theme.id === themeId) || APP_THEMES[0];

  return (
    <button
      type="button"
      onClick={() => setThemeId(cycleAppTheme(themeId))}
      aria-label={`Tema ${current.label}. Tocca per cambiare.`}
      title={`Tema: ${current.label}`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[0.95rem]"
      style={{
        background: 'var(--app-surface)',
        color: 'var(--app-text)',
        borderColor: 'var(--app-border)',
      }}
    >
      <span aria-hidden>{current.icon}</span>
    </button>
  );
}
