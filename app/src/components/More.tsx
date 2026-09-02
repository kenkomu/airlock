/* A short line, with the rest of the truth one click away.
 *
 * This app explains itself more than most, on purpose — naming what leaks is
 * the product. But every explanation was on screen at once, at the same
 * weight, so the split panel opened with roughly two hundred words of prose
 * around a single number. Tested on someone who had not seen it before, the
 * response was that it did not look usable.
 *
 * Cutting the text would have cost the thing that makes the app worth having.
 * So none of it is deleted: the claim stays visible and the reasoning moves
 * behind a disclosure. Anyone who wants the detail is one click from it, and
 * `<details>` is open to find-in-page and to screen readers either way.
 */

import type { ReactNode } from 'react';

export function More({ label = 'Why?', children }: { label?: string; children: ReactNode }) {
  return (
    <details className="more">
      <summary className="more-s">{label}</summary>
      <div className="more-b">{children}</div>
    </details>
  );
}
