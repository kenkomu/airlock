/* The live round trip: shielded balance in, standard notes out.
 *
 * Everything else in this app is an argument about privacy. This is the part
 * that actually moves money, so it is deliberately plain, and it shows the
 * split the CONTRACT returns rather than the one this app computed. The two
 * agree — there is a test suite whose job is that they agree — but showing the
 * chain's answer means the user is looking at what will happen rather than at a
 * prediction of it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPlan } from '../lib/actions';
import { denominate, format, type Stage } from '../lib/denominate';
import { NETWORKS, SN_MAIN, bucketerFor, contractUrl, txUrl, type Bucketer, type Network } from '../lib/networks';
import { providerFor } from '../lib/wallet';
import { recordSplit } from '../lib/history';

/* Measured, not estimated. On the first mainnet split
   (0x03f52e1bddd716344f5dd3c43ba2b81eb1aefb0bc7791aba3e54051b40963a50) the
   wallet's relayer took 6 STRK out of the shielded balance while the network
   fee paid to the sequencer was 3.4698 STRK. The premium is the price of not
   appearing as the payer.

   It is stated as an observation with its transaction attached rather than as a
   prediction, because the figure belongs to the wallet's relayer and nothing in
   the STRK20 wallet API exposes it — `strk20PrepareInvoke` returns
   `{ call, proof }` and no fee. Quoting a number we cannot compute as though we
   could would be the same overclaiming this app exists to avoid. */
const OBSERVED_SPONSOR_FEE = '6 STRK';
const OBSERVED_NETWORK_FEE = '3.47 STRK';
const OBSERVED_TX = '0x03f52e1bddd716344f5dd3c43ba2b81eb1aefb0bc7791aba3e54051b40963a50';
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

/* `plan` is a view function. It needs a provider and nothing else — no wallet,
   no signature, no account. So the whole preview runs before anyone connects,
   against the real mainnet contract.

   That is the difference between explaining this product and showing it. A
   newcomer types a number and watches it break apart; someone evaluating the
   project sees a live mainnet call in the first ten seconds. Neither has to
   install anything to get there. */
const MAINNET = NETWORKS.find((n) => n.chainId === SN_MAIN)!;

export function DenominatePanel({
  session,
  onConnect,
}: {
  session: WalletSession;
  onConnect: () => void;
}) {
  const conn = session.state.phase === 'connected' ? session.state.conn : null;
  /* Fall back to mainnet so the panel is usable unconnected. */
  const network = conn?.network ?? MAINNET;
  const preview = conn === null;

  const [bucketer, setBucketer] = useState<Bucketer | null>(null);
  /* Preview opens with a worked example already in the field. An empty input
     asks a newcomer to guess a number before they know what the thing does,
     and it makes the panel look inert to anyone skimming — the split is the
     product, so it should be on screen without being asked for. */
  const [text, setText] = useState(() =>
    session.state.phase === 'connected' ? '' : '8.4',
  );
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
    if (!bucketer || amount === null || amount <= 0n) {
      setLegs(null);
      setPlanError(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const l = await fetchPlan(conn?.provider ?? providerFor(network), bucketer.address, amount);
        if (!cancelled) { setLegs(l); setPlanError(null); }
      } catch {
        if (!cancelled) {
          setLegs(null);
          setPlanError('Not on the ladder — no combination of standard denominations makes this figure.');
        }
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [conn, network, bucketer, amount]);

  /* The example must not survive into the connected state: it is illustrative,
     and someone arriving at a filled field could sign an amount they never
     typed. */
  const wasPreview = useRef(conn === null);
  useEffect(() => {
    if (wasPreview.current && conn !== null) {
      setText('');
      setLegs(null);
      wasPreview.current = false;
    }
  }, [conn]);

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

  if (conn && !conn.network) {
    return (
      <section className="card card-action card-hero" aria-labelledby="den-h">
        <header className="card-h"><h2 id="den-h">Split your withdrawal</h2></header>
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

  const busy =
    stage.at !== 'idle' &&
    stage.at !== 'done' &&
    stage.at !== 'failed' &&
    /* Not busy: the dry run finished, it just could not tell us anything. The
       button stays live because an unknown answer is not a refusal. */
    stage.at !== 'unverified';

  return (
    <section className="card card-action card-hero" aria-labelledby="den-h">
      <header className="card-h">
        <h2 id="den-h">Split your withdrawal</h2>
        {/* "Starknet" is what the chain is called, not a warning. On mainnet the
            next button spends real funds, and the header is the last place that
            fact can be stated before someone presses it.

            In preview there are no funds to spend, so saying "real funds" would
            be a false alarm — it says where the numbers come from instead. */}
        {preview ? (
          <span className="card-h-note">Live from mainnet · nothing to sign</span>
        ) : network.chainId === SN_MAIN ? (
          <span className="card-h-note note-live">Mainnet · real funds</span>
        ) : (
          <span className="card-h-note">{network.name} · test funds</span>
        )}
      </header>

      {/* The idea before the mechanism. Someone who has never heard of STRK20
          needs to know what problem this solves before a word like
          "denomination" can mean anything to them. */}
      {preview && (
        <p className="lede-in">
          Withdrawing <strong>8.4</strong> tells everyone watching it was you —
          nobody else moved that exact number. Try any amount.
        </p>
      )}

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


      {overBalance && (
        <p className="err">
          That is more than you hold shielded. The pool would reject it, so this
          says so now rather than after you approve it.
        </p>
      )}

      {!overBalance && planError && <p className="err">{planError}</p>}

      {legs && amount !== null && (
        <SplitBar legs={legs} amount={amount} bucketer={bucketer} />
      )}

      <p className="muted sm">
        Standard sizes:{' '}
        {[1000n, 500n, 250n, 100n, 50n, 25n, 10n, 5n, 1n]
          .map((r) => format(r * bucketer.unit, bucketer).replace(` ${bucketer.symbol}`, ''))
          .join(' · ')}{' '}
        {bucketer.symbol}. Anything that is not an exact sum of these is refused
        rather than rounded.
      </p>

      {/* The bill, named in the same voice as the leaks. Everything else in this
          panel tells you what a privacy step costs your anonymity; this tells
          you what it costs your balance, and it was invisible until someone
          watched 6 STRK leave after splitting 8.4. */}
      {legs && !preview && (
        <div className="notice notice-leak" role="note">
          <strong>Gas comes out of your private balance, on top of the amount above.</strong>{' '}
          Your wallet pays through a relayer so your public address never appears
          as the payer, and bills the shielded side for it. On our first mainnet
          split that was <span className="mono">{OBSERVED_SPONSOR_FEE}</span>{' '}
          against a <span className="mono">{OBSERVED_NETWORK_FEE}</span> network
          fee —{' '}
          <a className="tx-link" href={txUrl(network, OBSERVED_TX)} target="_blank" rel="noreferrer">
            check it
          </a>
          . The premium buys the anonymity. Yours may differ; your wallet shows
          the exact figure before you sign.
        </div>
      )}

      <StageLine stage={stage} network={network} bucketer={bucketer} />

      {preview ? (
        <button className="btn btn-primary btn-lg" onClick={onConnect} type="button">
          <IconLock /> Connect a wallet to do this for real
        </button>
      ) : (
        <button
          className="btn btn-primary btn-lg"
          onClick={run}
          disabled={busy || !legs || overBalance}
        >
          <IconLock /> {busy ? 'Working…' : `Split into ${legs?.length ?? 0} notes`}
        </button>
      )}

      {/* Worth explaining rather than just printing. For a moment inside this
          transaction the pool hands the whole withdrawal to this contract before
          any of it comes back as notes, so "which contract" is a fair question
          and the answer should be checkable before signing, not after. */}
      <p className="muted sm">
        Your withdrawal passes through this contract, which splits it and hands
        every part straight back to the pool in the same transaction. It has no
        owner and cannot be upgraded —{' '}
        <a
          className="tx-link mono"
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
    case 'unverified':
      return (
        <div className="notice notice-leak" role="note">
          <strong>The dry run could not tell us anything.</strong> Your wallet
          returned <span className="mono">{stage.message}</span>, which is what it
          says when it has no reason to give — not evidence the pool refused
          anything. The split itself is valid: the anonymizer returned{' '}
          {stage.legs.length} note{stage.legs.length === 1 ? '' : 's'} for this
          amount. Signing will find out for certain, and costs the network fee
          whether it works or not.
        </div>
      );
    case 'awaiting-signature':
      return <p className="muted sm">Waiting for your signature.</p>;
    case 'submitted':
      return (
        <p className="muted sm">
          Submitted. <a className="tx-link mono" href={txUrl(network, stage.hash)} target="_blank" rel="noreferrer">
            {stage.hash.slice(0, 10)}…
          </a>
        </p>
      );
    case 'done':
      return (
        <p className="notice notice-sealed">
          Done — {stage.legs.length} notes of {format(stage.legs[0], bucketer)} and below.{' '}
          <a className="tx-link mono" href={txUrl(network, stage.hash)} target="_blank" rel="noreferrer">
            {stage.hash.slice(0, 10)}…
          </a>
        </p>
      );
    case 'failed':
      return <p className={stage.recoverable ? 'err' : 'notice notice-leak'}>{stage.message}</p>;
  }
}


/* ---------- the split, drawn ----------
 *
 * This was a row of identically-sized pills. 5 and 0.1 differ by fifty times and
 * rendered the same width, which threw away the one thing the picture is for —
 * and three paragraphs of prose underneath were doing the explaining instead.
 *
 * Two bars, because the comparison IS the argument: one distinctive amount above,
 * the same value as ordinary sizes below. Nobody needs that sentence written out
 * once they can see it.
 *
 * Sequential rather than categorical colour, deliberately. Categorical hues would
 * paint the four 0.1 notes as four different things when the whole point is that
 * they are indistinguishable — from each other and from everyone else's. One hue,
 * bigger is stronger, and identical rungs render identically.
 */
function SplitBar({
  legs,
  amount,
  bucketer,
}: {
  legs: bigint[];
  amount: bigint;
  bucketer: Bucketer;
}) {
  const moved = legs.reduce((a, b) => a + b, 0n);
  if (moved === 0n) return null;

  const num = (v: bigint) => format(v, bucketer).replace(` ${bucketer.symbol}`, '');

  /* Distinct rungs, largest first — the shade index, and the summary below. */
  const rungs = [...new Set(legs.map(String))]
    .map((v) => BigInt(v))
    .sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
  const shadeOf = (leg: bigint) =>
    rungs.length < 2 ? 0 : Math.round((rungs.findIndex((r) => r === leg) / (rungs.length - 1)) * 3);

  return (
    <figure className="splitfig">
      <div className="splitfig-row">
        <span className="splitfig-k">You withdraw</span>
        <div className="splitbar">
          <div className="splitseg splitseg-solo" style={{ width: '100%' }} />
        </div>
        <span className="splitfig-v mono">
          {num(amount)} {bucketer.symbol}
        </span>
      </div>

      <div className="splitfig-row">
        <span className="splitfig-k">Anyone watching sees</span>
        <div className="splitbar">
          {legs.map((l, i) => (
            <div
              key={i}
              className={`splitseg splitseg-${shadeOf(l)}`}
              /* Proportional to value, with a floor so a 0.1 beside a 1000 stays
                 visible rather than collapsing to nothing. */
              style={{ flex: `${Number((l * 10000n) / moved)} 0 3px` }}
              title={`${num(l)} ${bucketer.symbol}`}
            />
          ))}
        </div>
        <span className="splitfig-v mono">
          {legs.length} note{legs.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* The values, once, grouped — not a label on every segment. Four 0.1s are
          one fact, and the grouping is also what the privacy report reads: it is
          the count of DISTINCT sizes that makes a combination a pattern. */}
      <figcaption className="splitfig-cap">
        {rungs.map((r) => {
          const n = legs.filter((l) => l === r).length;
          return (
            <span className="splitkey" key={String(r)}>
              <i className={`splitkey-sw splitseg-${shadeOf(r)}`} aria-hidden="true" />
              {num(r)}
              {n > 1 && <span className="splitkey-x">&times;{n}</span>}
            </span>
          );
        })}
        <span className="splitkey-note">each a size other people also use</span>
      </figcaption>
    </figure>
  );
}
