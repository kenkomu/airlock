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
import type { AnonymityState } from '../hooks/useAnonymitySet';

/* ~2s Starknet blocks put a day at roughly this many. Used only to describe the
   window in human terms, never to compute a claim. */
const BLOCKS_PER_DAY = 43_200;

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
  const top = snap.byToken[0]?.deposits ?? 1;

  return (
    <>
      <div className="anon-body">
      <div className="metrics">
        <Metric
          k="Deposits in window"
          v={snap.deposits.toLocaleString()}
          hint="the crowd you hide in"
        />
        <Metric k="Registered keys" v={snap.registrations.toLocaleString()} />
        <Metric k="Pool transactions" v={snap.uniqueTxs.toLocaleString()} />
      </div>

      {snap.byToken.length > 0 && (
        <div className="tokens">
          <h3 className="sub">Deposits by token</h3>
          <ul>
            {snap.byToken.map((t) => (
              <li key={t.symbol}>
                <span className="mono tok">{t.symbol}</span>
                <span className="bar-track" aria-hidden="true">
                  <span
                    className="bar"
                    style={{ width: `${Math.max(2, (t.deposits / top) * 100)}%` }}
                  />
                </span>
                <span className="mono num">{t.deposits.toLocaleString()}</span>
              </li>
            ))}
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
