#!/usr/bin/env node

/**
 * Emergency Payment Audit Script - Simplified Version
 * 
 * This script performs a quick audit to check for unauthorized payment files
 */

import fs from 'node:fs';
import path from 'node:path';

console.log("🚨 EMERGENCY PAYMENT AUDIT - QUICK CHECK");
console.log("=" .repeat(60));

// Check for the unauthorized Barclays IBAN in common locations
const unauthorizedIban = "GB66BARC20958787123933";
const suspiciousPatterns = [
  "Barclays",
  "Leicester", 
  "231486", // Sort code
  "15924956", // Account number
  "BARCGB22XXX" // SWIFT
];

let issuesFound = 0;

// Check current directory for any CSV/PDF files
const files = fs.readdirSync('.').filter(file => 
  file.endsWith('.csv') || file.endsWith('.pdf') || file.endsWith('.json')
);

console.log(`Found ${files.length} potential payment files in current directory`);

for (const file of files) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    
    // Check for unauthorized IBAN
    if (content.includes(unauthorizedIban)) {
      console.log(`🚨 CRITICAL: Unauthorized Barclays IBAN found in ${file}`);
      issuesFound++;
    }
    
    // Check for other suspicious patterns
    for (const pattern of suspiciousPatterns) {
      if (content.includes(pattern)) {
        console.log(`⚠️  WARNING: Suspicious pattern "${pattern}" found in ${file}`);
        issuesFound++;
      }
    }
    
  } catch (error) {
    console.log(`⚠️  Could not read ${file}: ${error.message}`);
  }
}

// Check exports directory
if (fs.existsSync('exports')) {
  const exportFiles = fs.readdirSync('exports').filter(file => 
    file.endsWith('.csv') || file.endsWith('.pdf')
  );
  
  console.log(`\nChecking exports directory: ${exportFiles.length} files`);
  
  for (const file of exportFiles) {
    const filePath = path.join('exports', file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      if (content.includes(unauthorizedIban)) {
        console.log(`🚨 CRITICAL: Unauthorized Barclays IBAN found in exports/${file}`);
        issuesFound++;
      }
      
    } catch (error) {
      console.log(`⚠️  Could not read exports/${file}`);
    }
  }
}

// Check environment variables
console.log("\n🔍 Checking environment variables...");
const envVars = ['OWNER_BENEFICIARY_NAME', 'OWNER_PAYPAL_EMAIL'];
for (const varName of envVars) {
  if (process.env[varName]) {
    console.log(`✅ ${varName}: ${process.env[varName]}`);
  } else {
    console.log(`🚨 MISSING: ${varName}`);
    issuesFound++;
  }
}

console.log("\n" + "=" .repeat(60));

if (issuesFound > 0) {
  console.log(`🚨 ${issuesFound} ISSUES FOUND - IMMEDIATE ACTION REQUIRED`);
  console.log("1. Set EMERGENCY_PAYMENT_LOCK=true in .env");
  console.log("2. Contact Younes Tsouli: younestsouli2019@gmail.com");
  console.log("3. Do not process any payments until resolved");
} else {
  console.log("✅ NO IMMEDIATE ISSUES DETECTED IN QUICK SCAN");
  console.log("For full audit, manually check all payment directories");
}

console.log("=" .repeat(60));