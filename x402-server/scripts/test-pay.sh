#!/bin/bash
# Test script for x402 payment flow
# Usage: ./scripts/test-pay.sh [file-id]

set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:3001}
FILE_ID=${1:-testfile123}

echo "=== x402 Payment Flow Test ==="
echo "Base URL: $BASE_URL"
echo "File ID: $FILE_ID"
echo ""

echo "Step 1: Request the file (expect 402 Payment Required)"
echo "----------------------------------------"
curl -i "$BASE_URL/file/$FILE_ID" 2>/dev/null | head -20
echo ""
echo ""

echo "Step 2: Upload a test file (if needed)"
echo "----------------------------------------"
echo "To upload a file, use:"
echo "  curl -X POST $BASE_URL/upload \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"filename\":\"test.txt\",\"ciphertextBase64\":\"$(echo -n 'test' | base64)\",\"ownerAddress\":\"0x...\",\"priceRaw\":1000000000}'"
echo ""
echo ""

echo "Step 3: Simulate payment verification"
echo "----------------------------------------"
echo "After making a payment on Sui, retry the request with:"
echo "  curl -i -H 'X-PAYMENT: <BASE64_TXDIGEST>' $BASE_URL/file/$FILE_ID"
echo ""
echo "To encode a transaction digest:"
echo "  echo -n '0x...' | base64"
echo ""

echo "=== Health Check ==="
curl -s "$BASE_URL/health" | jq '.' 2>/dev/null || curl -s "$BASE_URL/health"
echo ""

