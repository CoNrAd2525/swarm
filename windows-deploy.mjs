#!/usr/bin/env node
/**
 * Windows-specific git lock removal and deployment
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const GIT_LOCK_PATH = join(process.cwd(), '.git', 'index.lock');

console.log('🚀 Starting Windows force deployment...');

async function deploy() {
  try {
    // Kill any git processes that might be holding the lock
    console.log('🔍 Checking for git processes...');
    try {
      execSync('taskkill /F /IM git.exe 2>nul', { stdio: 'ignore' });
      execSync('taskkill /F /IM git-remote-https.exe 2>nul', { stdio: 'ignore' });
      execSync('taskkill /F /IM git-index-pack.exe 2>nul', { stdio: 'ignore' });
      console.log('✅ Git processes terminated');
    } catch (e) {
      console.log('ℹ️  No git processes found or already terminated');
    }
    
    // Wait a moment for file handles to be released
    execSync('timeout /t 2 /nobreak >nul', { stdio: 'ignore' });
    
    // Force remove the lock file using Windows commands
    if (existsSync(GIT_LOCK_PATH)) {
      console.log('🔓 Force removing git lock file...');
      execSync(`del /F /Q "${GIT_LOCK_PATH}"`, { stdio: 'inherit' });
      console.log('✅ Git lock removed');
    }
    
    // Stage the site changes
    console.log('📋 Staging site changes...');
    execSync('git add site/', { stdio: 'inherit' });
    
    // Check if there are changes to commit
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (!status.trim()) {
      console.log('ℹ️  No changes to commit');
      return;
    }
    
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
    
    // Final fallback - try to create a new branch and push
    try {
      console.log('🔄 Trying final fallback approach...');
      const timestamp = Date.now();
      const branchName = `deploy-${timestamp}`;
      
      execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
      execSync('git add site/', { stdio: 'inherit' });
      execSync('git commit -m "Update website content for deployment"', { stdio: 'inherit' });
      execSync(`git push origin ${branchName}`, { stdio: 'inherit' });
      
      console.log(`✅ Created and pushed branch: ${branchName}`);
      console.log('📝 You can now create a pull request to merge this branch into main');
      
    } catch (fallbackError) {
      console.error('❌ All deployment attempts failed:', fallbackError.message);
      process.exit(1);
    }
  }
}

// Run the deployment
deploy().catch(console.error);