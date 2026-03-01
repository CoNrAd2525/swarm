import fs from "fs/promises";
import path from "path";
import { stringify } from "csv-stringify/sync";

async function listManifestFiles(dir) {
  const items = await fs.readdir(dir, { withFileTypes: true });
  return items
    .filter((d) => d.isFile() && d.name.endsWith("_manifest.json"))
    .map((d) => path.join(dir, d.name));
}

async function readJson(p) {
  const s = await fs.readFile(p, "utf-8");
  return JSON.parse(s);
}

function ref() {
  return `HIST_SETTLE_${Date.now()}`;
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function writeWiseCsv(outDir, batchId, summary, wiseEmail) {
  await ensureDir(outDir);
  const rows = Object.entries(summary).map(([currency, data]) => ({
    amount: Number(data.total || data).toFixed(2),
    currency: String(currency),
    recipientEmail: wiseEmail,
    reference: ref(),
  }));
  const csv = stringify(rows, {
    header: true,
    columns: ["amount", "currency", "recipientEmail", "reference"],
  });
  const p = path.join(outDir, `${batchId}.csv`);
  await fs.writeFile(p, csv);
  return p;
}

async function writeBankCsv(outDir, batchId, summary, name, iban) {
  await ensureDir(outDir);
  const rows = Object.entries(summary).map(([currency, data]) => ({
    Amount: Number(data.total || data).toFixed(2),
    Currency: String(currency),
    "Recipient Name": name,
    "Recipient IBAN": iban,
    Reference: ref(),
  }));
  const csv = stringify(rows, {
    header: true,
    columns: ["Amount", "Currency", "Recipient Name", "Recipient IBAN", "Reference"],
  });
  const p = path.join(outDir, `${batchId}.csv`);
  await fs.writeFile(p, csv);
  return p;
}

async function main() {
  const payoneerDir = path.join(process.cwd(), "settlements", "payoneer", "historical");
  const wiseDir = path.join(process.cwd(), "settlements", "wise", "historical");
  const bankDir = path.join(process.cwd(), "settlements", "bank_wires", "historical");
  const files = await listManifestFiles(payoneerDir);
  const batches = [];
  for (const f of files) {
    const j = await readJson(f);
    const b = j?.settlement_batch || {};
    const batchId = b.batch_id || path.basename(f).replace("_manifest.json", "");
    const summary = b.summary || {};
    const owner = b.owner_details || {};
    const wiseEmail =
      process.env.OWNER_WISE_EMAIL ||
      process.env.SETTLEMENT_REQUESTOR_EMAIL ||
      owner.wise_email ||
      owner.recipient_email ||
      "younestsouli2019@gmail.com";
    const bankName = process.env.OWNER_BENEFICIARY_NAME || owner.bank_name || owner.recipient_name || "Owner";
    const bankIban =
      process.env.OWNER_BENEFICIARY_IBAN ||
      process.env.OWNER_BENEFICIARY_RIB ||
      owner.bank_iban ||
      "";
    const wiseCsv = await writeWiseCsv(wiseDir, batchId, summary, wiseEmail);
    const bankCsv = await writeBankCsv(bankDir, batchId, summary, bankName, bankIban);
    batches.push({
      batch_id: batchId,
      payoneer_manifest: f,
      wise_csv: wiseCsv,
      bank_csv: bankCsv,
    });
    process.stdout.write(`${JSON.stringify({ ok: true, batch_id: batchId, wise_csv: wiseCsv, bank_csv: bankCsv })}\n`);
  }
  const indexPath = path.join(process.cwd(), "settlements", "payouts_index.json");
  const index = {
    generated_at: new Date().toISOString(),
    batches,
  };
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  process.stdout.write(`${JSON.stringify({ ok: true, index: indexPath, batches: batches.length })}\n`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}

