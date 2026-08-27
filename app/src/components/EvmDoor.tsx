/* The any-chain door, inside the connect sheet.
 *
 * Placed below the Starknet wallets rather than beside them, because it is the
 * weaker option and the ordering should say so without a paragraph explaining
 * it. Someone who has Ready installed should take the first door; this one is
 * for the person the RFP is about, who has MetaMask and no reason to install a
 * Starknet wallet to try a demo.
 *
 * The privacy difference is stated in this section, not in a footnote shared
 * with the other door. A single blanket "your viewing key stays in your wallet"
 * covering both would be false for this one.
 */

import type { EvmIdentitySession } from '../hooks/useEvmIdentity';
import type { EvmWallet } from '../lib/evm';
import { shortEvmAddress } from '../lib/evm';
import { shortAddress } from '../lib/identity';

export function EvmDoor({
  session,
  busy,
}: {
  session: EvmIdentitySession;
  /* True while the Starknet door is mid-connect. Both doors write to the same
     page, so letting someone start the second while the first is negotiating
     produces two connections and one very confused screen. */
  busy: boolean;
}) {
  const { state, wallets, connect, forget } = session;
  const working = state.phase === 'connecting' || state.phase === 'signing';

  if (state.phase === 'ready') {
    const { identity } = state;
    return (
      <section className="door">
        <h3 className="door-h">Using {identity.walletName}</h3>
        <dl className="door-id">
          <div>
            <dt>Your wallet</dt>
            <dd className="mono">{shortEvmAddress(identity.evmAddress)}</dd>
          </div>
          <div>
            <dt>Your Starknet account</dt>
            {/* Shown before anything is signed or spent. This is the address the
                funds will live at, and it is the one thing the user can check
                against another tool — an address they cannot verify is an
                address they have to take our word for. */}
            <dd className="mono">{shortAddress(identity.starknetAddress)}</dd>
          </div>
        </dl>
        <p className="sm muted">
          Derived from your signature, not stored. Sign the same message from the
          same wallet and you get this account back — on any device, with or
          without Airlock.
        </p>
        {/* An address is not an account yet.
            *
            * The address above is computed, not created: nothing is deployed at
            * it and it holds no viewing key registration, so it cannot receive a
            * private balance and reads as empty everywhere. Showing a real-looking
            * address while staying silent about that invites someone to send
            * funds to it, and a counterfactual address accepts a plain transfer
            * perfectly happily. So the gap is named where the address is shown,
            * not in a doc nobody opens. */}
        <p className="sm door-warn">
          <b>Not usable yet.</b> Nothing is deployed at this address and it has no
          viewing key registered with the pool, so it cannot hold a private
          balance. Do not send anything to it. Deploying and registering is the
          next thing being built.
        </p>
        <button type="button" className="btn btn-sm" onClick={forget}>
          Forget these keys
        </button>
      </section>
    );
  }

  return (
    <section className="door">
      <h3 className="door-h">No Starknet wallet?</h3>
      <p className="sm muted">
        Use the wallet you already have. One signature derives a Starknet account
        for you — it is not a transaction and costs no gas.
      </p>

      {wallets.length > 0 ? (
        <ul className="wlist">
          {wallets.map((w: EvmWallet) => (
            <li key={w.info.rdns}>
              <button
                type="button"
                className="wrow"
                onClick={() => connect(w)}
                disabled={busy || working}
              >
                {/* Wallet-supplied icons are data URIs by the standard, but a
                    wallet is free to send anything; if it fails to load the row
                    still reads, because the name carries it. */}
                {w.info.icon ? (
                  <img className="wicon" src={w.info.icon} alt="" />
                ) : (
                  <span className="wicon" aria-hidden="true" />
                )}
                <span className="wname">{w.info.name}</span>
                <span className="wgo">{labelFor(state, w)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sm muted">
          No wallet found on another chain either. MetaMask, Rabby and Zerion all
          work here.
        </p>
      )}

      {state.phase === 'error' && (
        <p className="notice notice-blocked sm" role="alert">
          {state.message}
        </p>
      )}

      {/* The honest bit, in the section it applies to. */}
      <p className="sm door-warn">
        <b>This door is weaker.</b> With a Starknet wallet, the viewing key stays
        in the wallet and Airlock never sees it. Here there is no wallet to hold
        one, so the keys are derived in this tab and Airlock does see them until
        you close it.
      </p>
    </section>
  );
}

/* What the row's trailing slot says. Two different prompts are involved and
   they look the same from outside the browser, so naming which one is waiting
   is the difference between "it's stuck" and "go and click approve". */
function labelFor(
  state: EvmIdentitySession['state'],
  wallet: EvmWallet,
): string {
  if (state.phase === 'connecting' && state.walletName === wallet.info.name) {
    return 'approve in wallet…';
  }
  if (state.phase === 'signing' && state.walletName === wallet.info.name) {
    return 'sign in wallet…';
  }
  return '→';
}
