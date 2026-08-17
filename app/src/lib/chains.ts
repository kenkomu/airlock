/* Supported EVM chains.
 *
 * These are the CCTP domains bridge-core actually carries, not an aspirational
 * list — a chain shown in a picker that the bridge cannot reach is a bug that
 * only surfaces after the user has committed funds.
 */

export interface Chain {
  id: number;
  name: string;
  short: string;
  /* Circle CCTP domain. */
  domain: number;
  /* Rough one-way settle time, for setting expectations rather than promising. */
  minutes: [number, number];
}

export const CHAINS: Chain[] = [
  { id: 137, name: 'Polygon', short: 'POL', domain: 7, minutes: [2, 4] },
  { id: 42161, name: 'Arbitrum', short: 'ARB', domain: 3, minutes: [2, 4] },
  { id: 8453, name: 'Base', short: 'BASE', domain: 6, minutes: [2, 4] },
  { id: 10, name: 'Optimism', short: 'OP', domain: 2, minutes: [2, 4] },
  { id: 1, name: 'Ethereum', short: 'ETH', domain: 0, minutes: [4, 8] },
];

export const STARKNET_DOMAIN = 25;

export const byId = (id: number): Chain =>
  CHAINS.find((c) => c.id === id) ?? CHAINS[0];

/* Two legs, each settling independently, plus the rest period between them.
   Stated as a range because Circle's attestation time is not ours to promise. */
export function roundTripEstimate(from: Chain, to: Chain): [number, number] {
  return [from.minutes[0] + to.minutes[0], from.minutes[1] + to.minutes[1]];
}
