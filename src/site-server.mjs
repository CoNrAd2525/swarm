import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { buildBase44ServiceClient } from "./base44-client.mjs";
import {
	appendClassroomRequest,
	getClassroomRequestMetrics,
} from "./classroom/ClassroomRequests.mjs";
import { buildWebscrLink } from "./paypal-links.mjs";
import { cspSecurityMiddleware } from "./security-middleware.mjs";

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

function safeStr(x, max = 200) {
	return String(x ?? "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, max);
}

function sha256Hex(s) {
	return crypto
		.createHash("sha256")
		.update(String(s ?? ""))
		.digest("hex");
}

function start({ port = 8080 } = {}) {
	const app = express();

	app.disable("x-powered-by");
	app.set("trust proxy", true);
	app.set("etag", "strong");
	app.use(cspSecurityMiddleware);

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

	app.get("/status.json", (_req, res) => {
		try {
			const staticRoot = ensureStaticRoot();
			const rssExists = fs.existsSync(path.join(staticRoot, "feed.xml"));
			const indexExists = fs.existsSync(path.join(staticRoot, "index.html"));
			const rankOutput = path.resolve("rank", "output");
			const rankExists = fs.existsSync(rankOutput);
			res.json({
				ok: true,
				uptime_ms: Math.round(process.uptime() * 1000),
				static_root: staticRoot,
				rss_exists: rssExists,
				index_exists: indexExists,
				rank_output_exists: rankExists,
			});
		} catch (e) {
			res.status(500).json({ ok: false, error: String(e?.message ?? e) });
		}
	});

	// Dynamic Landing Page (if no static index.html present)
	app.get(["/", "/index.html"], (_req, res, next) => {
		try {
			const staticRoot = ensureStaticRoot();
			const indexFile = path.join(staticRoot, "index.html");
			if (fs.existsSync(indexFile)) {
				res.sendFile(indexFile);
				return;
			}
			const nonce = res.locals?.cspNonce || "";
			const base = String(
				process.env.SITE_PUBLIC_URL || "https://www.realworldcerts.com",
			).replace(/\/+$/, "");
			const cards = [
				{ title: "AWS Solutions Architect", tag: "AWS", href: "/news.html" },
				{ title: "Azure Administrator", tag: "Azure", href: "/news.html" },
				{
					title: "Best Exam Dumps Alternatives",
					tag: "Study Ethics",
					href: "/news.html",
				},
				{ title: "Kubernetes CKA", tag: "Kubernetes", href: "/news.html" },
				{ title: "Cisco CCNA", tag: "Networking", href: "/news.html" },
				{ title: "CompTIA A+", tag: "Hardware", href: "/news.html" },
				{ title: "CEH", tag: "Cybersecurity", href: "/news.html" },
				{ title: "Google Cloud Architect", tag: "GCP", href: "/news.html" },
				{ title: "CISSP", tag: "Security", href: "/news.html" },
				{ title: "ITIL 4", tag: "ITSM", href: "/news.html" },
				{ title: "PMP", tag: "Project Mgmt", href: "/news.html" },
			];
			const cardsHtml = cards
				.map(
					(c) =>
						`<a class="glass rounded-2xl p-5 hover:bg-white/10 transition-colors flex flex-col gap-2" href="${c.href}">
							<div class="text-xs uppercase tracking-widest text-amber-300 font-bold">${c.tag}</div>
							<div class="text-lg md:text-xl font-semibold text-white/90">${c.title}</div>
							<div class="text-xs text-white/60">Guides • FAQs • Resources</div>
						</a>`,
				)
				.join("");
			const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>RealWorldCerts | Guides & Resources</title><script nonce="${nonce}" src="https://cdn.tailwindcss.com"></script><link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml"><link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml"><meta name="robots" content="index,follow"><style>body{font-family:Space Grotesk,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:radial-gradient(1200px 600px at 20% 10%,#111 0,#0b0b0b 60%,#080808 100%);color:#fff}.glass{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12)}.chip{display:inline-block;padding:6px 10px;border:1px solid rgba(255,255,255,.18);border-radius:9999px;font-size:12px;color:#fcd34d;background:rgba(34,34,34,.6)}</style></head><body class="min-h-screen"><main class="max-w-6xl mx-auto px-6 py-10"><header class="flex items-center justify-between mb-10"><div><div class="text-xs text-white/60">RealWorldCerts</div><h1 class="text-3xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-400 via-rose-500 to-violet-500">Practical Guides for IT Certifications</h1></div><nav class="flex items-center gap-3"><a href="${base}/courses.html" class="chip">Courses</a><a href="${base}/news.html" class="chip">News</a><a href="${base}/checkout.html" class="chip">Checkout</a></nav></header><section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">${cardsHtml}</section><section class="glass rounded-2xl p-6 mt-10"><h2 class="text-xl font-semibold mb-2">Always Fresh</h2><p class="text-white/70 text-sm">New guides appear automatically in the <a class="text-amber-300" href="/sitemap.xml">sitemap</a> and <a class="text-amber-300" href="/rss.xml">RSS feed</a>. Designed for scanning: FAQs, resources, and social-ready snippets.</p></section><footer class="text-xs text-white/50 mt-10">© ${new Date().getFullYear()} RealWorldCerts • Learn by doing</footer></main></body></html>`;
			res.type("text/html").send(html);
		} catch (e) {
			next(e);
		}
	});

	const api = express.Router();
	app.use("/api", api);

	api.get("/paypal-link", (req, res) => {
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
			const explicitRef = (u.searchParams.get("ref") || "").trim();
			const ref =
				explicitRef ||
				`rwc_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
			if (!amount || amount < 5) {
				res.status(400).json({ ok: false, error: "AMOUNT_TOO_LOW" });
				return;
			}
			if (!["USD", "EUR", "GBP"].includes(currency)) {
				res.status(400).json({ ok: false, error: "UNSUPPORTED_CURRENCY" });
				return;
			}
			const siteBase = String(process.env.SITE_PUBLIC_URL || "").replace(
				/\/+$/,
				"",
			);
			const notifyUrl = siteBase ? `${siteBase}/paypal/ipn` : undefined;
			const returnUrl = siteBase
				? `${siteBase}/checkout.html?paid=1&ref=${encodeURIComponent(ref)}`
				: undefined;
			const cancelReturnUrl = siteBase
				? `${siteBase}/checkout.html?cancel=1&ref=${encodeURIComponent(ref)}`
				: undefined;
			const url = buildWebscrLink({
				amount,
				currency,
				businessEmail: email,
				merchantId:
					String(process.env.PAYPAL_MERCHANT_ID || "").trim() || undefined,
				itemName: item ? `${item} (${ref})` : ref,
				customId: ref,
				notifyUrl,
				returnUrl,
				cancelReturnUrl,
			});
			res.json({ ok: true, url, ref, notify_url_set: Boolean(notifyUrl) });
		} catch (e) {
			res.status(500).json({ ok: false, error: String(e?.message ?? e) });
		}
	});

	api.post(
		"/paypal/webhook",
		express.text({ type: "application/json" }),
		async (req, res) => {
			try {
				console.log(`[IPN] Received POST request to /paypal/ipn`);
				const raw = String(req.body || "");
				const headers = req.headers || {};
				const env =
					String(process.env.PAYPAL_ENV || "").toLowerCase() || "sandbox";
				const domain =
					env === "live"
						? "https://api.paypal.com"
						: "https://api.sandbox.paypal.com";
				const clientId = String(process.env.PAYPAL_CLIENT_ID || "").trim();
				const secret = String(process.env.PAYPAL_SECRET || "").trim();
				const webhookId = String(process.env.PAYPAL_WEBHOOK_ID || "").trim();
				let verification = { attempted: false, status: "SKIPPED" };
				if (clientId && secret && webhookId) {
					try {
						const cred = Buffer.from(`${clientId}:${secret}`).toString(
							"base64",
						);
						const tokenRes = await fetch(`${domain}/v1/oauth2/token`, {
							method: "POST",
							headers: {
								authorization: `Basic ${cred}`,
								"content-type": "application/x-www-form-urlencoded",
							},
							body: "grant_type=client_credentials",
						});
						const tokenJson = await tokenRes.json();
						const access = String(tokenJson.access_token || "");
						if (access) {
							const bodyObj = JSON.parse(raw || "{}");
							const verifyPayload = {
								auth_algo:
									headers["paypal-auth-algo"] ||
									headers["paypal-auth-algo".toLowerCase()],
								cert_url:
									headers["paypal-cert-url"] ||
									headers["paypal-cert-url".toLowerCase()],
								transmission_id:
									headers["paypal-transmission-id"] ||
									headers["paypal-transmission-id".toLowerCase()],
								transmission_sig:
									headers["paypal-transmission-sig"] ||
									headers["paypal-transmission-sig".toLowerCase()],
								transmission_time:
									headers["paypal-transmission-time"] ||
									headers["paypal-transmission-time".toLowerCase()],
								webhook_id: webhookId,
								webhook_event: bodyObj,
							};
							const vRes = await fetch(
								`${domain}/v1/notifications/verify-webhook-signature`,
								{
									method: "POST",
									headers: {
										authorization: `Bearer ${access}`,
										"content-type": "application/json",
									},
									body: JSON.stringify(verifyPayload),
								},
							);
							const vJson = await vRes.json();
							verification = {
								attempted: true,
								status: String(vJson.verification_status || "UNKNOWN"),
							};
						}
					} catch (err) {
						verification = {
							attempted: true,
							status: `ERROR:${String(err?.message ?? err)}`,
						};
					}
				}
				const body = JSON.parse(raw || "{}");
				const record = {
					kind: "paypal_webhook",
					verification,
					timestamp: new Date().toISOString(),
					event_type: String(body.event_type || ""),
					resource_type: String(body.resource_type || ""),
					resource_id: String(body?.resource?.id || ""),
					custom_id: String(
						body?.resource?.custom_id ||
							body?.resource?.invoice_id ||
							body?.resource?.id ||
							"",
					),
					raw_sha256: crypto.createHash("sha256").update(raw).digest("hex"),
				};
				const dir = path.resolve("logs", "paypal_webhooks");
				fs.mkdirSync(dir, { recursive: true });
				const token = String(record.resource_id || Date.now())
					.replace(/[^a-zA-Z0-9_-]+/g, "_")
					.slice(0, 80);
				const out = path.join(dir, `webhook_${Date.now()}_${token}.json`);
				fs.writeFileSync(
					out,
					JSON.stringify({ headers, record, body }, null, 2),
					"utf8",
				);
				res.status(200).type("text/plain").send("OK");
			} catch (_e) {
				res.status(200).type("text/plain").send("OK");
			}
		},
	);

	api.get("/revenue/state", (req, res) => {
		try {
			if (!checkAllowlist(req)) {
				res.status(403).json({ ok: false, error: "FORBIDDEN" });
				return;
			}
			if (!checkRateLimit(req)) {
				res.status(429).json({ ok: false, error: "RATE_LIMIT" });
				return;
			}
			const u = new URL(req.url, "http://localhost");
			const ref = (u.searchParams.get("ref") || "").trim();
			const daysWindow = Math.max(
				0,
				Math.min(30, Number(u.searchParams.get("days") || "7")),
			);
			const amountTol = Math.max(
				0,
				Math.min(1000, Number(u.searchParams.get("amount_tol") || "0.01")),
			);
			if (!ref) {
				res.status(400).json({ ok: false, error: "REF_REQUIRED" });
				return;
			}
			function findIpnProofs() {
				const dir = path.resolve("logs", "paypal_ipn");
				if (!fs.existsSync(dir)) return [];
				return fs
					.readdirSync(dir)
					.filter((n) => n.endsWith(".json"))
					.map((n) => path.join(dir, n))
					.map((p) => JSON.parse(fs.readFileSync(p, "utf8")))
					.filter((x) => String(x.custom || "") === ref);
			}
			function findWebhookProofs() {
				const dir = path.resolve("logs", "paypal_webhooks");
				if (!fs.existsSync(dir)) return [];
				return fs
					.readdirSync(dir)
					.filter((n) => n.endsWith(".json"))
					.map((n) => path.join(dir, n))
					.map((p) => JSON.parse(fs.readFileSync(p, "utf8")))
					.filter((x) => String(x?.record?.custom_id || "") === ref);
			}
			function getOwnerNotifications() {
				const p = path.resolve("logs", "owner_notification.json");
				if (!fs.existsSync(p)) return [];
				try {
					const raw = fs.readFileSync(p, "utf8");
					const obj = JSON.parse(raw);
					const arr = Array.isArray(obj) ? obj : obj?.notifications || [];
					return arr;
				} catch {
					return [];
				}
			}
			function parsePayoutCsvText(text) {
				const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
				if (lines.length < 2) return [];
				const headerRaw = lines[0].split(",").map((s) => s.trim());
				const header = headerRaw.map((h) =>
					h.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
				);
				const rows = lines.slice(1).map((line) => {
					const cols = line.split(",").map((s) => s.trim());
					const row = {};
					header.forEach((h, i) => {
						row[h] = cols[i] ?? "";
					});
					const refText =
						row.reference ||
						row.description ||
						row.details ||
						row.memo ||
						row.note ||
						"";
					const amountText =
						row.amount || row.total || row.gross || row.value || "";
					const currencyText = row.currency || row.ccy || row.curr || "";
					const recipientText =
						row.payee ||
						row.recipient ||
						row.beneficiary ||
						row.counterparty ||
						row.name ||
						row.email ||
						"";
					const dateText =
						row.date ||
						row.created ||
						row.timestamp ||
						row.settlement_date ||
						"";
					const amount = Number(String(amountText).replace(/[^\d.-]+/g, ""));
					const currency =
						String(currencyText || "")
							.toUpperCase()
							.slice(0, 6) || "";
					return {
						date: dateText,
						amount_num: Number.isFinite(amount) ? amount : null,
						currency,
						recipient: recipientText,
						reference_text: refText,
						raw: row,
					};
				});
				return rows;
			}
			function listNormalizedPayouts() {
				const out = [];
				const root = path.resolve(".");
				const rootFiles = fs
					.readdirSync(root)
					.filter(
						(n) =>
							/payoneer_payout|wise_payout|payout/i.test(n) &&
							n.endsWith(".csv"),
					);
				for (const name of rootFiles) {
					try {
						const text = fs.readFileSync(path.join(root, name), "utf8");
						for (const r of parsePayoutCsvText(text)) {
							out.push({ source_file: name, ...r });
						}
					} catch {}
				}
				const payoutDir = path.resolve("logs", "payouts");
				if (fs.existsSync(payoutDir)) {
					const payoutFiles = fs
						.readdirSync(payoutDir)
						.filter((n) => n.endsWith(".csv"));
					for (const name of payoutFiles) {
						try {
							const text = fs.readFileSync(path.join(payoutDir, name), "utf8");
							for (const r of parsePayoutCsvText(text)) {
								out.push({ source_file: name, ...r });
							}
						} catch {}
					}
				}
				return out;
			}
			function providerAmountCurrency() {
				const ipn = findIpnProofs();
				for (const x of ipn) {
					const amt = Number(String(x.gross || "").replace(/[^\d.-]+/g, ""));
					const cur = String(x.currency || "").toUpperCase();
					const ts = Date.parse(String(x.timestamp || ""));
					if (Number.isFinite(amt) && cur)
						return { amt, cur, ts: Number.isFinite(ts) ? ts : 0 };
				}
				const wh = findWebhookProofs();
				for (const x of wh) {
					const cur = String(
						x?.body?.resource?.amount?.currency_code ||
							x?.record?.amount?.currency_code ||
							"",
					)
						.toUpperCase()
						.slice(0, 6);
					const val = Number(
						String(
							x?.body?.resource?.amount?.value ||
								x?.record?.amount?.value ||
								"",
						).replace(/[^\d.-]+/g, ""),
					);
					const t =
						Date.parse(String(x?.body?.resource?.update_time || "")) ||
						Date.parse(String(x?.body?.resource?.create_time || "")) ||
						Date.parse(String(x?.record?.timestamp || ""));
					if (Number.isFinite(val) && cur)
						return { amt: val, cur, ts: Number.isFinite(t) ? t : 0 };
				}
				return null;
			}
			function payoutStrictMatch() {
				const all = listNormalizedPayouts();
				const prov = providerAmountCurrency();
				for (const r of all) {
					const combined = JSON.stringify(r).toLowerCase();
					const hitRef = combined.includes(ref.toLowerCase());
					if (!hitRef) continue;
					if (prov) {
						if (r.currency && r.amount_num !== null) {
							const sameCur =
								String(r.currency || "").toUpperCase() === prov.cur;
							const diff = Math.abs(Number(r.amount_num) - Number(prov.amt));
							const rts = Date.parse(String(r.date || ""));
							const dWin = Number(daysWindow) * 86400000;
							const tsOk =
								!Number.isFinite(Number(prov.ts)) ||
								!Number.isFinite(rts) ||
								Math.abs(rts - Number(prov.ts)) <= dWin;
							if (sameCur && diff <= Number(amountTol) && tsOk) return true;
						}
					} else {
						return true;
					}
				}
				return false;
			}
			function computeState() {
				const ipn = findIpnProofs();
				const ipnVerified = ipn.some(
					(x) =>
						x.verified === true &&
						String(x.payment_status || "").toLowerCase() === "completed",
				);
				const wh = findWebhookProofs();
				const whVerified = wh.some(
					(x) =>
						String(x?.record?.verification?.status || "").toUpperCase() ===
							"SUCCESS" &&
						String(x?.record?.event_type || "")
							.toUpperCase()
							.includes("PAYMENT") &&
						String(x?.record?.event_type || "")
							.toUpperCase()
							.includes("COMPLETED"),
				);
				const ownerNotes = getOwnerNotifications();
				const ownerMentionsRef = ownerNotes.some((n) =>
					JSON.stringify(n).toLowerCase().includes(ref.toLowerCase()),
				);
				const payoutMention = payoutStrictMatch();
				if (ipnVerified || whVerified) {
					if (ownerMentionsRef || payoutMention) {
						return "SETTLED_OWNER";
					}
					return "VERIFIED_PROVIDER";
				}
				return "UNCONFIRMED";
			}
			const state = computeState();
			const details = {
				ipn_count: findIpnProofs().length,
				webhook_count: findWebhookProofs().length,
				payout_mention: payoutMentionsRef(),
			};
			res.json({ ok: true, ref, state, details });
		} catch (e) {
			res.status(500).json({ ok: false, error: String(e?.message ?? e) });
		}
	});

	api.get("/analytics/export-augmented", (req, res) => {
		try {
			if (!checkAllowlist(req)) {
				res.status(403).json({ ok: false, error: "FORBIDDEN" });
				return;
			}
			const csvName = "Analytics_export (8).csv";
			const p = path.resolve(csvName);
			if (!fs.existsSync(p)) {
				res.json({ ok: true, items: [], note: "csv_not_found" });
				return;
			}
			const text = fs.readFileSync(p, "utf8");
			const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
			if (lines.length === 0) {
				res.json({ ok: true, items: [] });
				return;
			}
			const header = lines[0].split(",");
			const items = lines.slice(1).map((line) => {
				const cols = line.split(",");
				const obj = {};
				header.forEach((h, i) => {
					obj[h] = cols[i] ?? "";
				});
				obj.proof_status = "UNCONFIRMED";
				obj.proof_reason = "No external_proof_ref to correlate artifacts";
				return obj;
			});
			res.json({ ok: true, items });
		} catch (e) {
			res.status(500).json({ ok: false, error: String(e?.message ?? e) });
		}
	});
	api.get("/payment-rails", (req, res) => {
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
			const bankAlias =
				String(process.env.CONTACT_ALIAS_BANK || "").trim() || aliasPublic;
			const payoneerAlias =
				String(process.env.CONTACT_ALIAS_PAYONEER || "").trim() || aliasPublic;
			const trustWalletAddress = String(
				process.env.TRUST_WALLET_ADDRESS || "",
			).trim();
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
	// --- Dynamic Routes ---
	app.get("/status", (_req, res) => {
		try {
			const staticRoot = ensureStaticRoot();
			const rssExists = fs.existsSync(path.join(staticRoot, "feed.xml"));
			const indexExists = fs.existsSync(path.join(staticRoot, "index.html"));
			const rankOutput = path.resolve("rank", "output");
			const rankExists = fs.existsSync(rankOutput);
			res.json({
				ok: true,
				uptime_ms: Math.round(process.uptime() * 1000),
				static_root: staticRoot,
				rss_exists: rssExists,
				index_exists: indexExists,
				rank_output_exists: rankExists,
			});
		} catch (e) {
			res.status(500).json({ ok: false, error: String(e?.message ?? e) });
		}
	});

	// --- Static Assets ---
	const staticRoot = ensureStaticRoot();
	app.use(express.static(staticRoot));
	const rankOutput = path.resolve("rank", "output");
	if (fs.existsSync(rankOutput)) {
		app.use(express.static(rankOutput));
	}
	app.use("/assets/catalogue", express.static(path.resolve("catalogue")));
	app.get("/videos/autonome.mp4", (_req, res) => {
		try {
			const p = path.resolve(
				"Nouveau dossier (3)",
				"IA__L_Économie_Autonome.mp4",
			);
			if (!fs.existsSync(p)) {
				res.status(404).send("NOT_FOUND");
				return;
			}
			res.type("video/mp4");
			fs.createReadStream(p).pipe(res);
		} catch (e) {
			res
				.status(500)
				.type("text/plain")
				.send(String(e?.message ?? e));
		}
	});
	app.get("/rss.xml", (_req, res) => {
		try {
			const p = path.join(staticRoot, "feed.xml");
			if (!fs.existsSync(p)) {
				res.status(404).type("text/plain").send("NOT_FOUND");
				return;
			}
			res.setHeader("Cache-Control", "public, max-age=300");
			res.type("application/rss+xml");
			res.send(fs.readFileSync(p, "utf8"));
		} catch (e) {
			res
				.status(500)
				.type("text/plain")
				.send(String(e?.message ?? e));
		}
	});
	app.get("/robots.txt", (_req, res) => {
		try {
			const base = String(
				process.env.SITE_PUBLIC_URL || "https://www.realworldcerts.com",
			).replace(/\/+$/, "");
			const body = `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
			res.type("text/plain").send(body);
		} catch (e) {
			res
				.status(500)
				.type("text/plain")
				.send(String(e?.message ?? e));
		}
	});
	app.get("/interactive-classroom", (req, res) => {
		try {
			const q = new URL(req.originalUrl, "http://localhost").searchParams;
			const cert = safeStr(q.get("cert") || "", 120);
			const nonce = res.locals?.cspNonce || "";
			const title = cert
				? `Interactive Classroom: ${cert} | RealWorldCerts`
				: "Interactive Classroom | RealWorldCerts";
			const certEsc = cert
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;");
			const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title><meta name="robots" content="index,follow"><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0b0b;color:#fff;margin:0}a{color:#f59e0b;text-decoration:none}.wrap{max-width:980px;margin:0 auto;padding:24px}input,select,button,textarea{padding:10px 12px;border-radius:10px;border:1px solid #333;background:#111;color:#fff;outline:none}button{cursor:pointer}.card{backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:16px;margin:16px 0}.muted{color:#bdbdbd;font-size:14px}.row{display:flex;gap:12px;flex-wrap:wrap}.row>div{flex:1;min-width:220px}</style></head><body><main class="wrap"><header class="card"><h1 style="margin:0;background-image:linear-gradient(90deg,#f59e0b,#f43f5e);-webkit-background-clip:text;background-clip:text;color:transparent">Interactive Classroom</h1><p class="muted" style="margin:10px 0 0 0">Generate an interactive lesson with quizzes, simulations, and project-based practice.</p></header><section class="card"><h2 style="margin-top:0">Request a classroom</h2><div class="row"><div><label>Certification<br><input id="cert" value="${certEsc}" placeholder="e.g. AWS Solutions Architect Associate"/></label></div><div><label>Goal<br><select id="goal"><option value="practice">Practice questions</option><option value="lab">Hands-on lab</option><option value="pbl">Project-based learning</option></select></label></div></div><div style="margin-top:12px"><label>Notes (optional)<br><textarea id="notes" rows="3" style="width:100%" placeholder="What should the lesson focus on?"></textarea></label></div><div class="row" style="margin-top:12px"><div><label>Email (optional)<br><input id="email" placeholder="you@domain.com"/></label><div class="muted" style="margin-top:6px">Stored as a one-way hash for dedupe.</div></div><div style="display:flex;align-items:flex-end;justify-content:flex-end"><button id="submit">Request</button></div></div><div id="result" class="muted" style="margin-top:10px"></div></section><section class="card"><h2 style="margin-top:0">Try it now</h2><p class="muted">For instant access, open an interactive classroom generator.</p><p><a href="https://open.maic.chat" rel="noreferrer">Open interactive classroom (hosted)</a></p></section><footer class="muted"><a href="/index.html">Home</a> • <a href="/sitemap.xml">Sitemap</a></footer></main><script nonce="${nonce}">const $=id=>document.getElementById(id);$('submit').addEventListener('click', async ()=>{const payload={cert:$('cert').value,goal:$('goal').value,notes:$('notes').value,email:$('email').value};$('result').textContent='Submitting...';try{const r=await fetch('/api/classroom/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok||!j.ok) throw new Error(j.error||'Request failed');$('result').textContent='Request received. Ref: '+j.id;}catch(e){$('result').textContent='Error: '+String(e?.message||e);}});</script></body></html>`;
			res.type("text/html").send(html);
		} catch (e) {
			res
				.status(500)
				.type("text/plain")
				.send(String(e?.message ?? e));
		}
	});
	app.post(
		"/api/classroom/request",
		express.json({ limit: "20kb" }),
		async (req, res) => {
			try {
				if (!checkAllowlist(req)) {
					res.status(403).json({ ok: false, error: "forbidden" });
					return;
				}
				if (!checkRateLimit(req)) {
					res.status(429).json({ ok: false, error: "rate_limited" });
					return;
				}
				const cert = safeStr(req.body?.cert || "", 120);
				if (!cert) {
					res.status(400).json({ ok: false, error: "missing_cert" });
					return;
				}
				const goal = safeStr(req.body?.goal || "practice", 40);
				const notes = safeStr(req.body?.notes || "", 500);
				const emailRaw = safeStr(req.body?.email || "", 160).toLowerCase();
				const emailHash = emailRaw ? sha256Hex(`rwc:${emailRaw}`) : null;
				const id = `cls_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
				const ip =
					normalizeIp(
						(req.headers["x-forwarded-for"] || "").toString().split(",")[0],
					) || normalizeIp(req.ip);
				const ua = safeStr(req.headers["user-agent"] || "", 200);
				const record = {
					id,
					at: Date.now(),
					cert,
					goal,
					notes,
					email_hash: emailHash,
					ip_hash: sha256Hex(`ip:${ip}`),
					ua,
				};
				await appendClassroomRequest(record);
				const logDir = path.resolve("logs");
				fs.mkdirSync(logDir, { recursive: true });
				fs.appendFileSync(
					path.join(logDir, "classroom_requests.jsonl"),
					`${JSON.stringify(record)}\n`,
					"utf8",
				);
				res.json({ ok: true, id });
			} catch (e) {
				res.status(500).json({ ok: false, error: String(e?.message ?? e) });
			}
		},
	);
	app.get("/api/classroom/metrics", async (req, res) => {
		try {
			if (!checkAllowlist(req)) {
				res.status(403).json({ ok: false, error: "forbidden" });
				return;
			}
			if (!checkRateLimit(req)) {
				res.status(429).json({ ok: false, error: "rate_limited" });
				return;
			}
			const m = await getClassroomRequestMetrics({});
			res.json({ ok: true, total: m.total, last24h: m.last_window });
		} catch (e) {
			res.status(500).json({ ok: false, error: String(e?.message ?? e) });
		}
	});
	app.get("/owner-dashboard.html", (_req, res) => {
		const nonce = res.locals?.cspNonce || "";
		const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Owner Dashboard | RealWorldCerts</title><meta name="robots" content="noindex,nofollow"><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0b0b;color:#fff;margin:0}.glass{backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}.wrap{max-width:1100px;margin:0 auto;padding:24px}a{color:#f59e0b;text-decoration:none}.badge{display:inline-block;padding:4px 8px;border-radius:9999px;font-size:12px}.b-unconf{background:#1f2937}.b-prov{background:#10b981}.b-set{background:#f59e0b}input,button{padding:8px 12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff;outline:none}</style></head><body><main class="wrap"><header class="glass" style="border-radius:16px;padding:16px;margin-bottom:16px;"><h1 style="margin:0;background-image:linear-gradient(90deg,#f59e0b,#f43f5e);-webkit-background-clip:text;background-clip:text;color:transparent">Owner Dashboard</h1><nav style="margin-top:8px;font-size:14px"><a href="/index.html">Home</a> • <a href="/sitemap.xml">Sitemap</a> • <a href="/rss.xml">RSS</a></nav></header><section class="glass" style="border-radius:16px;padding:16px; margin-bottom:16px;"><label>Lookup ref: <input id="refInput" placeholder="rwc_xxx"/></label> <label>Days ± <input id="daysInput" type="number" min="0" max="30" value="7" style="width:80px"/></label> <label>Amount tol <input id="tolInput" type="number" min="0" step="0.01" value="0.01" style="width:100px"/></label> <button id="lookupBtn">Check</button> <span id="result"></span></section><section class="glass" style="border-radius:16px;padding:16px; margin-bottom:16px;"><div>Upload payout CSV</div><input id="csvFile" type="file" accept=".csv" /> <button id="uploadBtn">Upload</button> <span id="uploadRes"></span></section><section class="glass" style="border-radius:16px;padding:16px;"><p>Recent PayPal proofs and computed revenue states.</p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #333">Ref</th><th style="text-align:left;padding:8px;border-bottom:1px solid #333">IPN</th><th style="text-align:left;padding:8px;border-bottom:1px solid #333">Webhook</th><th style="text-align:left;padding:8px;border-bottom:1px solid #333">Payout</th><th style="text-align:left;padding:8px;border-bottom:1px solid #333">State</th><th style="text-align:left;padding:8px;border-bottom:1px solid #333">Viewer</th></tr></thead><tbody id="rows"></tbody></table></section></main><script nonce="${nonce}">async function fetchJSON(u){const r=await fetch(u);return r.json()}function badge(s){if(s==='SETTLED_OWNER'){return '<span class="badge b-set">SETTLED_OWNER</span>'}if(s==='VERIFIED_PROVIDER'){return '<span class="badge b-prov">VERIFIED_PROVIDER</span>'}return '<span class="badge b-unconf">UNCONFIRMED</span>'}function viewer(ref){return '<a href="/owner-proof.html?ref='+encodeURIComponent(ref)+'" target="_blank">Open</a>'}async function loadList(){const proofs=await fetchJSON('/api/proofs/paypal-ipn');const customs=[...new Set((proofs.items||[]).map(x=>String(x.custom||'')).filter(Boolean))];const rows=document.getElementById('rows');rows.innerHTML='';for(const ref of customs.slice(0,100)){const s=await fetchJSON('/api/revenue/state?ref='+encodeURIComponent(ref));const tr=document.createElement('tr');tr.innerHTML='<td style="padding:8px;border-bottom:1px solid #222">'+ref+'</td><td style="padding:8px;border-bottom:1px solid #222">'+(s.details?.ipn_count||0)+'</td><td style="padding:8px;border-bottom:1px solid #222">'+(s.details?.webhook_count||0)+'</td><td style="padding:8px;border-bottom:1px solid #222">'+(s.details?.payout_mention?"Yes":"No")+'</td><td style="padding:8px;border-bottom:1px solid #222">'+badge(s.state)+'</td><td style="padding:8px;border-bottom:1px solid #222">'+viewer(ref)+'</td>';rows.appendChild(tr)}}async function lookup(){const ref=document.getElementById('refInput').value.trim();const days=document.getElementById('daysInput').value.trim();const tol=document.getElementById('tolInput').value.trim();if(!ref){return}const qs='&days='+(days||'7')+'&amount_tol='+(tol||'0.01');const s=await fetchJSON('/api/revenue/state?ref='+encodeURIComponent(ref)+qs);const slot=document.getElementById('result');slot.innerHTML=badge(s.state)+' IPN:'+(s.details?.ipn_count||0)+' WH:'+(s.details?.webhook_count||0)+' Payout:'+(s.details?.payout_mention?"Yes":"No")}async function uploadCsv(){const el=document.getElementById('csvFile');const resSpan=document.getElementById('uploadRes');if(!el.files||!el.files[0]){resSpan.textContent='No file';return}const f=el.files[0];const t=await f.text();const r=await fetch('/api/proofs/payouts/upload',{method:'POST',headers:{'content-type':'text/csv'},body:t});const j=await r.json();if(j&&j.ok){resSpan.textContent='Uploaded '+j.saved+' lines:'+j.lines;loadList()}else{resSpan.textContent='Upload failed'}}document.getElementById('lookupBtn').addEventListener('click',lookup);document.getElementById('uploadBtn').addEventListener('click',uploadCsv);loadList();</script></body></html>`;
		res.type("text/html").send(html);
	});
	app.get("/owner-proof.html", (_req, res) => {
		const nonce = res.locals?.cspNonce || "";
		const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Proofs | RealWorldCerts</title><meta name="robots" content="noindex,nofollow"><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0b0b;color:#fff;margin:0}a{color:#f59e0b;text-decoration:none}.wrap{max-width:1100px;margin:0 auto;padding:24px}.glass{backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:16px}.grid{display:grid;grid-template-columns:1fr;gap:16px}@media(min-width:960px){.grid{grid-template-columns:1fr 1fr 1fr}}pre{white-space:pre-wrap;word-break:break-word;background:#000;border:1px solid #222;padding:8px;border-radius:8px;max-height:280px;overflow:auto}.panel{display:flex;flex-wrap:wrap;gap:8px;align-items:center}</style></head><body><main class="wrap"><header class="glass"><h1 style="margin:0;background-image:linear-gradient(90deg,#f59e0b,#f43f5e);-webkit-background-clip:text;background-clip:text;color:transparent">Proofs</h1></header><section class="glass panel" style="margin-top:16px"><label>Ref <input id="ref" placeholder="rwc_xxx" style="padding:8px 12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff"></label><label>Days ± <input id="days" type="number" min="0" max="30" value="7" style="width:80px;padding:8px 12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff"></label><label>Amount tol <input id="tol" type="number" min="0" step="0.01" value="0.01" style="width:100px;padding:8px 12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff"></label><button id="btn" style="padding:8px 12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff">Load Proofs</button><button id="stateBtn" style="padding:8px 12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff">Compute State</button><span id="stateRes"></span></section><section class="grid" style="margin-top:16px"><div class="glass"><h3>PayPal IPN</h3><div id="ipn"></div></div><div class="glass"><h3>PayPal Webhooks</h3><div id="wh"></div></div><div class="glass"><h3>Payouts</h3><div id="payouts"></div></div></section></main><script nonce="${nonce}">async function j(u){const r=await fetch(u);return r.json()}function qs(n){return new URLSearchParams(window.location.search).get(n)||''}function badge(s){if(s==='SETTLED_OWNER'){return 'SETTLED_OWNER'}if(s==='VERIFIED_PROVIDER'){return 'VERIFIED_PROVIDER'}return 'UNCONFIRMED'}async function load(){const ref=document.getElementById('ref').value.trim();const ipn=await j('/api/proofs/paypal-ipn?ref='+encodeURIComponent(ref));const wh=await j('/api/proofs/paypal-webhooks?ref='+encodeURIComponent(ref));const po=await j('/api/proofs/payouts?ref='+encodeURIComponent(ref));const ipnEl=document.getElementById('ipn');const whEl=document.getElementById('wh');const poEl=document.getElementById('payouts');ipnEl.innerHTML='';whEl.innerHTML='';poEl.innerHTML='';for(const it of (ipn.items||[])){const pre=document.createElement('pre');pre.textContent=JSON.stringify(it,null,2);ipnEl.appendChild(pre)}for(const it of (wh.items||[])){const pre=document.createElement('pre');pre.textContent=JSON.stringify(it,null,2);whEl.appendChild(pre)}for(const it of (po.items||[])){const pre=document.createElement('pre');pre.textContent=JSON.stringify(it,null,2);poEl.appendChild(pre)}}async function compute(){const ref=document.getElementById('ref').value.trim();const days=document.getElementById('days').value.trim()||'7';const tol=document.getElementById('tol').value.trim()||'0.01';if(!ref){return}const res=await j('/api/revenue/state?ref='+encodeURIComponent(ref)+'&days='+encodeURIComponent(days)+'&amount_tol='+encodeURIComponent(tol));const slot=document.getElementById('stateRes');slot.textContent=badge(res.state)+' IPN:'+(res.details?.ipn_count||0)+' WH:'+(res.details?.webhook_count||0)+' Payout:'+(res.details?.payout_mention?'Yes':'No')}document.getElementById('btn').addEventListener('click',load);document.getElementById('stateBtn').addEventListener('click',compute);const init=qs('ref');if(init){document.getElementById('ref').value=init;load()}</script></body></html>`;
		res.type("text/html").send(html);
	});
	app.get("/sitemap.xml", (_req, res) => {
		try {
			const base = String(
				process.env.SITE_PUBLIC_URL || "https://www.realworldcerts.com",
			).replace(/\/+$/, "");
			const entries = [];
			const dynamicPages = [
				"/",
				"/tutorials.html",
				"/courses.html",
				"/news.html",
				"/checkout.html",
				"/interactive-classroom",
			];
			for (const p of dynamicPages) {
				entries.push({
					loc: `${base}${p === "/" ? "/" : p}`,
					lastmod: new Date().toISOString(),
				});
			}

			function scan(dir, sub) {
				if (!fs.existsSync(dir)) return;
				const items = fs.readdirSync(dir, { withFileTypes: true });
				for (const it of items) {
					const full = path.join(dir, it.name);
					if (it.isDirectory()) {
						scan(full, path.join(sub, it.name));
					} else if (it.isFile() && it.name.toLowerCase().endsWith(".html")) {
						const rel = path.join(sub, it.name).replace(/\\+/g, "/");
						const loc = rel === "index.html" ? `${base}/` : `${base}/${rel}`;
						const stat = fs.statSync(full);
						const lastmod = new Date(stat.mtimeMs || Date.now()).toISOString();
						entries.push({ loc, lastmod });
					}
				}
			}

			const staticRoot = ensureStaticRoot();
			const rankOutput = path.resolve("rank", "output");

			scan(staticRoot, "");
			if (fs.existsSync(rankOutput)) scan(rankOutput, "");

			// Deduplicate entries by loc
			const seen = new Set();
			const uniqueEntries = [];
			for (const e of entries) {
				if (!seen.has(e.loc)) {
					seen.add(e.loc);
					uniqueEntries.push(e);
				}
			}

			const head =
				'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
			const body = uniqueEntries
				.map(
					(e) =>
						`  <url>\n    <loc>${e.loc.replace(/&/g, "&amp;")}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>\n`,
				)
				.join("");
			const tail = "</urlset>\n";

			res.setHeader("Cache-Control", "public, max-age=300");
			res.type("application/xml");
			res.send(head + body + tail);
		} catch (e) {
			res
				.status(500)
				.type("text/plain")
				.send(String(e?.message ?? e));
		}
	});
	app.get("/news.html", (_req, res) => {
		const html =
			'<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>News | RealWorldCerts</title><link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml"><link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml"><meta name="robots" content="index,follow"><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0b0b;color:#fff;margin:0}.glass{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}.wrap{max-width:960px;margin:0 auto;padding:24px}a{color:#f59e0b;text-decoration:none}</style></head><body><main class="wrap"><header class="glass" style="border-radius:16px;padding:16px;margin-bottom:16px;"><h1 style="margin:0;background-image:linear-gradient(90deg,#f59e0b,#f43f5e);-webkit-background-clip:text;background-clip:text;color:transparent">News</h1><nav style="margin-top:8px;font-size:14px"><a href="/index.html">Home</a> • <a href="/sitemap.xml">Sitemap</a> • <a href="/rss.xml">RSS</a></nav></header><section class="glass" style="border-radius:16px;padding:16px;"><p>Latest updates and announcements. Subscribe via <a href="/rss.xml">RSS</a>.</p></section></main></body></html>';
		res.type("text/html").send(html);
	});
	app.get("/checkout.html", (_req, res) => {
		const nonce = res.locals?.cspNonce || "";
		const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Checkout | RealWorldCerts</title><meta name="robots" content="index,follow"><link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml"><link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml"><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0b0b;color:#fff;margin:0}.glass{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}.wrap{max-width:680px;margin:0 auto;padding:24px}a{color:#f59e0b;text-decoration:none}button{background-image:linear-gradient(90deg,#f59e0b,#f43f5e);border:none;color:#111;padding:12px 16px;border-radius:12px;font-weight:700}</style></head><body><main class="wrap"><header class="glass" style="border-radius:16px;padding:16px;margin-bottom:16px;"><h1 style="margin:0;background-image:linear-gradient(90deg,#f59e0b,#f43f5e);-webkit-background-clip:text;background-clip:text;color:transparent">Checkout</h1><nav style="margin-top:8px;font-size:14px"><a href="/index.html">Home</a> • <a href="/sitemap.xml">Sitemap</a> • <a href="/rss.xml">RSS</a></nav></header><section class="glass" style="border-radius:16px;padding:16px;"><p>Secure payment via PayPal is supported. Click below to generate a PayPal payment link.</p><button onclick="startPayPal()">Pay with PayPal</button></section></main><script nonce="${nonce}">async function startPayPal(){try{const res=await fetch('/api/paypal-link?amount=10&item=Course');const json=await res.json();if(json&&json.ok&&json.url){location.href=json.url;}else{alert('Unable to create PayPal link');}}catch(e){alert('Error starting PayPal checkout');}}</script></body></html>`;
		res.type("text/html").send(html);
	});
	app.post(
		"/paypal/ipn",
		express.text({ type: "application/x-www-form-urlencoded" }),
		async (req, res) => {
			try {
				const raw = String(req.body || "");
				const params = new URLSearchParams(raw);
				const verifyBody = `cmd=_notify-validate&${raw}`;
				const verifyRes = await fetch(
					"https://ipnpb.paypal.com/cgi-bin/webscr",
					{
						method: "POST",
						headers: { "content-type": "application/x-www-form-urlencoded" },
						body: verifyBody,
					},
				);
				const verdict = String(await verifyRes.text()).trim();
				const isSimulated =
					process.env.NODE_ENV !== "production" &&
					params.get("txn_id")?.startsWith("SIM_");
				const verified = verdict === "VERIFIED" || isSimulated;
				const record = {
					kind: "paypal_ipn",
					verified,
					verdict,
					timestamp: new Date().toISOString(),
					receiver_email: params.get("receiver_email") || null,
					txn_id: params.get("txn_id") || null,
					payment_status: params.get("payment_status") || null,
					gross: params.get("mc_gross") || params.get("payment_gross") || null,
					currency: params.get("mc_currency") || null,
					custom: params.get("custom") || null,
					raw_sha256: crypto.createHash("sha256").update(raw).digest("hex"),
				};
				const dir = path.resolve("logs", "paypal_ipn");
				fs.mkdirSync(dir, { recursive: true });
				const token = String(record.txn_id || record.custom || Date.now())
					.replace(/[^a-zA-Z0-9_-]+/g, "_")
					.slice(0, 80);
				const out = path.join(dir, `ipn_${Date.now()}_${token}.json`);
				fs.writeFileSync(out, JSON.stringify(record, null, 2), "utf8");

				// Autonomous Revenue Generation: Ingest into Ledger
				if (verified && record.payment_status === "Completed") {
					const base44 = buildBase44ServiceClient();
					const revenueEntity = base44.asServiceRole.entities.RevenueEvent;

					const amount = Number(record.gross || 0);
					if (amount > 0) {
						console.log(
							`[IPN] 💰 Real-time Revenue Detected: ${amount} ${record.currency}. Ingesting into ledger...`,
						);
						await revenueEntity.create({
							id: `rwc_${record.txn_id || Date.now()}`,
							amount: amount,
							currency: record.currency || "USD",
							status: "verified",
							settled: false,
							metadata: {
								source: "PAYPAL_IPN",
								txn_id: record.txn_id,
								payer_email: params.get("payer_email"),
								item_name: params.get("item_name"),
							},
						});
					}
				}
			} catch (e) {
				try {
					const dir = path.resolve("logs", "paypal_ipn");
					fs.mkdirSync(dir, { recursive: true });
					const out = path.join(dir, `ipn_error_${Date.now()}.json`);
					fs.writeFileSync(
						out,
						JSON.stringify(
							{
								kind: "paypal_ipn_error",
								timestamp: new Date().toISOString(),
								error: String(e?.message ?? e),
							},
							null,
							2,
						),
						"utf8",
					);
				} catch {}
			}
			res.status(200).type("text/plain").send("OK");
		},
	);
	api.get("/proofs/paypal-ipn", (req, res) => {
		try {
			if (!checkAllowlist(req)) {
				res.status(403).json({ ok: false, error: "FORBIDDEN" });
				return;
			}
			if (!checkRateLimit(req)) {
				res.status(429).json({ ok: false, error: "RATE_LIMIT" });
				return;
			}
			const u = new URL(req.url, "http://localhost");
			const refFilter = (u.searchParams.get("ref") || "").trim();
			const dir = path.resolve("logs", "paypal_ipn");
			if (!fs.existsSync(dir)) {
				res.json({ ok: true, items: [] });
				return;
			}
			let items = fs
				.readdirSync(dir)
				.filter((n) => n.endsWith(".json"))
				.map((n) => {
					const p = path.join(dir, n);
					const stat = fs.statSync(p);
					return { name: n, mtimeMs: stat.mtimeMs };
				})
				.sort((a, b) => b.mtimeMs - a.mtimeMs)
				.slice(0, 100)
				.map((x) => {
					const p = path.join(dir, x.name);
					const raw = fs.readFileSync(p, "utf8");
					const obj = JSON.parse(raw);
					obj._file = x.name;
					return obj;
				});
			if (refFilter) {
				items = items.filter(
					(it) => String(it.custom || "").trim() === refFilter,
				);
			}
			res.json({ ok: true, items });
		} catch (e) {
			res.status(500).json({ ok: false, error: String(e?.message ?? e) });
		}
	});
	api.get("/proofs/paypal-webhooks", (req, res) => {
		try {
			if (!checkAllowlist(req)) {
				res.status(403).json({ ok: false, error: "FORBIDDEN" });
				return;
			}
			if (!checkRateLimit(req)) {
				res.status(429).json({ ok: false, error: "RATE_LIMIT" });
				return;
			}
			const u = new URL(req.url, "http://localhost");
			const refFilter = (u.searchParams.get("ref") || "").trim();
			const dir = path.resolve("logs", "paypal_webhooks");
			if (!fs.existsSync(dir)) {
				res.json({ ok: true, items: [] });
				return;
			}
			let items = fs
				.readdirSync(dir)
				.filter((n) => n.endsWith(".json"))
				.map((n) => {
					const p = path.join(dir, n);
					const stat = fs.statSync(p);
					return { name: n, mtimeMs: stat.mtimeMs };
				})
				.sort((a, b) => b.mtimeMs - a.mtimeMs)
				.slice(0, 100)
				.map((x) => {
					const p = path.join(dir, x.name);
					const raw = fs.readFileSync(p, "utf8");
					const obj = JSON.parse(raw);
					return { _file: x.name, ...obj };
				});
			if (refFilter) {
				items = items.filter(
					(it) => String(it?.record?.custom_id || "").trim() === refFilter,
				);
			}
			res.json({ ok: true, items });
		} catch (e) {
			res.status(500).json({ ok: false, error: String(e?.message ?? e) });
		}
	});
	api.get("/proofs/payouts", (req, res) => {
		try {
			if (!checkAllowlist(req)) {
				res.status(403).json({ ok: false, error: "FORBIDDEN" });
				return;
			}
			if (!checkRateLimit(req)) {
				res.status(429).json({ ok: false, error: "RATE_LIMIT" });
				return;
			}
			const u = new URL(req.url, "http://localhost");
			const refFilter = (u.searchParams.get("ref") || "").trim().toLowerCase();
			const root = path.resolve(".");
			const items = [];
			const rootCsvFiles = fs
				.readdirSync(root)
				.filter(
					(n) =>
						/payoneer_payout|wise_payout|payout/i.test(n) &&
						n.toLowerCase().endsWith(".csv"),
				);
			for (const name of rootCsvFiles) {
				try {
					const text = fs.readFileSync(path.join(root, name), "utf8");
					const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
					if (lines.length < 2) continue;
					const headerRaw = lines[0].split(",").map((s) => s.trim());
					const header = headerRaw.map((h) =>
						h.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
					);
					for (const line of lines.slice(1)) {
						const cols = line.split(",").map((s) => s.trim());
						const row = {};
						header.forEach((h, i) => {
							row[h] = cols[i] ?? "";
						});
						const refText =
							row.reference ||
							row.description ||
							row.details ||
							row.memo ||
							row.note ||
							"";
						const amountText =
							row.amount || row.total || row.gross || row.value || "";
						const currencyText = row.currency || row.ccy || row.curr || "";
						const recipientText =
							row.payee ||
							row.recipient ||
							row.beneficiary ||
							row.counterparty ||
							row.name ||
							row.email ||
							"";
						const dateText =
							row.date ||
							row.created ||
							row.timestamp ||
							row.settlement_date ||
							"";
						const amount = Number(String(amountText).replace(/[^\d.-]+/g, ""));
						const currency =
							String(currencyText || "")
								.toUpperCase()
								.slice(0, 6) || "";
						const combined =
							Object.values(row)
								.filter((v) => typeof v === "string")
								.join(" ")
								.toLowerCase() || "";
						const hit = !refFilter || combined.includes(refFilter);
						if (hit) {
							items.push({
								source_file: name,
								date: dateText,
								amount_num: Number.isFinite(amount) ? amount : null,
								currency,
								recipient: recipientText,
								reference_text: refText,
								raw: row,
							});
						}
						if (items.length >= 100) break;
					}
					if (items.length >= 100) break;
				} catch {}
			}
			const payoutDir = path.resolve("logs", "payouts");
			if (fs.existsSync(payoutDir)) {
				const payoutCsvFiles = fs
					.readdirSync(payoutDir)
					.filter((n) => n.toLowerCase().endsWith(".csv"));
				for (const name of payoutCsvFiles) {
					try {
						const text = fs.readFileSync(path.join(payoutDir, name), "utf8");
						const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
						if (lines.length < 2) continue;
						const headerRaw = lines[0].split(",").map((s) => s.trim());
						const header = headerRaw.map((h) =>
							h.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
						);
						for (const line of lines.slice(1)) {
							const cols = line.split(",").map((s) => s.trim());
							const row = {};
							header.forEach((h, i) => {
								row[h] = cols[i] ?? "";
							});
							const refText =
								row.reference ||
								row.description ||
								row.details ||
								row.memo ||
								row.note ||
								"";
							const amountText =
								row.amount || row.total || row.gross || row.value || "";
							const currencyText = row.currency || row.ccy || row.curr || "";
							const recipientText =
								row.payee ||
								row.recipient ||
								row.beneficiary ||
								row.counterparty ||
								row.name ||
								row.email ||
								"";
							const dateText =
								row.date ||
								row.created ||
								row.timestamp ||
								row.settlement_date ||
								"";
							const amount = Number(
								String(amountText).replace(/[^\d.-]+/g, ""),
							);
							const currency =
								String(currencyText || "")
									.toUpperCase()
									.slice(0, 6) || "";
							const combined =
								Object.values(row)
									.filter((v) => typeof v === "string")
									.join(" ")
									.toLowerCase() || "";
							const hit = !refFilter || combined.includes(refFilter);
							if (hit) {
								items.push({
									source_file: name,
									date: dateText,
									amount_num: Number.isFinite(amount) ? amount : null,
									currency,
									recipient: recipientText,
									reference_text: refText,
									raw: row,
								});
							}
							if (items.length >= 100) break;
						}
						if (items.length >= 100) break;
					} catch {}
				}
			}
			const withParsedDate = items.map((x) => {
				const t = Date.parse(x.date || "");
				return { parsed_ts: Number.isFinite(t) ? t : 0, ...x };
			});
			withParsedDate.sort((a, b) => b.parsed_ts - a.parsed_ts);
			res.json({ ok: true, items: withParsedDate.slice(0, 100) });
		} catch (e) {
			res.status(500).json({ ok: false, error: String(e?.message ?? e) });
		}
	});
	api.post(
		"/proofs/payouts/upload",
		express.text({ type: "text/csv" }),
		(req, res) => {
			try {
				const raw = String(req.body || "");
				if (!raw.trim()) {
					res.status(400).json({ ok: false, error: "EMPTY_CSV" });
					return;
				}
				const dir = path.resolve("logs", "payouts");
				fs.mkdirSync(dir, { recursive: true });
				const name = `payout_${Date.now()}.csv`;
				fs.writeFileSync(path.join(dir, name), raw, "utf8");
				const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
				res.json({ ok: true, saved: name, lines: lines.length });
			} catch (e) {
				res.status(500).json({ ok: false, error: String(e?.message ?? e) });
			}
		},
	);
	app.get("/tutorials.html", (_req, res) => {
		const html =
			'<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Tutorials | RealWorldCerts</title><script src="https://cdn.tailwindcss.com"></script><link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml"><link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml"><style>body{font-family:Space Grotesk,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background-color:#0b0b0b;color:#fff}.glass{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12)}</style><meta name="robots" content="index,follow"></head><body class="min-h-screen"><main class="max-w-5xl mx-auto px-6 py-10"><header class="flex items-center justify-between mb-8"><h1 class="text-3xl md:text-4xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-rose-500">Video Tutorials</h1><a href="index.html" class="glass rounded-full px-4 py-2 text-xs font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-amber-300">Home</a></header><section class="grid grid-cols-1 lg:grid-cols-3 gap-6"><div class="lg:col-span-2 glass rounded-2xl p-4"><h2 class="text-xl font-semibold mb-3">Autonomous Economy Overview</h2><video controls preload="metadata" poster="/assets/catalogue/KR971273_1800x1800.webp" class="w-full rounded-xl shadow"><source src="/videos/autonome.mp4" type="video/mp4">Your browser does not support the video tag.</video><p class="text-sm text-white/70 mt-3">A full-length tutorial introducing autonomous economic systems and practical implementation steps.</p></div><aside class="glass rounded-2xl p-4"><h3 class="text-lg font-semibold mb-2">Resources</h3><ul class="text-sm text-white/80 space-y-2"><li>Quickstart guide to autonomous agents</li><li>Course notes and exercises</li><li>Project templates and datasets</li></ul></aside></section><section class="glass rounded-2xl p-6 mt-8"><h2 class="text-xl font-semibold mb-3">Code Examples</h2><pre class="bg-black/40 border border-white/10 rounded-xl p-4 text-sm overflow-auto"><code>class Agent {\\n  constructor(name){ this.name = name }\\n  async act(task){\\n    const plan = await this.plan(task)\\n    return await this.execute(plan)\\n  }\\n}</code></pre></section><section class="glass rounded-2xl p-6 mt-8"><h2 class="text-xl font-semibold mb-3">More Tutorials</h2><div class="grid grid-cols-1 sm:grid-cols-2 gap-4"><a class="glass rounded-xl p-4 hover:bg-white/10 transition-colors" href="#"><img src="/assets/catalogue/6111249077587.webp" alt="Course item" class="w-full h-32 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Designing agent workflows</div></a><a class="glass rounded-xl p-4 hover:bg-white/10 transition-colors" href="#"><img src="/assets/catalogue/AAAPD46616_img1.webp" alt="Course item" class="w-full h-32 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Scaling distributed swarms</div></a></div></section></main></body></html>';
		res.type("text/html").send(html);
	});
	app.get("/courses.html", (_req, res) => {
		const html =
			'<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Courses | RealWorldCerts</title><script src="https://cdn.tailwindcss.com"></script><link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml"><link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml"><style>body{font-family:Space Grotesk,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background-color:#0b0b0b;color:#fff}.glass{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12)}</style><meta name="robots" content="index,follow"></head><body class="min-h-screen"><main class="max-w-6xl mx-auto px-6 py-10"><header class="flex items-center justify-between mb-8"><h1 class="text-3xl md:text-4xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-rose-500">Courses</h1><a href="index.html" class="glass rounded-full px-4 py-2 text-xs font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-amber-300">Home</a></header><section class="glass rounded-2xl p-6"><h2 class="text-xl font-semibold mb-3">Featured</h2><div class="grid grid-cols-1 md:grid-cols-3 gap-6"><a class="glass rounded-xl p-4 hover:bg-white/10 transition-colors" href="tutorials.html"><img src="/assets/catalogue/M.School_Compas_Crayon_V90Titre27_95301f78-8014-4f22-8985-e72962e43abc.webp" alt="Featured" class="w-full h-40 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Autonomous Systems: Foundations</div></a><a class="glass rounded-xl p-4 hover:bg-white/10 transition-colors" href="#"><img src="/assets/catalogue/Scotch-clear-tapes-665x333.jpg" alt="Featured" class="w-full h-40 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Design Agent Patterns</div></a><a class="glass rounded-xl p-4 hover:bg-white/10 transition-colors" href="#"><img src="/assets/catalogue/AAABL73023_img1.webp" alt="Featured" class="w-full h-40 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Swarms and Collaboration</div></a></div></section><section class="glass rounded-2xl p-6 mt-8"><h2 class="text-xl font-semibold mb-3">Materials</h2><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div class="glass rounded-xl p-4"><img src="/assets/catalogue/iwTHmut1kZ4ls3FmG9Eh.jpg" alt="Material image" class="w-full h-40 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Downloadable notes, exercises, and project starters.</div></div><div class="glass rounded-xl p-4"><img src="/assets/catalogue/6111249070793-600x600-1748530776.jpg" alt="Material image" class="w-full h-40 object-cover rounded-lg mb-3"><div class="text-sm text-white/80">Case studies and real-world implementations.</div></div></div></section></main></body></html>';
		res.type("text/html").send(html);
	});
	app.get("/health", (_req, res) => {
		res.json({
			ok: true,
			staticRoot,
			rate: { window_ms: rateWindowMs, max: rateMax },
			allowlist_size: allowlist.length,
		});
	});
	app.get(/.*/, (_req, res) => {
		const indexFile = path.join(staticRoot, "index.html");
		if (fs.existsSync(indexFile)) {
			res.sendFile(indexFile);
			return;
		}
		res.status(404).send("NOT_FOUND");
	});

	return app.listen(port, () => {
		const addr = `http://localhost:${port}/`;
		process.stdout.write(`${JSON.stringify({ ok: true, listening: addr })}\n`);
	});
}

const port = Number(process.env.PORT || process.env.SITE_PORT || "8080");
start({ port });
