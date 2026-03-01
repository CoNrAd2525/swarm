import 'dotenv/config';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

const PAYEE_LINKS_PATH = path.resolve(process.cwd(), 'dist_rwc/site-data/payee_links.json');
const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE_URL || 'https://api-m.paypal.com';

class PayPalAPIClient {
  constructor() {
    this.clientId = process.env.PAYPAL_CLIENT_ID;
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    this.accessToken = null;
  }

  async getAccessToken() {
    if (this.accessToken) return this.accessToken;

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    try {
      const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials'
      });

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      return this.accessToken;
    } catch (error) {
      throw new Error(`PayPal API authentication failed: ${error.message}`);
    }
  }

  async createPayout(payeeLink) {
    const accessToken = await this.getAccessToken();
    
    const payoutData = {
      sender_batch_header: {
        sender_batch_id: `batch_${Date.now()}_${payeeLink.ref}`,
        email_subject: "Settlement Payment",
        email_message: "Payment for services rendered"
      },
      items: [{
        recipient_type: "EMAIL",
        amount: {
          value: payeeLink.amount.toString(),
          currency: payeeLink.currency
        },
        receiver: process.env.OWNER_PAYPAL_EMAIL, // Send to owner
        sender_item_id: payeeLink.ref,
        note: `Settlement for ${payeeLink.ref}`
      }]
    };

    try {
      const response = await fetch(`${PAYPAL_API_BASE}/v1/payments/payouts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payoutData)
      });

      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(`PayPal API error: ${response.status} ${JSON.stringify(responseData)}`);
      }

      return responseData;
    } catch (error) {
      throw new Error(`Payout creation failed: ${error.message}`);
    }
  }

  async getPayoutStatus(payoutBatchId) {
    const accessToken = await this.getAccessToken();
    
    try {
      const response = await fetch(`${PAYPAL_API_BASE}/v1/payments/payouts/${payoutBatchId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get payout status: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Payout status check failed: ${error.message}`);
    }
  }
}

function createLogger() {
  const logFilePath = path.resolve(process.cwd(), 'logs/settlement_agent_api.log');
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  return {
    info: (message) => {
      console.log(message);
      logStream.write(`[INFO] ${new Date().toISOString()}: ${message}\n`);
    },
    error: (message, error) => {
      console.error(message, error);
      logStream.write(`[ERROR] ${new Date().toISOString()}: ${message}\n${error?.stack || error}\n`);
    },
    success: (message) => {
      console.log(`✅ ${message}`);
      logStream.write(`[SUCCESS] ${new Date().toISOString()}: ${message}\n`);
    }
  };
}

async function readPayeeLinks() {
  try {
    const data = await fsp.readFile(PAYEE_LINKS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function run() {
  console.log('🚀 Starting Settlement Agent (API Version)...');
  const log = createLogger();
  const paypalClient = new PayPalAPIClient();

  // Authorization check
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    log.error('❌ Missing PayPal API credentials in environment variables');
    process.exit(1);
  }

  // Validate environment
  if (process.env.FINANCIAL_MODE !== 'LIVE' && process.env.FINANCIAL_MODE !== 'TEST') {
    log.error('❌ Invalid FINANCIAL_MODE. Must be LIVE or TEST');
    process.exit(1);
  }

  // Authorization: Verify real money movement is enabled
  if (process.env.FINANCIAL_MODE === 'LIVE' && process.env.ENABLE_REAL_MONEY_MOVEMENT !== 'true') {
    log.error('❌ Real money movement is disabled in LIVE mode');
    process.exit(1);
  }

  try {
    log.info('📄 Reading payee links...');
    
    // Authorization: Verify payee links file exists and is accessible
    try {
      await fsp.access(PAYEE_LINKS_PATH, fs.constants.R_OK);
    } catch (error) {
      log.error(`❌ Payee links file not accessible: ${PAYEE_LINKS_PATH}`);
      process.exit(1);
    }
    
    const payeeLinks = await readPayeeLinks();
    if (!payeeLinks.length) {
      log.info('✅ No payee links to process.');
      return;
    }
    
    // Authorization: Validate payee links data structure
    for (const link of payeeLinks) {
      if (!link.ref || !link.amount || !link.currency || !link.link) {
        log.error(`❌ Invalid payee link structure for ref: ${link.ref}`);
        process.exit(1);
      }
      
      // Validate amount is positive number
      if (isNaN(link.amount) || link.amount <= 0) {
        log.error(`❌ Invalid amount for payee link ${link.ref}: ${link.amount}`);
        process.exit(1);
      }
      
      // Validate currency
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
      if (!validCurrencies.includes(link.currency)) {
        log.error(`❌ Invalid currency for payee link ${link.ref}: ${link.currency}`);
        process.exit(1);
      }
    }
    
    log.info(`🔗 Found ${payeeLinks.length} payee links.`);

    // Test PayPal API connection first
    log.info('🔐 Testing PayPal API connection...');
    try {
      await paypalClient.getAccessToken();
      log.success('PayPal API connection established');
    } catch (error) {
      log.error('❌ PayPal API connection failed:', error);
      process.exit(1);
    }

    const processedPayments = [];
    const failedPayments = [];

    for (const link of payeeLinks) {
      try {
        log.info(`💸 Processing payment for: ${link.ref} (${link.amount} ${link.currency})`);
        
        // Check transaction limits
        const dailyLimit = parseFloat(process.env.DAILY_TRANSACTION_LIMIT) || 1000;
        const maxSingleTransaction = parseFloat(process.env.MAX_SINGLE_TRANSACTION) || 500;
        
        if (link.amount > maxSingleTransaction) {
          throw new Error(`Transaction amount exceeds single transaction limit: ${link.amount} > ${maxSingleTransaction}`);
        }

        if (process.env.FINANCIAL_MODE === 'TEST') {
          log.info(`🧪 TEST MODE: Simulating payment for ${link.ref}`);
          processedPayments.push({
            ref: link.ref,
            amount: link.amount,
            currency: link.currency,
            status: 'TEST_MODE',
            timestamp: new Date().toISOString()
          });
          continue;
        }

        // Create payout via PayPal API
        const payoutResult = await paypalClient.createPayout(link);
        log.success(`Payout created for ${link.ref}: ${payoutResult.batch_header.payout_batch_id}`);
        
        // Wait a moment and check status
        await new Promise(resolve => setTimeout(resolve, 2000));
        const payoutStatus = await paypalClient.getPayoutStatus(payoutResult.batch_header.payout_batch_id);
        
        processedPayments.push({
          ref: link.ref,
          amount: link.amount,
          currency: link.currency,
          batch_id: payoutResult.batch_header.payout_batch_id,
          status: payoutStatus.batch_header.batch_status,
          timestamp: new Date().toISOString()
        });

        // Add delay between payments to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        log.error(`❌ Payment failed for ${link.ref}:`, error);
        failedPayments.push({
          ref: link.ref,
          amount: link.amount,
          currency: link.currency,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Generate summary report
    log.info('📊 Settlement Summary:');
    log.info(`✅ Successfully processed: ${processedPayments.length} payments`);
    log.info(`❌ Failed: ${failedPayments.length} payments`);
    
    if (processedPayments.length > 0) {
      log.info('Processed payments:');
      processedPayments.forEach(payment => {
        log.info(`  - ${payment.ref}: ${payment.amount} ${payment.currency} (${payment.status})`);
      });
    }
    
    if (failedPayments.length > 0) {
      log.info('Failed payments:');
      failedPayments.forEach(payment => {
        log.info(`  - ${payment.ref}: ${payment.amount} ${payment.currency} - ${payment.error}`);
      });
    }

    // Save summary to file
    const summary = {
      timestamp: new Date().toISOString(),
      total_processed: processedPayments.length,
      total_failed: failedPayments.length,
      processed_payments: processedPayments,
      failed_payments: failedPayments
    };
    
    await fsp.writeFile(
      path.resolve(process.cwd(), 'logs/settlement_summary.json'), 
      JSON.stringify(summary, null, 2)
    );

    log.success('Settlement process completed successfully');
    
  } catch (error) {
    log.error('❌ An error occurred during the settlement process:', error);
    process.exit(1);
  }
}

// Run the settlement agent
run().catch(console.error);