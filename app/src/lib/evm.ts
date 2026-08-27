/* Finding and talking to a wallet on the user's own chain.
 *
 * This is the discovery half of the any-chain door (`identity.ts` is the key
 * half). It is deliberately hand-rolled rather than taken from the vendored
 * bridge: that package's wallet layer is WalletConnect-only and pulls in a
 * dependency tree larger than the rest of the engine combined, and the person
 * this door exists for — someone on Arbitrum with MetaMask already installed —
 * needs none of it.
 *
 * EIP-6963 instead of `window.ethereum`, for the reason the standard was written:
 * `window.ethereum` is a single slot that multiple extensions fight over, so the
 * one you get is whichever loaded last, not the one the user meant. 6963 lets
 * every wallet announce itself and lets the user choose.
 *
 * The ordering trap here is the same one `wallet.ts` documents for Starknet
 * wallets, and it bites the same way: a wallet announces itself in response to
 * our request event, but an eager wallet may also announce *before* we ask. So
 * the listener is installed first and kept forever — never installed, request,
 * uninstall — or a wallet that announced early is invisible for the whole
 * session.
 */

import type { EthereumProvider } from '../../vendor/bridge-core/src/lib/ethereum';

/* What a wallet says about itself when it announces. `rdns` is the stable
   identity (reverse-DNS, e.g. `io.metamask`); `uuid` changes per page load, so
   it is useless for remembering a choice. */
export interface EvmWalletInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EvmWallet {
  info: EvmWalletInfo;
  provider: EthereumProvider;
}

interface AnnounceEvent extends Event {
  detail?: { info?: EvmWalletInfo; provider?: EthereumProvider };
}

/* Keyed by rdns rather than uuid, so a wallet that announces twice — which
   happens, both on request and spontaneously — appears once. */
const found = new Map<string, EvmWallet>();
const subscribers = new Set<(wallets: EvmWallet[]) => void>();
let listening = false;

function snapshot(): EvmWallet[] {
  /* Sorted by name so the picker does not reshuffle between renders as wallets
     announce in whatever order they happen to load. */
  return [...found.values()].sort((a, b) => a.info.name.localeCompare(b.info.name));
}

function onAnnounce(event: Event): void {
  const detail = (event as AnnounceEvent).detail;
  const info = detail?.info;
  const provider = detail?.provider;
  /* An announcement missing either half is not usable and not worth showing —
     a name with no provider is a wallet the user can click and nothing happens. */
  if (!info?.rdns || !info.name || !provider) return;
  const existing = found.get(info.rdns);
  if (existing && existing.provider === provider) return;
  found.set(info.rdns, { info, provider });
  for (const fn of subscribers) fn(snapshot());
}

/* Start listening, once per page. Safe to call repeatedly. */
function ensureListening(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('eip6963:announceProvider', onAnnounce);
}

/* Installed when this module is first imported, not when something first asks.
 *
 * Wallets announce spontaneously on page load as well as in response to our
 * request, and an announcement dispatched while nobody is listening is simply
 * gone — 6963 has no replay. Deferring the listener until the first
 * `subscribeEvmWallets` call would therefore lose exactly the eager wallets this
 * file set out to catch, and lose them invisibly: the picker renders empty and
 * looks like the user has no wallet installed.
 *
 * The cost of being early is one idle event listener on a page where nobody ever
 * opens the any-chain door. That is the right trade. */
ensureListening();

/* Subscribe to the set of discovered wallets.
 *
 * Returns an unsubscribe function. The request event is dispatched on every
 * subscribe rather than only the first: a wallet extension can be installed or
 * enabled while the page is open, and re-asking is free. */
export function subscribeEvmWallets(fn: (wallets: EvmWallet[]) => void): () => void {
  ensureListening();
  subscribers.add(fn);
  fn(snapshot());
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  }
  return () => {
    subscribers.delete(fn);
  };
}

/* Everything discovered so far, for callers that only need one look. */
export function knownEvmWallets(): EvmWallet[] {
  ensureListening();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  }
  return snapshot();
}

/* A user rejecting a wallet prompt is not an error worth a red banner — it is
   them changing their mind, and it should read that way. EIP-1193 spells the
   rejection 4001; some wallets also use 'ACTION_REJECTED'. */
export function isUserRejection(err: unknown): boolean {
  const e = err as { code?: number | string; message?: string } | null;
  if (!e) return false;
  if (e.code === 4001 || e.code === 'ACTION_REJECTED') return true;
  return /user (rejected|denied|cancelled|canceled)/i.test(e.message ?? '');
}

/* Ask the wallet which account it is offering.
 *
 * `eth_requestAccounts` is the prompting form; `eth_accounts` answers silently
 * but returns empty until permission exists. Prompting is correct here because
 * this is only reached from a click. */
export async function requestAccount(provider: EthereumProvider): Promise<string> {
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as
    | string[]
    | undefined;
  const address = accounts?.[0];
  if (!address) {
    /* A wallet that returns an empty list has connected but shared nothing —
       locked, or every account deselected in its permissions UI. Saying
       "connected" here would strand the user on a screen that cannot proceed. */
    throw new Error('The wallet connected but did not share an account.');
  }
  return address;
}

/* Which chain the wallet is currently on, as a decimal id. */
export async function currentChainId(provider: EthereumProvider): Promise<number> {
  const hex = (await provider.request({ method: 'eth_chainId' })) as string;
  return Number.parseInt(hex, 16);
}

/* Sign the identity message.
 *
 * `personal_sign` takes (message, address) in that order — reversed from
 * `eth_sign`, and getting it backwards fails in a way that reads like a wallet
 * bug. The message is passed as a plain string: wallets that follow the spec
 * hex-encode it themselves, and pre-encoding produces a prompt showing the user
 * a wall of hex instead of the sentence explaining what they are agreeing to.
 *
 * The returned signature is the sole secret input to key derivation. Do not log
 * it, do not persist it, and hand it straight to `deriveIdentity`. */
export async function signIdentityMessage(
  provider: EthereumProvider,
  address: string,
  message: string,
): Promise<string> {
  const signature = (await provider.request({
    method: 'personal_sign',
    params: [message, address],
  })) as string;
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    /* Every derived key folds this value. A wallet that answers with something
       that is not a hex signature must stop the flow here, not produce an
       account nobody can reach. */
    throw new Error('The wallet returned a signature in a form Airlock cannot use.');
  }
  return signature;
}

/* Shorten an EVM address for display. Distinct from `shortAddress` in
   `identity.ts`, which pads to felt width first — EVM addresses are fixed at 20
   bytes and need no padding, and sharing one helper would invite padding a
   Starknet felt to 40 hex or truncating an EVM address to the wrong width. */
export function shortEvmAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
