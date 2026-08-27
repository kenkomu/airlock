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
import {
  IconSwap,
  IconWallet,
  IconChevron,
  IconClock,
  IconLayers,
  IconLock,
  IconArrowRight,
} from './Icons';
import { ChainMark, UsdcMark } from './Marks';
import type { WalletSession } from '../hooks/useWallet';
import type { EvmIdentitySession } from '../hooks/useEvmIdentity';
import { useDeposit } from '../hooks/useDeposit';
import { DepositSteps } from './DepositSteps';
import { formatUnits } from '../lib/wallet';

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
  session: WalletSession;
  onConnect: () => void;
  evmSession: EvmIdentitySession;
}

/* A native <select> kept for keyboard and mobile behaviour, laid transparently
   over a styled face. Rebuilding the listbox by hand would cost accessibility
   for cosmetics; this keeps both. */
function ChainPicker({
  id,
  label,
  value,
  disabledId,
  onPick,
}: {
  id: string;
  label: string;
  value: number;
  disabledId: number;
  onPick: (id: number) => void;
}) {
  const chain = byId(value);
  return (
    <div className="picker">
      <ChainMark id={chain.id} size={22} />
      <span className="picker-name">{chain.name}</span>
      <IconChevron className="picker-chev" />
      <label className="sr-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="picker-native"
        value={value}
        onChange={(e) => onPick(Number(e.target.value))}
      >
        {CHAINS.map((c) => (
          <option key={c.id} value={c.id} disabled={c.id === disabledId}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/* Legs come out largest-first, so equal denominations are already adjacent.
   Collapsing them matters: "10 x 2" is a fact, "10 10" is two things to count. */
function groupLegs(legs: number[]): { d: number; n: number }[] {
  return legs.reduce<{ d: number; n: number }[]>((acc, d) => {
    const last = acc[acc.length - 1];
    if (last && last.d === d) last.n += 1;
    else acc.push({ d, n: 1 });
    return acc;
  }, []);
}

export function TransferPanel({ onChange, session, evmSession, onConnect }: Props) {
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
    onChange({ fromId, toId, amount: valid ? amount : 0, bucketing, restMinutes, plan });
  }, [fromId, toId, amount, valid, bucketing, restMinutes, plan, onChange]);

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  /* Validate on blur, not on every keystroke — an error appearing mid-typing
     tells the user they are wrong before they have finished being right. */
  const showError = touched && !valid && raw.trim() !== '';

  const received = bucketing ? plan.moved : valid ? amount : 0;
  const groups = groupLegs(plan.legs);

  /* Real shielded balance, read from the pool through the wallet. Shown only
     when it is genuinely known — an absent balance and a zero balance mean very
     different things and must not render the same. */
  const shielded = session.balances.find((b) => b.symbol === 'USDC');
  const conn = session.state.phase === 'connected' ? session.state.conn : null;

  /* The deposit runs on the derived identity, not the Starknet wallet — it needs
     the raw signature, which only the any-chain door has. */
  const evmReady = evmSession.state.phase === 'ready';
  const deposit = useDeposit({
    getSignature: async () => {
      const creds = evmSession.takeCredentials();
      if (!creds) throw new Error('Connect a wallet from another chain first.');
      return creds.signature;
    },
    getProvider: () => evmSession.takeCredentials()?.provider,
    chainId: evmSession.state.phase === 'ready' ? evmSession.state.identity.chainId : undefined,
  });
  const depositBusy =
    deposit.state.phase === 'loading' || deposit.state.phase === 'running';
  /* This button cannot be enabled by anything the user does: the bridge legs are
     not built. So the only question the label has to get right is WHOSE gap it
     is naming, and it was getting that wrong in both directions.

     It gated on `onMainnet`, so a perfectly capable wallet sitting on Sepolia —
     the only network our anonymizer is actually deployed to — was told "Wallet
     cannot do this yet". That is the same stale mainnet check already fixed on
     the network notice and the connected pill; this was the third copy of it.

     And when the check passed, the button still said "Continue" while being
     disabled, which promises something that is not there. A wallet is only at
     fault when it genuinely cannot speak STRK20. Everything else here is ours
     to finish, and the label now says so. */
  const walletCannot = conn !== null && conn.support.kind === 'unsupported';

  return (
    <section className="card card-action" aria-labelledby="tx-h">
      <header className="card-h">
        <h2 id="tx-h">Move funds privately</h2>
        <span className="card-h-note">
          <UsdcMark size={16} />
          {shielded
            ? `${formatUnits(shielded.amount, shielded.decimals)} USDC shielded`
            : 'USDC'}
        </span>
      </header>

      {/* ---- From ---- */}
      <div className="swapcard">
        <span className="swapcard-tag">You send</span>

        <label className="sr-label" htmlFor="amt">
          Amount in USDC
        </label>
        <div className="swapcard-row">
          <ChainPicker
            id="from-chain"
            label="Source chain"
            value={fromId}
            disabledId={toId}
            onPick={setFromId}
          />
          <div className="amt">
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
            <span className="amt-sub mono">USDC</span>
          </div>
        </div>

        {showError && (
          <p id="amt-err" className="err sm" role="alert">
            Enter a positive number.
          </p>
        )}

        <div className="quick">
          <span className="quick-l">Standard sizes</span>
          <div className="quick-row">
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
        <span className="swapcard-tag">You receive</span>

        <div className="swapcard-row">
          <ChainPicker
            id="to-chain"
            label="Destination chain"
            value={toId}
            disabledId={fromId}
            onPick={setToId}
          />
          <div className="amt amt-out">
            <span className="bignum-static mono">{received.toFixed(2)}</span>
            <span className="amt-sub mono">USDC</span>
          </div>
        </div>

        {bucketing && groups.length > 0 ? (
          <div className="split">
            <span className="split-l">
              {plan.legs.length} withdrawal{plan.legs.length === 1 ? '' : 's'}
            </span>
            <div className="split-row">
              {groups.map((g) => (
                <span className="leg mono" key={g.d}>
                  {g.d}
                  {g.n > 1 && <em className="leg-x">×{g.n}</em>}
                </span>
              ))}
              {plan.change > 0 && (
                <span className="leg leg-held mono" title="Retained inside the pool as a note">
                  +{plan.change.toFixed(2)} held
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="sm muted split-note">
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
            <span className="toggle-h">Split into standard denominations</span>
            <span className="muted sm block">
              No withdrawal carries your amount. The remainder stays in the pool.
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
      {/* The detail list from a swap confirmation sheet: label left, value
          right, one fact per row. It scans faster than the three-column grid
          it replaces and has room for the facts that matter here. */}
      <dl className="details">
        <div className="detail">
          <dt>
            <IconArrowRight className="ico-dim" /> Route
          </dt>
          <dd className="route">
            <ChainMark id={from.id} size={15} />
            <span>{from.short}</span>
            <i>&rarr;</i>
            <span className="route-pool">pool</span>
            <i>&rarr;</i>
            <ChainMark id={to.id} size={15} />
            <span>{to.short}</span>
          </dd>
        </div>
        <div className="detail">
          <dt>
            <IconClock className="ico-dim" /> Each leg
          </dt>
          <dd className="mono">
            {lo}&ndash;{hi} min
          </dd>
        </div>
        <div className="detail">
          <dt>
            <IconLayers className="ico-dim" /> Withdrawals
          </dt>
          <dd className="mono">{bucketing ? plan.legs.length || 0 : valid ? 1 : 0}</dd>
        </div>
        {bucketing && plan.change > 0 && (
          <div className="detail">
            <dt>
              <IconLock className="ico-dim" /> Stays in the pool
            </dt>
            <dd className="mono">{plan.change.toFixed(2)} USDC</dd>
          </div>
        )}
      </dl>

      {/* The button is live for the any-chain door and still honest for the
          others. It was disabled for everyone while the bridge legs did not
          exist; they exist now, but only along the path where the app holds the
          signature the engine needs. A Starknet-wallet user has no derived
          identity, so for them this is unchanged and says so. */}
      {evmReady ? (
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!valid || depositBusy}
          onClick={() => void deposit.start(BigInt(Math.round(amount * 1e6)))}
        >
          <IconLock /> {depositBusy ? 'Working…' : `Make ${amount || ''} USDC private`}
        </button>
      ) : conn === null ? (
        <button type="button" className="btn btn-primary btn-lg" onClick={onConnect}>
          <IconWallet /> Connect a wallet to continue
        </button>
      ) : (
        <button type="button" className="btn btn-primary btn-lg" disabled>
          <IconWallet />{' '}
          {walletCannot
            ? 'This wallet does not speak STRK20 yet'
            : 'Connect from another chain to move funds in'}
        </button>
      )}

      <DepositSteps session={deposit} />

      {!evmReady && (
        <p className="muted sm center">
          {walletCannot
            ? 'Connection works; the shielded read did not. Update the wallet or try one that supports STRK20.'
            : 'Moving funds in works from a wallet on another chain — MetaMask, Rabby, any of them. Splitting a shielded balance works today, see Denominate above.'}
        </p>
      )}
    </section>
  );
}
