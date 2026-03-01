#!/usr/bin/env node
/**
 * Deployment script that bypasses git lock issues
 * by working in a temporary clone of the repository
 */

import { execSync } from 'child_process';
import { mkdirSync, rmSync, cpSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const REPO_URL = 'https://github.com/younestsouli2019-bot/rwrld/';
const TEMP_DIR = join(tmpdir(), 'deploy-temp-' + Date.now());
const SITE_SOURCE = 'C:\\Users\\Dell\\Downloads\\Nouveau dossier (3)\\site';

console.log('🚀 Starting deployment process...');

try {
  // Create temporary directory
  console.log('📁 Creating temporary directory...');
  mkdirSync(TEMP_DIR, { recursive: true });
  
  // Clone repository to temporary location
  console.log('📦 Cloning repository...');
  execSync(`git clone "${REPO_URL}" "${TEMP_DIR}"`, { stdio: 'inherit' });
  
  // Copy site files to temporary clone
  console.log('📝 Copying site files...');
  cpSync(SITE_SOURCE, join(TEMP_DIR, 'site'), { recursive: true, force: true });
  
  // Change to temporary directory
  process.chdir(TEMP_DIR);
  
  // Stage site files
  console.log('📋 Staging changes...');
  execSync('git add site/', { stdio: 'inherit' });
  
  // Commit changes
  console.log('💾 Committing changes...');
  execSync('git commit -m "Update website content for deployment"', { stdio: 'inherit' });
  
  // Push to main branch
  console.log('🚀 Pushing to GitHub...');
  execSync('git push origin main', { stdio: 'inherit' });
  
  console.log('✅ Deployment completed successfully!');
  console.log('🌐 Website will be deployed automatically via GitHub Actions');
  
} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  process.exit(1);
} finally {
  // Clean up temporary directory
  try {
    console.log('🧹 Cleaning up...');
    process.chdir('C:\\'); // Change to root to avoid lock issues
    rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch (cleanupError) {
    console.warn('⚠️  Cleanup warning:', cleanupError.message);
  }
}

console.log('🎉 All done! Check GitHub Actions for deployment progress.');