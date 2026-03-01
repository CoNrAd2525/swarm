#!/usr/bin/env node

/**
 * Emergency Payment Audit Script
 * 
 * This script performs a comprehensive audit of all payment files and configurations
 * to ensure no unauthorized payments have been made to non-owner accounts.
 * 
 * CRITICAL: Run this immediately if you suspect unauthorized payment activity.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

const OWNER_NAME = process.env.OWNER_BENEFICIARY_NAME;
const AUTHORIZED_IBANS = JSON.parse(process.env.OWNER_BENEFICIARY_ALLOWLIST_JSON || "[]");
const OWNER_EMAIL = process.env.OWNER_PAYPAL_EMAIL;

console.log("🚨 EMERGENCY PAYMENT AUDIT STARTED");
console.log("=" .repeat(60));
console.log(`Owner Name: ${OWNER_NAME}`);
console.log(`Owner Email: ${OWNER_EMAIL}`);
console.log(`Authorized IBANs: ${AUTHORIZED_IBANS.join(', ')}`);
console.log("=" .repeat(60));

const auditResults = {
  totalFilesScanned: 0,
  unauthorizedPaymentsFound: 0,
  criticalIssues: [],
  warnings: [],
  cleanFiles: []
};

/**
 * Search for payment files across the project
 */
async function findPaymentFiles() {
  const paymentExtensions = ['.csv', '.pdf', '.json', '.xml'];
  const paymentDirectories = [
    'exports', 'settlements', 'payments', 'payouts', 'transactions', 'data'
  ];
  
  const files = [];
  
  // Search in common payment directories
  for (const dir of paymentDirectories) {
    const dirPath = path.join(PROJECT_ROOT, dir);
    if (fs.existsSync(dirPath)) {
      const dirFiles = fs.readdirSync(dirPath, { recursive: true })
        .filter(file => paymentExtensions.some(ext => file.endsWith(ext)))
        .map(file => path.join(dirPath, file));
      files.push(...dirFiles);
    }
  }
  
  // Search entire project for suspicious files (simplified to avoid recursion)
  const allFiles = [];
  const searchDirs = ['.', 'exports', 'settlements', 'payments', 'payouts', 'transactions', 'data', 'reports'];
  
  for (const dir of searchDirs) {
    const dirPath = path.join(PROJECT_ROOT, dir);
    if (fs.existsSync(dirPath)) {
      try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (paymentExtensions.some(ext => file.endsWith(ext))) {
            allFiles.push(path.join(dirPath, file));
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }
  }
  
  // Combine and deduplicate
  const uniqueFiles = [...new Set([...files, ...allFiles])];
  return uniqueFiles;
}

/**
 * Analyze a payment file for unauthorized transactions
 */
async function analyzePaymentFile(filePath) {
  auditResults.totalFilesScanned++;
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    
    console.log(`\n📁 Analyzing: ${fileName}`);
    
    // Check for unauthorized bank accounts
    const unauthorizedPatterns = [
      /GB66BARC20958787123933/i,  // The unauthorized Barclays account
      /Barclays.*Leicester/i,
      /231486.*15924956/i,  // Barclays sort code and account
      /Beneficiary Name.*Owner(?!\s+Tsouli)/i,  // "Owner" but not "Owner Tsouli"
      /Recipient Name.*Owner(?!\s+Tsouli)/i,
      /younestsouli2019@gmail.com(?!\s*$)/i  // Email with extra characters
    ];
    
    let fileHasIssues = false;
    
    for (const pattern of unauthorizedPatterns) {
      if (pattern.test(content)) {
        fileHasIssues = true;
        auditResults.unauthorizedPaymentsFound++;
        const issue = `🚨 CRITICAL: Unauthorized pattern found in ${fileName}: ${pattern.toString()}`;
        auditResults.criticalIssues.push(issue);
        console.log(issue);
      }
    }
    
    // Check for correct owner details
    const correctPatterns = [
      new RegExp(OWNER_NAME, 'i'),
      new RegExp(OWNER_EMAIL, 'i'),
      ...AUTHORIZED_IBANS.map(iban => new RegExp(iban, 'i'))
    ];
    
    let hasCorrectDetails = false;
    for (const pattern of correctPatterns) {
      if (pattern.test(content)) {
        hasCorrectDetails = true;
        break;
      }
    }
    
    if (!hasCorrectDetails && !fileHasIssues) {
      auditResults.warnings.push(`⚠️  WARNING: ${fileName} contains no owner details - verify manually`);
      console.log(`⚠️  WARNING: ${fileName} contains no owner details - verify manually`);
    }
    
    if (!fileHasIssues && hasCorrectDetails) {
      auditResults.cleanFiles.push(fileName);
      console.log(`✅ CLEAN: ${fileName} appears to contain only authorized owner details`);
    }
    
  } catch (error) {
    console.log(`❌ ERROR: Could not read ${filePath}: ${error.message}`);
  }
}

/**
 * Check environment variables for security issues
 */
async function auditEnvironmentVariables() {
  console.log("\n🔍 Auditing Environment Variables...");
  
  const requiredVars = [
    'OWNER_BENEFICIARY_NAME',
    'OWNER_PAYPAL_EMAIL',
    'OWNER_BENEFICIARY_ALLOWLIST_JSON',
    'OWNER_WISE_RECIPIENT_NAME',
    'OWNER_WISE_EMAIL',
    'OWNER_GOOGLEPAY_RECIPIENT_NAME',
    'OWNER_GOOGLEPAY_PHONE'
  ];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      auditResults.criticalIssues.push(`🚨 CRITICAL: Missing environment variable: ${varName}`);
      console.log(`🚨 CRITICAL: Missing environment variable: ${varName}`);
    } else {
      console.log(`✅ ${varName}: ${process.env[varName]}`);
    }
  }
  
  // Check for suspicious patterns in env vars
  const envContent = Object.entries(process.env)
    .filter(([key]) => key.includes('OWNER') || key.includes('BANK') || key.includes('IBAN'))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  if (/GB66BARC20958787123933/i.test(envContent)) {
    auditResults.criticalIssues.push("🚨 CRITICAL: Unauthorized Barclays IBAN found in environment variables!");
    console.log("🚨 CRITICAL: Unauthorized Barclays IBAN found in environment variables!");
  }
}

/**
 * Generate final audit report
 */
function generateAuditReport() {
  console.log("\n" + "=" .repeat(60));
  console.log("📊 EMERGENCY PAYMENT AUDIT REPORT");
  console.log("=" .repeat(60));
  
  console.log(`\nTotal files scanned: ${auditResults.totalFilesScanned}`);
  console.log(`Unauthorized payments found: ${auditResults.unauthorizedPaymentsFound}`);
  console.log(`Clean files: ${auditResults.cleanFiles.length}`);
  
  if (auditResults.criticalIssues.length > 0) {
    console.log("\n🚨 CRITICAL ISSUES FOUND:");
    auditResults.criticalIssues.forEach(issue => console.log(issue));
  }
  
  if (auditResults.warnings.length > 0) {
    console.log("\n⚠️  WARNINGS:");
    auditResults.warnings.forEach(warning => console.log(warning));
  }
  
  if (auditResults.cleanFiles.length > 0) {
    console.log("\n✅ CLEAN FILES (verified safe):");
    auditResults.cleanFiles.forEach(file => console.log(file));
  }
  
  console.log("\n" + "=" .repeat(60));
  
  if (auditResults.unauthorizedPaymentsFound > 0) {
    console.log("🚨 SECURITY BREACH DETECTED!");
    console.log("IMMEDIATE ACTION REQUIRED:");
    console.log("1. Set EMERGENCY_PAYMENT_LOCK=true in .env");
    console.log("2. Contact Younes Tsouli immediately at younestsouli2019@gmail.com");
    console.log("3. Do not process any payments until issue is resolved");
    process.exit(1);
  } else {
    console.log("✅ NO UNAUTHORIZED PAYMENTS DETECTED");
    console.log("System appears secure, but continue monitoring");
  }
  
  console.log("=" .repeat(60));
}

/**
 * Main audit function
 */
async function runEmergencyAudit() {
  try {
    await auditEnvironmentVariables();
    const paymentFiles = await findPaymentFiles();
    
    if (paymentFiles.length === 0) {
      console.log("✅ No payment files found to audit");
    } else {
      console.log(`Found ${paymentFiles.length} payment files to audit`);
      for (const file of paymentFiles) {
        await analyzePaymentFile(file);
      }
    }
    
    generateAuditReport();
    
  } catch (error) {
    console.error("🚨 AUDIT FAILED:", error.message);
    process.exit(1);
  }
}

// Run the emergency audit
runEmergencyAudit();