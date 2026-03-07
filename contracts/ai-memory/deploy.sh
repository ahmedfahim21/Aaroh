#!/bin/bash
set -e

# Usage: ./deploy.sh <account-id> <network>
# Example: ./deploy.sh alice.testnet testnet

if [ $# -lt 2 ]; then
    echo "Usage: ./deploy.sh <account-id> <network>"
    echo "Example: ./deploy.sh alice.testnet testnet"
    exit 1
fi

ACCOUNT_ID=$1
NETWORK=$2

if [ "$NETWORK" != "testnet" ] && [ "$NETWORK" != "mainnet" ]; then
    echo "Network must be 'testnet' or 'mainnet'"
    exit 1
fi

echo "Deploying AI Memory Contract..."
echo "Account: $ACCOUNT_ID"
echo "Network: $NETWORK"

# Build the contract first
./build.sh

# Deploy the contract
near contract deploy $ACCOUNT_ID \
    use-file ../../out/ai_memory.wasm \
    with-init-call new json-args "{\"owner\":\"$ACCOUNT_ID\"}" \
    prepaid-gas '100.0 Tgas' \
    attached-deposit '0 NEAR' \
    network-config $NETWORK \
    sign-with-keychain send

echo "✅ Contract deployed successfully!"
echo "Contract account: $ACCOUNT_ID"
