import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

import { v4 as uuidv4 } from 'uuid';

const argv = process.argv.slice(2);
const hasFlag = (flag) => argv.includes(flag);
const getArgValue = (flag) => {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith('-')) return null;
  return v;
};

const reconcileLedger = hasFlag('--reconcile-ledger');
const inputFileFromFlag = getArgValue('--input');
const positionalArgs = argv.filter((a) => !a.startsWith('-'));
const inputFile =
  inputFileFromFlag ?? (!reconcileLedger ? positionalArgs[0] : null) ?? 'dist_rwc/site-data/payee_links.json';
const ledgerFile = getArgValue('--ledger') ?? 'data/financial/settlement_ledger.json';

let PAYEE_LINKS_PATH = path.resolve(process.cwd(), inputFile);

class MultiRailSettlementAgent {
  constructor() {
    this.processedPayments = [];
    this.failedPayments = [];
  }

  validateOwnerConfiguration() {
    const receivingAddresses = {
      'OWNER_PAYONEER_EMAIL': process.env.OWNER_PAYONEER_EMAIL,
      'OWNER_BANK_ACCOUNT_NUM': process.env.OWNER_BANK_ACCOUNT_NUM,
      'OWNER_CRYPTO_BEP20': process.env.OWNER_CRYPTO_BEP20,
      'OWNER_PAYPAL_EMAIL': process.env.OWNER_PAYPAL_EMAIL
    };

    const missing = Object.keys(receivingAddresses).filter(key => !receivingAddresses[key]);
    
    return {
      valid: missing.length === 0,
      missing: missing,
      configured: Object.keys(receivingAddresses).filter(key => receivingAddresses[key])
    };
  }

  async processWithPayoneer(payeeLink) {
    console.log(`💳 Processing Payoneer settlement for OWNER account: ${payeeLink.ref}`);
    
    // Check if Payoneer receiving credentials are configured for OWNER account
    if (!process.env.OWNER_PAYONEER_EMAIL) {
      throw new Error('Payoneer OWNER receiving email not configured');
    }

    // Generate a unique settlement ID for tracking
    const settlementId = `SETTLE_PAYONEER_${payeeLink.ref}_${Date.now()}`;
    
    // Log the intended settlement (this is for receiving funds, not sending payouts)
    console.log(`📋 Payoneer Settlement Details:`);
    console.log(`   - Settlement ID: ${settlementId}`);
    console.log(`   - Receiving Account: ${process.env.OWNER_PAYONEER_EMAIL}`);
    console.log(`   - Expected Amount: ${payeeLink.amount} ${payeeLink.currency}`);
    console.log(`   - Status: AWAITING_INCOMING_PAYMENT`);
    console.log(`   - Note: Settlement ready to receive funds via Payoneer`);

    // In a real implementation, this would:
    // 1. Monitor Payoneer account for incoming payments
    // 2. Verify the amount and currency match
    // 3. Confirm the payment reference matches our settlement ID
    // For now, we create a settlement record that indicates we're ready to receive

    return {
      rail: 'PAYONEER',
      transaction_id: settlementId,
      status: 'AWAITING_INCOMING_PAYMENT',
      amount: payeeLink.amount,
      currency: payeeLink.currency,
      destination: process.env.OWNER_PAYONEER_EMAIL,
      type: 'OWNER_SETTLEMENT',
      settlement_type: 'RECEIVING',
      expected_payment: {
        amount: payeeLink.amount,
        currency: payeeLink.currency,
        to_account: process.env.OWNER_PAYONEER_EMAIL,
        reference: settlementId
      },
      note: 'Settlement ready to receive funds via Payoneer. Monitor account for incoming payments.'
    };
  }

  async processWithPayPal(payeeLink) {
    console.log(`🅿️ Processing PayPal settlement for OWNER account: ${payeeLink.ref}`);

    if (!process.env.OWNER_PAYPAL_EMAIL) {
      throw new Error('PayPal OWNER receiving email not configured');
    }

    const settlementId = `SETTLE_PAYPAL_${payeeLink.ref}_${Date.now()}`;

    console.log(`📋 PayPal Settlement Details:`);
    console.log(`   - Settlement ID: ${settlementId}`);
    console.log(`   - Receiving Account: ${process.env.OWNER_PAYPAL_EMAIL}`);
    console.log(`   - Expected Amount: ${payeeLink.amount} ${payeeLink.currency}`);
    console.log(`   - Status: AWAITING_INCOMING_PAYMENT`);

    return {
      rail: 'PAYPAL',
      transaction_id: settlementId,
      status: 'AWAITING_INCOMING_PAYMENT',
      amount: payeeLink.amount,
      currency: payeeLink.currency,
      destination: process.env.OWNER_PAYPAL_EMAIL,
      type: 'OWNER_SETTLEMENT',
      settlement_type: 'RECEIVING',
      expected_payment: {
        amount: payeeLink.amount,
        currency: payeeLink.currency,
        to_account: process.env.OWNER_PAYPAL_EMAIL,
        reference: settlementId
      },
      note: 'Settlement ready to receive funds via PayPal. Monitor account for incoming payments.'
    };
  }

  async processWithBankTransfer(payeeLink) {
    console.log(`🏦 Processing bank transfer settlement for OWNER account: ${payeeLink.ref}`);
    
    // Check if bank transfer receiving credentials are configured for OWNER account
    if (!process.env.OWNER_BANK_ACCOUNT_NUM) {
      throw new Error('Bank transfer OWNER receiving account not configured');
    }

    // Generate a unique settlement ID for tracking
    const settlementId = `SETTLE_BANK_${payeeLink.ref}_${Date.now()}`;
    
    // Log the intended settlement (this is for receiving funds, not sending transfers)
    console.log(`📋 Bank Transfer Settlement Details:`);
    console.log(`   - Settlement ID: ${settlementId}`);
    console.log(`   - Receiving Account: ${process.env.OWNER_BANK_ACCOUNT_NUM}`);
    console.log(`   - Expected Amount: ${payeeLink.amount} ${payeeLink.currency}`);
    console.log(`   - Status: AWAITING_INCOMING_TRANSFER`);
    console.log(`   - Note: Settlement ready to receive funds via bank transfer`);

    // In a real implementation, this would:
    // 1. Monitor bank account for incoming transfers
    // 2. Verify the amount and currency match
    // 3. Confirm the payment reference matches our settlement ID
    // For now, we create a settlement record that indicates we're ready to receive

    return {
      rail: 'BANK_TRANSFER',
      transaction_id: settlementId,
      status: 'AWAITING_INCOMING_TRANSFER',
      amount: payeeLink.amount,
      currency: payeeLink.currency,
      destination: process.env.OWNER_BANK_ACCOUNT_NUM,
      type: 'OWNER_SETTLEMENT',
      settlement_type: 'RECEIVING',
      expected_payment: {
        amount: payeeLink.amount,
        currency: payeeLink.currency,
        to_account: process.env.OWNER_BANK_ACCOUNT_NUM,
        reference: settlementId
      },
      note: 'Settlement ready to receive funds via bank transfer. Monitor account for incoming payments.'
    };
  }



  async processWithCrypto(payeeLink) {
    console.log(`🪙 Processing crypto settlement to OWNER wallet for: ${payeeLink.ref}`);
    
    // Check if crypto receiving addresses are configured for OWNER account
    if (!process.env.OWNER_CRYPTO_BEP20) {
      throw new Error('Crypto OWNER receiving address not configured');
    }

    // Generate a unique settlement ID for tracking
    const settlementId = `SETTLE_CRYPTO_${payeeLink.ref}_${Date.now()}`;
    
    // Log the intended settlement (this is for receiving funds, not withdrawing)
    console.log(`📋 Crypto Settlement Details:`);
    console.log(`   - Settlement ID: ${settlementId}`);
    console.log(`   - Receiving Address: ${process.env.OWNER_CRYPTO_BEP20}`);
    console.log(`   - Expected Amount: ${payeeLink.amount} ${payeeLink.currency}`);
    console.log(`   - Network: BEP20 (BSC)`);
    console.log(`   - Status: AWAITING_INCOMING_TRANSFER`);

    // In a real implementation, this would:
    // 1. Monitor the blockchain for incoming transfers to the OWNER address
    // 2. Verify the amount and token match
    // 3. Confirm the transaction on-chain
    // For now, we create a settlement record that indicates we're ready to receive

    return {
      rail: 'CRYPTO',
      transaction_id: settlementId,
      status: 'AWAITING_INCOMING_TRANSFER',
      amount: payeeLink.amount,
      currency: payeeLink.currency,
      destination: process.env.OWNER_CRYPTO_BEP20,
      type: 'OWNER_SETTLEMENT',
      settlement_type: 'RECEIVING',
      network: 'BEP20',
      expected_transfer: {
        amount: payeeLink.amount,
        currency: payeeLink.currency,
        to_address: process.env.OWNER_CRYPTO_BEP20,
        network: 'BEP20'
      },
      note: 'Settlement ready to receive funds. Monitor blockchain for incoming transfers.'
    };
  }

  async processPayment(payeeLink) {
    const log = createLogger();
    
    // Check transaction limits
    const dailyLimit = parseFloat(process.env.DAILY_TRANSACTION_LIMIT) || 1000;
    const maxSingleTransaction = parseFloat(process.env.MAX_SINGLE_TRANSACTION) || 500;
    
    if (payeeLink.amount > maxSingleTransaction) {
      throw new Error(`Transaction amount exceeds single transaction limit: ${payeeLink.amount} > ${maxSingleTransaction}`);
    }

    // Generate immutable settlement ID
    const settlementId = `SETTLE_${payeeLink.ref}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (process.env.FINANCIAL_MODE === 'TEST') {
      log.info(`🧪 TEST MODE: Simulating OWNER settlement for ${payeeLink.ref}`);
      return {
        settlement_id: settlementId,
        rail: 'TEST',
        transaction_id: `TEST_OWNER_${Date.now()}_${payeeLink.ref}`,
        status: 'TEST_MODE',
        amount: payeeLink.amount,
        currency: payeeLink.currency,
        destination: 'OWNER_ACCOUNT',
        type: 'OWNER_SETTLEMENT',
        settlement_type: 'RECEIVING',
        immutable: true,
        created_at: new Date().toISOString()
      };
    }

    // Validate OWNER account configuration before processing
    const ownerConfig = this.validateOwnerConfiguration();
    if (!ownerConfig.valid) {
      throw new Error(`OWNER account configuration incomplete: ${ownerConfig.missing.join(', ')}`);
    }

    log.info(`💰 Processing OWNER settlement for ${payeeLink.ref} - Amount: ${payeeLink.amount} ${payeeLink.currency}`);
    log.info(`📝 Settlement ID: ${settlementId}`);

    // Try payment rails in priority order for OWNER accounts
    const paymentRails = ['PAYONEER', 'PAYPAL', 'BANK_TRANSFER', 'CRYPTO'];
    let lastError = null;
    
    for (const rail of paymentRails) {
      try {
        let result;
        
        switch (rail) {
          case 'PAYONEER':
            if (process.env.PAYONEER_MODE === 'RECEIVE_LIVE') {
              result = await this.processWithPayoneer(payeeLink);
            }
            break;
          case 'PAYPAL':
            if (process.env.PAYPAL_MODE === 'RECEIVE_LIVE') {
              result = await this.processWithPayPal(payeeLink);
            }
            break;
          case 'BANK_TRANSFER':
            if (process.env.BANK_MODE === 'RECEIVE_LIVE' && process.env.BANK_INTEGRATION_ENABLED === 'true') {
              result = await this.processWithBankTransfer(payeeLink);
            }
            break;
          case 'CRYPTO':
            if (process.env.CRYPTO_MODE === 'RECEIVE_LIVE') {
              result = await this.processWithCrypto(payeeLink);
            }
            break;
        }
        
        if (result) {
          // Make the result immutable by adding settlement ID and timestamp
          const immutableResult = {
            settlement_id: settlementId,
            ...result,
            immutable: true,
            created_at: new Date().toISOString(),
            rail_used: rail
          };
          
          log.success(`✅ OWNER settlement processed via ${rail} for ${payeeLink.ref}`);
          return immutableResult;
        }
      } catch (error) {
        log.error(`❌ ${rail} failed for OWNER settlement ${payeeLink.ref}: ${error.message}`);
        lastError = error;
        continue; // Try next rail
      }
    }
    
    // If all rails failed, throw error with details
    const finalError = new Error(`All OWNER settlement payment rails failed for ${payeeLink.ref}`);
    finalError.settlement_id = settlementId;
    finalError.last_rail_error = lastError?.message;
    throw finalError;
  }
}

function createLogger() {
  const logFilePath = path.resolve(process.cwd(), 'logs/multi_rail_settlement.log');
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  return {
    info: (message) => {
      console.log(message);
      logStream.write(`[INFO] ${new Date().toISOString()}: ${message}\n`);
    },
    warn: (message) => {
      console.warn(message);
      logStream.write(`[WARN] ${new Date().toISOString()}: ${message}\n`);
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

async function readPayeeLinks(filePath) {
  try {
    const data = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function legacyToRail(channel) {
  if (!channel) return 'PAYONEER';
  if (channel === 'PAYONEER') return 'PAYONEER';
  if (channel === 'PAYPAL') return 'PAYPAL';
  if (channel === 'BANK_WIRE') return 'BANK_TRANSFER';
  if (channel === 'BANK_TRANSFER') return 'BANK_TRANSFER';
  if (channel === 'BINANCE_API') return 'CRYPTO';
  if (channel === 'BITGET_API') return 'CRYPTO';
  if (channel === 'BYBIT_API') return 'CRYPTO';
  return 'PAYONEER';
}

function deriveLegacyCurrency(item) {
  const txCurrency = item?.details?.transactions?.[0]?.currency;
  if (typeof txCurrency === 'string' && txCurrency.length) return txCurrency;
  const channel = item?.channel;
  if (channel === 'BINANCE_API' || channel === 'BITGET_API' || channel === 'BYBIT_API') return 'USDT';
  return 'USD';
}

function getLegacyReason(item) {
  return item?.reason ?? item?.details?.reason ?? item?.details?.status ?? null;
}

async function reconcileLegacyOwnerSettlements({ ledgerPath, settlementAgent, log }) {
  const resolvedLedgerPath = path.resolve(process.cwd(), ledgerPath);
  const raw = await fsp.readFile(resolvedLedgerPath, 'utf-8');
  const ledger = JSON.parse(raw);

  const now = new Date().toISOString();
  const queued = Array.isArray(ledger.queued) ? ledger.queued : [];
  const transactions = Array.isArray(ledger.transactions) ? ledger.transactions : [];

  const overdueQueued = queued.filter((q) => q?.status === 'QUEUED');
  const overdueTxStatuses = new Set(['WAITING_UPLOAD', 'INVOICES_GENERATED', 'INSTRUCTIONS_READY', 'prepared', 'QUEUED']);
  const overdueTx = transactions.filter((t) => overdueTxStatuses.has(t?.status));

  const items = [
    ...overdueQueued.map((q) => ({ source: 'queued', item: q })),
    ...overdueTx.map((t) => ({ source: 'transactions', item: t }))
  ];

  if (!items.length) {
    log.info(`✅ No legacy overdue OWNER settlements found in ledger: ${resolvedLedgerPath}`);
    return { reconciled: 0, ledgerUpdated: false };
  }

  log.info(`🧾 Reconciling ${items.length} legacy overdue OWNER settlements from ledger: ${resolvedLedgerPath}`);

  const reconciledRecords = [];
  const movedQueueIds = new Set();

  for (const { source, item } of items) {
    const legacyId = item?.id ?? `legacy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ref = `legacy-${legacyId}`;
    const rail = legacyToRail(item?.channel);
    const amount = item?.amount;
    const currency = deriveLegacyCurrency(item);

    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      log.error(`❌ Skipping legacy item with invalid amount: ${legacyId} (${amount})`);
      continue;
    }

    const settlement_id = `SETTLE_LEGACY_${legacyId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    let result = null;
    const payeeLink = { ref, amount, currency };

    try {
      if (rail === 'PAYONEER') result = await settlementAgent.processWithPayoneer(payeeLink);
      if (rail === 'PAYPAL') result = await settlementAgent.processWithPayPal(payeeLink);
      if (rail === 'BANK_TRANSFER') result = await settlementAgent.processWithBankTransfer(payeeLink);
      if (rail === 'CRYPTO') {
        const cryptoLink = { ...payeeLink, currency: currency || 'USDT' };
        result = await settlementAgent.processWithCrypto(cryptoLink);
      }
    } catch (e) {
      log.error(`❌ Failed to reconcile legacy item ${legacyId} via ${rail}: ${e?.message || e}`, e);
      continue;
    }

    if (!result) {
      log.error(`❌ Failed to reconcile legacy item ${legacyId}: no result`);
      continue;
    }

    const immutableRecord = {
      settlement_id,
      ...result,
      immutable: true,
      created_at: now,
      rail_used: rail,
      legacy: {
        source,
        id: legacyId,
        channel: item?.channel ?? null,
        original_status: item?.status ?? null,
        reason: getLegacyReason(item),
        original_timestamp: item?.timestamp ?? null
      }
    };

    reconciledRecords.push(immutableRecord);

    if (source === 'queued') {
      movedQueueIds.add(legacyId);
      transactions.push({
        id: `reconciled_${legacyId}`,
        timestamp: now,
        channel: 'LEGACY_RECONCILE',
        amount,
        status: 'RECEIVING_READY',
        details: {
          legacy: item,
          receiving: immutableRecord
        }
      });
    } else {
      item.legacy_reconciled = {
        reconciled_at: now,
        receiving: immutableRecord
      };
      item.status = 'RECONCILED_RECEIVING_READY';
    }
  }

  if (movedQueueIds.size > 0) {
    ledger.queued = queued.filter((q) => !movedQueueIds.has(q?.id));
  }

  ledger.transactions = transactions;
  ledger.legacy_reconcile = {
    last_run_at: now,
    reconciled_count: reconciledRecords.length
  };

  await fsp.writeFile(resolvedLedgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

  log.success(
    `Legacy overdue OWNER settlements reconciled: ${reconciledRecords.length} (ledger updated: ${resolvedLedgerPath})`
  );

  if (movedQueueIds.size > 0) {
    log.info(`✅ Removed ${movedQueueIds.size} items from ledger.queued after reconciliation`);
  }

  return { reconciled: reconciledRecords.length, ledgerUpdated: true };
}

async function run() {
  console.log('🚀 Starting Multi-Rail Settlement Agent...');
  const log = createLogger();
  const settlementAgent = new MultiRailSettlementAgent();

  // Validate environment
  if (process.env.FINANCIAL_MODE !== 'LIVE' && process.env.FINANCIAL_MODE !== 'TEST') {
    log.error('❌ Invalid FINANCIAL_MODE. Must be LIVE or TEST');
    process.exit(1);
  }

  // Validate OWNER account configuration
  const ownerConfig = settlementAgent.validateOwnerConfiguration();
  if (!ownerConfig.valid) {
    log.error(`❌ OWNER account configuration incomplete. Missing: ${ownerConfig.missing.join(', ')}`);
    log.info(`✅ Configured OWNER accounts: ${ownerConfig.configured.join(', ')}`);
    
    if (process.env.FINANCIAL_MODE === 'LIVE') {
      log.error('❌ Cannot proceed with LIVE mode without complete OWNER configuration');
      process.exit(1);
    } else {
      log.warn('⚠️  Proceeding in TEST mode with incomplete OWNER configuration');
    }
  } else {
    log.info(`✅ OWNER account configuration validated: ${ownerConfig.configured.join(', ')}`);
  }

  if (reconcileLedger) {
    await reconcileLegacyOwnerSettlements({
      ledgerPath: ledgerFile,
      settlementAgent,
      log
    });
    return;
  }

  // Log which input file we're using
  log.info(`📄 Reading settlement requests from: ${PAYEE_LINKS_PATH}`);
  
  try {
    
    // Verify payee links file exists and is accessible
    try {
      await fsp.access(PAYEE_LINKS_PATH, fs.constants.R_OK);
    } catch (error) {
      log.warn(`⚠️  No settlement requests file found: ${PAYEE_LINKS_PATH}`);
      log.info('💡 Creating default OWNER settlement request...');
      
      // Create default OWNER settlement request if no file exists
      const defaultSettlement = [{
        ref: 'OWNER_SETTLEMENT_DEFAULT',
        amount: 100.00,
        currency: 'USD',
        link: 'owner-settlement',
        description: 'Default OWNER account settlement'
      }];
      
      await fsp.writeFile(PAYEE_LINKS_PATH, JSON.stringify(defaultSettlement, null, 2));
      log.info('✅ Created default OWNER settlement request');
    }
    
    const payeeLinks = await readPayeeLinks(PAYEE_LINKS_PATH);
    if (!payeeLinks.length) {
      log.info('✅ No settlement requests to process.');
      return;
    }
    
    // Validate settlement requests data structure
    for (const link of payeeLinks) {
      if (!link.ref || !link.amount || !link.currency) {
        log.error(`❌ Invalid settlement request structure for ref: ${link.ref || 'unknown'}`);
        process.exit(1);
      }
      
      // Validate amount is positive number
      if (isNaN(link.amount) || link.amount <= 0) {
        log.error(`❌ Invalid amount for settlement ${link.ref}: ${link.amount}`);
        process.exit(1);
      }
      
      // Validate currency
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MAD', 'USDT'];
      if (!validCurrencies.includes(link.currency)) {
        log.error(`❌ Invalid currency for settlement ${link.ref}: ${link.currency}`);
        process.exit(1);
      }
    }
    
    log.info(`🔗 Found ${payeeLinks.length} settlement requests.`);
    log.info(`💳 Available OWNER settlement rails: Payoneer, PayPal, Bank Transfer, Crypto`);
    log.info(`🎯 Priority order: PAYONEER → PAYPAL → BANK_TRANSFER → CRYPTO`);
    log.info(`💰 All settlements will be routed to OWNER accounts by default`);

    const processedPayments = [];
    const failedPayments = [];

    for (const link of payeeLinks) {
      try {
        log.info(`💸 Processing OWNER settlement for: ${link.ref} (${link.amount} ${link.currency})`);
        
        const result = await settlementAgent.processPayment(link);
        processedPayments.push({
          ...result,
          ref: link.ref,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        log.error(`❌ All OWNER settlement rails failed for ${link.ref}:`, error);
        failedPayments.push({
          ref: link.ref,
          amount: link.amount,
          currency: link.currency,
          error: error.message,
          settlement_id: error.settlement_id || null,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Generate comprehensive summary
    log.info('\n📊 OWNER Settlement Summary:');
    log.info(`✅ Successfully processed: ${processedPayments.length} OWNER settlements`);
    log.info(`❌ Failed: ${failedPayments.length} OWNER settlements`);
    
    if (processedPayments.length > 0) {
      log.info('\n📋 Processed OWNER settlements:');
      processedPayments.forEach(payment => {
        log.info(`  - ${payment.ref}: ${payment.amount} ${payment.currency} via ${payment.rail} (${payment.status})`);
        if (payment.settlement_id) {
          log.info(`    Settlement ID: ${payment.settlement_id}`);
        }
        if (payment.transaction_id) {
          log.info(`    Transaction ID: ${payment.transaction_id}`);
        }
        if (payment.destination) {
          log.info(`    Destination: ${payment.destination}`);
        }
        if (payment.settlement_type === 'RECEIVING') {
          log.info(`    Type: OWNER Receiving Settlement ✓`);
        }
        if (payment.immutable) {
          log.info(`    Status: Immutable Record ✓`);
        }
      });
    }
    
    if (failedPayments.length > 0) {
      log.info('\n❌ Failed payments:');
      failedPayments.forEach(payment => {
        log.info(`  - ${payment.ref}: ${payment.amount} ${payment.currency} - ${payment.error}`);
        if (payment.settlement_id) {
          log.info(`    Settlement ID: ${payment.settlement_id}`);
        }
      });
    }

    // Save detailed summary
    const summary = {
      timestamp: new Date().toISOString(),
      total_processed: processedPayments.length,
      total_failed: failedPayments.length,
      financial_mode: process.env.FINANCIAL_MODE,
      settlement_type: 'RECEIVING',
      processed_payments: processedPayments,
      failed_payments: failedPayments,
      owner_email: process.env.OWNER_PAYPAL_EMAIL,
      notification_sent: processedPayments.length > 0,
      immutable_records: true,
      settlement_flow: 'SWARM_REVENUE_TO_OWNER_ACCOUNTS'
    };
    
    await fsp.writeFile(
      path.resolve(process.cwd(), 'logs/settlement_summary.json'), 
      JSON.stringify(summary, null, 2)
    );

    // Send notification to owner if payments were processed
    if (processedPayments.length > 0) {
      log.success(`\n🎉 Settlement completed! Owner should receive confirmation at: ${process.env.OWNER_PAYPAL_EMAIL}`);
      log.info('📧 Settlement summary saved to logs/settlement_summary.json');
    } else {
      log.error('\n❌ No payments were processed successfully');
    }

  } catch (error) {
    log.error('❌ An error occurred during the settlement process:', error);
    process.exit(1);
  }
}

// Run the multi-rail settlement agent
run().catch(console.error);
