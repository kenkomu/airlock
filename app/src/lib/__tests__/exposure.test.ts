/* The verdict, which is the one judgement this app makes about someone's safety.
 *
 * `assess` decides whether a transfer reads as Sealed or Linkable. It is the
 * most consequential function in the project and it had no tests: the ladder,
 * the action array and the pool scan were all covered, and the thing that
 * actually tells a person "you are private" was not.
 *
 * The failures here are asymmetric, and the tests are weighted to match.
 * Reporting Linkable when a transfer was fine costs someone six hours of
 * waiting. Reporting Sealed when it leaks costs them the thing they came for,
 * and they will not find out. So most of what follows checks the second
 * direction: that nothing reaches "sealed" while any part of it leaks.
 */

import { describe, expect, it } from 'vitest';
import { planBuckets } from '../buckets';
import { REST_PRESETS, assess } from '../exposure';

const SAFE_REST = 60 * 6;
const BIG_CROWD = 500;

/* A plan that is clean on its own, so a test about timing or crowd is only
   about timing or crowd. */
const cleanPlan = () => planBuckets(500);

describe('assess — the overall verdict', () => {
  it('takes the worst factor, never the average', () => {
    /* The panel's own footnote says privacy does not average. If this ever
       became a mean, a transfer with one fatal flaw and two clean factors would
       come out looking fine. */
    const r = assess({
      plan: cleanPlan(),
      bucketing: true,
      restMinutes: SAFE_REST,
      deposits: 3, // blocked
    });
    expect(r.overall).toBe('blocked');
    expect(r.factors.filter((f) => f.level === 'sealed').length).toBeGreaterThan(0);
  });

  it('is sealed only when every single factor is sealed', () => {
    const r = assess({
      plan: cleanPlan(),
      bucketing: true,
      restMinutes: SAFE_REST,
      deposits: BIG_CROWD,
    });
    expect(r.overall).toBe('sealed');
    expect(r.factors.every((f) => f.level === 'sealed')).toBe(true);
  });

  it('never says sealed while any factor leaks', () => {
    /* Swept rather than spot-checked, because this is the direction that hurts
       someone. Every combination of the inputs the UI can produce. */
    const amounts = [0.5, 1, 500, 847.32, 1000];
    const rests = REST_PRESETS.map((p) => p.minutes);
    const crowds = [null, 0, 49, 50, 134, 499, 500, 5000];
    let checked = 0;
    for (const a of amounts)
      for (const bucketing of [true, false])
        for (const rest of rests)
          for (const deposits of crowds) {
            const r = assess({ plan: planBuckets(a), bucketing, restMinutes: rest, deposits });
            checked += 1;
            if (r.overall === 'sealed') {
              expect(
                r.factors.every((f) => f.level === 'sealed'),
                `sealed verdict with a non-sealed factor: amount=${a} bucketing=${bucketing} rest=${rest} crowd=${deposits}`,
              ).toBe(true);
            }
          }
    expect(checked).toBe(amounts.length * 2 * rests.length * crowds.length);
  });

  it('always reports all three factors, in a stable order', () => {
    /* A factor that silently disappears reads as one that passed. */
    const r = assess({ plan: cleanPlan(), bucketing: true, restMinutes: 0, deposits: null });
    expect(r.factors.map((f) => f.key)).toEqual(['amount', 'timing', 'crowd']);
  });
});

describe('amount', () => {
  it('leaks when bucketing is off, however clean the plan', () => {
    /* The exact figure leaves in one leg and is published on both chains. */
    const r = assess({
      plan: cleanPlan(),
      bucketing: false,
      restMinutes: SAFE_REST,
      deposits: BIG_CROWD,
    });
    expect(r.factors[0].level).toBe('leak');
    expect(r.overall).toBe('leak');
  });

  it('blocks an amount below the smallest denomination', () => {
    const r = assess({
      plan: planBuckets(0.5),
      bucketing: true,
      restMinutes: SAFE_REST,
      deposits: BIG_CROWD,
    });
    expect(r.factors[0].level).toBe('blocked');
  });
});

describe('timing', () => {
  it('leaks on an immediate round trip', () => {
    /* The protocol's own threat model names this. */
    const r = assess({
      plan: cleanPlan(),
      bucketing: true,
      restMinutes: 0,
      deposits: BIG_CROWD,
    });
    expect(r.factors[1].level).toBe('leak');
  });

  it('is monotonic — more rest is never worse', () => {
    const rank = { sealed: 0, leak: 1, blocked: 2 } as const;
    const levels = REST_PRESETS.map(
      (p) =>
        rank[
          assess({ plan: cleanPlan(), bucketing: true, restMinutes: p.minutes, deposits: BIG_CROWD })
            .factors[1].level
        ],
    );
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i], `${REST_PRESETS[i].label} rated worse than ${REST_PRESETS[i - 1].label}`)
        .toBeLessThanOrEqual(levels[i - 1]);
    }
  });
});

describe('crowd', () => {
  it('does not call an unread pool safe', () => {
    /* null is "we have not looked yet", and the reassuring direction is the
       wrong one to guess in. */
    const r = assess({
      plan: cleanPlan(),
      bucketing: true,
      restMinutes: SAFE_REST,
      deposits: null,
    });
    expect(r.factors[2].level).not.toBe('sealed');
    expect(r.overall).not.toBe('sealed');
  });

  it('is monotonic — a bigger crowd is never worse', () => {
    const rank = { sealed: 0, leak: 1, blocked: 2 } as const;
    const sizes = [0, 1, 49, 50, 134, 499, 500, 1000, 50_000];
    const levels = sizes.map(
      (d) =>
        rank[
          assess({ plan: cleanPlan(), bucketing: true, restMinutes: SAFE_REST, deposits: d })
            .factors[2].level
        ],
    );
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i], `${sizes[i]} deposits rated worse than ${sizes[i - 1]}`)
        .toBeLessThanOrEqual(levels[i - 1]);
    }
  });

  it('rates the pool as it stands today as thin, not safe', () => {
    /* ~134 recent deposits at the time of writing. This is the number on the
       live page, and it must not read as sealed — the whole reason the
       anonymizer exists is that this pool is small. */
    const r = assess({
      plan: cleanPlan(),
      bucketing: true,
      restMinutes: SAFE_REST,
      deposits: 134,
    });
    expect(r.factors[2].level).toBe('leak');
    expect(r.factors[2].detail).toContain('134');
  });
});

describe('what the user is told', () => {
  it('gives a fix for anything they can actually change', () => {
    /* Amount and timing are settings. A verdict without a remedy is a dead end. */
    const r = assess({ plan: cleanPlan(), bucketing: false, restMinutes: 0, deposits: BIG_CROWD });
    expect(r.factors[0].fix).toBeTruthy();
    expect(r.factors[1].fix).toBeTruthy();
  });

  it('says outright when a factor is not theirs to fix', () => {
    /* Crowd size is the pool, not a setting. Offering a "fix" would be a lie;
       saying nothing would read as an oversight. */
    const r = assess({ plan: cleanPlan(), bucketing: true, restMinutes: SAFE_REST, deposits: 134 });
    expect(r.factors[2].fix).toMatch(/nothing you can change/i);
  });

  it('never offers a fix on a factor that is already sealed', () => {
    const r = assess({
      plan: cleanPlan(),
      bucketing: true,
      restMinutes: SAFE_REST,
      deposits: BIG_CROWD,
    });
    for (const f of r.factors) expect(f.fix).toBeUndefined();
  });

  it('writes a sentence for every factor, in every state', () => {
    for (const deposits of [null, 0, 134, 5000])
      for (const rest of REST_PRESETS.map((p) => p.minutes))
        for (const bucketing of [true, false]) {
          const r = assess({ plan: planBuckets(847.32), bucketing, restMinutes: rest, deposits });
          for (const f of r.factors) {
            expect(f.detail.length, `${f.key} has no detail`).toBeGreaterThan(20);
            expect(f.label.length).toBeGreaterThan(0);
          }
        }
  });
});
