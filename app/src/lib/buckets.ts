/* Denomination bucketing.
 *
 * StarkWare's own threat model logs amount correlation as an accepted P0 with
 * "mitigation deferred", and names the fix: fixed denominations plus
 * change-as-note. Nothing implements it. This does.
 *
 * The problem it solves: a withdrawal of 847.32 USDC is a 1:1 fingerprint
 * against the deposit of 847.32 USDC, no matter how good the proofs are. Worse,
 * sizing a withdrawal from an account's real post-fee balance produces a
 * fee-shaped residue that is *more* distinctive, not less.
 *
 * The fix: withdraw only in standard denominations, and leave the remainder
 * inside the pool as a note. Every leg then looks like every other leg of that
 * denomination, and the anonymity set for a leg is "everyone who ever moved
 * this denomination" rather than "nobody, because nobody else moved 847.32".
 */

/* Standard denominations, largest first. Powers of ten with a 5 and a 2.5 step
   is the same ladder physical cash uses, for the same reason: few enough
   distinct values that each one is crowded, fine enough that the retained
   change stays small. */
export const LADDER = [1000, 500, 250, 100, 50, 25, 10, 5, 1] as const;

export type Exposure = 'sealed' | 'leak';

export interface BucketPlan {
  /* One withdrawal leg per entry, each a standard denomination. */
  legs: number[];
  /* Retained inside the pool as a note. Never crosses a chain, so it cannot be
     correlated — it is the price of making the legs uniform. */
  change: number;
  /* What the user asked for. */
  requested: number;
  /* Sum of legs — what actually leaves. */
  moved: number;
  exposure: Exposure;
  /* Plain-language reason, shown to the user rather than kept internal. */
  reason: string;
}

/* Greedy decomposition. Greedy is optimal on this ladder (each denomination
   divides every larger one, or is reachable by the 25/50 pair), so there is no
   need for a DP here — and a simpler algorithm is one fewer thing to get wrong
   in a privacy path. */
export function planBuckets(requested: number): BucketPlan {
  if (!Number.isFinite(requested) || requested <= 0) {
    return {
      legs: [],
      change: 0,
      requested: 0,
      moved: 0,
      exposure: 'sealed',
      reason: 'Enter an amount to see how it will be split.',
    };
  }

  const legs: number[] = [];
  let remaining = Math.floor(requested * 100) / 100;

  for (const denom of LADDER) {
    while (remaining + 1e-9 >= denom) {
      legs.push(denom);
      remaining = Math.round((remaining - denom) * 100) / 100;
    }
  }

  const moved = legs.reduce((sum, n) => sum + n, 0);
  const change = Math.round((requested - moved) * 100) / 100;

  if (legs.length === 0) {
    return {
      legs,
      change,
      requested,
      moved,
      exposure: 'leak',
      reason: `Below the smallest denomination (${LADDER[LADDER.length - 1]}). Any amount this size is distinctive on its own — either raise it or accept that this leg is traceable.`,
    };
  }

  /* A plan is only as private as its rarest leg. One 1000 among many 1000s is
     fine; a lone leg of an unusual size is not, which is why the count of
     distinct denominations matters more than the number of legs. */
  const distinct = new Set(legs).size;

  const reason =
    change > 0
      ? `${moved} leaves in ${legs.length} standard leg${legs.length === 1 ? '' : 's'}; ${change} stays in the pool as a note. Each leg matches others of the same size, so no leg carries your amount.`
      : `${moved} leaves in ${legs.length} standard leg${legs.length === 1 ? '' : 's'}, exactly. Nothing retained.`;

  return {
    legs,
    change,
    requested,
    moved,
    exposure: distinct <= 3 ? 'sealed' : 'leak',
    reason:
      distinct <= 3
        ? reason
        : `${reason} But this splits across ${distinct} different denominations — that combination is itself a pattern. Round to a simpler amount.`,
  };
}

/* What an unbucketed transfer would expose, for the comparison the user should
   see before choosing. Deliberately blunt: the honest answer is usually bad. */
export function exactAmountRisk(requested: number): string {
  if (!Number.isFinite(requested) || requested <= 0) return '';
  const isRound = LADDER.includes(requested as (typeof LADDER)[number]);
  return isRound
    ? `${requested} is already a standard denomination, so sending it whole is as private as bucketing it.`
    : `Sending ${requested} whole publishes that exact figure on both chains. Amounts are public on every deposit and withdrawal, so a matching pair is a 1:1 link regardless of proofs.`;
}
