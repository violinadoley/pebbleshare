const axios = require('axios');
const config = require('./config');
const { execSync } = require('child_process');

/**
 * Upload ciphertext to Walrus.
 * This implementation provides two options:
 * 1. HTTP API (if Walrus provides REST API)
 * 2. CLI-based (using walrus CLI if available)
 * 
 * @param {Buffer} buffer - Encrypted file data
 * @param {string} filename - Original filename
 * @param {number} epochs - Storage duration in epochs (optional)
 * @returns {Promise<{blobId: string, url?: string, walrus?: object}>}
 */
async function uploadCiphertextToWalrus(buffer, filename, epochs = 2) {
  try {
    // Option 1: Try Walrus CLI if available (preferred for production)
    try {
      const tempFile = `/tmp/walrus_upload_${Date.now()}_${filename}`;
      require('fs').writeFileSync(tempFile, buffer);
      
      const context = process.env.WALRUS_CONTEXT || 'testnet';
      const epochsFlag = epochs ? `--epochs ${epochs}` : '';
      
      const output = execSync(
        `walrus store "${tempFile}" ${epochsFlag} --context ${context}`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      
      // Clean up temp file
      require('fs').unlinkSync(tempFile);
      
      // Parse blob ID from output (format may vary)
      const blobIdMatch = output.match(/blob[_-]?id[:\s]+([a-zA-Z0-9_-]+)/i) || 
                         output.match(/([a-zA-Z0-9]{32,})/);
      
      if (blobIdMatch && blobIdMatch[1]) {
        return {
          blobId: blobIdMatch[1],
          method: 'cli',
          rawOutput: output
        };
      }
    } catch (cliError) {
      // CLI not available or failed, fall back to HTTP API
      console.debug('Walrus CLI not available, using HTTP API:', cliError.message);
    }

    // Option 2: HTTP API fallback
    if (config.walrus.apiUrl && config.walrus.apiUrl !== 'https://walrus.example/api') {
      const url = `${config.walrus.apiUrl.replace(/\/$/, '')}/upload`;
      
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('file', buffer, {
        filename: filename,
        contentType: 'application/octet-stream'
      });
      if (epochs) {
        formData.append('epochs', epochs.toString());
      }

      const res = await axios.post(url, formData, {
        headers: {
          ...formData.getHeaders(),
          'X-API-KEY': config.walrus.apiKey || ''
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 300000 // 5 minutes for large files
      });

      // Expect response { blobId, fetchUrl } or similar
      return {
        blobId: res.data.blobId || res.data.id || res.data.blob_id || res.data.blobId,
        url: res.data.url || res.data.fetchUrl,
        method: 'http',
        walrus: res.data
      };
    }

    // Fallback: generate a mock blob ID (for testing only)
    if (config.nodeEnv === 'development') {
      console.warn('Using mock blob ID - configure Walrus API or CLI for production');
      const { nanoid } = require('nanoid');
      return {
        blobId: nanoid(),
        method: 'mock',
        warning: 'Mock blob ID - not for production'
      };
    }

    throw new Error('Walrus integration not configured. Set WALRUS_API_URL or install walrus CLI.');
  } catch (err) {
    console.error('uploadCiphertextToWalrus error:', err);
    throw new Error(`Walrus upload failed: ${err.message}`);
  }
}

/**
 * Get a signed fetch URL for a blob from Walrus.
 * 
 * @param {string} blobId - Walrus blob identifier
 * @param {number} expiresSec - URL expiration in seconds (default: 60)
 * @returns {Promise<{url: string, expiresAt?: string}>}
 */
async function getSignedFetchUrl(blobId, expiresSec = 60) {
  try {
    // Option 1: Try Walrus CLI
    try {
      const context = process.env.WALRUS_CONTEXT || 'testnet';
      const output = execSync(
        `walrus read "${blobId}" --context ${context} --url-only`,
        { encoding: 'utf8' }
      );
      
      const urlMatch = output.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        return {
          url: urlMatch[0],
          expiresAt: new Date(Date.now() + expiresSec * 1000).toISOString(),
          method: 'cli'
        };
      }
    } catch (cliError) {
      console.debug('Walrus CLI not available for signed URL:', cliError.message);
    }

    // Option 2: HTTP API
    if (config.walrus.apiUrl && config.walrus.apiUrl !== 'https://walrus.example/api') {
      const url = `${config.walrus.apiUrl.replace(/\/$/, '')}/signed_url`;
      const res = await axios.post(
        url,
        { blobId, expiresSec },
        {
          headers: { 'X-API-KEY': config.walrus.apiKey || '' },
          timeout: 10000
        }
      );

      return {
        url: res.data.url || res.data.signedUrl,
        expiresAt: res.data.expiresAt || new Date(Date.now() + expiresSec * 1000).toISOString(),
        method: 'http'
      };
    }

    // Fallback: construct a basic URL (for testing)
    if (config.nodeEnv === 'development') {
      return {
        url: `${config.walrus.apiUrl || 'https://walrus.example'}/blob/${blobId}`,
        expiresAt: new Date(Date.now() + expiresSec * 1000).toISOString(),
        method: 'mock',
        warning: 'Mock URL - not for production'
      };
    }

    throw new Error('Walrus integration not configured for signed URLs');
  } catch (err) {
    console.error('getSignedFetchUrl error:', err);
    throw new Error(`Failed to get signed URL: ${err.message}`);
  }
}

module.exports = { uploadCiphertextToWalrus, getSignedFetchUrl };

