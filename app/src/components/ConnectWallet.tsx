/* Wallet picker and connected-account pill.
 *
 * The picker lists what the browser actually has rather than a catalogue of
 * wallets to install — a list of things you do not have is not a choice. When
 * nothing is detected it says so and links the two wallets that work.
 */

import { useEffect, useRef } from 'react';
import type { WalletSession } from '../hooks/useWallet';
import type { Wallet } from '../lib/wallet';
import { short } from '../lib/wallet';
import { IconWallet } from './Icons';

/* Open state is owned by the page, because the primary CTA in the transfer card
   opens this same picker. Two buttons, one dialog. */
export function ConnectWallet({
  session,
  open,
  setOpen,
}: {
  session: WalletSession;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  const { state, wallets, connect, disconnect } = session;
  const connecting = state.phase === 'connecting';

  useEffect(() => {
    if (state.phase === 'connected') setOpen(false);
  }, [state.phase, setOpen]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !connecting) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, connecting, setOpen]);

  if (state.phase === 'connected') {
    const { conn } = state;
    /* The dot carries the state the address cannot: connected is not the same
       as usable, and a wallet on the wrong network or without STRK20 support
       should not look identical to one that is ready. */
    const ok = conn.onMainnet && conn.support.kind === 'ready';
    return (
      <button
        type="button"
        className="addr-pill"
        onClick={disconnect}
        title={`${conn.address} — click to disconnect`}
      >
        <span className={`addr-dot${ok ? ' addr-dot-ok' : ' addr-dot-warn'}`} />
        <span className="mono">{short(conn.address)}</span>
        <span className="addr-off">Disconnect</span>
      </button>
    );
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <IconWallet /> Connect wallet
      </button>

      {open && (
        <div
          className="sheet-bg"
          onClick={() => !connecting && setOpen(false)}
          role="presentation"
        >
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wsel-h"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sheet-h">
              <h2 id="wsel-h">Connect a wallet</h2>
              <button
                ref={closeRef}
                type="button"
                className="sheet-x"
                onClick={() => setOpen(false)}
                disabled={connecting}
                aria-label="Close"
              >
                &times;
              </button>
            </header>

            {wallets.length > 0 && (
              <ul className="wlist">
                {wallets.map((w: Wallet) => (
                  <li key={w.name}>
                    <button
                      type="button"
                      className="wrow"
                      onClick={() => connect(w)}
                      disabled={connecting}
                    >
                      <img className="wicon" src={w.icon} alt="" />
                      <span className="wname">{w.name}</span>
                      <span className="wgo">
                        {connecting && state.name === w.name ? 'connecting…' : '→'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <MissingWallets found={wallets} />

            {wallets.length === 0 && (
              <p className="sm muted">
                No Starknet wallet found in this browser yet. If you have just
                installed one, it will appear here on its own.
              </p>
            )}

            {state.phase === 'error' && (
              <p className="notice notice-blocked sm" role="alert">
                {state.message}
              </p>
            )}

            <p className="muted sm">
              Your viewing key stays in your wallet. Airlock never sees it — the
              wallet does the proving.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/* The wallets that can actually do this, and where to get them.
 *
 * A picker can only list what the browser has injected — no discovery library
 * can show a wallet that is not installed, and swapping ours would not have
 * changed that. What it CAN do is stop being silent about it: someone whose
 * picker shows only MetaMask has no way to know the two wallets that do private
 * transfers on Starknet exist at all.
 *
 * Names are matched loosely because a wallet's advertised name is its own
 * business and has already changed once — Argent X became Ready — so an exact
 * match would quietly start recommending an install the user already has.
 */
const PRIVACY_WALLETS = [
  {
    name: 'Ready',
    match: /ready|argent/i,
    url: 'https://www.ready.co/',
    note: 'private transfers, 5.33.8+',
  },
  {
    name: 'Braavos',
    match: /braavos/i,
    url: 'https://braavos.app/',
    note: 'Starknet wallet',
  },
  {
    name: 'Xverse',
    match: /xverse/i,
    url: 'https://www.xverse.app/',
    note: 'private transfers',
  },
] as const;

function MissingWallets({ found }: { found: Wallet[] }) {
  const missing = PRIVACY_WALLETS.filter(
    (p) => !found.some((w) => p.match.test(w.name)),
  );
  if (missing.length === 0) return null;

  return (
    <div className="wmissing">
      <p className="sm muted">
        {found.length > 0 ? 'Not installed:' : 'Wallets that support this:'}
      </p>
      <ul className="wlist">
        {missing.map((p) => (
          <li key={p.name}>
            <a className="wrow wrow-get" href={p.url} target="_blank" rel="noreferrer">
              <span className="wname">{p.name}</span>
              <span className="sm muted">{p.note}</span>
              <span className="wgo">install ↗</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Everything the connection cannot do, said once, at the top.
 *
 * Each of these was a real dead end during development, and none of them
 * announce themselves — a wallet that cannot do STRK20 connects perfectly and
 * then fails at the one thing you wanted. So each notice says what happened,
 * why, and the single next thing to do. No jargon the user did not choose:
 * "viewing key" is unavoidable because it is what the wallet's own screen calls
 * it, but "nullifier" and "UTXO" are ours to keep out of their way.
 */
export function WalletNotice({ session }: { session: WalletSession }) {
  if (session.state.phase !== 'connected') return null;
  const { conn } = session.state;

  /* Was `!conn.onMainnet`, which started telling people to switch to mainnet
     while they were on Sepolia — a network Airlock now fully supports, and the
     one the anonymizer is actually deployed on. The real question is whether we
     have addresses for this chain, not whether it is mainnet. */
  if (!conn.network)
    return (
      <p className="notice notice-leak sm" role="status">
        <strong>Airlock doesn't know this network.</strong> Switch your wallet to
        Starknet mainnet or Sepolia and it will pick up from there.
      </p>
    );

  if (conn.support.kind === 'unsupported')
    return (
      <p className="notice notice-blocked sm" role="status">
        <strong>This wallet can't make private transfers.</strong> It connected
        fine — it just doesn't support STRK20 yet, so there's nothing here it can
        move. Ready 5.33.8 and newer do. (It answered:{' '}
        <span className="mono">{conn.support.message}</span>.)
      </p>
    );

  if (conn.support.kind === 'unregistered')
    return (
      <p className="notice notice-leak sm" role="status">
        <strong>This account isn't set up for private balances yet.</strong> An
        account registers with the pool once, the first time it shields
        something, and your wallet handles that for you. Shield any amount from
        your wallet's privacy screen and your balance will show up here.
      </p>
    );

  if (conn.support.kind === 'unknown')
    return (
      <p className="notice notice-leak sm" role="status">
        <strong>Couldn't read your private balance.</strong> The wallet is
        connected, so this is worth retrying before anything else.{' '}
        <span className="mono">{conn.support.message}</span>
      </p>
    );

  return null;
}

/* The network badge was a hardcoded "MAINNET", which is a lie the moment anyone
   connects a wallet pointed elsewhere — and the one thing a user needs to be
   certain of before signing. It now reports what the wallet actually said, and
   says so plainly when that is a chain Airlock has no addresses for. */
export function NetworkBadge({ session }: { session: WalletSession }) {
  if (session.state.phase !== 'connected') {
    return <span className="badge badge-net mono">NOT CONNECTED</span>;
  }
  const { network, chainId } = session.state.conn;
  if (!network) {
    return <span className="badge badge-net mono" title={chainId}>UNKNOWN CHAIN</span>;
  }
  return (
    <span className="badge badge-net mono">
      {network.name.replace(/^Starknet ?/, '').toUpperCase() || 'MAINNET'}
    </span>
  );
}
