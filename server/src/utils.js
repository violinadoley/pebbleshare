const crypto = require('crypto');

/**
 * Generate a receipt for a successful payment.
 * Receipts are base64-encoded JSON objects containing transaction details.
 * 
 * @param {string} txDigest - Transaction digest
 * @param {string} fileId - File identifier
 * @param {number} amount - Payment amount
 * @returns {string} Base64-encoded receipt
 */
function makeReceipt(txDigest, fileId, amount = null) {
  const issuedAt = new Date().toISOString();
  const receipt = {
    txDigest,
    fileId,
    issuedAt,
    receiptId: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    ...(amount !== null && { amount })
  };
  return Buffer.from(JSON.stringify(receipt)).toString('base64');
}

/**
 * Validate input parameters for upload endpoint.
 * 
 * @param {object} body - Request body
 * @returns {{valid: boolean, error?: string}}
 */
function validateUploadInput(body) {
  const { filename, ciphertextBase64, ownerAddress } = body;
  
  if (!filename || typeof filename !== 'string' || filename.trim().length === 0) {
    return { valid: false, error: 'filename is required and must be a non-empty string' };
  }
  
  if (!ciphertextBase64 || typeof ciphertextBase64 !== 'string') {
    return { valid: false, error: 'ciphertextBase64 is required' };
  }
  
  // Validate base64 format
  try {
    Buffer.from(ciphertextBase64, 'base64');
  } catch (e) {
    return { valid: false, error: 'ciphertextBase64 must be valid base64' };
  }
  
  if (!ownerAddress || typeof ownerAddress !== 'string') {
    return { valid: false, error: 'ownerAddress is required and must be a valid Sui address' };
  }
  
  // Basic Sui address validation (0x followed by hex)
  if (!/^0x[a-fA-F0-9]{64}$/.test(ownerAddress)) {
    return { valid: false, error: 'ownerAddress must be a valid Sui address (0x followed by 64 hex characters)' };
  }
  
  return { valid: true };
}

/**
 * Sanitize filename to prevent path traversal attacks.
 * 
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
  // Remove path components and dangerous characters
  return filename
    .replace(/[\/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
    .substring(0, 255); // Limit length
}

module.exports = { makeReceipt, validateUploadInput, sanitizeFilename };

