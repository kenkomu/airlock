/* The anonymity tally, which is the one number this product must not overstate.
 *
 * Everything else in the app is a convenience. This panel is the claim: it tells
 * someone how big a crowd they are hiding in, and a user reads it to decide
 * whether to go ahead. A tally that quietly drops deposits reports a smaller
 * window than exists; one that drops a whole token reports no crowd at all for
 * the person using that token, which is precisely when they needed telling.
 */

import { describe, expect, it } from 'vitest';
import {
  EV_DEPOSIT,
  EV_OPEN_NOTE,
  EV_VIEWING_KEY_SET,
  TOKENS,
  crowdAt,
  emptyTally,
  tallyEvents,
  type PoolEvent,
  type SizeCount,
} from '../pool';

const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const WBTC = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
/* A real Starknet token that the pool could list tomorrow and this build would
   not recognise. That is the normal case, not an edge case. */
const UNLISTED = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const deposit = (token: string, tx = '0xtx'): PoolEvent => ({
  block_number: 1,
  transaction_hash: tx,
  keys: [EV_DEPOSIT, '0x5812098fb8d760b066b9b1cd48f367076d98e135fcf1173b86f1ff978f76123'],
  data: ['0x64', token],
});

describe('tallyEvents', () => {
  it('counts a deposit against its token', () => {
    const t = tallyEvents([deposit(STRK)], emptyTally());
    expect(t.deposits).toBe(1);
    expect(t.perToken.get('STRK')).toBe(1);
    expect(t.unidentified).toBe(0);
  });

  it('still counts a deposit whose token it cannot name', () => {
    /* The bug this replaces: the deposit incremented `deposits` but matched no
       token, so it vanished from the breakdown. The panel then showed rows
       summing to 86 under a headline of 95. */
    const t = tallyEvents([deposit(UNLISTED)], emptyTally());
    expect(t.deposits).toBe(1);
    expect(t.unidentified).toBe(1);
    expect([...t.perToken.keys()]).toEqual([]);
  });

  it('never loses a deposit: named plus unidentified equals the total', () => {
    /* The invariant the panel's arithmetic depends on. Whatever else changes,
       the rows have to add up to the headline. */
    const events = [
      deposit(STRK, '0x1'),
      deposit(WBTC, '0x2'),
      deposit(UNLISTED, '0x3'),
      deposit(STRK, '0x4'),
      deposit(UNLISTED, '0x5'),
    ];
    const t = tallyEvents(events, emptyTally());
    const named = [...t.perToken.values()].reduce((a, b) => a + b, 0);
    expect(named + t.unidentified).toBe(t.deposits);
    expect(t.deposits).toBe(5);
  });

  it('knows the two tokens found live in the mainnet pool', () => {
    /* SLAY and WBTC were both taking deposits before this list knew them, and
       were 9 of the last 95. Pinned so a future tidy-up of TOKENS cannot
       silently reintroduce the gap. */
    const symbols = Object.values(TOKENS).map((t) => t.symbol);
    expect(symbols).toContain('SLAY');
    expect(symbols).toContain('WBTC');
  });

  it('matches the token wherever it sits in the event', () => {
    /* Key/data packing differs by Cairo version, so the scan searches every
       field rather than trusting an index. */
    const inKeys: PoolEvent = { block_number: 1, transaction_hash: '0x1', keys: [EV_DEPOSIT, STRK], data: ['0x64'] };
    expect(tallyEvents([inKeys], emptyTally()).perToken.get('STRK')).toBe(1);
  });

  it('counts registrations separately and not as deposits', () => {
    const reg: PoolEvent = { block_number: 1, transaction_hash: '0x1', keys: [EV_VIEWING_KEY_SET], data: [] };
    const t = tallyEvents([reg], emptyTally());
    expect(t.registrations).toBe(1);
    expect(t.deposits).toBe(0);
  });

  it('counts a transaction once however many events it carries', () => {
    /* Pool transactions is a count of transactions, not of events. */
    const t = tallyEvents([deposit(STRK, '0xsame'), deposit(STRK, '0xsame')], emptyTally());
    expect(t.txs.size).toBe(1);
    expect(t.totalEvents).toBe(2);
  });

  it('accumulates across pages, since the scan folds one page at a time', () => {
    const acc = emptyTally();
    tallyEvents([deposit(STRK, '0x1')], acc);
    tallyEvents([deposit(UNLISTED, '0x2')], acc);
    expect(acc.deposits).toBe(2);
    expect(acc.perToken.get('STRK')).toBe(1);
    expect(acc.unidentified).toBe(1);
  });

  it('ignores an unparseable field rather than throwing', () => {
    const junk: PoolEvent = { block_number: 1, transaction_hash: '0x1', keys: [EV_DEPOSIT], data: ['not-a-felt', STRK] };
    expect(() => tallyEvents([junk], emptyTally())).not.toThrow();
    expect(tallyEvents([junk], emptyTally()).perToken.get('STRK')).toBe(1);
  });
});

/* ---------- the note-size histogram ----------
 *
 * This is the second claim the app makes, and the sharper one. "5 is a standard
 * denomination" is a statement about our ladder; "11 notes of 5 exist, from 3
 * addresses" is a statement about the pool, and only the second tells anyone
 * whether they are actually hiding. Both real layouts are pinned here against
 * the mainnet event stream they were read from.
 */

/* The layouts as they appear on mainnet, not as convenient fixtures.
   Deposit:           keys = [selector, user,      token]           data = [amount]
   OpenNoteDeposited: keys = [selector, depositor, token, note_id]  data = [amount] */
const realDeposit = (token: string, amount: string, who: string, tx = '0xtx'): PoolEvent => ({
  block_number: 1,
  transaction_hash: tx,
  keys: [EV_DEPOSIT, who, token],
  data: [amount],
});

const openNote = (token: string, amount: string, who: string, tx = '0xtx'): PoolEvent => ({
  block_number: 1,
  transaction_hash: tx,
  keys: [EV_OPEN_NOTE, who, token, '0xn0te'],
  data: [amount],
});

const ALICE = '0xa11ce';
const BOB = '0xb0b';
const FIVE = '0x4563918244f40000'; /* 5e18 — a real leg from tx 0x03f52e1b… */

describe('note sizes', () => {
  it('counts notes and the people behind them separately', () => {
    /* The whole reason this is not a plain count. Measured on mainnet, 5 STRK
       was 11 notes from 3 addresses: reporting 11 would tell someone they are
       hiding among four times as many people as exist. */
    const t = tallyEvents(
      [
        openNote(STRK, FIVE, ALICE, '0x1'),
        openNote(STRK, FIVE, ALICE, '0x2'),
        openNote(STRK, FIVE, BOB, '0x3'),
      ],
      emptyTally(),
    );
    const bucket = t.sizes.get(`STRK:${BigInt(FIVE)}`);
    expect(bucket?.notes).toBe(3);
    expect(bucket?.people.size).toBe(2);
  });

  it('counts deposits and open notes into the same histogram', () => {
    /* They are disjoint on chain — verified against tx 0x03f52e1b…, which emits
       seven OpenNoteDeposited and no Deposit — so both belong in the crowd for
       a size, and neither double-counts the other. */
    const t = tallyEvents(
      [realDeposit(STRK, FIVE, ALICE, '0x1'), openNote(STRK, FIVE, BOB, '0x2')],
      emptyTally(),
    );
    expect(t.sizes.get(`STRK:${BigInt(FIVE)}`)?.notes).toBe(2);
  });

  it('does not count an open note as a deposit', () => {
    /* An anonymizer creating notes is not new money entering the pool. Counting
       it as one would inflate the headline anonymity set — which is this app's
       central number, and the one it must never flatter. */
    const t = tallyEvents([openNote(STRK, FIVE, ALICE)], emptyTally());
    expect(t.deposits).toBe(0);
    expect(t.perToken.size).toBe(0);
  });

  it('records nothing rather than a guess when the layout is unfamiliar', () => {
    /* Two data fields means we cannot say which one is the amount. Publishing
       the wrong one would tell someone they are hiding among people who do not
       exist, so the histogram gives up instead. */
    const odd: PoolEvent = {
      block_number: 1,
      transaction_hash: '0x1',
      keys: [EV_DEPOSIT, ALICE, STRK],
      data: [FIVE, '0x0'],
    };
    const t = tallyEvents([odd], emptyTally());
    expect(t.sizes.size).toBe(0);
    /* But the deposit itself is still counted — the permissive token search is
       untouched, because undercounting the crowd is the worse failure there. */
    expect(t.deposits).toBe(1);
  });

  it('ignores a zero-amount note', () => {
    const t = tallyEvents([openNote(STRK, '0x0', ALICE)], emptyTally());
    expect(t.sizes.size).toBe(0);
  });

  it('keys sizes by token, so 5 USDC is not 5 STRK', () => {
    /* Same base-unit string, different tokens. Merging them would report a
       crowd made of people who moved a completely different asset. */
    const t = tallyEvents(
      [openNote(STRK, '0x64', ALICE), openNote(WBTC, '0x64', BOB)],
      emptyTally(),
    );
    expect(t.sizes.get('STRK:100')?.people.size).toBe(1);
    expect(t.sizes.get('WBTC:100')?.people.size).toBe(1);
  });
});

describe('crowdAt', () => {
  const sizes: SizeCount[] = [
    { symbol: 'STRK', amount: '5000000000000000000', notes: 11, people: 3 },
    { symbol: 'USDC', amount: '5000000', notes: 2, people: 2 },
  ];

  it('finds a size by token and exact base units', () => {
    expect(crowdAt(sizes, 'STRK', 5_000_000_000_000_000_000n).people).toBe(3);
  });

  it('answers zero for a size nobody has used, rather than nothing', () => {
    /* 250 STRK is on the ladder and had no notes at all in the mainnet window.
       "Not measured" and "measured as nobody" have to look different to the
       caller, so absence is a real answer here and null means "still
       scanning" upstream. */
    const alone = crowdAt(sizes, 'STRK', 250_000_000_000_000_000_000n);
    expect(alone.notes).toBe(0);
    expect(alone.people).toBe(0);
  });

  it('does not match across tokens', () => {
    expect(crowdAt(sizes, 'USDC', 5_000_000_000_000_000_000n).people).toBe(0);
  });
});
