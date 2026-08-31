/* Wallet picker and connected-account pill.
 *
 * The picker lists what the browser actually has rather than a catalogue of
 * wallets to install — a list of things you do not have is not a choice. When
 * nothing is detected it says so and links the two wallets that work.
 */

import { useEffect, useRef, useState } from 'react';
import type { WalletSession } from '../hooks/useWallet';
import type { Wallet } from '../lib/wallet';
import { STRK20_MIN_READY, isBelow, isFirefox, rescanWallets, short } from '../lib/wallet';
import { NETWORKS } from '../lib/networks';
import { IconWallet } from './Icons';
import { AccountSheet } from './AccountSheet';
import { EvmDoor } from './EvmDoor';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { EvmIdentitySession } from '../hooks/useEvmIdentity';
import { shortAddress } from '../lib/identity';
import { walletRows } from '../lib/walletRows';

/* Open state is owned by the page, because the primary CTA in the transfer card
   opens this same picker. Two buttons, one dialog. */
export function ConnectWallet({
  session,
  evmSession,
  open,
  setOpen,
}: {
  session: WalletSession;
  evmSession: EvmIdentitySession;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  const { state, wallets: allWallets, connect, disconnect } = session;
  const connecting = state.phase === 'connecting';

  /* A wallet that the EVM side also announced belongs to the second door, not
     this list.
     *
     * Starknet discovery wraps EIP-1193 wallets as "virtual" Starknet wallets,
     * which is why MetaMask shows up here at all. Before the second door existed
     * that was the right call — `wallet.ts` records the reasoning, that a wallet
     * you have installed and cannot see is worse than one that asks a question.
     * Now it is actively wrong: the same name appears twice in one sheet, and
     * the copy at the top is the one that dead-ends on "this wallet does not
     * speak STRK20 yet" while the copy at the bottom works.
     *
     * So the wallet stays visible — the old reasoning is satisfied — but only in
     * the section where clicking it leads somewhere.
     *
     * Matched on name because that is what both discovery paths agree on; the
     * Starknet side has no rdns to compare. If a wallet ever speaks both STRK20
     * and EIP-1193, this would hide it from the door where it is stronger, and
     * would need the STRK20 probe to decide instead. None does today. */
  const evmNames = new Set(evmSession.wallets.map((w) => w.info.name.toLowerCase()));
  const wallets = allWallets.filter((w) => !evmNames.has(w.name.toLowerCase()));

  /* Both kinds of wallet as one list of rows.
   *
   * Starknet wallets come first because they are the stronger option, and
   * ordering is how that gets said now that the headings are gone.
   *
   * The tag is the compressed form of the caveat that used to be a paragraph.
   * "Keys stay in wallet" versus "Keys made in browser" is the entire privacy
   * difference in three words, on the row where the choice is made — which is
   * both shorter and better placed than the prose it replaces. */
  /* Rows are built by `walletRows`, which owns the ordering and the tag rule
     and is tested directly — driving this through a browser needs a fake
     wallet-standard handshake that would not reliably register, so the mixed
     case could not be verified here. */
  const rows = walletRows(wallets, evmSession.wallets.map((w) => w.info)).map((row) => ({
    ...row,
    onPick: () =>
      row.kind === 'starknet'
        ? void connect(wallets[row.index])
        : void evmSession.connect(evmSession.wallets[row.index]),
  }));

  /* Only while the picker is actually open — the markup below is unmounted when
     it is not, but the flag keeps the trap from arming on a stale ref. */
  useFocusTrap(dialogRef, open);

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
      /* The panel is anchored to this button rather than floating in the middle
         of the screen. It is about the account named on the pill, and a centred
         modal breaks that link — you lose which thing you opened, and the page
         behind goes dark for a panel that is only ever read, never filled in. */
      <div className="addr-anchor">
        {/* Opens the account, rather than disconnecting. Clicking the thing you
            want to LOOK at should not destroy it — disconnect lives inside,
            where it is a deliberate choice instead of a misfire. */}
        <button
          type="button"
          className="addr-pill"
          onClick={() => setAccountOpen((v) => !v)}
          aria-expanded={accountOpen}
          aria-haspopup="dialog"
          title={`${conn.address} — balances and details`}
        >
          <span className={`addr-dot${ok ? ' addr-dot-ok' : ' addr-dot-warn'}`} />
          <span className="mono">{short(conn.address)}</span>
          <span className={`addr-caret${accountOpen ? ' addr-caret-up' : ''}`} aria-hidden="true" />
        </button>
        {accountOpen && (
          <AccountSheet
            conn={conn}
            shielded={session.balances}
            onClose={() => setAccountOpen(false)}
            onDisconnect={() => {
              setAccountOpen(false);
              disconnect();
            }}
          />
        )}
      </div>
    );
  }

  /* Connected through the other door.
     *
     * The header was showing an account badge AND a "Connect wallet" button at
     * the same time, which reads as a contradiction: one says you are in, the
     * other says you are not. This branch mirrors what the Starknet door does —
     * the button becomes the account, and opening it is how you reach the
     * details and the way out. */
  /* The identity itself, not a boolean — a flag does not narrow the union, so
     the fields below would be unreachable to the type checker. */
  const evmIdentity =
    evmSession.state.phase === 'ready' ? evmSession.state.identity : null;

  return (
    <>
      {evmIdentity ? (
        <button
          type="button"
          className="addr-pill"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          title={`${evmIdentity.starknetAddress} — your derived account`}
        >
          {/* Amber, not green: this account is derived in the browser and is not
              active until its first deposit. The dot is the one place that
              difference is visible at a glance from anywhere on the page. */}
          <span className="addr-dot addr-dot-warn" />
          <span className="mono">{shortAddress(evmIdentity.starknetAddress)}</span>
        </button>
      ) : (
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          <IconWallet /> Connect wallet
        </button>
      )}

      {open && (
        <div
          className="sheet-bg"
          onClick={() => !connecting && setOpen(false)}
          role="presentation"
        >
          <div
            ref={dialogRef}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wsel-h"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sheet-h">
              {/* The pill opens this sheet to SHOW an account, and the heading
                  said "Connect a wallet" over the address the user came to
                  look at — asking again for the thing already done. It names
                  what is on screen instead. */}
              <h2 id="wsel-h">{evmIdentity ? 'Your account' : 'Connect a wallet'}</h2>
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

            {/* One list, not two sections.
                *
                It was two, each with its own heading and its own paragraph, and
                the result did not fit on screen — a wall of prose to scroll
                before reaching the wallet you already knew you wanted. Users
                pick a wallet by its logo; everything else was in the way.
                *
                What could NOT be dropped is that the two kinds have different
                privacy properties. That is the product's whole argument. So it
                survives as three words per row, and the full explanation moves
                to the moment it is actionable — the confirm step after choosing
                an EVM wallet, where it is read instead of scrolled past. */}
            {evmSession.state.phase !== 'idle' ? (
              <EvmDoor
                session={evmSession}
                busy={connecting}
                onDone={() => {
                  setOpen(false);
                  /* Take them to the panel rather than leaving them to find it.
                     The sheet closes onto a page they have not scrolled, and the
                     thing they just set up an account for is below the fold. */
                  document
                    .querySelector('.next-up')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              />
            ) : (
              <>
                {rows.length > 0 && (
                  <ul className="wlist">
                    {rows.map((row) => (
                      <li key={row.key}>
                        <button
                          type="button"
                          className="wrow"
                          onClick={row.onPick}
                          disabled={connecting}
                        >
                          {row.icon ? (
                            <img className="wicon" src={row.icon} alt="" />
                          ) : (
                            <span className="wicon" aria-hidden="true" />
                          )}
                          <span className="wname">{row.name}</span>
                          {row.tag && <span className="wtag">{row.tag}</span>}
                          <span className="wgo">
                            {connecting && state.name === row.name ? '…' : '→'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {rows.length === 0 && (
                  <p className="sm muted">
                    No wallet found in this browser. Install one and it appears
                    here on its own.
                  </p>
                )}

                {state.phase === 'error' && (
                  <p className="notice notice-blocked sm" role="alert">
                    {state.message}
                  </p>
                )}

                <MissingWallets found={wallets} />
              </>
            )}
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
    (p) => !found.some((p2) => p.match.test(p2.name)),
  );
  if (missing.length === 0) return null;

  /* One quiet line, not a second list of rows.
     *
     * These used to render as full-height dashed rows, which gave a wallet you
     * do not have the same visual weight as one you could click right now, and
     * pushed the real choices off screen. A wallet you would have to go and
     * install is a footnote. */
  return (
    <p className="sm muted wmissing">
      Don't have one?{' '}
      {missing.map((p, i) => (
        <span key={p.name}>
          {i > 0 && ' · '}
          <a href={p.url} target="_blank" rel="noreferrer">
            {p.name}
          </a>
        </span>
      ))}
    </p>
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
 * pointed elsewhere, and the one thing a user must be certain of before
 * signing. Now it reports what the wallet said, and clicking it moves.
 *
 * An earlier version only offered networks that had an anonymizer deployed, on
 * the reasoning that sending someone to a dead end is unhelpful. That made the
 * badge inert on Sepolia, because mainnet has no deployment yet — so a control
 * that had just worked stopped working, with nothing to explain why. A switch
 * that sometimes silently is not a switch is worse than one that occasionally
 * takes you somewhere unfinished. It now always moves; whether the destination
 * has an anonymizer is said out loud instead.
 */
export function NetworkBadge({
  session,
  evmSession,
}: {
  session: WalletSession;
  evmSession?: EvmIdentitySession;
}) {
  if (session.state.phase !== 'connected') {
    /* The other door counts as connected too.
       *
       * This read only the Starknet session, so someone who came in through the
       * any-chain door — derived an account, saw its address, ready to move
       * money — was told NOT CONNECTED by the header the whole time. The badge
       * is the page's answer to "am I in?", and it was answering about the
       * wrong door. */
    if (evmSession?.state.phase === 'ready') {
      /* The network, not the address. This badge answers "which chain" for the
         Starknet door while the button beside it carries the account — showing
         the address in both put the same string twice in one corner and left
         no room for the question the badge exists to answer. The derived
         account lives on Starknet mainnet by construction. */
      return <span className="badge badge-net mono">MAINNET</span>;
    }
    return <span className="badge badge-net mono">NOT CONNECTED</span>;
  }
  const { network, chainId, wallet } = session.state.conn;
  const { switchTo, switching } = session;

  const shortName = (n: { name: string }) =>
    n.name.replace(/^Starknet ?/, '') || 'Mainnet';

  const label = network ? shortName(network).toUpperCase() : 'UNKNOWN CHAIN';

  /* With two networks this is a toggle. Written as "the next one along" so a
     third network needs no change here. */
  const i = NETWORKS.findIndex((n) => BigInt(n.chainId) === BigInt(chainId));
  const target = NETWORKS[(i + 1) % NETWORKS.length];

  if (!target || (i >= 0 && NETWORKS.length < 2)) {
    return (
      <span className="badge badge-net mono" title={chainId}>
        {label}
      </span>
    );
  }

  const to = shortName(target);
  const ready = target.bucketers.length > 0;
  return (
    <button
      type="button"
      className="badge badge-net badge-switch mono"
      onClick={() => void switchTo(target.chainId)}
      disabled={switching}
      title={
        `${wallet.name} is on ${label.toLowerCase()}. Switch to ${to}` +
        (ready ? '.' : ' — no anonymizer deployed there yet.')
      }
    >
      {switching ? 'SWITCHING…' : label}
      {!switching && (
        <span className="badge-to">
          → {to.toUpperCase()}
          {!ready && <span className="badge-warn"> ·</span>}
        </span>
      )}
    </button>
  );
}


