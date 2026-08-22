/* The network table, and one invariant it broke.
 *
 * The account panel read its public-balance token list off `bucketers`. Mainnet
 * has no bucketers yet, so the read was skipped and the empty state rendered —
 * telling an account holding 24 STRK in the open that it held nothing publicly.
 *
 * That is the worst direction for this project to be wrong in. Airlock's whole
 * claim is that it names what leaks; a false "you are not exposed" is not a
 * cosmetic bug, it is the tool lying in the reassuring direction.
 */

import { describe, expect, it } from 'vitest';
import { NETWORKS, SN_MAIN, bucketerFor, networkFor } from '../networks';

describe('the network table', () => {
  it('can read balances on every network, including ones with no bucketer', () => {
    /* The invariant. `tokens` must never be derived from, or gated on,
       `bucketers` — what someone holds is independent of what we can route. */
    for (const n of NETWORKS) {
      expect(n.tokens.length, `${n.name} has no readable tokens`).toBeGreaterThan(0);
    }
  });

  it('reads more tokens than it routes, so the two lists cannot be the same one', () => {
    /* Originally phrased as "mainnet, which has no bucketers deployed" — which
       stopped being true the moment one was, and failed for the right reason.
       The invariant was never about mainnet being empty; it is that `tokens` is
       not derived from `bucketers`. A network that reads strictly more tokens
       than it can route demonstrates that directly, and keeps demonstrating it
       as bucketers are added. */
    const main = NETWORKS.find((n) => n.chainId === SN_MAIN)!;
    expect(main).toBeDefined();
    expect(main.tokens.length).toBeGreaterThan(main.bucketers.length);
    expect(main.tokens.map((t) => t.symbol)).toContain('STRK');
  });

  it('lists every token a bucketer routes, so the two panels agree', () => {
    /* A token we can route but cannot name a balance for would show a split
       with no balance beside it. */
    for (const n of NETWORKS) {
      for (const b of n.bucketers) {
        const known = n.tokens.some((t) => BigInt(t.address) === BigInt(b.token));
        expect(known, `${n.name}: ${b.symbol} is routable but not readable`).toBe(true);
      }
    }
  });

  it('never has two tokens at the same address', () => {
    for (const n of NETWORKS) {
      const felts = n.tokens.map((t) => BigInt(t.address).toString());
      expect(new Set(felts).size, `${n.name} has duplicate tokens`).toBe(felts.length);
    }
  });

  it('matches addresses as felts, not strings', () => {
    /* The same address is written with and without leading zeros by different
       tools; comparing the text finds nothing. */
    const sepolia = NETWORKS.find((n) => n.bucketers.length > 0)!;
    const padded = sepolia.bucketers[0].token;
    const bare = '0x' + BigInt(padded).toString(16);
    expect(bucketerFor(sepolia, bare)).toBeDefined();
  });

  it('returns undefined for an unknown chain rather than defaulting to mainnet', () => {
    /* A wrong-network default is the failure that spends real money on a chain
       the user did not choose. */
    expect(networkFor('0xdeadbeef')).toBeUndefined();
  });
});
