#!/bin/bash
# Convert SUI to WAL on Walrus Testnet

set -euo pipefail

CONTEXT=${WALRUS_CONTEXT:-testnet}

echo "Requesting WAL tokens from Walrus ($CONTEXT)..."
walrus get-wal --context "$CONTEXT"

echo "Updated balances:"
sui client balance
