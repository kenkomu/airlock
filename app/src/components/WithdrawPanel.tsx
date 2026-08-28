/* Taking it back out, to an address on another chain.
 *
 * The destination is a free-text field rather than "your connected wallet",
 * which is the whole point of the round trip: withdrawing to the address you
 * deposited from re-links the two sides and undoes everything the pool did. So
 * the field defaults to empty, and the copy says why rather than pre-filling
 * something convenient and wrong.
 */

import { useState } from 'react';
import type { WithdrawSession } from '../hooks/useWithdraw';
import { WITHDRAW_STEPS, isEvmAddress } from '../lib/withdraw';
import { IconArrowRight } from './Icons';
import { Copyable } from './Copyable';

const LABEL: Record<string, string> = {
  burn: 'Leave the pool',
  attest: 'Wait for Circle to confirm',
  mint: 'Arrive on the other chain',
};

export function WithdrawPanel({
  session,
  chainName,
  disabled,
  reason,
}: {
  session: WithdrawSession;
  chainName: string;
  disabled: boolean;
  reason: string;
}) {
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const { state, start, reset } = session;

  const value = Number(amount);
  const amountOk = Number.isFinite(value) && value > 0;
  /* Validated as they type only once it is long enough to judge — flagging "not
     an address" at the second character is telling someone they are wrong before
     they have finished being right. */
  const destTouched = destination.trim().length >= 10;
  const destOk = isEvmAddress(destination);
  const busy = state.phase === 'loading' || state.phase === 'running';

  if (state.phase === 'blocked') {
    return (
      <div className="dep dep-pending" role="alert">
        <h4 className="dep-h">An earlier withdrawal is still on its way</h4>
        <p className="sm">
          Money is already travelling to{' '}
          <Copyable value={state.destination} short={state.destination} label="the destination" />.
          It cannot be redirected — the burn is committed.
        </p>
        <p className="sm muted">
          To finish it, ask for that same address again. Sending to a different
          one now would leave the first lot unrecoverable.
        </p>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            setDestination(state.destination);
            reset();
          }}
        >
          Use that address
        </button>
      </div>
    );
  }

  if (state.phase === 'done') {
    return (
      <div className="dep dep-done">
        <h4 className="dep-h">Arrived on {chainName}</h4>
        <p className="sm">
          Sent to{' '}
          <Copyable value={state.destination} short={state.destination} label="the destination" />.
          Nothing on chain links it to where the money came in.
        </p>
        <button type="button" className="btn btn-sm" onClick={reset}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="wd">
      <label className="field">
        <span className="field-l">Amount to withdraw</span>
        <div className="amountbox">
          <input
            className="input mono amountbox-in"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
          <span className="tokfixed">USDC</span>
        </div>
      </label>

      <label className="field">
        <span className="field-l">Send to an address on {chainName}</span>
        <input
          className="input mono"
          placeholder="0x…"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          disabled={busy}
          spellCheck={false}
          aria-invalid={destTouched && !destOk}
        />
        {/* The one instruction that makes the round trip worth doing. */}
        <span className="sm muted">
          Use a fresh address — not the one you deposited from. Sending it back
          where it came from links both sides and undoes the privacy.
        </span>
      </label>

      <div aria-live="polite">
        {destTouched && !destOk && (
          <p className="err">
            That is not an address on this chain. It should be 0x followed by 40
            characters.
          </p>
        )}
        {state.phase === 'error' && (
          <p className="notice notice-blocked sm" role="alert">
            {state.message}
          </p>
        )}
      </div>

      {state.phase === 'loading' && (
        <p className="door-step">
          <span className="door-spin" aria-hidden="true" />
          Getting things ready…
        </p>
      )}

      {(state.phase === 'running' || state.phase === 'loading') && (
        <ol className="dep-list">
          {WITHDRAW_STEPS.map((step) => {
            const s =
              state.phase === 'running' ? (state.steps[step]?.status ?? 'pending') : 'pending';
            return (
              <li key={step} className={`dep-step dep-${s}`}>
                <span className="dep-mark" aria-hidden="true" />
                <span className="dep-body">
                  <span className="dep-name">{LABEL[step]}</span>
                </span>
                <span className="dep-stat">
                  {s === 'running' ? 'working…' : s === 'done' ? 'done' : s === 'error' ? 'failed' : 'waiting'}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <button
        type="button"
        className="btn btn-primary btn-lg"
        disabled={disabled || busy || !amountOk || !destOk}
        onClick={() => void start(BigInt(Math.round(value * 1e6)), destination)}
      >
        <IconArrowRight /> {busy ? 'Working…' : `Withdraw to ${chainName}`}
      </button>

      {disabled && <p className="muted sm center">{reason}</p>}
    </div>
  );
}
