# Vendored: `@starkware-libs/starknet-privacy-sdk`

Not Airlock's code. The **built output** of StarkWare's STRK20 pool SDK, from
[`starknet-privacy`](https://github.com/starkware-libs/starknet-privacy), used
under the Apache License 2.0 (see [`LICENSE`](./LICENSE)).

| | |
|---|---|
| Upstream | `starkware-libs/starknet-privacy`, `sdk/` |
| Version | 0.14.3-rc.5 |
| Licence | Apache-2.0 |
| Form | compiled `dist/` — JavaScript and `.d.ts`, not TypeScript source |
| Modified | No |

## Why it is here, and why as built output

The package is on GitHub Packages, which needs a credential to read even when the
package is public. CI has no such credential, and adding one means a token that
can expire mid-sprint — which would stop the site deploying, during the window
where the live demo is the thing being judged. Vendoring removes that failure
mode entirely: `pnpm install --frozen-lockfile` needs nothing but npmjs.

The *built* output rather than the source, because the source pins `starknet`
`10.5.0` while this app is on `10.4.0`. Compiling it here would force one of them
to move for no benefit — the shipped JavaScript is version-agnostic in the way the
source is not. The trade is that this directory is not readable as source; read
upstream for that.

## What was left out

`dist/testing/` and `dist/browser/`. The testing entry point imports
`starknet-devnet`, `fs`, `path` and `url` — Node built-ins that have no business
in a browser bundle, and which a bundler would either fail on or silently shim.
Everything remaining was checked to import nothing Node-only.

## How it is wired

The bridge engine in `../bridge-core` imports this by its package name. Rather
than edit seven files inside a dependency that is otherwise byte-identical to
upstream, the name is aliased to this directory in two places that must stay in
step:

- `vite.config.ts` → `resolve.alias`, which resolves the **bundle**
- `tsconfig.app.json` → `paths`, which resolves the **types**

Change one and not the other and it breaks in only one of build or typecheck,
which is the slowest kind of mistake to find.

## Runtime dependencies

`starknet` (already used directly by this app), plus `zod`, `ohttp-ts` and
`hpke` — all from npmjs.

`hpke` is pinned rather than ranged, and is declared even though this app never
imports it: the SDK's own `package.json` does not declare it either, relying on
`ohttp-ts` hoisting its transitive copy. That works until an installer hoists
differently, and then the proving client fails at runtime rather than at install.
The pin is the version `ohttp-ts@0.3.0` itself depends on.

## Upgrading

Build upstream (`npm install && npm run build` in `sdk/`), then:

```bash
rsync -a --exclude='testing/' --exclude='browser/' --exclude='*.map' \
  <starknet-privacy>/sdk/dist/ app/vendor/starknet-privacy-sdk/dist/
```

Update the version above and in `package.json` here, then re-check that nothing
Node-only crept into the non-testing output:

```bash
grep -rlE "from ['\"](fs|path|url|starknet-devnet)['\"]" dist --include=*.js
```
