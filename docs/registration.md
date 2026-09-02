# Why "NOT_REGISTERED", and who can fix it

A tester on Sepolia, with Ready X 5.33.9 and 3,029 STRK, could not shield or
split. Both refused with `An error occurred (NOT_REGISTERED)`. This is what
that is, established from the pool's source and from the chain rather than
guessed — two earlier guesses in this repo were wrong in opposite directions.

## The state

Registration means the pool holds a viewing public key for your address:

```cairo
public_key: Map<ContractAddress, felt252>,
```

Read it directly. For the tester's account on the Sepolia pool
`0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91`:

```
get_public_key(0x063b56b1…734e)  = 0        → not registered
get_auditor_public_key()          = 0x1d17f98b…  → the pool itself is fine
```

## What writes it

`set_viewing_key` in `privacy.cairo`, and nothing else:

> Returns the server actions to register a viewing key for the first time.
> The key is immutable once set; re-registration reverts via WriteOnce enforcement.

It derives the public key from the user's private key and encrypts that private
key for the auditor. So it cannot be done without the viewing key, and the
viewing key belongs to the wallet.

## It does happen alongside a first deposit

Eight registrations landed on Sepolia in a 60,000-block window. Decoding one
(`0x1215d4a5…788a`):

```
sender    0x2b537e2f…ace5      (the same account being registered)
call 0    STRK.approve
call 1    pool, 59 felts of proof + actions
events    Approval, Transfer, ViewingKeySet, Deposit, …
```

`ViewingKeySet` **and** `Deposit`, one transaction, sent by the user. That is
what the SDK emits when `autoRegister` is set:

```ts
if (options?.autoRegister && !pool.getChannel(this.userAddress)?.publicKey) {
  actions.setViewingKey = { type: "SetViewingKey", input: { random: generateRandom() } };
}
```

So "register and shield together" is real. The question is who can ask for it.

## Not the dapp

`STRK20_ACTION` is `deposit | withdraw | transfer | invoke | shadow_account_invoke`.
There is no `set_viewing_key`. The wallet API has four methods, and every one
of them — including `strk20Balances`, which only reads — lists `NOT_REGISTERED`
among its errors. The spec says so outright:

> Registration into the pool is transparent — if the user is not registered,
> NOT_REGISTERED is returned.

`autoRegister` is an option for whoever assembles the bundle. For an action
array handed over by a dapp, that is the wallet, and Ready does not set it:
the tester's real `strk20InvokeTransaction` failed the same way its dry run
did. Note also that the pool spells its own assert `SENDER_NOT_REGISTERED`, so
a bare `NOT_REGISTERED` is the wallet's precheck, not the chain's.

The starter kit states the same division in one line:

> all through the user's wallet, **never touching a viewing key**.

## So

Register from the wallet's own privacy screen. It is one transaction, it is
write-once, and afterwards every route in this app works — including shielding
from the account panel, which is why that form now explains itself instead of
offering a button whose only outcome would be this error.

## Two things this repo got wrong first

1. That the banner should send people to their wallet — right, then changed to
   "shield here, it registers you", which was wrong.
2. That a refused dry run was not evidence the real path would refuse. Correct
   reasoning in general, and the correct call for a broken `simulate`; wrong
   here, because the wallet refuses both for the same reason.

The lesson is the one this project keeps relearning: check the source and the
chain before writing a sentence that tells someone what to do.
