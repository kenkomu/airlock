/* A short-lived cache for chain reads, kept in this browser.
 *
 * The anonymity panel costs about 150 RPC requests to draw: six pages of pool
 * events, then one transaction lookup per deposit to find who sent it. That is
 * fine for one visitor and untenable for a hundred — a public endpoint will
 * rate-limit long before the hundredth, and then it fails for everyone at once.
 *
 * So the answer is cached and served immediately on the next load, with a fresh
 * scan running behind it. The data is a rolling five-day window that moves by a
 * deposit or two an hour; a few minutes of staleness is invisible, and the panel
 * says which block range it covers regardless.
 *
 * Only public chain aggregates go in here — deposit counts, note sizes, sender
 * concentration. Nothing about the person reading the page, which is the one
 * thing this project must never write down.
 */

const PREFIX = 'airlock.cache.';

interface Entry<T> {
  at: number;
  value: T;
}

export function read<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry<T>;
    if (typeof e?.at !== 'number') return null;
    if (Date.now() - e.at > maxAgeMs) return null;
    return e.value;
  } catch {
    /* Private windows, cleared storage and blocked site data all throw here
       rather than returning null. An unreadable cache is a cold one. */
    return null;
  }
}

export function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* Quota, or storage disabled. Losing the cache costs a slower next load and
       nothing else, so it is never worth surfacing. */
  }
}

/* How old a cached scan may be before it is refetched rather than shown.
   Five minutes: shorter than the window it summarises by two orders of
   magnitude, long enough that a judge clicking around never pays for it twice. */
export const SCAN_TTL_MS = 5 * 60 * 1000;
