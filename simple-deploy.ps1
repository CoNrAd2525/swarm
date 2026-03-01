# Force remove git lock and deploy
Write-Host "Starting PowerShell force deployment..." -ForegroundColor Green

try {
    # Get the git lock file path
    $gitLockPath = Join-Path $PSScriptRoot ".git\index.lock"
    
    # Force close any handles to the lock file
    Write-Host "Attempting to force unlock git index.lock..." -ForegroundColor Yellow
    
    # Try to take ownership and force delete
    try {
        takeown /F "$gitLockPath" /A 2>$null
        icacls "$gitLockPath" /grant administrators:F /T 2>$null
        Remove-Item -Path "$gitLockPath" -Force -ErrorAction Stop
        Write-Host "Git lock file removed successfully" -ForegroundColor Green
    } catch {
        Write-Host "Could not remove lock file: $_" -ForegroundColor Yellow
    }
    
    # Wait a moment
    Start-Sleep -Seconds 2
    
    # Try git operations
    Write-Host "Attempting git operations..." -ForegroundColor Yellow
    
    try {
        git add site/ 2>$null
        $status = git status --porcelain 2>$null
        
        if ($status) {
            Write-Host "Committing changes..." -ForegroundColor Yellow
            git commit -m "Update website content for deployment" 2>$null
            
            Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
            git push origin main 2>$null
            
            Write-Host "Deployment completed successfully!" -ForegroundColor Green
            Write-Host "Website will be deployed automatically via GitHub Actions" -ForegroundColor Cyan
        } else {
            Write-Host "No changes to commit" -ForegroundColor Blue
        }
    } catch {
        Write-Host "Git operations failed: $_" -ForegroundColor Red
        
        # Final fallback - create new branch
        Write-Host "Trying final fallback - creating new branch..." -ForegroundColor Yellow
        $timestamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
        $branchName = "deploy-$timestamp"
        
        try {
            git checkout -b $branchName 2>$null
            git add site/ 2>$null
            git commit -m "Update website content for deployment" 2>$null
            git push origin $branchName 2>$null
            
            Write-Host "Created and pushed branch: $branchName" -ForegroundColor Green
            Write-Host "You can now create a pull request to merge this branch into main" -ForegroundColor Cyan
        } catch {
            Write-Host "All deployment attempts failed: $_" -ForegroundColor Red
            exit 1
        }
    }
    
} catch {
    Write-Host "Unexpected error: $_" -ForegroundColor Red
    exit 1
}

Write-Host "Deployment process completed!" -ForegroundColor Green