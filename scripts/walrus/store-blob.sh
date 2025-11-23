#!/bin/bash
# Store a file on Walrus Testnet
# Usage: ./scripts/walrus/store-blob.sh <file-path> [epochs]

set -euo pipefail

FILE_PATH=${1:-}
EPOCHS=${2:-2}
CONTEXT=${WALRUS_CONTEXT:-testnet}

if [ -z "$FILE_PATH" ]; then
  echo "Usage: $0 <file-path> [epochs]"
  exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
  echo "Error: File not found: $FILE_PATH"
  exit 1
fi

echo "Storing '$FILE_PATH' for $EPOCHS epochs on Walrus ($CONTEXT)..."
walrus store "$FILE_PATH" --epochs "$EPOCHS" --context "$CONTEXT"
