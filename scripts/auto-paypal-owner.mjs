import fs from "node:fs";
import path from "node:path";
import { URLSearchParams } from "node:url";
function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
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
function buildWebscrLink(email, amount, currency, itemName){
  const params = new URLSearchParams();
  params.set("cmd","_xclick");
  params.set("business", email);
  params.set("item_name", itemName || "Owner settlement");
  params.set("amount", String(amount));
  params.set("currency_code", currency || "USD");
  params.set("no_note","1");
  params.set("bn","PP-BuyNowBF:btn_buynowCC_LG.gif:NonHosted");
  return "https://www.paypal.com/cgi-bin/webscr?" + params.toString();
}
const ownerEmail = process.env.PAYPAL_OWNER_EMAIL || "younestsouli2019@gmail.com";
const srcCsv = path.resolve("archive","owner_settlement_requests.csv");
const outJson = path.resolve("dist_rwc","site-data","payer_links.json");
const outCsv = path.resolve("dist_rwc","site-data","payer_links.csv");
const rows = readCsv(srcCsv);
const links = rows.map(r=>({
  ref: r.Reference || "",
  amount: Number(r.Amount||0),
  currency: r.Currency || "USD",
  route: "PayPal",
  link: buildWebscrLink(ownerEmail, r.Amount, r.Currency, r.Reference)
}));
ensureDir(path.dirname(outJson));
fs.writeFileSync(outJson, JSON.stringify(links,null,2), "utf8");
fs.writeFileSync(outCsv, ["ref,amount,currency,route,link"].concat(links.map(l=>[l.ref,l.amount,l.currency,l.route,l.link].join(","))).join("\n"), "utf8");
console.log(JSON.stringify({ ok:true, count: links.length, outJson, outCsv }));
