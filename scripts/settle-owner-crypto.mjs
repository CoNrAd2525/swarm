#!/usr/bin/env node

/**
 * CRYPTO Owner Settlement Script
 * Generates CRYPTO batch transfer files for owner payouts
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

function generateCryptoCSV(batchId, items) {
  const headers = "Token,Chain,Receiver Address,Amount,Currency,Reference,Note";
  const token = process.env.CRYPTO_TOKEN || "USDT";
  const chain = process.env.CRYPTO_CHAIN || "ERC20";
  const receiver = process.env.OWNER_CRYPTO_ADDRESS || process.env.OWNER_TRUST_WALLET || "";
  
  if (!receiver) {
    throw new Error("Missing owner crypto address configuration in environment variables (OWNER_CRYPTO_ADDRESS or OWNER_TRUST_WALLET)");
  }
  
  const rows = items.map(item => 
    `${token},${chain},${receiver},${item.amount},${item.currency},${item.id},Owner payout ${item.id}`
  );
  
  return [headers, ...rows].join("\n");
}

async function main() {
  const batchId = process.argv[2] || `crypto_${Date.now()}`;
  const items = JSON.parse(process.argv[3] || "[]");
  
  if (!items.length) {
    console.error("❌ No items provided");
    process.exit(1);
  }
  
  const csv = generateCryptoCSV(batchId, items);
  const filename = `${batchId}.csv`;
  const exportsDir = path.resolve(process.cwd(), "exports");
  
  await fs.promises.mkdir(exportsDir, { recursive: true });
  await fs.promises.writeFile(path.join(exportsDir, filename), csv);
  
  console.log(JSON.stringify({
    ok: true,
    filename,
    rail: "crypto",
    items: items.length,
    totalAmount: items.reduce((sum, item) => sum + item.amount, 0)
  }));
}

main().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});