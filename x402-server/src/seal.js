const axios = require('axios');
const config = require('./config');

/**
 * Store encrypted symmetric key in Seal with a release policy.
 * 
 * @param {string} fileId - File identifier
 * @param {string} encryptedKey - Encrypted symmetric key (base64 or hex)
 * @param {string} ownerAddress - Owner's Sui address
 * @param {object} policy - Release policy (optional, defaults to payment-based)
 * @returns {Promise<{keyId: string}>}
 */
async function storeEncryptedKeyForFile(fileId, encryptedKey, ownerAddress, policy = null) {
  try {
    if (!config.seal.apiUrl || config.seal.apiUrl === 'https://seal.example/api') {
      // For development/testing: generate mock keyId
      if (config.nodeEnv === 'development') {
        console.warn('Using mock Seal keyId - configure SEAL_API_URL for production');
        const { nanoid } = require('nanoid');
        return {
          keyId: nanoid(),
          method: 'mock',
          warning: 'Mock keyId - not for production'
        };
      }
      throw new Error('Seal API URL not configured');
    }

    const url = `${config.seal.apiUrl.replace(/\/$/, '')}/keys`;
    
    const payload = {
      fileId,
      ownerAddress,
      encryptedKey,
      policy: policy || {
        type: 'payment_verified',
        description: 'Release key upon payment verification'
      }
    };

    const res = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${config.seal.apiKey || ''}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      keyId: res.data.keyId || res.data.id || res.data.key_id,
      method: 'http',
      seal: res.data
    };
  } catch (err) {
    console.error('storeEncryptedKeyForFile error:', err);
    throw new Error(`Seal key storage failed: ${err.message}`);
  }
}

/**
 * Instruct Seal to release the encrypted key to the buyer.
 * 
 * @param {string} keyId - Seal key identifier
 * @param {string} buyerAddress - Buyer's Sui address
 * @param {string} paymentProof - Transaction digest (for verification)
 * @returns {Promise<{encryptedKeyForBuyer: string, releaseReceipt?: string}>}
 */
async function releaseKeyToBuyer(keyId, buyerAddress, paymentProof = null) {
  try {
    if (!config.seal.apiUrl || config.seal.apiUrl === 'https://seal.example/api') {
      // For development/testing: return mock encrypted key
      if (config.nodeEnv === 'development') {
        console.warn('Using mock Seal key release - configure SEAL_API_URL for production');
        return {
          encryptedKeyForBuyer: 'mock_encrypted_key_for_buyer_' + buyerAddress,
          releaseReceipt: 'mock_receipt_' + Date.now(),
          method: 'mock',
          warning: 'Mock key release - not for production'
        };
      }
      throw new Error('Seal API URL not configured');
    }

    const url = `${config.seal.apiUrl.replace(/\/$/, '')}/keys/${keyId}/release`;
    
    const payload = {
      buyerAddress,
      paymentProof: paymentProof || null,
      timestamp: new Date().toISOString()
    };

    const res = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${config.seal.apiKey || ''}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      encryptedKeyForBuyer: res.data.encryptedKeyForBuyer || res.data.encryptedKey || res.data.key,
      releaseReceipt: res.data.releaseReceipt || res.data.receipt || res.data.id,
      method: 'http',
      seal: res.data
    };
  } catch (err) {
    console.error('releaseKeyToBuyer error:', err);
    throw new Error(`Seal key release failed: ${err.message}`);
  }
}

module.exports = { storeEncryptedKeyForFile, releaseKeyToBuyer };

