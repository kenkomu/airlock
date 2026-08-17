/* The primary flow: fund from one chain, withdraw to another.
 *
 * Bucketing and the rest period live here rather than in a separate "advanced"
 * area, because both change what actually happens and hiding them would make
 * the safe path the effortful one.
 */

import { useEffect, useMemo, useState } from 'react';
import { CHAINS, byId, roundTripEstimate } from '../lib/chains';
import { LADDER, planBuckets } from '../lib/buckets';
import { REST_PRESETS } from '../lib/exposure';
import type { BucketPlan } from '../lib/buckets';
import { IconSwap, IconArrowRight, IconClock, IconWallet } from './Icons';

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

  const amount = Number(raw) || 0;
  const plan = useMemo(() => planBuckets(amount), [amount]);

  const from = byId(fromId);
  const to = byId(toId);
  const [lo, hi] = roundTripEstimate(from, to);

  /* Report upward whenever a real input changes. `plan` is memoised on `amount`,
     so this does not fire on unrelated re-renders. */
  useEffect(() => {
    onChange({ fromId, toId, amount, bucketing, restMinutes, plan });
  }, [fromId, toId, amount, bucketing, restMinutes, plan, onChange]);

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  return (
    <section className="card card-action" aria-labelledby="tx-h">
      <header className="card-h">
        <h2 id="tx-h">Move funds</h2>
        <span className="card-h-note">USDC</span>
      </header>

      {/* route */}
      <div className="route">
        <label className="route-leg">
          <span className="field-l">From</span>
          <select
            className="select"
            value={fromId}
            onChange={(e) => setFromId(Number(e.target.value))}
          >
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id} disabled={c.id === toId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="route-swap"
          onClick={swap}
          aria-label={`Swap direction — currently ${from.name} to ${to.name}`}
          title="Swap direction"
        >
          <IconSwap />
        </button>

        <label className="route-leg">
          <span className="field-l">To</span>
          <select
            className="select"
            value={toId}
            onChange={(e) => setToId(Number(e.target.value))}
          >
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id} disabled={c.id === fromId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="route-path">
        {from.name} <IconArrowRight className="ico-dim" /> privacy pool{' '}
        <IconArrowRight className="ico-dim" /> {to.name}
      </p>

      {/* amount */}
      <label className="field">
        <span className="field-l">Amount</span>
        <div className="amount-wrap">
          <input
            className="input input-amount mono"
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            aria-label="Amount in USDC"
          />
          <span className="amount-unit mono">USDC</span>
        </div>
      </label>

      <div className="quick">
        {LADDER.slice()
          .reverse()
          .map((d) => (
            <button
              key={d}
              type="button"
              className={`chip mono${amount === d ? ' chip-on' : ''}`}
              onClick={() => setRaw(String(d))}
            >
              {d}
            </button>
          ))}
      </div>

      {/* bucketing */}
      <label className="toggle">
        <input
          type="checkbox"
          checked={bucketing}
          onChange={(e) => setBucketing(e.target.checked)}
        />
        <span>
          Split into standard denominations
          <span className="muted sm block">
            Recommended. Your amount leaves as common sizes so no leg is
            distinctive; the remainder stays in the pool.
          </span>
        </span>
      </label>

      {bucketing && plan.legs.length > 0 && (
        <div className="legs">
          {plan.legs.map((leg, i) => (
            <span className="leg mono" key={`${leg}-${i}`}>
              {leg}
            </span>
          ))}
          {plan.change > 0 && (
            <span className="leg leg-change mono" title="stays in the pool as a note">
              +{plan.change.toFixed(2)} held
            </span>
          )}
        </div>
      )}

      {/* rest period */}
      <fieldset className="rest">
        <legend className="field-l">
          Withdraw after <span className="muted">— time between the two legs</span>
        </legend>
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

      <div className="est">
        <IconClock className="ico-dim" />
        <span>
          Each leg settles in <strong>{lo}–{hi} min</strong>. Airlock never
          auto-chains them — you approve the withdrawal yourself, later.
        </span>
      </div>

      <button type="button" className="btn btn-primary btn-lg" disabled>
        <IconWallet /> Connect a wallet to continue
      </button>
      <p className="muted sm center">
        Nothing is signed or sent until you approve each leg in your wallet.
      </p>
    </section>
  );
}
