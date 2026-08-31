# The proving service, and where to get one

The proven pool legs — register, deposit, withdraw — are proved client-side and
submitted on chain. Proving happens in a service, not in the browser, so the SDK
needs a `PROVER_URL`. Note discovery needs an `INDEXER_URL` alongside it.

Neither has a public instance. That is the single thing standing between this
app and a full round trip, so it is worth writing down exactly what is true.

## There is no hosted endpoint

Every documented source points at a value you supply rather than one you are
given:

- The SDK's own examples read `process.env.PROVING_SERVICE_URL` and never say
  what to put there.
- StarkWare's reference demo ships `http://localhost:3000` (prover) and
  `http://localhost:8080` (indexer) in `.env.example`, and `TODO_MAINNET_*`
  placeholders in `.env.mainnet.example`.
- The sprint's own `docs/MAINNET-DAY-0.md` says the mainnet discovery and
  proving URLs "come from StarkWare and will be filled in here" — they were not.
- `starkware-libs/starknet-privacy` issue [#956][956], from another sprint
  entrant, asks this exact question. It is open and unanswered.

[956]: https://github.com/starkware-libs/starknet-privacy/issues/956

The deployed reference apps do not leak one either: the Vercel demo proxies
`/api/prover` to a backend URL held as a CI secret, and the Next.js starter goes
through the Starknet Wallet API, where the wallet proves and no URL is exposed.

## What does exist: the images

StarkWare publishes the services as containers. From the compatibility matrix in
the `starknet-privacy` README — all rows are tested together, so move them as a
set:

| Component | Image |
|---|---|
| Transaction prover | `ghcr.io/starkware-libs/starknet-privacy/transaction-prover:PRIVACY-0.14.3-RC.2` |
| Discovery service | `ghcr.io/starkware-libs/starknet-privacy/discovery-service:PRIVACY-0.14.3-RC.2` |
| Proof interceptor | `ghcr.io/starkware-libs/starknet-privacy/proof-interceptor:PRIVACY-0.14.3-RC.2` |

All three are public: their manifests are readable from ghcr.io anonymously, no
token required. So the endpoint is not something to be granted. It is something
to run.

## Running the prover

```sh
scripts/prover.sh sepolia
```

That is the whole dependency list — the prover needs one thing, a Starknet
JSON-RPC node speaking **spec v0.10**, and public ones exist. Careful here:
`https://rpc.starknet.lava.build`, the RPC named in the sprint's day-0 doc,
serves spec 0.8.1 and the prover will not work against it. The script checks
`starknet_specVersion` before starting and refuses rather than failing later
inside a proof, where the error is unreadable.

Then point the app at it:

```sh
VITE_AIRLOCK_PROVER_URL=http://localhost:3000
```

or the live tests at `AIRLOCK_LIVE_PROVER_URL`.

### It will not run on an older CPU

The published spec for this image is a 48-vCPU / 96-GB machine, and it is
tempting to read that as throughput advice — run one proof at a time and be
patient. It is not. The image is compiled for a modern server
microarchitecture, and on anything older it does not start:

```
$ starknet_transaction_prover --help
Illegal instruction (core dumped)     # exit 132
```

That is `--help`, before any argument is parsed or any log line is written, so
the failure looks like a container that exited with empty logs. Disassembling
the binary says why — it carries **654,685 AVX-512 (`zmm`) instructions**,
10,056 EVEX-only ops, 706 VAES and 148 SHA-NI. This matches the
`-C target-cpu=znver5` build the README documents.

So the CPU requirement is a hard gate, not a performance tier:

| Needs | Have it | Don't |
|---|---|---|
| AVX-512, VAES, SHA-NI | Intel Ice Lake / Sapphire Rapids+ (GCP c3/c4, AWS c6i/c7i), AMD Genoa / Turin (`znver4`+, GCP c4d) | Any pre-Ice-Lake Intel laptop chip; AMD up to `znver3`, incl. Hetzner CCX (EPYC Milan) |

A 2018 i7-8665U — Whiskey Lake — has none of the four. Checking before you
provision is one command:

```sh
grep -o -w -m1 avx512f /proc/cpuinfo || echo "no AVX-512: this image will SIGILL"
```

Note that **GitHub-hosted runners will not do either**, which is worth knowing
before you try: the runner is an AMD EPYC 9V74 — Zen 4, which has AVX-512 in
silicon — but Azure masks it off. `vaes` and `sha_ni` are exposed, the AVX-512
flags are not.

### AVX-512 is a build flag, not a requirement

The interesting part is that nothing here actually needs those instructions.
The prover is [stwo][stwo], which works over the Mersenne-31 field; 31-bit
arithmetic packs neatly into 32-bit SIMD lanes, and that is where the speed
comes from. Its README is explicit that the SIMD backend targets "AVX2,
AVX-512, NEON, WebAssembly SIMD", and that "the CPU backend works without
SIMD".

[stwo]: https://github.com/starkware-libs/stwo

So AVX-512 is how StarkWare packages the binary for their own hardware, not a
floor the maths imposes. Upstream's Dockerfile says as much in its header —
it is "designed for external parties to build and run the tx prover" — and its
`TARGET_CPU` build arg **defaults to empty**.

Building it for the CPU you have is therefore the supported path, not a hack:

```sh
scripts/build-prover.sh          # -C target-cpu=native
scripts/build-prover.sh --generic # baseline x86-64, portable
```

That fetches the exact sequencer revision the published image was built from —
`e6b6fd2`, read off the image's own `org.opencontainers.image.revision` label,
so the prover matches the pool the SDK targets — and builds
`airlock/tx-prover:local`. `scripts/prover.sh` prefers that image whenever it
exists, and only falls back to the published one otherwise.

Budget one to three hours on four cores. It is a nightly-Rust build of the
sequencer's prover crate and its dependency graph, and the resulting binary is
~175 MB. Proving on an AVX2 laptop will be slower than on the 48-vCPU machine
the matrix specifies — that part of the spec really is about throughput.

The script pins `MAX_CONCURRENT_REQUESTS=1` regardless, so a small machine
proves one at a time rather than being killed by the OOM reaper.

## Why the indexer is the harder half

The discovery service is a small Rust binary and a 4-vCPU box would run it —
except that it tails new blocks over a **WebSocket** (`WS_URL`), and no public
Starknet RPC exposes one. Cartridge and zan.top both refuse the upgrade. So the
indexer needs a node of its own, and the matrix names Pathfinder v0.22.7 with
`PATHFINDER_STORAGE_STATE_TRIES=10000`.

That is a real sync, and it is why the two halves are not equally cheap.

## What each leg actually needs

The asymmetry matters, because it means the prover alone is worth running:

| Leg | Prover | Indexer |
|---|---|---|
| `register` | yes | **no** |
| `deposit` | yes | yes |
| `withdraw` | yes | yes |

`registerWithPool` builds the SDK client with an `IndexerDiscoveryProvider`, but
never calls it — registration publishes a viewing key and discovers nothing. So
a locally-run prover is enough to take the register leg from "fails at
`Failed to parse URL from /prover`" to a real on-chain registration, with no
node sync at all.
