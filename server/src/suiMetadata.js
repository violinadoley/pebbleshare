const { SuiClient } = require('@mysten/sui/client');
const { Transaction } = require('@mysten/sui/transactions');
const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
const config = require('./config');

const suiClient = new SuiClient({ url: config.sui.rpcUrl });

// Package ID from deployment
const FILE_REGISTRY_PACKAGE_ID = process.env.FILE_REGISTRY_PACKAGE_ID || '0x0';

/**
 * Initialize keypair from private key
 * @returns {Ed25519Keypair}
 */
function getSignerKeypair() {
  const privateKey = process.env.SUI_SIGNER_KEY;
  if (!privateKey) {
    throw new Error('SUI_SIGNER_KEY environment variable is required');
  }
  
  try {
    // Handle both bech32 format (suiprivkey...) and hex format
    if (privateKey.startsWith('suiprivkey')) {
      return Ed25519Keypair.fromSecretKey(privateKey);
    } else {
      // If hex format, convert
      const keyBytes = Buffer.from(privateKey.replace('0x', ''), 'hex');
      return Ed25519Keypair.fromSecretKey(keyBytes);
    }
  } catch (error) {
    throw new Error(`Failed to initialize keypair: ${error.message}`);
  }
}

/**
 * Create file metadata on-chain
 * @param {string} filename - Original filename
 * @param {string} ownerAddress - Owner's Sui address
 * @param {number} priceRaw - Price in MIST
 * @param {string} blobId - Walrus blob ID
 * @param {string} keyId - Seal backup key ID (hex string)
 * @param {number} originalSize - Original file size in bytes
 * @returns {Promise<{objectId: string, txDigest: string}>}
 */
async function createFileMetadataOnChain(
  filename,
  ownerAddress,
  priceRaw,
  blobId,
  keyId,
  originalSize
) {
  try {
    const keypair = getSignerKeypair();
    const txb = new Transaction();
    
    // Convert strings to Uint8Array for vector<u8> arguments
    const filenameBytes = new TextEncoder().encode(filename);
    const blobIdBytes = new TextEncoder().encode(blobId);
    const keyIdBytes = new TextEncoder().encode(keyId);
    
    // Call the Move function: create_file_metadata
    // All arguments must be wrapped with txb.pure() with BCS type name
    txb.moveCall({
      target: `${FILE_REGISTRY_PACKAGE_ID}::file_registry::create_file_metadata`,
      arguments: [
        txb.pure('vector<u8>', filenameBytes),  // vector<u8>
        txb.pure('address', ownerAddress),       // address (also needs pure!)
        txb.pure('u64', BigInt(priceRaw)),      // u64
        txb.pure('vector<u8>', blobIdBytes),     // vector<u8>
        txb.pure('vector<u8>', keyIdBytes),      // vector<u8>
        txb.pure('u64', BigInt(originalSize))    // u64
      ],
    });
    
    // Sign and execute transaction
    const result = await suiClient.signAndExecuteTransaction({
      signer: keypair,
      transaction: txb,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    
    // Extract object ID from transaction effects
    const createdObjects = result.effects?.created || [];
    const objectId = createdObjects[0]?.reference?.objectId;
    
    if (!objectId) {
      throw new Error('Failed to get object ID from transaction');
    }
    
    return {
      objectId,
      txDigest: result.digest,
    };
  } catch (error) {
    console.error('createFileMetadataOnChain error:', error);
    throw new Error(`Failed to create file metadata on-chain: ${error.message}`);
  }
}

/**
 * Get file metadata from on-chain object
 * @param {string} objectId - Sui object ID
 * @returns {Promise<object>}
 */
async function getFileMetadataFromChain(objectId) {
  try {
    const object = await suiClient.getObject({
      id: objectId,
      options: {
        showContent: true,
        showType: true,
      },
    });
    
    if (!object.data || object.error) {
      throw new Error(`Object not found: ${objectId}`);
    }
    
    // Parse the object content
    const content = object.data.content;
    if (content.dataType !== 'moveObject') {
      throw new Error('Object is not a Move object');
    }
    
    const fields = content.fields;
    
    return {
      filename: Buffer.from(fields.filename || []).toString('utf-8'),
      owner: fields.owner,
      priceRaw: fields.price_raw || fields.priceRaw,
      blobId: Buffer.from(fields.blob_id || fields.blobId || []).toString('utf-8'),
      keyId: Buffer.from(fields.key_id || fields.keyId || []).toString('utf-8'),
      originalSize: fields.original_size || fields.originalSize,
      createdAt: fields.created_at || fields.createdAt,
      objectId: objectId,
    };
  } catch (error) {
    console.error('getFileMetadataFromChain error:', error);
    throw new Error(`Failed to get file metadata from chain: ${error.message}`);
  }
}

module.exports = {
  createFileMetadataOnChain,
  getFileMetadataFromChain,
};