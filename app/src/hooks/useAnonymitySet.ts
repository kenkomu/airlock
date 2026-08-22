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
    scanAnonymitySet({ windowBlocks })
      .then((snap) => {
        if (!live) return;
        setState({ phase: 'ready', snap, crowd: null });
        /* Fire and forget. A crowd row that never loads costs nothing; a blank
           panel while it loads costs everything. */
        scanConcentration(snap.depositTxs, { signal })
          .then((crowd) => {
            if (live && crowd) setState({ phase: 'ready', snap, crowd });
          })
          .catch(() => {
            /* Leaves `crowd` null, which renders as absent rather than wrong. */
          });
      })
      .catch((e: unknown) => {
        if (live)
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
