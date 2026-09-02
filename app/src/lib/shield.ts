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
 * The reason it matters more than convenience: registration with the pool
 * happens on the first deposit. So this is also the fix for the NOT_REGISTERED
 * the split panel reports, and the only one the app can carry out itself.
 */

import type { RpcProvider, STRK20_ACTION, WalletAccountV6 } from 'starknet';
import { isNamedRefusal, isUnsupported, messageOf, signatureMessage } from './refusal';

export type ShieldStage =
  | { at: 'idle' }
  | { at: 'simulating' }
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
     proving. Deliberately NOT symmetric with the split's dry run: there is no
     NOT_REGISTERED case to translate here, because this is the transaction
     that registers you. If the pool refuses a first deposit it is for a
     reason the user has to see verbatim. */
  if (simulate) {
    stage({ at: 'simulating' });
    try {
      await account.strk20PrepareInvoke(actions, true);
    } catch (e) {
      if (isUnsupported(e)) {
        /* No dry run in this wallet. Not an error, and not a reason to block a
           wallet whose real path works. */
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
