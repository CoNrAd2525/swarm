#!/usr/bin/env node

/**
 * GooglePay Owner Settlement Script
 * Generates GooglePay batch transfer files for owner payouts
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

function generateGooglePayCSV(batchId, items) {
  const headers = "Recipient Name,Phone Number,Amount,Currency,Reference,Note";
  const recipientName = process.env.OWNER_GOOGLEPAY_RECIPIENT_NAME || "Owner Name";
  const phoneNumber = process.env.OWNER_GOOGLEPAY_PHONE || "+1234567890";
  
  const rows = items.map(item => 
    `${recipientName},${phoneNumber},${item.amount},${item.currency},${item.id},Owner payout ${item.id}`
  );
  
  return [headers, ...rows].join("\n");
}

async function main() {
  const batchId = process.argv[2] || `googlepay_${Date.now()}`;
  const items = JSON.parse(process.argv[3] || "[]");
  
  if (!items.length) {
    console.error("❌ No items provided");
    process.exit(1);
  }
  
  const csv = generateGooglePayCSV(batchId, items);
  const filename = `${batchId}.csv`;
  const exportsDir = path.resolve(process.cwd(), "exports");
  
  await fs.promises.mkdir(exportsDir, { recursive: true });
  await fs.promises.writeFile(path.join(exportsDir, filename), csv);
  
  console.log(JSON.stringify({
    ok: true,
    filename,
    rail: "googlepay",
    items: items.length,
    totalAmount: items.reduce((sum, item) => sum + item.amount, 0)
  }));
}

main().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});