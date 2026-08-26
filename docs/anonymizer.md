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
scarb build
snforge test --skip fork_tests  # 39 offline tests, no network
snforge test fork_tests         # 10 tests against a pinned Sepolia fork
cd app && pnpm test             # 59 tests, including the parity table
```

| Suite | Covers |
| --- | --- |
| `ladder_tests` (10) | Decomposition, exhaustively for every bucketable amount from 1 to 400; the shared fixture table for 6- and 18-decimal tokens; greedy minimality; descending order; and the four fail-closed cases |
| `bucketer_tests` (18) | Access control, exact approval, note ordering, the donation griefing vector, constructor guards, the event, and the read-only views |
| `integration_tests` (11) | Full cycles against `MockPool`, which replicates the real pool's assertions constant for constant |
| `fork_tests` (7) | The deployed contract on a Sepolia fork, against the real STRK token |
| `pool_fork_tests` (3) | The **real deployed pool** calling the **real deployed contract** |

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
| `pool_fork_tests` | 3 | The **real deployed pool** running its real entry point against this contract |

The fork tests exist because `MockPool` and `MockErc20` share an author with the
contract. They are worth a great deal, but they cannot disprove a misreading: if
I misunderstood how the real token handles an approval, the mock misunderstands
it identically and every test still passes. The fork tests put the real token
and the deployed bytecode in the loop.

They are pinned to a block, so a run today and a run next week assert the same
thing, and they are excluded from CI (`--skip fork_tests`) because a pipeline
that goes red when a public node is slow teaches people to ignore red.

### The pool does call this contract

This section used to say the opposite — that the pool could never call us on a
fork, because `apply_actions` sits behind a proven entry point no fork can
satisfy. That was a misreading, and worth recording as one.

`Privacy::validate_proof` does not verify a proof. It reads
`tx_info.proof_facts` — a transaction-level field the sequencer populates and
the contract trusts — and asserts five properties of it: the program variant,
the output version, that the base block is recent, and that the L1 message hash
equals `compute_message_hash(actions, pool)`. The cryptography happens outside
the contract. `snforge` can set that field, so the entry point is reachable.

`pool_fork_tests.cairo` therefore runs the real thing: the deployed pool
transfers 8.4 STRK to the deployed bucketer, calls `privacy_invoke`,
deserialises the returned span, pulls the tokens back through our approval, and
enforces its own open-note accounting. The notes are then read out of the pool's
storage and checked to hold 5 + 2.5 + 0.5 + 0.1x4.

Each test was falsified before being kept: one fewer note fails
`LEG_COUNT_MISMATCH`, and a note nothing fills fails the pool's own
`UNDEPOSITED_OPEN_NOTES` — the exact invariant `MockPool` was imitating.

Two things only running it could teach. The pool charges a flat 2 STRK per call,
taken by `transfer_from` against the caller, so the caller must approve first.
And `EmitOpenNoteCreated` cannot be constructed from outside the pool's crate —
it embeds a `pub(crate)` type — so it is built from its wire format, which is
closer to what a wallet actually sends anyway.

### What is still not covered

**The wallet.** It is the wallet that turns an `STRK20_ACTION[]` into the pool's
`Span<ServerAction>`, and that translation is assumed rather than tested. One
round trip through a real wallet closes it, and nothing above should be read as
having closed it already.


## Standard is not the same as common

The ladder guarantees a withdrawal leaves as sizes the contract will also produce
for other people. It does not guarantee that anyone else has actually used them.

Two public pool events carry amounts, so this is measurable rather than
assumed:

| Event | Layout on mainnet | What it is |
|---|---|---|
| `Deposit` | `keys = [selector, user, token]`, `data = [amount]` | money entering the pool from outside |
| `OpenNoteDeposited` | `keys = [selector, depositor, token, note_id]`, `data = [amount]` | a note an anonymizer created |

They are disjoint. This project's own `8.4` split
([`0x03f52e1b…3a50`](https://voyager.online/tx/0x03f52e1bddd716344f5dd3c43ba2b81eb1aefb0bc7791aba3e54051b40963a50))
emits seven `OpenNoteDeposited` and no `Deposit`, so counting both into one
histogram double-counts nothing.

Counted over a 200,000-block window on mainnet, the busiest STRK sizes were:

| Size | Notes | Addresses behind them |
|---|---|---|
| 1 STRK | 20 | 10 |
| 10 STRK | 15 | 7 |
| 6 STRK | 14 | 14 |
| 5 STRK | 11 | 3 |
| 7 STRK | 7 | 7 |
| 0.1 STRK | 7 | 3 |
| 250 STRK | 0 | 0 |

**The two columns are the whole point.** 5 STRK looks like the fourth-busiest
size in the pool and is the work of three addresses; 6 STRK has fewer notes and
fourteen separate people behind them. A count of notes would have reported the
first as the better place to hide. Counting distinct depositors is free — the
address is already a key on both events — and it is the difference between a
crowd and a costume.

The long tail is every amount with exactly one note from exactly one address:
`4000.144894 STRK`, `2542.017695 USDC`, `73670.661945 USDC`. Those are the
fingerprints this contract exists to prevent, and there are more of them than
of everything else combined.

## What the interface does with this

The split panel counts it live and prints it per rung, then states a verdict on
the *rarest* leg — because a plan is exactly as private as its thinnest rung,
which is the same reasoning `planBuckets` uses to refuse a scattered split.
Averaging across legs would let a well-populated `1` hide the fact that the
`2.5` beside it is unique, and the unique one is what an observer keys on.

Typing `8.4` today gets `5` (3 people), `2.5` (1), `0.5` (1), `0.1x4` (3) and
the line *"Rarest size here is 2.5 STRK, used by 1 person — standard, but not
yet a crowd."* Typing `6` gets `5 + 1` and the panel declines to call it a
giveaway at all, because thirteen addresses have moved exactly 6.

Wording is deliberate: **"addresses" and "people", never "others".** The
histogram counts depositors and one of them may be the person reading the
screen, so "someone else" would quietly add one to the crowd.

Truncation runs one way on purpose. The snapshot keeps the 400 commonest sizes
so a busy pool cannot grow the cached blob without bound; a size the histogram
has forgotten therefore reports zero rather than one. The crowd is understated,
never overstated — the only direction this number is allowed to be wrong in.

**Caveat, narrower than it used to be.** An earlier version of this file said
only open notes could be counted. That was wrong: the pool's `Deposit` event
publishes `(user, token, amount)` in the clear, so notes created by deposit are
countable too, and they are the majority of the join set. What genuinely cannot
be counted is note-to-note transfers inside the pool, whose amounts and parties
are private. So the histogram covers every note that entered the pool from
outside or was created by an anonymizer — not every note in existence.
