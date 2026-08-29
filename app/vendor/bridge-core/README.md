# Vendored: `@starkware-libs/starknet-privacy-bridge`

This directory is **not Airlock's code**. It is a verbatim copy of the
`packages/bridge-core` sources from StarkWare's
[`privacy-bridge`](https://github.com/starkware-libs/privacy-bridge), used under
the Apache License 2.0 (see [`LICENSE`](./LICENSE)).

| | |
|---|---|
| Upstream | `starkware-libs/privacy-bridge`, `packages/bridge-core` |
| Package name | `@starkware-libs/starknet-privacy-bridge` |
| Version | 0.1.19 |
| Licence | Apache-2.0 |
| Modified | **Yes** — four files, listed below |

## Why it is vendored rather than installed

The package is published to GitHub Packages, and that registry answers
`403 permission_denied: read_package` for it. Vendoring the Apache-2.0 sources is
the licensed way to depend on code we cannot fetch.

## What is wired up so far

`derivation/`, `lib/ethereum.ts`, and the `core/` orchestrators — `moveIntoPool`
(the deposit) and `bridgeOut` (the withdrawal) — which is why `viem` and
`@starkware-libs/starknet-privacy-sdk` are now in `package.json`. The SDK is
vendored alongside this directory and mapped by name in `vendorAlias.ts`, so the
build needs no GitHub Packages credential.

## Modifications

Apache-2.0 §4(b) asks that changed files say so. Each change is marked inline
with an `AIRLOCK:` comment at the point of the edit.

| File | Change | Why |
|---|---|---|
| `core/config.ts` | `rpcUrl` / `proverUrl` / `indexerUrl` take an absolute-URL override (`STARKNET_RPC_URL`, `PROVER_URL`, `INDEXER_URL`) | Upstream hardcodes same-origin paths — `/rpc`, `/prover`, `/indexer` — which assume a Vite dev proxy or an OHTTP gateway rewrites them. Airlock is a static site with neither, so every engine-side RPC call went to its own origin and failed. |
| `core/proven-submit.ts` | `getManagerAccount` falls back to an account nominated by the new `setProvenFallbackPayer` | Upstream submits the proven pool legs from an AVNU paymaster or an admin manager. A production build can have neither — `resolveAdmin` returns undefined whenever `prod` is set — so register, deposit and withdraw had no sender at all. The proof binds no sender (`validate_proof` hashes the actions, the pool and its class hash, never an account), so the user's own account is a valid one; it is then the account `collect_fee()` charges. |
| `core/moveIntoPool.ts` | Calls `setProvenFallbackPayer` once the user's key is derived | Same reason — the deposit needs a payer. |
| `core/bridgeOut.ts` | Same, at both derivation sites | Same reason — the withdrawal needs a payer. |

A configured paymaster or admin still wins over the fallback, so turning either
on later needs no change here.

## What was left out

Upstream's 123 `*.test.ts` / `*.test.tsx` files, its `vitest` config and package
scaffolding — and, deliberately, **the whole `src/react/` subtree**.

Dropping `react/` is not a size optimisation. That subtree is the only thing in the
package that reaches for `@walletconnect/ethereum-provider`, whose transitive tree
(`@reown/appkit`, `@base-org/account`, …) is larger than everything else here put
together, and it is the only part that imports React at all. `core/`, `lib/` and
`derivation/` are pure logic with no DOM and no framework.

So Airlock takes the engine and supplies its own wallet layer — which it was always
going to do, since it already has EIP-6963-style discovery written for Starknet
wallets in `src/lib/wallet.ts` and its own conventions for connection state. What is
lost is upstream's convenience hooks (`useMoveIntoPool`, `useReturn`, …); those wrap
the same orchestrators this directory still exports.

Dropping the tests means **upstream's guarantees are not re-verified here**. Airlock
tests its own integration against this code; it does not re-test the bridge itself.

## How it is treated by the build

Not quarantined from typechecking, and deliberately so. Airlock imports these files
as source, which pulls them into its own `tsc` program — so our *usage* of the
bridge is fully typed, and the vendored code passes Airlock's `strict` settings
unmodified. That was checked rather than hoped for: it has no enums, no namespaces
and no parameter properties, so it satisfies `erasableSyntaxOnly` too.

It **is** excluded from lint (`ignorePatterns: ["vendor/**"]` in `.oxlintrc.json`).
Style here is upstream's business, and a rule tightened later must not fail this
project's CI on code it did not write.

## Upgrading

Re-copy from a checkout of upstream:

```bash
rsync -a --exclude='*.test.ts' --exclude='*.test.tsx' \
  <privacy-bridge>/packages/bridge-core/src/ app/vendor/bridge-core/src/
```

Then update the version in the table above, and run `pnpm build && pnpm test`.
Upstream pins `starknet` `10.0.0-beta.6` as a peer dependency; that pin is stale
relative to its own SDK dependency, and the sources typecheck cleanly against the
`10.4.0` this app uses. Re-check that after any upgrade rather than assuming it.
