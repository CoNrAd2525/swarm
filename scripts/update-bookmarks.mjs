import fs from "node:fs";
import path from "node:path";
const src = path.resolve("favoris_07_02_2026.html");
const out = path.resolve("dist_rwc","site-data","bookmarks_updated.html");
const now = Math.floor(Date.now()/1000);
function folder(title, links){
  return `<DT><H3 ADD_DATE="${now}" LAST_MODIFIED="0">${title}</H3><DL><p>` + links.map(l=>`<DT><A HREF="${l.url}" ADD_DATE="${now}">${l.title}</A>`).join("\n") + `</DL><p>`;
}
const groups = [
  { title: "AI/ML Efficiency", links: [
    { title: "Papers With Code", url: "https://paperswithcode.com/" },
    { title: "Hugging Face Blog", url: "https://huggingface.co/blog" },
    { title: "NVIDIA Developer Blog", url: "https://developer.nvidia.com/blog/" },
    { title: "Berkeley AI Research Blog", url: "https://bair.berkeley.edu/blog/" }
  ]},
  { title: "Cybersecurity & IT Ops", links: [
    { title: "BleepingComputer", url: "https://www.bleepingcomputer.com/" },
    { title: "KrebsOnSecurity", url: "https://krebsonsecurity.com/" },
    { title: "SANS Internet Storm Center", url: "https://isc.sans.edu/diary.html" },
    { title: "Microsoft Security Blog", url: "https://www.microsoft.com/security/blog/" }
  ]},
  { title: "Content Repurposing & Curation", links: [
    { title: "RSSHub", url: "https://rsshub.app/" },
    { title: "Feedly", url: "https://feedly.com/" },
    { title: "Internet Archive", url: "https://archive.org/" },
    { title: "Medium Technology", url: "https://medium.com/topic/technology" }
  ]},
  { title: "Business, Growth, Product", links: [
    { title: "Indie Hackers", url: "https://www.indiehackers.com/" },
    { title: "Product Hunt", url: "https://www.producthunt.com/" },
    { title: "Stratechery", url: "https://stratechery.com/" },
    { title: "The Generalist", url: "https://www.readthegeneralist.com/" }
  ]},
  { title: "Payments & FinTech", links: [
    { title: "Finextra", url: "https://www.finextra.com/" },
    { title: "The Paypers", url: "https://thepaypers.com/" },
    { title: "Visa Developer", url: "https://developer.visa.com/" },
    { title: "Stripe Changelog", url: "https://stripe.com/docs/changelog" }
  ]},
  { title: "Creative Tools & Media Ops", links: [
    { title: "Descript", url: "https://www.descript.com/" },
    { title: "Restream", url: "https://restream.io/" },
    { title: "Kapwing", url: "https://www.kapwing.com/" },
    { title: "Notion AI", url: "https://www.notion.so/product/ai" }
  ]},
  { title: "B2B Sourcing & Marketplaces", links: [
    { title: "Global Sources", url: "https://www.globalsources.com/" },
    { title: "Alibaba Verified", url: "https://www.alibaba.com/trade/serv/verified-suppliers.html" },
    { title: "Faire", url: "https://www.faire.com/" }
  ]},
  { title: "Learning & Certification", links: [
    { title: "Coursera Catalogue", url: "https://www.coursera.org/browse" },
    { title: "edX Tracks", url: "https://www.edx.org/browse" },
    { title: "A Cloud Guru", url: "https://acloudguru.com/" }
  ]}
];
const interestFolder = `<DT><H3 ADD_DATE="${now}" LAST_MODIFIED="0">Websites of Interest</H3><DL><p>` + groups.map(g=>folder(g.title, g.links)).join("\n") + `</DL><p>`;
const html = fs.readFileSync(src,"utf8");
const idx = html.lastIndexOf("</DL>");
let outHtml;
if(idx >= 0){
  outHtml = html.slice(0, idx) + interestFolder + html.slice(idx);
}else{
  outHtml = html + "\n" + interestFolder;
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, outHtml, "utf8");
console.log(JSON.stringify({ ok:true, out }));
