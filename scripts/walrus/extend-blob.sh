#!/bin/bash
# Extend a blob’s storage on Walrus Testnet
# Usage: ./scripts/walrus/extend-blob.sh <blob-object-id> <epochs-extended>

set -euo pipefail

BLOB_OBJECT_ID=${1:-}
EPOCHS=${2:-}
CONTEXT=${WALRUS_CONTEXT:-testnet}

if [ -z "$BLOB_OBJECT_ID" ] || [ -z "$EPOCHS" ]; then
  echo "Usage: $0 <blob-object-id> <epochs-extended>"
  exit 1
fi

echo "Extending blob object '$BLOB_OBJECT_ID' by $EPOCHS epochs on Walrus ($CONTEXT)..."
walrus extend --blob-obj-id "$BLOB_OBJECT_ID" --epochs-extended "$EPOCHS" --context "$CONTEXT"
