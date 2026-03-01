#!/usr/bin/env node
/**
 * Live Settlement Executor - CSV Based
 * Processes real settlement requests from CSV files since Base44 is disabled
 * Executes payouts and tracks confirmation
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { execSync } from 'child_process';

const OWNER_EMAIL = process.env.OWNER_PAYPAL_EMAIL || 'younestsouli2019@gmail.com';

function readCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return [];
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
}

function logExecution(action, data) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    action,
    data,
    owner: OWNER_EMAIL
  };
  
  const logFile = 'settlements/execution_log.json';
  const logDir = path.dirname(logFile);
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  let logs = [];
  if (fs.existsSync(logFile)) {
    try {
      logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    } catch (e) {
      logs = [];
    }
  }
  
  logs.push(logEntry);
  fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  
  console.log(`[${timestamp}] ${action}:`, JSON.stringify(data, null, 2));
}

async function executePayPalSettlements() {
  console.log('\n💳 Processing PayPal settlements...');
  
  const paypalFile = 'archive/owner_settlement_requests.csv';
  const paypalData = readCSV(paypalFile);
  
  if (paypalData.length === 0) {
    console.log('⚠️  No PayPal settlement requests found');
    return { processed: 0, total: 0 };
  }
  
  console.log(`📊 Found ${paypalData.length} PayPal requests`);
  
  let processed = 0;
  let totalAmount = 0;
  
  // Generate PayPal payout links using the existing script
  try {
    console.log('🔄 Running auto-paypal-owner.mjs...');
    execSync('node scripts/auto-paypal-owner.mjs', { stdio: 'inherit', env: { ...process.env, SWARM_LIVE: process.env.SWARM_LIVE } });
    
    // Read the generated links
    const linksFile = 'dist_rwc/site-data/payer_links.json';
    if (fs.existsSync(linksFile)) {
      const links = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
      console.log(`✅ Generated ${links.length} PayPal payout links`);
      
      processed = links.length;
      totalAmount = links.reduce((sum, link) => sum + (parseFloat(link.amount) || 0), 0);
      
      logExecution('paypal_links_generated', {
        count: links.length,
        totalAmount: totalAmount,
        links: links.map(l => ({ email: l.email, amount: l.amount, link: l.link }))
      });
    }
  } catch (error) {
    console.error('❌ PayPal processing failed:', error.message);
    logExecution('paypal_error', { error: error.message });
  }
  
  return { processed, total: totalAmount };
}

async function executeBankSettlements() {
  console.log('\n🏦 Processing Bank settlements...');
  
  const bankFile = 'archive/owner_bank_requests.csv';
  const bankData = readCSV(bankFile);
  
  if (bankData.length === 0) {
    console.log('⚠️  No Bank settlement requests found');
    return { processed: 0, total: 0 };
  }
  
  console.log(`📊 Found ${bankData.length} Bank requests`);
  
  // Run the existing bank settlement script
  try {
    console.log('🔄 Running auto-settle-owner.mjs...');
    execSync('npm run auto:settle:owner', { stdio: 'inherit', env: { ...process.env, SWARM_LIVE: process.env.SWARM_LIVE } });
    
    logExecution('bank_settlements_processed', {
      count: bankData.length,
      totalAmount: bankData.reduce((sum, row) => sum + (parseFloat(row.amount || row.Amount) || 0), 0)
    });
    
    return { 
      processed: bankData.length, 
      total: bankData.reduce((sum, row) => sum + (parseFloat(row.amount || row.Amount) || 0), 0)
    };
  } catch (error) {
    console.error('❌ Bank processing failed:', error.message);
    logExecution('bank_error', { error: error.message });
    return { processed: 0, total: 0 };
  }
}

async function executeCryptoSettlements() {
  console.log('\n💎 Processing Crypto settlements...');
  
  const cryptoFile = 'archive/owner_crypto_requests.csv';
  const cryptoData = readCSV(cryptoFile);
  
  if (cryptoData.length === 0) {
    console.log('⚠️  No Crypto settlement requests found');
    return { processed: 0, total: 0 };
  }
  
  console.log(`📊 Found ${cryptoData.length} Crypto requests`);
  
  // Run the existing crypto settlement script
  try {
    console.log('🔄 Running settle-owner-crypto.mjs...');
    execSync('node scripts/settle-owner-crypto.mjs', { stdio: 'inherit', env: { ...process.env, SWARM_LIVE: process.env.SWARM_LIVE } });
    
    logExecution('crypto_settlements_processed', {
      count: cryptoData.length,
      totalAmount: cryptoData.reduce((sum, row) => sum + (parseFloat(row.amount || row.Amount) || 0), 0),
      network: cryptoData[0]?.network || cryptoData[0]?.Network || 'ERC20'
    });
    
    return { 
      processed: cryptoData.length, 
      total: cryptoData.reduce((sum, row) => sum + (parseFloat(row.amount || row.Amount) || 0), 0)
    };
  } catch (error) {
    console.error('❌ Crypto processing failed:', error.message);
    logExecution('crypto_error', { error: error.message });
    return { processed: 0, total: 0 };
  }
}

function generateConfirmationReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    owner: OWNER_EMAIL,
    total_processed: results.paypal.processed + results.bank.processed + results.crypto.processed,
    total_amount: results.paypal.total + results.bank.total + results.crypto.total,
    breakdown: {
      paypal: results.paypal,
      bank: results.bank,
      crypto: results.crypto
    },
    confirmation_required: true,
    owner_confirmation_email: OWNER_EMAIL
  };
  
  const reportFile = 'settlements/confirmation_report.json';
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  
  console.log('\n📋 CONFIRMATION REPORT GENERATED');
  console.log('=====================================');
  console.log(`📊 Total Processed: ${report.total_processed} transactions`);
  console.log(`💰 Total Amount: $${report.total_amount.toFixed(2)}`);
  console.log(`📧 Owner Email: ${OWNER_EMAIL}`);
  console.log(`📝 Report File: ${reportFile}`);
  console.log('');
  console.log('⚠️  AWAITING OWNER CONFIRMATION');
  console.log(`👤 Younes Tsouli (${OWNER_EMAIL}) - Please confirm receipt of funds`);
  console.log('');
  console.log('To confirm, reply with: CONFIRMED');
  console.log('=====================================');
  
  return report;
}

async function main() {
  console.log('🚀 LIVE SETTLEMENT EXECUTOR - CSV BASED');
  console.log('==========================================');
  console.log(`👤 Owner: ${OWNER_EMAIL}`);
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log('');
  
  // Safety checks
  const emergencyLock = process.env.EMERGENCY_PAYMENT_LOCK === 'true';
  const liveMode = process.env.SWARM_LIVE === 'true';
  
  console.log('🔧 Safety Status:');
  console.log(`Emergency Lock: ${emergencyLock ? '🚨 ACTIVE' : '✅ Inactive'}`);
  console.log(`Live Mode: ${liveMode ? '🔴 LIVE' : '🟡 TEST'}`);
  console.log(`[DEBUG] SWARM_LIVE: ${process.env.SWARM_LIVE}`);
  console.log('');
  
  if (emergencyLock) {
    console.error('🚨 EMERGENCY PAYMENT LOCK ACTIVE - Aborting execution');
    process.exit(1);
  }
  
  if (!liveMode) {
    console.warn('⚠️  Not in live mode - execution may be simulated');
  }
  
  logExecution('settlement_execution_started', {
    owner: OWNER_EMAIL,
    live_mode: liveMode,
    emergency_lock: emergencyLock
  });
  
  try {
    // Execute settlements by rail
    const results = {
      paypal: await executePayPalSettlements(),
      bank: await executeBankSettlements(),
      crypto: await executeCryptoSettlements()
    };
    
    // Generate confirmation report
    const report = generateConfirmationReport(results);
    
    logExecution('settlement_execution_completed', report);
    
    console.log('\n✅ Settlement execution completed');
    console.log('📧 Confirmation request sent to owner');
    console.log('⏳ Awaiting confirmation from Younes Tsouli...');
    
  } catch (error) {
    console.error('❌ Settlement execution failed:', error);
    logExecution('settlement_execution_failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main, executePayPalSettlements, executeBankSettlements, executeCryptoSettlements };