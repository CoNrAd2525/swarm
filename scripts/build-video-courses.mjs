import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { buildBase44Client } from "../src/base44-client.mjs";
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
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function listMp4(dir) {
  try {
    const files = fs.readdirSync(dir);
    return files
      .filter((f) => /\.mp4$/i.test(f))
      .map((f) => ({ file: f, abs: path.join(dir, f) }));
  } catch {
    return [];
  }
}
function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text);
}
function buildCoverSvg(title) {
  const safeTitle = String(title || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return [
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1280\" height=\"720\" viewBox=\"0 0 1280 720\">",
    "<defs>",
    "<linearGradient id=\"g\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"1\">",
    "<stop offset=\"0%\" stop-color=\"#0b0f1a\"/>",
    "<stop offset=\"100%\" stop-color=\"#101a33\"/>",
    "</linearGradient>",
    "</defs>",
    "<rect x=\"0\" y=\"0\" width=\"1280\" height=\"720\" fill=\"url(#g)\"/>",
    "<text x=\"640\" y=\"360\" font-family=\"system-ui,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans\" font-size=\"56\" fill=\"#e6eaf2\" text-anchor=\"middle\">",
    safeTitle,
    "</text>",
    "<text x=\"640\" y=\"420\" font-family=\"system-ui,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans\" font-size=\"22\" fill=\"#7fd1ff\" text-anchor=\"middle\">RealWorldCerts</text>",
    "</svg>",
  ].join("");
}
function buildCourseHtml(title, videoPath, paypalMe) {
  const v = [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>" + title + "</title>",
    "</head>",
    "<body>",
    "<h1>" + title + "</h1>",
    "<img src=\"/assets/course-covers/" + slugify(title) + ".svg\" alt=\"Cover\" style=\"max-width:960px;width:100%;border-radius:12px;display:block;margin:0 0 16px\"/>",
    "<video controls width=\"960\" preload=\"metadata\">",
    "<source src=\"" + videoPath + "\" type=\"video/mp4\">",
    "</video>",
    "<script src=\"/assets/sales_booster.js\" data-paypalme=\"" + (paypalMe || "") + "\"></script>",
    "</body>",
    "</html>",
  ];
  return v.join("");
}
function queueJob(entity, job) {
  try {
    return entity.create(job);
  } catch {
    return null;
  }
}
async function main() {
  const envPath = path.resolve("rank/.env.realworldcerts");
  readEnvFile(envPath);
  const srcDir = process.env.RWC_VIDEO_SRC_DIR || "";
  const linkOnly = String(process.env.RWC_LINK_ONLY || "true").toLowerCase() === "true";
  const paypalMe = process.env.RWC_PAYPALME || "";
  const dist = path.resolve("dist_rwc");
  const coursesDir = path.join(dist, "courses");
  const videosDir = path.join(dist, "videos");
  const coversDir = path.join(dist, "assets", "course-covers");
  ensureDir(coursesDir);
  ensureDir(videosDir);
  ensureDir(coversDir);
  const videos = srcDir ? listMp4(srcDir) : [];
  const catalog = [];
  const offline = buildBase44Client({ mode: "offline" });
  const jobs = offline.asServiceRole.entities["MediaJob"];
  for (const v of videos) {
    const base = path.basename(v.file, path.extname(v.file));
    const title = base.replace(/[_\-]+/g, " ").trim();
    const slug = slugify(base);
    let videoWebPath = linkOnly ? v.abs : "/videos/" + v.file;
    if (!linkOnly) {
      try {
        fs.copyFileSync(v.abs, path.join(videosDir, v.file));
      } catch {}
    }
    const coverSvg = buildCoverSvg(title);
    writeText(path.join(coversDir, slug + ".svg"), coverSvg);
    const html = buildCourseHtml(title, videoWebPath, paypalMe);
    writeText(path.join(coursesDir, slug + ".html"), html);
    catalog.push({
      title,
      slug,
      sku: "rwc-" + slug,
      price: 0,
      currency: process.env.COURSES_DEFAULT_CURRENCY || "USD",
      video: videoWebPath,
      cover: "/assets/course-covers/" + slug + ".svg",
    });
    if (linkOnly) {
      queueJob(jobs, {
        type: "branding_and_translate",
        status: "queued",
        source_path: v.abs,
        target_langs: (process.env.RWC_TARGET_LANGS || "en,fr").split(","),
        logo_path: process.env.RWC_BRANDING_LOGO_PATH || "",
        intro_path: process.env.RWC_INTRO_MP4 || "",
        outro_path: process.env.RWC_OUTRO_MP4 || "",
        created_at: new Date().toISOString(),
      });
    }
  }
  writeText(path.join(dist, "site-data", "courses.json"), JSON.stringify(catalog, null, 2));
  const indexHtml = [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>Courses</title>",
    "</head>",
    "<body>",
    "<h1>Courses</h1>",
    "<div style=\"display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px\">",
    ...catalog.map((c) => [
      "<a href=\"/courses/" + c.slug + ".html\" style=\"display:block;background:#131a2a;border:1px solid #1f2a44;border-radius:12px;overflow:hidden;text-decoration:none;color:#e6eaf2\">",
      "<img src=\"" + c.cover + "\" alt=\"" + c.title.replace(/\"/g, "&quot;") + "\" style=\"width:100%;height:auto;display:block\"/>",
      "<div style=\"padding:12px 14px;font-weight:600\">" + c.title + "</div>",
      "</a>",
    ].join("")),
    "</div>",
    "</body>",
    "</html>",
  ].join("");
  writeText(path.join(dist, "courses_index.html"), indexHtml);
  const report = {
    srcDir,
    count: catalog.length,
    linkOnly,
    dist,
  };
  console.log(JSON.stringify(report));
}
main();
