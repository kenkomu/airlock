/* Loading the deposit engine, and the two rules that make it safe to call.
 *
 * Everything here is behind a dynamic import on purpose. The engine and its
 * dependencies weigh 115 KB gzipped plus another 43 KB of siblings — measured,
 * not guessed — against a page that is currently 184 KB in total. The best thing
 * this app does is answer before anyone connects anything, and it is not paying
 * a 60% page-weight tax for a code path most visitors never reach. So the engine
 * loads when someone starts a deposit and not one moment earlier.
 *
 * The two rules:
 *
 *   1. `initBridgeConfig` must run BEFORE anything that reads config, or the
 *      engine throws. It is called inside the same lazy module that imports the
 *      orchestrator, so there is no import order in which the engine can be
 *      reached uninitialised.
 *
 *   2. A fresh deposit over an interrupted one fails closed. That is not a
 *      nuisance to route around — it is the guard against burning a user's USDC
 *      twice, and `resume` is the only thing allowed to clear it.
 */

import type { MoveStep, StepStatus } from '../../vendor/bridge-core/src/core/moveIntoPool';
import { OZ_ACCOUNT_CLASS_HASH } from './accountClass';

export type { MoveStep, StepStatus };

/* Config for the engine, in the shape it wants.
 *
 * The engine reads no build-time env of its own by design, so the app hands it
 * one. Everything it needs on mainnet has a baked default in its config — the
 * pool, the CCTP contracts, the anonymizers, native USDC — which is why this is
 * short. `NETWORK` is the one that matters: unset means testnet, so mainnet has
 * to be asked for explicitly, and that default is the safe way round. */
/* Which chain the bridge legs run against.
 *
 * Hardcoded to mainnet until now, which made a free rehearsal impossible — the
 * one thing you want before moving real money through code that has never run.
 *
 * Mainnet is the default because that is what the deployed site must do, and a
 * build that silently pointed at testnet would show a live-looking interface
 * reading the wrong chain. Testnet is opted into explicitly, at build time:
 *
 *   VITE_AIRLOCK_BRIDGE_NETWORK=testnet pnpm dev
 *
 * Anything other than the two known values is a typo, and typos here choose a
 * chain — so it fails loudly rather than falling back to a default that spends
 * real money. */
export type BridgeNetwork = 'mainnet' | 'testnet';

export function bridgeNetwork(): BridgeNetwork {
  const raw = (import.meta.env.VITE_AIRLOCK_BRIDGE_NETWORK ?? '').trim().toLowerCase();
  if (raw === '') return 'mainnet';
  if (raw === 'mainnet' || raw === 'testnet') return raw;
  throw new Error(
    `VITE_AIRLOCK_BRIDGE_NETWORK must be 'mainnet' or 'testnet' (got ${JSON.stringify(raw)}).`,
  );
}

/* The endpoint the account-deploy check reads. Follows the same choice, or the
   deploy would look for an account on a chain the deposit never touches. */
export function bridgeRpcUrl(net: BridgeNetwork = bridgeNetwork()): string {
  return net === 'mainnet'
    ? 'https://api.cartridge.gg/x/starknet/mainnet'
    : 'https://api.cartridge.gg/x/starknet/sepolia';
}

/* Exported for the test that actually starts the engine's config with it. The
   guarantee worth pinning is not the shape of this object but that
   `initBridgeConfig` accepts it — which it did not, on either network. */
export function bridgeVars(): Record<string, string | undefined> {
  return {
    NETWORK: bridgeNetwork(),
    /* Required, with no baked default, for both networks — `initBridgeConfig`
       throws "Config error: OZ_ACCOUNT_CLASS_HASH_… is not set" without it, and
       it throws on the first call, so the deposit could not start at all.

       It has to be the SAME constant the address was derived from. The engine
       deploys against whatever class it is given; a different value here would
       have it deploy a different address than the one the app showed the user
       and asked them to fund. Importing the single constant is what makes the
       two impossible to separate — see accountClass.ts. */
    OZ_ACCOUNT_CLASS_HASH,
  };
}

/* An interrupted deposit, waiting to be continued.
 *
 * Thrown by the engine when a durable cursor says a previous run already moved
 * the user's money onto their Starknet account but had not yet handed it to the
 * pool. Starting fresh from there would re-burn on the source chain — the funds
 * are already across — so the only correct next action is to continue. */
export interface PendingDeposit {
  pendingNetWei: bigint;
}

export function asPendingDeposit(err: unknown): PendingDeposit | null {
  const e = err as { code?: string; pendingNetWei?: bigint } | null;
  if (e?.code !== 'PENDING_POOL_DEPOSIT') return null;
  return { pendingNetWei: e.pendingNetWei ?? 0n };
}

export interface RunDepositArgs {
  signature: `0x${string}`;
  amountWei: bigint;
  provider: unknown;
  sourceChainId?: number;
  /* Continue an interrupted deposit rather than starting one. Never set this
     because a call failed — set it only when the user chose Continue in response
     to being told a deposit was already in flight. */
  resume?: boolean;
  onStep?: (step: MoveStep, status: StepStatus, detail?: string, txHash?: string) => void;
  onBurned?: (info: { burnTxHash: string; explorerUrl?: string }) => void;
}

export interface DepositResult {
  depositedNetWei: bigint;
  deposited: boolean;
}

/* The account is not there yet, and nobody has offered to pay for it. */
export interface NeedsGas {
  address: string;
  /* Base units of STRK, 18 decimals. */
  needWei: bigint;
}

export function asNeedsGas(err: unknown): NeedsGas | null {
  const e = err as { code?: string; address?: string; needWei?: bigint } | null;
  if (e?.code !== 'AIRLOCK_DEPLOY_NEEDS_GAS') return null;
  return { address: e.address ?? '', needWei: e.needWei ?? 0n };
}

/* What a one-time account deployment costs, with room to spare.
 *
 * The engine's own display estimate is 0.5 STRK. Asking for that rather than a
 * tight estimate is deliberate: an under-funded account fails mid-deploy, and
 * the remedy is another transfer and another wait. Whatever is left over stays
 * in the account and is not consumed by anything else — every leg after the
 * deploy is zero-fee. */
export const DEPLOY_GAS_WEI = 500_000_000_000_000_000n; // 0.5 STRK

/* Identical on mainnet and Sepolia — one of the few addresses that is, which is
   why this needs no network switch. */
const STRK_TOKEN =
  '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

/* Deploy the derived account, paid out of its own STRK.
 *
 * This exists because the engine cannot deploy without a sponsor. Its own path
 * prefers AVNU's SNIP-29 sponsored deploy, and AVNU requires a whitelisted API
 * key — which a static site cannot hold, because anyone could read it out of the
 * bundle and drain the sponsorship. Its other path funds from a development
 * treasury key, which config.ts hard-fails in any production build, correctly.
 *
 * So the honest third option: the user pays, once, for their own account. It is
 * the only fee in the whole lifecycle — register, deposit and withdraw are all
 * proven legs and cost nothing — and it buys an account that is theirs,
 * recoverable from the same signature on any device.
 *
 * The payload matches the engine's exactly (class hash, [publicKey] calldata,
 * publicKey as salt). It has to: a different salt is a different address, and the
 * money would arrive somewhere the app would never look. */
export async function ensureDerivedAccountDeployed(
  signature: string,
  onStatus?: (msg: string) => void,
): Promise<{ address: string; deployedNow: boolean; txHash?: string }> {
  const [{ Account, RpcProvider, CallData }, { deriveIdentity, OZ_ACCOUNT_CLASS_HASH }] =
    await Promise.all([import('starknet'), import('./identity')]);

  const identity = deriveIdentity(signature, OZ_ACCOUNT_CLASS_HASH);
  const provider = new RpcProvider({ nodeUrl: bridgeRpcUrl() });

  try {
    await provider.getClassHashAt(identity.address);
    return { address: identity.address, deployedNow: false };
  } catch {
    /* Nothing at the address yet — the normal case for a first-time user, not an
       error. Fall through and deploy. */
  }

  onStatus?.('Checking your account can pay for itself…');
  const balance = await provider.callContract({
    contractAddress: STRK_TOKEN,
    entrypoint: 'balance_of',
    calldata: CallData.compile([identity.address]),
  });
  const held = BigInt(balance[0] ?? '0x0');

  if (held < DEPLOY_GAS_WEI) {
    /* Fail before touching the wallet. The user needs to do something on another
       screen, and telling them that now is better than after a signature. */
    const err = new Error(
      'This account needs a little STRK to create itself.',
    ) as Error & { code: string; address: string; needWei: bigint };
    err.code = 'AIRLOCK_DEPLOY_NEEDS_GAS';
    err.address = identity.address;
    err.needWei = DEPLOY_GAS_WEI - held;
    throw err;
  }

  onStatus?.('Creating your Starknet account…');
  /* Options object, not positional — starknet 10 changed the constructor, and
     the positional form silently typechecks nowhere but reads plausibly. */
  const account = new Account({
    provider,
    address: identity.address,
    signer: identity.privateKey,
    cairoVersion: '1',
  });
  const { transaction_hash } = await account.deployAccount({
    classHash: OZ_ACCOUNT_CLASS_HASH,
    constructorCalldata: [identity.publicKey],
    addressSalt: identity.publicKey,
  });
  await provider.waitForTransaction(transaction_hash);
  return { address: identity.address, deployedNow: true, txHash: transaction_hash };
}

/* Load the engine, initialise it, and run one deposit.
 *
 * The import and the config call live together so they cannot be separated by a
 * later edit — the failure mode if they are is an exception thrown from deep
 * inside a money-moving path, which is the worst place to discover an ordering
 * mistake. */
export async function runDeposit(args: RunDepositArgs): Promise<DepositResult> {
  const [{ moveIntoPool }, { initBridgeConfig }] = await Promise.all([
    import('../../vendor/bridge-core/src/core/moveIntoPool'),
    import('../../vendor/bridge-core/src/core/config'),
  ]);

  initBridgeConfig({ dev: false, prod: true, vars: bridgeVars() });

  return moveIntoPool({
    signature: args.signature,
    /* The user funds this from their own wallet on their own chain. The engine's
       other option pays out of a development treasury, which has no place in a
       build anyone else runs. */
    funding: 'metamask',
    amountWei: args.amountWei,
    provider: args.provider as never,
    sourceChainId: args.sourceChainId,
    resume: args.resume,
    onStep: args.onStep,
    onBurned: args.onBurned,
  });
}

/* Whether any transfer is mid-flight, per the engine's durable cursors.
 *
 * Used to refuse a network switch while money is in motion: switching wipes
 * chain-scoped state the resume path depends on, and losing it is what re-opens
 * the double-burn. Loaded lazily like everything else here, so asking the
 * question does not drag the engine into the page. */
export async function hasInflightTransfer(): Promise<boolean> {
  const { hasAnyInflightTransfer } = await import(
    '../../vendor/bridge-core/src/core/depositIn'
  );
  return hasAnyInflightTransfer();
}
