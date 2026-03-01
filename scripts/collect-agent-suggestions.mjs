import fs from "node:fs";
import path from "node:path";
function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
function readJsonSafe(p){ if(!fs.existsSync(p)) return []; return JSON.parse(fs.readFileSync(p,"utf8")); }
function writeJson(p, obj){ ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj,null,2), "utf8"); }
function readCsv(p){
  if(!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p,"utf8").split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(",").map(s=>s.trim());
  return lines.slice(1).map(line=>{
    const cols = line.split(",").map(s=>s.trim());
    const o = {}; header.forEach((h,i)=>o[h]=cols[i]||"");
    return o;
  });
}
const csvPath = path.resolve("dist_rwc","egress","agent_suggestions.csv");
const outPath = path.resolve("dist_rwc","site-data","agents_suggestions.json");
const base = readJsonSafe(outPath);
const rows = readCsv(csvPath);
const now = new Date().toISOString();
for(const r of rows){
  if(!r.suggestion) continue;
  base.push({
    suggestion: r.suggestion,
    area: r.area || "",
    impact: r.impact || "",
    author: r.author || "agent",
    created_at: r.created_at || now
  });
}
writeJson(outPath, base);
console.log(JSON.stringify({ ok:true, added: rows.length, out: outPath }));
