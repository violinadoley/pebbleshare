const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config');
const { verifyPayment } = require('./verifyPayment');
const { uploadCiphertextToWalrus, getSignedFetchUrl } = require('./walrus');
const { storeEncryptedKeyForFile, releaseKeyToBuyer } = require('./seal');
const db = require('./db');
const { makeReceipt, validateUploadInput, sanitizeFilename } = require('./utils');
const { nanoid } = require('nanoid');

const app = express();

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
  await db.init();

  /**
   * Upload endpoint for creators:
   *  - Client encrypts file client-side and sends ciphertext + metadata
   *  - Server uploads ciphertext to Walrus and stores metadata + keyId in Seal
   */
  app.post('/upload', async (req, res) => {
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

      // 2) Store encrypted symmetric key in Seal (if provided)
      let keyId = null;
      if (encryptedKeyForOwner) {
        try {
          const storeResp = await storeEncryptedKeyForFile(blobId, encryptedKeyForOwner, ownerAddress);
          keyId = storeResp.keyId || storeResp.id;
        } catch (sealError) {
          console.error('Seal storage failed:', sealError);
          // Continue without Seal if it's not critical
          // In production, you might want to fail the upload if Seal fails
        }
      }

      // 3) Persist metadata
      const price = Number(priceRaw) || config.sui.minPaymentRaw;
      await db.saveFileMetadata(blobId, {
        filename: safeFilename,
        ownerAddress,
        priceRaw: price,
        keyId,
        createdAt: new Date().toISOString(),
        walrus: uploadResp,
        originalSize: buffer.length
      });

      return res.json({ 
        ok: true, 
        blobId, 
        walrus: uploadResp, 
        keyId,
        priceRaw: price
      });
    } catch (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ 
        error: 'upload_failed', 
        detail: err.message || 'Internal server error' 
      });
    }
  });

  /**
   * x402 protected GET for file access
   * Behavior:
   *  - If no X-PAYMENT header -> return 402 with JSON payment requirements
   *  - If X-PAYMENT header present -> verify tx -> if ok, release key (via Seal) or return signed url
   */
  app.get('/file/:id', async (req, res) => {
    try {
      const fileId = req.params.id;
      const paymentHeader = req.header('x-payment') || req.header('X-PAYMENT');
      
      // Get file metadata
      const meta = await db.getFileMetadata(fileId);
      if (!meta) {
        return res.status(404).json({ error: 'file_not_found' });
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

        // If Seal key exists, release it
        if (meta.keyId) {
          const buyerAddress = req.query.buyer || req.header('x-buyer-address') || 'unknown';
          const releaseResp = await releaseKeyToBuyer(meta.keyId, buyerAddress, verification.txDigest);

          return res.json({
            ok: true,
            method: 'seal_key_release',
            encryptedKeyForBuyer: releaseResp.encryptedKeyForBuyer,
            releaseReceipt: releaseResp.releaseReceipt || null,
            receipt: receipt,
            walrus: meta.walrus,
            fileMetadata: {
              filename: meta.filename,
              originalSize: meta.originalSize
            }
          });
        } else {
          // Fallback: generate signed fetch URL from Walrus
          const signed = await getSignedFetchUrl(fileId, 300); // 5 minutes

          return res.json({
            ok: true,
            method: 'signed_fetch_url',
            signedFetchUrl: signed.url,
            expiresAt: signed.expiresAt || null,
            receipt: receipt,
            walrus: meta.walrus,
            fileMetadata: {
              filename: meta.filename,
              originalSize: meta.originalSize
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
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

