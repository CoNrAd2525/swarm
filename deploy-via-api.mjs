#!/usr/bin/env node
/**
 * Deploy website using GitHub API to bypass git lock issues
 * This script creates a commit directly via GitHub API
 */

import { readFileSync } from "fs";
import { join } from "path";

const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || "").trim();
const REPO_OWNER = "younestsouli2019-bot";
const REPO_NAME = "rwrld";
const BRANCH = "main";

const API_BASE = "https://api.github.com";

async function githubApi(endpoint, options = {}) {
	if (!GITHUB_TOKEN) throw new Error("Missing GITHUB_TOKEN");
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `token ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Node.js",
      ...options.headers
    },
    ...options
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${text}`);
  }
  
  return response.json();
}

async function getFileSha(path) {
  try {
    const data = await githubApi(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`);
    return data.sha;
  } catch (error) {
    if (error.message.includes("404")) {
      return null; // File doesn't exist yet
    }
    throw error;
  }
}

async function updateFile(path, content, message) {
  const sha = await getFileSha(path);
  const encodedContent = Buffer.from(content).toString('base64');
  
  const body = {
    message,
    content: encodedContent,
    branch: BRANCH
  };
  
  if (sha) {
    body.sha = sha;
  }
  
  return githubApi(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function deployWebsite() {
  console.log("🚀 Starting website deployment via GitHub API...");
  
  try {
    // Read the updated index.html file
    const indexPath = join(process.cwd(), "rank", "output", "index.html");
    const content = readFileSync(indexPath, "utf8");
    
    console.log("📄 Updating index.html...");
    
    // Update the file via GitHub API
    const result = await updateFile(
      "rank/output/index.html",
      content,
      "Update website content for deployment"
    );
    
    console.log("✅ File updated successfully!");
    console.log("📊 Commit SHA:", result.commit.sha);
    console.log("🌐 Website will be deployed automatically via GitHub Actions");
    
    // Check if GitHub Actions workflow will be triggered
    console.log("\n🔍 Checking GitHub Actions status...");
    console.log("The deployment should be triggered automatically within a few minutes.");
    console.log("Check the Actions tab in your GitHub repository for progress.");
    
  } catch (error) {
    console.error("❌ Deployment failed:", error.message);
    process.exit(1);
  }
}

// Run the deployment
if (import.meta.url === `file://${process.argv[1]}`) {
  deployWebsite().catch(console.error);
}
