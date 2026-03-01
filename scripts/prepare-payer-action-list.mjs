import fs from "node:fs";
import path from "node:path";
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function safeJsonRead(file) {
  try {
    if (!fs.existsSync(file)) return null;
    let txt = fs.readFileSync(file, "utf8");
    if (txt.includes("<<<<<<<") || txt.includes("=======") || txt.includes(">>>>>>>")) {
      const lines = txt.split(/\r?\n/).filter((ln) => {
        return !(ln.startsWith("<<<<<<<") || ln.startsWith("=======") || ln.startsWith(">>>>>>>"));
      });
      txt = lines.join("\n");
    }
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
function extractTransactions(file) {
  try {
    if (!fs.existsSync(file)) return [];
    let txt = fs.readFileSync(file, "utf8");
    txt = txt.replace(/^\s*<<<<<<<.*$/mg, "").replace(/^\s*=======\s*$/mg, "").replace(/^\s*>>>>>>>.*$/mg, "");
    const idx = txt.indexOf("\"transactions\"");
    if (idx < 0) return [];
    const openIdx = txt.indexOf("[", idx);
    if (openIdx < 0) return [];
    let depth = 0;
    let inString = false;
    let esc = false;
    let endIdx = -1;
    for (let i = openIdx; i < txt.length; i++) {
      const ch = txt[i];
      if (inString) {
        if (esc) {
          esc = false;
        } else if (ch === "\\\\") {
          esc = true;
        } else if (ch === "\"") {
          inString = false;
        }
      } else {
        if (ch === "\"") inString = true;
        else if (ch === "[") depth++;
        else if (ch === "]") {
          depth--;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        }
      }
    }
    if (endIdx < 0) return [];
    const arrStr = txt.slice(openIdx, endIdx + 1);
    const arr = JSON.parse(arrStr);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function csvEscape(s) {
  const v = String(s == null ? "" : s);
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
function writeCsv(file, rows) {
  ensureDir(path.dirname(file));
  const headers = [
    "id",
    "timestamp",
    "channel",
    "amount",
    "status",
    "destination",
    "instruction",
    "filePath",
    "batchId",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.timestamp),
        csvEscape(r.channel),
        csvEscape(r.amount),
        csvEscape(r.status),
        csvEscape(r.destination),
        csvEscape(r.instruction),
        csvEscape(r.filePath),
        csvEscape(r.batchId),
      ].join(","),
    );
  }
  fs.writeFileSync(file, lines.join("\n"), "utf8");
}
function main() {
  const ledgerPath = path.resolve("data/financial/settlement_ledger.json");
  const outDir = path.resolve("dist_rwc", "egress");
  ensureDir(outDir);
  const json = safeJsonRead(ledgerPath) || {};
  let txs = Array.isArray(json.transactions) ? json.transactions : [];
  if (!txs.length) {
    txs = extractTransactions(ledgerPath);
  }
  const rows = [];
  for (const t of txs) {
    const d = t.details || {};
    const actionable =
      t.status === "WAITING_UPLOAD" ||
      t.status === "INVOICES_GENERATED" ||
      t.status === "INSTRUCTIONS_READY" ||
      t.status === "IN_TRANSIT" ||
      t.status === "prepared";
    if (!actionable) continue;
    rows.push({
      id: t.id,
      timestamp: t.timestamp,
      channel: t.channel,
      amount: t.amount,
      status: t.status,
      destination: d.destination || "",
      instruction: d.instruction || d.status || "",
      filePath: d.filePath || "",
      batchId: d.batchId || "",
    });
  }
  const jsonFile = path.join(outDir, "payer_actions.json");
  const csvFile = path.join(outDir, "payer_actions.csv");
  fs.writeFileSync(jsonFile, JSON.stringify(rows, null, 2), "utf8");
  writeCsv(csvFile, rows);
  console.log(
    JSON.stringify({
      count: rows.length,
      json: jsonFile,
      csv: csvFile,
    }),
  );
}
main();
