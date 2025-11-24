'use client';

import React, { useState, useMemo } from 'react';
import Navbar from '../components/Navbar';
import { useWalletAddress, useIsWalletConnected, useSendPayment } from '@/lib/wallet';
import { getFile, fetchBlob } from '@/lib/api';
import { createFileId, decryptWithBackupKey } from '@/lib/seal';

// Type definition for Data Blob
interface DataBlob {
  filename: string;
  ownerAddress: string;
  priceRaw: number;
  keyId: string | null;
  createdAt: string;
  walrus: object;
  originalSize: number;
  isPaywalled: boolean;
  fileId?: string; // Sui object ID
}

// Mock data - simulating fetched data blobs
const mockDataBlobs: DataBlob[] = [
  {
    filename: 'market-analysis-2024.csv',
    ownerAddress: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
    priceRaw: 5000000000, // 5 SUI in MIST
    keyId: 'seal-key-abc123',
    createdAt: '2024-01-15T10:30:00Z',
    walrus: { blobId: 'walrus-001', status: 'uploaded' },
    originalSize: 2048576, // 2 MB
    isPaywalled: true,
  },
  {
    filename: 'user-behavior-dataset.json',
    ownerAddress: '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
    priceRaw: 10000000000, // 10 SUI in MIST
    keyId: null,
    createdAt: '2024-01-20T14:45:00Z',
    walrus: { blobId: 'walrus-002', status: 'uploaded' },
    originalSize: 5242880, // 5 MB
    isPaywalled: true,
  },
  {
    filename: 'public-research-paper.pdf',
    ownerAddress: '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e',
    priceRaw: 0,
    keyId: 'seal-key-xyz789',
    createdAt: '2024-01-18T09:15:00Z',
    walrus: { blobId: 'walrus-003', status: 'uploaded' },
    originalSize: 10485760, // 10 MB
    isPaywalled: false,
  },
  {
    filename: 'encrypted-financial-data.dat',
    ownerAddress: '0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f',
    priceRaw: 25000000000, // 25 SUI in MIST
    keyId: 'seal-key-def456',
    createdAt: '2024-01-22T16:20:00Z',
    walrus: { blobId: 'walrus-004', status: 'uploaded' },
    originalSize: 15728640, // 15 MB
    isPaywalled: true,
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
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};

const DataCard: React.FC<{ blob: DataBlob }> = ({ blob }) => {
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletAddress = useWalletAddress();
  const isWalletConnected = useIsWalletConnected();
  const sendPayment = useSendPayment();

  const handlePurchase = async () => {
    if (!blob.fileId) {
      setError('File ID not available');
      return;
    }

    if (!isWalletConnected || !walletAddress) {
      alert('Please connect your wallet to purchase access to this file.');
      return;
    }

    setIsPurchasing(true);
    setError(null);

    try {
      // First, try to get the file (will return 402 if payment required)
      let response;
      try {
        response = await getFile(blob.fileId);
      } catch (error: any) {
        if (error.type === 'payment_required') {
          const paymentData = error.data;
          
          // Show confirmation
          const proceed = confirm(
            `Purchase Access\n\n` +
            `File: ${blob.filename}\n` +
            `Amount: ${paymentData.amount_raw / 1000000000} SUI\n` +
            `Pay to: ${paymentData.pay_to}\n\n` +
            `Click OK to approve the payment transaction in your wallet.`
          );
          
          if (!proceed) {
            setIsPurchasing(false);
            return;
          }
          
          // Make payment
          const amountMist = BigInt(paymentData.amount_raw);
          const txDigest = await sendPayment(paymentData.pay_to, amountMist);
          
          // Wait for transaction to be processed
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Retry with payment proof
          const base64Digest = btoa(txDigest);
          response = await getFile(blob.fileId, base64Digest);
        } else {
          throw error;
        }
      }
      
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
          undefined // txDigest not needed for decryption in this case
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
        
        alert('File downloaded successfully!');
      } else if (response.signedFetchUrl) {
        // Direct download
        window.open(response.signedFetchUrl, '_blank');
        alert('File opened in new tab!');
      }
    } catch (err: any) {
      console.error('Purchase error:', err);
      setError(err.message || 'Purchase failed. Please try again.');
    } finally {
      setIsPurchasing(false);
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
          {blob.isPaywalled && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
              Paywalled
            </span>
          )}
        </div>
      </div>

      {/* Price badge */}
      <div className="mb-4">
        <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-stone-900 text-white text-sm font-medium">
          {formatPrice(blob.priceRaw)}
        </div>
      </div>

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
        onClick={handlePurchase}
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
          blob.isPaywalled ? 'Purchase Access' : 'View Details'
        )}
      </button>
    </div>
  );
};

export default function MarketplacePage() {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter data blobs based on search term
  const filteredBlobs = useMemo(() => {
    if (!searchTerm.trim()) return mockDataBlobs;
    
    const term = searchTerm.toLowerCase();
    return mockDataBlobs.filter(
      (blob) =>
        blob.filename.toLowerCase().includes(term) ||
        blob.ownerAddress.toLowerCase().includes(term) ||
        (blob.keyId && blob.keyId.toLowerCase().includes(term))
    );
  }, [searchTerm]);

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
          {searchTerm && (
            <div className="mb-6 text-sm text-stone-600">
              Found {filteredBlobs.length} {filteredBlobs.length === 1 ? 'result' : 'results'}
            </div>
          )}

          {/* Data Cards Grid */}
          {filteredBlobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBlobs.map((blob, index) => (
                <DataCard key={`${blob.filename}-${index}`} blob={blob} />
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
              <h3 className="text-xl font-semibold text-stone-900 mb-2">No results found</h3>
              <p className="text-stone-600">
                Try adjusting your search terms or browse all available data blobs.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
