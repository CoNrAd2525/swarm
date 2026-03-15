import express from "express";
import path from "node:path";
import fs from "node:fs";
import { buildWebscrLink } from "./paypal-links.mjs";

function getEnvEmail() {
  const a = String(process.env.PAYPAL_OWNER_EMAIL || "").trim();
  const b = String(process.env.OWNER_PAYPAL_EMAIL || "").trim();
  return a || b || "";
}

function ensureStaticRoot() {
  const root = path.resolve("dist_rwc");
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

function numberFromQuery(q, name) {
  const v = q.get(name);
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function start({ port = 8080 } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", true);

  const allowlist = String(process.env.SITE_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const rateWindowMs = Number(process.env.SITE_RATE_WINDOW_MS || "60000");
  const rateMax = Number(process.env.SITE_RATE_MAX || "10");
  const buckets = new Map();
  function normalizeIp(ip) {
    const v = String(ip || "").trim();
    if (v.startsWith("::ffff:")) return v.replace("::ffff:", "");
    return v;
  }
  function checkAllowlist(req) {
    if (allowlist.length === 0) return true;
    const ip =
      normalizeIp(
        (req.headers["x-forwarded-for"] || "").toString().split(",")[0],
      ) || normalizeIp(req.ip);
    return allowlist.includes(ip);
  }
  function checkRateLimit(req) {
    const key =
      normalizeIp(
        (req.headers["x-forwarded-for"] || "").toString().split(",")[0],
      ) || normalizeIp(req.ip);
    const now = Date.now();
    const b = buckets.get(key) || { start: now, count: 0 };
    if (now - b.start > rateWindowMs) {
      b.start = now;
      b.count = 0;
    }
    b.count += 1;
    buckets.set(key, b);
    return b.count <= rateMax;
  }

  app.get("/api/paypal-link", (req, res) => {
    try {
      if (!checkAllowlist(req)) {
        res.status(403).json({ ok: false, error: "FORBIDDEN" });
        return;
      }
      if (!checkRateLimit(req)) {
        res.status(429).json({ ok: false, error: "RATE_LIMIT" });
        return;
      }
      const email = getEnvEmail();
      if (!email) {
        res.status(503).json({ ok: false, error: "OWNER_EMAIL_MISSING" });
        return;
      }
      const u = new URL(req.url, "http://localhost");
      const amount = numberFromQuery(u.searchParams, "amount");
      const item = u.searchParams.get("item") || "";
      const currency = (u.searchParams.get("currency") || "USD").toUpperCase();
      if (!amount || amount < 5) {
        res.status(400).json({ ok: false, error: "AMOUNT_TOO_LOW" });
        return;
      }
      if (!["USD", "EUR", "GBP"].includes(currency)) {
        res.status(400).json({ ok: false, error: "UNSUPPORTED_CURRENCY" });
        return;
      }
      const url = buildWebscrLink({
        amount,
        currency,
        businessEmail: email,
        merchantId: String(process.env.PAYPAL_MERCHANT_ID || "").trim() || undefined,
        itemName: item,
      });
      res.json({ ok: true, url });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  app.get("/api/payment-rails", (req, res) => {
    try {
      if (!checkAllowlist(req)) {
        res.status(403).json({ ok: false, error: "FORBIDDEN" });
        return;
      }
      if (!checkRateLimit(req)) {
        res.status(429).json({ ok: false, error: "RATE_LIMIT" });
        return;
      }
      const aliasPublic = String(process.env.CONTACT_ALIAS_PUBLIC || "").trim();
      const bankAlias = String(process.env.CONTACT_ALIAS_BANK || "").trim() || aliasPublic;
      const payoneerAlias =
        String(process.env.CONTACT_ALIAS_PAYONEER || "").trim() || aliasPublic;
      const trustWalletAddress = String(process.env.TRUST_WALLET_ADDRESS || "").trim();
      res.json({
        ok: true,
        paypal_email: aliasPublic,
        bank_email: bankAlias,
        payoneer_email: payoneerAlias,
        trust_wallet_usdt_erc20: trustWalletAddress,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  const staticRoot = ensureStaticRoot();
  app.use(express.static(staticRoot));
  app.use("/assets/catalogue", express.static(path.resolve("catalogue")));
  app.get("/videos/autonome.mp4", (req, res) => {
    try {
      const p = path.resolve("Nouveau dossier (3)", "IA__L_Économie_Autonome.mp4");
      if (!fs.existsSync(p)) {
        res.status(404).send("NOT_FOUND");
        return;
      }
      res.type("video/mp4");
      fs.createReadStream(p).pipe(res);
    } catch (e) {
      res.status(500).type("text/plain").send(String(e?.message ?? e));
    }
  });
  app.get("/rss.xml", (req, res) => {
    try {
      const p = path.join(staticRoot, "feed.xml");
      if (!fs.existsSync(p)) {
        res.status(404).type("text/plain").send("NOT_FOUND");
        return;
      }
      res.type("application/rss+xml");
      res.send(fs.readFileSync(p, "utf8"));
    } catch (e) {
      res.status(500).type("text/plain").send(String(e?.message ?? e));
    }
  });
  app.get("/sitemap.xml", (req, res) => {
    try {
      const base = String(process.env.SITE_PUBLIC_URL || "https://www.realworldcerts.com").replace(/\/+$/, "");
      const entries = [];
      function scan(dir) {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const it of items) {
          const full = path.join(dir, it.name);
          if (it.isDirectory()) {
            scan(full);
          } else if (it.isFile() && it.name.toLowerCase().endsWith(".html")) {
            const rel = full.replace(staticRoot, "").replace(/\\+/g, "/");
            const loc = rel === "/index.html" ? `${base}/` : `${base}${rel}`;
            const stat = fs.statSync(full);
            const lastmod = new Date(stat.mtimeMs || Date.now()).toISOString();
            entries.push({ loc, lastmod });
          }
        }
      }
      scan(staticRoot);
      const head = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
      const body = entries
        .map((e) => `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>\n`)
        .join("");
      const tail = "</urlset>\n";
      res.type("application/xml");
      res.send(head + body + tail);
    } catch (e) {
      res.status(500).type("text/plain").send(String(e?.message ?? e));
    }
  });
  app.get("/tutorials.html", (req, res) => {
    const html =
      '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Tutorials | RealWorldCerts</title><script src="https://cdn.tailwindcss.com"></script><link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml"><link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml"><style>body{font-family:Space Grotesk,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background-color:#0b0b0b;color:#fff}.glass{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12)}</style><meta name="robots" content="index,follow"></head><body class="min-h-screen"><main class="max-w-5xl mx-auto px-6 py-10"><header class="flex items-center justify-between mb-8"><h1 class="text-3xl md:text-4xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-rose-500">Video Tutorials</h1><a href="index.html" class="glass rounded-full px-4 py-2 text-xs font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-amber-300">Home</a></header><section class="grid grid-cols-1 lg:grid-cols-3 gap-6"><div class="lg:col-span-2 glass rounded-2xl p-4"><h2 class="text-xl font-semibold mb-3">Autonomous Economy Overview</h2><video controls preload="metadata" poster="/assets/catalogue/KR971273_1800x1800.webp" class="w-full rounded-xl shadow"><source src="/videos/autonome.mp4" type="video/mp4">Your browser does not support the video tag.</video><p class="text-sm text-white/70 mt-3">A full-length tutorial introducing autonomous economic systems and practical implementation steps.</p></div><aside class="glass rounded-2xl p-4"><h3 class="text-lg font-semibold mb-2">Resources</h3><ul class="text-sm text-white/80 space-y-2"><li>Quickstart guide to autonomous agents</li><li>Course notes and exercises</li><li>Project templates and datasets</li></ul></aside></section><section class="glass rounded-2xl p-6 mt-8"><h2 class="text-xl font-semibold mb-3">Code Examples</h2><pre class="bg-black/40 border border-white/10 rounded-xl p-4 text-sm overflow-auto"><code>class Agent {\\n  constructor(name){ this.name = name }\\n  async act(task){\\n    const plan = await this.plan(task)\\n    return await this.execute(plan)\\n  }\\n}</code></pre></section><section class="glass rounded-2xl p-6 mt-8"><h2 class="text-xl font-semibold mb-3">More Tutorials</h2><div class="grid grid-cols-1 sm:grid-cols-2 gap-4"><a class="glass rounded-xl p-4 hover:bg-white/10 transition-colors" href="#"><img src="/assets/catalogue/6111249077587.webp" alt="Course item" class="w-full h-32 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Designing agent workflows</div></a><a class="glass rounded-xl p-4 hover:bg-white/10 transition-colors" href="#"><img src="/assets/catalogue/AAAPD46616_img1.webp" alt="Course item" class="w-full h-32 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Scaling distributed swarms</div></a></div></section></main></body></html>';
    res.type("text/html").send(html);
  });
  app.get("/courses.html", (req, res) => {
    const html =
      '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Courses | RealWorldCerts</title><script src="https://cdn.tailwindcss.com"></script><link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml"><link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml"><style>body{font-family:Space Grotesk,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background-color:#0b0b0b;color:#fff}.glass{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12)}</style><meta name="robots" content="index,follow"></head><body class="min-h-screen"><main class="max-w-6xl mx-auto px-6 py-10"><header class="flex items-center justify-between mb-8"><h1 class="text-3xl md:text-4xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-rose-500">Courses</h1><a href="index.html" class="glass rounded-full px-4 py-2 text-xs font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-amber-300">Home</a></header><section class="glass rounded-2xl p-6"><h2 class="text-xl font-semibold mb-3">Featured</h2><div class="grid grid-cols-1 md:grid-cols-3 gap-6"><a class="glass rounded-xl p-4 hover:bg-white/10 transition-colors" href="tutorials.html"><img src="/assets/catalogue/M.School_Compas_Crayon_V90Titre27_95301f78-8014-4f22-8985-e72962e43abc.webp" alt="Featured" class="w-full h-40 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Autonomous Systems: Foundations</div></a><a class="glass rounded-xl p-4 hover:bg-white/10 transition-colors" href="#"><img src="/assets/catalogue/Scotch-clear-tapes-665x333.jpg" alt="Featured" class="w-full h-40 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Design Agent Patterns</div></a><a class="glass rounded-xl p-4 hover:bg-white/10 transition-colors" href="#"><img src="/assets/catalogue/AAABL73023_img1.webp" alt="Featured" class="w-full h-40 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Swarms and Collaboration</div></a></div></section><section class="glass rounded-2xl p-6 mt-8"><h2 class="text-xl font-semibold mb-3">Materials</h2><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div class="glass rounded-xl p-4"><img src="/assets/catalogue/iwTHmut1kZ4ls3FmG9Eh.jpg" alt="Material image" class="w-full h-40 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Downloadable notes, exercises, and project starters.</div></div><div class="glass rounded-xl p-4"><img src="/assets/catalogue/6111249070793-600x600-1748530776.jpg" alt="Material image" class="w-full h-40 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Case studies and real-world implementations.</div></div></div></section></main></body></html>';
    res.type("text/html").send(html);
  });
  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      staticRoot,
      rate: { window_ms: rateWindowMs, max: rateMax },
      allowlist_size: allowlist.length,
    });
  });
  app.get(/.*/, (req, res) => {
    const indexFile = path.join(staticRoot, "index.html");
    if (fs.existsSync(indexFile)) {
      res.sendFile(indexFile);
      return;
    }
    res.status(404).send("NOT_FOUND");
  });

  return app.listen(port, () => {
    const addr = `http://localhost:${port}/`;
    process.stdout.write(JSON.stringify({ ok: true, listening: addr }) + "\n");
  });
}

const port = Number(process.env.PORT || process.env.SITE_PORT || "8080");
start({ port });
