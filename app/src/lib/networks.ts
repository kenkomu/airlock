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

export interface Network {
  chainId: string;
  name: string;
  /* Public RPCs, tried in order — one provider rate-limits partway through a
     scan, which otherwise reads as a broken app rather than a busy endpoint. */
  rpcUrls: string[];
  pool: string;
  usdc: string;
  /* Airlock's own anonymizer. `null` where it is not deployed yet, which the UI
     must treat as "bucketing unavailable here" rather than crashing on a
     zero address that would revert deep inside the pool. */
  bucketer: string | null;
  explorer: string;
}

const MAINNET: Network = {
  chainId: SN_MAIN,
  name: 'Starknet',
  rpcUrls: ['https://rpc.starknet.lava.build', 'https://starknet-rpc.publicnode.com'],
  pool: '0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a',
  usdc: '0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb',
  bucketer: null,
  explorer: 'https://voyager.online',
};

const SEPOLIA: Network = {
  chainId: SN_SEPOLIA,
  name: 'Starknet Sepolia',
  rpcUrls: ['https://starknet-sepolia-rpc.publicnode.com', 'https://api.cartridge.gg/x/starknet/sepolia'],
  pool: '0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91',
  usdc: '0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343',
  bucketer: '0x004c368ae058ee81b61884c5c47ee57484c4348669b66ac606366bbd1fd1b1fb',
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

export function txUrl(n: Network, hash: string): string {
  return `${n.explorer}/tx/${hash}`;
}

export function contractUrl(n: Network, address: string): string {
  return `${n.explorer}/contract/${address}`;
}
