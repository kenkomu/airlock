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
import { shortAddress } from '../lib/identity';

export function EvmDoor({
  session,
  busy,
}: {
  session: EvmIdentitySession;
  busy: boolean;
}) {
  const { state, forget } = session;

  if (state.phase === 'ready') {
    const { identity } = state;
    return (
      <div className="door">
        <dl className="door-id">
          <div>
            <dt>{identity.walletName}</dt>
            <dd className="mono">{shortEvmAddress(identity.evmAddress)}</dd>
          </div>
          <div>
            <dt>Your Starknet account</dt>
            {/* Shown before anything is spent. It is the one thing the user can
                check against another tool, and an address you cannot verify is
                one you have to take our word for. */}
            <dd className="mono">{shortAddress(identity.starknetAddress)}</dd>
          </div>
        </dl>

        {/* Trimmed to the two facts that change what someone does next: the
            account cannot receive yet, and the keys are recoverable from the
            same signature. Everything else was reassurance. */}
        <p className="sm door-warn">
          <b>Not usable yet.</b> Nothing is deployed here and no viewing key is
          registered — don't send anything to it.
        </p>
        <p className="sm muted">
          Sign the same message again and you get this account back. Nothing is
          stored.
        </p>

        <button type="button" className="btn btn-sm" onClick={forget} disabled={busy}>
          Use a different wallet
        </button>
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
