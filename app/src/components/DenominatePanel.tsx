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
import { crowdAt, type SizeCount } from '../lib/pool';

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
  sizes,
}: {
  session: WalletSession;
  onConnect: () => void;
  /* Note sizes counted live from the pool, or null while the scan is in
     flight. Passed down rather than fetched here: the anonymity panel already
     pays for this scan, and two components asking separately could show two
     different crowds on one screen. */
  sizes: SizeCount[] | null;
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
        <AmountLede text={text} amount={amount} bucketer={bucketer} sizes={sizes} />
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
        {/* The token sits inside the amount box rather than in a bar above it.
            Two reasons it moved: detached, it read as an unexplained toggle with
            no stated relationship to the number underneath — and it was reusing
            `.seg`, which is a four-column grid built for the rest-period control,
            so with two tokens the geometry was simply wrong.
            *
            Inside the field it is the idiom every swap interface already uses,
            and it says what the number means without a label. */}
        <div className={`amountbox${busy ? ' amountbox-off' : ''}`}>
          <input
            className="input mono amountbox-in"
            inputMode="decimal"
            placeholder="0"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            aria-label={`Amount to split, in ${bucketer.symbol}`}
          />
          {network.bucketers.length > 1 ? (
            <div className="tokseg" role="group" aria-label="Token">
              {network.bucketers.map((b) => (
                <button
                  key={b.address}
                  type="button"
                  className={`tokseg-btn${b.address === bucketer.address ? ' tokseg-on' : ''}`}
                  disabled={busy}
                  aria-pressed={b.address === bucketer.address}
                  /* The typed amount is deliberately kept across a switch.
                     Clearing it made the user retype to answer "what does this
                     become in the other token", which is the question the panel
                     exists to answer. If the number is not splittable on the new
                     ladder the panel says so — and that refusal is the lesson,
                     since the ladders genuinely differ: STRK goes down to 0.1,
                     USDC stops at 1. */
                  onClick={() => {
                    setBucketer(b);
                    setLegs(null);
                  }}
                >
                  {b.symbol}
                </button>
              ))}
            </div>
          ) : (
            <span className="tokfixed">{bucketer.symbol}</span>
          )}
        </div>
      </label>


      {/* One live region for both, announced politely.
          *
          * These are the two messages that answer what the user just typed, and
          * they were visual-only: a screen-reader user got silence at exactly
          * the moment the panel is doing its job — refusing an amount and
          * explaining why. Polite rather than assertive because the content
          * changes on every keystroke, and an assertive region would interrupt
          * them mid-word, every word. */}
      <div aria-live="polite">
        {overBalance && (
          <p className="err">
            That is more than you hold shielded. The pool would reject it, so this
            says so now rather than after you approve it.
          </p>
        )}

        {!overBalance && planError && <p className="err">{planError}</p>}
      </div>

      {legs && amount !== null && (
        <SplitBar legs={legs} amount={amount} bucketer={bucketer} sizes={sizes} />
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
      return <AwaitingSignature />;
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


/* The opening claim, measured rather than asserted.
 *
 * This was a fixed sentence about 8.4 sitting above an input the reader had
 * often already changed, so the first line of the panel could be arguing about
 * a number that was no longer on screen. It now reads the same histogram the
 * figure below does — and says the opposite thing when the opposite thing is
 * true. An amount fourteen people moved last week is not a giveaway, and
 * insisting it is would be exactly the overclaiming this panel exists to refuse.
 *
 * "address", never "someone else": the histogram counts depositors and one of
 * them may well be the reader, so anything phrased as "others" would quietly
 * add one to the crowd.
 */
function AmountLede({
  text,
  amount,
  bucketer,
  sizes,
}: {
  text: string;
  amount: bigint | null;
  bucketer: Bucketer;
  sizes: SizeCount[] | null;
}) {
  const shown = text.trim() || '8.4';
  const crowd =
    amount !== null && amount > 0n && sizes
      ? crowdAt(sizes, bucketer.symbol, amount)
      : null;

  if (crowd && crowd.people >= 2)
    return (
      <p className="lede-in">
        <strong>{crowd.people} different addresses</strong> have already moved
        exactly {shown} {bucketer.symbol} — so this one is not a giveaway. Most
        amounts are: change a digit and watch.
      </p>
    );

  return (
    <p className="lede-in">
      Withdrawing <strong>{shown}</strong> tells everyone watching it was you —{' '}
      {crowd === null
        ? 'nobody else moved that exact number'
        : crowd.people === 0
          ? 'nobody in the pool has moved that exact amount recently'
          : 'just one address in the pool has moved it'}
      . Try any amount.
    </p>
  );
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
  sizes,
}: {
  legs: bigint[];
  amount: bigint;
  bucketer: Bucketer;
  sizes: SizeCount[] | null;
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

  /* How crowded each rung actually is, counted from the pool rather than
     asserted. Null until the scan lands, which is a third state on purpose:
     "we have not counted yet" must not render as "nobody uses this". */
  const crowd = sizes ? rungs.map((r) => crowdAt(sizes, bucketer.symbol, r)) : null;
  const worst = crowd?.reduce((a, b) => (b.people < a.people ? b : a)) ?? null;

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
          the count of DISTINCT sizes that makes a combination a pattern.

          Each carries how many people have used that exact size, because "a
          standard denomination" and "a size other people actually use" are not
          the same claim, and only the second one protects anybody. Measured on
          mainnet: 1 STRK is 20 notes from 10 people, while 250 STRK is on the
          ladder and had no notes at all in the same window. */}
      <figcaption className="splitfig-cap">
        <div className="splitkeys">
          {rungs.map((r) => {
            const n = legs.filter((l) => l === r).length;
            const c = crowd?.find((x) => x.amount === r.toString());
            return (
              <span className="splitkey" key={String(r)}>
                <i className={`splitkey-sw splitseg-${shadeOf(r)}`} aria-hidden="true" />
                {num(r)}
                {n > 1 && <span className="splitkey-x">&times;{n}</span>}
                {c && (
                  <span
                    /* Amber at one person, not only at zero. A rung one
                       address has used is not a smaller crowd than a rung
                       three have used — it is not a crowd, and that address
                       may well be the reader's own. Rendering it in the same
                       neutral grey as "3 people" would make a failure look
                       like a lesser success. */
                    className={`splitkey-c${c.people <= 1 ? ' splitkey-c-thin' : ''}`}
                    title={`${c.notes} note${c.notes === 1 ? '' : 's'} of this size in the window, from ${c.people} address${c.people === 1 ? '' : 'es'}`}
                  >
                    {c.people === 0 ? 'nobody' : `${c.people}\u00a0${c.people === 1 ? 'person' : 'people'}`}
                  </span>
                )}
              </span>
            );
          })}
        </div>
        <CrowdVerdict worst={worst} symbol={bucketer.symbol} label={worst ? num(BigInt(worst.amount)) : ''} />
      </figcaption>
    </figure>
  );
}

/* The verdict on the rarest leg, which is the only one that matters.
 *
 * A plan is exactly as private as its thinnest rung — the same reasoning
 * `planBuckets` uses to refuse a scattered split. Averaging the crowd across
 * legs would let a well-populated 1 STRK hide the fact that the 250 beside it
 * is unique, and the unique one is what an observer keys on.
 *
 * Note the wording: "people have used", never "other people". The histogram
 * counts depositor addresses and one of them may be the person reading this,
 * so "others" would overstate the crowd by one — small, but this panel's whole
 * claim is that it does not round its numbers in its own favour.
 */
function CrowdVerdict({
  worst,
  symbol,
  label,
}: {
  worst: SizeCount | null;
  symbol: string;
  label: string;
}) {
  if (!worst)
    return (
      <span className="splitkey-note">
        standard sizes — counting how many people use them…
      </span>
    );

  if (worst.people === 0)
    return (
      <span className="splitkey-note splitkey-note-warn">
        Nobody else in the pool has moved <b>{label} {symbol}</b> recently. That leg
        is distinctive on its own — a rounder amount splits into commoner sizes.
      </span>
    );

  return (
    <span className={`splitkey-note${worst.people === 1 ? ' splitkey-note-warn' : ''}`}>
      Rarest size here is <b>{label} {symbol}</b>, used by{' '}
      <b>
        {worst.people} {worst.people === 1 ? 'person' : 'people'}
      </b>{' '}
      in the pool's recent window
      {worst.people === 1 && ' — standard, but not yet a crowd'}.
    </span>
  );
}


/* Waiting for a wallet that may never answer.
 *
 * A browser extension can drop a signature request without telling anyone: the
 * popup opens behind the window, or is dismissed, or never appears because the
 * browser suppressed it. The promise then simply never settles, and this panel
 * said "Waiting for your signature" under a disabled button with no way out —
 * so the state that needs the most help gave the least.
 *
 * There is nothing to cancel; the request belongs to the wallet now. But after
 * a few seconds, "your wallet should have asked you by now" is far more useful
 * than a spinner, so the copy escalates rather than the state.
 */
function AwaitingSignature() {
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setWaited((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (waited < 8) return <p className="muted sm">Waiting for your signature.</p>;

  return (
    <div className="notice notice-leak" role="status">
      <strong>Your wallet has not answered.</strong> It should have asked you to
      approve this by now. Open the wallet extension from your browser toolbar —
      the request is usually queued there when the popup does not appear, or has
      opened behind this window.
      {waited >= 30 && (
        <>
          {' '}
          If there is nothing waiting, the request was dropped: reload the page
          and try again. Nothing has been signed, and nothing has been spent.
        </>
      )}
    </div>
  );
}
