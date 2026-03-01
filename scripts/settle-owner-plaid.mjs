#!/usr/bin/env node

/**
 * Plaid Owner Settlement Script
 * Generates Plaid batch transfer files for owner payouts
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

function generatePlaidCSV(batchId, items) {
  const headers = "Account ID,Routing Number,Amount,Currency,Reference,Note";
  const accountId = process.env.OWNER_PLAID_ACCOUNT_ID || "";
  const routingNumber = process.env.OWNER_PLAID_ROUTING_NUMBER || "";
  
  if (!accountId || !routingNumber) {
    throw new Error("Missing Plaid account configuration in environment variables (OWNER_PLAID_ACCOUNT_ID, OWNER_PLAID_ROUTING_NUMBER)");
  }
  
  const rows = items.map(item => 
    `${accountId},${routingNumber},${item.amount},${item.currency},${item.id},Owner payout ${item.id}`
  );
  
  return [headers, ...rows].join("\n");
}

async function main() {
  const batchId = process.argv[2] || `plaid_${Date.now()}`;
  const items = JSON.parse(process.argv[3] || "[]");
  
  if (!items.length) {
    console.error("❌ No items provided");
    process.exit(1);
  }
  
  const csv = generatePlaidCSV(batchId, items);
  const filename = `${batchId}.csv`;
  const exportsDir = path.resolve(process.cwd(), "exports");
  
  await fs.promises.mkdir(exportsDir, { recursive: true });
  await fs.promises.writeFile(path.join(exportsDir, filename), csv);
  
  console.log(JSON.stringify({
    ok: true,
    filename,
    rail: "plaid",
    items: items.length,
    totalAmount: items.reduce((sum, item) => sum + item.amount, 0)
  }));
}

main().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});