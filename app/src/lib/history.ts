/* The splits this browser has made, so a submitted transaction does not vanish.
 *
 * Once you leave the panel, the hash is gone: it lived only in the stage
 * machine's state. That is a poor way to treat the receipt for something that
 * moved real money — you cannot check it later, and after a reload there is no
 * evidence anything happened at all.
 *
 * Deliberately local, and deliberately thin. This is a privacy tool: a history
 * of your splits is exactly the record an observer would like to have, so it
 * never leaves the browser, is scoped per address and per chain, and stores the
 * hash and the leg sizes rather than anything about who or where. Clearing site
 * data removes it, which is the correct amount of durability for this.
 */

const KEY = 'airlock.splits.v1';
const MAX = 25;

export interface Split {
  hash: string;
  /* Which account and chain made it, so switching either does not show you
     somebody else's history — or your own from a different network. */
  address: string;
  chainId: string;
  token: string;
  symbol: string;
  decimals: number;
  /* Base units, as decimal strings: JSON has no bigint. */
  amount: string;
  legs: string[];
  at: number;
}

function readAll(): Split[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Split[]) : [];
  } catch {
    /* Private windows, cleared storage, and browsers set to block site data all
       throw here rather than returning null. An unreadable history is an empty
       one, never an error the user has to see. */
    return [];
  }
}

export function recordSplit(s: Omit<Split, 'at'>): void {
  try {
    /* De-duplicate on hash: `submitted` and `done` both fire for one split, and
       a retry after a failed confirmation read would otherwise double it. */
    const kept = readAll().filter((p) => p.hash !== s.hash);
    localStorage.setItem(KEY, JSON.stringify([{ ...s, at: Date.now() }, ...kept].slice(0, MAX)));
  } catch {
    /* Losing the history is not worth failing a transaction over. */
  }
}

export function splitsFor(address: string, chainId: string): Split[] {
  let want: bigint;
  try {
    want = BigInt(address);
  } catch {
    return [];
  }
  return readAll().filter((s) => {
    try {
      /* Felt comparison, not string: the same address is written with and
         without leading zeros by different wallets. */
      return BigInt(s.address) === want && s.chainId === chainId;
    } catch {
      return false;
    }
  });
}

/* "3 minutes ago" beats a timestamp for something that just happened, which is
   the common case for this list. */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
