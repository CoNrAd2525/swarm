import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import "dotenv/config";

function readCsv(p) {
	if (!fs.existsSync(p)) return [];
	const content = fs.readFileSync(p, "utf8");
	const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
	const header = lines[0].split(",").map((h) => h.trim());
	return lines.slice(1).map((line) => {
		const cols = line.split(",").map((c) => c.trim());
		const obj = {};
		header.forEach((h, i) => {
			obj[h] = cols[i] || "";
		});
		return obj;
	});
}

// Ensure env var is set for the subprocess
process.env.OWNER_CRYPTO_ADDRESS = process.env.TRUST_WALLET_ADDRESS || process.env.OWNER_CRYPTO_ADDRESS;

const csvPath = path.resolve("archive", "owner_crypto_requests.csv");
const rows = readCsv(csvPath);

if (rows.length === 0) {
  console.log("No crypto requests found in archive/owner_crypto_requests.csv");
  process.exit(0);
}

const items = rows.map(r => ({
  id: r.reference,
  amount: Number(r.amount_usd),
  currency: "USD"
}));

console.log(`Processing ${items.length} real crypto requests...`);

const args = ["scripts/settle-owner-crypto.mjs", `crypto_batch_${Date.now()}`, JSON.stringify(items)];
// Pass current env to child process
const res = spawnSync("node", args, { stdio: "inherit", env: process.env });

if (res.status !== 0) {
    console.error("Crypto settlement generation failed.");
    process.exit(res.status);
}
