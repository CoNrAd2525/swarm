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
function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .map((f) => path.join(dir, f));
}
function main() {
  const commDir = path.resolve("exports", "communications");
  const files = listFiles(commDir);
  const queue = [];
  for (const f of files) {
    const payload = readJson(f, null);
    if (!payload) continue;
    const email = payload.email;
    const to = payload.payer_email || (email && email.to) || "";
    const subject = (email && email.subject) || "";
    const text = (email && (email.body || email.text)) || "";
    if (!to || !subject || !text) continue;
    queue.push({ to, subject, text });
  }
  const outFile = path.resolve("data", "email_queue.json");
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(outFile, "utf8"));
  } catch {
    existing = [];
  }
  const combined = existing.concat(queue);
  ensureDir(path.dirname(outFile));
  fs.writeFileSync(outFile, JSON.stringify(combined, null, 2), "utf8");
  process.stdout.write(JSON.stringify({ added: queue.length, file: outFile }) + "\n");
}
main();
