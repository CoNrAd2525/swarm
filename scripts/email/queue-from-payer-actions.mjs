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
function tpl(name, batches) {
  const subject = "Follow-up: Payoneer settlement pending";
  const lines = [
    "Hello " + (name || "there") + ",",
    "",
    "We have pending Payoneer settlement batches prepared and/or in transit.",
    "Please complete or confirm processing on your side to avoid delay.",
    "",
    "Batches:",
  ];
  for (const b of batches) {
    lines.push(
      "- " +
        (b.batchId || b.id || "") +
        " • " +
        (b.status || "") +
        " • $" +
        (b.amount || 0) +
        " • " +
        (b.currency || "USD")
    );
  }
  lines.push("");
  lines.push("If Payoneer is blocked, we can provide alternatives (Bank Wire, PayPal).");
  lines.push("Thank you.");
  return { subject, text: lines.join("\n") };
}
function main() {
  const actionsFile = path.resolve("dist_rwc", "egress", "payer_actions.json");
  const registryFile = path.resolve("data", "payers", "registry.json");
  const actions = readJson(actionsFile, []);
  const registry = readJson(registryFile, {});
  const payoneer = actions.filter(
    (r) =>
      String(r.channel).toUpperCase() === "PAYONEER" &&
      ["WAITING_UPLOAD", "IN_TRANSIT", "INSTRUCTIONS_READY"].includes(String(r.status).toUpperCase())
  );
  const batches = payoneer.map((r) => ({
    id: r.id,
    batchId: r.batchId || "",
    status: r.status,
    amount: r.amount,
    currency: "USD",
  }));
  const queue = [];
  for (const name of Object.keys(registry || {})) {
    const info = registry[name] || {};
    const email = info.email || "";
    if (!email) continue;
    const content = tpl(info.display_name || name, batches);
    queue.push({
      to: email,
      subject: content.subject,
      text: content.text,
    });
  }
  const outFile = path.resolve("data", "email_queue.json");
  writeJson(outFile, queue);
  process.stdout.write(JSON.stringify({ queued: queue.length, file: outFile }) + "\n");
}
main();
