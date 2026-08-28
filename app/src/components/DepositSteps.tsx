/* What the deposit shows while it runs, and the one state that matters most.
 *
 * All three legs are listed from the start, including the ones that have not
 * happened. A list that only grows tells you what has been done and nothing
 * about how much is left, which is the question someone watching their own money
 * move is actually asking.
 *
 * The interrupted state gets the most deliberate treatment on this screen. It
 * looks like a warning and reads like an instruction, because the wrong reaction
 * to it — pressing the normal button again — is the one that would burn a second
 * time, and the engine can only refuse that so long as the interface offers
 * Continue instead of a retry.
 */

import { DEPOSIT_STEPS, type DepositSession, type StepState } from '../hooks/useDeposit';
import type { MoveStep } from '../lib/deposit';
import { Copyable } from './Copyable';

const LABEL: Record<MoveStep, string> = {
  deploy: 'Create your Starknet account',
  register: 'Register your viewing key',
  deposit: 'Move it into the pool',
};

/* What each leg is for, in the words of someone who did not choose to learn
   any of this. "Register your viewing key" is unavoidable — it is what the
   pool calls it — so it gets a line saying why it exists. */
const WHY: Record<MoveStep, string> = {
  deploy: 'One-off. Paid for out of what you are moving.',
  register: 'Lets the pool encrypt your balance so only you can read it.',
  deposit: 'Your money is private from here.',
};

export function DepositSteps({ session }: { session: DepositSession }) {
  const { state, continueDeposit, reset } = session;

  if (state.phase === 'idle') return null;

  if (state.phase === 'pending') {
    return (
      <div className="dep dep-pending" role="alert">
        <h4 className="dep-h">Finish your last deposit first</h4>
        <p className="sm">
          Your money already left your wallet and is sitting on your Starknet
          account — it just has not reached the pool yet. Continuing moves it the
          rest of the way.
        </p>
        {/* Said plainly because the instinct is to start over, and starting over
            is the expensive mistake here. */}
        <p className="sm muted">
          Starting a new deposit instead would send a second lot of money. That is
          why this asks rather than retrying on its own.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void continueDeposit()}
        >
          Continue
        </button>
      </div>
    );
  }

  if (state.phase === 'needs-gas') {
    const strk = (Number(state.needWei) / 1e18).toFixed(2);
    return (
      <div className="dep dep-pending" role="alert">
        <h4 className="dep-h">Your account needs creating first</h4>
        <p className="sm">
          Send about <b>{strk} STRK</b> to the address below and press again. This
          is the only fee in the whole round trip — moving in, splitting and
          moving out are all free after it.
        </p>
        <p className="dep-tx">
          <Copyable value={state.address} short={state.address} label="your Starknet account" />
        </p>
        <p className="sm muted">
          It is your account, derived from your signature. Anything left over
          stays there, and the same signature reaches it again from any device.
        </p>
        <button type="button" className="btn btn-sm" onClick={reset}>
          I have sent it
        </button>
      </div>
    );
  }

  if (state.phase === 'done') {
    return (
      <div className="dep dep-done">
        <h4 className="dep-h">In the pool</h4>
        <p className="sm">
          Your balance is private now. Split it into standard sizes before you
          withdraw — that is what stops the amount identifying you.
        </p>
        {state.burnTxHash && (
          <p className="dep-tx">
            <Copyable value={state.burnTxHash} short={state.burnTxHash} label="the transaction hash" />
          </p>
        )}
        <button type="button" className="btn btn-sm" onClick={reset}>
          Done
        </button>
      </div>
    );
  }

  /* `loading` carries no steps — the engine is still being fetched, so nothing
     has been attempted. It renders the same list with everything waiting, which
     is exactly true and avoids a layout jump when the first step starts. */
  const steps: StepState =
    state.phase === 'running' || state.phase === 'error' ? state.steps : {};

  return (
    <div className="dep">
      {/* A spinner, not a skeleton. The research line is content vs action: a
          skeleton stands in for a shape that is coming, and nothing is coming
          here — this is the engine chunk being fetched before any step exists.
          Naming what it is waiting for beats a bare "Loading". */}
      {state.phase === 'loading' && (
        <p className="door-step">
          <span className="door-spin" aria-hidden="true" />
          Getting things ready…
        </p>
      )}

      {state.phase === 'running' && state.note && (
        <p className="sm muted">{state.note}</p>
      )}

      {state.phase === 'error' && (
        <p className="notice notice-blocked sm" role="alert">
          {state.message}
        </p>
      )}

      <ol className="dep-list">
        {DEPOSIT_STEPS.map((step) => {
          const s = steps[step]?.status ?? 'pending';
          return (
            <li key={step} className={`dep-step dep-${s}`}>
              <span className="dep-mark" aria-hidden="true" />
              <span className="dep-body">
                <span className="dep-name">{LABEL[step]}</span>
                <span className="dep-why">{WHY[step]}</span>
              </span>
              <span className="dep-stat">{statusWord(s)}</span>
            </li>
          );
        })}
      </ol>

      {state.phase === 'running' && state.burnTxHash && (
        <p className="sm muted">
          Your wallet has sent it. Waiting for the other side.
        </p>
      )}

      {state.phase === 'error' && (
        <button type="button" className="btn btn-sm" onClick={reset}>
          Start again
        </button>
      )}
    </div>
  );
}

function statusWord(s: string): string {
  if (s === 'running') return 'working…';
  if (s === 'done') return 'done';
  if (s === 'error') return 'failed';
  return 'waiting';
}
