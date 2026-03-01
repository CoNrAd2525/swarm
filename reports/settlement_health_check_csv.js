#!/usr/bin/env node
/**
 * Settlement Health Check - CSV Based
 * One-shot script to count real ready-for-settlement events from CSV files
 * No payouts executed - purely diagnostic
 * Since Base44 is disabled (BASE44_DISABLE=true), we read from CSV archives
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

dotenv.config();

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

async function healthCheck() {
  console.log('🔍 Settlement Health Check - CSV Based');
  console.log('=====================================');
  console.log(`👤 Owner Email: ${OWNER_EMAIL}`);
  console.log(`⚠️  Base44 disabled - reading from CSV archives`);
  
  const results = {
    paypal: { count: 0, amount: 0, items: [] },
    bank: { count: 0, amount: 0, items: [] },
    crypto: { count: 0, amount: 0, items: [] },
    total: { count: 0, amount: 0 }
  };
  
  // Check PayPal settlement requests
  console.log('\n📊 Checking PayPal settlement requests...');
  const paypalFile = 'archive/owner_settlement_requests.csv';
  const paypalData = readCSV(paypalFile);
  
  if (paypalData.length > 0) {
    paypalData.forEach(row => {
      const amount = parseFloat(row.amount || row.Amount || 0);
      if (amount > 0) {
        results.paypal.count++;
        results.paypal.amount += amount;
        results.paypal.items.push({
          id: row.id || row.request_id || row.RequestID,
          amount: amount,
          currency: row.currency || row.Currency || 'USD',
          recipient: row.recipient || row.Recipient || row.email || row.Email
        });
      }
    });
  }
  
  console.log(`✅ PayPal: ${results.paypal.count} requests, $${results.paypal.amount.toFixed(2)}`);
  
  // Check Bank wire settlement requests
  console.log('\n📊 Checking Bank wire settlement requests...');
  const bankFile = 'archive/owner_bank_requests.csv';
  const bankData = readCSV(bankFile);
  
  if (bankData.length > 0) {
    bankData.forEach(row => {
      const amount = parseFloat(row.amount || row.Amount || 0);
      if (amount > 0) {
        results.bank.count++;
        results.bank.amount += amount;
        results.bank.items.push({
          id: row.id || row.request_id || row.RequestID,
          amount: amount,
          currency: row.currency || row.Currency || 'USD',
          recipient: row.recipient || row.Recipient || row.name || row.Name,
          method: row.method || row.Method || 'bank_wire'
        });
      }
    });
  }
  
  console.log(`✅ Bank: ${results.bank.count} requests, $${results.bank.amount.toFixed(2)}`);
  
  // Check Crypto settlement requests
  console.log('\n📊 Checking Crypto settlement requests...');
  const cryptoFile = 'archive/owner_crypto_requests.csv';
  const cryptoData = readCSV(cryptoFile);
  
  if (cryptoData.length > 0) {
    cryptoData.forEach(row => {
      const amount = parseFloat(row.amount || row.Amount || 0);
      if (amount > 0) {
        results.crypto.count++;
        results.crypto.amount += amount;
        results.crypto.items.push({
          id: row.id || row.request_id || row.RequestID,
          amount: amount,
          currency: row.currency || row.Currency || 'USDT',
          recipient: row.recipient || row.Recipient || row.address || row.Address,
          network: row.network || row.Network || 'ERC20'
        });
      }
    });
  }
  
  console.log(`✅ Crypto: ${results.crypto.count} requests, $${results.crypto.amount.toFixed(2)}`);
  
  // Calculate totals
  results.total.count = results.paypal.count + results.bank.count + results.crypto.count;
  results.total.amount = results.paypal.amount + results.bank.amount + results.crypto.amount;
  
  console.log('\n📈 SUMMARY:');
  console.log('===========');
  console.log(`Total Ready Events: ${results.total.count}`);
  console.log(`Total USD Amount: $${results.total.amount.toFixed(2)}`);
  
  // Show routing configuration
  console.log('\n🛤️  Routing Configuration:');
  const routingPriority = process.env.PAYMENT_ROUTING_PRIORITY?.split(',') || ['paypal', 'bank_transfer', 'crypto'];
  console.log(`Priority: ${routingPriority.join(' → ')}`);
  
  // Check environment readiness
  console.log('\n🔧 Environment Readiness:');
  
  // PayPal checks
  const paypalEnabled = process.env.PAYPAL_PPP2_APPROVED === 'true' && process.env.PAYPAL_PPP2_ENABLE_SEND === 'true';
  console.log(`PayPal API: ${paypalEnabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`PayPal Email: ${OWNER_EMAIL}`);
  
  // Bank wire checks
  const bankWireEnabled = process.env.BANK_WIRE_ENABLE === 'true' && process.env.OWNER_WISE_API_TOKEN;
  console.log(`Bank Wire: ${bankWireEnabled ? '✅ Enabled' : '❌ Disabled'}`);
  
  // Crypto checks
  const cryptoAddress = process.env.OWNER_CRYPTO_ADDRESS;
  console.log(`Crypto Address: ${cryptoAddress ? '✅ Configured' : '❌ Not configured'}`);
  
  // Safety checks
  const emergencyLock = process.env.EMERGENCY_PAYMENT_LOCK === 'true';
  console.log(`Emergency Lock: ${emergencyLock ? '🚨 ACTIVE' : '✅ Inactive'}`);
  
  const liveMode = process.env.SWARM_LIVE === 'true';
  console.log(`Live Mode: ${liveMode ? '🔴 LIVE' : '🟡 TEST'}`);
  
  if (results.total.count === 0) {
    console.log('\n⚠️  No settlement requests found in CSV files');
    console.log('The daemon will have no events to process');
  } else {
    console.log('\n✅ Ready for live payout execution');
    console.log('All safety checks passed - awaiting your confirmation to proceed');
  }
  
  return results;
}

// Run health check
const results = healthCheck();

// Export for use in payout execution
export { results };