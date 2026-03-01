#!/usr/bin/env node
/**
 * Settlement Health Check
 * One-shot script to count real ready-for-settlement events from Base44
 * No payouts executed - purely diagnostic
 */

import { buildBase44ServiceClient } from '../src/base44-client.mjs';
import { getRevenueConfigFromEnv } from '../src/base44-revenue.mjs';
import dotenv from 'dotenv';

dotenv.config();

async function healthCheck() {
  console.log('🔍 Settlement Health Check - Counting Real Ready Events');
  console.log('=====================================================');
  
  try {
    const base44 = buildBase44ServiceClient();
    const cfg = getRevenueConfigFromEnv();
    const entity = base44.asServiceRole.entities[cfg.entityName];
    
    console.log(`📊 Entity: ${cfg.entityName}`);
    console.log(`💰 Default Currency: ${cfg.defaultCurrency}`);
    
    // Build filter for ready-for-settlement events
    const filter = {};
    if (cfg.fieldMap.status) filter[cfg.fieldMap.status] = "VERIFIED";
    if (cfg.fieldMap.payoutBatchId) filter[cfg.fieldMap.payoutBatchId] = null;
    if (cfg.fieldMap.verificationProof) filter[cfg.fieldMap.verificationProof] = { $ne: null };
    
    console.log('🔍 Filter criteria:', JSON.stringify(filter, null, 2));
    
    // Query events
    const events = await entity.filter(filter, "-created_date", 1000, 0);
    
    console.log(`\n📈 Found ${events.length} total events matching criteria`);
    
    if (events.length > 0) {
      // Group by currency for summary
      const byCurrency = {};
      let totalUSD = 0;
      
      events.forEach(event => {
        const currency = event[cfg.fieldMap.currency] || cfg.defaultCurrency;
        const amount = Number(event[cfg.fieldMap.amount] || 0);
        
        if (!byCurrency[currency]) byCurrency[currency] = { count: 0, amount: 0 };
        byCurrency[currency].count++;
        byCurrency[currency].amount += amount;
        
        if (currency === 'USD') totalUSD += amount;
      });
      
      console.log('\n💸 Summary by Currency:');
      Object.entries(byCurrency).forEach(([currency, data]) => {
        console.log(`  ${currency}: ${data.count} events, ${data.amount.toFixed(2)} ${currency}`);
      });
      
      console.log(`\n🎯 Total USD Equivalent: $${totalUSD.toFixed(2)}`);
      
      // Show first few events as samples
      console.log('\n📋 Sample Events (first 3):');
      events.slice(0, 3).forEach((event, i) => {
        console.log(`  ${i + 1}. ID: ${event[cfg.fieldMap.externalId] || event.id}`);
        console.log(`     Amount: ${event[cfg.fieldMap.amount]} ${event[cfg.fieldMap.currency] || cfg.defaultCurrency}`);
        console.log(`     Status: ${event[cfg.fieldMap.status]}`);
        console.log(`     Date: ${event[cfg.fieldMap.occurredAt]}`);
        console.log(`     Proof: ${event[cfg.fieldMap.verificationProof] ? '✅ Present' : '❌ Missing'}`);
        console.log('');
      });
      
      // Check routing eligibility
      console.log('🛤️  Routing Analysis:');
      const routingPriority = process.env.PAYMENT_ROUTING_PRIORITY?.split(',') || ['paypal', 'bank_transfer', 'crypto'];
      console.log(`  Priority: ${routingPriority.join(' → ')}`);
      
      // Check PayPal eligibility
      const paypalEnabled = process.env.PAYPAL_PPP2_APPROVED === 'true' && process.env.PAYPAL_PPP2_ENABLE_SEND === 'true';
      console.log(`  PayPal: ${paypalEnabled ? '✅ Enabled' : '❌ Disabled'}`);
      
      // Check bank wire eligibility
      const bankWireEnabled = process.env.BANK_WIRE_ENABLE === 'true' && process.env.OWNER_WISE_API_TOKEN;
      console.log(`  Bank Wire: ${bankWireEnabled ? '✅ Enabled' : '❌ Disabled'}`);
      
      // Check crypto eligibility
      const cryptoEnabled = process.env.OWNER_CRYPTO_ADDRESS;
      console.log(`  Crypto: ${cryptoEnabled ? '✅ Enabled' : '❌ Disabled'}`);
      
    } else {
      console.log('⚠️  No ready-for-settlement events found');
    }
    
    console.log('\n✅ Health check completed successfully');
    console.log('📊 Ready to proceed with live payout execution');
    
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    process.exit(1);
  }
}

// Run health check
healthCheck().catch(console.error);