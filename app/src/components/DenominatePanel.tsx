/* The live round trip: shielded balance in, standard notes out.
 *
 * Everything else in this app is an argument about privacy. This is the part
 * that actually moves money, so it is deliberately plain, and it shows the
 * split the CONTRACT returns rather than the one this app computed. The two
 * agree — there is a test suite whose job is that they agree — but showing the
 * chain's answer means the user is looking at what will happen rather than at a
 * prediction of it.
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchPlan } from '../lib/actions';
import { denominate, format, type Stage } from '../lib/denominate';
import { SN_MAIN, bucketerFor, contractUrl, txUrl, type Bucketer, type Network } from '../lib/networks';
import { recordSplit } from '../lib/history';
import type { WalletSession } from '../hooks/useWallet';
import { IconLock } from './Icons';

/* Parses a human amount into base units without going through a float. 0.1 is
   not representable in binary, and a rounding error here is a transaction that
   reverts NOT_ON_LADDER for reasons the user cannot possibly see. */
function toBaseUnits(text: string, decimals: number): bigint | null {
  const t = text.trim();
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
  const [whole, frac = ''] = t.split('.');
  if (frac.length > decimals) return null;
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

export function DenominatePanel({ session }: { session: WalletSession }) {
  const conn = session.state.phase === 'connected' ? session.state.conn : null;
  const network = conn?.network;

  const [bucketer, setBucketer] = useState<Bucketer | null>(null);
  const [text, setText] = useState('');
  const [legs, setLegs] = useState<bigint[] | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ at: 'idle' });

  /* Default to whichever token the user actually holds shielded, falling back to
     the first deployment. Picking a token they have no balance in is a dead end
     they then have to diagnose. */
  useEffect(() => {
    if (!network) return setBucketer(null);
    const held = session.balances.find(
      (b) => b.amount > 0n && bucketerFor(network, b.token),
    );
    setBucketer(
      (held && bucketerFor(network, held.token)) ?? network.bucketers[0] ?? null,
    );
  }, [network, session.balances]);

  /* What this account actually holds shielded in the selected token. Without
     it, the only way to learn whether you can afford the amount you are typing
     was to close the panel and open the account sheet. */
  const held = bucketer
    ? session.balances.find((b) => BigInt(b.token) === BigInt(bucketer.token))
    : undefined;
  const balance = held?.amount ?? null;

  /* The largest amount that will actually split, which is not the balance. The
     contract fails closed on anything that is not an exact sum of rungs, so a
     "max" that pasted in the raw balance would hand back NOT_ON_LADDER most of
     the time. Flooring to the unit always lands on the ladder, because the unit
     is itself the smallest rung. */
  const maxSplittable =
    balance !== null && bucketer ? (balance / bucketer.unit) * bucketer.unit : null;

  const amount = bucketer ? toBaseUnits(text, bucketer.decimals) : null;
  const overBalance = amount !== null && balance !== null && amount > balance;

  /* Ask the contract how it would split this, as the user types. Read-only and
     unsigned, so there is no reason to make them commit first to find out. */
  useEffect(() => {
    if (!conn || !bucketer || amount === null || amount <= 0n) {
      setLegs(null);
      setPlanError(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const l = await fetchPlan(conn.provider, bucketer.address, amount);
        if (!cancelled) { setLegs(l); setPlanError(null); }
      } catch {
        if (!cancelled) {
          setLegs(null);
          setPlanError('Not on the ladder — no combination of standard denominations makes this figure.');
        }
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [conn, bucketer, amount]);

  const run = useCallback(async () => {
    if (!conn || !conn.network || !bucketer || amount === null) return;
    try {
      await denominate({
        account: conn.account,
        provider: conn.provider,
        network: conn.network,
        bucketer,
        owner: conn.address,
        amount,
        onStage: (st) => {
          setStage(st);
          /* Keep the receipt the moment the hash exists, not once it confirms.
             A submitted transaction that we then failed to read is exactly the
             one someone needs the hash for. */
          if (st.at === 'submitted' && conn.network) {
            recordSplit({
              hash: st.hash,
              address: conn.address,
              chainId: conn.network.chainId,
              token: bucketer.token,
              symbol: bucketer.symbol,
              decimals: bucketer.decimals,
              amount: amount.toString(),
              legs: st.legs.map((l) => l.toString()),
            });
          }
        },
      });
      await session.refresh();
    } catch {
      /* denominate() has already reported the reason through onStage; throwing
         again here would only produce an unhandled rejection saying the same
         thing in less useful words. */
    }
  }, [conn, bucketer, amount, session]);

  if (!conn) {
    return (
      <section className="card card-action card-hero" aria-labelledby="den-h">
        <header className="card-h">
          <h2 id="den-h">Denominate</h2>
          <span className="card-h-note">live on Sepolia</span>
        </header>
        <p className="muted">
          Split a shielded balance into standard note sizes, so no single
          withdrawal carries an amount anyone can pick out. The split is read
          from the deployed contract, not computed here.
        </p>
        <p className="muted sm">Connect a wallet to begin.</p>
      </section>
    );
  }

  if (!network) {
    return (
      <section className="card card-action card-hero" aria-labelledby="den-h">
        <header className="card-h"><h2 id="den-h">Denominate</h2></header>
        <p className="err">
          Airlock has no addresses for chain <span className="mono">{conn.chainId}</span>. Switch to
          Starknet mainnet or Sepolia.
        </p>
      </section>
    );
  }

  if (!bucketer) {
    return (
      <section className="card card-action card-hero" aria-labelledby="den-h">
        <header className="card-h"><h2 id="den-h">Denominate</h2></header>
        <p className="err">
          <strong>Nothing to route through on {network.name} yet.</strong> The
          anonymizer is live on Starknet Sepolia — switch your wallet's network
          there and this panel will pick it up. Mainnet is next.
        </p>
      </section>
    );
  }

  const busy = stage.at !== 'idle' && stage.at !== 'done' && stage.at !== 'failed';

  return (
    <section className="card card-action card-hero" aria-labelledby="den-h">
      <header className="card-h">
        <h2 id="den-h">Denominate</h2>
        {/* "Starknet" is what the chain is called, not a warning. On mainnet the
            next button spends real funds, and the header is the last place
            that fact can be stated before someone presses it. */}
        {network.chainId === SN_MAIN ? (
          <span className="card-h-note note-live">Mainnet · real funds</span>
        ) : (
          <span className="card-h-note">{network.name} · test funds</span>
        )}
      </header>

      {network.bucketers.length > 1 && (
        <div className="seg" role="group" aria-label="Token">
          {network.bucketers.map((b) => (
            <button
              key={b.address}
              type="button"
              className={`seg-btn${b.address === bucketer.address ? ' seg-on' : ''}`}
              onClick={() => { setBucketer(b); setText(''); setLegs(null); }}
            >
              {b.symbol}
            </button>
          ))}
        </div>
      )}

      <label className="field">
        <span className="field-row">
          <span className="field-l">Amount to split</span>
          {balance !== null && (
            <span className="field-bal">
              {balance > 0n ? (
                <>
                  <span className="muted">Private balance</span>{' '}
                  <span className="mono">{format(balance, bucketer)}</span>
                  {maxSplittable !== null && maxSplittable > 0n && (
                    <button
                      type="button"
                      className="linkbtn"
                      disabled={busy}
                      onClick={() =>
                        setText(format(maxSplittable, bucketer).replace(` ${bucketer.symbol}`, ''))
                      }
                    >
                      use max
                    </button>
                  )}
                </>
              ) : (
                <span className="muted">
                  Nothing shielded in {bucketer.symbol} — shield some in your wallet first
                </span>
              )}
            </span>
          )}
        </span>
        <input
          className="input mono"
          inputMode="decimal"
          placeholder={`0 ${bucketer.symbol}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
      </label>

      <p className="muted sm">
        Rungs: {[1000n, 500n, 250n, 100n, 50n, 25n, 10n, 5n, 1n]
          .map((r) => format(r * bucketer.unit, bucketer).replace(` ${bucketer.symbol}`, ''))
          .join(' · ')} {bucketer.symbol}
      </p>

      {overBalance && (
        <p className="err">
          That is more than you hold shielded. The pool would reject it, so this
          says so now rather than after you approve it.
        </p>
      )}

      {!overBalance && planError && <p className="err">{planError}</p>}

      {legs && (
        <div className="split">
          <div className="split-l">
            {/* The chain's answer, not ours. */}
            {legs.length} note{legs.length === 1 ? '' : 's'}, read from the contract
          </div>
          <div className="split-row">
            {legs.map((l, i) => (
              <span className="leg" key={i}>{format(l, bucketer).replace(` ${bucketer.symbol}`, '')}</span>
            ))}
          </div>
          <p className="split-note">
            Each note can be spent in its own transaction later. That is the point — the
            same amounts sent together in one transaction would be linked by it.
          </p>
        </div>
      )}

      <StageLine stage={stage} network={network} bucketer={bucketer} />

      <button
        className="btn btn-primary btn-lg"
        onClick={run}
        disabled={busy || !legs || overBalance}
      >
        <IconLock /> {busy ? 'Working…' : `Split into ${legs?.length ?? 0} notes`}
      </button>

      {/* Worth explaining rather than just printing. For a moment inside this
          transaction the pool hands the whole withdrawal to this contract before
          any of it comes back as notes, so "which contract" is a fair question
          and the answer should be checkable before signing, not after. */}
      <p className="muted sm">
        Your withdrawal passes through this contract, which splits it and hands
        every part straight back to the pool in the same transaction. It has no
        owner and cannot be upgraded —{' '}
        <a
          className="d-link mono"
          href={contractUrl(network, bucketer.address)}
          target="_blank"
          rel="noreferrer"
        >
          read it on {network.explorer.replace(/^https:\/\//, '')} ↗
        </a>
      </p>
    </section>
  );
}

/* One line, saying what is happening now. Each stage fails for a different
   reason and only some are the user's to fix, so they are not collapsed into a
   spinner that eventually says "failed". */
function StageLine({
  stage,
  network,
  bucketer,
}: {
  stage: Stage;
  network: Network;
  bucketer: Bucketer;
}) {
  switch (stage.at) {
    case 'idle':
      return null;
    case 'planning':
      return <p className="muted sm">Reading the split from the anonymizer…</p>;
    case 'simulating':
      return <p className="muted sm">Dry run against the pool — free, and unsigned.</p>;
    case 'awaiting-signature':
      return <p className="muted sm">Waiting for your signature.</p>;
    case 'submitted':
      return (
        <p className="muted sm">
          Submitted. <a className="d-link mono" href={txUrl(network, stage.hash)} target="_blank" rel="noreferrer">
            {stage.hash.slice(0, 10)}…
          </a>
        </p>
      );
    case 'done':
      return (
        <p className="notice notice-sealed">
          Done — {stage.legs.length} notes of {format(stage.legs[0], bucketer)} and below.{' '}
          <a className="d-link mono" href={txUrl(network, stage.hash)} target="_blank" rel="noreferrer">
            {stage.hash.slice(0, 10)}…
          </a>
        </p>
      );
    case 'failed':
      return <p className={stage.recoverable ? 'err' : 'notice notice-leak'}>{stage.message}</p>;
  }
}
