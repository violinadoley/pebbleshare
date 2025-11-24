require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3001,
  host: process.env.HOST || '0.0.0.0',
  sui: {
    rpcUrl: process.env.SUI_RPC_URL,
    receiverAddress: process.env.PAYMENT_RECEIVER_ADDRESS,
    currency: process.env.PAYMENT_CURRENCY || 'SUI',
    minPaymentRaw: Number(process.env.MIN_PAYMENT_AMOUNT_RAW || 1000000000),
    finalityCheckpoints: Number(process.env.SUI_FINALITY_CHECKPOINTS || 2)
  },
  walrus: {
    apiUrl: process.env.WALRUS_API_URL,
    apiKey: process.env.WALRUS_API_KEY
  },
  seal: {
    packageId: process.env.SEAL_PACKAGE_ID,
    keyServers: [
      process.env.SEAL_KEY_SERVER_1,
      process.env.SEAL_KEY_SERVER_2
    ].filter(Boolean),
    threshold: 2,
    verifyKeyServers: process.env.NODE_ENV === 'production'
  },
  fileRegistry: {
    packageId: process.env.FILE_REGISTRY_PACKAGE_ID,
  },
  dbFile: process.env.DB_FILE || './data/db.json',
  nodeEnv: process.env.NODE_ENV || 'development'
};