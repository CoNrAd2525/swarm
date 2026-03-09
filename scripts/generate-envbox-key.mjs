import fs from "node:fs";
import path from "node:path";
import nacl from "tweetnacl";

function readFlag(name) {
  const idx = process.argv.indexOf("--" + name);
  return idx >= 0 ? (process.argv[idx + 1] ?? "") : "";
}

function hasFlag(name) {
  return process.argv.includes("--" + name);
}

const noEcho = process.env.NO_ECHO === "true" || hasFlag("no-echo");
const writeDotenv = process.env.WRITE_DOTENV === "true" || hasFlag("write-dotenv");

const key = nacl.randomBytes(nacl.secretbox.keyLength);
const keyBase64 = Buffer.from(key).toString("base64");

if (!noEcho) {
  console.log("🗝️  Generated ENVBOX_KEY:", keyBase64);
  console.log("📋 Save this key to your .env file as ENVBOX_KEY=<the_key_above>");
}

// Prefer SMTP_* from environment, fallback to safe defaults/placeholders
const smtpConfig = {
  SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: process.env.SMTP_PORT || "587",
  SMTP_SECURE: process.env.SMTP_SECURE || "false",
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || process.env.SMTP_USER || "",
  SMTP_TEST_TO: process.env.SMTP_TEST_TO || process.env.SMTP_TO || ""
};

if (!smtpConfig.SMTP_USER || !smtpConfig.SMTP_PASS) {
  console.warn("⚠️  SMTP_USER/SMTP_PASS not provided in env. Encrypted file will contain empty credentials.");
}

const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
const message = Buffer.from(JSON.stringify(smtpConfig));
const box = nacl.secretbox(message, nonce, key);

const encryptedData = {
  nonce: Buffer.from(nonce).toString("base64"),
  box: Buffer.from(box).toString("base64")
};

const secretsDir = path.resolve("data", "secrets");
fs.mkdirSync(secretsDir, { recursive: true });
const encryptedFile = path.join(secretsDir, ".env.enc.json");
fs.writeFileSync(encryptedFile, JSON.stringify(encryptedData, null, 2));
console.log("🔐 Encrypted SMTP credentials saved to:", encryptedFile);

if (writeDotenv) {
  const envPath = path.resolve(".env");
  let curr = "";
  try {
    curr = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  } catch {}
  const lines = curr.split(/\r?\n/).filter((l) => !/^ENVBOX_KEY=/.test(l));
  lines.push(`ENVBOX_KEY=${keyBase64}`);
  fs.writeFileSync(envPath, lines.join("\n"));
  if (!noEcho) {
    console.log("✅ Wrote ENVBOX_KEY to .env");
  } else {
    console.log("✅ .env updated with ENVBOX_KEY");
  }
}

console.log("📧 To load decrypted env at runtime: node -r dotenv/config -r ./scripts/env-secretbox-load.mjs <your-script>.mjs");
