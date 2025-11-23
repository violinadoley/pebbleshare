#!/bin/bash
# Retrieve a blob from Walrus Testnet
# Usage: ./scripts/walrus/read-blob.sh <blob-id> [output-file]

set -euo pipefail

BLOB_ID=${1:-}
OUTPUT_FILE=${2:-"walrus_blob.bin"}
CONTEXT=${WALRUS_CONTEXT:-testnet}

if [ -z "$BLOB_ID" ]; then
  echo "Usage: $0 <blob-id> [output-file]"
  exit 1
fi

echo "Reading blob '$BLOB_ID' from Walrus ($CONTEXT) into '$OUTPUT_FILE'..."
walrus read "$BLOB_ID" --out "$OUTPUT_FILE" --context "$CONTEXT"
