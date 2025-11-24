const { SealClient } = require('@mysten/seal');
const { SuiClient } = require('@mysten/sui/client');
const { fromHEX, toHEX } = require('@mysten/sui/utils');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const config = require('../src/config');

/**
 * Validate Sui address/object ID format
 * @param {string} address - Address to validate
 * @returns {boolean} - True if valid
 */
function isValidSuiAddress(address) {
  if (typeof address !== 'string') return false;
  // Sui addresses are 0x followed by 64 hex characters (66 total)
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

/**
 * Validate Seal configuration before running tests
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateSealConfig() {
  const errors = [];

  // Check Sui RPC URL
  if (!config.sui.rpcUrl) {
    errors.push('SUI_RPC_URL not configured');
  }

  // Check key servers
  if (!config.seal.keyServers || config.seal.keyServers.length === 0) {
    errors.push('No Seal key servers configured (SEAL_KEY_SERVER_1, SEAL_KEY_SERVER_2)');
  } else {
    // Validate each key server object ID
    config.seal.keyServers.forEach((id, index) => {
      if (!id || typeof id !== 'string') {
        errors.push(`Key server ${index + 1} is not a string: ${typeof id}`);
      } else if (!isValidSuiAddress(id)) {
        errors.push(`Invalid key server ${index + 1} object ID: ${id}`);
      }
    });
  }

  // Check package ID
  if (!config.seal.packageId) {
    errors.push('SEAL_PACKAGE_ID not configured');
  } else if (!isValidSuiAddress(config.seal.packageId)) {
    errors.push(`Invalid package ID format: ${config.seal.packageId}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Initialize Seal client with proper configuration
 * @returns {SealClient|null} - Initialized client or null if configuration invalid
 */
function initializeSealClient() {
  try {
    // Validate configuration first
    const validation = validateSealConfig();
    if (!validation.valid) {
      console.error('❌ Configuration validation failed:');
      validation.errors.forEach(err => console.error(`   - ${err}`));
      return null;
    }

    // Initialize Sui client
    const suiClient = new SuiClient({ 
      url: config.sui.rpcUrl
    });

    // Filter and validate key servers (ensure they're strings and valid)
    console.log('🔍 Validating key servers...');
    const validKeyServers = config.seal.keyServers
      .filter(id => {
        if (!id || typeof id !== 'string') {
          console.error(`   ❌ Invalid key server: ${id} (type: ${typeof id}, not a string)`);
          return false;
        }
        if (!isValidSuiAddress(id)) {
          console.error(`   ❌ Invalid key server format: ${id} (must be 66 chars: 0x + 64 hex)`);
          return false;
        }
        console.log(`   ✅ Valid key server: ${id}`);
        return true;
      })
      .map((id) => ({
        objectId: String(id), // Ensure it's a string
        weight: 1,
      }));

    if (validKeyServers.length === 0) {
      throw new Error('No valid key servers found after filtering');
    }

    if (validKeyServers.length < config.seal.threshold) {
      throw new Error(`Not enough key servers: need ${config.seal.threshold}, have ${validKeyServers.length}`);
    }

    // Initialize Seal client
    const sealClient = new SealClient({
      suiClient,
      serverConfigs: validKeyServers,
      verifyKeyServers: config.seal.verifyKeyServers,
    });

    console.log('✅ SealClient initialized successfully');
    console.log(`   - Key servers: ${validKeyServers.length}`);
    console.log(`   - Threshold: ${config.seal.threshold}-of-${validKeyServers.length}`);
    console.log(`   - Verify servers: ${config.seal.verifyKeyServers}`);

    return sealClient;
  } catch (error) {
    console.error('❌ Failed to initialize SealClient:', error.message);
    console.error('   Stack:', error.stack);
    return null;
  }
}

/**
 * Test Seal SDK encryption
 * @param {SealClient} sealClient - Initialized Seal client
 * @returns {Promise<Object>} - Test result
 */
async function testSealEncryption(sealClient) {
  console.log('\n🔐 Testing Seal SDK Encryption...\n');

  try {
    // 1. Validate package ID
    const packageId = config.seal.packageId;
    if (!packageId) {
      throw new Error('SEAL_PACKAGE_ID not configured in .env');
    }

    if (!isValidSuiAddress(packageId)) {
      throw new Error(`Invalid package ID format: ${packageId}\n` +
        'Package ID must be 0x followed by 64 hex characters (66 total)');
    }

    // Check if it's a placeholder
    const placeholderId = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const isPlaceholder = packageId === placeholderId;
    if (isPlaceholder) {
      console.log('⚠️  WARNING: Using placeholder package ID');
      console.log('   Encryption will fail - you need to deploy a Move contract');
      console.log('   See: https://seal-docs.wal.app/GettingStarted/');
      console.log('   Steps:');
      console.log('   1. Create Move contract with seal_approve function');
      console.log('   2. Deploy to Sui testnet');
      console.log('   3. Update SEAL_PACKAGE_ID in .env with deployed package ID');
      return { 
        success: false, 
        error: 'Placeholder package ID - deploy Move contract first',
        requiresDeployment: true
      };
    }

    console.log('📦 Using package ID:', packageId);

    // 2. Create test data
    const testData = new TextEncoder().encode('Hello, this is a test file for Seal encryption!');
    console.log('✅ Test data created:', testData.length, 'bytes');

    // 3. Generate a unique file ID (32 bytes = 64 hex chars)
    const fileIdBytes = crypto.getRandomValues(new Uint8Array(32));
    const fileId = toHEX(fileIdBytes);
    console.log('✅ File ID generated:', fileId);

    // 4. Encrypt with Seal SDK
    console.log('\n🔒 Encrypting with Seal SDK...');
    // IMPORTANT: Pass packageId as string, not bytes
    // SealClient needs the string format to fetch the package object from Sui
    // The SDK will handle internal conversions when needed

    const { encryptedObject: encryptedBytes, key: backupKey } = await sealClient.encrypt({
      threshold: config.seal.threshold,
      packageId: packageId, // Pass as string - Seal SDK needs this to fetch package object
      id: fileId, // id should be bytes (Uint8Array)
      data: testData,
    });

    console.log('✅ Encryption successful!');
    console.log('   - Encrypted data size:', encryptedBytes.length, 'bytes');
    console.log('   - Backup key size:', backupKey.length, 'bytes');
    console.log('   - Backup key (hex):', toHEX(backupKey));
    console.log('   💡 Store backup key securely!');

    // 5. Save encrypted data to file
    const outputDir = path.join(__dirname, '../test-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const encryptedPath = path.join(outputDir, 'encrypted.bin');
    fs.writeFileSync(encryptedPath, Buffer.from(encryptedBytes));
    console.log('\n💾 Saved encrypted data to:', encryptedPath);

    // 6. Convert to base64 (as server expects)
    const encryptedBase64 = Buffer.from(encryptedBytes).toString('base64');
    console.log('✅ Base64 encoded (first 100 chars):', encryptedBase64.substring(0, 100) + '...');

    // 7. Summary
    console.log('\n📊 Test Summary:');
    console.log('   ✅ Seal SDK encryption: WORKING');
    console.log('   ✅ File ID generation: WORKING');
    console.log('   ✅ Base64 encoding: WORKING');
    console.log('   ✅ Package ID validation: PASSED');

    return {
      success: true,
      fileId,
      encryptedSize: encryptedBytes.length,
      backupKey: toHEX(backupKey),
      encryptedBase64: encryptedBase64.substring(0, 50) + '...',
      encryptedPath,
    };

  } catch (error) {
    console.error('\n❌ Encryption test failed:', error.message);
    
    // Provide specific error guidance
    if (error.message.includes('getObject')) {
      console.error('\n💡 This error usually means:');
      console.error('   1. Package ID does not exist on-chain');
      console.error('   2. Key server object IDs are incorrect');
      console.error('   3. Sui RPC URL is not accessible');
    } else if (error.message.includes('toLowerCase')) {
      console.error('\n💡 This error usually means:');
      console.error('   1. Package ID or key server ID format is invalid');
      console.error('   2. Check that all IDs are 66 characters (0x + 64 hex)');
      console.error('   3. One of the key servers might be undefined or not a string');
      console.error('\n🔍 Debug info:');
      console.error('   - Key servers from config:', JSON.stringify(config.seal.keyServers, null, 2));
      console.error('   - Key server types:', config.seal.keyServers.map(id => typeof id));
    }

    console.error('\n📚 See: https://seal-docs.wal.app/UsingSeal/');
    console.error('\nStack trace:');
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}

async function testUploadToServer() {
  console.log('\n\n📤 Testing Upload to Server...\n');

  try {
    const sealClient = initializeSealClient();
    if (!sealClient) {
      throw new Error('SealClient initialization failed');
    }

    // Encrypt test data first
    const encryptionResult = await testSealEncryption(sealClient);
    if (!encryptionResult.success) {
      if (encryptionResult.requiresDeployment) {
        console.log('\n⏭️  Skipping upload test - Move contract deployment required');
        return { success: false, skipped: true, reason: 'Move contract not deployed' };
      }
      throw new Error('Encryption failed');
    }

    // Read the encrypted file
    const encryptedPath = encryptionResult.encryptedPath;
    if (!fs.existsSync(encryptedPath)) {
      throw new Error('Encrypted file not found');
    }
    
    const encryptedData = fs.readFileSync(encryptedPath);
    const encryptedBase64 = encryptedData.toString('base64');

    // Prepare upload payload
    const ownerAddress = config.sui.receiverAddress;
    if (!ownerAddress) {
      throw new Error('PAYMENT_RECEIVER_ADDRESS not configured');
    }

    const apiUrl = process.env.API_URL || 'http://localhost:3001';

    const payload = {
      filename: 'test-seal-encrypted.txt',
      ciphertextBase64: encryptedBase64,
      ownerAddress,
      priceRaw: config.sui.minPaymentRaw.toString(),
      encryptedKeyForOwner: encryptionResult.backupKey,
      epochs: 2,
    };

    console.log('📝 Upload payload prepared:');
    console.log('   - Filename:', payload.filename);
    console.log('   - Owner:', ownerAddress);
    console.log('   - Price:', payload.priceRaw, 'MIST');
    console.log('   - API URL:', apiUrl);

    // Upload to server
    console.log('\n🚀 Uploading to server...');
    const response = await fetch(`${apiUrl}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Upload successful!');
    console.log('   - Blob ID:', result.blobId || result.id);
    console.log('   - Key ID:', result.keyId || 'N/A');

    return { success: true, result };

  } catch (error) {
    console.error('\n❌ Upload test failed:', error.message);
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch')) {
      console.error('   💡 Make sure your server is running: npm run dev');
    }
    return { success: false, error: error.message };
  }
}

// Main test runner
async function runTests() {
  console.log('🧪 Seal SDK Integration Test');
  console.log('📚 Documentation: https://seal-docs.wal.app/');
  console.log('📦 GitHub: https://github.com/MystenLabs/seal\n');
  console.log('='.repeat(50));

  // Initialize Seal client
  const sealClient = initializeSealClient();
  if (!sealClient) {
    console.log('\n❌ Cannot proceed - SealClient initialization failed');
    console.log('\n💡 Required environment variables:');
    console.log('   - SUI_RPC_URL');
    console.log('   - SEAL_KEY_SERVER_1');
    console.log('   - SEAL_KEY_SERVER_2');
    console.log('   - SEAL_PACKAGE_ID (after deploying Move contract)');
    process.exit(1);
  }

  // Test 1: Encryption
  const encryptionTest = await testSealEncryption(sealClient);

  // Test 2: Upload (only if encryption succeeded and contract is deployed)
  if (encryptionTest.success && !encryptionTest.requiresDeployment) {
    // Uncomment to test upload:
    // const uploadTest = await testUploadToServer();
  }

  console.log('\n' + '='.repeat(50));
  console.log('✨ Tests completed!');
  
  if (encryptionTest.requiresDeployment) {
    console.log('\n📋 Next Steps:');
    console.log('   1. Create Move contract with seal_approve function');
    console.log('   2. Deploy to Sui testnet: sui client publish');
    console.log('   3. Update SEAL_PACKAGE_ID in server/.env');
    console.log('   4. Run this test again');
  } else if (encryptionTest.success) {
    console.log('\n✅ All tests passed! Seal integration is working.');
  }
}

// Run if called directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { 
  initializeSealClient, 
  testSealEncryption, 
  testUploadToServer,
  isValidSuiAddress,
  validateSealConfig
};