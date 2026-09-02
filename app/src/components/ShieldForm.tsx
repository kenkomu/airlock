/* Shielding, from the panel that reports you have nothing shielded.
 *
 * The account card used to end on "Nothing shielded yet" and leave it there;
 * the split panel underneath refused with NOT_REGISTERED and told the user to
 * go and register somewhere else. Two panels agreeing that the app could not
 * do the one thing it is about.
 *
 * It is a single `deposit` action through the wallet — see `lib/shield.ts` for
 * why that is all it is. The form is here rather than in its own card because
 * this is where the question gets asked: you find out you hold nothing private
 * at the moment you open the account, and the answer belongs in the same
 * place as the finding.
 */

import { useState } from 'react';
import { shield, type ShieldStage } from '../lib/shield';
import { formatUnits, toBaseUnits, type Connection, type ShieldedBalance } from '../lib/wallet';
import { txUrl } from '../lib/networks';
import { IconLock } from './Icons';

export function ShieldForm({
  conn,
  pub,
  onShielded,
}: {
  conn: Connection;
  /* The public balances the sheet has already read. Passed in rather than read
     again: two reads of the same thing can disagree, and the one on screen is
     the one the user is deciding from. */
  pub: ShieldedBalance[];
  onShielded: () => void;
}) {
  const holdings = pub.filter((b) => b.amount > 0n);
  const [tokenAddr, setTokenAddr] = useState<string>(() => holdings[0]?.token ?? '');
  const [text, setText] = useState('');
  const [stage, setStage] = useState<ShieldStage>({ at: 'idle' });

  const token = holdings.find((b) => b.token === tokenAddr) ?? holdings[0];
  if (!token) return null;

  const amount = toBaseUnits(text, token.decimals);
  const over = amount !== null && amount > token.amount;
  const busy =
    stage.at === 'simulating' || stage.at === 'awaiting-signature' || stage.at === 'submitted';

  /* Nothing to shield into a pool from an account with no public funds, and
     nothing to say about a wallet that has already told us it cannot. The
     notice at the top of the page covers that case in full. */
  if (conn.support.kind === 'unsupported' || !conn.network) return null;

  const run = async () => {
    if (amount === null || amount <= 0n || over) return;
    try {
      await shield({
        account: conn.account,
        provider: conn.provider,
        token: token.token,
        amount,
        onStage: setStage,
      });
      setText('');
      onShielded();
    } catch {
      /* `shield` has already put the reason on the stage, which is what the
         user reads. Rethrowing here would only reach the console. */
    }
  };

  return (
    <section className="acct-group shield">
      <div className="acct-group-h">
        <IconLock />
        <strong>Shield funds</strong>
      </div>
      <p className="muted sm">
        Moves public {token.symbol} into the pool, to yourself.
      </p>

      <label className="field">
        <span className="field-row">
          <span className="field-l">Amount to shield</span>
          <span className="field-bal">
            <span className="muted">Public</span>{' '}
            <span className="mono">
              {formatUnits(token.amount, token.decimals, token.decimals > 6 ? 4 : 2)}{' '}
              {token.symbol}
            </span>
          </span>
        </span>
        <div className={`amountbox${busy ? ' amountbox-off' : ''}`}>
          <input
            className="input mono amountbox-in"
            inputMode="decimal"
            placeholder="0"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            aria-label={`Amount to shield, in ${token.symbol}`}
          />
          {holdings.length > 1 ? (
            <div className="tokseg" role="group" aria-label="Token">
              {holdings.map((b) => (
                <button
                  key={b.token}
                  type="button"
                  className={`tokseg-btn${b.token === token.token ? ' tokseg-on' : ''}`}
                  disabled={busy}
                  aria-pressed={b.token === token.token}
                  onClick={() => setTokenAddr(b.token)}
                >
                  {b.symbol}
                </button>
              ))}
            </div>
          ) : (
            <span className="tokfixed">{token.symbol}</span>
          )}
        </div>
      </label>

      {/* No "use max". The fee for this transaction is paid from the public
          side, because there is no shielded balance yet to pay it from — so a
          button that shields the entire public balance is a button that makes
          the transaction unaffordable at the moment it is submitted. */}

      <div aria-live="polite">
        {over && (
          <p className="err">
            That is more than you hold publicly in {token.symbol}.
          </p>
        )}
        {stage.at === 'unregistered' && (
          <p className="notice notice-leak sm">
            Your wallet says this account isn't registered with the pool yet.
            Registering is something only the wallet can do — there is no method
            for it in the API — so it may happen as this goes through, or it may
            refuse. Trying costs nothing until you sign. If it refuses, set up
            private balances in {conn.wallet.name} first.
          </p>
        )}
        {stage.at === 'failed' && <p className="err">{stage.message}</p>}
        {stage.at === 'done' && (
          <p className="sm">
            Shielded.{' '}
            <a
              className="tx-link"
              href={txUrl(conn.network, stage.hash)}
              target="_blank"
              rel="noreferrer"
            >
              View the transaction
            </a>
          </p>
        )}
      </div>

      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || amount === null || amount <= 0n || over}
        onClick={run}
      >
        {stage.at === 'simulating'
          ? 'Checking…'
          : stage.at === 'awaiting-signature'
            ? 'Confirm in your wallet…'
            : stage.at === 'submitted'
              ? 'Waiting for the network…'
              : 'Shield'}
      </button>
    </section>
  );
}
