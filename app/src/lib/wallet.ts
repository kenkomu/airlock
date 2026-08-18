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

export type Wallet = WalletWithStarknetFeatures;

/* Same endpoints as the public pool reads, for the same reason: one provider
   rate-limits and the app should fail over rather than look broken. */
const RPC_URLS = [
  'https://rpc.starknet.lava.build',
  'https://api.cartridge.gg/x/starknet/mainnet',
];

export const provider = new RpcProvider({ nodeUrl: RPC_URLS[0] });

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
  support: Strk20Support;
  balances: ShieldedBalance[];
}

/* MetaMask is excluded from discovery entirely. Its Starknet Snap probing
   raises an unlock popup on every scan, which is hostile on a page the user may
   only be reading. The starter kit does the same, for the same reason. */
export function watchWallets(onChange: (wallets: Wallet[]) => void): () => void {
  const store: Store = createStore({ eip1193Adapters: [] });
  const publish = (list: readonly Wallet[]) =>
    onChange(list.filter((w) => !/metamask/i.test(w.name)).slice());
  publish(store.getWallets());
  return store.subscribe(publish);
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
  const account = await WalletAccountV6.connect(provider, wallet);

  const accounts = await walletV6.requestAccounts(wallet);
  const address = validateAndParseAddress(
    Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : account.address,
  );
  const chainId = String(await walletV6.requestChainId(wallet));
  const onMainnet = chainId === constants.StarknetChainId.SN_MAIN;

  /* Read-only, unsigned, free. Doubles as the capability probe. */
  let support: Strk20Support = { kind: 'ready' };
  let balances: ShieldedBalance[] = [];
  try {
    balances = toBalances(await account.strk20Balances([]));
  } catch (e) {
    support = classify(e);
  }

  return { wallet, account, address, chainId, onMainnet, support, balances };
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
