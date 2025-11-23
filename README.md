# x402 Payment Server

A production-ready Node.js + Express server implementing the **x402 Payment Protocol** for a decentralized, pay-per-access data marketplace. This server enables creators to monetize encrypted content by requiring on-chain Sui payments before granting access to decryption keys.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Payment Flow](#payment-flow)
- [Integration Details](#integration-details)
- [Security](#security)
- [Testing](#testing)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Migration Guide](#migration-guide)
- [Additional Resources](#additional-resources)

## Overview

This server implements a **trust-minimized, decentralized digital goods marketplace** where:

- **Creators** upload encrypted data (client-side encryption)
- **Ciphertext** is stored on **Walrus** (decentralized storage)
- **Encrypted symmetric keys** are stored in **Seal** (encrypted key management with conditional release)
- **Buyers** request files and receive a `402 Payment Required` response if unpaid
- **Payments** are verified on the **Sui blockchain**
- **Keys** are released only after verified payment

The system ensures:
- ✅ Payments are verifiable on-chain
- ✅ Storage is decentralized (Walrus)
- ✅ Key release is conditional and verifiable (Seal)
- ✅ Replay attacks are prevented
- ✅ All operations align with x402 standards

## Features

### Core Functionality
- ✅ **Full x402 protocol compliance** - Proper 402 responses, payment verification, receipts
- ✅ **Sui blockchain payment verification** - On-chain transaction verification with multiple verification methods
- ✅ **Anti-replay protection** - Transaction digests tracked in persistent database
- ✅ **Transaction finality checks** - Optional checkpoint-based finality verification
- ✅ **Receipt issuance** - Base64-encoded receipts with transaction details

### Integrations
- ✅ **Walrus integration** - Supports CLI and HTTP API for decentralized storage
- ✅ **Seal integration** - Encrypted key management with conditional release policies
- ✅ **Sui RPC integration** - Direct blockchain interaction for payment verification

### Security & Quality
- ✅ **Input validation** - Comprehensive validation for all endpoints
- ✅ **Filename sanitization** - Prevents path traversal attacks
- ✅ **File size limits** - Configurable maximum file sizes
- ✅ **Error handling** - Safe error messages (production mode hides details)
- ✅ **Request logging** - Comprehensive logging for debugging

## Architecture

### System Components

```
┌─────────────┐
│   Creator   │
│  (Client)   │
└──────┬──────┘
       │ 1. Encrypt file client-side
       │ 2. POST /upload (ciphertext + encrypted key)
       ▼
┌─────────────────────────────────────┐
│      x402 Server (Node.js)          │
│  ┌──────────┐  ┌──────────┐        │
│  │  Walrus  │  │   Seal   │        │
│  │ Storage  │  │Key Mgmt  │        │
│  └──────────┘  └──────────┘        │
└──────┬──────────────────┬────────────┘
       │                  │
       │ 3. Store         │ 4. Store encrypted
       │    ciphertext    │    key with policy
       ▼                  ▼
┌─────────────┐    ┌─────────────┐
│   Walrus    │    │    Seal     │
│  Network    │    │   Service   │
└─────────────┘    └─────────────┘

┌─────────────┐
│   Buyer     │
│  (Client)   │
└──────┬──────┘
       │ 1. GET /file/:id
       ▼
┌─────────────────────────────────────┐
│      x402 Server                    │
│  ┌──────────────────────────────┐   │
│  │  Returns 402 Payment Required│   │
│  └──────────────────────────────┘   │
└──────┬──────────────────────────────┘
       │
       │ 2. Buyer pays on Sui
       ▼
┌─────────────┐
│ Sui Network │
└──────┬──────┘
       │ 3. GET /file/:id with X-PAYMENT header
       ▼
┌─────────────────────────────────────┐
│      x402 Server                    │
│  ┌──────────────────────────────┐   │
│  │  Verify payment on-chain     │   │
│  │  Check anti-replay           │   │
│  │  Issue receipt               │   │
│  │  Release key via Seal        │   │
│  └──────────────────────────────┘   │
└──────┬──────────────────────────────┘
       │
       │ 4. Return encrypted key or signed URL
       ▼
┌─────────────┐
│   Buyer     │
│  (Decrypts) │
└─────────────┘
```

### Payment Verification Methods

The server uses a **three-tier verification approach** for maximum reliability:

1. **Primary: Balance Changes** (Most Reliable)
   - Checks `balanceChanges` array in transaction response
   - Looks for `AddressOwner` with matching receiver address
   - Sums positive balance changes
   - Uses BigInt for precise amount calculations

2. **Fallback 1: Transfer Events**
   - Parses transaction events
   - Checks for `CoinTransfer` or `Transfer` event types
   - Extracts recipient and amount from `parsedJson`

3. **Fallback 2: Object Changes**
   - Verifies objects transferred to receiver address
   - Confirms transfer occurred (amount verification from other methods)

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Sui wallet with testnet/mainnet access
- (Optional) Walrus CLI installed for preferred storage method
- (Optional) Seal API credentials

### Installation

1. **Clone or navigate to the project directory:**

```bash
cd x402-server
```

2. **Install dependencies:**

```bash
npm install
```

3. **Configure environment:**

```bash
cp .env.example .env
# Edit .env with your configuration (see Configuration section)
```

4. **Start the server:**

```bash
# Production mode
npm start

# Development mode (with auto-reload)
npm run dev
```

The server will start on `http://localhost:3001` by default.

### Verify Installation

```bash
# Health check
curl http://localhost:3001/health

# Expected response:
# {"status":"ok","timestamp":"2024-..."}
```

## Configuration

### Environment Variables

Create a `.env` file in the project root. Here's a complete reference:

#### Server Configuration

```env
# Server port and host
PORT=3001
HOST=0.0.0.0

# Environment (development/production)
NODE_ENV=development
```

#### Sui Blockchain Configuration

```env
# Sui RPC endpoint
SUI_RPC_URL=https://fullnode.devnet.sui.io:443
# For mainnet: https://fullnode.mainnet.sui.io:443
# For testnet: https://fullnode.testnet.sui.io:443

# Your Sui address to receive payments
PAYMENT_RECEIVER_ADDRESS=0xYOUR_SUI_ADDRESS

# Payment currency (default: SUI)
PAYMENT_CURRENCY=0x2::sui::SUI

# Minimum payment amount in smallest unit
# 1 SUI = 1,000,000,000 (1e9) MIST
MIN_PAYMENT_AMOUNT_RAW=1000000000

# Number of checkpoints to wait for transaction finality
# Recommended: 2-3 for production
SUI_FINALITY_CHECKPOINTS=2
```

#### Walrus Configuration

**Option 1: CLI (Preferred)**
```env
# Set Walrus context (testnet/mainnet)
WALRUS_CONTEXT=testnet
```

**Option 2: HTTP API**
```env
WALRUS_API_URL=https://walrus.example/api
WALRUS_API_KEY=your-walrus-api-key
```

#### Seal Configuration

```env
SEAL_API_URL=https://seal.example/api
SEAL_API_KEY=your-seal-api-key
```

**Note:** In development mode, Seal will use mock responses if API URL is not configured.

#### Database Configuration

```env
# Local database file path (for lowdb)
DB_FILE=./data/db.json
```

### Configuration Validation

The server validates configuration on startup. Ensure:
- ✅ `SUI_RPC_URL` is accessible
- ✅ `PAYMENT_RECEIVER_ADDRESS` is a valid Sui address (0x + 64 hex chars)
- ✅ At least one Walrus integration method is configured
- ✅ Database directory is writable

## API Reference

### `POST /upload`

Upload encrypted file data to Walrus and store metadata.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "filename": "document.pdf",
  "ciphertextBase64": "base64-encoded-encrypted-data",
  "ownerAddress": "0x1234...5678",
  "priceRaw": 1000000000,
  "encryptedKeyForOwner": "encrypted-key-data",
  "epochs": 2
}
```

**Fields:**
- `filename` (required): Original filename (will be sanitized)
- `ciphertextBase64` (required): Base64-encoded encrypted file data
- `ownerAddress` (required): Sui address of file owner (must be valid Sui address)
- `priceRaw` (optional): Price in smallest unit (default: `MIN_PAYMENT_AMOUNT_RAW`)
- `encryptedKeyForOwner` (optional): Encrypted symmetric key to store in Seal
- `epochs` (optional): Storage duration in epochs for Walrus (default: 2)

**Response (200 OK):**
```json
{
  "ok": true,
  "blobId": "walrus-blob-id-123",
  "keyId": "seal-key-id-456",
  "priceRaw": 1000000000,
  "walrus": {
    "method": "cli",
    "blobId": "walrus-blob-id-123"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid input (missing fields, invalid format)
- `500 Internal Server Error`: Upload failed (check logs)

**Example:**
```bash
curl -X POST http://localhost:3001/upload \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "secret.pdf",
    "ciphertextBase64": "SGVsbG8gV29ybGQ=",
    "ownerAddress": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "priceRaw": 2000000000,
    "epochs": 5
  }'
```

---

### `GET /file/:id`

Access a file (x402 protected). Returns payment requirements if unpaid, or releases key if payment verified.

**Path Parameters:**
- `id`: File/blob identifier (from upload response)

**Request Headers (Optional):**
- `X-PAYMENT`: Base64-encoded transaction digest (for payment verification)
- `X-BUYER-ADDRESS`: Buyer's Sui address (optional, for Seal release)

**Query Parameters:**
- `buyer`: Buyer's Sui address (alternative to header)

**Response (402 Payment Required):**

When no payment proof is provided:

```json
{
  "payment_required": true,
  "payment_id": "blob-id-123",
  "amount_raw": 1000000000,
  "currency": "0x2::sui::SUI",
  "pay_to": "0x1234...5678",
  "network": "devnet",
  "instructions": "Send payment on Sui to the address above, then retry this request with X-PAYMENT header containing base64(txDigest)"
}
```

**Response (200 OK - Key Release):**

When payment is verified and Seal key exists:

```json
{
  "ok": true,
  "method": "seal_key_release",
  "encryptedKeyForBuyer": "encrypted-key-data-for-buyer",
  "releaseReceipt": "seal-release-receipt-id",
  "receipt": "base64-encoded-receipt",
  "walrus": {
    "blobId": "walrus-blob-id-123"
  },
  "fileMetadata": {
    "filename": "document.pdf",
    "originalSize": 1024
  }
}
```

**Response (200 OK - Signed URL):**

When payment is verified but no Seal key (fallback):

```json
{
  "ok": true,
  "method": "signed_fetch_url",
  "signedFetchUrl": "https://walrus.example/blob/123?signature=...",
  "expiresAt": "2024-01-01T12:00:00Z",
  "receipt": "base64-encoded-receipt",
  "walrus": {
    "blobId": "walrus-blob-id-123"
  },
  "fileMetadata": {
    "filename": "document.pdf",
    "originalSize": 1024
  }
}
```

**Error Responses:**
- `404 Not Found`: File not found
- `402 Payment Required`: Payment not verified (check `reason` and `detail` fields)
- `500 Internal Server Error`: Server error (check logs)

**Example - Request without payment:**
```bash
curl http://localhost:3001/file/walrus-blob-id-123
```

**Example - Request with payment:**
```bash
# Encode transaction digest
TX_DIGEST="0x1234...5678"
BASE64_TX=$(echo -n "$TX_DIGEST" | base64)

# Request with payment proof
curl -H "X-PAYMENT: $BASE64_TX" \
     http://localhost:3001/file/walrus-blob-id-123
```

---

### `GET /health`

Health check endpoint for monitoring.

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Example:**
```bash
curl http://localhost:3001/health
```

## Payment Flow

### Complete Flow Diagram

```
┌──────────┐
│ Creator  │
└────┬─────┘
     │
     │ 1. Encrypt file client-side
     │    - Generate symmetric key K
     │    - Encrypt file with K → ciphertext
     │    - Encrypt K with owner's public key → encryptedKeyForOwner
     │
     ▼
┌─────────────────────────────────────┐
│ POST /upload                        │
│ {                                   │
│   filename,                         │
│   ciphertextBase64,                 │
│   ownerAddress,                     │
│   encryptedKeyForOwner,             │
│   priceRaw                          │
│ }                                   │
└────┬────────────────────────────────┘
     │
     │ 2. Server stores:
     │    - ciphertext → Walrus (blobId)
     │    - encryptedKeyForOwner → Seal (keyId)
     │    - metadata → local DB
     │
     ▼
┌──────────┐
│  Buyer   │
└────┬─────┘
     │
     │ 3. GET /file/:blobId
     │
     ▼
┌─────────────────────────────────────┐
│ Server returns 402 Payment Required│
│ {                                   │
│   payment_required: true,          │
│   amount_raw: 1000000000,           │
│   pay_to: "0x...",                  │
│   instructions: "..."                │
│ }                                   │
└────┬────────────────────────────────┘
     │
     │ 4. Buyer creates Sui transaction
     │    - Transfer amount_raw to pay_to
     │    - Wait for transaction confirmation
     │    - Get transaction digest
     │
     ▼
┌──────────┐
│ Sui      │
│ Network  │
└────┬─────┘
     │
     │ 5. GET /file/:blobId
     │    Header: X-PAYMENT: base64(txDigest)
     │
     ▼
┌─────────────────────────────────────┐
│ Server verifies payment:            │
│ 1. Check tx exists & succeeded      │
│ 2. Verify transfer to pay_to        │
│ 3. Check amount >= amount_raw       │
│ 4. Check anti-replay (not consumed) │
│ 5. Mark tx as consumed              │
│ 6. Issue receipt                    │
│ 7. Release key via Seal             │
└────┬────────────────────────────────┘
     │
     │ 6. Return encryptedKeyForBuyer
     │
     ▼
┌──────────┐
│  Buyer   │
│ Decrypts │
└──────────┘
```

### Step-by-Step Guide

#### For Creators

1. **Encrypt your file client-side:**
   ```javascript
   // Pseudocode
   const symmetricKey = generateKey();
   const ciphertext = encrypt(file, symmetricKey);
   const encryptedKey = encrypt(symmetricKey, ownerPublicKey);
   ```

2. **Upload to server:**
   ```bash
   curl -X POST http://localhost:3001/upload \
     -H "Content-Type: application/json" \
     -d '{
       "filename": "myfile.pdf",
       "ciphertextBase64": base64(ciphertext),
       "ownerAddress": "0x...",
       "encryptedKeyForOwner": encryptedKey,
       "priceRaw": 1000000000
     }'
   ```

3. **Share the `blobId` with potential buyers**

#### For Buyers

1. **Request the file:**
   ```bash
   curl http://localhost:3001/file/{blobId}
   ```

2. **Receive 402 response with payment details:**
   ```json
   {
     "payment_required": true,
     "amount_raw": 1000000000,
     "pay_to": "0x...",
     "instructions": "..."
   }
   ```

3. **Make payment on Sui:**
   ```javascript
   // Using Sui SDK
   const tx = await suiClient.transferObject({
     objectId: coinId,
     recipient: pay_to,
     amount: amount_raw
   });
   const txDigest = tx.digest;
   ```

4. **Retry request with payment proof:**
   ```bash
   TX_B64=$(echo -n "$txDigest" | base64)
   curl -H "X-PAYMENT: $TX_B64" \
        http://localhost:3001/file/{blobId}
   ```

5. **Receive encrypted key and decrypt:**
   ```javascript
   const encryptedKeyForBuyer = response.encryptedKeyForBuyer;
   const symmetricKey = decrypt(encryptedKeyForBuyer, buyerPrivateKey);
   const file = decrypt(ciphertext, symmetricKey);
   ```

## Integration Details

### Sui Payment Verification

The server verifies payments using the Sui TypeScript SDK:

**Verification Process:**
1. Decode base64 transaction digest
2. Fetch transaction with full details:
   - `showEffects: true`
   - `showEvents: true`
   - `showBalanceChanges: true`
   - `showObjectChanges: true`
3. Check transaction status (must be `success`)
4. Verify payment using three-tier approach:
   - **Primary**: Check `balanceChanges` for receiver address
   - **Fallback 1**: Parse transfer events
   - **Fallback 2**: Check object changes
5. Verify amount >= required payment
6. Check anti-replay (transaction not previously consumed)
7. Mark transaction as consumed

**Transaction Digest Format:**
- Must be valid Sui transaction digest: `0x` + 64 hex characters
- Can be sent as base64-encoded string in `X-PAYMENT` header
- Server accepts both base64-encoded and raw hex strings

### Walrus Integration

**Method 1: CLI (Preferred)**

The server uses the `walrus` CLI if available:

```bash
# Install Walrus CLI (if not already installed)
# Follow Walrus documentation for installation

# Set environment variable
export WALRUS_CONTEXT=testnet  # or mainnet
```

The server will:
1. Write ciphertext to temporary file
2. Execute `walrus store <file> --epochs <N> --context <context>`
3. Parse blob ID from output
4. Clean up temporary file

**Method 2: HTTP API**

If CLI is not available, the server falls back to HTTP API:

```env
WALRUS_API_URL=https://walrus.example/api
WALRUS_API_KEY=your-api-key
```

The server will:
1. Create form-data with file
2. POST to `{WALRUS_API_URL}/upload`
3. Extract blob ID from response

**Method 3: Development Mock**

In development mode, if neither CLI nor API is configured, the server generates mock blob IDs for testing.

### Seal Integration

**Production Setup:**

```env
SEAL_API_URL=https://seal.example/api
SEAL_API_KEY=your-api-key
```

**Key Storage:**

When a file is uploaded with `encryptedKeyForOwner`, the server:
1. Calls `POST {SEAL_API_URL}/keys`
2. Stores key with release policy
3. Returns `keyId` for future reference

**Key Release:**

When payment is verified, the server:
1. Calls `POST {SEAL_API_URL}/keys/{keyId}/release`
2. Passes buyer address and payment proof
3. Receives `encryptedKeyForBuyer`
4. Returns to buyer

**Development Mode:**

If `SEAL_API_URL` is not configured, the server uses mock responses in development mode.

## Security

### Security Features

1. **Anti-Replay Protection**
   - All consumed transaction digests are stored in database
   - Transactions can only be used once
   - Atomic operations prevent race conditions

2. **Input Validation**
   - All inputs validated before processing
   - Sui address format validation (0x + 64 hex)
   - Base64 format validation
   - Filename sanitization (prevents path traversal)

3. **File Size Limits**
   - Configurable maximum file size (default: 100MB)
   - Prevents DoS attacks via large uploads

4. **Error Handling**
   - Safe error messages in production (hide sensitive details)
   - Detailed logging for debugging
   - Proper HTTP status codes

5. **Transaction Finality**
   - Optional checkpoint-based finality checks
   - Configurable via `SUI_FINALITY_CHECKPOINTS`

### Security Best Practices

- ✅ **Use HTTPS** in production
- ✅ **Secure environment variables** (use secrets management)
- ✅ **Validate all inputs** (already implemented)
- ✅ **Rate limiting** (recommended for production)
- ✅ **CORS configuration** (if serving web clients)
- ✅ **Regular dependency updates**
- ✅ **Security audits** before production deployment

### Production Security Checklist

- [ ] Enable HTTPS/TLS
- [ ] Set `NODE_ENV=production`
- [ ] Use secrets management for API keys
- [ ] Configure proper CORS
- [ ] Set up rate limiting
- [ ] Enable request logging
- [ ] Set up monitoring and alerting
- [ ] Regular security audits
- [ ] Keep dependencies updated

## Testing

### Quick Test

```bash
# Make test script executable
chmod +x scripts/test-pay.sh

# Run basic test
./scripts/test-pay.sh <file-id>
```

### Manual Testing

1. **Test Upload:**
   ```bash
   curl -X POST http://localhost:3001/upload \
     -H "Content-Type: application/json" \
     -d '{
       "filename": "test.txt",
       "ciphertextBase64": "SGVsbG8gV29ybGQ=",
       "ownerAddress": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
       "priceRaw": 1000000000
     }'
   ```

2. **Test File Access (No Payment):**
   ```bash
   curl http://localhost:3001/file/{blobId}
   # Should return 402
   ```

3. **Test Payment Verification:**
   ```bash
   # After making a real Sui payment
   TX_DIGEST="0x..."
   BASE64_TX=$(echo -n "$TX_DIGEST" | base64)
   curl -H "X-PAYMENT: $BASE64_TX" \
        http://localhost:3001/file/{blobId}
   ```

### Test Scenarios

1. **Unit Tests** (Recommended):
   - Test `verifyPayment()` with various transaction formats
   - Test input validation functions
   - Test receipt generation

2. **Integration Tests**:
   - Test full upload → request → payment → access flow
   - Test replay attack prevention
   - Test error scenarios

3. **End-to-End Tests**:
   - Test with real Sui devnet transactions
   - Test with Walrus CLI
   - Test with Seal API

## Production Deployment

### Prerequisites

- Node.js >= 18.0.0
- Production database (PostgreSQL/MongoDB recommended)
- HTTPS/TLS certificate
- Monitoring and logging setup
- Secrets management system

### Deployment Steps

1. **Prepare Environment:**
   ```bash
   # Set production environment
   export NODE_ENV=production
   
   # Configure all environment variables
   # Use secrets management for sensitive values
   ```

2. **Database Migration:**

   For production, migrate from `lowdb` to a production database:

   **PostgreSQL Example:**
   ```javascript
   // Update src/db.js to use PostgreSQL
   const { Pool } = require('pg');
   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
   
   async function markTxConsumed(txDigest, metadata) {
     await pool.query(
       'INSERT INTO consumed_txs (tx_digest, metadata, consumed_at) VALUES ($1, $2, NOW())',
       [txDigest, JSON.stringify(metadata)]
     );
   }
   ```

3. **Set Up Process Manager:**

   Use PM2 or similar:
   ```bash
   npm install -g pm2
   pm2 start src/app.js --name x402-server
   pm2 save
   pm2 startup
   ```

4. **Configure Reverse Proxy:**

   Use Nginx or similar:
   ```nginx
   server {
     listen 443 ssl;
     server_name your-domain.com;
     
     ssl_certificate /path/to/cert.pem;
     ssl_certificate_key /path/to/key.pem;
     
     location / {
       proxy_pass http://localhost:3001;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
     }
   }
   ```

5. **Set Up Monitoring:**

   - Application monitoring (e.g., New Relic, Datadog)
   - Error tracking (e.g., Sentry)
   - Log aggregation (e.g., ELK stack)
   - Uptime monitoring

### Production Checklist

- [ ] Replace `lowdb` with production database
- [ ] Set up HTTPS/TLS
- [ ] Configure environment variables securely
- [ ] Set up process manager (PM2/systemd)
- [ ] Configure reverse proxy
- [ ] Set up monitoring and alerting
- [ ] Configure rate limiting
- [ ] Set up backup strategy
- [ ] Load testing
- [ ] Security audit
- [ ] Update Sui SDK to latest version
- [ ] Configure Walrus and Seal production credentials
- [ ] Set up log rotation
- [ ] Configure CORS if needed

### Performance Optimization

1. **Database Indexing:**
   - Index `tx_digest` in `consumed_txs` table
   - Index `file_id` in `files` table

2. **Caching:**
   - Cache file metadata
   - Cache transaction verification results (with TTL)

3. **Connection Pooling:**
   - Use connection pooling for database
   - Configure Sui RPC connection limits

4. **Load Balancing:**
   - Deploy multiple server instances
   - Use load balancer for distribution

## Troubleshooting

### Common Issues

#### "Transaction not found"

**Symptoms:**
- Payment verification returns `tx_not_found`

**Solutions:**
- Ensure transaction has been included in a checkpoint
- Check RPC URL is correct and accessible
- Verify transaction digest format (0x + 64 hex chars)
- Wait a few seconds after transaction confirmation

#### "No transfer found"

**Symptoms:**
- Payment verification returns `no_transfer_found`

**Solutions:**
- Verify payment was sent to correct `PAYMENT_RECEIVER_ADDRESS`
- Check transaction includes balance changes or transfer events
- Ensure transaction type is a coin transfer (not object transfer)
- Check RPC response includes `balanceChanges` or `events`

#### "Transaction already consumed"

**Symptoms:**
- Payment verification returns `tx_already_consumed`

**Solutions:**
- This is expected if transaction was already used
- Each transaction can only be used once (anti-replay protection)
- Buyer needs to make a new payment

#### "Insufficient payment"

**Symptoms:**
- Payment verification returns `insufficient_payment`

**Solutions:**
- Verify payment amount >= `amount_raw` from 402 response
- Check currency matches (SUI vs other coins)
- Ensure no fees deducted from transfer amount

#### "Walrus upload failed"

**Symptoms:**
- Upload endpoint returns 500 error

**Solutions:**
- Check Walrus CLI is installed and in PATH
- Or verify `WALRUS_API_URL` and `WALRUS_API_KEY` are correct
- Check network connectivity
- Verify file size is within limits
- Check Walrus service status

#### "Seal key release failed"

**Symptoms:**
- File access returns `release_failed`

**Solutions:**
- Verify `SEAL_API_URL` and `SEAL_API_KEY` are correct
- Check Seal service is accessible
- Verify `keyId` exists in Seal
- Check Seal API response format

### Debug Mode

Enable detailed logging:

```bash
# Set log level
export DEBUG=*

# Or in code
console.log('Debug info:', data);
```

### Logs Location

- Application logs: Check console output or configured log file
- Database: `./data/db.json` (if using lowdb)
- Error logs: Check process manager logs (PM2, systemd, etc.)

## Migration Guide

If you have an existing implementation, follow these steps to migrate:

### 1. Update Sui SDK

**Before:**
```javascript
const { SuiJsonRpcClient } = require('@mysten/sui.js/jsonRpc');
```

**After:**
```javascript
const { SuiClient } = require('@mysten/sui.js/client');
```

### 2. Update Payment Verification

**Before:**
```javascript
// Regex-based event parsing
const evStr = JSON.stringify(ev);
if (evStr.includes(receiverAddress)) { ... }
```

**After:**
```javascript
// Use balanceChanges as primary method
const balanceChanges = tx.balanceChanges || [];
for (const change of balanceChanges) {
  if (change.owner === 'AddressOwner' && 
      change.ownerAddress === receiverAddress) {
    // Verify payment
  }
}
```

### 3. Add Input Validation

**Add to upload endpoint:**
```javascript
const { validateUploadInput } = require('./utils');
const validation = validateUploadInput(req.body);
if (!validation.valid) {
  return res.status(400).json({ error: validation.error });
}
```

### 4. Update Error Handling

**Before:**
```javascript
catch (err) {
  return res.status(500).json({ error: err.message });
}
```

**After:**
```javascript
catch (err) {
  console.error('Error:', err);
  return res.status(500).json({ 
    error: 'server_error',
    detail: config.nodeEnv === 'development' ? err.message : 'An error occurred'
  });
}
```

### 5. Add Environment Variables

Add to `.env`:
```env
SUI_FINALITY_CHECKPOINTS=2
```

### 6. Update Database Operations

**Before:**
```javascript
db.data.consumedTxs.push({ txDigest, ... });
```

**After:**
```javascript
// Check for duplicates first
const exists = db.data.consumedTxs.some(t => t.txDigest === txDigest);
if (exists) return false;
db.data.consumedTxs.push({ txDigest, ... });
```

## Additional Resources

### Documentation

- [Sui TypeScript SDK Documentation](https://sdk.mystenlabs.com/typescript)
- [Sui Developer Documentation](https://docs.sui.io)
- [x402 Protocol Specification](https://x402.dev) (if available)
- [Walrus Documentation](https://docs.walrus.xyz) (if available)
- [Seal Documentation](https://docs.seal.xyz) (if available)

### Related Projects

- [Sui Payment Kit](https://sdk.mystenlabs.com/payment-kit) - Sui payment processing library
- [x402 npm package](https://www.npmjs.com/package/x402) - x402 protocol utilities

### Support

For issues, questions, or contributions:
- Check existing issues in repository
- Create new issue with detailed description
- Include logs and error messages
- Provide steps to reproduce

## License

MIT

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Ensure all tests pass
6. Submit a pull request

### Code Style

- Follow existing code style
- Add comments for complex logic
- Update documentation for API changes
- Keep commits atomic and well-described

---

**Built with ❤️ for the decentralized web**
