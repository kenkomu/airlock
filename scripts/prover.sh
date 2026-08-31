#!/usr/bin/env bash
#
# Run a STRK20 transaction prover locally.
#
# Usage:
#   scripts/prover.sh sepolia         # prove against Sepolia
#   scripts/prover.sh mainnet         # prove against mainnet
#   scripts/prover.sh sepolia --stop  # stop and remove the container
#
# Why this exists: the proven pool legs (register, deposit, withdraw) need a
# proving service, and there is no public one. StarkWare publishes the prover
# as an image instead — see docs/prover.md — so the endpoint the SDK wants is
# one you run, not one you are given.
#
# Nothing here holds a key. The prover only re-executes a transaction against a
# finalized block and returns a proof; it never signs and never submits.

set -euo pipefail

cd "$(dirname "$0")/.."

# Pinned to the compatibility matrix in starkware-libs/starknet-privacy's
# README. Every component in that row is tested together, so bump the pool,
# the SDK and this tag as a set — never one alone.
IMAGE=ghcr.io/starkware-libs/starknet-privacy/transaction-prover:PRIVACY-0.14.3-RC.2
CONTAINER=airlock-prover
PORT=${PROVER_PORT:-3000}

# The prover requires a JSON-RPC node speaking spec v0.10. Note that
# rpc.starknet.lava.build — the RPC in the sprint's own day-0 doc — serves
# 0.8.1 and will not do. These two were checked with starknet_specVersion.
SEPOLIA_RPC=${SEPOLIA_RPC:-https://api.zan.top/public/starknet-sepolia/rpc/v0_10}
MAINNET_RPC=${MAINNET_RPC:-https://api.zan.top/public/starknet-mainnet/rpc/v0_10}

NETWORK=${1:-}
case "$NETWORK" in
  sepolia) RPC_URL=$SEPOLIA_RPC; CHAIN_ID=SN_SEPOLIA ;;
  mainnet) RPC_URL=$MAINNET_RPC; CHAIN_ID=SN_MAIN ;;
  *) echo "usage: scripts/prover.sh {sepolia|mainnet} [--stop]" >&2; exit 2 ;;
esac

# The image is built for a modern server microarchitecture (the sequencer's own
# build script targets znver5). On a CPU without those instructions the binary
# takes SIGILL inside `--help` — before it parses an argument or writes a log
# line — so the only symptom is a container that exited with empty logs. Say so
# here instead, where it is answerable.
if ! grep -qw avx512f /proc/cpuinfo 2>/dev/null; then
  cat >&2 <<'MSG'
This CPU has no AVX-512, and the published prover image requires it.

  The binary carries ~650k AVX-512 instructions plus VAES and SHA-NI. It will
  die with "Illegal instruction" (exit 132) and log nothing at all.

  Either run the prover on a machine that has them — Intel Ice Lake /
  Sapphire Rapids or newer (GCP c3/c4, AWS c6i/c7i), AMD Genoa / Turin
  (GCP c4d) — or build it for this CPU from the sequencer repo:
    scripts/build_starknet_transaction_prover.sh --target-cpu native

  See docs/prover.md.
MSG
  exit 1
fi

DOCKER=docker
if ! $DOCKER info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
  else
    cat >&2 <<'MSG'
Cannot reach the Docker daemon.

  One-time fix (then log out and back in, or run `newgrp docker`):
    sudo usermod -aG docker "$USER"

  Or run this script with a sudo that can prompt:
    sudo -v && scripts/prover.sh <network>
MSG
    exit 1
  fi
fi

if [ "${2:-}" = "--stop" ]; then
  $DOCKER rm -f "$CONTAINER" >/dev/null 2>&1 || true
  echo "stopped $CONTAINER"
  exit 0
fi

# Refuse to start against an RPC that cannot serve the prover, rather than
# letting it fail later inside a proof where the error is unrecognisable.
# `|| true`: pipefail would otherwise turn a failed curl into a fatal error
# under `set -e`, which is exactly the case this check exists to report.
spec=$(curl -s --max-time 15 -X POST "$RPC_URL" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"starknet_specVersion","params":[]}' \
  | sed -n 's/.*"result":"\([^"]*\)".*/\1/p') || true
case "$spec" in
  0.10.*) echo "rpc  $RPC_URL (spec $spec)" ;;
  "")     echo "RPC $RPC_URL did not answer starknet_specVersion." >&2; exit 1 ;;
  *)      echo "RPC $RPC_URL serves spec $spec; the prover needs v0.10." >&2; exit 1 ;;
esac

$DOCKER rm -f "$CONTAINER" >/dev/null 2>&1 || true

# MAX_CONCURRENT_REQUESTS defaults to 2. Proving is memory-hungry and the
# published spec for this image is a 48-vCPU/96-GB machine, so on a laptop one
# worker at a time is the difference between slow and killed by the OOM reaper.
$DOCKER run -d --name "$CONTAINER" \
  -p "$PORT:3000" \
  -e RPC_URL="$RPC_URL" \
  -e CHAIN_ID="$CHAIN_ID" \
  -e MAX_CONCURRENT_REQUESTS="${MAX_CONCURRENT_REQUESTS:-1}" \
  -e RUST_LOG="${RUST_LOG:-info}" \
  "$IMAGE" >/dev/null

echo "chain $CHAIN_ID"
printf 'waiting for the prover to answer on :%s ' "$PORT"
for _ in $(seq 1 60); do
  # A refused connection is the normal state while the prover boots, so the
  # failure must not escape: `set -e` plus `pipefail` would abort the wait on
  # the first poll, before a single dot is printed.
  v=$(curl -s --max-time 3 -X POST "http://localhost:$PORT" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"starknet_specVersion","params":[]}' \
    | sed -n 's/.*"result":"\([^"]*\)".*/\1/p') || true
  if [ -n "$v" ]; then
    echo
    echo "ready — prover spec $v"
    echo
    echo "Point the app at it:"
    echo "  VITE_AIRLOCK_PROVER_URL=http://localhost:$PORT"
    echo "Or the live tests:"
    echo "  AIRLOCK_LIVE_PROVER_URL=http://localhost:$PORT"
    echo
    echo "Logs:  $DOCKER logs -f $CONTAINER"
    echo "Stop:  scripts/prover.sh $NETWORK --stop"
    exit 0
  fi
  # If the container has died there is nothing left to wait for, and the logs
  # are the answer — don't spend two minutes discovering that.
  if [ -z "$($DOCKER ps -q --filter "name=^${CONTAINER}$" 2>/dev/null)" ]; then
    echo
    echo "The prover container exited. Last logs:" >&2
    $DOCKER logs --tail 40 "$CONTAINER" >&2 || true
    exit 1
  fi
  printf .
  sleep 2
done

echo
echo "The prover did not come up. Last logs:" >&2
$DOCKER logs --tail 40 "$CONTAINER" >&2 || true
exit 1
