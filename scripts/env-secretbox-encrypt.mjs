import fs from "node:fs";
import path from "node:path";
import nacl from "tweetnacl";

function decode(b64) {
  try {
    return Buffer.from(String(b64), "base64");
  } catch {
    return Buffer.alloc(0);
  }
}

function buildConfig() {
  const cfg = {
    SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
    SMTP_PORT: process.env.SMTP_PORT || "465",
    SMTP_SECURE: process.env.SMTP_SECURE || "true",
    SMTP_USER: process.env.SMTP_USER || "",
    SMTP_PASS: process.env.SMTP_PASS || "",
    SMTP_FROM: process.env.SMTP_FROM || process.env.SMTP_USER || "",
    SMTP_TEST_TO: process.env.SMTP_TEST_TO || process.env.SMTP_TO || "",
  };
  return cfg;
}

function main() {
  const keyRaw = String(process.env.ENVBOX_KEY || "").trim();
  if (!keyRaw) {
    process.stderr.write("missing_envbox_key\n");
    process.exit(2);
  }
  const key = decode(keyRaw);
  if (key.length !== nacl.secretbox.keyLength) {
    process.stderr.write("bad_key_length\n");
    process.exit(2);
  }
  const cfg = buildConfig();
  const payload = Buffer.from(JSON.stringify(cfg));
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(payload, nonce, new Uint8Array(key));
  const out = {
    nonce: Buffer.from(nonce).toString("base64"),
    box: Buffer.from(box).toString("base64"),
  };
  const dir = path.resolve("data", "secrets");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, ".env.enc.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  process.stdout.write(JSON.stringify({ ok: true, file, keys: Object.keys(cfg) }) + "\n");
}

main();
