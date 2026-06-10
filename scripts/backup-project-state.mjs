import fs from "node:fs";
import path from "node:path";
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function copyFileSafe(src, dst) {
  try {
    ensureDir(path.dirname(dst));
    fs.copyFileSync(src, dst);
    return true;
  } catch {
    return false;
  }
}
function copyPathRecursive(src, dst) {
  if (!fs.existsSync(src)) return { copiedFiles: 0, copiedDirs: 0 };
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dst);
    let copiedFiles = 0;
    let copiedDirs = 1;
    for (const entry of fs.readdirSync(src)) {
      const child = copyPathRecursive(path.join(src, entry), path.join(dst, entry));
      copiedFiles += child.copiedFiles;
      copiedDirs += child.copiedDirs;
    }
    return { copiedFiles, copiedDirs };
  }
  return copyFileSafe(src, dst)
    ? { copiedFiles: 1, copiedDirs: 0 }
    : { copiedFiles: 0, copiedDirs: 0 };
}
function writeJson(file, obj) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
}
function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const root = process.cwd();
  const backupDir = path.resolve("backups", "snapshot_" + ts);
  ensureDir(backupDir);
  const entries = [
    ".github/workflows",
    ".trae/documents",
    "docs",
    "data/swarm",
    "data/finance",
    "data/mirror-sites.json",
    "rank/output/site-data",
    "doomsday-vault",
    "apps/realworldcerts-next/package.json",
    "apps/realworldcerts-next/tsconfig.json",
    "apps/realworldcerts-next/next.config.ts",
    "apps/realworldcerts-next/src",
  ];
  const copied = [];
  const missing = [];
  let copiedFiles = 0;
  let copiedDirs = 0;
  for (const entry of entries) {
    const src = path.resolve(entry);
    if (!fs.existsSync(src)) {
      missing.push(entry);
      continue;
    }
    const result = copyPathRecursive(src, path.join(backupDir, entry));
    copied.push(entry);
    copiedFiles += result.copiedFiles;
    copiedDirs += result.copiedDirs;
  }
  const meta = {
    at: new Date().toISOString(),
    backupDir,
    copied,
    missing,
    copiedFiles,
    copiedDirs,
  };
  writeJson(path.join(backupDir, "manifest.json"), meta);
  console.log(JSON.stringify({ ok: true, backupDir, copied: copied.length, missing: missing.length, copiedFiles, copiedDirs }));
}
main();
