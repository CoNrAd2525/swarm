const http = require("http");
const https = require("https");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    res.end();
    return;
  }
  const url = new URL(req.url, "http://localhost");
  const path = url.searchParams.get("path") || "";
  const apiUrl = process.env.BASE44_API_URL || "";
  const serverUrl = process.env.BASE44_SERVER_URL || "";
  const appId = process.env.BASE44_APP_ID || "";
  const token = process.env.BASE44_SERVICE_TOKEN || "";
  let base = "";
  if (apiUrl) base = apiUrl.replace(/\/+$/, "") + "/apps/" + appId;
  else if (serverUrl) base = serverUrl.replace(/\/+$/, "") + "/api/apps/" + appId;
  else {
    res.statusCode = 500;
    res.end("missing_base44_api_url");
    return;
  }
  const dest = base + (path ? (path.startsWith("/") ? path : "/" + path) : "");
  const headers = { ...req.headers };
  delete headers.host;
  if (!headers.authorization && token) headers.authorization = `Bearer ${token}`;
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
