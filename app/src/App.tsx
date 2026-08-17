import { useCallback, useMemo, useState } from 'react';
import './App.css';
import { TransferPanel, type TransferState } from './components/TransferPanel';
import { PrivacyReport } from './components/PrivacyReport';
import { AnonymityPanel } from './components/AnonymityPanel';
import { Steps } from './components/Steps';
import { useAnonymitySet } from './hooks/useAnonymitySet';
import { assess } from './lib/exposure';
import { planBuckets } from './lib/buckets';
import { byId } from './lib/chains';
import { IconShield } from './components/Icons';

const INITIAL: TransferState = {
  fromId: 137,
  toId: 42161,
  amount: 847.32,
  bucketing: true,
  restMinutes: 60 * 6,
  plan: planBuckets(847.32),
};

export default function App() {
  const [tx, setTx] = useState<TransferState>(INITIAL);
  const onChange = useCallback((s: TransferState) => setTx(s), []);

  /* One scan, shared by the report's crowd factor and the anonymity panel. */
  const anon = useAnonymitySet();
  const deposits = anon.phase === 'ready' ? anon.snap.deposits : null;

  const report = useMemo(
    () =>
      assess({
        plan: tx.plan,
        bucketing: tx.bucketing,
        restMinutes: tx.restMinutes,
        deposits,
      }),
    [tx.plan, tx.bucketing, tx.restMinutes, deposits],
  );

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">AIRLOCK</span>
        </div>
        <div className="top-right">
          <span className="badge badge-net mono">MAINNET</span>
          <button type="button" className="btn" disabled>
            Connect wallet
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <span className="pill">
            <IconShield /> RFP-09 · cross-chain privacy
          </span>
          <h1>Private across chains — with the leaks named out loud.</h1>
          <p className="hero-sub">
            Bridge in, hold private, withdraw somewhere else. Airlock shows the
            anonymity set you are actually hiding in and refuses to call a
            distinctive amount private.
          </p>
        </section>

        <div className="grid grid-main">
          <TransferPanel onChange={onChange} />
          <PrivacyReport
            report={report}
            fromName={byId(tx.fromId).name}
            toName={byId(tx.toId).name}
          />
        </div>

        <div className="grid">
          <AnonymityPanel state={anon} />

          <section className="card" aria-labelledby="pub-h">
            <header className="card-h">
              <h2 id="pub-h">What is hidden, and what is not</h2>
              <span className="card-h-note">no overclaiming</span>
            </header>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Public</th>
                    <th>Private</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Deposit address, token, amount</td>
                    <td>Which deposit a withdrawal came from</td>
                  </tr>
                  <tr>
                    <td>Withdrawal destination and amount</td>
                    <td>Note-to-note transfers: amounts and parties</td>
                  </tr>
                  <tr>
                    <td>Timing of every leg</td>
                    <td>Your identity inside the proof</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="muted sm">
              Shielding is not private — <em>what you do afterwards</em> is. The
              auditor holds an escrowed viewing key and can de-anonymize the
              Starknet side; that is a tradeoff STRK20 makes deliberately, and it
              is why this is a privacy tool rather than a mixer.
            </p>
          </section>
        </div>

        <Steps />
      </main>

      <footer className="bottom">
        <span>
          Airlock · built on the{' '}
          <a
            href="https://github.com/starkware-libs/starknet-privacy"
            target="_blank"
            rel="noreferrer"
          >
            STRK20 privacy pool
          </a>
        </span>
        <span className="mono muted">pool 0x040337b1…812a</span>
      </footer>
    </div>
  );
}
