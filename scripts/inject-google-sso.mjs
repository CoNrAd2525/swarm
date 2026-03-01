import fs from "fs";
import path from "path";
const pages = ["index.html", "news.html", "agents.html"];
const dist = path.resolve("dist_rwc");
function readEnvClientId() {
  const e1 = process.env.GOOGLE_CLIENT_ID_WEB || process.env.GOOGLE_CLIENT_ID || "";
  if (e1) return e1;
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const txt = fs.readFileSync(envPath, "utf8");
    const m = txt.match(/^\s*GOOGLE_CLIENT_ID_WEB\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim();
  }
  return "";
}
const clientId = readEnvClientId();
function inject(file) {
  const p = path.join(dist, file);
  if (!fs.existsSync(p)) return false;
  const html = fs.readFileSync(p, "utf8");
  const tag = `<script src="/assets/google_sso.js"${clientId ? ` data-google-client-id="${clientId}"` : ""} data-auto="1"></script>`;
  if (html.includes("assets/google_sso.js")) return false;
  const updated = html.replace(/<\/body>\s*<\/html>\s*$/i, `${tag}</body></html>`);
  fs.writeFileSync(p, updated, "utf8");
  return true;
}
let changed = 0;
for (const f of pages) {
  if (inject(f)) changed++;
}
console.log(JSON.stringify({ ok: true, changed }));
