const config = require('./config');
const { isTxConsumed, markTxConsumed } = require('./db');
const { SuiClient, getFullnodeUrl } = require('@mysten/sui.js/client');

// Initialize Sui client
const suiClient = new SuiClient({ url: config.sui.rpcUrl });

/**
 * Verify that a transaction contains a coin transfer to the receiver address
 * for at least the expected amount.
 * 
 * @param {string} paymentProof - base64 encoded transaction digest
 * @param {string} fileId - file identifier (for metadata)
 * @param {number} expectedRaw - expected amount in smallest unit
 * @returns {Promise<{ok: boolean, reason?: string, detail?: string, txDigest?: string}>}
 */
async function verifyPayment(paymentProof, fileId, expectedRaw = config.sui.minPaymentRaw) {
  try {
    // Decode base64 transaction digest
    let txDigest;
    try {
      txDigest = Buffer.from(paymentProof, 'base64').toString('utf8');
      // Validate it looks like a Sui transaction digest (hex string, typically 64 chars)
      if (!/^0x[a-fA-F0-9]{64}$/.test(txDigest)) {
        // If base64 decode doesn't give us a valid digest, try using it directly
        txDigest = paymentProof;
      }
    } catch (e) {
      // If base64 decode fails, use the raw value
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
        showInput: false
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
        // If checkpoint info not available, we can't verify finality
        // In production, you might want to fetch latest checkpoint and compare
        console.warn('Checkpoint information not available for transaction');
      }
    }

    // Method 1: Check balance changes (most reliable)
    const balanceChanges = tx.balanceChanges || [];
    let paidAmount = 0;
    let foundReceiver = false;

    for (const change of balanceChanges) {
      if (change.owner === 'AddressOwner' && change.ownerAddress === config.sui.receiverAddress) {
        // Positive balance change means coins received
        const amount = BigInt(change.amount || '0');
        if (amount > 0) {
          paidAmount += Number(amount);
          foundReceiver = true;
        }
      }
    }

    // Method 2: Check events (fallback if balance changes not available)
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
              paidAmount += Number(amount);
              foundReceiver = true;
            }
          }
        } catch (e) {
          // Continue checking other events
          console.debug('Error parsing event:', e.message);
        }
      }
    }

    // Method 3: Check object changes (additional verification)
    if (!foundReceiver && tx.objectChanges) {
      for (const change of tx.objectChanges) {
        if (change.type === 'transferred' && change.recipient) {
          if (change.recipient.AddressOwner === config.sui.receiverAddress) {
            // Object was transferred to our address
            // Note: This doesn't give us the amount, but confirms transfer occurred
            foundReceiver = true;
            // We still need to verify amount from balance changes or events
          }
        }
      }
    }

    if (!foundReceiver) {
      return { ok: false, reason: 'no_transfer_found', detail: 'No transfer to receiver address found in transaction' };
    }

    if (paidAmount < expectedRaw) {
      return { 
        ok: false, 
        reason: 'insufficient_payment', 
        detail: `Expected ${expectedRaw}, received ${paidAmount}` 
      };
    }

    // Payment verified - mark transaction as consumed
    const marked = await markTxConsumed(txDigest, { fileId, amount: paidAmount });
    if (!marked) {
      // Race condition: another request processed this tx
      return { ok: false, reason: 'tx_already_consumed' };
    }

    return { ok: true, txDigest, amount: paidAmount };
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

