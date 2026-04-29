import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { buildBase44ServiceClient } from "../src/base44-client.mjs";

function str(name) {
	const v = process.env[name];
	return v == null ? "" : String(v).trim();
}

function num(v) {
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function nowIso() {
	return new Date().toISOString();
}

function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeJson(file, payload) {
	ensureDir(path.dirname(file));
	fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	return file;
}

function hoursBetween(a, b) {
	const t1 = new Date(a).getTime();
	const t2 = new Date(b).getTime();
	if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
	return (t2 - t1) / (1000 * 60 * 60);
}

function countBy(arr, keyFn) {
	const out = {};
	for (const x of arr || []) {
		const k = String(keyFn?.(x) ?? "").trim() || "unknown";
		out[k] = (out[k] || 0) + 1;
	}
	return out;
}

async function main() {
	let base44 = null;
	try {
		base44 = buildBase44ServiceClient();
	} catch (e) {
		const out = { ok: true, skipped: true, reason: "missing_base44", error: e?.message || String(e) };
		process.stdout.write(JSON.stringify(out) + "\n");
		return;
	}

	const batchEntity = base44.asServiceRole.entities.PayoutBatch;
	const eventEntity = base44.asServiceRole.entities.RevenueEvent;

	const now = nowIso();
	const maxAgeHours = num(str("PAYOUT_HEALTH_MAX_HOURS") || "24") ?? 24;

	let recentBatches = [];
	let recentEvents = [];
	try {
		recentBatches = await batchEntity.filter({}, "-created_date", 200, 0);
	} catch (e) {
		recentBatches = [];
	}
	try {
		recentEvents = await eventEntity.filter({}, "-created_date", 200, 0);
	} catch (e) {
		recentEvents = [];
	}

	const staleSubmittedToPayPal = [];
	for (const b of recentBatches) {
		const status = String(b?.status || "").toLowerCase();
		if (status !== "submitted_to_paypal") continue;
		const submittedAt = b?.submitted_at || b?.submittedAt || null;
		const completedAt = b?.completed_at || b?.completedAt || null;
		if (!submittedAt || completedAt) continue;
		const age = hoursBetween(submittedAt, now);
		if (age != null && age > maxAgeHours) {
			staleSubmittedToPayPal.push({
				batch_id: b?.batch_id || b?.id || null,
				total_amount: b?.total_amount ?? b?.amount ?? null,
				currency: b?.currency ?? null,
				submitted_at: submittedAt,
				age_hours: Number(age.toFixed(2)),
				notes: b?.notes ?? null,
			});
		}
	}

	const confirmationNull = recentEvents.filter((e) => !e?.confirmation_date).length;
	const settledTrue = recentEvents.filter((e) => e?.settled === true).length;

	const payload = {
		ok: true,
		generated_at: now,
		payout_batch: {
			recent_count: recentBatches.length,
			status_counts: countBy(recentBatches, (x) => x?.status),
			stale_submitted_to_paypal_over_hours: maxAgeHours,
			stale_submitted_to_paypal: staleSubmittedToPayPal,
		},
		revenue_event: {
			recent_count: recentEvents.length,
			status_counts: countBy(recentEvents, (x) => x?.status),
			confirmation_date_null: confirmationNull,
			settled_true: settledTrue,
		},
	};

	const reportFile = writeJson(path.resolve("exports", "reports", "finance_state_last.json"), payload);
	process.stdout.write(JSON.stringify({ ...payload, report: reportFile }, null, 2) + "\n");
}

main().catch((e) => {
	process.stdout.write(JSON.stringify({ ok: false, error: e?.message || String(e) }) + "\n");
	process.exitCode = 1;
});

