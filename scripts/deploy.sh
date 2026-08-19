#!/usr/bin/env bash
#
# Declare and deploy AirlockBucketer.
#
# Usage:
#   scripts/deploy.sh sepolia                 # deploy with the default 1-USDC ladder
#   scripts/deploy.sh sepolia --unit 100000   # 0.1-USDC ladder
#   scripts/deploy.sh mainnet --dry-run       # estimate fees, send nothing
#
# The contract has no owner, no admin key and no upgrade path, so the account
# that deploys it holds no privileged position afterwards. Use a throwaway
# deployer — see docs/deploy.md.
#
# Nothing here reads, writes or prints a private key. Signing is delegated to
# sncast, whose accounts file lives outside this repository.

set -euo pipefail

cd "$(dirname "$0")/.."

# --- public addresses, verified live with starknet_getClassHashAt ------------
# Sources: docs/mainnet.md (mainnet) and privacy-bridge bridge-core/config.ts
# (Sepolia). Both re-checked before every deploy by preflight() below.
SEPOLIA_POOL=0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91
SEPOLIA_USDC=0x0512feAc6339Ff7889822cb5aA2a86C848e9D392bB0E3E237C008674feeD8343
MAINNET_POOL=0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
MAINNET_USDC=0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb

# USDC is a 6-decimal token, so 1_000_000 base units is 1 USDC and the ladder
# runs 1000 … 1 USDC. Baked at construction and NOT changeable afterwards.
UNIT=1000000
DRY_RUN=""
ASSUME_YES=""

NETWORK="${1:-}"; shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --unit)    UNIT="$2"; shift 2 ;;
    --dry-run) DRY_RUN="--dry-run"; shift ;;
    --yes|-y)  ASSUME_YES=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$NETWORK" in
  sepolia) POOL=$SEPOLIA_POOL; TOKEN=$SEPOLIA_USDC ;;
  mainnet) POOL=$MAINNET_POOL; TOKEN=$MAINNET_USDC ;;
  *) echo "usage: $0 <sepolia|mainnet> [--unit N] [--dry-run] [--yes]" >&2; exit 2 ;;
esac

RPC=$(sed -n "/^\[sncast\.$NETWORK\]/,/^\[/p" snfoundry.toml | sed -n 's/^url *= *"\(.*\)"/\1/p')
say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31mFAILED: %s\033[0m\n' "$*" >&2; exit 1; }

rpc() { # method, params-json
  curl -s --max-time 30 -X POST "$RPC" -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}"
}

# --- preflight ---------------------------------------------------------------
# A constructor argument cannot be corrected later: there are no setters. So
# both addresses are confirmed to be live contracts BEFORE anything is spent,
# rather than trusting that a constant in this file is still right.
preflight() {
  say "Preflight — $NETWORK"
  for pair in "pool:$POOL" "token:$TOKEN"; do
    label=${pair%%:*}; addr=${pair#*:}
    class=$(rpc starknet_getClassHashAt "[\"latest\",\"$addr\"]" | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')
    [ -n "$class" ] || fail "$label $addr is not a deployed contract on $NETWORK"
    printf '  %-6s %s\n         class %s\n' "$label" "$addr" "$class"
  done
  printf '  %-6s %s base units\n' "unit" "$UNIT"
  [ "$UNIT" -gt 0 ] 2>/dev/null || fail "unit must be a positive integer (got '$UNIT')"
}

# --- confirmation ------------------------------------------------------------
confirm_mainnet() {
  [ "$NETWORK" = mainnet ] || return 0
  [ -n "$DRY_RUN" ] && return 0
  [ -n "$ASSUME_YES" ] && return 0
  printf '\n\033[33mThis spends real STRK on Starknet mainnet and cannot be undone.\033[0m\n'
  printf 'Type exactly "DEPLOY TO MAINNET" to continue: '
  read -r reply
  [ "$reply" = "DEPLOY TO MAINNET" ] || fail "not confirmed"
}

preflight
confirm_mainnet

say "Building"
scarb build 2>&1 | grep -v '^warn: in context of a workspace' | grep -v '^but the' | grep -v '^$' || true

CLASS_HASH=$(sncast utils class-hash --contract-name AirlockBucketer 2>/dev/null | sed -n 's/^Class Hash: //p')
[ -n "$CLASS_HASH" ] || fail "could not compute the class hash"
say "Class hash $CLASS_HASH"

# --- declare -----------------------------------------------------------------
# Declaring a class that already exists is an error, not a no-op, so ask the
# chain first. This also makes the script safe to re-run after a failed deploy.
if rpc starknet_getClass "[\"latest\",\"$CLASS_HASH\"]" | grep -q '"result"'; then
  echo "  already declared on $NETWORK — skipping declare"
else
  say "Declaring"
  sncast --profile "$NETWORK" declare --contract-name AirlockBucketer $DRY_RUN \
    || fail "declare failed"
fi

# --- deploy ------------------------------------------------------------------
say "Deploying  (pool, token, unit) = ($POOL, $TOKEN, $UNIT)"
OUT=$(sncast --profile "$NETWORK" deploy \
  --class-hash "$CLASS_HASH" \
  --constructor-calldata "$POOL" "$TOKEN" "$UNIT" \
  $DRY_RUN 2>&1) || { echo "$OUT"; fail "deploy failed"; }
echo "$OUT"

[ -n "$DRY_RUN" ] && { say "Dry run — nothing was sent."; exit 0; }

ADDRESS=$(echo "$OUT" | sed -n 's/^Contract Address: *//p')
[ -n "$ADDRESS" ] || fail "deployed, but could not parse the address out of the output above"

# --- verify ------------------------------------------------------------------
# Read the constructor values back off the chain. A silently wrong pool or unit
# is unrecoverable, so this is a real check, not a formality.
say "Verifying $ADDRESS"
check() { # function, expected, label
  got=$(sncast --profile "$NETWORK" call --contract-address "$ADDRESS" --function "$1" 2>/dev/null \
        | sed -n 's/^Response: *//p' | tr -d '[] ')
  exp_dec=$(python3 -c "print(int('$2', 0))")
  got_dec=$(python3 -c "print(int('${got:-0}', 0))" 2>/dev/null || echo x)
  if [ "$exp_dec" = "$got_dec" ]; then printf '  \033[32mok\033[0m   %-6s %s\n' "$3" "$got"
  else printf '  \033[31mBAD\033[0m  %-6s got %s, expected %s\n' "$3" "$got" "$2"; return 1; fi
}
rc=0
check pool  "$POOL"  pool  || rc=1
check token "$TOKEN" token || rc=1
check unit  "$UNIT"  unit  || rc=1
[ $rc -eq 0 ] || fail "on-chain state does not match what was requested — do NOT use this deployment"

say "Ladder"
sncast --profile "$NETWORK" call --contract-address "$ADDRESS" --function denominations 2>/dev/null \
  | sed -n 's/^Response: */  /p'

say "Deployed to $NETWORK"
echo "  address     $ADDRESS"
echo "  class hash  $CLASS_HASH"
echo
echo "  Add to strk20.json \"contracts\", and to docs/mainnet.md:"
echo "    \"$ADDRESS\""
