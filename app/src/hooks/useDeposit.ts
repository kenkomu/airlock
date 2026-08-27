/* The deposit, as a state machine with an interrupted state.
 *
 * `pending` is not an error branch bolted on afterwards — it is a first-class
 * state, because the thing it guards against is the worst failure this app can
 * have. Once the engine has burned the user's USDC on their own chain and minted
 * it to their Starknet account, that money has moved. A reload at that moment
 * loses the in-memory flag saying so, and a fresh press would burn a second
 * time. The engine persists a durable cursor and refuses the fresh press; this
 * hook's job is to turn that refusal into a Continue the user can actually take,
 * rather than an error they retry until it works.
 *
 * `resume: true` is therefore only ever sent from `continueDeposit`, which only
 * exists in the pending state. It is never a retry.
 */

import { useCallback, useRef, useState } from 'react';
import {
  asPendingDeposit,
  runDeposit,
  type MoveStep,
  type StepStatus,
} from '../lib/deposit';

/* The three legs, in the order the engine runs them. Held here rather than
   derived from callbacks so the UI can show what has not happened yet — a step
   list that only grows tells the user nothing about how far there is to go. */
export const DEPOSIT_STEPS: MoveStep[] = ['deploy', 'register', 'deposit'];

export type StepState = Partial<Record<MoveStep, { status: StepStatus; txHash?: string }>>;

export type DepositPhase =
  | { phase: 'idle' }
  /* The engine is being fetched. Its own step, because on a slow connection it
     is a second or two of nothing and the user has just clicked something. */
  | { phase: 'loading' }
  | { phase: 'running'; steps: StepState; burnTxHash?: string }
  /* Interrupted: money already moved, deposit not finished. */
  | { phase: 'pending'; pendingNetWei: bigint }
  | { phase: 'done'; depositedNetWei: bigint; burnTxHash?: string }
  | { phase: 'error'; message: string; steps: StepState };

export interface DepositSession {
  state: DepositPhase;
  /* Start a fresh deposit. Fails into `pending` if one was interrupted. */
  start: (amountWei: bigint) => Promise<void>;
  /* Finish the interrupted one. Only reachable from `pending`. */
  continueDeposit: () => Promise<void>;
  reset: () => void;
}

export interface DepositDeps {
  /* Produces the wallet signature, in memory, at the moment it is needed.
     A function rather than a value so a signature is never held in this hook's
     state where a devtools snapshot would keep it. */
  getSignature: () => Promise<`0x${string}`>;
  getProvider: () => unknown;
  chainId?: number;
}

export function useDeposit(deps: DepositDeps): DepositSession {
  const [state, setState] = useState<DepositPhase>({ phase: 'idle' });
  /* Steps accumulate across callbacks, and reading them back out of React state
     inside the callback would see a stale copy. */
  const steps = useRef<StepState>({});
  const burn = useRef<string | undefined>(undefined);

  const run = useCallback(
    async (amountWei: bigint, resume: boolean) => {
      steps.current = {};
      burn.current = undefined;
      setState({ phase: 'loading' });

      try {
        const signature = await deps.getSignature();
        setState({ phase: 'running', steps: {} });

        const result = await runDeposit({
          signature,
          amountWei,
          provider: deps.getProvider(),
          sourceChainId: deps.chainId,
          resume,
          onStep: (step, status, _detail, txHash) => {
            steps.current = {
              ...steps.current,
              [step]: { status, txHash: txHash ?? steps.current[step]?.txHash },
            };
            setState({ phase: 'running', steps: steps.current, burnTxHash: burn.current });
          },
          onBurned: ({ burnTxHash }) => {
            /* Surfaced separately from the steps because it is the leg on the
               user's OWN chain — the one they can check in their own explorer,
               and the one that means their money has actually left. */
            burn.current = burnTxHash;
            setState({ phase: 'running', steps: steps.current, burnTxHash });
          },
        });

        setState({
          phase: 'done',
          depositedNetWei: result.depositedNetWei,
          burnTxHash: burn.current,
        });
      } catch (e) {
        const interrupted = asPendingDeposit(e);
        if (interrupted) {
          setState({ phase: 'pending', pendingNetWei: interrupted.pendingNetWei });
          return;
        }
        setState({
          phase: 'error',
          message: e instanceof Error ? e.message : String(e),
          steps: steps.current,
        });
      }
    },
    [deps],
  );

  const start = useCallback(
    async (amountWei: bigint) => {
      await run(amountWei, false);
    },
    [run],
  );

  const continueDeposit = useCallback(async () => {
    if (state.phase !== 'pending') return;
    /* The amount is deliberately not re-read from the form. On a resume the
       engine deposits the balance that already landed on the account; a number
       typed since then would be a different amount and is not what is sitting
       there. Zero is passed because the resume path ignores it. */
    await run(0n, true);
  }, [state, run]);

  const reset = useCallback(() => {
    steps.current = {};
    burn.current = undefined;
    setState({ phase: 'idle' });
  }, []);

  return { state, start, continueDeposit, reset };
}
