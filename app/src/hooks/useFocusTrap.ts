/* Keep keyboard focus inside a dialog, so `aria-modal="true"` is true.
 *
 * Both dialogs in this app declared themselves modal and neither behaved that
 * way: three tabs walked straight out of the wallet picker and into the amount
 * field behind it. That is worse than having no attribute at all — a screen
 * reader announces the rest of the page as inert on the strength of that
 * assertion, while the keyboard is demonstrably still in it.
 *
 * Also restores focus to whatever opened the dialog. Without that, dismissing
 * one drops the caret back at the top of the document, and a keyboard user has
 * to tab all the way down to where they were.
 */

import { useEffect, type RefObject } from 'react';

/* Tab order, minus the things that are in the DOM but not reachable. `disabled`
   is excluded by the selector; `inert` and hidden subtrees are caught by the
   offsetParent check below, which is cheaper than walking ancestors. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    const opener = document.activeElement as HTMLElement | null;

    const reachable = () =>
      [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    /* Move focus in, if it is not already. A dialog that opens without focus
       leaves the first Tab going to the page behind it. */
    if (!root.contains(document.activeElement)) {
      (reachable()[0] ?? root).focus?.();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = reachable();
      if (items.length === 0) {
        /* Nothing to focus, but Tab must still not escape. */
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const on = document.activeElement;

      /* Wrap at both ends, and pull focus back in if it has somehow got out —
         a click on the backdrop can leave `document.body` active. */
      if (!root.contains(on)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && on === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && on === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      /* Only take focus back if the dialog still had it. Something else may
         have deliberately moved it — a toast, or a newly revealed field. */
      if (root.contains(document.activeElement) || document.activeElement === document.body) {
        opener?.focus?.();
      }
    };
  }, [ref, active]);
}
