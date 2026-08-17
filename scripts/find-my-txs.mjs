#!/usr/bin/env node
/* Find your own pool transactions on mainnet, by address.
 *
 * Private transactions are submitted by rotating shared relayers, so the tx
 * sender is never you and your address is absent from calldata. What the pool
 * does record is `user_addr` inside its own events — which is exactly why
 * eligibility is checked against events rather than senders. This scans pool
 * events for your address and prints the transaction hashes that carry it.
 *
 * Usage:
 *   node scripts/find-my-txs.mjs 0xYourAddress
 *   node scripts/find-my-txs.mjs 0xYourAddress --from 13400000
 *   node scripts/find-my-txs.mjs 0xYourAddress --back 200000
 */

const POOL = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

const RPCS = [
  process.env.MAINNET_RPC_URL,
  "https://rpc.starknet.lava.build",
  "https://api.cartridge.gg/x/starknet/mainnet",
].filter(Boolean);

const argv = process.argv.slice(2);
const address = argv.find((a) => a.startsWith("0x"));
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};

if (!address) {
  console.error("usage: node scripts/find-my-txs.mjs 0xYourAddress [--from N | --back N]");
  process.exit(2);
}

/* Leading-zero padding differs between wallets and explorers, so every
   comparison is numeric. */
const asBig = (v) => { try { return BigInt(v); } catch { return null; } };
const ME = asBig(address);
if (ME === null) { console.error(`not a felt: ${address}`); process.exit(2); }

let rpcIndex = 0;
async function rpc(method, params) {
  for (let attempt = 0; attempt < RPCS.length * 2; attempt += 1) {
    const url = RPCS[rpcIndex % RPCS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.result !== undefined) return body.result;
      }
    } catch { /* fall through */ }
    rpcIndex += 1;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`RPC failed: ${method}`);
}

const head = await rpc("starknet_blockNumber", []);
const from = flag("from", Math.max(0, head - flag("back", 100000)));

console.log(`\nscanning pool events for ${address}`);
console.log(`blocks ${from} → ${head} (head)\n`);

/* Account deployment is worth reporting up front: an undeployed account cannot
   register a viewing key, and the failure mode is otherwise opaque. */
try {
  const cls = await rpc("starknet_getClassHashAt", ["latest", address]);
  console.log(`account: DEPLOYED (class ${String(cls).slice(0, 18)}…)\n`);
} catch {
  console.log("account: NOT DEPLOYED — send one transaction from Ready first\n");
}

const hits = new Map(); // txHash -> { block, selectors:Set }
let scanned = 0;
let token;

for (;;) {
  const filter = {
    from_block: { block_number: from },
    to_block: "latest",
    address: POOL,
    chunk_size: 1000,
    ...(token ? { continuation_token: token } : {}),
  };
  const page = await rpc("starknet_getEvents", [filter]);
  for (const ev of page.events || []) {
    scanned += 1;
    const fields = [...(ev.keys || []), ...(ev.data || [])];
    if (fields.some((f) => asBig(f) === ME)) {
      const rec = hits.get(ev.transaction_hash) || { block: ev.block_number, selectors: new Set() };
      if (ev.keys?.[0]) rec.selectors.add(ev.keys[0]);
      hits.set(ev.transaction_hash, rec);
    }
  }
  token = page.continuation_token;
  if (!token) break;
}

console.log(`${scanned} pool events scanned, ${hits.size} carrying your address\n`);

if (hits.size === 0) {
  console.log("Nothing yet. Register a viewing key and shield, then re-run.");
  console.log("If you acted a while ago, widen the window: --back 500000\n");
  process.exit(1);
}

const ordered = [...hits.entries()].sort((a, b) => a[1].block - b[1].block);
for (const [hash, rec] of ordered) {
  console.log(`  block ${rec.block}  ${hash}`);
  for (const sel of rec.selectors) console.log(`      event ${sel}`);
}

console.log(`\nPaste into strk20.json:\n`);
console.log(JSON.stringify({ transactions: ordered.map(([h]) => h) }, null, 2));
console.log(`\nThen: node scripts/verify-strk20.mjs\n`);
