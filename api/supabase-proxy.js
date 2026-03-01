const http = require("http");
const https = require("https");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey, X-Requested-With");
    res.end();
    return;
  }
  const url = new URL(req.url, "http://localhost");
  const path = url.searchParams.get("path") || "";
  const baseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!baseUrl) {
    res.statusCode = 500;
    res.end("missing_supabase_url");
    return;
  }
  const dest = baseUrl + (path ? (path.startsWith("/") ? path : "/" + path) : "");
  const headers = { ...req.headers };
  delete headers.host;
  if (key) {
    headers.authorization = headers.authorization || `Bearer ${key}`;
    headers.apikey = headers.apikey || key;
  }
  const body = await new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
  const h = dest.startsWith("https:") ? https : http;
  const r = await new Promise((resolve, reject) => {
    const u = new URL(dest);
    const opts = {
      method: req.method,
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + (u.search || ""),
      headers,
    };
    const p = h.request(opts, (pr) => {
      const chunks = [];
      pr.on("data", (c) => chunks.push(c));
      pr.on("end", () => resolve({ status: pr.statusCode || 502, headers: pr.headers, body: Buffer.concat(chunks) }));
    });
    p.on("error", reject);
    if (body && body.length) p.write(body);
    p.end();
  });
  res.statusCode = r.status;
  Object.entries(r.headers || {}).forEach(([k, v]) => {
    if (k.toLowerCase() === "content-length") return;
    res.setHeader(k, v);
  });
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(r.body);
};
