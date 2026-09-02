import { useCallback, useMemo, useState } from 'react';
import './App.css';
import { TransferPanel, type TransferState } from './components/TransferPanel';
import { More } from './components/More';
import { PrivacyReport } from './components/PrivacyReport';
import { AnonymityPanel } from './components/AnonymityPanel';
import { Steps } from './components/Steps';
import { useAnonymitySet } from './hooks/useAnonymitySet';
import { assess } from './lib/exposure';
import { planBuckets } from './lib/buckets';
import { byId } from './lib/chains';
import { IconShield } from './components/Icons';
import { DenominatePanel } from './components/DenominatePanel';
import { ConnectWallet, WalletNotice, NetworkBadge } from './components/ConnectWallet';
import { useWallet } from './hooks/useWallet';
import { useEvmIdentity } from './hooks/useEvmIdentity';
import { Boundary } from './components/Boundary';
import { ThemeToggle } from './components/ThemeToggle';

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

  const session = useWallet();
  /* The second door. Owned here rather than inside the picker because the
     identity outlives the sheet — the sheet closes, the derived account stays,
     and the panels below need to read it. */
  const evmSession = useEvmIdentity();
  const [pickerOpen, setPickerOpen] = useState(false);

  /* One scan, shared by the report's crowd factor and the anonymity panel. */
  const anon = useAnonymitySet();
  const deposits = anon.phase === 'ready' ? anon.snap.deposits : null;
  /* The same scan answers "how big is the crowd" and "how common is this note
     size", so the split panel reads it from here rather than fetching its own.
     Two scans would be twice the RPC load and — worse — could disagree on one
     screen. */
  const sizes = anon.phase === 'ready' ? anon.snap.sizes : null;

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
          <ThemeToggle />
          <NetworkBadge session={session} evmSession={evmSession} />
          <ConnectWallet
            session={session}
            evmSession={evmSession}
            open={pickerOpen}
            setOpen={setPickerOpen}
          />
        </div>
      </header>

      <main>
        {/* Compact rather than a full hero: the app itself is the argument, and
            a judge scrolling past a billboard to reach it is a worse pitch. */}
        <section className="lede">
          <span className="pill">
            <IconShield /> RFP-09 · cross-chain privacy
          </span>
          <h1>Private across chains — with the leaks named out loud.</h1>
          <p className="lede-sub">
            Airlock shows the anonymity set you are actually hiding in, and
            refuses to call a distinctive amount private.
          </p>
        </section>

        <WalletNotice session={session} />

        {/* Order is the claim. What runs today comes first and carries the
            accent; the anonymity set is the evidence behind it; the cross-chain
            route is a design that does not execute yet and is labelled as such.

            It used to be the other way round. The bridge panel is the biggest,
            most finished-looking thing on the page and it sat directly under
            the headline, while the one feature that actually moves money was a
            two-line strip above it. Anyone skimming concluded the opposite of
            the truth about what works. */}
        <Boundary name="Denominate">
          <DenominatePanel
            session={session}
            evmSession={evmSession}
            onConnect={() => setPickerOpen(true)}
            sizes={sizes}
          />
        </Boundary>

        <Boundary name="Anonymity set">
          <AnonymityPanel state={anon} />
        </Boundary>

        {/* The status here is deliberately three-way, because "works" and
            "doesn't" would both be lies now.
            *
            Moving funds IN is built — deploy, register and deposit run from one
            press, funded out of what is being moved. It has not yet been run
            against a real chain, and code that has never executed is not a
            working feature no matter how complete it looks. Moving funds OUT is
            genuinely not built. Saying "not wired yet" over all of it now
            understates the app; saying it works would overstate it, which is
            the failure this project exists to avoid. */}
        <section className="next-up" aria-labelledby="prev-h">
          <div className="next-up-h">
            <h2 id="prev-h">Cross-chain routing</h2>
            <span className="next-up-tag">both built · neither proven</span>
          </div>
          <p className="next-up-sub">
            Both legs are built — in from another chain, and back out to an
            address you name. Neither has moved money on a real chain yet.
          </p>
          <More label="So what is real here?">
            The leak assessment on the right runs for real, on whatever you
            pick. It is the routing either side of it that is unproven, and it
            stays labelled that way until a transfer has landed.
          </More>

          {/* Transfer and its report are a pair and belong side by side: the
              report describes whatever the panel currently proposes. */}
          <div className="grid-main">
            <Boundary name="Move funds privately">
              <TransferPanel
                onChange={onChange}
                session={session}
                evmSession={evmSession}
                onConnect={() => setPickerOpen(true)}
              />
            </Boundary>
            <Boundary name="Privacy report">
              <PrivacyReport
                report={report}
                fromName={byId(tx.fromId).name}
                toName={byId(tx.toId).name}
              />
            </Boundary>
          </div>
        </section>

        {/* Reference material, deliberately without card chrome. Boxing it at
            the same weight as the app made every region look equally important,
            which is the same as none of them being. */}
        <section className="ref" aria-labelledby="ref-h">
          <h2 id="ref-h" className="ref-h">
            Reference
          </h2>
          <div className="ref-grid">
            <Steps />

            <section className="ref-block" aria-labelledby="pub-h">
              <h3 id="pub-h">What is hidden, and what is not</h3>
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
                Shielding is not private — <em>what you do afterwards</em> is.
                The auditor holds an escrowed viewing key and can de-anonymize
                the Starknet side; that is a tradeoff STRK20 makes deliberately,
                and it is why this is a privacy tool rather than a mixer.
              </p>
            </section>
          </div>
        </section>
      </main>

      {/* The page had exactly one link, and it pointed at StarkWare. Anyone
          evaluating this — or simply wanting to check a claim — had no route to
          the code, the deployed contract, or the transaction that proves it
          runs. Those are the three things worth linking, so they are here. */}
      <footer className="bottom">
        <nav className="foot-links" aria-label="Project links">
          <a href="https://github.com/kenkomu/airlock" target="_blank" rel="noreferrer">
            Source
          </a>
          <a
            href="https://voyager.online/contract/0x036816fe3c38b222e737ec4168b604309ab24154862d1a3f4c9db0042a90e97a"
            target="_blank"
            rel="noreferrer"
          >
            Anonymizer on mainnet
          </a>
          <a
            href="https://voyager.online/tx/0x03f52e1bddd716344f5dd3c43ba2b81eb1aefb0bc7791aba3e54051b40963a50"
            target="_blank"
            rel="noreferrer"
          >
            A real split, on mainnet
          </a>
          <a
            href="https://github.com/starkware-libs/starknet-privacy"
            target="_blank"
            rel="noreferrer"
          >
            STRK20 pool
          </a>
        </nav>
        <span className="mono muted">pool 0x040337b1…812a</span>
      </footer>
    </div>
  );
}
