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

import { useEffect, useRef, useState } from 'react';
import {
  formatUnits,
  publicBalances,
  type Connection,
  type ShieldedBalance,
} from '../lib/wallet';
import { contractUrl, txUrl } from '../lib/networks';
import { ago, splitsFor, type Split } from '../lib/history';
import { IconLock, IconWallet } from './Icons';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { ShieldForm } from './ShieldForm';

export function AccountSheet({
  conn,
  shielded,
  onClose,
  onDisconnect,
  onShielded,
}: {
  conn: Connection;
  shielded: ShieldedBalance[];
  onClose: () => void;
  onDisconnect: () => void;
  onShielded: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const [pub, setPub] = useState<ShieldedBalance[] | null>(null);
  /* Distinct from an empty list. "We looked and found nothing" and "we could
     not look" are different facts, and only one of them is reassuring. */
  const [pubFailed, setPubFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  /* The largest shielded holding is the card's number; everything else is
     listed under it. Split here so neither can print the other's figure. */
  const [lead, ...others] = [...shielded]
    .filter((b) => b.amount > 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));

  /* Read once per open. It is local storage, so there is nothing to await and
     nothing to re-read while the sheet is up. */
  const [splits] = useState<Split[]>(() =>
    conn.network ? splitsFor(conn.address, conn.network.chainId) : [],
  );

  /* Public balances are a plain chain read — no wallet, no signature, no cost.
     Only the tokens this deployment knows about, since a full token scan is a
     different feature and a slower one. */
  useEffect(() => {
    let cancelled = false;
    setPub(null);
    setPubFailed(false);
    /* Read the chain's token list, NOT the bucketer list. Deriving it from
       bucketers meant mainnet — which has none yet — skipped the read entirely
       and then displayed the empty state, telling someone holding 24 STRK in
       the open that they held nothing publicly. */
    const tokens = conn.network?.tokens.map((t) => ({
      token: t.address,
      symbol: t.symbol,
      decimals: t.decimals,
    }));
    if (!tokens?.length) {
      setPubFailed(true);
      return setPub([]);
    }
    publicBalances(conn.provider, conn.address, tokens)
      .then((b) => !cancelled && setPub(b))
      .catch(() => {
        if (cancelled) return;
        setPubFailed(true);
        setPub([]);
      });
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
    <>
      {/* An invisible catcher rather than a dimming backdrop. Clicking away
          should close the panel, but darkening the whole page for something you
          only read — never fill in — overstates what is happening. */}
      <div className="pop-catch" onClick={onClose} role="presentation" />
      <div
        ref={dialogRef}
        className="pop"
        role="dialog"
        aria-labelledby="acct-h"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="acct-h" className="sr-only">
          Your account
        </h2>

        {/* A card, because that is what this is: an account, a balance, and an
            identifying number. The metaphor is borrowed from the object people
            already read this information off.
            
            What it does NOT borrow is the usual crypto-card look — the gradient
            mesh, the holographic sheen. Airlock's whole argument is that it does
            not dress things up, and a balance that is genuinely hidden should
            not be presented like a luxury object. The seal at the top is the
            project's own mechanism, and the number below is the one the pool
            actually holds. */}
        <div className="wcard">
          <div className="wcard-top">
            <span className="wcard-seal" aria-hidden="true">
              <IconLock />
            </span>
            <span className="wcard-issuer">
              {conn.wallet.name}
              {conn.walletVersion ? ` ${conn.walletVersion}` : ''}
            </span>
            <span className={`wcard-net${conn.network ? '' : ' pop-meta-warn'}`}>
              {conn.network?.name ?? 'unknown network'}
            </span>
          </div>

          <div className="wcard-bal">
            {lead ? (
              <>
                <span className="wcard-bal-v mono">
                  {formatUnits(lead.amount, lead.decimals, lead.decimals > 6 ? 4 : 2)}
                </span>
                <span className="wcard-bal-sym">{lead.symbol}</span>
              </>
            ) : (
              <span className="wcard-bal-none">Nothing shielded yet</span>
            )}
          </div>
          <span className="wcard-bal-k">Private balance · held as notes in the pool</span>

          {/* Grouped like the number on a card, which is the reason cards group
              theirs: 64 unbroken hex characters cannot be read back or checked
              against another screen. */}
          <button type="button" className="wcard-num mono" onClick={copy} title="Copy address">
            {conn.address.replace(/^0x/, '').match(/.{1,8}/g)?.map((g, i) => (
              <span className="wcard-grp" key={i}>
                {g}
              </span>
            ))}
            <span className="wcard-copy">{copied ? 'copied' : 'copy'}</span>
          </button>
        </div>

        {/* Private leads, and its largest holding is the headline rather than a
            row in a list — it is the number the panel is opened for. It used to
            be printed twice, once as a heading and again in the list under it. */}
        {/* Only what the card does not already show. The card carries the
            largest private holding, so repeating it here would print the same
            number twice on one panel — which is the bug this replaced, and it
            came back the moment the card took over the headline. */}
        {others.length > 0 && (
          <BalanceGroup
            title="Other private tokens"
            hint="Also held as notes in the pool."
            icon={<IconLock />}
            rows={others}
            empty=""
          />
        )}

        {!lead && conn.support.kind !== 'unregistered' && (
          <p className="muted sm">Nothing shielded.</p>
        )}

        {/* Directly under the finding it answers. Someone who has just read
            "Nothing shielded yet" should not have to go looking for the
            control that changes it, or leave for another application. */}
        {pub && pub.some((b) => b.amount > 0n) && (
          <ShieldForm conn={conn} pub={pub} onShielded={onShielded} />
        )}

        <BalanceGroup
          title="Public"
          hint="Ordinary on-chain balance. Anyone can read this, including the amount."
          icon={<IconWallet />}
          rows={pub ?? []}
          loading={pub === null}
          empty={
            pubFailed
              ? 'Could not read your public balance — this is not a claim that you hold nothing.'
              : 'Nothing held publicly, of the tokens Airlock knows about.'
          }
        />

        {conn.network && splits.length > 0 && (
          <section className="acct-group">
            <div className="acct-group-h">
              <IconLock />
              <strong>Your splits</strong>
            </div>
            <p className="muted sm">
              Kept in this browser only, never sent anywhere. A record of your
              splits is exactly what an observer would want, so it does not leave
              your machine.
            </p>
            <ul className="splitlist">
              {splits.map((sp) => (
                <li className="splitrow" key={sp.hash}>
                  <div className="splitrow-top">
                    <span className="mono">
                      {formatUnits(BigInt(sp.amount), sp.decimals, sp.decimals > 6 ? 4 : 2)}{' '}
                      {sp.symbol}
                    </span>
                    <span className="muted sm">{ago(sp.at)}</span>
                  </div>
                  <div className="split-row">
                    {sp.legs.map((l, i) => (
                      <span className="leg" key={i}>
                        {formatUnits(BigInt(l), sp.decimals, sp.decimals > 6 ? 4 : 2)}
                      </span>
                    ))}
                  </div>
                  <a
                    className="tx-link mono"
                    href={txUrl(conn.network!, sp.hash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {sp.hash.slice(0, 10)}…{sp.hash.slice(-4)} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {conn.network && (
          <p className="muted sm">
            <a
              className="tx-link"
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
    </>
  );
}

function BalanceGroup({
  title,
  hint,
  icon,
  rows,
  loading,
  empty,
  lead,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  rows: ShieldedBalance[];
  loading?: boolean;
  empty: string;
  /* Render the largest holding at display size. One group gets this — the one
     the panel exists to show. */
  lead?: boolean;
}) {
  /* A zero balance is noise in a list someone is scanning for what they have. */
  const held = rows.filter((r) => r.amount > 0n);
  /* Biggest first, so the lead row is the meaningful one and the list below
     reads in descending order like every other balance list. */
  const sorted = [...held].sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
  const [top, ...rest] = sorted;

  if (lead && top) {
    return (
      <section className="acct-group">
        <div className="acct-group-h">
          {icon}
          <strong>{title}</strong>
        </div>
        <div className="bal-lead">
          <span className="bal-lead-v mono">
            {formatUnits(top.amount, top.decimals, top.decimals > 6 ? 4 : 2)}
          </span>
          <span className="bal-lead-sym">{top.symbol}</span>
        </div>
        <p className="muted sm">{hint}</p>
        {rest.length > 0 && (
          <ul className="toklist">
            {rest.map((r) => (
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
          {sorted.map((r) => (
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
