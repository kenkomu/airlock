/* Live anonymity accounting.
 *
 * The threat model instructs builders to disclose set size in user-facing copy —
 * "early-adopter sets are small — say so". No STRK20 interface does. This one
 * reads the pool directly and shows the real number, including when it is bad.
 *
 * Usable before connecting anything: someone deciding whether to trust the pool
 * needs this *before* they deposit, not after.
 */

import type { AnonymitySnapshot } from '../lib/pool';
import { TokenMark } from './Marks';
import type { AnonymityState } from '../hooks/useAnonymitySet';

/* ~2s Starknet blocks put a day at roughly this many. Used only to describe the
   window in human terms, never to compute a claim. */
const BLOCKS_PER_DAY = 43_200;

/* Below this share of pool deposits, a token's crowd is called thin in words.
   The threshold is a judgement call, so it lives here named rather than inline. */
const THIN_SHARE = 20;

export function AnonymityPanel({ state }: { state: AnonymityState }) {
  return (
    <section className="card card-anon" aria-labelledby="anon-h">
      <header className="card-h">
        <h2 id="anon-h">Anonymity set</h2>
        <span className="card-h-note">Starknet mainnet · live</span>
      </header>

      {state.phase === 'loading' && (
        <div className="skel-wrap" aria-live="polite">
          <div className="skel skel-lg" />
          <div className="skel" />
          <div className="skel skel-sm" />
          <p className="muted sm">Counting pool events…</p>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="notice notice-blocked" role="alert">
          <strong>Could not read the pool.</strong> {state.message}. A privacy
          tool that cannot reach the chain is guessing, so this shows nothing
          rather than a stale figure.
        </div>
      )}

      {state.phase === 'ready' && <Ready snap={state.snap} />}
    </section>
  );
}

function Ready({ snap }: { snap: AnonymitySnapshot }) {
  const days = Math.max(
    1,
    Math.round((snap.headBlock - snap.fromBlock) / BLOCKS_PER_DAY),
  );
  const tokenTotal = snap.byToken.reduce((sum, t) => sum + t.deposits, 0);

  return (
    <>
      <div className="anon-body">
        {/* One headline figure with the supporting two beneath it, the shape a
            wallet uses for a balance. Three equal tiles gave the number that
            decides whether you are hidden at all no more weight than a count
            of registrations. */}
        <div className="anon-lead">
          <div className="stat-hero">
            <span className="metric-k">Deposits in window</span>
            <span className="stat-hero-v mono">{snap.deposits.toLocaleString()}</span>
            <span className="metric-hint">the crowd you hide in</span>
          </div>
          <div className="metrics">
            <Metric k="Registered keys" v={snap.registrations.toLocaleString()} />
            <Metric k="Pool transactions" v={snap.uniqueTxs.toLocaleString()} />
          </div>
        </div>

      {snap.byToken.length > 0 && (
        <div className="tokens">
          <h3 className="sub">Deposits by token</h3>
          <ul className="toklist">
            {snap.byToken.map((t) => {
              const share = tokenTotal > 0 ? (t.deposits / tokenTotal) * 100 : 0;
              return (
                <li className="tokrow" key={t.symbol}>
                  <TokenMark symbol={t.symbol} size={30} />
                  <span className="tokrow-id">
                    <span className="tokrow-sym">{t.symbol}</span>
                    <span className="tokrow-name">
                      {share.toFixed(0)}% of deposits
                    </span>
                  </span>
                  <span className="tokrow-val">
                    <span className="tokrow-n mono">
                      {t.deposits.toLocaleString()}
                    </span>
                    {/* Thin slices are named, not just drawn short. The whole
                        point of this panel is that a small crowd is stated. */}
                    <span
                      className={`tokrow-tag${share < THIN_SHARE ? ' tokrow-thin' : ''}`}
                    >
                      {share < THIN_SHARE ? 'thin crowd' : 'deposits'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="muted sm">
            You hide among people who moved <em>the same token</em>. A thin token
            is a thin crowd however busy the pool looks overall.
          </p>
        </div>
      )}
      </div>

      <footer className="card-f">
        <p className="muted sm">
          Window: last {days} day{days === 1 ? '' : 's'} (blocks{' '}
          <span className="mono">{snap.fromBlock.toLocaleString()}</span>–
          <span className="mono">{snap.headBlock.toLocaleString()}</span>). Recent
          counts, not lifetime totals — a lifetime figure flatters the pool,
          because what protects you is the crowd sharing your time window.
        </p>
        {snap.truncated && (
          <p className="notice notice-leak sm">
            Scan hit its page cap, so these are a <strong>floor</strong>, not a
            count. The real set is larger — but a floor should not be rounded up
            into a claim.
          </p>
        )}
      </footer>
    </>
  );
}

function Metric({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="metric">
      <span className="metric-k">{k}</span>
      <span className="metric-v mono">{v}</span>
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  );
}
