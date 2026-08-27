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
| Modified | No — sources are copied unchanged |

## Why it is vendored rather than installed

The package is published to GitHub Packages, and that registry answers
`403 permission_denied: read_package` for it — unlike the pool SDK next to it,
which is readable and *is* installed as an ordinary dependency. Vendoring the
Apache-2.0 sources is the licensed way to depend on code we cannot fetch, and it
has a side benefit worth keeping: CI needs no credential to build the site, so a
token expiring mid-sprint cannot take the live demo down.

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
