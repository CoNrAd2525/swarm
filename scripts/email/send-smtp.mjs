import tls from "node:tls";
import { Buffer } from "node:buffer";
function env(k, d = "") {
  const v = process.env[k];
  return typeof v === "string" && v.length ? v : d;
}
function b64(s) {
  return Buffer.from(s, "utf8").toString("base64");
}
function readArg(name) {
  const i = process.argv.indexOf("--" + name);
  if (i >= 0) return process.argv[i + 1] || "";
  return "";
}
async function send() {
  const host = env("SMTP_HOST");
  const port = parseInt(env("SMTP_PORT", "465"), 10);
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  const from = env("SMTP_FROM");
  const cc = env("SMTP_CC");
  const bcc = env("SMTP_BCC") || env("SECONDARY_CONTACT_EMAIL");
  const to = readArg("to") || env("SMTP_TEST_TO");
  const subject = readArg("subject") || "Test";
  const text = readArg("text") || "";
  const html = readArg("html") || "";
  if (!host || !port || !user || !pass || !from || !to) {
    process.stderr.write("missing SMTP config or args\n");
    process.exit(2);
  }
  const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false });
  await new Promise((res, rej) => {
    sock.once("secureConnect", res);
    sock.once("error", rej);
  });
  function write(line) {
    sock.write(line + "\r\n");
  }
  function readLine() {
    return new Promise((res) => {
      const onData = (d) => {
        const s = d.toString("utf8");
        const idx = s.lastIndexOf("\r\n");
        if (idx >= 0) {
          sock.off("data", onData);
          res(s.slice(0, idx));
        }
      };
      sock.on("data", onData);
    });
  }
  await readLine();
  write("EHLO " + host);
  await readLine();
  write("AUTH LOGIN");
  await readLine();
  write(b64(user));
  await readLine();
  write(b64(pass));
  await readLine();
  write("MAIL FROM:<" + from + ">");
  await readLine();
  write("RCPT TO:<" + to + ">");
  await readLine();
  if (cc) {
    for (const addr of cc.split(",").map((x) => x.trim()).filter(Boolean)) {
      write("RCPT TO:<" + addr + ">");
      await readLine();
    }
  }
  if (bcc) {
    for (const addr of bcc.split(",").map((x) => x.trim()).filter(Boolean)) {
      write("RCPT TO:<" + addr + ">");
      await readLine();
    }
  }
  write("DATA");
  await readLine();
  const now = new Date().toUTCString();
  const headers = [
    "Date: " + now,
    "From: " + from,
    "To: " + to,
    "Subject: " + subject,
    cc ? "Cc: " + cc : null,
    bcc ? "Bcc: " + bcc : null,
    env("SECONDARY_CONTACT_EMAIL") ? "Reply-To: " + env("SECONDARY_CONTACT_EMAIL") : null,
    "MIME-Version: 1.0",
    "Content-Type: " + (html ? "text/html; charset=utf-8" : "text/plain; charset=utf-8"),
  ]
    .filter(Boolean)
    .join("\r\n");
  const body = html || text || " ";
  const msg = headers + "\r\n\r\n" + body + "\r\n.";
  write(msg);
  await readLine();
  write("QUIT");
  sock.end();
  process.stdout.write(JSON.stringify({ ok: true }) + "\n");
}
send().catch((e) => {
  process.stderr.write("smtp_error\n");
  process.exit(1);
});
