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
