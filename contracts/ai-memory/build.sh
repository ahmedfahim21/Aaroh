#!/bin/bash
set -e

echo "Building AI Memory Smart Contract..."

# Build the contract using standard cargo (more reliable than cargo-near build)
cargo build --target wasm32-unknown-unknown --release

# Create output directory
mkdir -p ../../out

# Copy the compiled WASM file
cp target/wasm32-unknown-unknown/release/ai_memory.wasm ../../out/ai_memory.wasm

echo "✅ Contract built successfully!"
echo "📦 WASM file: out/ai_memory.wasm"
echo "📊 Unoptimized size: $(ls -lh ../../out/ai_memory.wasm | awk '{print $5}')"

# Optimize WASM with wasm-opt if available
if command -v wasm-opt &> /dev/null; then
    echo ""
    echo "Optimizing WASM with wasm-opt..."
    wasm-opt -Oz ../../out/ai_memory.wasm -o ../../out/ai_memory_opt.wasm
    echo "✅ WASM optimized successfully!"
    echo "📦 Optimized file: out/ai_memory_opt.wasm"
    echo "📊 Optimized size: $(ls -lh ../../out/ai_memory_opt.wasm | awk '{print $5}')"
    echo ""
    echo "💡 Use ai_memory_opt.wasm for deployment (smaller and faster)"
else
    echo ""
    echo "⚠️  wasm-opt not found. Install with: brew install binaryen"
    echo "💡 Optimization recommended for production deployment"
fi
