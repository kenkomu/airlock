# Mainnet runs

Every transaction Airlock has made on Starknet mainnet, what it did, and how to
check it without taking this file's word for anything.

All four go through
[`AirlockBucketer` `0x036816fe…e97a`](https://voyager.online/contract/0x036816fe3c38b222e737ec4168b604309ab24154862d1a3f4c9db0042a90e97a)
and the STRK20 pool
[`0x040337b1…812a`](https://voyager.online/contract/0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a).

| Date | Amount | Split into | Notes | Network fee | Block | Transaction |
|---|---|---|---|---|---|---|
| 22 Aug | 8.4 STRK | 5 + 2.5 + 0.5 + 0.1×4 | 7 | 3.4698 STRK | 13679466 | [`0x03f52e1b…3a50`](https://voyager.online/tx/0x03f52e1bddd716344f5dd3c43ba2b81eb1aefb0bc7791aba3e54051b40963a50) |
| 22 Aug | 6 STRK | 5 + 1 | 2 | 3.1103 STRK | 13689856 | [`0x061f9284…cb15`](https://voyager.online/tx/0x061f9284dfa2fe0b7e603785b9342d64bdb322980c2c3f5e8d87c6de0a01cb15) |
| 22 Aug | 7 STRK | 5 + 1 + 1 | 3 | 2.9458 STRK | 13690256 | [`0x007239d9…f7e`](https://voyager.online/tx/0x7239d9449a5a09aa701488149c30b6685794f7db67e2041069a0212f5f9f7e) |
| 22 Aug | 7 STRK | 5 + 1 + 1 | 3 | 3.2549 STRK | 13690276 | [`0x024566ac…6c5c`](https://voyager.online/tx/0x24566acdb0de49b44a6ef689387209eb09c71fc037e75c2d4129f915c8e6c5c) |

## What one of these actually does

Taking the first as the example, because it is the widest split.

The pool withdrew 8.4 STRK from a private note and sent the whole amount to
`AirlockBucketer`. The contract decomposed it on its ladder, approved the pool
for exactly that total, and returned seven `OpenNoteDeposit` values. The pool
then pulled the tokens back through that approval and filled seven open notes —
all inside the same transaction, so there is no moment where the funds sit
anywhere exposed.

The result on chain is seven notes of `5`, `2.5`, `0.5` and `0.1×4`. An observer
watching the pool sees seven ordinary note sizes and no `8.4` anywhere. That is
the entire point: **the pool hides which deposit a withdrawal came from, and a
distinctive amount hands that back.**

## The fee, stated plainly

The network fees above are what the sequencer charged. They are not what the
transaction cost the user.

The wallet submits through a relayer so the user's public address never appears
as the payer, and bills the shielded balance for that service. On the first run
the relayer took **6 STRK** against a **3.4698 STRK** network fee — a premium of
roughly 73%, which is the price of not being the visible payer.

Nothing in the STRK20 wallet API exposes that figure to us:
`strk20PrepareInvoke` returns `{ call, proof }` and no fee. So the app reports
it as an observation with this transaction attached rather than as a prediction,
and points at the wallet for the number that will actually apply.

## Choosing the amounts

The 6 and both 7s were not arbitrary. `OpenNoteDeposited` is a public event
carrying each note's amount, so the size of every open note in the pool can be
counted — which turns "is this a standard size?" into "how many others are
actually this size?"

At the time of these runs the STRK open notes in the window were:

| Rung | Open notes that size |
|---|---|
| 5 STRK | 6 |
| 1 STRK | 5 |
| 0.1 STRK | 4 |
| 2.5 STRK | 1 |
| 0.5 STRK | 1 |

`6 → 5 + 1` and `7 → 5 + 1 + 1` land every leg on a rung where five or six other
open notes already sit. A `13` was tried first and rejected as a bad choice:
it decomposes to `10 + 2.5 + 0.5`, and each of those three would have been one
of a kind in the window — technically on the ladder, and hiding among nobody.

This is the gap between *valid* and *private*, and it is measurable — so the
app now measures it. The split panel counts these sizes live from the pool and
prints the population of each rung beside it, then names the rarest leg. Typing
`8.4` gets `5` (3 people), `2.5` (1), `0.5` (1), `0.1x4` (3) and the verdict
*"Rarest size here is 2.5 STRK, used by 1 person — standard, but not yet a
crowd."* Typing `6` gets `5 + 1` and the panel refuses to call it distinctive at
all. See [docs/anonymizer.md](anonymizer.md) for the method.

**Caveat, corrected.** An earlier version of this file said only *open* notes
could be counted, because ordinary notes hide their amounts. That was wrong: the
pool's `Deposit` event publishes `(user, token, amount)` in the clear, so every
note that entered the pool from outside is countable too — and those are most of
the join set. What is genuinely uncountable is note-to-note transfers inside the
pool. The table above was open notes only and therefore understated every rung;
the current, wider counts are in [docs/anonymizer.md](anonymizer.md).

The counts also report **distinct depositor addresses**, not note counts, and
the two differ enough to matter: 5 STRK is 11 notes from 3 addresses, while 6
STRK is 14 notes from 14. Ranking by notes would have picked the worse hiding
place.

## Verifying these yourself

Each transaction is checked the way the sprint's own indexer checks it — success,
an event from the pool, and an event or calldata reference to our contract:

```bash
POOL=0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
OURS=0x036816fe3c38b222e737ec4168b604309ab24154862d1a3f4c9db0042a90e97a

curl -s -X POST https://starknet-rpc.publicnode.com \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"starknet_getTransactionReceipt",
       "params":["0x03f52e1bddd716344f5dd3c43ba2b81eb1aefb0bc7791aba3e54051b40963a50"]}'
```

To list every split ever made through the contract, without trusting this file
to be complete, read its events directly — it emits `Bucketed` once per call:

```bash
curl -s -X POST https://starknet-rpc.publicnode.com \
  -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"starknet_getEvents\",
       \"params\":[{\"from_block\":{\"block_number\":13650000},\"to_block\":\"latest\",
       \"address\":\"$OURS\",\"chunk_size\":100}]}"
```
