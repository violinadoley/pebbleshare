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
    apiUrl: process.env.SEAL_API_URL,
    apiKey: process.env.SEAL_API_KEY
  },
  dbFile: process.env.DB_FILE || './data/db.json',
  nodeEnv: process.env.NODE_ENV || 'development'
};

