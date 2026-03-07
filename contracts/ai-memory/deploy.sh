#!/bin/bash
set -e

# Usage: ./deploy.sh [account-id] [network]
# Example: ./deploy.sh alice.testnet testnet
# Defaults: ./deploy.sh (uses aaroh2.testnet on testnet)

ACCOUNT_ID="${1:-aaroh2.testnet}"
NETWORK="${2:-testnet}"

if [ "$NETWORK" != "testnet" ] && [ "$NETWORK" != "mainnet" ]; then
    echo "Network must be 'testnet' or 'mainnet'"
    exit 1
fi

echo "🚀 Deploying AI Memory Contract"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Account: $ACCOUNT_ID"
echo "Network: $NETWORK"
echo ""

# Build the contract first
./build.sh

# Use optimized WASM if available, otherwise use unoptimized
if [ -f "../../out/ai_memory_opt.wasm" ]; then
    WASM_FILE="../../out/ai_memory_opt.wasm"
    echo "📦 Using optimized WASM"
else
    WASM_FILE="../../out/ai_memory.wasm"
    echo "📦 Using unoptimized WASM"
fi

echo ""
echo "Deploying contract..."

# Deploy the contract without init (safer, allows manual init)
near contract deploy $ACCOUNT_ID \
    use-file $WASM_FILE \
    without-init-call \
    network-config $NETWORK \
    sign-with-keychain send

echo ""
echo "✅ Contract deployed successfully!"
echo ""
echo "Now initialize the contract:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "near contract call-function as-transaction $ACCOUNT_ID new \\"
echo "  json-args '{\"owner\":\"$ACCOUNT_ID\"}' \\"
echo "  prepaid-gas '30 Tgas' \\"
echo "  attached-deposit '0 NEAR' \\"
echo "  sign-as $ACCOUNT_ID \\"
echo "  network-config $NETWORK \\"
echo "  sign-with-keychain send"
