#!/bin/bash
set -e

echo "Running AI Memory Contract Tests..."

# Use cargo near test or regular cargo test for unit tests
cargo test -- --nocapture

echo "✅ All tests passed!"
