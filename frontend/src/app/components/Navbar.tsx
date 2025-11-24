'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCurrentWallet, useConnectWallet, useDisconnectWallet, useWallets } from '@mysten/dapp-kit';
import { useWalletAddress } from '@/lib/wallet';

export default function Navbar() {
  const pathname = usePathname();
  useCurrentWallet();
  const { mutate: connectWallet } = useConnectWallet();
  const { mutate: disconnectWallet } = useDisconnectWallet();
  const wallets = useWallets();
  const walletAddress = useWalletAddress();

  const isActive = (path: string) => {
    return pathname === path;
  };

  const handleConnectWallet = () => {
    // If wallets are available, use the first one
    // Otherwise, dapp-kit will show a modal for wallet selection
    if (wallets.length > 0) {
      connectWallet(
        { wallet: wallets[0] },
        {
          onError: (error) => {
            console.error('Failed to connect wallet:', error);
            alert('Failed to connect wallet. Please make sure you have a Sui wallet extension installed.');
          },
        }
      );
    } else {
      // No wallets detected - show user-friendly message
      alert('No Sui wallet detected. Please install a Sui wallet extension (e.g., Sui Wallet, Slush Wallet) and refresh the page.');
    }
  };

  const handleDisconnectWallet = () => {
    disconnectWallet();
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-stone-200/50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link 
            href="/" 
            className="text-xl font-semibold tracking-tight text-stone-900 hover:opacity-70 transition-opacity"
          >
            PebbleShare
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/">
              <button 
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  isActive('/') 
                    ? 'text-stone-900 border-b-2 border-stone-900' 
                    : 'text-stone-700 hover:text-stone-900'
                }`}
              >
                Home
              </button>
            </Link>
            <Link href="/my-vault">
              <button 
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  isActive('/my-vault') 
                    ? 'text-stone-900 border-b-2 border-stone-900' 
                    : 'text-stone-700 hover:text-stone-900'
                }`}
              >
                My Vault
              </button>
            </Link>
            <Link href="/marketplace">
              <button 
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  isActive('/marketplace') 
                    ? 'text-stone-900 border-b-2 border-stone-900' 
                    : 'text-stone-700 hover:text-stone-900'
                }`}
              >
                Marketplace
              </button>
            </Link>
            {walletAddress ? (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 text-xs font-mono bg-stone-100 text-stone-700 rounded-lg">
                  {truncateAddress(walletAddress)}
                </span>
                <button
                  onClick={handleDisconnectWallet}
                  className="px-4 py-2 text-sm font-medium text-stone-700 hover:text-stone-900 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectWallet}
                className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

