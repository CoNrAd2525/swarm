import "dotenv/config";

function str(name) {
	const v = process.env[name];
	return v == null ? "" : String(v).trim();
}
function num(v) {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}
function iso(v) {
	if (!v) return null;
	const d = new Date(v);
	return isNaN(d.getTime()) ? null : d.toISOString();
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

	const p = fetch(url, opts);
	const t = new Promise((_, rej) =>
		setTimeout(() => rej(new Error("base44_timeout")), 4000),
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
async function fetchBase44Records(entity, limit = 500) {
	const params = new URLSearchParams();
	params.set("limit", String(limit));
	const r = await base44Request(
		`/entities/${encodeURIComponent(entity)}/records?${params.toString()}`,
	);

	if (Array.isArray(r?.items)) return r.items;
	if (Array.isArray(r?.records)) return r.records;
	if (Array.isArray(r?.data)) return r.data;
	return [];
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
	const limit = Math.max(1, Math.min(5000, num(process.env.ETL_LIMIT ?? 500)));
	const revenueEntity = str("BASE44_REVENUE_ENTITY") || "RevenueEvent";
	const payoutEntity = str("BASE44_PAYOUT_ENTITY") || "Payout";
	let revenue = [];
	let payouts = [];
	try {
		revenue = await fetchBase44Records(revenueEntity, limit);
	} catch {
		revenue = [];
	}
	try {
		payouts = await fetchBase44Records(payoutEntity, limit);
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
	if (revRows.length) await supabaseUpsert("revenue_events", revRows);
	if (payRows.length) await supabaseUpsert("payouts", payRows);
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
