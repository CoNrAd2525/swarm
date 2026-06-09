import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
function readJsonSafe(p){ if(!fs.existsSync(p)) return []; return JSON.parse(fs.readFileSync(p,"utf8")); }
function writeJson(p, obj){ ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj,null,2), "utf8"); }
function fetchOnce(u){
  return new Promise((resolve,reject)=>{
    try{
      const url = new URL(u);
      const lib = url.protocol === "https:" ? https : http;
      const req = lib.request({
        protocol: url.protocol,
        hostname: url.hostname,
        path: url.pathname + (url.search||""),
        method: "GET",
        headers: { "User-Agent": "RWC-Agent/1.0", "Accept": "text/html,application/xhtml+xml" },
      }, (res)=>{
        const chunks=[];
        res.on("data",(d)=>chunks.push(d));
        res.on("end",()=>{
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ statusCode: res.statusCode||0, headers: res.headers, body });
        });
      });
      req.on("error",reject);
      req.end();
    }catch(e){ reject(e); }
  });
}
async function fetchWithRedirects(u, depth=0){
  const res = await fetchOnce(u);
  if(res.statusCode>=300 && res.statusCode<400 && res.headers.location && depth<3){
    const next = new URL(res.headers.location, u).toString();
    return fetchWithRedirects(next, depth+1);
  }
  return res;
}
function textBetween(html, re){
  const m = re.exec(html);
  if(!m) return "";
  return m[1].replace(/\s+/g," ").trim();
}
function stripTags(s){
  return s.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
}
function extractTitle(html){
  return textBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
}
function extractHeading(html){
  const h1 = textBetween(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if(h1) return stripTags(h1);
  const h2 = textBetween(html, /<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if(h2) return stripTags(h2);
  return "";
}
function extractLead(html){
  const m = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if(!m) return "";
  return stripTags(m[1]).slice(0,400);
}
function hostname(u){
  try{ return new URL(u).hostname; }catch{ return ""; }
}
async function refresh(){
  const outPath = path.resolve("rank","output","site-data","scrapes.json");
  const items = readJsonSafe(outPath);
  const now = new Date().toISOString();
  const updated = [];
  for(const it of items){
    const url = it.url;
    if(!url){ continue; }
    try{
      const res = await fetchWithRedirects(url);
      if((res.statusCode||0) >= 200 && (res.statusCode||0) < 300){
        const html = res.body||"";
        const title = extractTitle(html) || it.title || url;
        const heading = extractHeading(html);
        const lead = extractLead(html);
        updated.push({
          url,
          source: hostname(url) || it.source || "",
          title,
          heading,
          lead,
          fetchedAt: now,
          status: "ok"
        });
      }else{
        updated.push({
          url,
          source: hostname(url) || it.source || "",
          title: it.title || url,
          fetchedAt: now,
          status: "error",
          error: "HTTP "+res.statusCode
        });
      }
    }catch(e){
      updated.push({
        url,
        source: hostname(url) || it.source || "",
        title: it.title || url,
        fetchedAt: now,
        status: "error",
        error: String(e.message||e)
      });
    }
  }
  writeJson(outPath, updated);
  console.log(JSON.stringify({ ok:true, count: updated.length, out: outPath }));
}
refresh();
