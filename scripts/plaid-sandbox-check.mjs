import fs from "node:fs";
import path from "node:path";
function readEnv(file) {
  try {
    const m = {};
    if (!fs.existsSync(file)) return m;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k) m[k] = v;
      }
    }
    return m;
  } catch {
    return {};
  }
}
function main() {
  const envPath = path.resolve(".env");
  const env = readEnv(envPath);
  const clientId = env.PLAID_Client_ID || process.env.PLAID_Client_ID || "";
  const secret = env.PLAID_SANDBOX_SECRET || process.env.PLAID_SANDBOX_SECRET || "";
  const report = {
    client_id_present: Boolean(clientId),
    secret_present: Boolean(secret),
    environment: "sandbox",
    next_steps: [
      "Use Link token create (sandbox) to initialize account linking",
      "Set products to payments for ACH and enable institutions sandbox",
      "Simulate transfers using /transfer endpoints and verify webhook flow",
    ],
  };
  console.log(JSON.stringify(report, null, 2));
}
main();
