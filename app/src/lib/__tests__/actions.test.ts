/* What these tests are actually for.
 *
 * The action array is the one artifact in this app that costs real money to get
 * wrong: a malformed sequence is discovered by the pool, after the user has paid
 * for proving, and reverts with an error naming a Cairo internal rather than
 * anything they did. So the ordering rules read out of `privacy.cairo` are
 * asserted here as structure, not left as comments.
 */

import { describe, expect, it } from 'vitest';
import {
  ActionBuildError,
  MAX_LEGS,
  buildDenominate,
  describeActions,
} from '../actions';
import type { Bucketer, Network } from '../networks';

const USDC = '0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343';

const BUCKETER: Bucketer = {
  address: '0x004c368ae058ee81b61884c5c47ee57484c4348669b66ac606366bbd1fd1b1fb',
  token: USDC,
  symbol: 'USDC',
  decimals: 6,
  unit: 1_000_000n,
};

const NET: Network = {
  chainId: '0x534e5f5345504f4c4941',
  name: 'Starknet Sepolia',
  rpcUrls: ['https://example.invalid'],
  pool: '0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91',
  bucketers: [BUCKETER],
  tokens: [{ address: USDC, symbol: 'USDC', decimals: 6 }],
  explorer: 'https://sepolia.voyager.online',
};

const OWNER = '0x05c66f610289cb55ec63ac953a3c3cc1f3812438ddef444f73f026c468a15802';

/* 847 USDC → 500 + 250 + 50 + 25 + 10 + 10 + 1 + 1, which is what the deployed
   contract returns for this input. Kept in base units, as the chain sees it. */
const M = 1_000_000n;
const AMOUNT = 847n * M;
const LEGS = [500n * M, 250n * M, 50n * M, 25n * M, 10n * M, 10n * M, 1n * M, 1n * M];

function build(over: Partial<Parameters<typeof buildDenominate>[0]> = {}) {
  return buildDenominate({
    network: NET,
    bucketer: BUCKETER,
    amount: AMOUNT,
    legs: LEGS,
    owner: OWNER,
    ...over,
  });
}

describe('action ordering', () => {
  it('withdraws before anything else, so the bucketer holds the funds it approves', () => {
    expect(build()[0].type).toBe('withdraw');
  });

  it('creates every open note before the invoke that fills them', () => {
    const actions = build();
    const lastOpen = actions.findLastIndex(
      (a) => a.type === 'transfer' && a.amount === 'OPEN',
    );
    const invoke = actions.findIndex((a) => a.type === 'invoke');
    /* An invoke before its notes underflows the pool's counter and reverts the
       whole transaction with TOO_MANY_OPEN_NOTES_DEPOSITED. */
    expect(invoke).toBeGreaterThan(lastOpen);
  });

  it('ends with exactly one invoke', () => {
    const actions = build();
    expect(actions.filter((a) => a.type === 'invoke')).toHaveLength(1);
    expect(actions.at(-1)?.type).toBe('invoke');
  });
});

describe('leg count and note count are one number', () => {
  it('creates exactly one open note per leg', () => {
    const opens = build().filter((a) => a.type === 'transfer' && a.amount === 'OPEN');
    /* The pool asserts undeposited_open_notes == 0 at the end of the
       transaction, so an extra note is a revert, not a spare. */
    expect(opens).toHaveLength(LEGS.length);
  });

  it('references every open note exactly once, in creation order', () => {
    const invoke = build().at(-1);
    if (invoke?.type !== 'invoke') throw new Error('expected an invoke');
    const placeholders = invoke.calldata.slice(2);
    expect(placeholders).toEqual(
      LEGS.map((_, i) => `\${openNoteIds[${i}]}`),
    );
  });

  it('declares the span length the contract will deserialise', () => {
    const invoke = build().at(-1);
    if (invoke?.type !== 'invoke') throw new Error('expected an invoke');
    /* privacy_invoke(amount, Span<felt252>) → [amount, len, ...ids] */
    expect(BigInt(invoke.calldata[1] as string)).toBe(BigInt(LEGS.length));
    expect(invoke.calldata).toHaveLength(2 + LEGS.length);
  });

  it('passes the same amount the withdraw moved', () => {
    const actions = build();
    const withdraw = actions[0];
    const invoke = actions.at(-1);
    if (withdraw.type !== 'withdraw' || invoke?.type !== 'invoke') throw new Error('shape');
    expect(BigInt(invoke.calldata[0] as string)).toBe(BigInt(withdraw.amount));
  });
});

describe('routing', () => {
  it('sends the withdrawal to the bucketer, not the user', () => {
    const w = build()[0];
    if (w.type !== 'withdraw') throw new Error('shape');
    expect(BigInt(w.recipient)).toBe(BigInt(BUCKETER.address));
  });

  it('gives the notes to the user, not the bucketer', () => {
    for (const a of build()) {
      if (a.type === 'transfer') expect(BigInt(a.recipient)).toBe(BigInt(OWNER));
    }
  });

  it('uses one token throughout', () => {
    for (const a of build()) {
      if (a.type === 'withdraw' || a.type === 'transfer') {
        expect(BigInt(a.token)).toBe(BigInt(USDC));
      }
    }
  });
});

describe('refusing to build something that cannot settle', () => {
  it('rejects legs that do not sum to the amount', () => {
    /* The contract asserts this too, but only after the user has paid to prove
       a transaction that was never going to work. */
    expect(() => build({ legs: [500n * M, 250n * M] })).toThrow(ActionBuildError);
    expect(() => build({ legs: [500n * M, 250n * M] })).toThrow(/sums to/);
  });

  it('rejects an empty plan rather than building a note-less transaction', () => {
    expect(() => build({ legs: [] })).toThrow(/not on the ladder/i);
  });

  it('rejects more legs than the contract will accept', () => {
    const many = Array.from({ length: MAX_LEGS + 1 }, () => M);
    expect(() => build({ amount: BigInt(MAX_LEGS + 1) * M, legs: many })).toThrow(
      /exceeds the contract's limit/,
    );
  });

  it('rejects a zero amount', () => {
    expect(() => build({ amount: 0n, legs: [] })).toThrow(/greater than zero/);
  });

  it('refuses a token with no anonymizer deployed for it', () => {
    /* Every token on mainnet is this case today. Failing here is the difference
       between a clear message and a revert inside the pool on a zero address. */
    expect(() => build({ bucketer: undefined })).toThrow(/no anonymizer/);
  });
});

describe('what the user is shown before signing', () => {
  it('describes every action, in order', () => {
    const lines = describeActions(build());
    expect(lines).toHaveLength(LEGS.length + 2);
    expect(lines[0]).toMatch(/^withdraw 847000000 to /);
    expect(lines[1]).toMatch(/^create an open note/);
    expect(lines.at(-1)).toMatch(/^invoke .* with 10 felts$/);
  });
});
