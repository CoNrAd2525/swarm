import fs from "fs";
import path from "path";

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyIfExists(src, dest) {
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
}

function readDirFiles(dir, ext = ".html") {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith(ext));
}

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

function writeFile(p, content) {
  fs.writeFileSync(p, content, "utf8");
}

const desktopImgDir = "C:\\Users\\Dell\\Desktop\\rank\\img";
const outDir = path.resolve("dist_rwc", "assets", "course-images");
ensureDir(outDir);

const sourceFiles = [
  { name: "Business Analytics — Excel, SQL & Dashboards.png", out: "business-analytics.png" },
  { name: "Cybersecurity Foundations — IAM & Threat Modeling.png", out: "cybersecurity-foundations.png" },
  { name: "Enterprise Team Pack — Multi‑track Access bundle.png", out: "enterprise-team-pack.png" },
  { name: "Legal Research with GenAI — Citations & Bluebook Basics.png", out: "legal-genai.png" },
  { name: "Networking Essentials — DNS, HTTPS, CDN.png", out: "networking-essentials.png" },
  { name: "Project Management — Sprint Planning & Risk Logs.png", out: "project-management.png" },
];

for (const f of sourceFiles) {
  const src = path.join(desktopImgDir, f.name);
  const dest = path.join(outDir, f.out);
  copyIfExists(src, dest);
}

function pickImageForSlug(slug) {
  if (slug.startsWith("aws-")) return "networking-essentials.png";
  if (slug.startsWith("btc-")) return "business-analytics.png";
  if (slug.startsWith("cnd")) return "cybersecurity-foundations.png";
  return "enterprise-team-pack.png";
}

function buildPicture(slug, attrs, title) {
  const png = pickImageForSlug(slug);
  const safeTitle = title || slug.toUpperCase();
  const style = 'style="max-width:960px;width:100%;border-radius:12px;display:block;margin:0 0 16px"';
  const baseAttrs = attrs && attrs.length ? attrs : `alt="${safeTitle}" ${style}`;
  return `<picture><source srcset="/assets/course-images/${png}" type="image/png"><img src="/assets/course-covers/${slug}.svg" ${baseAttrs}/></picture>`;
}

function transformImgToPicture(html) {
  const titleMatch = html.match(/<h1>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].trim() : undefined;
  const pictureBlock = /<picture>[\s\S]*?<img src="\/assets\/course-covers\/([^"]+)\.svg"[^>]*\/?>[\s\S]*?<\/picture>/gi;
  const imgOnly = /<img src="\/assets\/course-covers\/([^"]+)\.svg"([^>]*)\/?>/gi;
  let next = html.replace(pictureBlock, (m, slug) => buildPicture(slug, "", title));
  next = next.replace(imgOnly, (m, slug, rest) => {
    const attrs = (rest || "").replace(/\/\s*$/, "").trim();
    return buildPicture(slug, attrs, title);
  });
  return next;
}

function dedupePictures(s) {
  let prev;
  do {
    prev = s;
    s = s.replace(/<picture><source([^>]+)><picture>/g, "<picture><source$1>");
    s = s.replace(/<\/picture><\/picture>/g, "</picture>");
    s = s.replace(/(<source srcset="\/assets\/course-images\/[^"]+\.png" type="image\/png">)\1+/g, "$1");
  } while (s !== prev);
  return s;
}
const coursesDir = path.resolve("dist_rwc", "courses");
const courseFiles = readDirFiles(coursesDir, ".html");
const backlog = [];
for (const file of courseFiles) {
  const fp = path.join(coursesDir, file);
  const html = readFile(fp);
  let next = transformImgToPicture(html);
  next = dedupePictures(next);
  if (next !== html) writeFile(fp, next);
  const h1 = (html.match(/<h1>([^<]+)<\/h1>/i) || [])[1];
  const slugMatch = html.match(/\/assets\/course-covers\/([^"]+)\.svg/);
  const slug = slugMatch ? slugMatch[1] : file.replace(/\.html$/i, "");
  const chosen = pickImageForSlug(slug);
  const chosenPath = path.join(outDir, chosen);
  const isDefault = chosen === "enterprise-team-pack.png";
  if (isDefault || !fs.existsSync(chosenPath)) {
    const title = (h1 || slug).trim();
    const prompt = `Course cover for "${title}" — clean, professional, dark theme, simple iconography, legible title, 16:9, PNG`;
    backlog.push({ slug, title, prompt });
  }
}

const indexPath = path.resolve("dist_rwc", "courses_index.html");
if (fs.existsSync(indexPath)) {
  const html = readFile(indexPath);
  let next = transformImgToPicture(html);
  next = dedupePictures(next);
  if (next !== html) writeFile(indexPath, next);
}

const egressDir = path.resolve("dist_rwc", "egress");
ensureDir(egressDir);
const backlogCsv = path.join(egressDir, "image_backlog.csv");
if (backlog.length) {
  const header = "slug,title,prompt";
  const rows = backlog.map(b => {
    const safeTitle = (b.title || "").replace(/"/g, '""');
    const safePrompt = (b.prompt || "").replace(/"/g, '""');
    return `${b.slug},"${safeTitle}","${safePrompt}"`;
  });
  writeFile(backlogCsv, [header, ...rows].join("\n"));
}

console.log("Course images ingested and pages updated.");
