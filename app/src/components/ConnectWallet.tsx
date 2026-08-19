/* Wallet picker and connected-account pill.
 *
 * The picker lists what the browser actually has rather than a catalogue of
 * wallets to install — a list of things you do not have is not a choice. When
 * nothing is detected it says so and links the two wallets that work.
 */

import { useEffect, useRef } from 'react';
import type { WalletSession } from '../hooks/useWallet';
import type { Wallet } from '../lib/wallet';
import { STRK20_MIN_READY, isBelow, isFirefox, rescanWallets, short } from '../lib/wallet';
import { NETWORKS } from '../lib/networks';
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

  /* Ask again every time the picker opens. Someone who installs a wallet and
     comes back to a tab that was already open is long past the discovery
     window, and "reload the page" is asking them to work around our timing. */
  useEffect(() => {
    if (open) rescanWallets();
  }, [open]);

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
    const ok = conn.network !== undefined && conn.support.kind === 'ready';
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

  if (conn.support.kind === 'unsupported') {
    /* The version is the whole message. "This wallet can't do STRK20" leaves
       someone with nowhere to go; "you have 5.31.0, you need 5.33.8" is a
       thing they can act on in a minute. */
    const v = conn.walletVersion;
    const outdated = v !== undefined && isBelow(v, STRK20_MIN_READY);
    return (
      <p className="notice notice-blocked sm" role="status">
        <strong>This wallet can't make private transfers yet.</strong> It
        connected fine — it just doesn't answer the STRK20 calls, so there is
        nothing here it can move.{' '}
        {outdated && isFirefox() ? (
          <>
            You're on <strong>{conn.wallet.name} {v}</strong> and this needs{' '}
            <strong>{STRK20_MIN_READY}</strong> — but Firefox's build stops at
            5.30.0, so there is no update to install here. Ready ships{' '}
            {STRK20_MIN_READY} on Chrome, Brave and Edge.{' '}
            <a
              href="https://chromewebstore.google.com/detail/ready-wallet-formerly-arg/dlcobpjiigpikoobohmabehhmhfoodbb"
              target="_blank"
              rel="noreferrer"
            >
              Open this page in one of those
            </a>{' '}
            with Ready installed.
          </>
        ) : outdated ? (
          <>
            You're on <strong>{conn.wallet.name} {v}</strong>, and this needs{' '}
            <strong>{STRK20_MIN_READY}</strong> or newer.{' '}
            <a href="https://www.ready.co/" target="_blank" rel="noreferrer">
              Update it
            </a>{' '}
            and reconnect.
          </>
        ) : (
          <>
            {v !== undefined && (
              <>
                You're on {conn.wallet.name} <span className="mono">{v}</span>.{' '}
              </>
            )}
            Private transfers need Ready {STRK20_MIN_READY} or newer; other
            wallets are still adding support.
          </>
        )}{' '}
        <span className="muted">({conn.support.message})</span>
      </p>
    );
  }

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

/* The network badge, which is also the network switch.
 *
 * It was a hardcoded "MAINNET" — a lie the moment anyone connects a wallet
 * pointed elsewhere, and the one thing a user must be certain of before signing.
 * Now it reports what the wallet actually said, and clicking it moves.
 *
 * Only offered when there is somewhere useful to go: a network Airlock has
 * addresses for AND an anonymizer deployed on. Offering a switch to a chain
 * where nothing works would just relocate the dead end.
 */
export function NetworkBadge({ session }: { session: WalletSession }) {
  if (session.state.phase !== 'connected') {
    return <span className="badge badge-net mono">NOT CONNECTED</span>;
  }
  const { network, chainId, wallet } = session.state.conn;
  const { switchTo, switching } = session;

  const label = network
    ? network.name.replace(/^Starknet ?/, '').toUpperCase() || 'MAINNET'
    : 'UNKNOWN CHAIN';

  /* Where a click should lead: the first network with a deployment that is not
     the one we are on. Today that is Sepolia; when mainnet has one, this starts
     offering the way back without any change here. */
  const target = NETWORKS.find(
    (n) => n.bucketers.length > 0 && n.chainId !== chainId,
  );

  if (!target) {
    return (
      <span className="badge badge-net mono" title={chainId}>
        {label}
      </span>
    );
  }

  const to = target.name.replace(/^Starknet ?/, '') || 'Mainnet';
  return (
    <button
      type="button"
      className="badge badge-net badge-switch mono"
      onClick={() => void switchTo(target.chainId)}
      disabled={switching}
      title={`${wallet.name} is on ${label.toLowerCase()} — switch to ${to}`}
    >
      {switching ? 'SWITCHING…' : label}
      {!switching && <span className="badge-to">→ {to.toUpperCase()}</span>}
    </button>
  );
}

