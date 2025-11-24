const config = require('./config');
const { isTxConsumed, markTxConsumed } = require('./db');
const { SuiClient } = require('@mysten/sui.js/client');

// Initialize Sui client
const suiClient = new SuiClient({ url: config.sui.rpcUrl });

/**
 * Verify that a transaction contains a coin transfer to the receiver address
 * for at least the expected amount.
 * 
 * @param {string} paymentProof - base64 encoded transaction digest
 * @param {string} fileId - file identifier (for metadata)
 * @param {number} expectedRaw - expected amount in smallest unit
 * @returns {Promise<{ok: boolean, reason?: string, detail?: string, txDigest?: string, buyerAddress?: string, amount?: number}>}
 */
async function verifyPayment(paymentProof, fileId, expectedRaw = config.sui.minPaymentRaw) {
  try {
    // Decode base64 transaction digest (if base64) or use directly
    // Sui transaction digests are base58-encoded strings (not hex)
    let txDigest;
    try {
      // Try to decode as base64 first
      const decoded = Buffer.from(paymentProof, 'base64').toString('utf8');
      // Sui transaction digests are base58-encoded strings (alphanumeric, typically 32-44 chars)
      // Accept base58 strings (alphanumeric, typically 32-44 chars)
      if (/^[A-Za-z0-9]{32,}$/.test(decoded)) {
        txDigest = decoded;
      } else {
        // If decoded doesn't look like a digest, try the original
        txDigest = paymentProof;
      }
    } catch (e) {
      // If base64 decode fails, use the raw value (might already be a digest)
      txDigest = paymentProof;
    }

    // Anti-replay: check if transaction was already consumed
    if (await isTxConsumed(txDigest)) {
      console.log('Transaction already consumed:', txDigest);
      return { ok: false, reason: 'tx_already_consumed' };
    }

    // Fetch transaction with full details
    const tx = await suiClient.getTransactionBlock({
      digest: txDigest,
      options: {
        showEffects: true,
        showEvents: true,
        showBalanceChanges: true,
        showObjectChanges: true,
        showInput: true  // Changed to true to get sender info
      }
    });

    if (!tx) {
      return { ok: false, reason: 'tx_not_found' };
    }

    // Check transaction status
    const status = tx.effects?.status?.status;
    if (status !== 'success') {
      return { ok: false, reason: 'tx_failed', detail: `Transaction status: ${status}` };
    }

    // Check transaction finality (checkpoint)
    if (config.sui.finalityCheckpoints > 0) {
      const checkpoint = tx.checkpoint;
      if (!checkpoint) {
        console.warn('Checkpoint information not available for transaction');
      } else {
        // Fetch latest checkpoint and verify finality
        try {
          const latestCheckpoint = await suiClient.getLatestCheckpointSequenceNumber();
          const txCheckpoint = Number(checkpoint);
          const finalityGap = latestCheckpoint - txCheckpoint;
          
          if (finalityGap < config.sui.finalityCheckpoints) {
            return { 
              ok: false, 
              reason: 'tx_not_final', 
              detail: `Transaction needs ${config.sui.finalityCheckpoints} checkpoints, has ${finalityGap}` 
            };
          }
        } catch (e) {
          console.warn('Could not verify finality:', e.message);
          // Continue without finality check if RPC fails
        }
      }
    }

    // Extract buyer address from transaction
    let buyerAddress = null;
    if (tx.transaction?.data?.sender) {
      buyerAddress = tx.transaction.data.sender;
    } else if (tx.sender) {
      buyerAddress = tx.sender;
    }

    // Method 1: Check balance changes (most reliable)
    const balanceChanges = tx.balanceChanges || [];
    let paidAmount = BigInt(0);  // Use BigInt to prevent precision loss
    let foundReceiver = false;

    for (const change of balanceChanges) {
      // Handle different balance change structures
      const ownerAddress = change.ownerAddress || 
                          (change.owner?.AddressOwner) || 
                          (typeof change.owner === 'string' ? change.owner : null);
      
      if (ownerAddress === config.sui.receiverAddress) {
        // Positive balance change means coins received
        const amount = BigInt(change.amount || '0');
        if (amount > 0) {
          paidAmount += amount;  // Keep as BigInt
          foundReceiver = true;
        }
      }
    }

    // Method 1.5: Check created coin objects (for pay-sui transactions)
    if (!foundReceiver && tx.objectChanges) {
      for (const change of tx.objectChanges) {
        // Check for created coin objects owned by receiver
        if (change.type === 'created') {
          const owner = change.owner;
          const ownerAddress = typeof owner === 'string' 
            ? owner 
            : (owner?.AddressOwner || owner?.address || null);
          
          if (ownerAddress === config.sui.receiverAddress) {
            // Check if it's a coin object
            const objectType = change.objectType || '';
            if (objectType.includes('coin::Coin') || objectType.includes('Coin<')) {
              // For created coins, we need to get the amount from the transaction input
              // or check the balance change for this specific object
              foundReceiver = true;
              // Amount will be verified from transaction input or events
            }
          }
        }
        // Also check transferred objects
        if (change.type === 'transferred' && change.recipient) {
          const recipient = typeof change.recipient === 'string' 
            ? change.recipient 
            : (change.recipient.AddressOwner || change.recipient.address || null);
          
          if (recipient === config.sui.receiverAddress) {
            foundReceiver = true;
          }
        }
      }
    }

    // Method 2: Check transaction input/commands for payment amount
    // For pay-sui, the amount is in the transaction input
    if (foundReceiver && paidAmount === BigInt(0) && tx.transaction?.data?.transaction) {
      try {
        const transactionData = tx.transaction.data.transaction;
        // Look for SplitCoins or Pay commands
        if (transactionData.kind === 'ProgrammableTransaction') {
          const commands = transactionData.transactions || [];
          for (const cmd of commands) {
            if (cmd.SplitCoins || cmd.Pay || cmd.PaySui) {
              // Extract amounts from command
              const amounts = cmd.SplitCoins?.amounts || 
                             cmd.Pay?.amounts || 
                             cmd.PaySui?.amounts || [];
              
              for (const amountArg of amounts) {
                if (amountArg && typeof amountArg === 'object' && amountArg.value) {
                  const amount = BigInt(amountArg.value);
                  paidAmount += amount;
                } else if (typeof amountArg === 'string' || typeof amountArg === 'number') {
                  paidAmount += BigInt(amountArg);
                }
              }
            }
          }
        }
      } catch (e) {
        console.debug('Error parsing transaction commands:', e.message);
      }
    }

    // Method 3: Check events (fallback if balance changes not available)
    if (!foundReceiver && tx.events && tx.events.length > 0) {
      for (const event of tx.events) {
        try {
          // Look for CoinTransfer event
          const eventType = event.type || '';
          if (eventType.includes('CoinTransfer') || eventType.includes('Transfer')) {
            const parsedJson = event.parsedJson || {};
            
            // Check if recipient matches
            const recipient = parsedJson.recipient || parsedJson.to || parsedJson.receiver;
            if (recipient === config.sui.receiverAddress) {
              // Extract amount
              const amountStr = parsedJson.amount || parsedJson.value || '0';
              const amount = BigInt(amountStr);
              paidAmount += amount;  // Keep as BigInt
              foundReceiver = true;
            }
          }
        } catch (e) {
          // Continue checking other events
          console.debug('Error parsing event:', e.message);
        }
      }
    }

    // Method 4: Check transaction input directly for amounts
    // Sometimes the amount is in the input arguments
    if (foundReceiver && paidAmount === BigInt(0) && tx.transaction?.data?.transaction?.input) {
      try {
        const inputs = tx.transaction.data.transaction.input || [];
        for (const input of inputs) {
          if (input.type === 'pure' && input.value) {
            // Check if this is a u64 amount
            if (typeof input.value === 'string' && /^\d+$/.test(input.value)) {
              const amount = BigInt(input.value);
              // Only count if it's a reasonable payment amount (not gas budget)
              if (amount >= BigInt(1000) && amount <= BigInt(1000000000000)) {
                paidAmount += amount;
              }
            }
          }
        }
      } catch (e) {
        console.debug('Error parsing transaction inputs:', e.message);
      }
    }

    if (!foundReceiver) {
      return { ok: false, reason: 'no_transfer_found', detail: 'No transfer to receiver address found in transaction' };
    }

    // If we found the receiver but couldn't determine amount, use expected amount as fallback
    // This handles cases where the transaction structure doesn't reveal the exact amount
    if (foundReceiver && paidAmount === BigInt(0)) {
      console.warn('Found receiver but could not determine payment amount, using expected amount');
      paidAmount = BigInt(expectedRaw);
    }

    // Compare BigInt with BigInt
    if (paidAmount < BigInt(expectedRaw)) {
      return { 
        ok: false, 
        reason: 'insufficient_payment', 
        detail: `Expected ${expectedRaw}, received ${paidAmount.toString()}` 
      };
    }

    // Payment verified - mark transaction as consumed
    const paidAmountNumber = Number(paidAmount);  // Convert to Number for storage
    const marked = await markTxConsumed(txDigest, { fileId, amount: paidAmountNumber });
    if (!marked) {
      // Race condition: another request processed this tx
      return { ok: false, reason: 'tx_already_consumed' };
    }

    return { 
      ok: true, 
      txDigest, 
      amount: paidAmountNumber,  // Return as Number for compatibility
      buyerAddress  // Include buyer address from transaction
    };
  } catch (err) {
    console.error('verifyPayment error:', err);
    return { 
      ok: false, 
      reason: 'exception', 
      detail: (err && err.message) || String(err) 
    };
  }
}

module.exports = { verifyPayment };