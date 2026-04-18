import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readText(p) {
	return fs.readFileSync(p, "utf8");
}

function writeTextIfChanged(p, text) {
	ensureDir(path.dirname(p));
	const next = String(text ?? "");
	try {
		const prev = fs.readFileSync(p, "utf8");
		if (prev === next) return false;
	} catch {}
	fs.writeFileSync(p, next, "utf8");
	return true;
}

function safeVal(v) {
	const s = String(v ?? "").trim();
	return s ? s : "";
}

function escapeHtml(s) {
	return String(s ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function getDomain() {
	return (
		safeVal(process.env.SITE_DOMAIN) ||
		safeVal(process.env.SITE_CNAME) ||
		"realworldcerts.com"
	);
}

function getSupportEmail() {
	return (
		safeVal(process.env.RWC_SUPPORT_EMAIL) ||
		safeVal(process.env.SUPPORT_EMAIL) ||
		safeVal(process.env.PAYPAL_OWNER_EMAIL) ||
		safeVal(process.env.OWNER_PAYPAL_EMAIL)
	);
}

function getIdentity() {
	const legalName = safeVal(process.env.RWC_LEGAL_NAME);
	const companyNumber = safeVal(process.env.RWC_COMPANY_NUMBER);
	const registeredAddress = safeVal(process.env.RWC_REGISTERED_ADDRESS);
	const jurisdiction = safeVal(process.env.RWC_JURISDICTION);
	const refundWindowDays = safeVal(process.env.RWC_REFUND_WINDOW_DAYS);
	return {
		legal_name: legalName,
		company_number: companyNumber,
		registered_address: registeredAddress,
		jurisdiction,
		refund_window_days: refundWindowDays,
		support_email: getSupportEmail(),
	};
}

function pageShell({ title, canonicalUrl, body }) {
	return [
		"<!doctype html>",
		"<html lang=\"en\">",
		"<head>",
		"  <meta charset=\"utf-8\">",
		"  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
		`  <title>${escapeHtml(title)}</title>`,
		`  <link rel=\"canonical\" href=\"${escapeHtml(canonicalUrl)}\">`,
		"  <link rel=\"stylesheet\" href=\"/assets/style.css\">",
		"</head>",
		"<body>",
		"  <header class=\"site\">",
		"    <div class=\"container row\">",
		"      <div class=\"brand\">",
		"        <div>",
		"          <h1 class=\"title\">RealWorldCerts</h1>",
		"          <div class=\"subtitle\">Trust & transparency</div>",
		"        </div>",
		"      </div>",
		"      <nav class=\"nav\">",
		"        <a href=\"/index.html\">Home</a>",
		"        <a href=\"/courses.html\">Courses</a>",
		"        <a href=\"/contact.html\">Support</a>",
		"        <a href=\"/about.html\">About</a>",
		"        <a href=\"/trust.html\">Trust</a>",
		"      </nav>",
		"    </div>",
		"  </header>",
		`  <main class=\"container\">${body}</main>`,
		"  <footer class=\"site\">",
		"    <div class=\"container\"><p>© RealWorldCerts</p></div>",
		"  </footer>",
		"</body>",
		"</html>",
	].join("\n");
}

function buildAboutHtml({ domain, identity }) {
	const blocks = [];
	blocks.push("<div class=\"card\">");
	blocks.push("<h2>About</h2>");
	blocks.push(
		"<p>This page lists operational and legal information to help customers verify legitimacy and reach support.</p>",
	);
	blocks.push("</div>");

	const rows = [];
	if (identity.legal_name) rows.push(["Legal name", identity.legal_name]);
	if (identity.company_number) rows.push(["Company number", identity.company_number]);
	if (identity.registered_address)
		rows.push(["Registered address", identity.registered_address]);
	if (identity.jurisdiction) rows.push(["Jurisdiction", identity.jurisdiction]);
	if (identity.support_email) rows.push(["Support email", identity.support_email]);
	rows.push(["Website", domain]);

	blocks.push("<div class=\"card\">");
	blocks.push("<h3>Identity</h3>");
	blocks.push("<div class=\"list\">");
	for (const [k, v] of rows) {
		blocks.push(
			`<p><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>`,
		);
	}
	blocks.push("</div>");
	blocks.push("</div>");

	blocks.push("<div class=\"card\">");
	blocks.push("<h3>Policies</h3>");
	blocks.push("<div class=\"list\">");
	blocks.push("<p><a href=\"/privacy.html\">Privacy Policy</a></p>");
	blocks.push("<p><a href=\"/terms.html\">Terms of Service</a></p>");
	blocks.push("<p><a href=\"/refund.html\">Refund &amp; Dispute Policy</a></p>");
	blocks.push("</div>");
	blocks.push("</div>");

	return pageShell({
		title: "About | RealWorldCerts",
		canonicalUrl: `https://${domain}/about.html`,
		body: blocks.join("\n"),
	});
}

function buildTrustHtml({ domain, identity }) {
	const blocks = [];
	blocks.push("<section class=\"hero\">");
	blocks.push("<h1>Trust Center</h1>");
	blocks.push(
		"<p>Clear policies, support routes, and verification details for customers and partners.</p>",
	);
	blocks.push("</section>");

	blocks.push("<div class=\"grid\">");
	blocks.push("<div class=\"card\">");
	blocks.push("<h3>Support</h3>");
	if (identity.support_email) {
		blocks.push(
			`<p>Email: <a href=\"mailto:${escapeHtml(identity.support_email)}\">${escapeHtml(identity.support_email)}</a></p>`,
		);
	}
	blocks.push("<p><a class=\"btn\" href=\"/contact.html\">Contact &amp; Support</a></p>");
	blocks.push("</div>");

	blocks.push("<div class=\"card\">");
	blocks.push("<h3>Policies</h3>");
	blocks.push("<p><a href=\"/refund.html\">Refund &amp; Dispute Policy</a></p>");
	blocks.push("<p><a href=\"/terms.html\">Terms of Service</a></p>");
	blocks.push("<p><a href=\"/privacy.html\">Privacy Policy</a></p>");
	blocks.push("</div>");

	blocks.push("<div class=\"card\">");
	blocks.push("<h3>Verification</h3>");
	blocks.push("<div class=\"list\">");
	if (identity.legal_name)
		blocks.push(`<p><strong>Legal name:</strong> ${escapeHtml(identity.legal_name)}</p>`);
	if (identity.company_number)
		blocks.push(
			`<p><strong>Company number:</strong> ${escapeHtml(identity.company_number)}</p>`,
		);
	if (identity.jurisdiction)
		blocks.push(
			`<p><strong>Jurisdiction:</strong> ${escapeHtml(identity.jurisdiction)}</p>`,
		);
	blocks.push(`<p><strong>Domain:</strong> ${escapeHtml(domain)}</p>`);
	blocks.push("</div>");
	blocks.push("</div>");
	blocks.push("</div>");

	return pageShell({
		title: "Trust Center | RealWorldCerts",
		canonicalUrl: `https://${domain}/trust.html`,
		body: blocks.join("\n"),
	});
}

function normalizeNavIndex(indexHtml) {
	if (indexHtml.includes("href=\"/trust.html\"")) return { changed: false, html: indexHtml };
	const m = indexHtml.match(/<nav class="nav">[\s\S]*?<\/nav>/);
	if (!m) return { changed: false, html: indexHtml };
	const nav = m[0];
	const insert =
		nav.replace(
			/(<a href="\/contact\.html">Support<\/a>)/,
			`$1\n        <a href="/about.html">About</a>\n        <a href="/trust.html">Trust</a>`,
		);
	if (insert === nav) return { changed: false, html: indexHtml };
	return { changed: true, html: indexHtml.replace(nav, insert) };
}

function buildReport({ domain, rankOut, identity, touched }) {
	const required = [
		"index.html",
		"courses.html",
		"payments.html",
		"contact.html",
		"privacy.html",
		"terms.html",
		"refund.html",
		"about.html",
		"trust.html",
	];
	const missing = required.filter((f) => !fs.existsSync(path.join(rankOut, f)));

	const trustSignals = {
		identity_present: Boolean(
			identity.legal_name || identity.company_number || identity.registered_address,
		),
		policies_present: ["privacy.html", "terms.html", "refund.html"].every((f) =>
			fs.existsSync(path.join(rankOut, f)),
		),
		support_present: Boolean(identity.support_email) && fs.existsSync(path.join(rankOut, "contact.html")),
	};

	const remedies = [];
	if (!trustSignals.identity_present)
		remedies.push({
			priority: "high",
			action: "Set RWC_LEGAL_NAME and (optionally) RWC_COMPANY_NUMBER/RWC_REGISTERED_ADDRESS/RWC_JURISDICTION in the live environment, then re-run.",
		});
	if (!trustSignals.support_present)
		remedies.push({
			priority: "high",
			action: "Set RWC_SUPPORT_EMAIL (or PAYPAL_OWNER_EMAIL) and ensure contact routes are monitored.",
		});
	if (missing.length)
		remedies.push({
			priority: "medium",
			action: `Add missing trust pages: ${missing.join(", ")}`,
		});

	return {
		at: new Date().toISOString(),
		domain,
		identity,
		missing_pages: missing,
		trust_signals: trustSignals,
		remedies,
		files_written: touched,
	};
}

function main() {
	const domain = getDomain();
	const identity = getIdentity();
	const rankOut = path.resolve("rank", "output");
	const outDataDir = path.join(rankOut, "site-data");
	const touched = [];

	const aboutHtml = buildAboutHtml({ domain, identity });
	if (writeTextIfChanged(path.join(rankOut, "about.html"), aboutHtml))
		touched.push("rank/output/about.html");

	const trustHtml = buildTrustHtml({ domain, identity });
	if (writeTextIfChanged(path.join(rankOut, "trust.html"), trustHtml))
		touched.push("rank/output/trust.html");

	const indexPath = path.join(rankOut, "index.html");
	try {
		const idx = readText(indexPath);
		const { changed, html } = normalizeNavIndex(idx);
		if (changed && writeTextIfChanged(indexPath, html))
			touched.push("rank/output/index.html");
	} catch {}

	const report = buildReport({ domain, rankOut, identity, touched });
	ensureDir(outDataDir);
	writeTextIfChanged(
		path.join(outDataDir, "trust_report.json"),
		`${JSON.stringify(report, null, 2)}\n`,
	);
	console.log(JSON.stringify({ ok: true, report_path: "rank/output/site-data/trust_report.json", report }));
}

main();
