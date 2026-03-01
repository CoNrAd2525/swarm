import fs from "node:fs";
import path from "node:path";
function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }
function writeText(p, t){ ensureDir(path.dirname(p)); fs.writeFileSync(p, t, "utf8"); }
function slugify(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }
function tpl({title,url,source,en,fr,de,es}){
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>", title, " — RWC Commentary</title>",
    "<style>html,body{margin:0;padding:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans;background:#0b0f1a;color:#e6eaf2}",
    "a{color:#7fd1ff}main{max-width:960px;margin:0 auto;padding:24px}header{padding:20px;background:#0d1424;border-bottom:1px solid #1f2a44}",
    "h1{font-size:28px;margin:0 0 10px}section{background:#131a2a;border:1px solid #1f2a44;border-radius:12px;padding:16px;margin:16px 0}",
    "small.note{opacity:.8}</style></head><body>",
    "<header><main><h1>", title, "</h1><div><a href=\"", url, "\" target=\"_blank\" rel=\"noopener\">Source: ", source, "</a></div><small class=\"note\">Original commentary by RealWorldCerts. Citations link to source; no files mirrored.</small></main></header>",
    "<main>",
    "<section><h2>English</h2>", en, "</section>",
    "<section><h2>Français</h2>", fr, "</section>",
    "<section><h2>Deutsch</h2>", de, "</section>",
    "<section><h2>Español</h2>", es, "</section>",
    "</main></body></html>"
  ].join("");
}
function makeBlocks(title){
  const common = [
    "<p><strong>Overview.</strong> A structured analysis of \"", title, "\" in context of modern AI/cyber programs.</p>",
    "<p><strong>Key takeaways.</strong> Curriculum scope, practical labs, security emphasis, and production readiness.</p>",
    "<p><strong>RWC positioning.</strong> How RealWorldCerts complements with hands‑on videos, direct checkout, and multilingual study notes.</p>",
    "<p><strong>Notes.</strong> This commentary references the public course description and industry best practices.</p>",
  ].join("");
  return {
    en: common,
    fr: common.replace("Overview","Vue d’ensemble").replace("Key takeaways","Points clés").replace("Notes","Remarques").replace("RWC positioning","Positionnement RWC"),
    de: common.replace("Overview","Überblick").replace("Key takeaways","Wesentliche Punkte").replace("Notes","Hinweise").replace("RWC positioning","RWC‑Positionierung"),
    es: common.replace("Overview","Resumen").replace("Key takeaways","Puntos clave").replace("Notes","Notas").replace("RWC positioning","Posicionamiento RWC"),
  };
}
const inFile = path.resolve("dist_rwc","site-data","curation.json");
const outDir = path.resolve("dist_rwc","content");
ensureDir(outDir);
const items = readJson(inFile);
const index = [];
for(const it of items){
  const title = it.title || it.url;
  const slug = slugify(title);
  const blocks = makeBlocks(title);
  const html = tpl({ title, url: it.url, source: it.source, ...blocks });
  const file = path.join(outDir, slug + ".html");
  writeText(file, html);
  index.push({ slug, title, path: "/content/" + slug + ".html" });
}
const indexOut = path.resolve("dist_rwc","site-data","curation_index.json");
fs.writeFileSync(indexOut, JSON.stringify(index,null,2), "utf8");
console.log(JSON.stringify({ ok:true, count:index.length, out:indexOut }));
