'use client';

import React, { useState, useCallback, useRef } from 'react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (data: {
    file: File;
    isPaywalled: boolean;
    priceRaw: number;
    isEncrypted: boolean;
  }) => void | Promise<void>;
  isUploading?: boolean;
  uploadError?: string | null;
}

export default function UploadModal({ 
  isOpen, 
  onClose, 
  onUpload,
  isUploading = false,
  uploadError = null
}: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isPaywalled, setIsPaywalled] = useState(false);
  const [price, setPrice] = useState<string>('');
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file || isUploading) {
      return;
    }

    const priceRaw = isPaywalled && price ? parseFloat(price) * 1000000000 : 0;
    
    await onUpload({
      file,
      isPaywalled,
      priceRaw,
      isEncrypted,
    });

    // Reset form only if upload succeeded (onUpload handles errors)
    // Don't reset if there's an error - let user see the error and try again
    if (!uploadError) {
      setFile(null);
      setIsPaywalled(false);
      setPrice('');
      setIsEncrypted(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onClose();
    }
  }, [file, isPaywalled, price, isEncrypted, isUploading, uploadError, onUpload, onClose]);

  const handleClose = useCallback(() => {
    setFile(null);
    setIsPaywalled(false);
    setPrice('');
    setIsEncrypted(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  }, [onClose]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="glass-card p-8 md:p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl md:text-3xl font-light text-stone-900">Upload File</h2>
              <button
                onClick={handleClose}
                disabled={isUploading}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-stone-100/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5 text-stone-600"
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
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* File Drop Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={`
                  relative border-2 border-dashed rounded-3xl p-12 text-center transition-all duration-300
                  ${
                    isUploading
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer'
                  }
                  ${
                    isDragging
                      ? 'border-stone-400 bg-stone-50/50 scale-[1.02]'
                      : file
                      ? 'border-stone-300 bg-stone-50/30'
                      : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/20'
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                  accept="*/*"
                  disabled={isUploading}
                />

                {file ? (
                  <div className="space-y-3">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-stone-100 flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-stone-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-medium text-stone-900 mb-1">{file.name}</p>
                      <p className="text-sm text-stone-500">{formatFileSize(file.size)}</p>
                    </div>
                    {!isUploading && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                          }
                        }}
                        className="text-sm text-stone-500 hover:text-stone-700 transition-colors"
                      >
                        Remove file
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-stone-100 to-stone-50 flex items-center justify-center">
                      <svg
                        className="w-10 h-10 text-stone-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-base font-medium text-stone-900 mb-1">
                        Drop your file here or click to browse
                      </p>
                      <p className="text-sm text-stone-500">Supports all file types</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Paywall Toggle */}
              <div className="glass-card p-5 rounded-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-stone-900 mb-1">Enable Paywall</h3>
                    <p className="text-sm text-stone-500">Charge users to access this file</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isUploading) {
                        setIsPaywalled(!isPaywalled);
                        if (!isPaywalled) {
                          setPrice('');
                        }
                      }
                    }}
                    disabled={isUploading}
                    className={`
                      relative w-14 h-8 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2
                      ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
                      ${isPaywalled ? 'bg-stone-900' : 'bg-stone-200'}
                    `}
                  >
                    <span
                      className={`
                        absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-lg transform transition-transform duration-300
                        ${isPaywalled ? 'translate-x-6' : 'translate-x-0'}
                      `}
                    />
                  </button>
                </div>

                {/* Price Input - shown when paywall is enabled */}
                {isPaywalled && (
                  <div className="mt-4 pt-4 border-t border-stone-200/50">
                    <label className="block text-sm font-medium text-stone-700 mb-2">
                      Price (SUI)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="0.00"
                        disabled={isUploading}
                        className="w-full px-4 py-3 rounded-xl bg-white/50 backdrop-blur-sm border border-stone-200 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-stone-500">
                        SUI
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-stone-500">
                      {price ? `≈ ${(parseFloat(price) * 1000000000).toLocaleString()} MIST` : 'Enter price in SUI'}
                    </p>
                  </div>
                )}
              </div>

              {/* Encryption Toggle */}
              <div className="glass-card p-5 rounded-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-stone-900 mb-1">Enable Encryption</h3>
                    <p className="text-sm text-stone-500">Encrypt file using Seal protocol</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => !isUploading && setIsEncrypted(!isEncrypted)}
                    disabled={isUploading}
                    className={`
                      relative w-14 h-8 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2
                      ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
                      ${isEncrypted ? 'bg-emerald-500' : 'bg-stone-200'}
                    `}
                  >
                    <span
                      className={`
                        absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-lg transform transition-transform duration-300
                        ${isEncrypted ? 'translate-x-6' : 'translate-x-0'}
                      `}
                    />
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {uploadError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <p className="font-medium">Upload failed</p>
                      <p className="mt-1">{uploadError}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isUploading}
                  className="flex-1 px-6 py-3 rounded-xl glass-card font-medium text-stone-700 hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!file || isUploading}
                  className={`
                    flex-1 px-6 py-3 rounded-xl font-medium transition-all
                    ${
                      file && !isUploading
                        ? 'bg-stone-900 text-white hover:bg-stone-800 shadow-lg hover:shadow-xl'
                        : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                    }
                  `}
                >
                  {isUploading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-5 w-5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Uploading...
                    </span>
                  ) : (
                    'Upload File'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}