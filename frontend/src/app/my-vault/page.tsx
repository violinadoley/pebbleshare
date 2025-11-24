'use client';

import React, { useState, useMemo } from 'react';
import Navbar from '../components/Navbar';
import UploadModal from '../components/UploadModal';
import { encryptWithSeal, createFileId, decryptWithBackupKey } from '@/lib/seal';
import { uploadFile, getFile, fetchBlob, listFiles, ListedFile, PaymentInfo, ApiError } from '@/lib/api';
import { useWalletAddress, useIsWalletConnected, useSendPayment } from '@/lib/wallet';
import { useSignPersonalMessage } from '@mysten/dapp-kit';

// Type definition for Data Blob
interface DataBlob {
  filename: string;
  ownerAddress: string;
  priceRaw: number;
  keyId: string | null;
  createdAt: string;
  walrus?: { blobId: string; [key: string]: unknown };
  originalSize: number;
  isPaywalled: boolean;
  fileId?: string; // Sui object ID
  isPublic: boolean;
}

// Mock data - simulating user's own data blobs
const mockMyBlobs: DataBlob[] = [
  {
    filename: 'my-research-data.csv',
    ownerAddress: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
    priceRaw: 5000000000, // 5 SUI in MIST
    keyId: 'seal-key-abc123',
    createdAt: '2024-01-15T10:30:00Z',
    walrus: { blobId: 'walrus-001', status: 'uploaded' },
    originalSize: 2048576, // 2 MB
    isPaywalled: true,
    isPublic: true,
  },
  {
    filename: 'personal-documents.zip',
    ownerAddress: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
    priceRaw: 0,
    keyId: 'seal-key-xyz789',
    createdAt: '2024-01-18T09:15:00Z',
    walrus: { blobId: 'walrus-003', status: 'uploaded' },
    originalSize: 10485760, // 10 MB
    isPaywalled: false,
    isPublic: false,
  },
  {
    filename: 'project-backup.tar.gz',
    ownerAddress: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
    priceRaw: 15000000000, // 15 SUI in MIST
    keyId: 'seal-key-def456',
    createdAt: '2024-01-22T16:20:00Z',
    walrus: { blobId: 'walrus-004', status: 'uploaded' },
    originalSize: 15728640, // 15 MB
    isPaywalled: true,
    isPublic: false,
  },
];

// Utility functions
const formatPrice = (priceRaw: number): string => {
  if (priceRaw === 0) return 'Free';
  // Convert MIST to SUI (1 SUI = 1,000,000,000 MIST)
  const sui = priceRaw / 1000000000;
  return `${sui.toFixed(2)} SUI`;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const truncateAddress = (address: string, start: number = 6, end: number = 4): string => {
  if (!address) return '';
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};

const mapListedFileToBlob = (file: ListedFile): DataBlob => ({
  filename: file.filename,
  ownerAddress: file.ownerAddress,
  priceRaw: file.priceRaw,
  keyId: file.keyId,
  createdAt: file.createdAt,
  walrus: { blobId: file.blobId },
  originalSize: file.originalSize,
  isPaywalled: file.isPaywalled,
  fileId: file.fileId,
  isPublic: file.isPublic,
});

const MyVaultCard: React.FC<{ blob: DataBlob }> = ({ blob }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const walletAddress = useWalletAddress();
  const isWalletConnected = useIsWalletConnected();
  const sendPayment = useSendPayment();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const signPersonalMessageForSession = React.useCallback(
    async (message: Uint8Array) => {
      const { signature } = await signPersonalMessage({ message });
      return signature;
    },
    [signPersonalMessage]
  );

  const handleDownload = async (txDigest?: string) => {
    if (!blob.fileId) {
      setDownloadError('File ID not available');
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);
    setPaymentInfo(null);

    try {
      // Try to access file (will get 402 if paywalled)
      const base64Digest = txDigest ? btoa(txDigest) : undefined;
      const response = await getFile(blob.fileId, {
        paymentTxDigest: base64Digest,
        buyerAddress: walletAddress || undefined,
      });
      
      // If we get here, file is accessible (free or already paid)
      if (response.method === 'seal_key_release' && response.encryptedKeyForBuyer && response.fileMetadata) {
        // File is encrypted - fetch blob and decrypt
        try {
          // 1. Fetch encrypted blob from Walrus
          const blobData = await fetchBlob(response.fileMetadata.blobId);
          
          // 2. Convert base64 to Uint8Array
          const encryptedBytes = Uint8Array.from(
            atob(blobData.data),
            c => c.charCodeAt(0)
          );
          
          // 3. Get necessary info for decryption
          const packageId = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID;
          if (!packageId || packageId.includes('YOUR_SEAL_PACKAGE_ID') || packageId.includes('0xYOUR')) {
            throw new Error('Seal package ID not configured. Please set NEXT_PUBLIC_SEAL_PACKAGE_ID in your .env.local file.');
          }
          
          // Validate format
          if (!/^0x[a-fA-F0-9]{64}$/.test(packageId)) {
            throw new Error(`Invalid Seal Package ID format: ${packageId}. Must be a valid Sui object ID.`);
          }
          
          // Get buyer address from wallet
          if (!walletAddress) {
            throw new Error('Wallet not connected. Please connect your wallet to download encrypted files.');
          }
          const buyerAddress = walletAddress;
          
          // Create file ID (we'll use the filename + timestamp from metadata)
          const fileId = createFileId(`${response.fileMetadata.filename}-${response.fileMetadata.createdAt}`);
          
          // 4. Decrypt using backup key
          const decryptedBytes = await decryptWithBackupKey(
            encryptedBytes,
            fileId,
            packageId,
            response.encryptedKeyForBuyer,
            buyerAddress,
            txDigest,
            signPersonalMessageForSession
          );
          
          // 5. Create blob and trigger download
          const decryptedBlob = new Blob([new Uint8Array(decryptedBytes)], {
            type: blobData.contentType || 'application/octet-stream'
          });
          
          const url = URL.createObjectURL(decryptedBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = response.fileMetadata.filename || blob.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
        } catch (decryptError: unknown) {
          console.error('Decryption error:', decryptError);
          const errorMessage = decryptError instanceof Error ? decryptError.message : 'Unknown decryption error';
          setDownloadError(`Decryption failed: ${errorMessage}`);
        }
      } else if (response.signedFetchUrl) {
        // Direct download from Walrus (non-encrypted)
        window.open(response.signedFetchUrl, '_blank');
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'type' in error && error.type === 'payment_required') {
        const apiError = error as ApiError;
        setPaymentInfo(apiError.data || null);
        setDownloadError(null);
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Download failed';
        setDownloadError(errorMessage);
      }
    } finally {
      setIsDownloading(false);
      setIsPaying(false);
    }
  };

  const handlePayment = async () => {
    if (!paymentInfo) return;
    if (!isWalletConnected) {
      setDownloadError('Please connect your wallet to approve the payment.');
      return;
    }

    try {
      setIsPaying(true);
      const amountMist = BigInt(paymentInfo.amount_raw);
      const txDigest = await sendPayment(paymentInfo.pay_to, amountMist);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await handleDownload(txDigest);
    } catch (paymentError: unknown) {
      console.error('Payment error:', paymentError);
      const errorMessage = paymentError instanceof Error ? paymentError.message : 'Unknown error';
      setDownloadError(`Payment failed: ${errorMessage}`);
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="glass-card p-6 hover:scale-[1.02] transition-all duration-300 group">
      {/* Header with filename and paywall badge */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-stone-900 mb-1 truncate group-hover:text-stone-700 transition-colors">
            {blob.filename}
          </h3>
          <div className="flex gap-2 mt-2">
            {blob.isPaywalled && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                Paywalled
              </span>
            )}
            {blob.keyId && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                Encrypted
              </span>
            )}
            {blob.isPublic && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                Public
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Price badge */}
      <div className="mb-4">
        <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-stone-900 text-white text-sm font-medium">
          {formatPrice(blob.priceRaw)}
        </div>
      </div>

      {/* Payment Info Display */}
      {paymentInfo && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-amber-900">x402 Payment Required</p>
            <span className="text-xs text-amber-800 font-mono">
              {truncateAddress(paymentInfo.payment_id || blob.fileId || '', 6, 6)}
            </span>
          </div>
          <ul className="text-xs text-amber-800 space-y-1 mb-3">
            <li>Amount: {formatPrice(paymentInfo.amount_raw)}</li>
            <li>Pay to: {paymentInfo.pay_to}</li>
            <li>Network: {paymentInfo.network}</li>
          </ul>
          <button
            onClick={handlePayment}
            disabled={isPaying}
            className="w-full px-4 py-2 text-sm font-medium rounded-lg text-white bg-amber-600 hover:bg-amber-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPaying ? 'Authorizing...' : 'Pay & Unlock'}
          </button>
          <p className="text-[11px] text-amber-700 mt-2">
            Your wallet will send the payment and automatically retry this request with the transaction digest.
          </p>
        </div>
      )}

      {/* Details grid */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-500">Size</span>
          <span className="text-stone-700 font-medium">{formatFileSize(blob.originalSize)}</span>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-500">Created</span>
          <span className="text-stone-700">{formatDate(blob.createdAt)}</span>
        </div>
        
        {blob.keyId && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-500">Key ID</span>
            <span className="text-stone-700 font-mono text-xs">{blob.keyId.slice(0, 12)}...</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-4">
        <button 
          onClick={() => handleDownload()}
          disabled={isDownloading || isPaying || !blob.fileId}
          className="flex-1 px-4 py-2.5 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-800 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPaying ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing Payment...
            </span>
          ) : isDownloading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Downloading...
            </span>
          ) : (
            'Download'
          )}
        </button>
        <button className="px-4 py-2.5 glass-card font-medium hover:opacity-80 transition-opacity text-sm">
          Share
        </button>
        <button className="px-4 py-2.5 text-stone-600 hover:text-stone-900 transition-colors text-sm">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>

      {/* Error message */}
      {downloadError && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {downloadError}
        </div>
      )}
    </div>
  );
};

export default function MyVaultPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'paywalled' | 'free' | 'encrypted'>('all');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [myBlobs, setMyBlobs] = useState<DataBlob[]>(mockMyBlobs);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const walletAddress = useWalletAddress();

  React.useEffect(() => {
    const fetchMyFiles = async () => {
      if (!walletAddress) {
        setMyBlobs([]); // Show empty array when wallet not connected
        return;
      }
      try {
        setIsLoadingFiles(true);
        setFetchError(null);
        const result = await listFiles({ publicOnly: false, ownerAddress: walletAddress });
        const mapped = result.map(mapListedFileToBlob);
        setMyBlobs(mapped); // Show real files only, no mock data fallback
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load your files.';
        setFetchError(errorMessage);
      } finally {
        setIsLoadingFiles(false);
      }
    };

    fetchMyFiles();
  }, [walletAddress]);

  // Handle file upload with real backend integration
  const handleUpload = async (data: {
    file: File;
    isPaywalled: boolean;
    priceRaw: number;
    isEncrypted: boolean;
    isPublic: boolean;
  }) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      // Get owner address from wallet
      if (!walletAddress) {
        throw new Error('Please connect your wallet to upload files. Click "Connect Wallet" in the navbar.');
      }
      const ownerAddress = walletAddress;

      // Read file as ArrayBuffer
      const fileBuffer = await data.file.arrayBuffer();
      const fileData = new Uint8Array(fileBuffer);

      let ciphertextBase64: string;
      let encryptedKeyForOwner: string | undefined;

      // If encryption is enabled, encrypt with Seal SDK
      if (data.isEncrypted) {
        const packageId = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID;
        if (!packageId || packageId.includes('YOUR_SEAL_PACKAGE_ID') || packageId.includes('0xYOUR')) {
          throw new Error('Seal encryption is enabled but Seal Package ID is not configured. Please set NEXT_PUBLIC_SEAL_PACKAGE_ID in your .env.local file, or disable encryption for now.');
        }

        // Validate package ID format
        if (!/^0x[a-fA-F0-9]{64}$/.test(packageId)) {
          throw new Error(`Invalid Seal Package ID format: ${packageId}. Must be a valid Sui object ID (0x followed by 64 hex characters).`);
        }

        // Create a unique file ID
        const fileId = createFileId(`${data.file.name}-${Date.now()}`);

        // Encrypt with Seal
        const { encryptedData, backupKey } = await encryptWithSeal(
          fileData,
          fileId,
          packageId,
          2 // threshold
        );

        // Convert encrypted data to base64
        ciphertextBase64 = Buffer.from(encryptedData).toString('base64');

        // Convert backup key to hex string for storage
        encryptedKeyForOwner = Array.from(backupKey)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      } else {
        // No encryption - just convert to base64
        ciphertextBase64 = Buffer.from(fileData).toString('base64');
      }

      // Upload to backend
      const response = await uploadFile(
        data.file,
        ciphertextBase64,
        ownerAddress,
        data.priceRaw,
        encryptedKeyForOwner,
        2, // epochs
        data.isPublic
      );

      // Create new blob from response
      const newBlob: DataBlob = {
        filename: data.file.name,
        ownerAddress: ownerAddress,
        priceRaw: response.priceRaw,
        keyId: response.keyId || null,
        createdAt: new Date().toISOString(),
        walrus: { blobId: response.blobId, status: 'uploaded' },
        originalSize: data.file.size,
        isPaywalled: data.isPaywalled,
        fileId: response.fileId, // Sui object ID
        isPublic: data.isPublic,
      };

      // Add to list
      setMyBlobs((prev) => [newBlob, ...prev]);

      // Close modal
      setIsUploadModalOpen(false);
    } catch (error: unknown) {
      console.error('Upload error:', error);
      let errorMessage = error instanceof Error ? error.message : 'Upload failed. Please try again.';
      
      // Check for WAL token error and provide helpful message
      if (errorMessage.includes('WAL_TOKENS_REQUIRED') || errorMessage.includes('WAL tokens')) {
        errorMessage = 'WAL Tokens Required: The backend needs WAL testnet tokens to store files on Walrus. The Walrus CLI uses the Sui wallet in ~/.sui/sui_config/client.yaml. Please add WAL tokens to that wallet, or configure WALRUS_API_URL in backend .env to use HTTP API instead. See WAL_TOKENS_GUIDE.md for details.';
      }
      
      setUploadError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  // Filter data blobs based on search term and filter type
  const filteredBlobs = useMemo(() => {
    let filtered = myBlobs;

    // Apply filter type
    if (filterType === 'paywalled') {
      filtered = filtered.filter((blob) => blob.isPaywalled);
    } else if (filterType === 'free') {
      filtered = filtered.filter((blob) => !blob.isPaywalled);
    } else if (filterType === 'encrypted') {
      filtered = filtered.filter((blob) => blob.keyId !== null);
    }

    // Apply search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (blob) =>
          blob.filename.toLowerCase().includes(term) ||
          (blob.keyId && blob.keyId.toLowerCase().includes(term))
      );
    }

    return filtered;
  }, [searchTerm, filterType, myBlobs]);

  const totalSize = myBlobs.reduce((sum, blob) => sum + blob.originalSize, 0);
  const totalEarnings = myBlobs
    .filter((blob) => blob.isPaywalled)
    .reduce((sum, blob) => sum + blob.priceRaw, 0);

  return (
    <main className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-stone-50">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-amber-100/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-emerald-100/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-stone-100/40 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10">
        <Navbar />

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-12">
          {/* Header Section */}
          <div className="mb-10">
            <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-4 text-stone-900">
              My Vault
            </h1>
            <p className="text-lg text-stone-600 max-w-2xl">
              Manage your stored data blobs, view statistics, and control access settings.
            </p>
            {fetchError && (
              <div className="mt-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                {fetchError}
              </div>
            )}
            {isLoadingFiles && (
              <div className="mt-4 text-sm text-stone-500">Loading your files...</div>
            )}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="glass-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-stone-500 mb-1">Total Files</p>
                  <p className="text-3xl font-semibold text-stone-900">{myBlobs.length}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-stone-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-stone-500 mb-1">Total Storage</p>
                  <p className="text-3xl font-semibold text-stone-900">{formatFileSize(totalSize)}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-stone-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-stone-500 mb-1">Potential Earnings</p>
                  <p className="text-3xl font-semibold text-stone-900">{formatPrice(totalEarnings)}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-stone-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div className="mb-8 flex flex-col md:flex-row gap-4">
            <div className="glass-card p-4 flex-1">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-stone-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search your files..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-stone-900 placeholder-stone-400 text-sm md:text-base"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="p-1 hover:bg-stone-100 rounded-full transition-colors"
                    aria-label="Clear search"
                  >
                    <svg
                      className="w-4 h-4 text-stone-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-2">
              {(['all', 'paywalled', 'free', 'encrypted'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setFilterType(filter)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filterType === filter
                      ? 'bg-stone-900 text-white'
                      : 'glass-card text-stone-700 hover:text-stone-900'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Upload Button */}
          <div className="mb-8">
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-6 py-3 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-800 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Upload New File
            </button>
          </div>

          {/* Results count */}
          {(searchTerm || filterType !== 'all') && (
            <div className="mb-6 text-sm text-stone-600">
              Found {filteredBlobs.length} {filteredBlobs.length === 1 ? 'file' : 'files'}
            </div>
          )}

          {/* Data Cards Grid */}
          {filteredBlobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBlobs.map((blob, index) => (
                <MyVaultCard key={`${blob.filename}-${index}`} blob={blob} />
              ))}
            </div>
          ) : (
            <div className="glass-card p-12 text-center">
              <svg
                className="w-16 h-16 text-stone-300 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
              <h3 className="text-xl font-semibold text-stone-900 mb-2">No files found</h3>
              <p className="text-stone-600 mb-6">
                {searchTerm || filterType !== 'all'
                  ? 'Try adjusting your search or filter criteria.'
                  : 'Upload your first file to get started.'}
              </p>
              {!searchTerm && filterType === 'all' && (
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-6 py-3 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-800 transition-colors"
                >
                  Upload Your First File
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          setUploadError(null);
        }}
        onUpload={handleUpload}
        isUploading={isUploading}
        uploadError={uploadError}
      />
    </main>
  );
}