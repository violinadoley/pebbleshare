const axios = require('axios');
const config = require('./config');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Find walrus binary path
function getWalrusPath() {
  try {
    // Try to find walrus in PATH (including ~/.local/bin)
    const whichOutput = execSync('which walrus', { 
      encoding: 'utf8',
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}` }
    }).trim();
    if (whichOutput) return whichOutput;
  } catch (e) {
    // Fallback to common locations
  }
  
  // Common installation paths
  const commonPaths = [
    path.join(process.env.HOME, '.local', 'bin', 'walrus'),
    '/usr/local/bin/walrus',
    '/opt/homebrew/bin/walrus',
    'walrus' // Last resort
  ];
  
  for (const walrusPath of commonPaths) {
    if (walrusPath === 'walrus' || fs.existsSync(walrusPath)) {
      return walrusPath;
    }
  }
  
  return 'walrus'; // Last resort
}

const WALRUS_BIN = getWalrusPath();

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
      fs.writeFileSync(tempFile, buffer);
      
      const context = process.env.WALRUS_CONTEXT || 'testnet';
      const epochsFlag = epochs ? `--epochs ${epochs}` : '';
      
      console.log('Attempting walrus upload:', {
        walrusBin: WALRUS_BIN,
        tempFile,
        context,
        epochs
      });
      
      const output = execSync(
        `"${WALRUS_BIN}" store "${tempFile}" ${epochsFlag} --context ${context}`,
        { 
          encoding: 'utf8', 
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}` }
        }
      );
      
      // Clean up temp file
      fs.unlinkSync(tempFile);
      
      console.log('Walrus CLI output:', output);
      
      // Parse blob ID from output (format may vary)
      // Try multiple patterns to match different output formats
      const blobIdMatch = 
        output.match(/blob[_-]?id[:\s]+([a-zA-Z0-9_-]+)/i) || 
        output.match(/blob[_-]?id[:\s]+([a-f0-9]{64})/i) ||
        output.match(/id[:\s]+([a-zA-Z0-9_-]{32,})/i) ||
        output.match(/([a-f0-9]{64})/) ||
        output.match(/([a-zA-Z0-9]{32,})/);
      
      if (blobIdMatch && blobIdMatch[1]) {
        console.log('Parsed blob ID:', blobIdMatch[1]);
        return {
          blobId: blobIdMatch[1],
          method: 'cli',
          rawOutput: output
        };
      } else {
        console.warn('Could not parse blob ID from walrus output:', output);
        throw new Error('Failed to parse blob ID from walrus output');
      }
    } catch (cliError) {
      // CLI not available or failed, fall back to HTTP API
      console.error('Walrus CLI error:', {
        message: cliError.message,
        code: cliError.code,
        signal: cliError.signal,
        stderr: cliError.stderr?.toString(),
        stdout: cliError.stdout?.toString(),
        walrusBin: WALRUS_BIN
      });
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

    // No mock fallback - throw error if not configured
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
    // Note: walrus read command doesn't support --url-only flag
    // It downloads the file instead. For signed URLs, we need HTTP API.
    // The /blob/:blobId endpoint handles direct downloads via walrus read.

    // HTTP API for signed URLs
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

    // No mock fallback - throw error if not configured
    throw new Error('Walrus integration not configured for signed URLs. Set WALRUS_API_URL.');
  } catch (err) {
    console.error('getSignedFetchUrl error:', err);
    throw new Error(`Failed to get signed URL: ${err.message}`);
  }
}

module.exports = { uploadCiphertextToWalrus, getSignedFetchUrl };