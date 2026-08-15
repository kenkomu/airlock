# strk20-treasury

**Private treasury operations on Starknet.** A treasury whose members can verify solvency without seeing every transaction, and whose operators can spend only inside a policy they cannot exceed.

Built for the [STRK20 Private Sprint](https://github.com/starkience/strk20-hackathon) on the Starknet privacy pool.

> **Status: early.** Sprint runs 14–31 August 2026. This README describes what is being built; see [What works today](#what-works-today) for what is actually running.

## The problem

An on-chain treasury today forces a bad trade. Run it transparently and you publish your runway, your payroll, your counterparties, and every position you hold — to competitors and to anyone deciding whether to negotiate with you. Run it through a multisig with off-chain accounting and your own members lose the ability to verify you are solvent.

Neither half of that trade is necessary. Solvency is a fact that can be proven without disclosing its components.

## What this is

Three things over shielded balances in the STRK20 pool:

- **Scoped spending policy.** A manager can deploy up to a capped amount into whitelisted protocols. A trader can trade but not withdraw. Authority is bounded by the policy the treasury enforces, not by the trust placed in a key. A compromised operator key still cannot spend outside its scope.
- **Private execution.** Deployments and transfers run through the pool, so counterparties, recipients and internal allocation are not published as a side effect of operating.
- **Provable solvency.** Members and auditors can verify the treasury holds what it claims, and that spending stayed inside policy, without a per-transaction ledger being made public.

## What is and isn't private

Being precise about this matters more than it sounds; overclaiming is the standard way privacy projects mislead their users.

| Public | Private |
|---|---|
| Deposits into the pool: address, token, amount | Internal transfers: parties and amounts |
| Withdrawals: destination and amount | Which deposit a given withdrawal came from |
| That the treasury interacted with a protocol, and the amounts | Which operator initiated it, and the treasury's total position |
| Policy rules themselves, where published for verifiability | Allocation between line items |

Deployments into public venues route through shared anonymizer contracts, so **amounts and timing remain visible**. The anonymity comes from the shared address and the mixing set. A distinctive amount executed shortly after a distinctive deposit is correlatable. This project claims identity privacy for treasury operations; it does not claim amount privacy for on-venue actions.

## Approach

| Layer | Route |
|---|---|
| Private transfers, shield, unshield | [Starknet Wallet API](https://strk20-by-example.org/starknet-wallet-api/overview) via `starknet.js` `WalletAccountV6` — the wallet holds the viewing key and generates proofs; this app never sees either |
| Deployment into whitelisted protocols | An app-specific [`privacy_invoke`](https://strk20-by-example.org/helpers/privacy-invoke) anonymizer contract, starting from the Vesu lending reference helper |
| Swaps | [AVNU private swaps](https://strk20-by-example.org/starknet-wallet-api/avnu-private-swaps) (`@avnu/avnu-sdk`), paymaster-relayed |
| Policy enforcement | Cairo, enforced at the anonymizer boundary rather than in the frontend |

Policy is enforced on-chain at the point the pool calls the helper. A frontend that forgets a check, or an operator who bypasses the frontend entirely, still cannot execute outside policy.

## Network

| | |
|---|---|
| Mainnet pool | [`0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`](https://voyager.online/contract/0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a) |
| Sepolia pool | `0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91` |

Deployed contract addresses will be listed here and in `strk20.json` as they land.

## What works today

Nothing is deployed yet. This section is updated as pieces land, and is the honest answer to "can I use this".

- [ ] Wallet connection and shielded balance read
- [ ] Private transfer between treasury members
- [ ] Policy contract: caps and protocol whitelist
- [ ] Anonymizer helper for whitelisted deployment
- [ ] Solvency proof and verifier
- [ ] Mainnet deployment

## Running locally

```bash
npm install
npm run dev
```

Requires a privacy-enabled Starknet wallet (Ready). Note the version pins — STRK20 support landed in `starknet` 10.4.0 and ships on the npm `next` tag; a bare install resolves to 10.0.x, which has none of the STRK20 API.

```bash
npm install starknet@^10.4.0
npm install @starknet-io/get-starknet-discovery@6.0.2 @starknet-io/get-starknet-wallet-standard@6.0.2
```

## Prior work

The policy-enforcement model here follows [tollgate](https://github.com/kenkomu/tollgate), an enforcement layer for autonomous agent spending built on Arc, where a compromised agent key still cannot spend outside its policy. This applies that idea to a treasury, over shielded balances.

## References

- [STRK20 by example](https://strk20-by-example.org/what-is-strk20)
- [Privacy SDK](https://github.com/starkware-libs/starknet-privacy)
- [Awesome STRK20](https://github.com/Akashneelesh/awesome-strk20)
- [STRK20 starter kit](https://github.com/Akashneelesh/strk20-starter-kit)

## License

MIT
