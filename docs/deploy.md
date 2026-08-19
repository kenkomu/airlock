# Deploying AirlockBucketer

One command does the whole thing:

```sh
scripts/deploy.sh sepolia            # or: mainnet
scripts/deploy.sh mainnet --dry-run  # estimate the fee, send nothing
```

What follows is what that command does and the two things it needs from you.

## The deployer account is disposable

`AirlockBucketer` has **no owner, no admin key, no upgrade path and no mutable
storage**. Everything it will ever do is fixed by three constructor arguments.
The account that deploys it therefore holds no privileged position afterwards —
losing that key later costs nothing, and there is no key to rotate or guard.

So use a throwaway rather than your real wallet:

```sh
sncast --profile sepolia account create --name airlock-deployer
```

The keypair is written to `~/.starknet_accounts/starknet_open_zeppelin_accounts.json`,
**outside this repository**. Nothing in the repo references it by path, and
`.gitignore` refuses `*accounts*.json` / `*keystore*.json` as a backstop. No
`VITE_*` variable, `.env` file, or committed config may ever hold a signing key.

## The two things it needs from you

**1. Fund the deployer.** Account deployment on Sepolia estimates at
**~0.095 STRK**; declare and deploy come on top. Send Sepolia STRK to the
address `account create` printed, from
[the Starknet faucet](https://starknet-faucet.vercel.app/) or your own wallet.
Then:

```sh
sncast --profile sepolia account deploy --name airlock-deployer
```

**2. Confirm mainnet.** `scripts/deploy.sh mainnet` will not send anything until
you type `DEPLOY TO MAINNET` exactly. `--dry-run` skips the prompt because it
sends nothing.

## The three constructor arguments

| Argument | Sepolia | Mainnet |
| --- | --- | --- |
| `pool` | `0x254a6b29…345623b2` | `0x040337b1…6ffe812a` |
| `token` | `0x0512feAc…feeD8343` (USDC) | `0x033068F6…e93b35fb` (USDC) |
| `unit` | `1000000` | `1000000` |

Both pool addresses and both token addresses are re-checked against the live
chain with `starknet_getClassHashAt` on **every run**, before anything is spent.
A constructor argument cannot be corrected afterwards, so a stale constant in
the script has to fail loudly rather than quietly deploy a dead contract.

### Choosing `unit`

`unit` is the base-unit value of one rung, and USDC has 6 decimals, so
`1000000` makes the ladder run **1000, 500, 250, 100, 50, 25, 10, 5, 1 USDC**.
That is the deployment to point the app at.

It also means amounts must be whole USDC: `847.32` is not on the ladder and
`decompose` rejects it rather than silently rounding. The client picks a
bucketable figure and leaves the remainder in the shielded balance as change.

`--unit 100000` gives a 0.1-USDC ladder, useful when a demo should not cost
several dollars per run. Deploying both is fine and cheap — one declared class,
two deployments — because a ladder is per-deployment, not per-class. The
tradeoff is real, though: **splitting the same token across two ladders splits
its anonymity set**, so pick one for the app to actually use.

## Re-running is safe

The class is declared once per network. The script asks the chain whether the
class hash already exists and skips the declare if it does, so a run that failed
at the deploy step can simply be run again.

## Verification

After deploying, the script reads `pool()`, `token()` and `unit()` back off the
chain and compares them to what it asked for. A mismatch aborts with a warning
not to use that deployment. This is not ceremony: with no setters, a deployment
carrying a wrong address is dead, and the only safe response is to deploy again.

Finally, publish the source so the class can be checked against it:

```sh
sncast --profile mainnet verify --contract-address <addr> \
  --contract-name AirlockBucketer --verifier voyager --network mainnet
```

## After a mainnet deploy

1. Add the address to `strk20.json` → `contracts`.
2. Add a row to `docs/mainnet.md`.
3. Point the app's config at it.
