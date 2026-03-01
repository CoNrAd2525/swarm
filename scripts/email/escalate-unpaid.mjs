import fs from "node:fs";
import path from "node:path";
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function readJson(file, d = null) {
  try {
    if (!fs.existsSync(file)) return d;
    const txt = fs.readFileSync(file, "utf8");
    return JSON.parse(txt);
  } catch {
    return d;
  }
}
function writeJson(file, obj) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
}
function hoursSince(ts) {
  try {
    const d = new Date(String(ts || ""));
    const ms = Date.now() - d.getTime();
    return ms / (1000 * 60 * 60);
  } catch {
    return Infinity;
  }
}
function tpl(level, name, amount, currency, batchId) {
  const subjects = {
    one: "Reminder: Payment due",
    two: "Second notice: Payment overdue",
    three: "Final notice: Immediate payment required",
  };
  const subject = subjects[level] || "Payment notice";
  const lines = [
    "Hello " + (name || "Billing") + ",",
    "",
    level === "one"
      ? "Please complete payment to avoid delays."
      : level === "two"
      ? "Payment is overdue. Please complete immediately."
      : "Final notice. Immediate payment is required.",
    "",
    "Batch: " + (batchId || ""),
    "Amount: " + (amount || 0) + " " + (currency || "USD"),
    "",
    "Thank you.",
  ];
  return { subject, text: lines.join("\n") };
}
function main() {
  const ledgerFile = path.resolve("data", "financial", "settlement_ledger.json");
  const registryFile = path.resolve("data", "payers", "registry.json");
  const stateFile = path.resolve("data", "ops", "email_escalation_state.json");
  const ledger = readJson(ledgerFile, null);
  const registry = readJson(registryFile, {});
  const state = readJson(stateFile, {});
  const e1 = Number(process.env.ESCALATE_1_HOURS || "24");
  const e2 = Number(process.env.ESCALATE_2_HOURS || "72");
  const e3 = Number(process.env.ESCALATE_3_HOURS || "168");
  const rows = Array.isArray(ledger?.transactions) ? ledger.transactions : [];
  const pending = rows.filter((t) => {
    const s = String(t.status || "").toUpperCase();
    return s === "WAITING_UPLOAD" || s === "IN_TRANSIT" || s === "INSTRUCTIONS_READY" || s === "PREPARED";
  });
  const queue = [];
  for (const t of pending) {
    const id = String(t.id || "");
    const batchId = String(t?.details?.batchId || "");
    const emailKey = batchId || id;
    const last = state[emailKey] || {};
    const age = hoursSince(t.timestamp);
    let level = null;
    if (age >= e3 && (!last.level || last.level !== "three")) level = "three";
    else if (age >= e2 && (!last.level || last.level === "one")) level = "two";
    else if (age >= e1 && !last.level) level = "one";
    if (!level) continue;
    for (const name of Object.keys(registry || {})) {
      const info = registry[name] || {};
      const to = info.email || "";
      if (!to) continue;
      const msg = tpl(level, info.display_name || name, t.amount, "USD", batchId || id);
      queue.push({ to, subject: msg.subject, text: msg.text });
    }
    state[emailKey] = { level, last_sent_at: new Date().toISOString() };
  }
  const outFile = path.resolve("data", "email_queue.json");
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(outFile, "utf8"));
  } catch {
    existing = [];
  }
  writeJson(outFile, existing.concat(queue));
  writeJson(stateFile, state);
  process.stdout.write(JSON.stringify({ escalations: queue.length, state: stateFile, queue: outFile }) + "\n");
}
main();
