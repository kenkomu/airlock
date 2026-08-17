/* The primary flow, built on the swap-card idiom.
 *
 * Structure borrowed from what shipped crypto UIs converged on, because
 * familiarity is a real usability property in a category where a mistake costs
 * money: a From card, a circular swap control straddling the seam, a To card,
 * then a receive preview before the CTA. Uniswap established it, every bridge
 * copied it, and a user who has bridged once already knows how to read it.
 *
 * What is deliberately not borrowed: the mesh-gradient-and-acid-lime look those
 * references use. It reads consumer-playful, and this tool's job is to tell
 * people when they are about to deanonymize themselves.
 *
 * Airlock's own additions are the denomination chips (which double as the
 * privacy control) and the rest period.
 */

import { useEffect, useMemo, useState } from 'react';
import { CHAINS, byId, roundTripEstimate } from '../lib/chains';
import { LADDER, planBuckets } from '../lib/buckets';
import { REST_PRESETS } from '../lib/exposure';
import type { BucketPlan } from '../lib/buckets';
import { IconSwap, IconClock, IconWallet, IconLayers } from './Icons';

export interface TransferState {
  fromId: number;
  toId: number;
  amount: number;
  bucketing: boolean;
  restMinutes: number;
  plan: BucketPlan;
}

interface Props {
  onChange: (s: TransferState) => void;
}

export function TransferPanel({ onChange }: Props) {
  const [fromId, setFromId] = useState(137);
  const [toId, setToId] = useState(42161);
  const [raw, setRaw] = useState('847.32');
  const [bucketing, setBucketing] = useState(true);
  const [restMinutes, setRestMinutes] = useState<number>(60 * 6);
  const [touched, setTouched] = useState(false);

  const amount = Number(raw);
  const valid = Number.isFinite(amount) && amount > 0;
  const plan = useMemo(() => planBuckets(valid ? amount : 0), [amount, valid]);

  const from = byId(fromId);
  const to = byId(toId);
  const [lo, hi] = roundTripEstimate(from, to);

  useEffect(() => {
    onChange({
      fromId,
      toId,
      amount: valid ? amount : 0,
      bucketing,
      restMinutes,
      plan,
    });
  }, [fromId, toId, amount, valid, bucketing, restMinutes, plan, onChange]);

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  /* Validate on blur, not on every keystroke — an error appearing mid-typing
     tells the user they are wrong before they have finished being right. */
  const showError = touched && !valid && raw.trim() !== '';

  const received = bucketing ? plan.moved : valid ? amount : 0;

  return (
    <section className="card card-action" aria-labelledby="tx-h">
      <header className="card-h">
        <h2 id="tx-h">Move funds privately</h2>
        <span className="card-h-note">USDC</span>
      </header>

      {/* ---- From ---- */}
      <div className="swapcard">
        <div className="swapcard-top">
          <label className="sr-label" htmlFor="from-chain">
            Source chain
          </label>
          <select
            id="from-chain"
            className="chain-pick"
            value={fromId}
            onChange={(e) => setFromId(Number(e.target.value))}
          >
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id} disabled={c.id === toId}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="swapcard-tag">You send</span>
        </div>

        <label className="sr-label" htmlFor="amt">
          Amount in USDC
        </label>
        <div className="bignum">
          <input
            id="amt"
            className="bignum-input mono"
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={showError}
            aria-describedby={showError ? 'amt-err' : undefined}
            placeholder="0.00"
          />
          <span className="bignum-unit mono">USDC</span>
        </div>

        {showError && (
          <p id="amt-err" className="err sm" role="alert">
            Enter a positive number.
          </p>
        )}

        <div className="quick">
          <span className="quick-l">Standard sizes</span>
          {LADDER.slice()
            .reverse()
            .map((d) => (
              <button
                key={d}
                type="button"
                className={`chip mono${amount === d ? ' chip-on' : ''}`}
                onClick={() => {
                  setRaw(String(d));
                  setTouched(false);
                }}
              >
                {d}
              </button>
            ))}
        </div>
      </div>

      {/* ---- swap seam ---- */}
      <div className="seam">
        <button
          type="button"
          className="seam-btn"
          onClick={swap}
          aria-label={`Reverse direction — currently ${from.name} to ${to.name}`}
          title="Reverse direction"
        >
          <IconSwap />
        </button>
      </div>

      {/* ---- To ---- */}
      <div className="swapcard swapcard-out">
        <div className="swapcard-top">
          <label className="sr-label" htmlFor="to-chain">
            Destination chain
          </label>
          <select
            id="to-chain"
            className="chain-pick"
            value={toId}
            onChange={(e) => setToId(Number(e.target.value))}
          >
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id} disabled={c.id === fromId}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="swapcard-tag">You receive</span>
        </div>

        <div className="bignum bignum-out">
          <span className="bignum-static mono">{received.toFixed(2)}</span>
          <span className="bignum-unit mono">USDC</span>
        </div>

        {bucketing && plan.legs.length > 0 ? (
          <>
            <div className="legs">
              {plan.legs.map((leg, i) => (
                <span className="leg mono" key={`${leg}-${i}`}>
                  {leg}
                </span>
              ))}
            </div>
            <p className="sm muted">
              Arrives as {plan.legs.length} withdrawal
              {plan.legs.length === 1 ? '' : 's'} of standard size
              {plan.change > 0 && (
                <>
                  {' '}
                  · <strong className="held">{plan.change.toFixed(2)} stays in the pool</strong>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="sm muted">
            {bucketing
              ? 'Enter an amount to see how it will be split.'
              : 'Arrives as one withdrawal carrying the exact figure.'}
          </p>
        )}
      </div>

      {/* ---- controls that change privacy ---- */}
      <div className="controls">
        <label className="toggle">
          <input
            type="checkbox"
            checked={bucketing}
            onChange={(e) => setBucketing(e.target.checked)}
          />
          <span>
            <span className="toggle-h">
              <IconLayers className="ico-dim" /> Split into standard denominations
            </span>
            <span className="muted sm block">
              Your amount leaves as common sizes so no withdrawal is distinctive.
              The remainder stays in the pool.
            </span>
          </span>
        </label>

        <fieldset className="rest">
          <legend className="field-l">Withdraw after</legend>
          <div className="seg" role="radiogroup" aria-label="Rest period">
            {REST_PRESETS.map((p) => (
              <button
                key={p.minutes}
                type="button"
                role="radio"
                aria-checked={restMinutes === p.minutes}
                className={`seg-btn${restMinutes === p.minutes ? ' seg-on' : ''}`}
                onClick={() => setRestMinutes(p.minutes)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {/* ---- route preview ---- */}
      <dl className="preview">
        <div>
          <dt>Route</dt>
          <dd>
            {from.name} → pool → {to.name}
          </dd>
        </div>
        <div>
          <dt>
            <IconClock className="ico-dim" /> Each leg
          </dt>
          <dd className="mono">
            {lo}–{hi} min
          </dd>
        </div>
        <div>
          <dt>Withdrawals</dt>
          <dd className="mono">{bucketing ? plan.legs.length || 0 : valid ? 1 : 0}</dd>
        </div>
      </dl>

      <button type="button" className="btn btn-primary btn-lg" disabled>
        <IconWallet /> Connect a wallet to continue
      </button>
      <p className="muted sm center">
        You approve each leg in your wallet. Airlock never chains them for you.
      </p>
    </section>
  );
}
