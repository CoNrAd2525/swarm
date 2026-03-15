import fs from "node:fs";
import path from "node:path";

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function toItem({ title, link, guid, pubDate }) {
  return (
    "    <item>\n" +
    `      <title>${title}</title>\n` +
    `      <link>${link}</link>\n` +
    `      <guid isPermaLink="true">${guid || link}</guid>\n` +
    `      <pubDate>${pubDate}</pubDate>\n` +
    "    </item>\n"
  );
}

function nowRfc2822() {
  return new Date().toUTCString();
}

function buildFeed(base, items) {
  const head =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0">\n' +
    "  <channel>\n" +
    "    <title>RealWorldCerts News</title>\n" +
    `    <link>${base}/news.html</link>\n` +
    "    <description>Updates from RealWorldCerts</description>\n" +
    "    <language>en</language>\n" +
    "    <image>\n" +
    `      <url>${base}/favicon.ico</url>\n` +
    "      <title>RealWorldCerts</title>\n" +
    `      <link>${base}/</link>\n` +
    "    </image>\n";
  const body = items.map(toItem).join("");
  const tail = "  </channel>\n</rss>\n";
  return head + body + tail;
}

function main() {
  const base = process.env.SITE_PUBLIC_URL || "https://realworldcerts.com";
  const dist = path.resolve("dist_rwc");
  const feedPath = path.join(dist, "feed.xml");
  const rssAliasPath = path.join(dist, "rss.xml");
  const cat = readJson(path.join(dist, "site-data", "catalog.json")) || [];
  const cur = readJson(path.join(dist, "site-data", "curation_index.json")) || [];

  const catItems = (Array.isArray(cat) ? cat : [])
    .slice(0, 20)
    .map((c) => ({
      title: String(c.title || ""),
      link: String(c.url || `${base}/courses/${c.slug}.html`),
      guid: String(c.url || `${base}/courses/${c.slug}.html`),
      pubDate: nowRfc2822(),
    }));

  const curItems = (Array.isArray(cur) ? cur : [])
    .slice(0, 10)
    .map((c) => ({
      title: String(c.title || ""),
      link: `${base}${String(c.path || "")}`,
      guid: `${base}${String(c.path || "")}`,
      pubDate: nowRfc2822(),
    }));

  const feed = buildFeed(base, [...catItems, ...curItems]);
  fs.writeFileSync(feedPath, feed, "utf8");
  try {
    fs.writeFileSync(rssAliasPath, feed, "utf8");
  } catch {}
  process.stdout.write(JSON.stringify({ ok: true, feedPath }) + "\n");
}

main();
