#!/bin/bash
# Delete a blob from Walrus Testnet
# Usage: ./scripts/walrus/delete-blob.sh <blob-id>

set -euo pipefail

BLOB_ID=${1:-}
CONTEXT=${WALRUS_CONTEXT:-testnet}

if [ -z "$BLOB_ID" ]; then
  echo "Usage: $0 <blob-id>"
  exit 1
fi

echo "Deleting blob '$BLOB_ID' from Walrus ($CONTEXT)..."
walrus delete --blob-id "$BLOB_ID" --context "$CONTEXT"
