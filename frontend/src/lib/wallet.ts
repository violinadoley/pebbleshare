import { useCurrentWallet, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

/**
 * Hook to get current wallet address
 */
export function useWalletAddress(): string | null {
  const { currentWallet } = useCurrentWallet();
  return currentWallet?.accounts[0]?.address || null;
}

/**
 * Hook to check if wallet is connected
 */
export function useIsWalletConnected(): boolean {
  const { currentWallet } = useCurrentWallet();
  return Boolean(currentWallet && currentWallet.accounts && currentWallet.accounts.length > 0);
}

/**
 * Hook to send SUI payment transaction
 * @returns Function to send payment
 */
export function useSendPayment() {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  return async (recipient: string, amountMist: bigint): Promise<string> => {
    const tx = new Transaction();
    
    // Split coins from gas and transfer to recipient
    const [coin] = tx.splitCoins(tx.gas, [amountMist]);
    tx.transferObjects([coin], recipient);

    const result = await signAndExecute({
      transaction: tx,
    });

    return result.digest;
  };
}

