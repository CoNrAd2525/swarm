import { setTimeout as sleep } from "node:timers/promises";

function getEnv(name, def = "") {
  const v = process.env[name];
  return (v === undefined || v === null || String(v).trim() === "") ? def : String(v);
}

function asJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const body = await r.text();
  const j = asJson(body);
  return { status: r.status, ok: r.ok, body, json: j };
}

function buildUrl(base, path) {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function main() {
  const base = getEnv("SITE_PUBLIC_URL", "http://localhost:8080");
  const healthUrl = buildUrl(base, "/health");
  const apiUrl = buildUrl(
    base,
    "/api/paypal-link?amount=25&item=Monitor%20Ping",
  );

  const out = { base, checks: [] };

  // Health
  const h = await fetchJson(healthUrl);
  out.checks.push({ name: "health", url: healthUrl, status: h.status, ok: h.ok, json: h.json });
  if (!(h.ok && h.json && h.json.ok === true)) {
    console.error(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  // API (single call to avoid rate limits)
  await sleep(250);
  const a = await fetchJson(apiUrl);
  out.checks.push({ name: "api_paypal_link", url: apiUrl, status: a.status, ok: a.ok, json: a.json });
  if (!(a.ok && a.json && a.json.ok === true && typeof a.json.url === "string")) {
    console.error(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
});
