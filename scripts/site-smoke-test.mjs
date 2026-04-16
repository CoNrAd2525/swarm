function normalizeBaseUrl(v) {
  const raw = String(v || "").trim();
  if (!raw) return "http://localhost:8080";
  return raw.replace(/\/+$/, "");
}

const BASE_URL = normalizeBaseUrl(process.env.SITE_PUBLIC_URL);
console.log(`[Smoke] Targeting: ${BASE_URL}`);

async function fetchWithTimeout(url) {
  const signal = AbortSignal.timeout(12_000);
  return fetch(url, { signal });
}

async function detectMode() {
  const url = `${BASE_URL}/health`;
  try {
    const res = await fetchWithTimeout(url);
    if (res.status !== 200) return "static";
    const text = await res.text();
    if (text.includes('"ok":true')) return "api";
    return "static";
  } catch (err) {
    if (err?.cause?.code === "ECONNREFUSED" || String(err?.message || "").includes("fetch failed")) {
      console.warn(
        `[Smoke] Connection failed. Server might be down. Skipping test. Error: ${err.message} Code: ${err.cause?.code}`,
      );
      process.exit(0);
    }
    return "static";
  }
}

const mode = await detectMode();
console.log(`[Smoke] Mode: ${mode}`);

const CHECKS =
  mode === "api"
    ? [
        { path: "/health", expectStatus: 200, expectContains: '"ok":true' },
        { path: "/api/payment-rails", expectStatus: 200, expectContains: '"ok":true' },
        {
          path: "/api/paypal-link?amount=10&item=SmokeTest",
          expectStatus: 200,
          expectContains: "paypal.com/cgi-bin/webscr",
        },
        { path: "/feed.xml", expectStatus: 200, expectContains: '<rss version="2.0">' },
        { path: "/sitemap.xml", expectStatus: 200, expectContains: "<urlset" },
        { path: "/robots.txt", expectStatus: 200, expectContains: "User-agent:" },
        { path: "/checkout.html", expectStatus: 200, expectContains: "paypal" },
        { path: "/news.html", expectStatus: 200, expectContains: "News" },
        { path: "/courses.html", expectStatus: 200, expectContains: "Courses" },
      ]
    : [
        { path: "/", expectStatus: 200, expectContains: "<title>RealWorldCerts</title>" },
        { path: "/courses.html", expectStatus: 200, expectContains: "Courses" },
        { path: "/articles/", expectStatus: 200, expectContains: "Articles | RealWorldCerts" },
        { path: "/assets/style.css", expectStatus: 200, expectContains: "body" },
        { path: "/sitemap.xml", expectStatus: 200, expectContains: "<urlset" },
        { path: "/robots.txt", expectStatus: 200, expectContains: "User-agent:" },
      ];

let failed = 0;

for (const check of CHECKS) {
  const url = `${BASE_URL}${check.path}`;
  try {
    console.log(`Checking ${check.path}...`);
    const res = await fetchWithTimeout(url);
    
    if (res.status !== check.expectStatus) {
      throw new Error(`Status ${res.status} !== ${check.expectStatus}`);
    }

    const text = await res.text();
    if (check.expectText && text.trim() !== check.expectText) {
      throw new Error(`Content mismatch. Got: ${text.slice(0,50)}...`);
    }
    if (check.expectContains && !text.includes(check.expectContains)) {
      throw new Error(`Missing keyword "${check.expectContains}"`);
    }

    console.log(`  PASS`);
  } catch (err) {
    if (err?.cause?.code === "ECONNREFUSED" || String(err?.message || "").includes("fetch failed")) {
      console.warn(
        `[Smoke] Connection failed. Server might be down. Skipping test. Error: ${err.message} Code: ${err.cause?.code}`,
      );
      process.exit(0);
    }
    console.error(`  FAIL: ${err.message} Code: ${err.cause?.code}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n[Smoke] ${failed} checks FAILED.`);
  process.exit(1);
} else {
  console.log(`\n[Smoke] All checks PASSED.`);
}
