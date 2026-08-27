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

export type { MoveStep, StepStatus };

/* Config for the engine, in the shape it wants.
 *
 * The engine reads no build-time env of its own by design, so the app hands it
 * one. Everything it needs on mainnet has a baked default in its config — the
 * pool, the CCTP contracts, the anonymizers, native USDC — which is why this is
 * short. `NETWORK` is the one that matters: unset means testnet, so mainnet has
 * to be asked for explicitly, and that default is the safe way round. */
function bridgeVars(): Record<string, string | undefined> {
  return {
    NETWORK: 'mainnet',
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
