/* Building the STRK20_ACTION array that routes a balance through the bucketer.
 *
 * ## What the transaction does
 *
 * One STRK20 transaction, three kinds of action, in an order the pool enforces:
 *
 *   1. `withdraw`  — the pool sends `amount` out to the bucketer, which now
 *                    holds real USDC in public space for the length of one
 *                    transaction.
 *   2. `transfer` × N with amount `"OPEN"` — creates N empty notes belonging to
 *                    the user. An open note is a note waiting for an external
 *                    contract to fill it.
 *   3. `invoke`    — calls `privacy_invoke` on the bucketer, which approves the
 *                    pool and returns one `OpenNoteDeposit` per denomination.
 *                    The pool pulls the funds back and fills the notes.
 *
 * Net effect: one balance of 847 becomes eight notes — 500, 250, 50, 25, 10,
 * 10, 1, 1 — each of which can later be spent in its own transaction. That last
 * part is the point. N `withdraw` actions in one transaction would also produce
 * standard amounts, and would need no contract at all, but they would all land
 * together and be linked by the transaction that carried them. Notes can leave
 * separately, at different times, and each one matches every other note of its
 * denomination.
 *
 * ## Ordering is not stylistic
 *
 * Read from `privacy.cairo` and the reference builder, both of which are
 * unambiguous, and both of which this file must obey:
 *
 * - `_apply_actions` increments a counter on every open note created and
 *   `checked_sub`s it on the deposits an invoke returns. An invoke placed
 *   before its open notes underflows that counter — `TOO_MANY_OPEN_NOTES_
 *   DEPOSITED` — so open notes come first. The reference builder throws on
 *   `createOpenNote` after an invoke for exactly this reason.
 * - `assert(undeposited_open_notes == 0)` closes the transaction, so every open
 *   note created must be filled. Creating more notes than the contract will
 *   return deposits for is not a partial success; it reverts the whole thing.
 * - The pool runs the withdraw before the invoke, which is what lets the
 *   bucketer hold the funds it is about to approve.
 *
 * So leg count and note count are one number, and this module never lets them
 * be two. `plan()` is read off the deployed contract rather than recomputed
 * here, which is what makes that structural rather than a matter of keeping two
 * ladders in sync.
 */

import type { STRK20_ACTION } from 'starknet';
import { CallData, RpcProvider, num, validateAndParseAddress } from 'starknet';
import type { Network } from './networks';

/* Mirrors MAX_LEGS in the Cairo. Duplicated deliberately: the client should
   refuse a plan the contract would reject rather than pay to discover it. */
export const MAX_LEGS = 24;

export class ActionBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionBuildError';
  }
}

const felt = (v: bigint | number | string): string => num.toHex(num.toBigInt(v));

/* ── reading the split off the chain ─────────────────────────────────────────
 *
 * The contract exposes `plan` and `denominations` as views precisely so a client
 * does not have to assume. Local arithmetic drives the instant UI preview, but
 * the array that gets signed is built from what the contract says it will do.
 * If the two ever disagree, the disagreement is a bug in the preview, and the
 * transaction still succeeds — rather than a transaction that reverts after the
 * user has paid for proving.
 */
export async function fetchPlan(
  provider: RpcProvider,
  bucketer: string,
  amount: bigint,
): Promise<bigint[]> {
  const res = await provider.callContract({
    contractAddress: bucketer,
    entrypoint: 'plan',
    calldata: CallData.compile([num.toHex(amount)]),
  });
  return decodeSpan(res);
}

export async function fetchDenominations(
  provider: RpcProvider,
  bucketer: string,
): Promise<bigint[]> {
  const res = await provider.callContract({
    contractAddress: bucketer,
    entrypoint: 'denominations',
    calldata: [],
  });
  return decodeSpan(res);
}

/* A Cairo `Span<u128>` serialises as [len, ...items]. Anything shorter than its
   own declared length is a malformed response, not an empty plan — returning []
   there would quietly build a transaction with no legs. */
function decodeSpan(raw: readonly string[]): bigint[] {
  if (raw.length === 0) throw new ActionBuildError('empty response from the anonymizer');
  const len = Number(BigInt(raw[0]));
  const items = raw.slice(1);
  if (items.length !== len) {
    throw new ActionBuildError(
      `malformed span from the anonymizer: declared ${len} items, got ${items.length}`,
    );
  }
  return items.map((v) => BigInt(v));
}

/* ── building the action array ───────────────────────────────────────────── */

export interface DenominateRequest {
  network: Network;
  /* Token being bucketed. Must be the one the bucketer was deployed for — it
     serves exactly one token, by construction. */
  token: string;
  /* Total, in the token's base units, already known to be on the ladder. */
  amount: bigint;
  /* One entry per note, from the contract's own `plan`. */
  legs: bigint[];
  /* Who ends up owning the notes. The pool's builder always uses the user's own
     address here, and so do we: an open note is filled by an external contract,
     so it has to belong to someone who was party to this transaction. */
  owner: string;
}

export function buildDenominate(req: DenominateRequest): STRK20_ACTION[] {
  const { network, token, amount, legs, owner } = req;
  const bucketer = network.bucketer;

  if (!bucketer) {
    throw new ActionBuildError(
      `Airlock's anonymizer is not deployed on ${network.name}, so there is nothing to route through.`,
    );
  }
  if (amount <= 0n) {
    throw new ActionBuildError('Amount must be greater than zero.');
  }
  if (legs.length === 0) {
    throw new ActionBuildError(
      'The anonymizer returned no legs for this amount, which means it is not on the ladder.',
    );
  }
  if (legs.length > MAX_LEGS) {
    throw new ActionBuildError(
      `${legs.length} legs exceeds the contract's limit of ${MAX_LEGS}. Choose a rounder amount.`,
    );
  }

  /* The sum check is the one that matters. A plan that does not add up would
     leave the pool holding funds it cannot account for, and the contract
     asserts on it anyway — but discovering that on chain costs a proof. */
  const total = legs.reduce((a, b) => a + b, 0n);
  if (total !== amount) {
    throw new ActionBuildError(
      `The plan sums to ${total} but the amount is ${amount}. Refusing to build a transaction that cannot settle.`,
    );
  }

  const tokenFelt = felt(validateAndParseAddress(token));
  const ownerFelt = felt(validateAndParseAddress(owner));
  const bucketerFelt = felt(validateAndParseAddress(bucketer));

  return [
    /* 1. Fund the bucketer. It holds the money for exactly as long as this
          transaction takes, and never between transactions. */
    {
      type: 'withdraw',
      token: tokenFelt,
      amount: felt(amount),
      recipient: bucketerFelt,
    },

    /* 2. One empty note per leg. These must exist before the invoke below, and
          `${openNoteIds[i]}` indexes them in creation order. */
    ...legs.map(
      (): STRK20_ACTION => ({
        type: 'transfer',
        token: tokenFelt,
        amount: 'OPEN',
        recipient: ownerFelt,
      }),
    ),

    /* 3. privacy_invoke(amount: u128, note_ids: Span<felt252>).
          Serialised flat: [amount, len, id_0 … id_n-1]. The selector comes from
          the pool's InvokeExternal, so the calldata carries arguments only.
          The placeholders are literal strings the wallet substitutes at proving
          time; writing real ids here is impossible, since they do not exist
          until the notes above are created. */
    {
      type: 'invoke',
      contract: bucketerFelt,
      calldata: [
        felt(amount),
        felt(legs.length),
        ...legs.map((_, i) => `\${openNoteIds[${i}]}`),
      ],
    },
  ];
}

/* ── a readable account of what was built ────────────────────────────────────
 *
 * Shown before signing. A privacy tool that asks for a signature on a sequence
 * the user cannot inspect is asking for trust it has not earned.
 */
export function describeActions(actions: STRK20_ACTION[]): string[] {
  return actions.map((a) => {
    switch (a.type) {
      case 'withdraw':
        return `withdraw ${BigInt(a.amount)} to ${shortHex(a.recipient)}`;
      case 'transfer':
        return a.amount === 'OPEN'
          ? `create an open note for ${shortHex(a.recipient)}`
          : `transfer ${BigInt(a.amount)} to ${shortHex(a.recipient)}`;
      case 'deposit':
        return `deposit ${BigInt(a.amount)}`;
      case 'invoke':
        return `invoke ${shortHex(a.contract)} with ${a.calldata.length} felts`;
      default:
        /* Unreachable against the types `starknet` pins today: 10.4.0 resolves
           STRK20_ACTION to types-js 0.10.3, which has four variants, so `a`
           narrows to never here. A newer 0.10.4 adds `shadow_account_invoke`
           and is already in the tree via another dependency, so this stays —
           described rather than dropped, because the one thing this function
           must never do is show the user a shorter list of actions than the one
           they are signing. */
        return describeUnknown(a);
    }
  });
}

function describeUnknown(action: never): string {
  const type = (action as { type?: unknown }).type;
  return `unrecognised action${typeof type === 'string' ? ` (${type})` : ''} — inspect it in your wallet before signing`;
}

function shortHex(v: string): string {
  return v.length > 12 ? `${v.slice(0, 8)}…${v.slice(-4)}` : v;
}
