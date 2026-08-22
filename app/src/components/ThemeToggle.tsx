/* Light / system / dark, as a three-way segmented control.
 *
 * A two-state switch would force a choice nobody asked to make: someone whose
 * machine already flips at sunset wants the app to follow it, and a toggle with
 * only light and dark takes that away with no route back. So "system" is a
 * first-class option and the default, not a hidden reset.
 */

import { useEffect, useState } from 'react';
import { applyTheme, readTheme, type Theme } from '../lib/theme';

const OPTIONS: { value: Theme; label: string; title: string }[] = [
  { value: 'light', label: 'Light', title: 'Always light' },
  { value: 'system', label: 'Auto', title: 'Follow this device' },
  { value: 'dark', label: 'Dark', title: 'Always dark' },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  /* On "system", the OS can change under us — at sunset, or when someone flips
     it in settings while this tab is open. Without this the page keeps the
     palette it happened to load with. */
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  return (
    <div className="theme-seg" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          className={`theme-btn${theme === o.value ? ' theme-on' : ''}`}
          onClick={() => setTheme(o.value)}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
