/* Light, dark, or whatever the machine is set to.
 *
 * Three states rather than two, because "follow the system" is a real answer and
 * not the same as picking dark. Only an explicit choice stamps `data-theme` on
 * <html>; "system" removes the attribute entirely and lets the media query in
 * tokens.css decide, which is also what a first-time visitor gets.
 *
 * Dark stays the base palette. Airlock is an instrument surface and that is its
 * identity, so someone who has never expressed a preference sees the app as it
 * was designed rather than a light version of it.
 */

export type Theme = 'light' | 'dark' | 'system';

const KEY = 'airlock.theme.v1';

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    /* Private windows and blocked site data throw rather than returning null.
       No stored preference is the same as not having one. */
    return 'system';
  }
}

export function applyTheme(t: Theme): void {
  const el = document.documentElement;
  if (t === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', t);

  /* Tells the browser which palette the page is actually painting, so form
     controls, scrollbars and the space around the page match it. Without this a
     light page keeps dark scrollbars. */
  el.style.colorScheme = t === 'system' ? 'light dark' : t;

  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* The theme still applies for this page view; it just will not be
       remembered. Not worth surfacing. */
  }
}

/* What the page is actually showing right now, which is not the same as what was
   chosen — "system" resolves to one or the other. */
export function resolved(t: Theme): 'light' | 'dark' {
  if (t !== 'system') return t;
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/* Apply before React mounts, so the first paint is already the right palette
   rather than a dark flash followed by a correction. */
export function initTheme(): void {
  applyTheme(readTheme());
}
