/* An address you can actually take with you.
 *
 * Every address this app shows is truncated, because a 66-character felt in a
 * layout is unreadable. But truncation makes it unusable too: the derived
 * account is the address a user must send STRK to, and until now the only way
 * to get it was to retype what they could see, which is most of it missing.
 *
 * So the short form stays and the button carries the full value. Clicking gives
 * the whole thing, never the ellipsis.
 *
 * The failure path matters more than the happy one. `navigator.clipboard` needs
 * a secure context and a permission that can be refused, and a copy button that
 * silently does nothing is worse than no button — the user walks away believing
 * they have the address. So a refusal reveals the full text instead, which is
 * always selectable by hand.
 */

import { useEffect, useRef, useState } from 'react';

export function Copyable({
  value,
  short,
  label,
}: {
  /* The whole thing — this is what lands on the clipboard. */
  value: string;
  /* What is shown when there is room for less. */
  short: string;
  /* Names the thing being copied, for anyone not looking at the screen. */
  label: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'revealed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Clear on unmount: the panel this sits in disappears when a flow moves on,
     and a timer firing into a gone component is a stray state update. */
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
      if (timer.current) clearTimeout(timer.current);
      /* Long enough to read, short enough that the address comes back before
         they look again to check it. */
      timer.current = setTimeout(() => setState('idle'), 1600);
    } catch {
      /* No clipboard: an insecure origin, a denied permission, or a browser
         that does not implement it. Show the whole value so it can be selected
         manually rather than pretending the copy worked. */
      setState('revealed');
    }
  }

  if (state === 'revealed') {
    return (
      <span className="copy-revealed">
        <span className="mono copy-full">{value}</span>
        <span className="sm muted">Select and copy — your browser blocked the clipboard.</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`copy${state === 'copied' ? ' copy-done' : ''}`}
      onClick={() => void copy()}
      /* The visible label is a truncated address, which tells a screen-reader
         user nothing about what the button does or which address it holds. */
      aria-label={`Copy ${label}: ${value}`}
      title={value}
    >
      {/* A truncated address must never wrap — it is already as short as it
          gets, and breaking "0x0217…3ab3" across two lines reads as damage.
          Where the full value is shown instead (a tx hash, a destination) it
          has to wrap, or it overflows the card. */}
      <span className={`mono copy-text${short === value ? ' copy-text-wrap' : ''}`}>
        {short}
      </span>
      <span className="copy-icon" aria-hidden="true">
        {state === 'copied' ? <IconCheck /> : <IconCopy />}
      </span>
      {/* Announced rather than only shown, because the icon swap is invisible
          to anyone not watching that corner of the screen. */}
      <span className="sr-only" aria-live="polite">
        {state === 'copied' ? `${label} copied` : ''}
      </span>
    </button>
  );
}

const IconCopy = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 8.5l3.5 3.5L13 5" />
  </svg>
);
