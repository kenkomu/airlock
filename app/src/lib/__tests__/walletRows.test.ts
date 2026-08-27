/* The connect sheet's list, tested here because the browser could not.
 *
 * Driving this through a real page needs a fake Starknet wallet to complete the
 * wallet-standard handshake, which did not reliably register — so the mixed
 * case, the only one where the tags appear at all, was going to ship unverified.
 * The ordering and the tag rule are the two things a reader of the sheet acts
 * on, so they are pinned directly.
 */

import { describe, expect, it } from 'vitest';
import {
  TAG_EVM,
  TAG_STARKNET,
  tagsApply,
  walletRows,
} from '../walletRows';

const sn = [{ name: 'Ready Wallet', icon: 'a' }, { name: 'Braavos', icon: 'b' }];
const evm = [{ name: 'MetaMask', icon: 'c' }, { name: 'Keplr', icon: 'd' }];

describe('tagsApply', () => {
  it('tags a mixed list, where the difference is the point', () => {
    expect(tagsApply(2, 3)).toBe(true);
  });

  it('does not tag a list that is all one kind', () => {
    /* Three rows all reading "Keys made in browser" is not a distinction, it is
       decoration — and it was what the first attempt actually rendered. */
    expect(tagsApply(0, 3)).toBe(false);
    expect(tagsApply(2, 0)).toBe(false);
    expect(tagsApply(0, 0)).toBe(false);
  });
});

describe('walletRows', () => {
  it('puts Starknet wallets first', () => {
    /* Ordering is the only thing left saying which door is stronger, now that
       the section headings are gone. */
    expect(walletRows(sn, evm).map((r) => r.name)).toEqual([
      'Ready Wallet',
      'Braavos',
      'MetaMask',
      'Keplr',
    ]);
  });

  it('labels each kind correctly when the list is mixed', () => {
    const rows = walletRows(sn, evm);
    expect(rows.filter((r) => r.kind === 'starknet').map((r) => r.tag)).toEqual([
      TAG_STARKNET,
      TAG_STARKNET,
    ]);
    expect(rows.filter((r) => r.kind === 'evm').map((r) => r.tag)).toEqual([
      TAG_EVM,
      TAG_EVM,
    ]);
  });

  it('leaves the tag empty when every wallet is the same kind', () => {
    expect(walletRows([], evm).every((r) => r.tag === '')).toBe(true);
    expect(walletRows(sn, []).every((r) => r.tag === '')).toBe(true);
  });

  it('keeps keys unique when both kinds share a name', () => {
    /* Not hypothetical: MetaMask is announced by BOTH discovery paths, since
       Starknet discovery wraps EIP-1193 wallets as virtual Starknet wallets.
       Colliding keys would make React reuse the wrong row. */
    const rows = walletRows([{ name: 'MetaMask' }], [{ name: 'MetaMask' }]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });

  it('indexes each row back into the list it came from', () => {
    /* The caller uses this to find the wallet object to connect to. An index
       into the combined list would connect to the wrong wallet. */
    const rows = walletRows(sn, evm);
    expect(rows.map((r) => `${r.kind}:${r.index}`)).toEqual([
      'starknet:0',
      'starknet:1',
      'evm:0',
      'evm:1',
    ]);
  });

  it('survives having nothing to list', () => {
    expect(walletRows([], [])).toEqual([]);
  });
});
