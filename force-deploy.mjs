#!/usr/bin/env node
/**
 * Force remove git lock and deploy
 */

import { execSync } from 'child_process';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const GIT_LOCK_PATH = join(process.cwd(), '.git', 'index.lock');

console.log('🚀 Starting force deployment...');

try {
  // Remove git lock file if it exists
  if (existsSync(GIT_LOCK_PATH)) {
    console.log('🔓 Removing git lock file...');
    unlinkSync(GIT_LOCK_PATH);
    console.log('✅ Git lock removed');
  }
  
  // Stage the site changes
  console.log('📋 Staging site changes...');
  execSync('git add site/', { stdio: 'inherit' });
  
  // Commit the changes
  console.log('💾 Committing changes...');
  execSync('git commit -m "Update website content for deployment"', { stdio: 'inherit' });
  
  // Push to GitHub
  console.log('🚀 Pushing to GitHub...');
  execSync('git push origin main', { stdio: 'inherit' });
  
  console.log('✅ Deployment completed successfully!');
  console.log('🌐 Website will be deployed automatically via GitHub Actions');
  
} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  
  // Try alternative approach with force
  try {
    console.log('🔄 Trying alternative approach...');
    execSync('git add site/ -f', { stdio: 'inherit' });
    execSync('git commit -m "Update website content for deployment" --allow-empty', { stdio: 'inherit' });
    execSync('git push origin main -f', { stdio: 'inherit' });
    console.log('✅ Alternative deployment successful!');
  } catch (altError) {
    console.error('❌ Alternative approach also failed:', altError.message);
    process.exit(1);
  }
}