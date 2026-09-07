/* Why this wallet cannot make a private transfer, said where the action is.
 *
 * This was a banner across the top of the page, standing there from the moment
 * you connected until you left. Three things were wrong with that. It was the
 * first thing anyone read, ahead of what the app does. It ended in the wallet's
 * own wire-protocol string — "Unknown request type: wallet_strk20Balances" —
 * which is a note to us, not to the person reading it. And it warned about a
 * condition that only bites at the instant you press a button, minutes after
 * the warning had stopped being read.
 *
 * So it moved to the button. Every fact survives: the version you have, the
 * version you need, and the single thing to do about it. Only the method name
 * is gone, and nobody could act on that.
 */

import { STRK20_MIN_READY, isBelow, isFirefox, type Connection } from '../lib/wallet';

/* The version is the whole message. "This wallet can't do STRK20" leaves
   someone with nowhere to go; "you have 5.30.0, you need 5.33.8" is a thing
   they can act on in a minute. */
export function WalletGap({ conn }: { conn: Connection }) {
  const v = conn.walletVersion;
  const outdated = v !== undefined && isBelow(v, STRK20_MIN_READY);

  return (
    <p className="notice notice-blocked sm" role="status">
      <strong>{conn.wallet.name} can't make private transfers yet.</strong>{' '}
      {outdated && isFirefox() ? (
        <>
          You're on <strong>{v}</strong>, this needs{' '}
          <strong>{STRK20_MIN_READY}</strong>, and Firefox's build does not ship
          it.{' '}
          <a
            href="https://chromewebstore.google.com/detail/ready-wallet-formerly-arg/dlcobpjiigpikoobohmabehhmhfoodbb"
            target="_blank"
            rel="noreferrer"
          >
            Use Chrome, Brave or Edge
          </a>{' '}
          with Ready installed.
        </>
      ) : outdated ? (
        <>
          You're on <strong>{v}</strong> and this needs{' '}
          <strong>{STRK20_MIN_READY}</strong>.{' '}
          <a href="https://www.ready.co/" target="_blank" rel="noreferrer">
            Update it
          </a>{' '}
          and reconnect.
        </>
      ) : (
        <>
          {v !== undefined && <>You're on <span className="mono">{v}</span>. </>}
          This needs Ready {STRK20_MIN_READY} or newer; other wallets are still
          adding support.
        </>
      )}
    </p>
  );
}
