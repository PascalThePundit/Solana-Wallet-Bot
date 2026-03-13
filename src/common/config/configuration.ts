export default () => ({
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    network: process.env.SOLANA_NETWORK || 'mainnet-beta',
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  fee: {
    walletAddress: process.env.FEE_WALLET_ADDRESS,
    percentage: 0.01,
  },
});