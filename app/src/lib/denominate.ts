/* Running a denomination round trip, end to end.
 *
 * `buildDenominate` produces the action array; this drives it: read the plan off
 * the contract, build, dry-run, sign, wait. Kept separate from `actions.ts` so
 * that the part which decides what the transaction says stays pure and testable
 * without a wallet.
 *
 * The stages are surfaced individually because they fail for different reasons
 * and the user can act on some of them. "The amount is not on the ladder" is
 * something they fix by typing a different number; "the wallet cannot do STRK20"
 * is not. Collapsing both into a spinner that eventually says "failed" is how a
 * privacy tool loses the only thing it has, which is the user's willingness to
 * believe it knows what it is doing.
 */

import type { STRK20_ACTION } from 'starknet';
import type { RpcProvider, WalletAccountV6 } from 'starknet';
import { ActionBuildError, buildDenominate, fetchPlan } from './actions';
import type { Bucketer, Network } from './networks';

export type Stage =
  | { at: 'idle' }
  | { at: 'planning' }
  | { at: 'simulating'; legs: bigint[]; actions: STRK20_ACTION[] }
  | { at: 'awaiting-signature'; legs: bigint[]; actions: STRK20_ACTION[] }
  | { at: 'submitted'; hash: string; legs: bigint[] }
  | { at: 'done'; hash: string; legs: bigint[] }
  | { at: 'failed'; message: string; recoverable: boolean };

export interface DenominateOptions {
  account: WalletAccountV6;
  provider: RpcProvider;
  network: Network;
  bucketer: Bucketer;
  owner: string;
  amount: bigint;
  onStage?: (s: Stage) => void;
  /* Off by default. `strk20PrepareInvoke` with simulate costs nothing and asks
     for no signature, but not every wallet implements it, and a wallet that
     cannot simulate can still transact. */
  simulate?: boolean;
}

export async function denominate(opts: DenominateOptions): Promise<string> {
  const { account, provider, network, bucketer, owner, amount, onStage, simulate = true } = opts;
  const stage = (s: Stage) => onStage?.(s);

  /* 1. Ask the contract how it will split this. Not our own arithmetic: the
        contract is the authority on its own ladder, and a preview that
        disagrees with it is a preview bug rather than a failed transaction. */
  stage({ at: 'planning' });
  let legs: bigint[];
  try {
    legs = await fetchPlan(provider, bucketer.address, amount);
  } catch (e) {
    /* The contract reverts NOT_ON_LADDER for anything it cannot decompose. That
       is a fact about the amount, which the user can change. */
    const notOnLadder = /NOT_ON_LADDER|4e4f545f4f4e5f4c4144444552/i.test(messageOf(e));
    return failed(
      stage,
      notOnLadder
        ? `${format(amount, bucketer)} cannot be split into standard denominations. Try a rounder amount.`
        : `Could not read the split from the anonymizer: ${messageOf(e)}`,
      true,
    );
  }

  /* 2. Build. Throws rather than returning something the pool would reject. */
  let actions: STRK20_ACTION[];
  try {
    actions = buildDenominate({ network, bucketer, amount, legs, owner });
  } catch (e) {
    return failed(stage, messageOf(e), e instanceof ActionBuildError);
  }

  /* 3. Dry run. Free, unsigned, and the last chance to fail before the user
        pays for proving. A wallet without it is not an error. */
  if (simulate) {
    stage({ at: 'simulating', legs, actions });
    try {
      await account.strk20PrepareInvoke(actions, true);
    } catch (e) {
      if (!isUnsupported(e)) {
        return failed(stage, `The pool rejected this transaction in simulation: ${messageOf(e)}`, true);
      }
    }
  }

  /* 4. Sign and submit. */
  stage({ at: 'awaiting-signature', legs, actions });
  let hash: string;
  try {
    ({ transaction_hash: hash } = await account.strk20InvokeTransaction(actions));
  } catch (e) {
    return failed(stage, signatureMessage(e), true);
  }

  stage({ at: 'submitted', hash, legs });
  try {
    await provider.waitForTransaction(hash);
  } catch (e) {
    /* Submitted but not confirmed is NOT a failure to report as one — the hash
       exists and may yet land. Saying "failed" here would send someone off to
       retry a transaction that is about to succeed, and pay twice. */
    return failed(
      stage,
      `Submitted as ${hash}, but confirmation could not be read: ${messageOf(e)}. Check the explorer before retrying.`,
      false,
    );
  }

  stage({ at: 'done', hash, legs });
  return hash;
}

function failed(stage: (s: Stage) => void, message: string, recoverable: boolean): never {
  stage({ at: 'failed', message, recoverable });
  throw new Error(message);
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

function isUnsupported(e: unknown): boolean {
  return /unknown request type|not implemented|unsupported method/i.test(messageOf(e));
}

/* A user who declined is not an error state to apologise for. */
function signatureMessage(e: unknown): string {
  const m = messageOf(e);
  if (/reject|denied|declined|cancel/i.test(m)) return 'Signature declined.';
  return m;
}

export function format(amount: bigint, b: Pick<Bucketer, 'decimals' | 'symbol'>): string {
  const base = 10n ** BigInt(b.decimals);
  const whole = amount / base;
  const frac = amount % base;
  if (frac === 0n) return `${whole} ${b.symbol}`;
  const s = frac.toString().padStart(b.decimals, '0').replace(/0+$/, '');
  return `${whole}.${s} ${b.symbol}`;
}
