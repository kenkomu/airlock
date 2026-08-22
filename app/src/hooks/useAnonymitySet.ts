/* One pool scan, shared.
 *
 * Both the anonymity panel and the privacy report's crowd factor need this
 * number. Fetching it twice would double the RPC load and — worse — could show
 * two different figures on one screen, which is exactly the kind of small
 * inconsistency that makes a privacy claim unbelievable.
 */

import { useEffect, useState } from 'react';
import {
  scanAnonymitySet,
  scanConcentration,
  type AnonymitySnapshot,
  type Concentration,
} from '../lib/pool';
import { SCAN_TTL_MS, read, write } from '../lib/cache';

export type AnonymityState =
  | { phase: 'loading' }
  /* `crowd` arrives after the snapshot, or never. It is one request per deposit,
     far too slow to gate the headline numbers on, so the panel shows those
     immediately and this fills in behind it. */
  | { phase: 'ready'; snap: AnonymitySnapshot; crowd: Concentration | null }
  | { phase: 'error'; message: string };

export function useAnonymitySet(windowBlocks = 200_000): AnonymityState {
  const [state, setState] = useState<AnonymityState>({ phase: 'loading' });

  useEffect(() => {
    let live = true;
    const signal = { aborted: false };

    /* Stale-while-revalidate. A cached answer is shown at once and a fresh scan
       runs behind it, so a second visit costs no wait — and, more to the point,
       no requests. The panel names its block range either way, so a few minutes
       of staleness is visible rather than hidden. */
    const key = `anon.${windowBlocks}`;
    const cached = read<{ snap: AnonymitySnapshot; crowd: Concentration | null }>(
      key,
      SCAN_TTL_MS,
    );
    if (cached) setState({ phase: 'ready', snap: cached.snap, crowd: cached.crowd });

    scanAnonymitySet({ windowBlocks })
      .then((snap) => {
        if (!live) return;
        setState({ phase: 'ready', snap, crowd: cached?.crowd ?? null });
        write(key, { snap, crowd: cached?.crowd ?? null });
        /* Fire and forget. A crowd row that never loads costs nothing; a blank
           panel while it loads costs everything. */
        scanConcentration(snap.depositTxs, { signal })
          .then((crowd) => {
            if (!live || !crowd) return;
            setState({ phase: 'ready', snap, crowd });
            write(key, { snap, crowd });
          })
          .catch(() => {
            /* Leaves `crowd` null, which renders as absent rather than wrong. */
          });
      })
      .catch((e: unknown) => {
        /* A failed refresh must not blank a good cached answer. Showing five
           minutes of staleness beats showing an error over data we have. */
        if (live && !cached)
          setState({
            phase: 'error',
            message: e instanceof Error ? e.message : String(e),
          });
      });
    return () => {
      live = false;
      signal.aborted = true;
    };
  }, [windowBlocks]);

  return state;
}
