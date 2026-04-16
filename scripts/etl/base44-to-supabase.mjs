import "dotenv/config";

function str(name) {
	const v = process.env[name];
	return v == null ? "" : String(v).trim();
}
function num(v) {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}
function clampInt(v, { min = 0, max = 1e9, fallback = 0 } = {}) {
	const n = Number(v);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.floor(n)));
}
function iso(v) {
	if (!v) return null;
	const d = new Date(v);
	return isNaN(d.getTime()) ? null : d.toISOString();
}
function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}
async function withRetry(fn, { tries = 3, baseDelayMs = 400 } = {}) {
	let last = null;
	for (let i = 0; i < Math.max(1, tries); i++) {
		try {
			return await fn();
		} catch (e) {
			last = e;
			const delay = baseDelayMs * Math.pow(2, i);
			await sleep(delay);
		}
	}
	throw last || new Error("retry_failed");
}
function supabaseHeaders() {
	const key = str("SUPABASE_SERVICE_ROLE_KEY") || str("SUPABASE_ANON_KEY");
	return {
		Authorization: `Bearer ${key}`,
		apikey: key,
		"Content-Type": "application/json",
		Prefer: "resolution=merge-duplicates,return=minimal",
	};
}
async function supabaseUpsert(table, rows) {
	const base = str("SUPABASE_URL").replace(/\/+$/g, "");
	const url = `${base}/rest/v1/${encodeURIComponent(table)}?on_conflict=external_id`;
	const res = await fetch(url, {
		method: "POST",
		headers: supabaseHeaders(),
		body: JSON.stringify(rows),
	});
	const txt = await res.text().catch(() => "");
	if (!res.ok) {
		throw new Error(`supabase_error:${res.status}:${txt}`);
	}
	return txt;
}
function chunk(arr, size) {
	const s = Math.max(1, size);
	const out = [];
	for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s));
	return out;
}
function base44Env() {
	const apiUrl = str("BASE44_API_URL");
	const serverUrl = str("BASE44_SERVER_URL");
	const appId = str("BASE44_APP_ID");
	const serviceToken = str("BASE44_SERVICE_TOKEN");

	let baseUrl = "";
	if (apiUrl) {
		baseUrl = `${apiUrl.replace(/\/+$/g, "")}/apps/${appId}`;
	} else if (serverUrl) {
		baseUrl = `${serverUrl.replace(/\/+$/g, "")}/api/apps/${appId}`;
	} else {
		baseUrl = `https://api.base44.com/v1/apps/${appId}`;
	}

	return {
		baseUrl,
		appId,
		serviceToken,
	};
}

async function base44Request(pathname, { method = "GET", body } = {}) {
	const { baseUrl, serviceToken } = base44Env();
	const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
	const ep = pathname.startsWith("/") ? pathname : `/${pathname}`;
	const url = `${base}${ep}`;

	const opts = {
		method,
		headers: {
			Authorization: `Bearer ${serviceToken}`,
			"Content-Type": "application/json",
			"X-Client": "Owner-Revenue-System/2.0",
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	};

	const timeoutMs = clampInt(str("BASE44_TIMEOUT_MS") || "10000", {
		min: 2000,
		max: 60000,
		fallback: 10000,
	});
	const p = fetch(url, opts);
	const t = new Promise((_, rej) =>
		setTimeout(() => rej(new Error("base44_timeout")), timeoutMs),
	);
	const res = await Promise.race([p, t]);
	const text = await res.text().catch(() => "");
	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = { raw: text };
	}
	if (!res.ok) {
		throw new Error(`base44_error:${res.status}:${text}`);
	}
	return json;
}
function pickAmount(obj) {
	const c =
		obj?.amount ??
		obj?.amount_total ??
		obj?.value ??
		obj?.net ??
		obj?.gross ??
		0;
	return num(c);
}
function pickCurrency(obj) {
	const c = obj?.currency || obj?.ccy || "USD";
	return String(c);
}
function pickStatus(obj) {
	return String(obj?.status || obj?.state || "pending");
}
function extractRecords(r) {
	if (Array.isArray(r?.items)) return r.items;
	if (Array.isArray(r?.records)) return r.records;
	if (Array.isArray(r?.data)) return r.data;
	return [];
}

async function fetchBase44Records(entity, { limit = 500, offset = 0 } = {}) {
	const params = new URLSearchParams();
	params.set("limit", String(limit));
	params.set("offset", String(offset));
	const r = await base44Request(
		`/entities/${encodeURIComponent(entity)}/records?${params.toString()}`,
	);
	return extractRecords(r);
}

async function fetchAllBase44Records(entity, { pageSize, maxTotal } = {}) {
	const limit = clampInt(pageSize ?? str("ETL_PAGE_SIZE") ?? "500", {
		min: 50,
		max: 2000,
		fallback: 500,
	});
	const cap = clampInt(maxTotal ?? str("ETL_LIMIT_TOTAL") ?? str("ETL_LIMIT") ?? "2000", {
		min: 1,
		max: 20000,
		fallback: 2000,
	});
	const out = [];
	const seen = new Set();
	let offset = 0;
	while (out.length < cap) {
		const page = await withRetry(
			() => fetchBase44Records(entity, { limit, offset }),
			{ tries: 3, baseDelayMs: 500 },
		);
		if (!page.length) break;

		for (const rec of page) {
			const id = String(rec?.id ?? rec?._id ?? rec?.code ?? rec?.external_id ?? "").trim();
			const key = id || `row:${out.length + 1}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(rec);
			if (out.length >= cap) break;
		}

		if (page.length < limit) break;
		offset += page.length;
	}
	return out;
}
function mapRevenue(rec) {
	return {
		external_id: String(rec?.id ?? rec?._id ?? rec?.code ?? rec?.external_id),
		source: String(rec?.source || rec?.rail || "base44"),
		amount: pickAmount(rec),
		currency: pickCurrency(rec),
		status: pickStatus(rec),
		occurred_at: iso(rec?.createdAt || rec?.created_at || rec?.occurred_at),
		meta: rec ?? {},
	};
}
function mapPayout(rec) {
	return {
		external_id: String(rec?.id ?? rec?._id ?? rec?.code ?? rec?.external_id),
		revenue_external_id: String(
			rec?.revenue_id ??
				rec?.revenueExternalId ??
				rec?.revenue_external_id ??
				"",
		),
		rail: String(rec?.rail || rec?.route || "unknown"),
		amount: pickAmount(rec),
		currency: pickCurrency(rec),
		status: pickStatus(rec),
		txid: rec?.txid || rec?.transaction_id || null,
		paid_at: iso(rec?.paidAt || rec?.paid_at),
		meta: rec ?? {},
	};
}
async function etlBase44ToSupabase() {
	const live = String(process.env.ETL_LIVE ?? "").toLowerCase() === "true";
	const dry =
		!live || String(process.env.DRY_RUN ?? "").toLowerCase() === "true";
	const supa = str("SUPABASE_URL");
	const hasSupa = !!supa;
	const revenueEntity = str("BASE44_REVENUE_ENTITY") || "RevenueEvent";
	const payoutEntity = str("BASE44_PAYOUT_ENTITY") || "Payout";
	const upsertChunk = clampInt(str("SUPABASE_UPSERT_CHUNK") || "500", {
		min: 50,
		max: 2000,
		fallback: 500,
	});
	let revenue = [];
	let payouts = [];
	try {
		revenue = await fetchAllBase44Records(revenueEntity, {});
	} catch {
		revenue = [];
	}
	try {
		payouts = await fetchAllBase44Records(payoutEntity, {});
	} catch {
		payouts = [];
	}
	const revRows = revenue.map(mapRevenue).filter((r) => r.external_id);
	const revIds = new Set(revRows.map((r) => r.external_id));
	const payRows = payouts
		.map(mapPayout)
		.map((p) => ({
			...p,
			revenue_external_id: revIds.has(p.revenue_external_id)
				? p.revenue_external_id
				: null,
		}))
		.filter((r) => r.external_id);
	const out = { revenue: revRows.length, payouts: payRows.length };
	if (!hasSupa || dry) {
		process.stdout.write(
			JSON.stringify({ ok: true, dry: true, counts: out }, null, 2) + "\n",
		);
		return;
	}
	for (const part of chunk(revRows, upsertChunk)) {
		if (part.length) {
			await withRetry(() => supabaseUpsert("revenue_events", part), {
				tries: 3,
				baseDelayMs: 500,
			});
		}
	}
	for (const part of chunk(payRows, upsertChunk)) {
		if (part.length) {
			await withRetry(() => supabaseUpsert("payouts", part), {
				tries: 3,
				baseDelayMs: 500,
			});
		}
	}
	process.stdout.write(
		JSON.stringify({ ok: true, dry: false, counts: out }, null, 2) + "\n",
	);
}
etlBase44ToSupabase().catch((e) => {
	process.stdout.write(
		JSON.stringify({ ok: false, error: e?.message || String(e) }, null, 2) +
			"\n",
	);
	process.exitCode = 1;
});
