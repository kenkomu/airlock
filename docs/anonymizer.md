# The bucketing anonymizer

`AirlockBucketer` is the contract the STRK20 pool calls through `privacy_invoke`.
It takes a bucketable amount the pool has withdrawn to it and hands it straight
back as several open notes of standard denominations, so that no note carries
the user's actual figure.

## Why

A withdrawal of 847.32 USDC is a 1:1 fingerprint against a deposit of 847.32
USDC no matter how sound the proofs are, because amounts are public on both
sides. StarkWare's own threat model logs this as an accepted **P0 with mitigation
deferred**, and names the fix — fixed denominations plus change-as-note. Nothing
in the ecosystem implements it.

Splitting 847 into `500 + 250 + 50 + 25 + 10 + 10 + 1 + 1` means every leg
matches other people's legs of the same size. The anonymity set for a leg becomes
"everyone who ever moved this denomination" rather than "nobody, because nobody
else moved 847.32".

## The mechanism

`privacy_invoke` returns `Span<OpenNoteDeposit>` — an array. Returning several
notes is not a workaround; it is the shape the interface was built with. The
client creates *n* open notes in its action list, passes their ids, and the
contract fills each with one denomination.

```
withdraw  847 USDC  →  AirlockBucketer
transfer  "OPEN" x8 →  eight open notes created
invoke    AirlockBucketer(amount, [id0 … id7])
                    →  returns 8 OpenNoteDeposits, pool pulls 847 back
```

## Invariants the pool enforces on us

Read from `privacy::privacy::_apply_actions` and `_deposit_to_open_note`. Getting
any of these wrong is a reverted transaction:

| Pool assertion | What it means here |
| --- | --- |
| `undeposited_open_notes == 0` | **Every** open note created must be filled — we return exactly as many deposits as the client created notes, never fewer |
| `checked_sub(deposits.len())` | …and never more, or it underflows |
| `ZERO_AMOUNT` / `ZERO_TOKEN` | no zero-valued note may be returned |
| `NOTE_NOT_OPEN`, `NOTE_ALREADY_DEPOSITED`, `TOKEN_MISMATCH` | each note must exist, be open, be unfilled, and match the token |
| `checked_transfer_from(depositor → pool)` | we must approve the pool first, and must actually hold the funds |

The first is the reason `app/src/lib/buckets.ts` and `src/ladder.cairo` share a
fixture table: a client planning *n* legs against a contract producing *m* is not
a cosmetic mismatch, it is a transaction that always reverts.

## Security posture

**No owner, no upgrade path, no admin key, no mutable storage.** Everything
configurable — pool, token, unit scale — is baked at construction, so the attack
surface is the single entrypoint. One deployment serves one token; serving
another is another deployment, which is how the reference anonymizers do it too.

The contract never holds funds between transactions: the pool withdraws to it and
pulls back inside one atomic call.

| Decision | Why |
| --- | --- |
| Caller must be the baked pool | Everything downstream assumes it, including that the pool is who will pull the approval we just granted |
| Amount is **declared**, not read from `balance_of` | Otherwise anyone could send one unit of USDC and permanently break the contract: the split would shift, stop matching the client's notes, and every transaction would revert. A denial of service for a millionth of a dollar. Covered by `a_donation_cannot_break_it` |
| Approve exactly the amount | Not unlimited. A bug elsewhere cannot drain more than this call legitimately moved, and nothing survives the transaction |
| Non-bucketable amounts revert | Rounding would mean quietly moving a different amount than the interface displayed — on a privacy tool, the worst available failure |
| `MAX_LEGS = 24` | Gas is linear in legs, but the real reason is that a 40-leg withdrawal is itself a fingerprint. Bucketing into a pattern nobody else could produce defeats its own purpose |

## Testing

```sh
scarb build && snforge test     # 39 tests
cd app && pnpm test             # 21 tests, including the parity table
```

| Suite | Covers |
| --- | --- |
| `ladder_tests` (10) | Decomposition, exhaustively for every bucketable amount from 1 to 400; the shared fixture table for 6- and 18-decimal tokens; greedy minimality; descending order; and the four fail-closed cases |
| `bucketer_tests` (18) | Access control, exact approval, note ordering, the donation griefing vector, constructor guards, the event, and the read-only views |
| `integration_tests` (11) | Full cycles against `MockPool`, which replicates the real pool's assertions constant for constant |

The integration suite is the one that answers *"will this work on chain"*. The
unit tests prove the contract does what was intended; these prove the intention
was right — that a returned span survives `_apply_invoke_and_deposits` and
`_deposit_to_open_note` unchanged, that the approval covers exactly what the pool
pulls, and that the anonymizer holds nothing afterwards.

Two findings came out of writing them:

- **Duplicate note ids fail on the pool's counter, not its per-note check.** A
  note id is a storage slot, so a repeated id is *one* note — the open-note
  counter therefore sees fewer notes than legs returned and underflows before
  `NOTE_ALREADY_DEPOSITED` can fire. That error is unreachable from this
  contract, because we pair leg *i* with id *i* and can only emit a duplicate if
  handed one.
- **The fixture table caught two arithmetic errors** in the expected leg counts
  written from memory (999 needs 11 legs, not 8; 847 needs 8, not 7) — exactly
  the class of bug that would otherwise have shipped as a transaction that
  always reverts.

## Layout note

`Scarb.toml` sits at the repository root rather than in a subdirectory because
the hub indexer reads the root manifest and nowhere else — a nested one is
invisible to it. The web app lives in `app/`.

## What the tests actually cover

| Layer | Count | What it proves |
| --- | --- | --- |
| `ladder_tests` | 10 | The decomposition itself — sums, ordering, minimality, fail-closed cases |
| `bucketer_tests` | 18 | Access control, exact approval, note ordering, constructor guards |
| `integration_tests` | 11 | Full cycles against `MockPool`, which replicates the pool's asserts |
| `fork_tests` | 7 | The **deployed** contract on a Sepolia fork, against the **real** STRK token |

The fork tests exist because `MockPool` and `MockErc20` share an author with the
contract. They are worth a great deal, but they cannot disprove a misreading: if
I misunderstood how the real token handles an approval, the mock misunderstands
it identically and every test still passes. The fork tests put the real token
and the deployed bytecode in the loop.

They are pinned to a block, so a run today and a run next week assert the same
thing, and they are excluded from CI (`--skip fork_tests`) because a pipeline
that goes red when a public node is slow teaches people to ignore red.

### What is still not covered

**The pool has never called this contract.** `_apply_actions` runs behind a
proven entry point that needs a STARK proof from the proving service, which a
fork cannot produce. So the pool's own accounting — the open-note counter and
`UNDEPOSITED_OPEN_NOTES` — rests on `MockPool` alone.

One round trip through a wallet closes that, and nothing above should be read as
having closed it already.
