import fs from "node:fs";
import path from "node:path";
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function copySafe(src, dst) {
  try {
    ensureDir(path.dirname(dst));
    fs.copyFileSync(src, dst);
    return true;
  } catch {
    return false;
  }
}
function writeJson(file, obj) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
}
function listDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((f) => path.join(dir, f));
}
function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const root = process.cwd();
  const backupDir = path.resolve("backups", "snapshot_" + ts);
  ensureDir(backupDir);
  const files = [
    ".github/workflows/deploy-pages.yml",
    "rank/.env.realworldcerts",
    "data/payers/registry.json",
    "data/financial/settlement_ledger.json",
    "dist_rwc/index.html",
    "dist_rwc/vercel.json",
    "dist_rwc/courses_index.html",
    "site/realworldcerts/index.html",
    "site/realworldcerts/courses.html",
    "site/realworldcerts/payments.html",
    "site/realworldcerts/sitemap.xml",
    "site/realworldcerts/robots.txt",
    "site/realworldcerts/CNAME",
  ].map((p) => path.resolve(p));
  const copied = [];
  for (const f of files) {
    const rel = path.relative(root, f);
    const ok = copySafe(f, path.join(backupDir, rel));
    if (ok) copied.push(rel);
  }
  const dirs = ["dist_rwc/courses", "dist_rwc/videos", "site/realworldcerts/site-data"].map((d) => path.resolve(d));
  const meta = {
    at: new Date().toISOString(),
    files: copied,
    dirs: dirs.filter((d) => fs.existsSync(d)).map((d) => ({ dir: d, items: listDir(d).length })),
  };
  writeJson(path.join(backupDir, "manifest.json"), meta);
  console.log(JSON.stringify({ ok: true, backupDir, copied: copied.length }));
}
main();
