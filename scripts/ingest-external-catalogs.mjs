import fs from "fs";
import path from "path";
function findCsvDir() {
  const envDir = process.env.CATALOG_CSV_DIR;
  const cands = [
    envDir,
    path.join(process.cwd(), "rank"),
    path.join(process.cwd(), "rank_mirror"),
    path.join(process.cwd(), "Nouveau dossier (3)", "rank")
  ].filter(Boolean);
  for (const d of cands) {
    try {
      if (fs.existsSync(path.join(d, "courses.csv"))) return d;
    } catch {}
  }
  return "C:\\Users\\Dell\\Desktop\\rank";
}
const csvDir = findCsvDir();
const coursesCsvPath = path.join(csvDir, "courses.csv");
const testsCsvPath = path.join(csvDir, "practice_tests.csv");
const dist = path.join(process.cwd(), "dist_rwc");
const siteData = path.join(dist, "site-data");
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function parseLineCSV(line) {
  const cols = [];
  let i = 0;
  let field = "";
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += c;
        i++;
        continue;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ",") {
        cols.push(field);
        field = "";
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
  }
  cols.push(field);
  return cols;
}
async function streamCSV(filePath, maxRows) {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  let buffer = "";
  let header = null;
  const out = [];
  for await (const chunk of stream) {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const cols = parseLineCSV(line);
      if (!header) {
        header = cols;
      } else {
        const obj = {};
        for (let j = 0; j < header.length; j++) obj[header[j]] = cols[j] ?? "";
        if (Object.values(obj).some(v => v && String(v).trim() !== "")) out.push(obj);
        if (out.length >= maxRows) {
          stream.close();
          return out;
        }
      }
    }
  }
  return out;
}
function buildPayPalLink(itemName, amount) {
  const business = process.env.PAYPAL_OWNER_EMAIL || "younestsouli2019@gmail.com";
  const base = "https://www.paypal.com/cgi-bin/webscr";
  const q = new URLSearchParams();
  q.set("cmd", "_xclick");
  q.set("business", business);
  q.set("item_name", itemName);
  if (amount) q.set("amount", String(amount));
  q.set("currency_code", "USD");
  q.set("no_note", "1");
  q.set("bn", "PP-BuyNowBF:btn_buynowCC_LG.gif:NonHosted");
  return `${base}?${q.toString()}`;
}
function writeHtmlPage(filePath, title, items) {
  const rows = items.map(it => {
    const pLink = buildPayPalLink(it.title, it.price || "");
    return [
      "<div class=\"item\">",
      "<div class=\"meta\">",
      "<strong>" + it.title + "</strong>",
      it.headline ? "<div class=\"sub\">" + it.headline + "</div>" : "",
      "</div>",
      "<div class=\"ctas\">",
      "<a class=\"cta\" href=\"" + pLink + "\">PayPal</a>",
      "<a class=\"cta\" href=\"/checkout.html#crypto\">USDT ERC20</a>",
      "<a class=\"cta\" href=\"/checkout.html#payoneer\">Payoneer</a>",
      "<a class=\"cta\" href=\"/checkout.html#bank\">Bank Wire</a>",
      "</div>",
      "</div>"
    ].join("");
  }).join("");
  const html = [
    "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>" + title + "</title>",
    "<style>",
    "body{margin:0;background:#0b0f1a;color:#e6eaf2;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}",
    "a{color:#7fd1ff;text-decoration:none}a:hover{text-decoration:underline}",
    "header{padding:20px;display:flex;justify-content:space-between;align-items:center;background:#0d1424;border-bottom:1px solid #1f2a44}",
    "main{max-width:1000px;margin:0 auto;padding:24px}",
    ".item{display:flex;justify-content:space-between;align-items:center;background:#131a2a;border:1px solid #1f2a44;border-radius:12px;padding:14px;margin:10px 0}",
    ".sub{opacity:.8;font-size:14px;margin-top:4px}",
    ".ctas .cta{display:inline-block;background:#182037;border:1px solid #27324a;border-radius:10px;padding:8px 10px;margin-left:8px}",
    "</style>",
    "</head><body>",
    "<header><div>" + title + "</div><nav><a href=\"/index.html\">Home</a><a href=\"/checkout.html\">Checkout</a></nav></header>",
    "<main>",
    rows || "<div>No items</div>",
    "</main>",
    "</body></html>"
  ].join("");
  fs.writeFileSync(filePath, html);
}
function generateProjectsPage() {
  const items = [
    { title: "OSHA Prep Tests Pack", headline: "Hard-level MCQs, instant readiness", price: 29 },
    { title: "Interview Coaching 45m", headline: "Live session, targeted to your role", price: 49 },
    { title: "Resume Review + ATS Score", headline: "Actionable edits, recruiter-friendly", price: 39 },
    { title: "Custom Lab: Cloud & Security", headline: "Hands-on lab with guided tasks", price: 59 }
  ];
  writeHtmlPage(path.join(dist, "projects.html"), "Projects", items);
}
async function main() {
  ensureDir(siteData);
  const courses = (await streamCSV(coursesCsvPath, 2000)).map(x => {
    return {
      id: x.id,
      title: x.title,
      headline: x.headline || "",
      is_practice: x.is_practice_test_course === "1"
    };
  });
  const testsExists = fs.existsSync(testsCsvPath);
  const tests = testsExists ? (await streamCSV(testsCsvPath, 5000)).map(x => {
    return {
      courseId: x.courseId,
      title: x.title,
      practicetestId: x.practicetestId,
      practicetest_title: x.practicetest_title
    };
  }) : [];
  const oshaCourses = courses.filter(c => (c.title || "").toLowerCase().includes("osha"));
  const oshaTests = tests.filter(t => (t.title || "").toLowerCase().includes("osha"));
  fs.writeFileSync(path.join(siteData, "external_courses.json"), JSON.stringify(courses, null, 2));
  fs.writeFileSync(path.join(siteData, "practice_tests.json"), JSON.stringify(tests, null, 2));
  writeHtmlPage(path.join(dist, "courses_catalog_extra.html"), "Additional Courses", courses.slice(0, 50).map(c => ({ title: c.title, headline: c.headline })));
  const prepItems = (oshaCourses.length || oshaTests.length) ? [...oshaCourses.map(c => ({ title: c.title })), ...oshaTests.map(t => ({ title: t.practicetest_title || t.title }))] : [{ title: "OSHA General Industry Prep", headline: "Exam-style questions", price: 29 }, { title: "OSHA Construction Safety Prep", headline: "Exam-style questions", price: 29 }];
  writeHtmlPage(path.join(dist, "prep_tests.html"), "Prep Tests", prepItems);
  generateProjectsPage();
  const report = { ok: true, counts: { courses: courses.length, tests: tests.length, osha_courses: oshaCourses.length, osha_tests: oshaTests.length }, out: { courses_json: path.join(siteData, "external_courses.json"), tests_json: path.join(siteData, "practice_tests.json"), pages: ["courses_catalog_extra.html", "prep_tests.html", "projects.html"] } };
  console.log(JSON.stringify(report));
}
main();
