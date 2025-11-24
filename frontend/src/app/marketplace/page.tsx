'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useWalletAddress, useIsWalletConnected, useSendPayment } from '@/lib/wallet';
import { useSignPersonalMessage } from '@mysten/dapp-kit';
import { getFile, fetchBlob, listFiles, ListedFile, PaymentInfo, ApiError } from '@/lib/api';
import { createFileId, decryptWithBackupKey } from '@/lib/seal';

type DataBlob = ListedFile;

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
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};

const DataCard: React.FC<{ blob: DataBlob }> = ({ blob }) => {
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
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

  const handlePurchase = async (txDigest?: string) => {
    if (!blob.fileId) {
      setError('File ID not available');
      return;
    }

    if (!isWalletConnected || !walletAddress) {
      setError('Please connect your wallet to purchase access to this file.');
      return;
    }

    setIsPurchasing(true);
    setError(null);
    setPaymentInfo(null);

    try {
      // First, try to get the file (will return 402 if payment required)
      const base64Digest = txDigest ? btoa(txDigest) : undefined;
      // For marketplace purchases, DON'T send buyerAddress to force x402 payment even for owners
      const response = await getFile(blob.fileId, {
        paymentTxDigest: base64Digest,
        // buyerAddress intentionally omitted to enforce x402 payment
      });

      // File access granted - handle download
      if (response.method === 'seal_key_release' && response.encryptedKeyForBuyer && response.fileMetadata) {
        // Encrypted file - fetch and decrypt
        const packageId = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID;
        if (!packageId || packageId.includes('YOUR_SEAL_PACKAGE_ID') || packageId.includes('0xYOUR')) {
          throw new Error('Seal package ID not configured. Please set NEXT_PUBLIC_SEAL_PACKAGE_ID in your .env.local file.');
        }
        
        // Validate format
        if (!/^0x[a-fA-F0-9]{64}$/.test(packageId)) {
          throw new Error(`Invalid Seal Package ID format: ${packageId}. Must be a valid Sui object ID.`);
        }
        
        const blobData = await fetchBlob(response.fileMetadata.blobId);
        const encryptedBytes = Uint8Array.from(
          atob(blobData.data),
          c => c.charCodeAt(0)
        );
        
        const fileId = createFileId(`${response.fileMetadata.filename}-${response.fileMetadata.createdAt}`);
        const decryptedBytes = await decryptWithBackupKey(
          encryptedBytes,
          fileId,
          packageId,
          response.encryptedKeyForBuyer,
          walletAddress,
          undefined,
          signPersonalMessageForSession
        );
        
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
        
      } else if (response.signedFetchUrl) {
        // Direct download
        window.open(response.signedFetchUrl, '_blank');
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'type' in err && err.type === 'payment_required') {
        const apiError = err as ApiError;
        setPaymentInfo(apiError.data || null);
        setError(null);
      } else {
        console.error('Purchase error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Purchase failed. Please try again.';
        setError(errorMessage);
      }
    } finally {
      setIsPurchasing(false);
      setIsPaying(false);
    }
  };

  const handlePayment = async () => {
    if (!paymentInfo) return;
    if (!isWalletConnected) {
      setError('Please connect your wallet to pay.');
      return;
    }

    try {
      setIsPaying(true);
      const amountMist = BigInt(paymentInfo.amount_raw);
      const txDigest = await sendPayment(paymentInfo.pay_to, amountMist);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await handlePurchase(txDigest);
    } catch (paymentError: unknown) {
      console.error('Payment error:', paymentError);
      const errorMessage = paymentError instanceof Error ? paymentError.message : 'Payment failed. Please try again.';
      setError(errorMessage);
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="glass-card p-6 hover:scale-[1.02] transition-all duration-300 cursor-pointer group">
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
          <span className="text-stone-500">Owner</span>
          <span className="text-stone-700 font-mono text-xs">{truncateAddress(blob.ownerAddress)}</span>
        </div>
        
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
            <span className="text-stone-500">Encrypted</span>
            <span className="text-emerald-600 font-medium text-xs">✓ Yes</span>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Action button */}
      <button 
        onClick={() => handlePurchase()}
        disabled={isPurchasing || !blob.fileId}
        className="w-full mt-4 px-4 py-2.5 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-800 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPurchasing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </span>
        ) : (
          blob.isPaywalled ? 'Purchase Access' : 'Download'
        )}
      </button>
    </div>
  );
};

export default function MarketplacePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [files, setFiles] = useState<DataBlob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        setIsLoading(true);
        setFetchError(null);
        // Explicitly request only public files for marketplace
        const result = await listFiles({ publicOnly: true });
        console.log('Marketplace loaded files:', result.length, 'files');
        setFiles(result);
      } catch (err: unknown) {
        console.error('Failed to load marketplace files:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load marketplace files.';
        setFetchError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFiles();
    
    // Refresh marketplace every 30 seconds to show newly uploaded files
    const interval = setInterval(fetchFiles, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredBlobs = useMemo(() => {
    if (!searchTerm.trim()) return files;
    
    const term = searchTerm.toLowerCase();
    return files.filter(
      (blob) =>
        blob.filename.toLowerCase().includes(term) ||
        blob.ownerAddress.toLowerCase().includes(term) ||
        (blob.keyId && blob.keyId.toLowerCase().includes(term))
    );
  }, [searchTerm, files]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-stone-50">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-amber-100/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-emerald-100/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 right-1/4 w-[400px] h-[400px] bg-stone-100/40 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10">
        <Navbar />

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-12">
          {/* Header Section */}
          <div className="mb-10">
            <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-4 text-stone-900">
              Data Marketplace
            </h1>
            <p className="text-lg text-stone-600 max-w-2xl">
              Discover and purchase access to valuable data blobs stored securely on the blockchain.
            </p>
          </div>

          {/* Search Bar */}
          <div className="mb-8">
            <div className="glass-card p-4 max-w-2xl">
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
                  placeholder="Search by filename, owner address, or key ID..."
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
          </div>

          {/* Results count */}
          {!isLoading && !fetchError && (
            <div className="mb-6 text-sm text-stone-600">
              Showing {filteredBlobs.length} {filteredBlobs.length === 1 ? 'file' : 'files'}
            </div>
          )}

          {fetchError && (
            <div className="glass-card p-6 mb-8 text-red-700 bg-red-50 border border-red-200">
              {fetchError}
            </div>
          )}

          {/* Data Cards Grid */}
          {isLoading ? (
            <div className="glass-card p-12 text-center text-stone-600">Loading marketplace data...</div>
          ) : filteredBlobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBlobs.map((blob) => (
                <DataCard key={blob.fileId} blob={blob} />
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
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 className="text-xl font-semibold text-stone-900 mb-2">No files found</h3>
              <p className="text-stone-600">
                Try adjusting your search terms or upload public files from the My Vault page.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
