/* Parity between the TypeScript planner and the Cairo contract.
 *
 * This is not a nice-to-have. The pool asserts that every open note created in a
 * transaction gets filled, so if the interface plans n legs while
 * `AirlockBucketer` decomposes into m != n, the transaction reverts — every
 * time, for everyone. The two implementations are a distributed system with a
 * shared invariant, and this file is the invariant.
 *
 * FIXTURES must stay identical to `fixtures()` in
 * `src/tests/ladder_tests.cairo`. Changing one without the other fails here or
 * there, which is the entire point.
 */

import { describe, expect, it } from 'vitest';
import { LADDER, planBuckets } from '../buckets';

/** (whole tokens, expected leg count) — mirrored from the Cairo suite. */
const FIXTURES: [number, number][] = [
  [1, 1],
  [5, 1],
  [10, 1],
  [1000, 1],
  [2000, 2],
  [15, 2],
  [35, 2],
  [75, 2],
  [999, 11],
  [847, 8],
  [1250, 2],
  [3, 3],
];

/* The contract's cap. An amount needing more legs than this is refused on
   chain, so the interface must refuse it too rather than offering a plan that
   cannot execute. */
const MAX_LEGS = 24;

describe('shared fixture table', () => {
  it.each(FIXTURES)('%i whole tokens decomposes into %i legs', (whole, legs) => {
    expect(planBuckets(whole).legs.length).toBe(legs);
  });

  it('every fixture sums back to its amount with nothing retained', () => {
    for (const [whole] of FIXTURES) {
      const plan = planBuckets(whole);
      expect(plan.moved).toBe(whole);
      expect(plan.change).toBe(0);
    }
  });
});

describe('ladder properties', () => {
  it('is descending, which is what makes the greedy walk optimal', () => {
    const sorted = [...LADDER].sort((a, b) => b - a);
    expect([...LADDER]).toEqual(sorted);
  });

  it('every leg is a real denomination', () => {
    for (let whole = 1; whole <= 400; whole += 1) {
      for (const leg of planBuckets(whole).legs) {
        expect(LADDER).toContain(leg as (typeof LADDER)[number]);
      }
    }
  });

  it('never loses value', () => {
    for (let whole = 1; whole <= 400; whole += 1) {
      const plan = planBuckets(whole);
      const total = plan.legs.reduce((sum, n) => sum + n, 0);
      expect(total + plan.change).toBeCloseTo(whole, 6);
    }
  });

  it('produces the fewest legs the ladder allows', () => {
    // 100 as one note, never four 25s. Fewer legs is cheaper and less
    // distinctive, and greedy is optimal on this ladder.
    expect(planBuckets(100).legs).toEqual([100]);
    expect(planBuckets(1250).legs).toEqual([1000, 250]);
  });

  it('keeps equal denominations adjacent so the UI can group them', () => {
    const legs = planBuckets(999).legs;
    const seen = new Set<number>();
    let previous: number | null = null;
    for (const leg of legs) {
      if (leg !== previous) {
        expect(seen.has(leg)).toBe(false);
        seen.add(leg);
        previous = leg;
      }
    }
  });
});

describe('the boundary the contract enforces', () => {
  it('24,000 sits exactly on the leg cap', () => {
    expect(planBuckets(24_000).legs.length).toBe(MAX_LEGS);
  });

  it('25,000 exceeds it, so the interface must not offer that plan', () => {
    // The contract reverts with TOO_MANY_LEGS. Until the planner refuses it
    // too, this documents the gap rather than hiding it.
    expect(planBuckets(25_000).legs.length).toBeGreaterThan(MAX_LEGS);
  });
});

describe('fractional amounts', () => {
  it('retains the remainder rather than moving a figure the contract rejects', () => {
    // 847.32 is not an exact sum of denominations. The contract fails closed on
    // it, so the planner must move 847 and leave 0.32 in the pool.
    const plan = planBuckets(847.32);
    expect(plan.moved).toBe(847);
    expect(plan.change).toBeCloseTo(0.32, 6);
    expect(plan.legs.length).toBe(8);
  });
});
