import { google } from "googleapis";
import fs from "fs/promises";
import path from "path";

const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
const GOOGLE_REDIRECT_URI = String(process.env.GOOGLE_REDIRECT_URI || "").trim();

function listScopes() {
  const raw = String(process.env.GOOGLE_SCOPES || "").trim();
  if (!raw) {
    return [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

class GoogleAuthManager {
  constructor() {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      throw new Error("Missing Google OAuth env (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI)");
    }
    this.oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI,
    );
    this.tokens = null;
    this.auth = this.oauth2Client;
    this.isServiceAccount = false;
  }

  async authenticate() {
    console.log('🔐 Starting Google OAuth authentication...');
    
    // Check if we have stored tokens
    const tokenPath = path.join(process.cwd(), '.google-tokens.json');
    try {
      const tokenData = await fs.readFile(tokenPath, 'utf-8');
      this.tokens = JSON.parse(tokenData);
      this.oauth2Client.setCredentials(this.tokens);
      this.auth = this.oauth2Client;
      this.isServiceAccount = false;
      console.log('✅ Using stored Google tokens');
      return true;
    } catch {
      console.log('🆕 No stored tokens found, need to authenticate');
    }

    // Generate auth URL
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: listScopes()
    });

    console.log('📋 Google Auth URL:', authUrl);
    console.log('⚠️  Please visit this URL to authorize the application');
    
    // For now, let's try to use any existing tokens or create a simple auth flow
    return false;
  }

  async getGmailService() {
    if (!this.auth) {
      throw new Error('Not authenticated. Please authenticate first.');
    }
    return google.gmail({ version: 'v1', auth: this.auth });
  }

  async getSheetsService() {
    if (!this.auth) {
      throw new Error('Not authenticated. Please authenticate first.');
    }
    return google.sheets({ version: 'v4', auth: this.auth });
  }

  async getDriveService() {
    if (!this.auth) {
      throw new Error('Not authenticated. Please authenticate first.');
    }
    return google.drive({ version: 'v3', auth: this.auth });
  }

  async storeTokens(tokens) {
    this.tokens = tokens;
    this.oauth2Client.setCredentials(tokens);
    this.auth = this.oauth2Client;
    this.isServiceAccount = false;
    const tokenPath = path.join(process.cwd(), '.google-tokens.json');
    await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2));
    console.log('💾 Tokens stored successfully');
  }

  // Alternative: Use service account if available
  async tryServiceAccountAuth() {
    const serviceAccountPath = path.join(process.cwd(), 'service-account-key.json');
    try {
      const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, 'utf-8'));
      this.auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: listScopes(),
      });
      this.tokens = null;
      this.isServiceAccount = true;
      console.log('✅ Service account authentication successful');
      return true;
    } catch {
      console.log('Service account not found or invalid');
      return false;
    }
  }
}

export default GoogleAuthManager;
