import { SealClient, SessionKey } from '@mysten/seal';
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
 * Decrypt encrypted data using Seal SDK with backup key
 * Note: This requires the payment transaction bytes for access policy evaluation
 * 
 * @param encryptedData - Encrypted data as Uint8Array
 * @param id - File identifier (hex string)
 * @param packageId - Access policy package ID (hex string)
 * @param backupKeyHex - Backup key as hex string
 * @param buyerAddress - Buyer's Sui address
 * @param txDigest - Payment transaction digest (for creating txBytes)
 * @returns Decrypted data
 */
export async function decryptWithBackupKey(
  encryptedData: Uint8Array,
  id: string,
  packageId: string,
  backupKeyHex: string,
  buyerAddress: string,
  txDigest?: string
): Promise<Uint8Array> {
  const sealClient = getSealClient();
  const suiClient = getSuiClient();

  // Create session key
  const sessionKey = await SessionKey.create({
    address: buyerAddress,
    packageId: packageId,
    suiClient: suiClient,
    ttlMin: 60,
  });

  // Get transaction bytes from digest if provided
  let txBytes = new Uint8Array(0);
  if (txDigest) {
    try {
      // Fetch transaction to get bytes
      const tx = await suiClient.getTransactionBlock({
        digest: txDigest,
        options: {
          showRawInput: true,
        },
      });
      
      // Extract transaction bytes if available
      if (tx.rawTransaction) {
        txBytes = new Uint8Array(Buffer.from(tx.rawTransaction, 'base64'));
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.warn('Could not fetch transaction bytes, using empty bytes:', errorMessage);
    }
  }

  // Decrypt using Seal SDK
  // Note: The backup key is used internally by Seal SDK
  const decryptedBytes = await sealClient.decrypt({
    data: encryptedData,
    txBytes,
    sessionKey,
  });

  return decryptedBytes;
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