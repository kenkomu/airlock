/* Combined exposure assessment.
 *
 * Three things independently break unlinkability, and a tool that reports only
 * one of them is lying by omission:
 *
 *   amount   — a distinctive figure is a 1:1 join key across both chains
 *   timing   — deposit and withdraw close together correlate even with
 *              indistinguishable amounts
 *   crowd    — you can only hide among people who moved the same token in the
 *              same window; a thin pool defeats both mitigations above
 *
 * The report is deliberately per-factor rather than a single score. A score
 * invites the user to feel good about a number; a list tells them which knob to
 * turn, and lets a factor we cannot fix (crowd size) stay visibly unfixed.
 */

import type { BucketPlan } from './buckets';

export type Level = 'sealed' | 'leak' | 'blocked';

export interface Factor {
  key: 'amount' | 'timing' | 'crowd';
  label: string;
  level: Level;
  /* One sentence, written for the person deciding — not a log line. */
  detail: string;
  /* What to do about it, when there is something. */
  fix?: string;
}

export interface ExposureReport {
  factors: Factor[];
  /* Worst factor wins. Privacy does not average. */
  overall: Level;
}

/* Rest period presets, in minutes. `0` means chain the legs immediately, which
   the protocol's own threat model calls out as a correlation risk. */
export const REST_PRESETS = [
  { minutes: 0, label: 'Immediately' },
  { minutes: 60, label: '1 hour' },
  { minutes: 60 * 6, label: '6 hours' },
  { minutes: 60 * 24, label: '1 day' },
] as const;

function amountFactor(plan: BucketPlan, bucketing: boolean): Factor {
  if (!bucketing) {
    return {
      key: 'amount',
      label: 'Amount',
      level: 'leak',
      detail:
        'The exact figure leaves in one leg and is published on both chains, making the two sides trivially matchable.',
      fix: 'Turn on standard denominations.',
    };
  }
  if (plan.legs.length === 0) {
    return {
      key: 'amount',
      label: 'Amount',
      level: 'blocked',
      detail: 'Below the smallest standard denomination, so it cannot be made unremarkable.',
      fix: 'Raise the amount to at least 1.',
    };
  }
  if (plan.exposure === 'leak') {
    return {
      key: 'amount',
      label: 'Amount',
      level: 'leak',
      detail: `Splits across ${new Set(plan.legs).size} different denominations — that combination is itself a pattern.`,
      fix: 'Round to a simpler amount.',
    };
  }
  return {
    key: 'amount',
    label: 'Amount',
    level: 'sealed',
    detail: `Leaves as ${plan.legs.length} standard leg${plan.legs.length === 1 ? '' : 's'}, each matching others of its size.`,
  };
}

function timingFactor(restMinutes: number): Factor {
  if (restMinutes === 0)
    return {
      key: 'timing',
      label: 'Timing',
      level: 'leak',
      detail:
        'Withdrawing straight after depositing correlates the two legs even when the amounts match everyone else.',
      fix: 'Let the funds rest for at least an hour.',
    };
  if (restMinutes < 60 * 6)
    return {
      key: 'timing',
      label: 'Timing',
      level: 'leak',
      detail:
        'An hour helps, but on a quiet pool your deposit may still be the only one in that window.',
      fix: 'Six hours or more is materially better.',
    };
  return {
    key: 'timing',
    label: 'Timing',
    level: 'sealed',
    detail: 'Long enough that other deposits should land between your two legs.',
  };
}

function crowdFactor(deposits: number | null): Factor {
  if (deposits === null)
    return {
      key: 'crowd',
      label: 'Crowd',
      level: 'leak',
      detail: 'Still reading the pool — treat the set as unknown until it loads.',
    };
  if (deposits >= 500)
    return {
      key: 'crowd',
      label: 'Crowd',
      level: 'sealed',
      detail: `${deposits.toLocaleString()} recent deposits to hide among.`,
    };
  if (deposits >= 50)
    return {
      key: 'crowd',
      label: 'Crowd',
      level: 'leak',
      detail: `Only ${deposits.toLocaleString()} recent deposits. Thin enough that an unusual amount or token still stands out.`,
      fix: 'Nothing you can change — this is the pool, not your settings.',
    };
  return {
    key: 'crowd',
    label: 'Crowd',
    level: 'blocked',
    detail: `${deposits.toLocaleString()} recent deposits is too few to hide in.`,
    fix: 'Wait for more pool activity before moving anything sensitive.',
  };
}

const RANK: Record<Level, number> = { sealed: 0, leak: 1, blocked: 2 };

export function assess(opts: {
  plan: BucketPlan;
  bucketing: boolean;
  restMinutes: number;
  deposits: number | null;
}): ExposureReport {
  const factors = [
    amountFactor(opts.plan, opts.bucketing),
    timingFactor(opts.restMinutes),
    crowdFactor(opts.deposits),
  ];
  const overall = factors.reduce<Level>(
    (worst, f) => (RANK[f.level] > RANK[worst] ? f.level : worst),
    'sealed',
  );
  return { factors, overall };
}
