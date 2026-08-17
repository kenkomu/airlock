#!/usr/bin/env node
/* Self-check for strk20.json, mirroring the hub indexer's own verification.
 *
 * The hub re-indexes every 30 minutes; this answers the same question now.
 * A transaction counts only if it exists on mainnet, SUCCEEDED, and emitted at
 * least one event from the pool contract — a tx that merely *called* the pool
 * but reverted, or that touched a helper without reaching the pool, does not.
 *
 * Usage: node scripts/verify-strk20.mjs
 */

import { readFile } from "node:fs/promises";

const POOL = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";
const MIN_TXS = 3;
const MAX_READ = 10; // the indexer reads at most the first ten

/* Public mainnet RPCs rate-limit under a burst, so fall through a list rather
   than failing the whole run on one 429. */
const RPCS = [
  process.env.MAINNET_RPC_URL,
  "https://rpc.starknet.lava.build",
  "https://api.cartridge.gg/x/starknet/mainnet",
].filter(Boolean);

/* Padding differs between tools (0x04… vs 0x4…), so compare numerically. */
const sameAddress = (a, b) => {
  try { return BigInt(a) === BigInt(b); } catch { return false; }
};

async function rpc(method, params) {
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) continue;
      const body = await res.json();
      if (body.error) continue;
      if (body.result) return body.result;
    } catch { /* next endpoint */ }
  }
  return null;
}

const manifest = JSON.parse(await readFile(new URL("../strk20.json", import.meta.url), "utf8"));
const declared = Array.isArray(manifest.transactions) ? manifest.transactions : [];

console.log(`\nstrk20.json — ${declared.length} transaction(s) declared\n`);

let verified = 0;
for (const raw of declared.slice(0, MAX_READ)) {
  const hash = typeof raw === "string" ? raw.trim() : "";
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(hash)) {
    console.log(`  INVALID  ${JSON.stringify(raw)} is not a transaction hash`);
    continue;
  }
  const receipt = await rpc("starknet_getTransactionReceipt", [hash]);
  const short = `${hash.slice(0, 12)}…${hash.slice(-6)}`;
  if (!receipt) {
    console.log(`  MISSING  ${short} not found on mainnet`);
    continue;
  }
  if (receipt.execution_status !== "SUCCEEDED") {
    console.log(`  REVERTED ${short}`);
    continue;
  }
  const touchedPool = (receipt.events || []).some((e) => sameAddress(e.from_address, POOL));
  if (!touchedPool) {
    console.log(`  NO POOL  ${short} succeeded but emitted no pool event`);
    continue;
  }
  console.log(`  OK       ${short}`);
  verified += 1;
}

const req = {
  mainnet: verified >= MIN_TXS,
  demo: !!manifest.demo_url,
  video: !!manifest.demo_video,
};

console.log(`\n  verified: ${verified}/${MIN_TXS}\n`);
console.log("requirements the hub will show:");
for (const [name, met] of Object.entries(req)) {
  console.log(`  ${met ? "[x]" : "[ ]"} ${name}`);
}
console.log(
  Object.values(req).every(Boolean)
    ? "\nStatus: finished\n"
    : "\nStatus: building\n",
);

/* Non-zero exit when mainnet eligibility is not yet met, so this can gate CI. */
process.exit(req.mainnet ? 0 : 1);
