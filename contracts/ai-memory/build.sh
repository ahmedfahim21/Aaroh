#!/bin/bash
set -e

echo "Building AI Memory Smart Contract..."

# Build the contract using cargo-near
cargo near build

# Create output directory
mkdir -p ../../out

# Copy the compiled WASM file
cp target/near/ai_memory.wasm ../../out/ai_memory.wasm

echo "✅ Contract built successfully!"
echo "📦 WASM file: out/ai_memory.wasm"
echo "📊 File size: $(ls -lh ../../out/ai_memory.wasm | awk '{print $5}')"
