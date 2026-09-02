/* Moving public funds into the pool, from inside Airlock.
 *
 * This did not exist for most of the project's life, and the omission was
 * loud: the account panel said "Nothing shielded yet", the split panel said
 * the account was not registered, and both of them ended by telling the user
 * to go and do it in some other application. An app about a privacy pool that
 * cannot put anything into the privacy pool.
 *
 * It turns out to be one action. `deposit` is a first-class member of
 * STRK20_ACTION — "Deposits public funds from the user's account into the
 * privacy pool. Always to self." — so it goes through the same
 * `strk20InvokeTransaction` the split already uses. The wallet assembles the
 * approve, produces the proof, and pays through a relayer. There is no prover
 * to run and no contract of ours in the path.
 *
 * What this does NOT do is register the account, which an earlier version of
 * this comment claimed outright. Registration is `set_viewing_key` in the pool
 * — a separate, write-once operation that encrypts the user's viewing key for
 * the auditor — and the Wallet API has no method for it. Only four exist:
 * InvokeTransaction, PrepareInvoke, Balances, ShadowAccountCommitment. The SDK
 * can prepend it to a bundle under `autoRegister`, but that is the route that
 * needs a prover.
 *
 * So the wallet owns registration and does it on its own terms. What this can
 * do is decline to stand in the way of the transaction that might carry it.
 */

import type { RpcProvider, STRK20_ACTION, WalletAccountV6 } from 'starknet';
import {
  isNamedRefusal,
  isNotRegistered,
  isUnsupported,
  messageOf,
  signatureMessage,
} from './refusal';

export type ShieldStage =
  | { at: 'idle' }
  | { at: 'simulating' }
  /* The dry run says the account is not registered. Not a failure — see the
     call site — so the flow carries on and the panel warns instead. */
  | { at: 'unregistered' }
  | { at: 'awaiting-signature' }
  | { at: 'submitted'; hash: string }
  | { at: 'done'; hash: string }
  | { at: 'failed'; message: string };

export interface ShieldOptions {
  account: WalletAccountV6;
  provider: RpcProvider;
  /* Token contract, not the pool. The pool is the wallet's business. */
  token: string;
  amount: bigint;
  onStage?: (s: ShieldStage) => void;
  simulate?: boolean;
}

export async function shield(opts: ShieldOptions): Promise<string> {
  const { account, provider, token, amount, onStage, simulate = true } = opts;
  const stage = (s: ShieldStage) => onStage?.(s);

  if (amount <= 0n) throw new Error('Enter an amount to shield.');

  const actions: STRK20_ACTION[] = [{ type: 'deposit', token, amount: `0x${amount.toString(16)}` }];

  /* Free, unsigned, and the last chance to fail before the user pays for
     proving. */
  if (simulate) {
    stage({ at: 'simulating' });
    try {
      await account.strk20PrepareInvoke(actions, true);
    } catch (e) {
      if (isUnsupported(e)) {
        /* No dry run in this wallet. Not an error, and not a reason to block a
           wallet whose real path works. */
      } else if (isNotRegistered(e)) {
        /* Warned, not blocked, and the distinction is the whole point.
        
           An unregistered account is precisely the state a first deposit
           exists to leave. Whether the wallet registers on the way through is
           the wallet's business and not visible from here — there is no
           registration method in the API to call, or to check. Note too that
           the pool's own spelling is SENDER_NOT_REGISTERED, so a bare
           NOT_REGISTERED is the wallet's precheck talking, not the chain.
        
           A dry run refusing this is therefore not evidence the real path
           will, and blocking here would stop the one transaction that might
           clear the condition it is complaining about. Same reasoning the
           split's dry run already applies to a wallet whose simulate is broken
           while its real path works. */
        stage({ at: 'unregistered' });
      } else if (isNamedRefusal(e)) {
        stage({ at: 'failed', message: `The pool refused this deposit in simulation: ${messageOf(e)}` });
        throw new Error(messageOf(e));
      }
      /* A shrug is not evidence. Carry on and let the wallet decide. */
    }
  }

  stage({ at: 'awaiting-signature' });
  let hash: string;
  try {
    ({ transaction_hash: hash } = await account.strk20InvokeTransaction(actions));
  } catch (e) {
    const m = signatureMessage(e);
    stage({ at: 'failed', message: m });
    throw new Error(m);
  }

  stage({ at: 'submitted', hash });
  try {
    await provider.waitForTransaction(hash);
  } catch (e) {
    /* Submitted but unconfirmed is not a failure to report as one — the hash
       exists and may yet land. Telling someone it failed sends them off to
       shield twice. */
    const m = `Submitted as ${hash}, but confirmation could not be read: ${messageOf(e)}. Check the explorer before retrying.`;
    stage({ at: 'failed', message: m });
    throw new Error(m);
  }

  stage({ at: 'done', hash });
  return hash;
}
