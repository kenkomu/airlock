/* The local record of your splits.
 *
 * Two failure modes worth pinning. Showing someone else's history — or your own
 * from another chain — because addresses were compared as text. And throwing
 * when storage is unavailable, which is not exotic: private windows, cleared
 * site data, and browsers set to block storage all raise here rather than
 * returning null.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ago, recordSplit, splitsFor } from '../history';

const PADDED = '0x03be37412bf36c7d4f585b96e50130c171753fe45d616572480c9f3f424199a4';
const BARE = '0x3be37412bf36c7d4f585b96e50130c171753fe45d616572480c9f3f424199a4';
const MAIN = '0x534e5f4d41494e';
const SEPOLIA = '0x534e5f5345504f4c4941';

const split = (over: Partial<Parameters<typeof recordSplit>[0]> = {}) => ({
  hash: '0xabc',
  address: PADDED,
  chainId: MAIN,
  token: '0x04718f5a',
  symbol: 'STRK',
  decimals: 18,
  amount: '8400000000000000000',
  legs: ['5000000000000000000', '2500000000000000000'],
  ...over,
});

function useMemoryStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

beforeEach(() => useMemoryStorage());
afterEach(() => vi.unstubAllGlobals());

describe('split history', () => {
  it('keeps a split and reads it back', () => {
    recordSplit(split());
    const got = splitsFor(PADDED, MAIN);
    expect(got).toHaveLength(1);
    expect(got[0].hash).toBe('0xabc');
    expect(got[0].at).toBeTypeOf('number');
  });

  it('matches the address as a felt, not as text', () => {
    /* The same account is written with and without leading zeros by different
       wallets. Comparing the strings shows an empty history to the person who
       made every entry in it. */
    recordSplit(split({ address: PADDED }));
    expect(splitsFor(BARE, MAIN)).toHaveLength(1);
    recordSplit(split({ hash: '0xdef', address: BARE }));
    expect(splitsFor(PADDED, MAIN)).toHaveLength(2);
  });

  it('does not leak another account or another chain into your list', () => {
    recordSplit(split({ hash: '0x1' }));
    recordSplit(split({ hash: '0x2', address: '0xdead' }));
    recordSplit(split({ hash: '0x3', chainId: SEPOLIA }));
    expect(splitsFor(PADDED, MAIN).map((s) => s.hash)).toEqual(['0x1']);
  });

  it('does not double a split that is recorded twice', () => {
    /* `submitted` and `done` both carry the same hash, and a retry after an
       unreadable confirmation would record it again. */
    recordSplit(split());
    recordSplit(split());
    expect(splitsFor(PADDED, MAIN)).toHaveLength(1);
  });

  it('puts the newest first', () => {
    recordSplit(split({ hash: '0x1' }));
    recordSplit(split({ hash: '0x2' }));
    expect(splitsFor(PADDED, MAIN).map((s) => s.hash)).toEqual(['0x2', '0x1']);
  });

  it('survives storage that throws, rather than taking the page with it', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    expect(() => recordSplit(split())).not.toThrow();
    expect(splitsFor(PADDED, MAIN)).toEqual([]);
  });

  it('survives garbage in storage', () => {
    localStorage.setItem('airlock.splits.v1', '{not json');
    expect(splitsFor(PADDED, MAIN)).toEqual([]);
    localStorage.setItem('airlock.splits.v1', '{"not":"an array"}');
    expect(splitsFor(PADDED, MAIN)).toEqual([]);
  });

  it('returns nothing for an address that is not a felt', () => {
    recordSplit(split());
    expect(splitsFor('not-an-address', MAIN)).toEqual([]);
  });

  it('caps the list so storage cannot grow without bound', () => {
    for (let i = 0; i < 40; i++) recordSplit(split({ hash: `0x${i}` }));
    expect(splitsFor(PADDED, MAIN).length).toBeLessThanOrEqual(25);
  });
});

describe('ago', () => {
  it('reads as time, not as a timestamp', () => {
    expect(ago(Date.now())).toBe('just now');
    expect(ago(Date.now() - 5 * 60_000)).toBe('5m ago');
    expect(ago(Date.now() - 3 * 3_600_000)).toBe('3h ago');
    expect(ago(Date.now() - 2 * 86_400_000)).toBe('2d ago');
  });

  it('does not render a future timestamp as negative', () => {
    /* Clock skew between a wallet and the browser is real. */
    expect(ago(Date.now() + 60_000)).toBe('just now');
  });
});
