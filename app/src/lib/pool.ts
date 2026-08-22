/* Live reads of the STRK20 privacy pool.
 *
 * Everything here is public chain state — no viewing key, no wallet, no proving
 * service. That matters: the anonymity panel has to work for a visitor who has
 * connected nothing, because its whole job is to let someone judge the pool
 * before trusting it with funds.
 */

export const POOL_MAINNET =
  '0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a';
export const POOL_SEPOLIA =
  '0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91';

/* Event selectors, recovered by starknet_keccak preimage search against the
   pool's own event stream (the SDK's abi export is not vendored here). */
export const EV_VIEWING_KEY_SET =
  '0x1321a492485b4f19851fb787ab3800a0030b595332cba93cd5fe40dfb5a4daf';
export const EV_DEPOSIT =
  '0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2';

export const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d': {
    symbol: 'STRK',
    decimals: 18,
  },
  '0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb': {
    symbol: 'USDC',
    decimals: 6,
  },
  '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7': {
    symbol: 'ETH',
    decimals: 18,
  },
  '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8': {
    symbol: 'USDT',
    decimals: 6,
  },
  '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8': {
    symbol: 'USDC.e',
    decimals: 6,
  },
  /* Both found by scanning the mainnet pool's own deposit stream and calling
     symbol()/decimals() on the addresses that appeared: the pool takes tokens
     this list did not know about, and 9 of the last 95 deposits were them. */
  '0x02ab526354a39e7f5d272f327fa94e757df3688188d4a92c6dc3623ab79894e2': {
    symbol: 'SLAY',
    decimals: 18,
  },
  '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac': {
    symbol: 'WBTC',
    decimals: 8,
  },
};

/* Public endpoints, tried in order. A single provider rate-limits partway
   through a multi-page scan, which would otherwise report a wrong, quietly
   truncated anonymity set — the one number this app must never get wrong. */
const RPCS = [
  'https://rpc.starknet.lava.build',
  'https://api.cartridge.gg/x/starknet/mainnet',
];

type RpcResult<T> = { result?: T; error?: { message?: string } };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastError = 'no endpoint reached';
  for (let attempt = 0; attempt < RPCS.length * 2; attempt += 1) {
    const url = RPCS[attempt % RPCS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const body = (await res.json()) as RpcResult<T>;
      if (body.error) {
        lastError = body.error.message ?? 'rpc error';
        continue;
      }
      if (body.result !== undefined) return body.result;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastError);
}

export interface PoolEvent {
  keys: string[];
  data: string[];
  block_number: number;
  transaction_hash: string;
}

export interface AnonymitySnapshot {
  /* Window actually scanned, in blocks. */
  fromBlock: number;
  headBlock: number;
  /* Deposits are the join-set: you hide among people who deposited the same
     token in the same window. */
  deposits: number;
  registrations: number;
  totalEvents: number;
  uniqueTxs: number;
  /* Deposit count per token symbol, biggest first. */
  byToken: { symbol: string; deposits: number }[];
  /* Deposits of a token this build does not have a symbol for. They still
     happened and they are still part of the window, so they are counted and
     shown rather than dropped — see `tallyEvents`. */
  unidentified: number;
  /* True when pagination was cut short — the numbers are then a floor, not a
     count, and the UI must say so rather than round it into a claim. */
  truncated: boolean;
  /* Transaction hashes carrying a deposit, for the concentration scan. */
  depositTxs: string[];
}

export async function getHeadBlock(): Promise<number> {
  return rpc<number>('starknet_blockNumber', []);
}

const asBig = (v: string): bigint | null => {
  try {
    return BigInt(v);
  } catch {
    return null;
  }
};

const TOKEN_KEYS = Object.keys(TOKENS).map((a) => [a, BigInt(a)] as const);

export interface Tally {
  deposits: number;
  registrations: number;
  totalEvents: number;
  txs: Set<string>;
  perToken: Map<string, number>;
  /* Deposits whose token matched nothing in TOKENS. */
  unidentified: number;
  /* Transaction hashes carrying a deposit, so the depositors behind them can be
     counted later. Kept separate from `txs`, which is every pool transaction. */
  depositTxs: string[];
}

export const emptyTally = (): Tally => ({
  deposits: 0,
  registrations: 0,
  totalEvents: 0,
  txs: new Set(),
  perToken: new Map(),
  unidentified: 0,
  depositTxs: [],
});

/* Fold one page of pool events into a running tally.
 *
 * Split out from the scan so it can be tested without a network: this is where
 * the anonymity numbers are actually decided, and it is the one part of the
 * panel that must not be wrong.
 *
 * The `unidentified` counter is the point. The pool accepts any token, and
 * TOKENS is a hand-maintained list that will always trail it — SLAY and WBTC
 * were both live in the pool before this list knew them. A deposit whose token
 * we cannot name still enlarges the window and still belongs to somebody, and
 * dropping it silently is the specific failure this panel exists to prevent:
 * a user depositing an unlisted token would see no row for it and therefore no
 * thin-crowd warning, which is exactly when the warning matters most.
 */
export function tallyEvents(events: PoolEvent[], acc: Tally): Tally {
  for (const ev of events) {
    acc.totalEvents += 1;
    acc.txs.add(ev.transaction_hash);
    const sel = ev.keys?.[0];
    if (sel && asBig(sel) === asBig(EV_DEPOSIT)) {
      acc.deposits += 1;
      acc.depositTxs.push(ev.transaction_hash);
      /* Deposit carries (user_addr, token, amount); find the token by matching
         any field against the known set rather than trusting a fixed index,
         since key/data packing differs by Cairo version. */
      let named = false;
      for (const field of [...(ev.keys ?? []), ...(ev.data ?? [])]) {
        const v = asBig(field);
        if (v === null) continue;
        const hit = TOKEN_KEYS.find(([, big]) => big === v);
        if (hit) {
          const sym = TOKENS[hit[0]].symbol;
          acc.perToken.set(sym, (acc.perToken.get(sym) ?? 0) + 1);
          named = true;
          break;
        }
      }
      if (!named) acc.unidentified += 1;
    } else if (sel && asBig(sel) === asBig(EV_VIEWING_KEY_SET)) {
      acc.registrations += 1;
    }
  }
  return acc;
}

/* Scan a recent window of pool events.
 *
 * The window is deliberate. A lifetime total flatters the pool: what actually
 * protects a user is the crowd sharing their token and their time window, so a
 * recent count is both the smaller number and the honest one. `maxPages` caps
 * the work so a browser tab cannot hang on a busy pool — and when the cap is
 * hit we report `truncated` instead of a confident wrong number. */
export async function scanAnonymitySet(opts?: {
  pool?: string;
  windowBlocks?: number;
  maxPages?: number;
}): Promise<AnonymitySnapshot> {
  const pool = opts?.pool ?? POOL_MAINNET;
  const windowBlocks = opts?.windowBlocks ?? 200_000;
  const maxPages = opts?.maxPages ?? 25;

  const headBlock = await getHeadBlock();
  const fromBlock = Math.max(0, headBlock - windowBlocks);

  const acc = emptyTally();

  let continuation: string | undefined;
  let pages = 0;
  let truncated = false;

  for (;;) {
    const filter: Record<string, unknown> = {
      from_block: { block_number: fromBlock },
      to_block: 'latest',
      address: pool,
      chunk_size: 1000,
    };
    if (continuation) filter.continuation_token = continuation;

    const page = await rpc<{
      events: PoolEvent[];
      continuation_token?: string;
    }>('starknet_getEvents', [filter]);

    tallyEvents(page.events ?? [], acc);

    continuation = page.continuation_token;
    pages += 1;
    if (!continuation) break;
    if (pages >= maxPages) {
      truncated = true;
      break;
    }
  }

  const byToken = [...acc.perToken.entries()]
    .map(([symbol, n]) => ({ symbol, deposits: n }))
    .sort((a, b) => b.deposits - a.deposits);

  return {
    fromBlock,
    headBlock,
    deposits: acc.deposits,
    registrations: acc.registrations,
    totalEvents: acc.totalEvents,
    uniqueTxs: acc.txs.size,
    byToken,
    unidentified: acc.unidentified,
    depositTxs: acc.depositTxs,
    truncated,
  };
}


/* ---------- how concentrated is the crowd? ----------
 *
 * Size alone cannot tell you whether 135 deposits are 69 people or one bot with
 * 135 wallets, and those are very different places to hide. Every privacy tool
 * publishes the size; none of them answer this.
 *
 * It is a separate, slower pass on purpose. One request per deposit is far too
 * much to put in front of the headline figures, so the panel renders those
 * immediately and this arrives when it arrives. A crowd-quality row that never
 * loads costs nothing; a blank panel for ten seconds costs everything.
 */
export interface Concentration {
  /* Deposits we successfully resolved a sender for. Not always the whole
     window: a public node drops requests, and reporting the ones we got is
     better than reporting nothing or pretending we got them all. */
  sampled: number;
  /* Deposits in the window, whether or not we resolved them. */
  total: number;
  unique: number;
  /* Share of sampled deposits made by the single busiest address, 0–1. */
  topShare: number;
  /* Addresses that appear exactly once. A high count is the strongest signal
     that a crowd is many people rather than one. */
  onceOnly: number;
}

/* Bounded because these are public endpoints and a burst of 135 parallel
   requests is how you get rate-limited into a wrong answer. */
const SENDER_CONCURRENCY = 6;

export async function scanConcentration(
  depositTxs: string[],
  opts?: { signal?: { aborted: boolean } },
): Promise<Concentration | null> {
  const hashes = [...new Set(depositTxs)];
  if (hashes.length === 0) return null;

  const senders: bigint[] = [];
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      if (opts?.signal?.aborted) return;
      const i = cursor;
      cursor += 1;
      if (i >= hashes.length) return;
      try {
        const tx = await rpc<{ sender_address?: string; contract_address?: string }>(
          'starknet_getTransactionByHash',
          [hashes[i]],
        );
        const who = tx?.sender_address ?? tx?.contract_address;
        const felt = who ? asBig(who) : null;
        if (felt !== null) senders.push(felt);
      } catch {
        /* One unresolved deposit is a smaller sample, not a failure. */
      }
    }
  };

  await Promise.all(Array.from({ length: SENDER_CONCURRENCY }, worker));
  if (opts?.signal?.aborted || senders.length === 0) return null;

  const counts = new Map<bigint, number>();
  for (const s of senders) counts.set(s, (counts.get(s) ?? 0) + 1);
  const tallies = [...counts.values()];

  return {
    sampled: senders.length,
    total: hashes.length,
    unique: counts.size,
    topShare: Math.max(...tallies) / senders.length,
    onceOnly: tallies.filter((n) => n === 1).length,
  };
}
