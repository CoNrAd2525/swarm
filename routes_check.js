import dotenv from 'dotenv';
dotenv.config();

console.log('🔍 ROUTES AVAILABILITY CHECK');
console.log('================================');

// Check environment variables for each rail
const rails = {
  PAYONEER: {
    required: ['PAYONEER_API_KEY', 'PAYONEER_PRQ_TOKEN', 'OWNER_PAYONEER_EMAIL', 'OWNER_PAYONEER_ID'],
    mode: 'PAYONEER_MODE'
  },
  WISE: {
    required: ['WISE_API_KEY', 'OWNER_WISE_ACCOUNT_ID', 'OWNER_WISE_PROFILE_ID', 'OWNER_BANK_ACCOUNT_NUM'],
    mode: 'BANK_MODE'
  },
  CRYPTO: {
    required: ['BINANCE_API_KEY', 'BINANCE_API_SECRET', 'OWNER_CRYPTO_BEP20'],
    mode: 'CRYPTO_MODE'
  }
};

Object.entries(rails).forEach(([rail, config]) => {
  console.log(`\n💳 ${rail} RAIL:`);
  
  // Check mode
  const mode = process.env[config.mode];
  console.log(`  Mode: ${mode || 'NOT SET'}`);
  
  // Check required vars
  const missing = config.required.filter(env => !process.env[env]);
  console.log(`  Status: ${missing.length === 0 ? '✅ CONFIGURED' : '❌ MISSING CONFIG'}`);
  
  if (missing.length > 0) {
    console.log(`  Missing: ${missing.join(', ')}`);
  }
  
  // Check specific rail status
  config.required.forEach(env => {
    if (process.env[env]) {
      console.log(`  ✅ ${env}: ${env.includes('SECRET') ? '***' : 'CONFIGURED'}`);
    }
  });
});

console.log('\n🎯 OVERALL STATUS:');
const allConfigured = Object.values(rails).every(config => 
  config.required.every(env => process.env[env])
);
console.log(`All Rails: ${allConfigured ? '✅ READY' : '❌ INCOMPLETE'}`);

// Additional check for LIVE mode
console.log('\n🚀 LIVE MODE CHECK:');
const liveMode = process.env.FINANCIAL_MODE === 'LIVE';
console.log(`Mode: ${liveMode ? '✅ LIVE' : '⚠️ TEST'}`);

// Check settlement data
import fs from 'fs';
import path from 'path';
const payeeLinksPath = path.resolve(process.cwd(), 'dist_rwc/site-data/payee_links.json');

try {
  if (fs.existsSync(payeeLinksPath)) {
    const data = JSON.parse(fs.readFileSync(payeeLinksPath, 'utf-8'));
    console.log(`\n📋 Settlement Requests: ${data.length} items`);
    if (data.length > 0) {
      console.log(`Total Amount: ${data.reduce((sum, item) => sum + (item.amount || 0), 0)} USD`);
    }
  } else {
    console.log('\n⚠️ No settlement requests file found');
  }
} catch (error) {
  console.log('\n❌ Error reading settlement data:', error.message);
}