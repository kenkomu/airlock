/* Wallet connection, and an honest account of what the connected wallet can do.
 *
 * Two failure modes cost real time during this build, so both are detected here
 * rather than surfacing as an exception at transaction time:
 *
 *   1. A wallet that connects perfectly but answers `Unknown request type:
 *      wallet_strk20InvokeTransaction`. STRK20 landed in Ready 5.33.8; every
 *      build before that, and Braavos, connect fine and then cannot do the one
 *      thing this app exists for.
 *   2. A wallet with no viewing key registered, which answers NOT_REGISTERED.
 *      Nothing in the pool is readable until the key is set.
 *
 * Both are discovered with one read-only probe at connect time: `strk20Balances`
 * costs no gas and asks for no signature, so probing is free and the user learns
 * their wallet is unsuitable before they have committed anything.
 */

import {
  RpcProvider,
  WalletAccountV6,
  constants,
  validateAndParseAddress,
  walletV6,
} from 'starknet';
import { createStore, type Store } from '@starknet-io/get-starknet-discovery';
import type { WalletWithStarknetFeatures } from '@starknet-io/get-starknet-wallet-standard/features';
import { TOKENS } from './pool';
import { NETWORKS, networkFor, type Network } from './networks';

export type Wallet = WalletWithStarknetFeatures;

/* Mainnet, for the reads the page makes before anyone connects. Once a wallet
   is connected, every read uses the provider for the chain that wallet is
   actually on — see `connect`. Probing mainnet while the wallet sits on Sepolia
   reports the wrong capability confidently, which is worse than reporting
   nothing. */
export const provider = new RpcProvider({ nodeUrl: NETWORKS[0].rpcUrls[0] });

export function providerFor(network: Network): RpcProvider {
  return new RpcProvider({ nodeUrl: network.rpcUrls[0] });
}

/* What the connected wallet can actually do, as opposed to what it claims. */
export type Strk20Support =
  | { kind: 'ready' }
  | { kind: 'unregistered' }
  | { kind: 'unsupported'; message: string }
  | { kind: 'unknown'; message: string };

export interface ShieldedBalance {
  token: string;
  symbol: string;
  amount: bigint;
  decimals: number;
}

export interface Connection {
  wallet: Wallet;
  account: WalletAccountV6;
  address: string;
  chainId: string;
  onMainnet: boolean;
  /* Undefined on a chain Airlock has no addresses for. Kept undefined rather
     than defaulted to mainnet: a wrong-network default is how an app spends
     real money on a chain the user did not pick. */
  network: Network | undefined;
  provider: RpcProvider;
  support: Strk20Support;
  balances: ShieldedBalance[];
}

/* Discovery runs three ways, and TWO of them only look once.
 *
 *   - **injected**: the legacy `window.starknet_*` objects. A one-shot scan of
 *     `window` at store construction — see `registerInjectedWalletDiscovery`.
 *   - **wallet-standard**: the store adds a lasting `register-wallet` listener,
 *     then dispatches `app-ready` ONCE. A wallet that volunteers a
 *     register-wallet of its own is fine forever; a wallet that only *answers*
 *     app-ready is heard only if its content script beat us to the page.
 *   - **EIP-6963**: MetaMask, through the virtual-wallet adapter. Genuinely
 *     event-driven, which is why MetaMask kept appearing while Ready did not.
 *
 * Both one-shot paths lose the same race, against any extension slower than the
 * page. So both get repeated: `_refreshInjectedWallets()` re-scans, and
 * `announcePage()` re-announces. Verified by injecting a wallet that only
 * listens for app-ready, after the page had already announced itself: missing
 * without the re-announce, listed with it.
 *
 * MetaMask is no longer excluded. Passing `eip1193Adapters: []` removed it from
 * discovery altogether, which is a heavier price than the problem it avoided:
 * its Snap probe can raise an unlock popup, but a wallet the user has installed
 * and cannot see is worse than one that asks a question.
 */
const REFRESH_MS = 400;
const REFRESH_FOR_MS = 8000;

/* The wallet-standard handshake, dispatched again.
 *
 * `createStore` announces the page once, at construction: it adds a persistent
 * listener for `wallet-standard:register-wallet`, then dispatches a single
 * `wallet-standard:app-ready`. A wallet whose content script has not run yet
 * misses that announcement — and if it only *listens* for app-ready rather than
 * volunteering a register-wallet of its own, it is never seen again. One
 * announcement is a race the page loses whenever an extension is slower than it.
 *
 * Re-announcing fixes it without touching the library's bookkeeping. A wallet
 * that hears a later app-ready replies by dispatching `register-wallet`, and the
 * listener the store installed is still there to catch it. We deliberately do
 * not pass our own registration API: the store owns the wallet list, and a
 * second one would be a list nothing reads.
 */
function announcePage(): void {
  if (typeof window === 'undefined') return;

  /* A wallet answering app-ready reads `detail.register` and calls it, so the
     event must carry a real registration API — a bare Event would throw inside
     the wallet. Ours forwards: it re-emits each wallet as a `register-wallet`
     event, which is what the store is already listening for. That way the store
     stays the single owner of the wallet list and we add no bookkeeping of our
     own to fall out of sync with it. */
  const detail = Object.freeze({
    register: (...wallets: unknown[]) => {
      window.dispatchEvent(
        new CustomEvent('wallet-standard:register-wallet', {
          detail: (storeApi: { register: (...w: unknown[]) => unknown }) =>
            storeApi.register(...wallets),
        }),
      );
      return () => {};
    },
  });

  const event = new CustomEvent('wallet-standard:app-ready', {
    detail,
    bubbles: false,
    cancelable: false,
    composed: false,
  });
  window.dispatchEvent(event);
}

export function watchWallets(onChange: (wallets: Wallet[]) => void): () => void {
  const store: Store = createStore();
  const publish = (list: readonly Wallet[]) => onChange(list.slice());

  publish(store.getWallets());
  const unsubscribe = store.subscribe(publish);

  /* Both discovery paths need the same nudge, for the same reason: an extension
     that loads after the page has already looked. Polling stops rather than
     running forever — an interval that never clears is a background cost on a
     page someone may leave open. */
  const started = Date.now();
  const timer = setInterval(() => {
    store._refreshInjectedWallets();
    announcePage();
    if (Date.now() - started > REFRESH_FOR_MS) clearInterval(timer);
  }, REFRESH_MS);

  return () => {
    clearInterval(timer);
    unsubscribe();
  };
}

/* Called when the picker opens. Someone who installs a wallet and comes back to
   an open tab is past the polling window, and telling them to reload is asking
   them to work around our timing choices. */
export function rescanWallets(): void {
  announcePage();
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/* Classify a probe failure into something the user can act on. The strings are
   what Ready and Braavos actually return; anything unrecognised stays 'unknown'
   rather than being guessed into a friendlier category that might be wrong. */
function classify(e: unknown): Strk20Support {
  const m = messageOf(e);
  if (/unknown request type|not implemented|unsupported method/i.test(m))
    return { kind: 'unsupported', message: m };
  if (/not.?registered|no viewing key|viewing key not set/i.test(m))
    return { kind: 'unregistered' };
  return { kind: 'unknown', message: m };
}

function toBalances(raw: unknown): ShieldedBalance[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): ShieldedBalance[] => {
    const e = entry as { token?: string; balance?: string; amount?: string };
    const token = e.token;
    if (!token) return [];
    const value = e.balance ?? e.amount ?? '0x0';
    const meta = TOKENS[token] ?? TOKENS[validateAndParseAddress(token)];
    return [
      {
        token,
        symbol: meta?.symbol ?? `${token.slice(0, 6)}…`,
        decimals: meta?.decimals ?? 18,
        amount: BigInt(value),
      },
    ];
  });
}

export async function connect(wallet: Wallet): Promise<Connection> {
  /* Authorize FIRST. Everything below needs permission the wallet has not
     granted yet: Ready refuses the lot with "Not preauthorized" until this
     handshake completes, because this is what raises the approval prompt.

     An earlier version read the chain id first, reasoning that `requestChainId`
     only needs the wallet and so could not have an ordering problem. That was
     wrong — it needs an AUTHORIZED wallet. The reordering arrived with network
     awareness and broke connecting outright for the one wallet this app exists
     to support. */
  await walletV6.standardConnect(wallet);

  /* Now the chain, and the provider for it. Building the account against a
     mainnet provider while the wallet sits on Sepolia would make every
     subsequent read answer about the wrong chain. */
  const chainId = String(await walletV6.requestChainId(wallet));
  const network = networkFor(chainId);
  const chainProvider = network ? providerFor(network) : provider;

  const account = await WalletAccountV6.connect(chainProvider, wallet);

  const accounts = await walletV6.requestAccounts(wallet);
  const address = validateAndParseAddress(
    Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : account.address,
  );
  const onMainnet = chainId === constants.StarknetChainId.SN_MAIN;

  /* Read-only, unsigned, free. Doubles as the capability probe — and now
     reports on the chain the wallet is actually on, which is the only way to
     learn whether this wallet does STRK20 on testnet. */
  let support: Strk20Support = { kind: 'ready' };
  let balances: ShieldedBalance[] = [];
  try {
    balances = toBalances(await account.strk20Balances([]));
  } catch (e) {
    support = classify(e);
  }

  return {
    wallet,
    account,
    address,
    chainId,
    onMainnet,
    network,
    provider: chainProvider,
    support,
    balances,
  };
}

export async function refreshBalances(c: Connection): Promise<ShieldedBalance[]> {
  return toBalances(await c.account.strk20Balances([]));
}

export function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatUnits(amount: bigint, decimals: number, places = 2): string {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = amount % base;
  const scaled = (frac * 10n ** BigInt(places)) / base;
  return `${whole.toLocaleString()}.${scaled.toString().padStart(places, '0')}`;
}
