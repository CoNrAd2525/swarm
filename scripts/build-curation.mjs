import fs from "node:fs";
import path from "node:path";
function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
function writeJson(p,obj){ ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj,null,2), "utf8"); }
function now(){ return new Date().toISOString(); }
const items = [
  { url: "https://rutracker.org/forum/viewtopic.php?t=6745881", title: "Defending and Deploying AI — Omar Santos (Pearson/O’Reilly)" },
  { url: "https://rutracker.org/forum/viewtopic.php?t=6765447", title: "The AI Engineer Course 2025 — 365 Careers (Udemy)" },
  { url: "https://rutracker.org/forum/viewtopic.php?t=6747632", title: "Cursor + Task Master Full Stack AI — Shawn Esquivel (Udemy)" },
  { url: "https://rutracker.org/forum/viewtopic.php?t=6792466", title: "Topic (link provided by owner)" },
  { url: "https://rutracker.org/forum/viewforum.php?f=1560", title: "Forum: Security & Networking Courses" },
  { url: "https://rutracker.org/forum/viewforum.php?f=1991", title: "Forum: Programming & AI Courses" },
];
const curated = items.map((x,i)=>({
  id: "cur_"+(i+1),
  url: x.url,
  title: x.title,
  source: new URL(x.url).hostname,
  added_at: now(),
  repurpose_plan: "Create original commentary, structured syllabus, and multilingual synopsis with citations; do not mirror files.",
}));
const out = path.resolve("dist_rwc", "site-data", "curation.json");
writeJson(out, curated);
console.log(JSON.stringify({ ok:true, count: curated.length, out }));
