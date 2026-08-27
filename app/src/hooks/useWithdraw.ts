/* The withdraw, as a state machine.
 *
 * Shaped like `useDeposit` deliberately — the two legs of a round trip should
 * not feel like two different products — but the interrupted state differs and
 * is not interchangeable. See `lib/withdraw.ts`: a cash-out resumes by itself
 * when the destination matches, so `blocked` here is not "press Continue", it is
 * "you asked for a different address than the one already in flight".
 */

import { useCallback, useRef, useState } from 'react';
import {
  inflightDestination,
  isEvmAddress,
  runWithdraw,
  type CashOutStep,
  type CashOutStepStatus,
} from '../lib/withdraw';

export type WithdrawStepState = Partial<
  Record<CashOutStep, { status: CashOutStepStatus; detail?: string }>
>;

export type WithdrawPhase =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'running'; steps: WithdrawStepState }
  /* An earlier cash-out is still travelling, to somewhere else. Not an error the
     user caused, and not something a retry fixes. */
  | { phase: 'blocked'; destination: string }
  | { phase: 'done'; burnTxHash: string; destination: string; amountNet: bigint }
  | { phase: 'error'; message: string; steps: WithdrawStepState };

export interface WithdrawSession {
  state: WithdrawPhase;
  start: (amount: bigint, destination: string) => Promise<void>;
  reset: () => void;
}

export interface WithdrawDeps {
  getSignature: () => Promise<string>;
  getEvmAddress: () => string | null;
  destChainId?: number;
}

export function useWithdraw(deps: WithdrawDeps): WithdrawSession {
  const [state, setState] = useState<WithdrawPhase>({ phase: 'idle' });
  const steps = useRef<WithdrawStepState>({});

  const start = useCallback(
    async (amount: bigint, destination: string) => {
      const evmAddress = deps.getEvmAddress();
      if (!evmAddress) {
        setState({ phase: 'error', message: 'Connect a wallet first.', steps: {} });
        return;
      }
      /* Checked before the engine is even fetched. The engine validates too, but
         only after asking for a signature — and a typo is worth catching while it
         still costs nothing. */
      if (!isEvmAddress(destination)) {
        setState({
          phase: 'error',
          message: 'That does not look like an address on this chain. It should be 0x followed by 40 characters.',
          steps: {},
        });
        return;
      }

      steps.current = {};
      setState({ phase: 'loading' });

      try {
        const result = await runWithdraw({
          getSignature: deps.getSignature,
          amount,
          destination,
          evmAddress,
          destChainId: deps.destChainId,
          onStep: (step, status, detail) => {
            steps.current = { ...steps.current, [step]: { status, detail } };
            setState({ phase: 'running', steps: steps.current });
          },
        });
        setState({
          phase: 'done',
          burnTxHash: result.burnTxHash,
          destination: result.destination,
          amountNet: result.amountNet,
        });
      } catch (e) {
        const busyTo = inflightDestination(e);
        if (busyTo) {
          setState({ phase: 'blocked', destination: busyTo });
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

  const reset = useCallback(() => {
    steps.current = {};
    setState({ phase: 'idle' });
  }, []);

  return { state, start, reset };
}
