const { SealClient } = require('@mysten/seal');
const { SuiClient } = require('@mysten/sui/client');
const { toHEX } = require('@mysten/sui/utils');
const fs = require('fs');
require('dotenv').config();
const config = require('../src/config');

async function testUpload() {
  console.log('🧪 Testing Upload Endpoint with Seal Encryption\n');

  try {
    // 1. Initialize Seal client
    const suiClient = new SuiClient({ url: config.sui.rpcUrl });
    const sealClient = new SealClient({
      suiClient,
      serverConfigs: config.seal.keyServers.map(id => ({
        objectId: id,
        weight: 1,
      })),
      verifyKeyServers: config.seal.verifyKeyServers,
    });

    // 2. Create test data
    const testData = new TextEncoder().encode('Hello, this is a test file for upload!');
    console.log('✅ Test data created:', testData.length, 'bytes');

    // 3. Generate file ID
    const fileIdBytes = crypto.getRandomValues(new Uint8Array(32));
    const fileId = toHEX(fileIdBytes);
    console.log('✅ File ID generated:', fileId);

    // 4. Encrypt with Seal SDK
    console.log('\n🔒 Encrypting with Seal SDK...');
    const { encryptedObject: encryptedBytes, key: backupKey } = await sealClient.encrypt({
      threshold: config.seal.threshold,
      packageId: config.seal.packageId, // Pass as string
      id: fileId, // Pass as hex string
      data: testData,
    });

    console.log('✅ Encryption successful!');
    console.log('   - Encrypted size:', encryptedBytes.length, 'bytes');
    console.log('   - Backup key (hex):', toHEX(backupKey));

    // 5. Convert to base64
    const encryptedBase64 = Buffer.from(encryptedBytes).toString('base64');

    // 6. Upload to server
    console.log('\n📤 Uploading to server...');
    const uploadPayload = {
      filename: 'test-upload.txt',
      ciphertextBase64: encryptedBase64,
      ownerAddress: config.sui.receiverAddress,
      priceRaw: config.sui.minPaymentRaw.toString(),
      encryptedKeyForOwner: toHEX(backupKey),
      epochs: 2,
    };

    const response = await fetch('http://localhost:3001/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(uploadPayload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Upload failed: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    console.log('✅ Upload successful!');
    console.log('   - File ID (Sui Object ID):', result.fileId);
    console.log('   - Blob ID:', result.blobId);
    console.log('   - Transaction Digest:', result.txDigest);
    console.log('   - Price:', result.priceRaw, 'MIST');
    console.log('\n📋 Next steps:');
    console.log(`   1. Test file access: curl http://localhost:3001/file/${result.fileId}`);
    console.log(`   2. Or use the file ID in your frontend`);

    return result;
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testUpload();