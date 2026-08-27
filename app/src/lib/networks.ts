/* Per-network addresses, keyed by the chain id the wallet reports.
 *
 * The app was mainnet-only until the anonymizer needed rehearsing. That matters
 * for more than convenience: the two pools are different builds (class
 * 0x56ab118a on Sepolia, 0x67dddd89 on mainnet), and a capability probe run
 * against a mainnet RPC while the wallet sits on Sepolia reports the wrong
 * answer confidently. Everything network-dependent is resolved from one place
 * so there is no second, staler copy to disagree with this one.
 *
 * The two pool ABIs were diffed before relying on this: 45 functions each,
 * identical signatures, nothing added or removed either way. So a Sepolia round
 * trip is evidence about mainnet rather than a rehearsal of a different play.
 */

export const SN_MAIN = '0x534e5f4d41494e';
export const SN_SEPOLIA = '0x534e5f5345504f4c4941';

/* One anonymizer serves exactly one token on one pool with one ladder: all three
   are constructor arguments with no setter. So "the bucketer" is not a property
   of a network, it is a property of a (network, token) pair, and modelling it
   any other way would eventually point a USDC transaction at a STRK contract. */
export interface Bucketer {
  address: string;
  token: string;
  symbol: string;
  decimals: number;
  /* Base-unit value of one rung. The ladder is 1000/500/250/100/50/25/10/5/1
     multiplied by this, so `unit` is what makes the same class serve a
     6-decimal token and an 18-decimal one. */
  unit: bigint;
}

/* A token this deployment can READ a balance for. Deliberately separate from
   `Bucketer`: what someone holds and what Airlock can route are different
   questions, and conflating them is how the account panel came to report
   "Nothing held publicly" on mainnet — where there are no bucketers — for an
   account holding 24 STRK in the open. It had not looked. For a tool whose
   entire claim is naming what leaks, stating no public exposure without
   checking is the worst available direction to be wrong in. */
export interface TokenRef {
  address: string;
  symbol: string;
  decimals: number;
}

export interface Network {
  chainId: string;
  name: string;
  /* Public RPCs, tried in order — one provider rate-limits partway through a
     scan, which otherwise reads as a broken app rather than a busy endpoint. */
  rpcUrls: string[];
  pool: string;
  /* Empty where nothing is deployed yet, which the UI must treat as "bucketing
     unavailable here" rather than falling through to a zero address that would
     revert deep inside the pool. */
  bucketers: Bucketer[];
  /* Tokens worth reading a public balance for on this chain. Not exhaustive —
     no fixed list can be — so the UI says "of the tokens Airlock knows" rather
     than implying a full sweep. */
  tokens: TokenRef[];
  explorer: string;
}

const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

/* Native Circle USDC on Starknet mainnet. Named because it is now referenced
   twice — the bucketer's token and the recognised-token list — and two literals
   that must match is a bug waiting to happen. */
const MAINNET_USDC =
  '0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb';

const MAINNET: Network = {
  chainId: SN_MAIN,
  name: 'Starknet',
  rpcUrls: ['https://rpc.starknet.lava.build', 'https://starknet-rpc.publicnode.com'],
  pool: '0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a',
  bucketers: [
    /* STRK, 0.1-STRK rungs. STRK is 67% of recent mainnet pool deposits — the
       biggest crowd to hide in, so it is the token to serve first. */
    {
      address: '0x036816fe3c38b222e737ec4168b604309ab24154862d1a3f4c9db0042a90e97a',
      token: STRK,
      symbol: 'STRK',
      decimals: 18,
      unit: 100_000_000_000_000_000n,
    },
    /* USDC, 1-USDC rungs. Deployed because the cross-chain leg moves USDC and
       nothing else — CCTP is a USDC protocol — so without this, money bridged in
       could reach the pool but could not be split into standard sizes, which is
       the only thing Airlock adds. Constructor values re-read from chain at
       deploy time; see docs/mainnet.md. */
    {
      address: '0x06c63f43ddfa18ce3e4b39ea4fae212cc65308ba181603d98fb5d5ee4a978643',
      token: MAINNET_USDC,
      symbol: 'USDC',
      decimals: 6,
      unit: 1_000_000n,
    },
  ],
  /* The same set the anonymity scan recognises, so the two panels agree about
     which tokens exist. SLAY and WBTC are here because the pool takes them. */
  tokens: [
    { address: STRK, symbol: 'STRK', decimals: 18 },
    { address: MAINNET_USDC, symbol: 'USDC', decimals: 6 },
    { address: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7', symbol: 'ETH', decimals: 18 },
    { address: '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8', symbol: 'USDT', decimals: 6 },
    { address: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8', symbol: 'USDC.e', decimals: 6 },
    { address: '0x02ab526354a39e7f5d272f327fa94e757df3688188d4a92c6dc3623ab79894e2', symbol: 'SLAY', decimals: 18 },
    { address: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac', symbol: 'WBTC', decimals: 8 },
  ],
  explorer: 'https://voyager.online',
};

const SEPOLIA: Network = {
  chainId: SN_SEPOLIA,
  name: 'Starknet Sepolia',
  rpcUrls: ['https://starknet-sepolia-rpc.publicnode.com', 'https://api.cartridge.gg/x/starknet/sepolia'],
  pool: '0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91',
  bucketers: [
    /* STRK first: it is what the Sepolia pool is actually exercised with — 47 of
       the last 50 deposits — because native Sepolia USDC needs a faucet. The
       0.1-STRK rung keeps a rehearsal round trip to a couple of test tokens. */
    {
      address: '0x00de39f79e7e8b0dcdafe955330e206990203d6047a22e853eab9df83c440e6b',
      token: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
      symbol: 'STRK',
      decimals: 18,
      unit: 100_000_000_000_000_000n,
    },
    {
      address: '0x004c368ae058ee81b61884c5c47ee57484c4348669b66ac606366bbd1fd1b1fb',
      token: '0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343',
      symbol: 'USDC',
      decimals: 6,
      unit: 1_000_000n,
    },
  ],
  tokens: [
    { address: STRK, symbol: 'STRK', decimals: 18 },
    { address: '0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343', symbol: 'USDC', decimals: 6 },
  ],
  explorer: 'https://sepolia.voyager.online',
};

export const NETWORKS: Network[] = [MAINNET, SEPOLIA];

/* Unknown chain ids return undefined rather than defaulting to mainnet. A
   wrong-network default is the failure that spends real money on the chain the
   user did not choose. */
export function networkFor(chainId: string): Network | undefined {
  const want = BigInt(chainId);
  return NETWORKS.find((n) => BigInt(n.chainId) === want);
}

/* Address comparison is on the felt, never the string: the same address is
   written with and without leading zeros, and in either case, by different
   tools. Two spellings of one address comparing unequal is the bug that points
   a transaction at "no bucketer for this token" when one is right there. */
export function bucketerFor(n: Network, token: string): Bucketer | undefined {
  const want = BigInt(token);
  return n.bucketers.find((b) => BigInt(b.token) === want);
}

export function txUrl(n: Network, hash: string): string {
  return `${n.explorer}/tx/${hash}`;
}

export function contractUrl(n: Network, address: string): string {
  return `${n.explorer}/contract/${address}`;
}
