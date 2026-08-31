/* What the sheet shows once an EVM wallet has been chosen.
 *
 * This replaces the wallet list rather than sitting under it. When it was a
 * second section with its own heading and two paragraphs, the sheet did not fit
 * on screen and the caveat it carried was something to scroll past on the way to
 * the wallet you already wanted. Shown here instead, it arrives at the moment it
 * is actionable — after the choice, while the wallet prompt is open — which is
 * where a warning is actually read.
 *
 * The privacy difference still appears on the row itself, as a three-word tag,
 * so nobody reaches this screen without having seen it.
 */

import type { EvmIdentitySession } from '../hooks/useEvmIdentity';
import { shortEvmAddress } from '../lib/evm';
import { Copyable } from './Copyable';
import { useEffect, useState } from 'react';
import { providerFor, publicBalances, formatUnits, type ShieldedBalance } from '../lib/wallet';
import { NETWORKS, SN_MAIN } from '../lib/networks';
import { shortAddress } from '../lib/identity';

/* What the derived account holds in the open, read from the chain.
 *
 * "Not active yet" answered what the account IS but not the question people
 * actually open this panel with, which is what is in it. The account has no
 * shielded balance by definition until its first deposit — but it may well
 * hold the STRK someone just sent it to pay for that deposit, and before this
 * there was no way to confirm the transfer had landed except an explorer. */
function useDerivedBalances(address: string | null): {
  balances: ShieldedBalance[] | null;
  failed: boolean;
} {
  const [balances, setBalances] = useState<ShieldedBalance[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setBalances(null);
    setFailed(false);
    const network = NETWORKS.find((n) => n.chainId === SN_MAIN);
    const tokens = network?.tokens.map((t) => ({
      token: t.address,
      symbol: t.symbol,
      decimals: t.decimals,
    }));
    if (!network || !tokens?.length) return setFailed(true);
    publicBalances(providerFor(network), address, tokens)
      .then((b) => !cancelled && setBalances(b))
      /* An unreadable balance is not a zero balance, and showing 0 here would
         tell someone their funds had not arrived when they may well have. */
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [address]);

  return { balances, failed };
}

export function EvmDoor({
  session,
  busy,
  onDone,
}: {
  session: EvmIdentitySession;
  busy: boolean;
  /* Closes the sheet and takes the user to the thing they came to do. Without
     it this screen was a cul-de-sac: an address, a warning, and no way on. */
  onDone?: () => void;
}) {
  const { state, forget } = session;
  /* Hooks cannot sit behind the `ready` early-return below. */
  const derivedAddress =
    state.phase === 'ready' ? state.identity.starknetAddress : null;
  const { balances, failed: balancesFailed } = useDerivedBalances(derivedAddress);

  if (state.phase === 'ready') {
    const { identity } = state;
    return (
      <div className="door">
        <dl className="door-id">
          <div>
            <dt>{identity.walletName}</dt>
            <dd>
              <Copyable
                value={identity.evmAddress}
                short={shortEvmAddress(identity.evmAddress)}
                label="your wallet address"
              />
            </dd>
          </div>
          <div>
            <dt>Your Starknet account</dt>
            {/* Shown before anything is spent. It is the one thing the user can
                check against another tool, and an address you cannot verify is
                one you have to take our word for. */}
            <dd>
              {/* The one address a user has to act on — it is where they send
                  the gas that creates the account. Truncated and uncopyable, the
                  only way to get it was to retype what was on screen. */}
              <Copyable
                value={identity.starknetAddress}
                short={shortAddress(identity.starknetAddress)}
                label="your Starknet account"
              />
            </dd>
          </div>
        </dl>

        <div className="door-bal">
          <p className="sm muted door-bal-h">Holds publicly</p>
          {balancesFailed ? (
            <p className="sm muted">
              Could not read the chain just now — unknown, not zero.
            </p>
          ) : balances === null ? (
            <p className="sm muted">Reading…</p>
          ) : balances.some((b) => b.amount > 0n) ? (
            <ul className="bal-list">
              {balances
                .filter((b) => b.amount > 0n)
                .map((b) => (
                  <li key={b.token} className="sm">
                    <span className="mono">{formatUnits(b.amount, b.decimals)}</span>{' '}
                    {b.symbol}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="sm muted">Nothing yet.</p>
          )}
          <p className="sm muted">
            Shielded: nothing until the first deposit — that is what creates it.
          </p>
        </div>

        {/* This said "don't send anything to it", which was true when nothing
            could act on the account and became actively misleading the moment
            the deposit flow existed — the first thing that flow needs is a
            little STRK at exactly this address. Now it says what the account
            is waiting for instead of warning against the one action that
            unblocks it. */}
        <p className="sm door-warn">
          <b>Not active yet.</b> It comes to life with your first deposit, which
          pays a one-off fee to create the account on Starknet.
        </p>
        <p className="sm muted">
          Sign the same message again and you get this account back. Nothing is
          stored.
        </p>

        <div className="door-actions">
          {onDone && (
            <button type="button" className="btn btn-primary" onClick={onDone}>
              Move funds in
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={forget} disabled={busy}>
            Use a different wallet
          </button>
        </div>
      </div>
    );
  }

  /* connecting / signing / error — one compact panel, because these are seconds
     long and the user is looking at their wallet, not at us. */
  const waiting = state.phase === 'connecting' || state.phase === 'signing';
  return (
    <div className="door">
      {waiting && (
        <>
          <p className="door-step">
            <span className="door-spin" aria-hidden="true" />
            {state.phase === 'connecting'
              ? `Approve in ${state.walletName}`
              : `Sign the message in ${state.walletName}`}
          </p>
          {/* Named separately because the two prompts look identical from
              outside the browser, and "it's stuck" versus "go and click approve"
              is the whole difference. */}
          <p className="sm muted">
            {state.phase === 'connecting'
              ? 'Sharing your address. No transaction.'
              : 'Off-chain signature — no transaction, no gas.'}
          </p>
          <p className="sm door-warn">
            Your keys are made in this browser, not held by the wallet. Airlock
            can see them until you close the tab.
          </p>
        </>
      )}

      {state.phase === 'error' && (
        <>
          <p className="notice notice-blocked sm" role="alert">
            {state.message}
          </p>
          <button type="button" className="btn btn-sm" onClick={forget}>
            Back to wallets
          </button>
        </>
      )}
    </div>
  );
}
