/* Turning what a wallet or a pool said into what a person should read.
 *
 * These lived in `denominate.ts` until shielding needed the same four
 * judgements. Copying them would have been the obvious move and the wrong one:
 * the bug that produced this file was the same message appearing twice on one
 * screen in two registers, and two copies of the translator is how that comes
 * back a third time.
 *
 * The distinctions are the whole point, so they are stated once, here:
 *
 *   - a wallet that cannot do STRK20 at all      → not a refusal, and not the
 *                                                  user's doing
 *   - an account the pool has never met          → a refusal they can clear
 *                                                  themselves, in one step
 *   - a named Cairo assert                       → a real finding, quoted
 *   - anything shapeless                         → say so, and do not guess
 */

import { STRK20_MIN_READY } from './wallet';

export function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/* The wallet does not implement the method. Not an error about the
   transaction — an error about the wallet. */
export function isUnsupported(e: unknown): boolean {
  return /unknown request type|not implemented|unsupported method/i.test(messageOf(e));
}

/* The pool's way of saying it has never met this account.
 *
 * Arrives either as the short string or as the felt the wallet did not decode,
 * so both spellings are checked. It is the second of the two failure modes
 * documented at the top of `wallet.ts`, and the only one of them a user can
 * clear themselves — which is why it is worth separating from every other
 * assert rather than quoting alongside them. */
export function isNotRegistered(e: unknown): boolean {
  return /NOT_REGISTERED|4e4f545f52454749535445524544/i.test(messageOf(e));
}

/* Did the dry run come back with an actual reason, or just a shrug?
 *
 * Cairo asserts arrive as SCREAMING_SNAKE short strings — the pool's own
 * (UNDEPOSITED_OPEN_NOTES, TOO_MANY_OPEN_NOTES_DEPOSITED, INSUFFICIENT_BALANCE)
 * and ours (NOT_ON_LADDER, LEG_COUNT_MISMATCH, CALLER_NOT_POOL). Any of those is
 * a real refusal with a real cause.
 *
 * `UNKNOWN_ERROR` is the opposite: it is what a wallet returns when it has
 * nothing to say, and treating it as a refusal invents a finding. */
export function isNamedRefusal(e: unknown): boolean {
  const m = messageOf(e);
  if (/unknown[_ ]error/i.test(m)) return false;
  return (
    /[A-Z][A-Z0-9]+_[A-Z0-9_]+/.test(m) ||
    /revert|assert|insufficient|not registered|invalid/i.test(m)
  );
}

/* What to say when the signature step itself failed. */
export function signatureMessage(e: unknown): string {
  const m = messageOf(e);
  /* A user who declined is not an error state to apologise for. */
  if (/reject|denied|declined|cancel/i.test(m)) return 'Signature declined.';
  /* The wallet cannot do STRK20 at all, and says so in wire protocol:
     "Unknown request type: wallet_strk20InvokeTransaction".

     A notice at the top of the page already explains this in English and names
     the version needed — but the notice is a page away from the button, and
     this string lands directly under it, so the protocol name is what gets
     read. Same fault as NOT_REGISTERED: one condition, two voices, and the
     unreadable one wins.

     Note this is the same predicate the dry run uses one step earlier. There
     it means "skip the dry run and carry on", which is right — a wallet that
     cannot simulate can still sign. Here the signing itself came back unknown,
     so there is nowhere left to carry on to. */
  if (isUnsupported(e))
    return (
      'This wallet build cannot make private transfers yet — it does not ' +
      `recognise the request. Ready ${STRK20_MIN_READY} or newer supports it, on ` +
      'Chrome, Brave or Edge. Nothing was signed and nothing was spent.'
    );
  return m;
}

/* The one refusal that comes with its own remedy. Shared so that shielding and
   splitting cannot describe the same condition two different ways. */
export const NOT_REGISTERED_MESSAGE =
  'This account has not registered with the pool yet, so there is nothing ' +
  'shielded here to split. Registration happens on its own the first time ' +
  'you shield something — shield any amount from the account panel above, ' +
  'then come back. Nothing was signed and nothing was spent.';
