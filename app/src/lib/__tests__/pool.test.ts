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
  EV_VIEWING_KEY_SET,
  TOKENS,
  emptyTally,
  tallyEvents,
  type PoolEvent,
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
