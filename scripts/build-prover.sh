#!/usr/bin/env bash
#
# Build a transaction prover that runs on THIS machine.
#
# Usage:
#   scripts/build-prover.sh          # build for this CPU
#   scripts/build-prover.sh --generic # build a portable baseline binary
#
# Why: the image StarkWare publishes is compiled with -C target-cpu=znver5 and
# takes SIGILL on anything without AVX-512 (docs/prover.md). That flag is a
# packaging choice, not a requirement — stwo's SIMD backend targets AVX2 as
# well, and its CPU backend needs no SIMD at all. The upstream Dockerfile says
# in its own header that it is "designed for external parties to build and run
# the tx prover", and its TARGET_CPU build arg defaults to empty.
#
# So this builds the same revision the published image was built from, for a
# CPU that exists here. Expect one to three hours on four cores; the result is
# a local image that scripts/prover.sh will prefer automatically.

set -euo pipefail

cd "$(dirname "$0")/.."

# The revision behind ghcr … transaction-prover:PRIVACY-0.14.3-RC.2, read from
# that image's own org.opencontainers.image.revision label. Building anything
# else risks a prover that disagrees with the pool the SDK targets.
SEQUENCER_REV=e6b6fd2e9932909107833579e5b6efd6c75fa0af
SRC=${PROVER_SRC:-$HOME/.cache/airlock/sequencer}
IMAGE=airlock/tx-prover:local

TARGET_CPU=native
[ "${1:-}" = "--generic" ] && TARGET_CPU=""

DOCKER=docker
if ! $DOCKER info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then DOCKER="sudo docker"; else
    echo "Cannot reach the Docker daemon. Run with sudo, or add yourself to the docker group." >&2
    exit 1
  fi
fi

# A full clone of the sequencer is large and all but one commit of it is waste.
# Fetch exactly the revision the image was built from.
if [ ! -d "$SRC/.git" ]; then
  echo "==> fetching sequencer @ ${SEQUENCER_REV:0:12}"
  mkdir -p "$SRC"
  git -C "$SRC" init -q
  git -C "$SRC" remote add origin https://github.com/starkware-libs/sequencer.git 2>/dev/null || true
fi
if ! git -C "$SRC" cat-file -e "$SEQUENCER_REV^{commit}" 2>/dev/null; then
  git -C "$SRC" fetch --depth 1 origin "$SEQUENCER_REV"
fi
git -C "$SRC" checkout -q --detach "$SEQUENCER_REV"
echo "==> source at $SRC ($(git -C "$SRC" rev-parse --short HEAD))"

echo "==> building (target-cpu='${TARGET_CPU:-baseline}') — this takes a while"
$DOCKER build \
  -f "$SRC/crates/starknet_transaction_prover/Dockerfile" \
  --build-arg BUILD_MODE=release \
  --build-arg "TARGET_CPU=$TARGET_CPU" \
  -t "$IMAGE" \
  "$SRC"

echo
echo "built $IMAGE"
echo "Now: scripts/prover.sh sepolia   (it prefers this image when present)"
