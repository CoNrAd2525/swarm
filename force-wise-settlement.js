#!/usr/bin/env node

/**
 * Force Wise route settlement processing
 * This script forces the system to process settlements via Wise route
 * instead of waiting for Payoneer PRQ links to be approved
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Force Wise route environment
process.env.FORCE_BANK_WIRE = 'true';
process.env.BANK_WIRE_ENABLE = 'true';
process.env.BANK_WIRE_PROVIDER = 'WISE';
process.env.WISE_ENABLE = 'true';
process.env.SWARM_LIVE = 'true';

// Import the settlement health check to process CSV settlements
const healthCheckPath = resolve('./reports/settlement_health_check_csv.js');

try {
  console.log('🚀 Forcing Wise route settlement processing...');
  console.log('Environment set:');
  console.log('  FORCE_BANK_WIRE: true');
  console.log('  BANK_WIRE_ENABLE: true');
  console.log('  BANK_WIRE_PROVIDER: WISE');
  console.log('  WISE_ENABLE: true');
  console.log('  SWARM_LIVE: true');
  
  // Execute the health check which will process settlements
  import(healthCheckPath).then(module => {
    console.log('✅ Wise route settlement processing initiated');
  }).catch(err => {
    console.error('❌ Error processing Wise settlements:', err.message);
  });
  
} catch (error) {
  console.error('❌ Failed to force Wise settlements:', error.message);
}