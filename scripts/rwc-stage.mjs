import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
function readEnvFile(p) {
  try {
    const txt = fs.readFileSync(p, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) process.env[m[1]] = m[2];
    }
  } catch {}
}
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function copyFileSafe(src, dst) {
  try {
    if (!fs.existsSync(src)) return false;
    ensureDir(path.dirname(dst));
    fs.copyFileSync(src, dst);
    return true;
  } catch {
    return false;
  }
}
function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text);
}
function main() {
  const envPath = path.resolve("rank/.env.realworldcerts");
  readEnvFile(envPath);
  const dist = path.resolve("dist_rwc");
  ensureDir(dist);
  const cname = process.env.SITE_CNAME || process.env.SITE_DOMAIN || "";
  if (cname) writeText(path.join(dist, "CNAME"), cname.trim());
  const boosterSrc = process.env.BOOSTER_OUTPUT_PATH || "";
  const boosterDst = path.join(dist, "assets", "sales_booster.js");
  const boosterOk = copyFileSafe(boosterSrc, boosterDst);
  const catalogSrc = process.env.CATALOG_OUTPUT_PATH || "";
  const catalogDst = path.join(dist, "site-data", "catalog.json");
  const catalogOk = copyFileSafe(catalogSrc, catalogDst);
  const abSrc = process.env.AB_CONFIG_OUTPUT_PATH || "";
  const abDst = path.join(dist, "ab_config.json");
  const abOk = copyFileSafe(abSrc, abDst);
  const vercelDomain = process.env.VERCEL_DOMAIN || "";
  const vercelJson = {
    version: 2,
    routes: [
      { src: "/assets/(.*)", dest: "/assets/$1" },
      { src: "/site-data/(.*)", dest: "/site-data/$1" },
      { src: "/videos/(.*)", dest: "/videos/$1" }
    ],
    name: process.env.VERCEL_PROJECT_NAME || "realworldcerts-site"
  };
  if (vercelDomain) vercelJson.alias = vercelDomain;
  writeText(path.join(dist, "vercel.json"), JSON.stringify(vercelJson, null, 2));
  const indexHtml = [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>RealWorldCerts</title>",
    "</head>",
    "<body>",
    "<h1>RealWorldCerts</h1>",
    "<script src=\"/assets/sales_booster.js\" data-paypalme=\"" + (process.env.RWC_PAYPALME || "") + "\"></script>",
    "</body>",
    "</html>"
  ].join("");
  writeText(path.join(dist, "index.html"), indexHtml);
  const report = {
    dist,
    cname_written: !!cname,
    booster_copied: boosterOk,
    catalog_copied: catalogOk,
    ab_config_copied: abOk
  };
  console.log(JSON.stringify(report));
}
main();
