# Development setup

Verified working on 17 August 2026. Every step below was run end-to-end; the
non-obvious ones are the reason this file exists.

## 1. Registry access

The privacy SDK is published to **GitHub Packages**, not npmjs.org. A token with
the `read:packages` scope must live in your **user-level** `~/.npmrc` — pnpm
refuses to expand `${ENV}` in credential lines from a committed `.npmrc`, so the
project's own file carries the scope mapping and no credential.

```sh
# a classic PAT with read:packages only
npm config set "//npm.pkg.github.com/:_authToken" "ghp_..."
```

`gh auth refresh -s read:packages` also works, but the OAuth device flow has to
be completed in the browser or the old token silently stays in the keyring —
check with `gh auth status | grep -i 'token scopes'`.

> `@starkware-libs/starknet-privacy-bridge` (bridge-core) returns **403** even
> with `read:packages`. It is versioned in the repo but not published for public
> read. Consume it from the monorepo workspace, not the registry.

## 2. Node and pnpm

```sh
nvm install 20.14.0 && nvm use 20.14.0   # .nvmrc pin; engines allows >=20.14.0
npm i -g corepack@latest                 # REQUIRED, see below
corepack enable
corepack prepare pnpm@10.34.5 --activate # packageManager pin
```

The corepack bundled with Node 20.14.0 fails with `Cannot find matching keyid`
— its pinned signing keys predate a key rotation. Upgrading corepack fixes it.
This is a corepack bug, not a repo problem.

## 3. Cairo toolchain

Pinned by `privacy-bridge/.tool-versions`:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh | sh -s -- -v 2.19.1
curl -sL https://raw.githubusercontent.com/foundry-rs/starknet-foundry/master/scripts/install.sh | sh
snfoundryup -v 0.62.1
```

## 4. Reference checkouts

```sh
git clone https://github.com/starkware-libs/privacy-bridge.git
git clone https://github.com/starkware-libs/starknet-privacy.git
```

## Verified green

Run from the `privacy-bridge` root:

| Command | Result |
| --- | --- |
| `pnpm install` | 634 packages, SDK resolved from GitHub Packages |
| `pnpm build` | bridge-core + demo app both build |
| `pnpm test` | **1400 passed** across 122 files |
| `scarb build` | `bridge_anonymizers` compiles |
| `scarb test` | **17 passed**, 0 failed |

Two build scripts are blocked by the repo's supply-chain policy
(`@reown/appkit`, `esbuild`). Builds and tests pass regardless; run
`pnpm approve-builds` only if the Vite dev server misbehaves.
