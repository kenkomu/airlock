/* What the connected account actually holds, private and public side by side.
 *
 * Two reasons this exists.
 *
 * First, clicking the account pill used to disconnect immediately. That is a
 * destructive action on the control people reach for when they want to *look*
 * at something, and it offers no warning and no undo.
 *
 * Second, and more to the point: a privacy tool that only ever shows the
 * shielded number lets you forget how much you are still exposing. The two
 * columns here are the product. Anyone reading the chain can see the public
 * one; nobody can see the other. Putting them next to each other is the only
 * honest way to show a balance in an app like this.
 */

import { useEffect, useState } from 'react';
import {
  formatUnits,
  publicBalances,
  type Connection,
  type ShieldedBalance,
} from '../lib/wallet';
import { contractUrl } from '../lib/networks';
import { IconLock, IconWallet } from './Icons';

export function AccountSheet({
  conn,
  shielded,
  onClose,
  onDisconnect,
}: {
  conn: Connection;
  shielded: ShieldedBalance[];
  onClose: () => void;
  onDisconnect: () => void;
}) {
  const [pub, setPub] = useState<ShieldedBalance[] | null>(null);
  const [copied, setCopied] = useState(false);

  /* Public balances are a plain chain read — no wallet, no signature, no cost.
     Only the tokens this deployment knows about, since a full token scan is a
     different feature and a slower one. */
  useEffect(() => {
    let cancelled = false;
    const tokens = conn.network?.bucketers.map((b) => ({
      token: b.token,
      symbol: b.symbol,
      decimals: b.decimals,
    }));
    if (!tokens?.length) return setPub([]);
    publicBalances(conn.provider, conn.address, tokens)
      .then((b) => !cancelled && setPub(b))
      .catch(() => !cancelled && setPub([]));
    return () => {
      cancelled = true;
    };
  }, [conn]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(conn.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard is permission-gated and can simply refuse. The address is
         displayed in full above, so there is always a way to get it. */
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acct-h"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-h">
          <h2 id="acct-h">Your account</h2>
          <button type="button" className="sheet-x" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </header>

        <div className="acct-id">
          <span className="field-l">
            {conn.wallet.name}
            {conn.walletVersion ? ` ${conn.walletVersion}` : ''} ·{' '}
            {conn.network?.name ?? 'unknown network'}
          </span>
          <button type="button" className="acct-addr mono" onClick={copy} title="Copy address">
            {conn.address}
            <span className="acct-copy">{copied ? 'copied' : 'copy'}</span>
          </button>
        </div>

        {/* Private first: it is the balance this app is about. */}
        <BalanceGroup
          title="Private"
          hint="Held as notes in the pool. Not visible to anyone reading the chain."
          icon={<IconLock />}
          rows={shielded}
          empty={
            conn.support.kind === 'unregistered'
              ? 'Nothing yet — this account has not shielded anything.'
              : 'Nothing shielded.'
          }
        />

        <BalanceGroup
          title="Public"
          hint="Ordinary on-chain balance. Anyone can read this, including the amount."
          icon={<IconWallet />}
          rows={pub ?? []}
          loading={pub === null}
          empty="Nothing held publicly."
        />

        {conn.network && (
          <p className="muted sm">
            <a
              className="d-link mono"
              href={contractUrl(conn.network, conn.address)}
              target="_blank"
              rel="noreferrer"
            >
              View on {conn.network.explorer.replace(/^https:\/\//, '')} ↗
            </a>
          </p>
        )}

        <button type="button" className="btn" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    </div>
  );
}

function BalanceGroup({
  title,
  hint,
  icon,
  rows,
  loading,
  empty,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  rows: ShieldedBalance[];
  loading?: boolean;
  empty: string;
}) {
  /* A zero balance is noise in a list someone is scanning for what they have. */
  const held = rows.filter((r) => r.amount > 0n);
  return (
    <section className="acct-group">
      <div className="acct-group-h">
        {icon}
        <strong>{title}</strong>
      </div>
      <p className="muted sm">{hint}</p>
      {loading ? (
        <p className="muted sm">Reading…</p>
      ) : held.length === 0 ? (
        <p className="muted sm">{empty}</p>
      ) : (
        <ul className="toklist">
          {held.map((r) => (
            <li className="tokrow tokrow-thin" key={`${title}-${r.token}`}>
              <span className="tokrow-sym">{r.symbol}</span>
              <span className="tokrow-val mono">
                {formatUnits(r.amount, r.decimals, r.decimals > 6 ? 4 : 2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
