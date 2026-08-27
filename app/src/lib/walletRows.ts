/* What the connect sheet lists, and what each row says about itself.
 *
 * Pulled out of the component because it is the logic that decides what the
 * user sees, and inside JSX it could only be tested by driving a browser with a
 * fake wallet-standard handshake — which does not reliably register, so the
 * mixed-list case went unverified. Here it is six lines and a test file.
 */

/* The minimum a row needs. Deliberately not the wallet types themselves: those
   come from two unrelated discovery standards, and the only fields this needs
   are the two both happen to have. */
export interface WalletLike {
  name: string;
  icon?: string;
}

export type WalletKind = 'starknet' | 'evm';

export interface WalletRow {
  /* Stable across renders, and unique across both sources — an EVM wallet and a
     Starknet wallet can share a name. */
  key: string;
  kind: WalletKind;
  /* Index into whichever source list this row came from, so the caller can find
     the original object to act on without this module knowing about either. */
  index: number;
  name: string;
  icon?: string;
  /* Empty when it would say nothing. See `tagsApply`. */
  tag: string;
}

/* Where a wallet's keys live — the entire privacy difference between the two
   doors, in three words. */
export const TAG_STARKNET = 'Keys stay in wallet';
export const TAG_EVM = 'Keys made in browser';

/* Tags are a distinction, so they are only worth printing when there is
   something to distinguish. Repeated down a list where every row says the same
   thing they stop being information and become three wasted words per row.
   Someone whose list is all one kind still learns where their keys come from at
   the confirm step, while their wallet's prompt is open. */
export function tagsApply(starknetCount: number, evmCount: number): boolean {
  return starknetCount > 0 && evmCount > 0;
}

/* Starknet wallets first, because they are the stronger option and ordering is
   the only thing left saying so once the section headings are gone. */
export function walletRows(
  starknet: readonly WalletLike[],
  evm: readonly WalletLike[],
): WalletRow[] {
  const tagged = tagsApply(starknet.length, evm.length);
  return [
    ...starknet.map((w, index) => ({
      key: `sn:${w.name}`,
      kind: 'starknet' as const,
      index,
      name: w.name,
      icon: w.icon,
      tag: tagged ? TAG_STARKNET : '',
    })),
    ...evm.map((w, index) => ({
      key: `evm:${w.name}`,
      kind: 'evm' as const,
      index,
      name: w.name,
      icon: w.icon,
      tag: tagged ? TAG_EVM : '',
    })),
  ];
}
