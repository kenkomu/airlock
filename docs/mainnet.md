# Mainnet reference

Every address below was read from `starkware-libs/privacy-bridge`
(`packages/bridge-core/src/core/config.ts`, `bridge-core` v0.1.19) and then
verified live on Starknet mainnet with `starknet_getClassHashAt`.

**No keys, RPC credentials, or account addresses belong in this file.** These are
public contract addresses only.

## Starknet mainnet

| Contract | Address | Class |
| --- | --- | --- |
| STRK20 privacy pool | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` | `0x67dddd89…` |
| OutboundAnonymizer (pool → CCTP) | `0x009067f35d2cab3cb933f3d78793660402026f8fa31e041ca2cab4a8e9a49092` | `0x16c16379…` |
| InboundAnonymizer (CCTP → pool) | `0x03a7e7f34e530f8ec00b1ff7eaca90a136311d9da7cb17a73203f813b56c86cb` | `0x533023c9…` |
| USDC (native Circle) | `0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb` | `0x78a35738…` |
| CCTP TokenMessengerMinterV2 | `0x07d421B9cA8aA32DF259965cDA8ACb93F7599F69209A41872AE84638B2A20F2a` | `0x3de0c68d…` |
| CCTP MessageTransmitterV2 | `0x02EBB5777B6dD8B26ea11D68Fdf1D2c85cD2099335328Be845a28c77A8AEf183` | `0x1a82c735…` |

Both anonymizers were deployed by StarkWare on 14–15 July 2026 and are
byte-identical to the canonical `bridge-anonymizers` build (scarb 2.19.1),
verified by class-hash match. **Airlock deploys neither** — it points at these.

## Airlock's own deployments

| Contract | Network | Address |
| --- | --- | --- |
| AirlockBucketer (`unit` = 1 USDC) | Sepolia | `0x004c368ae058ee81b61884c5c47ee57484c4348669b66ac606366bbd1fd1b1fb` |
| AirlockBucketer | mainnet | not yet deployed |

Class hash `0x010ed58b30d78be2e4328abeb970c5d4650eb088ec1cf1d79a0ba81e4809c686`,
declared on Sepolia in
[`0x0339892f…`](https://sepolia.voyager.online/tx/0x0339892fc74b1f3408de8e91575a4cb2ff2790942e6af5898a97677734dbbb98).
`pool()`, `token()` and `unit()` were read back off the chain after deployment
and match the constructor arguments. The live ladder reads:

```
1000, 500, 250, 100, 50, 25, 10, 5, 1 USDC
```

and `plan(847_000_000)` returns `500 + 250 + 50 + 25 + 10 + 10 + 1 + 1`, while
`plan(847_320_000)` reverts `NOT_ON_LADDER` — the same results the local suite
asserts, now confirmed against a deployed contract rather than a mock.

See [deploy.md](deploy.md).

## Chain constants

| Key | Mainnet | Sepolia |
| --- | --- | --- |
| Chain ID | `0x534e5f4d41494e` (`SN_MAIN`) | `0x534e5f5345504f4c4941` |
| CCTP domain (Starknet) | `25` | `25` |
| Circle Iris attestation API | `https://iris-api.circle.com` | `https://iris-api-sandbox.circle.com` |
| EVM TokenMessengerV2 (shared) | `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| Default EVM chain | Polygon `137` | Polygon Amoy `80002` |
| Return dapp tag | `pmp-return` (frozen; must match the contract) | same |

Starknet is a **native CCTP domain (25)**. Transfers do not hop through
Ethereum, and no custodial relayer sits in the path.

## Still unresolved

Two values remain `TODO` in the protocol's own
`demo/.env.mainnet.example` and are not published anywhere:

- mainnet **discovery / indexer** URL
- mainnet **proving service** URL

These constrain the low-level SDK route only. On the wallet-API route the wallet
supplies both. Do not guess at them — a wrong proving service fails in ways that
look like a bug in your own code.

## Pinned toolchain

From `privacy-bridge/.tool-versions` and `.nvmrc`:

```
scarb             2.19.1
starknet-foundry  0.62.1
node              20.14.0
```

Peer dependencies pinned by `bridge-core`:

```
viem      ^2.21.0
starknet  10.0.0-beta.6     # not the 10.7.x on npmjs
```

## Package installation

`@starkware-libs/starknet-privacy-sdk` and
`@starkware-libs/starknet-privacy-bridge` publish to **GitHub Packages**, not
npmjs.org. Authenticate once, at user level:

```sh
npm config set "//npm.pkg.github.com/:_authToken" "$(gh auth token)"
```

The token needs the `read:packages` scope (`gh auth refresh -s read:packages`).
pnpm deliberately does not expand `${ENV}` in credential lines read from a
committed `.npmrc`, so this must live in `~/.npmrc`.
