const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface UploadResponse {
  ok: boolean;
  fileId: string;
  blobId: string;
  walrus?: any;
  keyId?: string | null;
  priceRaw: number;
  txDigest?: string;
  onChain: boolean;
}

export interface FileMetadata {
  filename: string;
  owner: string;
  priceRaw: number;
  blobId: string;
  keyId: string;
  originalSize: number;
  createdAt: string;
  objectId: string;
}

/**
 * Upload a file to the backend
 * @param file - File to upload
 * @param ciphertextBase64 - Base64-encoded encrypted file data
 * @param ownerAddress - Owner's Sui address
 * @param priceRaw - Price in MIST (0 for free)
 * @param encryptedKeyForOwner - Seal backup key (hex string, optional)
 * @param epochs - Storage duration in epochs (default: 2)
 */
export async function uploadFile(
  file: File,
  ciphertextBase64: string,
  ownerAddress: string,
  priceRaw: number,
  encryptedKeyForOwner?: string,
  epochs: number = 2
): Promise<UploadResponse> {
  const response = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: file.name,
      ciphertextBase64,
      ownerAddress,
      priceRaw,
      encryptedKeyForOwner: encryptedKeyForOwner || '',
      epochs,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed', detail: 'Unknown error' }));
    const errorMessage = error.error || `Upload failed: ${response.statusText}`;
    const errorDetail = error.detail || '';
    
    // Check for WAL token error
    if (errorMessage.includes('WAL_TOKENS_REQUIRED') || errorDetail.includes('WAL')) {
      throw new Error('WAL_TOKENS_REQUIRED: Walrus storage requires WAL tokens. The backend Walrus CLI needs WAL testnet tokens in the Sui wallet configured at ~/.sui/sui_config/client.yaml. Please add WAL tokens to that wallet or configure WALRUS_API_URL in backend .env to use HTTP API instead.');
    }
    
    throw new Error(errorMessage + (errorDetail ? `: ${errorDetail}` : ''));
  }

  return response.json();
}

/**
 * Get file metadata from backend (x402 payment flow)
 * @param fileId - Sui object ID of the file
 * @param paymentTxDigest - Optional payment transaction digest (base64 encoded)
 */
export async function getFile(
  fileId: string,
  paymentTxDigest?: string
): Promise<{
  ok: boolean;
  method: 'seal_key_release' | 'signed_fetch_url';
  encryptedKeyForBuyer?: string;
  signedFetchUrl?: string;
  expiresAt?: string;
  receipt?: string;
  fileMetadata?: FileMetadata;
}> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (paymentTxDigest) {
    headers['X-PAYMENT'] = paymentTxDigest;
  }

  const response = await fetch(`${API_URL}/file/${fileId}`, {
    method: 'GET',
    headers,
  });

  if (response.status === 402) {
    // Payment required
    const paymentInfo = await response.json();
    throw { type: 'payment_required', data: paymentInfo };
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `Request failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch encrypted blob data from Walrus
 * @param blobId - Walrus blob ID
 */
export async function fetchBlob(blobId: string): Promise<{
    ok: boolean;
    blobId: string;
    data: string; // Base64 encoded
    contentType: string;
  }> {
    const response = await fetch(`${API_URL}/blob/${blobId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Blob fetch failed' }));
      throw new Error(error.error || `Blob fetch failed: ${response.statusText}`);
    }
  
    return response.json();
  }