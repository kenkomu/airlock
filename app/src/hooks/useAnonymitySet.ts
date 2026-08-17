/* One pool scan, shared.
 *
 * Both the anonymity panel and the privacy report's crowd factor need this
 * number. Fetching it twice would double the RPC load and — worse — could show
 * two different figures on one screen, which is exactly the kind of small
 * inconsistency that makes a privacy claim unbelievable.
 */

import { useEffect, useState } from 'react';
import { scanAnonymitySet, type AnonymitySnapshot } from '../lib/pool';

export type AnonymityState =
  | { phase: 'loading' }
  | { phase: 'ready'; snap: AnonymitySnapshot }
  | { phase: 'error'; message: string };

export function useAnonymitySet(windowBlocks = 200_000): AnonymityState {
  const [state, setState] = useState<AnonymityState>({ phase: 'loading' });

  useEffect(() => {
    let live = true;
    scanAnonymitySet({ windowBlocks })
      .then((snap) => {
        if (live) setState({ phase: 'ready', snap });
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
    };
  }, [windowBlocks]);

  return state;
}
