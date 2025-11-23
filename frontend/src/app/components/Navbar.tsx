'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    return pathname === path;
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
          <div className="flex gap-4">
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
          </div>
        </div>
      </div>
    </nav>
  );
}

