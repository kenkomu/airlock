/* The way out: pool → burn on Starknet → mint at an address on another chain.
 *
 * Lazy for the same reason the deposit is — this shares the engine chunk with
 * it, so whichever the user reaches first pays the load and the second is free.
 *
 * The resume contract here is NOT the deposit's, and the difference matters
 * enough that the two are separate modules rather than one with a flag:
 *
 *   deposit   — an interrupted run must be continued EXPLICITLY (`resume: true`),
 *               and a fresh press is refused until the user chooses.
 *   withdraw  — an interrupted run resumes BY ITSELF when the destination
 *               matches, and is refused only when it does not.
 *
 * So there is no Continue button on this side. Asking for the same address again
 * is what continues it, and asking for a different one is what gets refused —
 * because the first burn is already committed to CCTP and overwriting its cursor
 * would strand those funds.
 */

import type { CashOutStep, CashOutStepStatus } from '../../vendor/bridge-core/src/core/bridgeOut';

export type { CashOutStep, CashOutStepStatus };

/* The legs, in order. Named for what the user is waiting on rather than what the
   protocol calls it — "attest" is Circle's word, not theirs. */
export const WITHDRAW_STEPS: CashOutStep[] = ['burn', 'attest', 'mint'];

export interface RunWithdrawArgs {
  getSignature: () => Promise<string>;
  /* Base units. 1 USDC = 1e6. */
  amount: bigint;
  /* Where the money should arrive: a 20-byte address on the destination chain. */
  destination: string;
  /* The connected EVM address. Keys the resume cursor — not where funds go. */
  evmAddress: string;
  destChainId?: number;
  onStep?: (step: CashOutStep, status: CashOutStepStatus, detail?: string) => void;
}

export interface WithdrawResult {
  burnTxHash: string;
  destination: string;
  forwardTxHash?: string;
  amountNet: bigint;
}

/* A cash-out already in flight to a different address.
 *
 * Recognised by message rather than a code, because the engine throws a plain
 * Error here — unlike the deposit's typed PENDING_POOL_DEPOSIT. That is fragile
 * and deliberately narrow: it matches only the engine's own phrasing, and if it
 * ever stops matching the failure mode is that this reads as an ordinary error,
 * which is safe. The opposite mistake — inventing a resume that did not happen —
 * is the one that would cost money, and it is not reachable from here. */
export function inflightDestination(err: unknown): string | null {
  const message = err instanceof Error ? err.message : '';
  const m = /A cash-out to (\S+) is already in progress/.exec(message);
  return m ? m[1] : null;
}

/* An EVM address, checked before anything is signed.
 *
 * The engine validates too, but by then the user has been asked for a signature.
 * A typo caught here costs nothing; caught there it costs a wallet prompt, and
 * caught by neither it sends real money to an address nobody controls. */
export function isEvmAddress(v: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(v.trim());
}

export async function runWithdraw(args: RunWithdrawArgs): Promise<WithdrawResult> {
  const [{ cashOut }, { initBridgeConfig }] = await Promise.all([
    import('../../vendor/bridge-core/src/core/bridgeOut'),
    import('../../vendor/bridge-core/src/core/config'),
  ]);

  initBridgeConfig({ dev: false, prod: true, vars: { NETWORK: 'mainnet' } });

  return cashOut({
    /* Called once on a fresh burn and never on a resume — re-signing a resumed
       cash-out would burn a second time. The engine owns that decision; this
       just hands it the means. */
    resolveSignature: args.getSignature,
    amount: args.amount,
    destination: args.destination.trim(),
    evmAddress: args.evmAddress,
    destChainId: args.destChainId,
    onStep: args.onStep,
  });
}
