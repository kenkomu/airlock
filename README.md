# Airlock

**One-click privacy from any chain.** Step in on one chain, the door seals behind you, step out on another. No on-chain link between the two sides.

Built on the [STRK20](https://strk20-by-example.org/what-is-strk20) privacy pool for the [Private Sprint](https://github.com/starkience/strk20-hackathon) — [RFP-09, cross-chain privacy hub](https://strk20.starknet.io/rfp/cross-chain-privacy-hub).

> **Status: early.** Sprint runs 14–31 August 2026. This README states the design and the honest privacy claim. See [What works today](#what-works-today) for what is actually running.

## The idea

> "I have 10 ETH on Arbitrum. I want to send 5 ETH to a fresh address without anyone linking the two."

Most crypto users are not on Starknet, and shouldn't have to be. Airlock lets someone connect the wallet they already have, move value into the STRK20 privacy pool, hold it privately, and withdraw to a **different chain** — without installing a Starknet wallet, holding STRK, or thinking about Starknet at all. Starknet is the engine, not the destination.

The name is the mechanism. You enter, the door seals, a different door opens elsewhere. There is no moment when both doors are open at once.

## What is and isn't private

Being precise here matters more than it sounds. Overclaiming is how privacy tools mislead the people who most need them to work.

| Public | Private |
|---|---|
| The deposit leg: source address, token, amount | Movement inside the pool: parties, amounts, token |
| The withdrawal leg: destination address, token, amount | Which deposit a given withdrawal came from |
| That an address interacted with the pool, and when | Which notes were spent (nullifiers are unlinkable without the viewing key) |

**Airlock claims one thing: that the deposit side and the withdrawal side are not linkable on-chain.** It does not hide that you used a privacy pool, and it does not hide the amounts at the edges.

### The timing caveat, stated plainly

The protocol's own documentation names rapid in-and-out sequences as a real weakness: opening a channel and withdrawing in tight succession can link a recipient to their public activity, and distinctive amounts moved quickly weaken the anonymity set.

So a two-minute round trip is **not** as private as the interface would like to imply. Airlock treats the dwell time between entering and leaving as part of the product rather than as latency: before you withdraw, it shows you the current anonymity set and flags timing and amount patterns that would make your two sides correlatable. A tool that lets you leave immediately while telling you it's private is worse than no tool.

## Design

The protocol constrains this more than it first appears, and the architecture below follows from those constraints rather than from preference.

| Constraint | Consequence |
|---|---|
| You cannot register a viewing key on another user's behalf | A Starknet account is derived deterministically from the signature the user gives on their own chain, and registers itself |
| At most one `InvokeExternal` per pool transaction | The round trip cannot be atomic; it is a resumable multi-transaction job with off-chain orchestration |
| Deposits are screened on-chain by the protocol | Screening rejection is a first-class user-facing state, not an error toast |

**Flow**

1. **Sign once** on the source chain (MetaMask). The Starknet account key and viewing key are derived from that single signature. Only the read-only viewing key is ever persisted.
2. **Register** the derived account (`SetViewingKey`), gas sponsored so the user never holds STRK.
3. **Bridge in** over Circle CCTP; an inbound anonymizer binds the attested cross-chain message to a private note in one transaction.
4. **Hold.** Anonymity set and correlation risk are surfaced here.
5. **Withdraw to a different chain** through the outbound anonymizer.

**Stack**

| Layer | Choice |
|---|---|
| Cross-chain value movement | [`privacy-bridge`](https://github.com/starkware-libs/privacy-bridge) (`bridge-core`, Apache-2.0) over Circle CCTP |
| Pool actions from the app | [Starknet Wallet API](https://strk20-by-example.org/starknet-wallet-api/overview) via `starknet.js` `WalletAccountV6` — the wallet holds the viewing key and proves; this app never sees either |
| `PrivacyHub` orchestration | An app-specific [`privacy_invoke`](https://strk20-by-example.org/helpers/privacy-invoke) anonymizer contract in Cairo |

## Scope

Deliberately one lane, taken all the way to mainnet, rather than four half-finished ones.

**In:** one EVM source chain (Base or Arbitrum), USDC, deposit on chain A → withdraw on chain B, timing and anonymity-set disclosure.

**Out for now:** Solana, arbitrary ERC-20s, StarkGate/LayerSwap/Orbiter wrappers, anything requiring sub-accounts or confidential compute (not shipped).

## What works today

This list is the honest answer to "can I use this", and is updated as pieces land. Nothing of our own is deployed yet.

- [x] Mainnet — three verified pool transactions, listed in [`strk20.json`](strk20.json)
- [x] Anonymity-set and timing disclosure — reads the live mainnet pool, no wallet needed
- [x] Denomination bucketing and exposure assessment
- [x] Connect a privacy-enabled Starknet wallet (Starknet Wallet API, `WalletAccountV6`)
- [x] Shielded balance view — `strk20Balances` through the connected wallet
- [x] **`AirlockBucketer` anonymizer in Cairo** — denomination bucketing, the mitigation StarkWare's threat model defers. 39 snforge tests including full cycles against a pool mock, see [docs/anonymizer.md](docs/anonymizer.md)
- [ ] Anonymizer deployed to mainnet
- [ ] Deterministic Starknet account derived from an EVM signature
- [ ] Registration with sponsored gas
- [ ] Bridge in: CCTP → private note
- [ ] Withdraw to a different chain

## Running locally

```bash
npm install
npm run dev
```

Requires a privacy-enabled Starknet wallet (Ready). **Pin the versions** — STRK20 support landed in `starknet` 10.4.0 and ships on the npm `next` tag; a bare install resolves to 10.0.x, which contains none of the STRK20 API.

```bash
npm install starknet@^10.4.0
npm install @starknet-io/get-starknet-discovery@6.0.2 @starknet-io/get-starknet-wallet-standard@6.0.2
```

## Network

| | |
|---|---|
| Mainnet pool | [`0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`](https://voyager.online/contract/0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a) |
| Sepolia pool | `0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91` |

Deployed contract addresses will be listed here and in `strk20.json` as they land.

## References

- [STRK20 by example](https://strk20-by-example.org/what-is-strk20) — the pool, notes and nullifiers, viewing keys, anonymizer contracts
- [starknet-privacy](https://github.com/starkware-libs/starknet-privacy) — pool contracts, TypeScript SDK, proving service
- [privacy-bridge](https://github.com/starkware-libs/privacy-bridge) — EVM ↔ pool value movement over CCTP
- [Awesome STRK20](https://github.com/Akashneelesh/awesome-strk20) — SDKs, helper contracts, proof-of-concept apps

## License

MIT
