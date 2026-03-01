import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function env(k) {
  const v = process.env[k];
  return typeof v === "string" && v.length ? v : "";
}
function queuePath() {
  const p = path.resolve("data", "email_queue.json");
  return p;
}
function readQueue() {
  const file = queuePath();
  if (!fs.existsSync(file)) return [];
  try {
    const txt = fs.readFileSync(file, "utf8");
    return JSON.parse(txt);
  } catch {
    return [];
  }
}
function writeQueue(items) {
  const file = queuePath();
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(items, null, 2), "utf8");
}
function writeOutbox(to, subject, text) {
  const dir = path.resolve("dist_rwc", "egress", "outbox");
  ensureDir(dir);
  const now = new Date().toUTCString();
  const fname = `msg_${Date.now()}_${String(to).replace(/[^a-z0-9]/gi, "_")}.eml`;
  const headers = [
    "Date: " + now,
    "From: " + (env("SMTP_FROM") || "Operations <contact@realworldcerts.com>"),
    "To: " + to,
    "Subject: " + subject,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
  ].join("\r\n");
  const body = headers + "\r\n\r\n" + (text || "") + "\r\n";
  fs.writeFileSync(path.join(dir, fname), body, "utf8");
  return path.join(dir, fname);
}
function sendOne(it) {
  const args = [
    "node",
    path.resolve("scripts", "email", "send-smtp.mjs"),
    "--to",
    it.to,
    "--subject",
    it.subject || "",
    "--text",
    it.text || "",
  ];
  const r = spawnSync(args[0], args.slice(1), { env: process.env });
  const ok = r.status === 0;
  return { ok, out: r.stdout?.toString() || "", err: r.stderr?.toString() || "" };
}
function main() {
  const hasSmtp =
    env("SMTP_HOST") && env("SMTP_PORT") && env("SMTP_USER") && env("SMTP_PASS");
  const items = readQueue();
  const remain = [];
  const sentLog = [];
  for (const it of items) {
    if (!it || !it.to) continue;
    if (hasSmtp) {
      const r = sendOne(it);
      if (r.ok) {
        sentLog.push({ to: it.to, subject: it.subject || "", ts: Date.now() });
      } else {
        remain.push(it);
      }
    } else {
      const file = writeOutbox(it.to, it.subject || "", it.text || "");
      sentLog.push({ to: it.to, subject: it.subject || "", ts: Date.now(), outbox: file });
    }
  }
  writeQueue(remain);
  const egress = path.resolve("dist_rwc", "egress");
  ensureDir(egress);
  fs.writeFileSync(path.join(egress, "email_sent_log.json"), JSON.stringify(sentLog, null, 2), "utf8");
  process.stdout.write(
    JSON.stringify({
      processed: items.length,
      sent: sentLog.length,
      queued_left: remain.length,
      mode: hasSmtp ? "smtp" : "outbox",
    }) + "\n",
  );
}
main();
