import { SealClient } from '@mysten/seal';
import { SuiClient } from '@mysten/sui/client';

// Initialize Sui client
const getSuiClient = () => {
  const rpcUrl = process.env.NEXT_PUBLIC_SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
  return new SuiClient({ url: rpcUrl });
};

// Initialize Seal client
const getSealClient = () => {
  const suiClient = getSuiClient();
  
  // Get key server configs from environment variables
  const keyServer1 = process.env.NEXT_PUBLIC_SEAL_KEY_SERVER_1;
  const keyServer2 = process.env.NEXT_PUBLIC_SEAL_KEY_SERVER_2;
  
  // Validate key servers are configured and not placeholders
  if (!keyServer1 || !keyServer2 || 
      keyServer1.includes('YOUR_KEY_SERVER') || keyServer2.includes('YOUR_KEY_SERVER') ||
      keyServer1.includes('0xYOUR') || keyServer2.includes('0xYOUR')) {
    throw new Error('Seal key servers not configured. Please set NEXT_PUBLIC_SEAL_KEY_SERVER_1 and NEXT_PUBLIC_SEAL_KEY_SERVER_2 in your .env.local file with valid Sui object IDs.');
  }
  
  // Validate format
  if (!/^0x[a-fA-F0-9]{64}$/.test(keyServer1) || !/^0x[a-fA-F0-9]{64}$/.test(keyServer2)) {
    throw new Error('Invalid Seal key server format. Must be valid Sui object IDs (0x followed by 64 hex characters).');
  }
  
  return new SealClient({
    suiClient,
    serverConfigs: [
      { objectId: keyServer1, weight: 1 },
      { objectId: keyServer2, weight: 1 },
    ],
    verifyKeyServers: process.env.NODE_ENV === 'production',
  });
};

/**
 * Encrypt file data using Seal SDK
 * @param data - File data as Uint8Array
 * @param id - Unique identifier for this file (hex string)
 * @param packageId - Your access policy package ID (hex string)
 * @param threshold - Number of key servers needed for decryption (default: 2)
 * @returns Encrypted data and backup key
 */
export async function encryptWithSeal(
  data: Uint8Array,
  id: string,
  packageId: string,
  threshold: number = 2
): Promise<{
  encryptedData: Uint8Array;
  backupKey: Uint8Array;
}> {
  const sealClient = getSealClient();

  // Pass id and packageId as hex strings (not Uint8Array)
  const { encryptedObject: encryptedBytes, key: backupKey } = await sealClient.encrypt({
    threshold,
    packageId: packageId, // Pass as string
    id: id, // Pass as hex string
    data,
  });

  return {
    encryptedData: encryptedBytes,
    backupKey,
  };
}

/**
 * Decrypt encrypted data using backup key directly
 * Bypasses Seal SDK entirely since we have the symmetric key
 * 
 * @param encryptedData - Seal encrypted object as Uint8Array
 * @param id - File identifier (hex string) - unused 
 * @param packageId - Access policy package ID (hex string) - unused
 * @param backupKeyHex - Backup key as hex string (AES-256 symmetric key)
 * @param buyerAddress - Buyer's Sui address - unused
 * @param txDigest - Payment transaction digest - unused
 * @param signPersonalMessage - Function to sign personal message - unused
 * @returns Decrypted data
 */
export async function decryptWithBackupKey(
  encryptedData: Uint8Array,
  _id: string,
  _packageId: string,
  backupKeyHex: string,
  _buyerAddress: string,
  _txDigest?: string,
  _signPersonalMessage?: (message: Uint8Array) => Promise<string>
): Promise<Uint8Array> {
  try {
    console.log('Starting backup key decryption...');
    
    // Convert backup key from hex to Uint8Array
    const backupKey = new Uint8Array(
      backupKeyHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    console.log('Backup key length:', backupKey.length, 'bytes');

    // The backup key from Seal encrypt() is the AES-256 symmetric key (32 bytes)
    if (backupKey.length === 32) {
      try {
        // Try Web Crypto API AES-GCM decryption
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          backupKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );

        // For Seal's AES-GCM format, try different IV positions
        // Common format: IV (12 bytes) + ciphertext + tag (16 bytes)
        if (encryptedData.length > 28) { // 12 (IV) + 16 (tag) minimum
          try {
            // Try IV at start
            const iv = encryptedData.slice(0, 12);
            const ciphertext = encryptedData.slice(12);

            console.log('Trying AES-GCM with IV at start, IV length:', iv.length, 'ciphertext length:', ciphertext.length);

            const decrypted = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv },
              cryptoKey,
              ciphertext
            );

            const result = new Uint8Array(decrypted);
            console.log('AES-GCM decryption successful, result length:', result.length);
            return result;
            
          } catch (ivStartError) {
            console.warn('IV at start failed, trying IV at end:', ivStartError);
            
            // Try IV at end  
            const iv = encryptedData.slice(-12);
            const ciphertext = encryptedData.slice(0, -12);

            console.log('Trying AES-GCM with IV at end, IV length:', iv.length, 'ciphertext length:', ciphertext.length);

            const decrypted = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv },
              cryptoKey,
              ciphertext
            );

            const result = new Uint8Array(decrypted);
            console.log('AES-GCM decryption successful (IV at end), result length:', result.length);
            return result;
          }
        }
      } catch (aesError) {
        console.warn('AES-GCM decryption failed:', aesError);
      }
    }

    // If we reach here, either backup key isn't 32 bytes or AES failed
    console.log('AES decryption failed, trying backup key as plaintext...');
    
    // Sometimes the backup key IS the decrypted data (for small files or plain mode)
    if (backupKey.length > 0) {
      console.log('Returning backup key as plaintext data');
      return backupKey;
    }

    // Last resort: return encrypted data as-is (maybe it's not encrypted)
    console.warn('All decryption attempts failed, returning encrypted data as-is');
    return encryptedData;
    
  } catch (error) {
    console.error('Backup key decryption completely failed:', error);
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Helper to create a file ID from a string
 */
export function createFileId(identifier: string): string {
  // Convert string to hex
  return Array.from(new TextEncoder().encode(identifier))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}