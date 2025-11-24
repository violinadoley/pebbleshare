'use client';

import { WalletProvider, SuiClientProvider } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getFullnodeUrl } from '@mysten/sui/client';
import { ReactNode } from 'react';

const queryClient = new QueryClient();

// Get network from environment variable or default to testnet
const network = (process.env.NEXT_PUBLIC_SUI_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet';

interface WalletProviderWrapperProps {
  children: ReactNode;
}

export function WalletProviderWrapper({ children }: WalletProviderWrapperProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={{
        [network]: { url: getFullnodeUrl(network) },
      }} defaultNetwork={network}>
        <WalletProvider
          autoConnect={true}
          // Enable Slush Wallet support
          slushWallet={{
            name: 'PebbleShare',
          }}
        >
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

