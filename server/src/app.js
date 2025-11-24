const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config');
const { verifyPayment } = require('./verifyPayment');
const { uploadCiphertextToWalrus, getSignedFetchUrl } = require('./walrus');
const { createFileMetadataOnChain, getFileMetadataFromChain } = require('./suiMetadata');
const db = require('./db'); // Still needed for anti-replay protection
const { makeReceipt, validateUploadInput, sanitizeFilename } = require('./utils');
const { nanoid } = require('nanoid');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', // Configure for production
  credentials: true
}));

// Rate limiting for upload endpoint
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start() {
  await db.init(); // Still needed for anti-replay protection

  if (!config.sui.rpcUrl) {
    throw new Error('SUI_RPC_URL environment variable is required');
  }
  if (!config.sui.receiverAddress) {
    throw new Error('PAYMENT_RECEIVER_ADDRESS environment variable is required');
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(config.sui.receiverAddress)) {
    throw new Error('PAYMENT_RECEIVER_ADDRESS must be a valid Sui address (0x followed by 64 hex characters)');
  }
  if (!config.fileRegistry?.packageId) {
    throw new Error('FILE_REGISTRY_PACKAGE_ID environment variable is required');
  }
  if (!process.env.SUI_SIGNER_KEY) {
    throw new Error('SUI_SIGNER_KEY environment variable is required for on-chain metadata creation');
  }

  // Warn if Walrus/Seal not configured (but allow dev mode)
  if (config.nodeEnv === 'production') {
    if (!config.walrus.apiUrl && !process.env.WALRUS_CONTEXT) {
      console.warn('WARNING: Walrus not configured. Set WALRUS_CONTEXT or WALRUS_API_URL');
    }
  }

  /**
   * Upload endpoint for creators:
   *  - Client encrypts file client-side and sends ciphertext + metadata
   *  - Server uploads ciphertext to Walrus and creates metadata on-chain
   */
  app.post('/upload', uploadLimiter, async (req, res) => {
    try {
      // Validate input
      const validation = validateUploadInput(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const { filename, ciphertextBase64, ownerAddress, priceRaw, encryptedKeyForOwner, epochs } = req.body;
      
      // Sanitize filename
      const safeFilename = sanitizeFilename(filename);
      
      // Convert base64 to buffer
      let buffer;
      try {
        buffer = Buffer.from(ciphertextBase64, 'base64');
      } catch (e) {
        return res.status(400).json({ error: 'Invalid base64 ciphertext' });
      }

      // Validate buffer size (optional: set max file size)
      const maxSize = 100 * 1024 * 1024; // 100MB default
      if (buffer.length > maxSize) {
        return res.status(400).json({ error: `File too large. Maximum size: ${maxSize} bytes` });
      }

      // 1) Upload ciphertext to Walrus
      const uploadResp = await uploadCiphertextToWalrus(buffer, safeFilename, epochs || 2);
      const blobId = uploadResp.blobId || uploadResp.id || uploadResp.blob_id || nanoid();

      // 2) Prepare keyId (Seal backup key)
      const keyId = encryptedKeyForOwner || '';

      // 3) Create file metadata on-chain
      const price = Number(priceRaw) || config.sui.minPaymentRaw;
      let fileObjectId;
      let txDigest;
      
      try {
        const onChainResult = await createFileMetadataOnChain(
          safeFilename,
          ownerAddress,
          price,
          blobId,
          keyId,
          buffer.length
        );
        fileObjectId = onChainResult.objectId;
        txDigest = onChainResult.txDigest;
        console.log(`✅ File metadata created on-chain: ${fileObjectId} (tx: ${txDigest})`);
      } catch (onChainError) {
        console.error('Failed to create on-chain metadata:', onChainError);
        // In production, you might want to fail the upload if on-chain creation fails
        // For now, we'll continue but log the error
        throw new Error(`Failed to create file metadata on-chain: ${onChainError.message}`);
      }

      return res.json({ 
        ok: true, 
        fileId: fileObjectId, // Return the Sui object ID as the file identifier
        blobId, // Also return blobId for reference
        walrus: uploadResp, 
        keyId: keyId || null,
        priceRaw: price,
        txDigest, // Transaction digest for the on-chain creation
        onChain: true
      });
    } catch (err) {
      console.error('Upload error:', err);
      const errorMessage = err.message || 'Internal server error';
      
      // Check for WAL token error and provide helpful message
      if (errorMessage.includes('WAL_TOKENS_REQUIRED') || errorMessage.includes('WAL')) {
        return res.status(500).json({ 
          error: 'wal_tokens_required', 
          detail: errorMessage
        });
      }
      
      return res.status(500).json({ 
        error: 'upload_failed', 
        detail: errorMessage
      });
    }
  });

  /**
   * x402 protected GET for file access
   * Behavior:
   *  - If no X-PAYMENT header -> return 402 with JSON payment requirements
   *  - If X-PAYMENT header present -> verify tx -> if ok, release key (via Seal) or return signed url
   * Note: fileId is now the Sui object ID of the FileMetadata
   */
  app.get('/file/:id', async (req, res) => {
    try {
      const fileId = req.params.id; // This is now the Sui object ID
      const paymentHeader = req.get('x-payment');
      
      // Get file metadata from blockchain
      const meta = await getFileMetadataFromChain(fileId);
      if (!meta) {
        return res.status(404).json({ error: 'file_not_found', message: 'File metadata not found on-chain' });
      }

      const amountRaw = meta.priceRaw || config.sui.minPaymentRaw;

      // x402: Return 402 Payment Required if no payment proof provided
      if (!paymentHeader) {
        return res.status(402).json({
          payment_required: true,
          payment_id: fileId,
          amount_raw: amountRaw,
          currency: config.sui.currency,
          pay_to: config.sui.receiverAddress,
          network: config.sui.rpcUrl.includes('devnet') ? 'devnet' : 
                   config.sui.rpcUrl.includes('testnet') ? 'testnet' : 'mainnet',
          instructions: "Send payment on Sui to the address above, then retry this request with X-PAYMENT header containing base64(txDigest)"
        });
      }

      // Verify payment
      const verification = await verifyPayment(paymentHeader, fileId, amountRaw);
      if (!verification.ok) {
        return res.status(402).json({ 
          error: 'payment_not_verified', 
          reason: verification.reason, 
          detail: verification.detail || null 
        });
      }

      // Payment verified - release key or generate signed URL
      try {
        const receipt = makeReceipt(verification.txDigest, fileId, verification.amount);
        
        // Set x402 receipt header
        res.set('X-PAYMENT-RESPONSE', receipt);

        // If Seal key exists, return it (it's stored in keyId field)
        if (meta.keyId && meta.keyId.length > 0) {
          // The keyId field contains the Seal backup key
          return res.json({
            ok: true,
            method: 'seal_key_release',
            encryptedKeyForBuyer: meta.keyId, // This is the backup key from Seal
            receipt: receipt,
            fileMetadata: {
              filename: meta.filename,
              originalSize: meta.originalSize,
              owner: meta.owner,
              createdAt: meta.createdAt,
              blobId: meta.blobId 
            }
          });
        } else {
          // No Seal key - return signed Walrus URL
          const signed = await getSignedFetchUrl(meta.blobId, 300); // 5 minutes

          return res.json({
            ok: true,
            method: 'signed_fetch_url',
            signedFetchUrl: signed.url,
            expiresAt: signed.expiresAt || null,
            receipt: receipt,
            fileMetadata: {
              filename: meta.filename,
              originalSize: meta.originalSize,
              owner: meta.owner,
              createdAt: meta.createdAt,
              blobId: meta.blobId
            }
          });
        }
      } catch (releaseError) {
        console.error('Key release error:', releaseError);
        // Even if release fails, payment was verified - return receipt
        return res.status(500).json({ 
          error: 'release_failed', 
          detail: releaseError.message || null,
          receipt: makeReceipt(verification.txDigest, fileId, verification.amount),
          note: 'Payment verified but key release failed. Contact support.'
        });
      }
    } catch (err) {
      console.error('File access error:', err);
      return res.status(500).json({ 
        error: 'server_error', 
        detail: err.message || 'Internal server error' 
      });
    }
  });

  /**
   * Get encrypted blob data from Walrus
   * This endpoint fetches the raw encrypted blob for decryption
   */
  app.get('/blob/:blobId', async (req, res) => {
    const fs = require('fs');
    const { execSync } = require('child_process');
    const path = require('path');
    
    try {
      const { blobId } = req.params;
      
      console.log('[Blob Fetch] Requested blobId:', blobId);
      
      // Option 1: Try to fetch directly using walrus CLI (downloads to temp file)
      try {
        const context = process.env.WALRUS_CONTEXT || 'testnet';
        const tempFile = `/tmp/walrus_fetch_${Date.now()}_${blobId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // Get walrus binary path
        const getWalrusPath = () => {
          try {
            const whichOutput = execSync('which walrus', { 
              encoding: 'utf8',
              env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}` }
            }).trim();
            if (whichOutput) return whichOutput;
          } catch (e) {}
          
          const commonPaths = [
            path.join(process.env.HOME, '.local', 'bin', 'walrus'),
            '/usr/local/bin/walrus',
            '/opt/homebrew/bin/walrus',
            'walrus'
          ];
          
          for (const walrusPath of commonPaths) {
            if (walrusPath === 'walrus' || fs.existsSync(walrusPath)) {
              return walrusPath;
            }
          }
          
          return 'walrus';
        };
        
        const WALRUS_BIN = getWalrusPath();
        
        // Download blob to temp file using walrus read
        execSync(
          `"${WALRUS_BIN}" read "${blobId}" --context ${context} --out "${tempFile}"`,
          { 
            encoding: 'utf8',
            env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}` }
          }
        );
        
        // Read the file
        const blobData = fs.readFileSync(tempFile);
        
        // Clean up temp file
        fs.unlinkSync(tempFile);
        
        console.log('[Blob Fetch] Successfully fetched blob via CLI, size:', blobData.length, 'bytes');
        
        // Return as base64
        return res.json({
          ok: true,
          blobId,
          data: blobData.toString('base64'),
          contentType: 'application/octet-stream'
        });
      } catch (cliError) {
        console.error('[Blob Fetch] Walrus CLI error:', {
          message: cliError.message,
          stderr: cliError.stderr?.toString(),
          stdout: cliError.stdout?.toString(),
          code: cliError.code,
          signal: cliError.signal
        });
        // Re-throw if it's not a command execution error (e.g., file not found)
        if (cliError.code !== undefined && cliError.code !== 0) {
          throw new Error(`Walrus CLI failed: ${cliError.stderr?.toString() || cliError.message}`);
        }
        // Fall through to HTTP API or signed URL approach
      }
      
      // Option 2: Try to get signed URL and fetch (if HTTP API is configured)
      try {
        const signed = await getSignedFetchUrl(blobId, 300); // 5 minutes
        
        console.log('[Blob Fetch] Got signed URL:', signed.url);
        
        // Fetch the blob data
        const blobResponse = await fetch(signed.url);
        if (!blobResponse.ok) {
          console.error('[Blob Fetch] Walrus fetch failed:', {
            status: blobResponse.status,
            statusText: blobResponse.statusText,
            url: signed.url,
            blobId: blobId
          });
          throw new Error(`Failed to fetch blob from Walrus: ${blobResponse.statusText}`);
        }
        
        const blobData = await blobResponse.arrayBuffer();
        console.log('[Blob Fetch] Successfully fetched blob via HTTP, size:', blobData.byteLength, 'bytes');
        
        // Return as base64 for easy transfer
        return res.json({
          ok: true,
          blobId,
          data: Buffer.from(blobData).toString('base64'),
          contentType: blobResponse.headers.get('content-type') || 'application/octet-stream'
        });
      } catch (httpError) {
        console.error('[Blob Fetch] HTTP fetch error:', httpError.message);
        throw httpError;
      }
    } catch (err) {
      console.error('[Blob Fetch] Error:', {
        message: err.message,
        stack: err.stack,
        blobId: req.params.blobId
      });
      res.status(500).json({ 
        error: 'blob_fetch_failed', 
        detail: err.message || 'Internal server error' 
      });
    }
  });

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
      error: 'internal_server_error', 
      detail: config.nodeEnv === 'development' ? err.message : 'An error occurred' 
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  app.listen(config.port, config.host, () => {
    console.log(`x402 server running on http://${config.host}:${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Sui RPC: ${config.sui.rpcUrl}`);
    console.log(`Payment receiver: ${config.sui.receiverAddress || 'NOT SET'}`);
    console.log(`File Registry Package: ${config.fileRegistry?.packageId || 'NOT SET'}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});