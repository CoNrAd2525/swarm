import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBase44ServiceClient } from "../src/base44-client.mjs";
import { PlaidClient } from "../src/plaid/PlaidClient.mjs";
import { getPlaidItemById, loadPlaidItems } from "../src/plaid/PlaidStore.mjs";
import { isAttijariBankWire } from "./lib/bank-confirmation-guards.mjs";

function str(name) {
	const v = process.env[name];
	return v == null ? "" : String(v).trim();
}

function boolEnv(name) {
	const v = str(name).toLowerCase();
	return ["1", "true", "yes", "y", "on"].includes(v);
}

function nowIso() {
	return new Date().toISOString();
}

function daysAgo(n) {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - n);
	return d.toISOString().slice(0, 10);
}

function today() {
	return new Date().toISOString().slice(0, 10);
}

function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeJson(file, payload) {
	ensureDir(path.dirname(file));
	fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	return file;
}

function sha256Json(obj) {
	return crypto
		.createHash("sha256")
		.update(JSON.stringify(obj ?? null))
		.digest("hex");
}

function normalizeCurrency(c) {
	return String(c || "")
		.trim()
		.toUpperCase();
}

function num(v) {
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function choosePlaidAccessToken() {
	const direct = str("PLAID_OWNER_ACCESS_TOKEN") || str("PLAID_ACCESS_TOKEN");
	if (direct) return { ok: true, access_token: direct, source: "env" };

	const itemId =
		str("PLAID_OWNER_ITEM_ID") ||
		str("PLAID_ITEM_ID") ||
		str("PLAID_ITEM") ||
		"";
	if (itemId) {
		const got = getPlaidItemById(itemId);
		if (got.ok && got.item?.access_token) {
			return {
				ok: true,
				access_token: String(got.item.access_token),
				source: "store",
			};
		}
		return { ok: false, reason: "plaid_item_not_found" };
	}

	const loaded = loadPlaidItems();
	const first = loaded.ok && Array.isArray(loaded.items) ? loaded.items[0] : null;
	if (first?.access_token) {
		return { ok: true, access_token: String(first.access_token), source: "store_first" };
	}
	return { ok: false, reason: loaded.ok ? "missing_access_token" : loaded.reason };
}

function reconcileWindowDays() {
	const n = Number(str("PLAID_RECONCILE_DAYS") || "45");
	if (!Number.isFinite(n) || n <= 0) return 45;
	return Math.min(120, Math.max(7, Math.floor(n)));
}

function minBatchAgeMinutes() {
	const n = Number(str("BANK_RECONCILE_MIN_BATCH_AGE_MIN") || "60");
	if (!Number.isFinite(n) || n < 0) return 60;
	return Math.min(60 * 24 * 14, Math.floor(n));
}

function isOldEnough(createdAtIso) {
	const ms = Date.parse(createdAtIso || "");
	if (!Number.isFinite(ms)) return true;
	const ageMs = Date.now() - ms;
	return ageMs >= minBatchAgeMinutes() * 60_000;
}

function matchCandidates(transactions, { amount, currency } = {}) {
	const a = num(amount);
	if (!(a > 0)) return [];
	const cur = normalizeCurrency(currency);

	const tol = Number(str("BANK_RECONCILE_AMOUNT_TOL") || "0.01");
	const absTol = Number.isFinite(tol) && tol >= 0 ? tol : 0.01;

	const out = [];
	for (const t of transactions || []) {
		const txAmt = num(t?.amount);
		if (!(txAmt > 0)) continue;
		if (Math.abs(txAmt - a) > absTol) continue;

		const txCur = normalizeCurrency(t?.iso_currency_code || t?.unofficial_currency_code);
		if (cur && txCur && txCur !== cur) continue;

		out.push(t);
	}
	return out;
}

function slimTx(tx) {
	if (!tx || typeof tx !== "object") return null;
	return {
		transaction_id: tx.transaction_id || tx.id || null,
		date: tx.date || null,
		authorized_date: tx.authorized_date || null,
		name: tx.name || null,
		merchant_name: tx.merchant_name || null,
		amount: tx.amount ?? null,
		iso_currency_code: tx.iso_currency_code || tx.unofficial_currency_code || null,
		account_id: tx.account_id || null,
		payment_channel: tx.payment_channel || null,
		pending: tx.pending ?? null,
	};
}

function ownerNotifyEmail() {
	return (
		str("OWNER_NOTIFY_EMAIL") ||
		str("SECONDARY_CONTACT_EMAIL") ||
		str("PAYPAL_OWNER_EMAIL") ||
		"younesdgc@gmail.com"
	);
}

function isLikelyBankRail(batch) {
	const gw = String(batch?.gateway_ref || "").toLowerCase();
	if (!gw) return true;
	if (!gw.startsWith("file:")) return true;
	if (gw.includes("bank-wire")) return true;
	if (gw.includes("plaid")) return true;
	return false;
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
	const enabled = boolEnv("BANK_RECONCILE_ENABLE");
	if (!enabled) {
		process.stdout.write(JSON.stringify({ ok: true, skipped: true, reason: "disabled" }) + "\n");
		return;
	}

	const access = choosePlaidAccessToken();
	if (!access.ok) {
		process.stdout.write(
			JSON.stringify({ ok: true, skipped: true, reason: "missing_plaid_access", details: access }) +
				"\n",
		);
		return;
	}

	const plaid = new PlaidClient();
	const windowDays = reconcileWindowDays();
	let tx = [];
	try {
		const res = await plaid.transactionsGet(access.access_token, {
			start_date: daysAgo(windowDays),
			end_date: today(),
			options: { count: 500, offset: 0 },
		});
		tx = Array.isArray(res?.transactions) ? res.transactions : [];
	} catch (e) {
		process.stdout.write(
			JSON.stringify({ ok: true, skipped: true, reason: "plaid_error", error: e?.message || String(e) }) +
				"\n",
		);
		return;
	}

	let base44 = null;
	try {
		base44 = buildBase44ServiceClient();
	} catch (e) {
		process.stdout.write(
			JSON.stringify({ ok: true, skipped: true, reason: "missing_base44", error: e?.message || String(e) }) +
				"\n",
		);
		return;
	}
	const batchEntity = base44.asServiceRole.entities.PayoutBatch;
	const itemEntity = base44.asServiceRole.entities.PayoutItem;
	const eventEntity = base44.asServiceRole.entities.RevenueEvent;

	let pending = [];
	try {
		pending = await batchEntity.filter(
			{ status: "pending_external_confirmation" },
			"-created_date",
			200,
			0,
		);
	} catch (e) {
		process.stdout.write(
			JSON.stringify({ ok: false, error: "base44_filter_failed", detail: e?.message || String(e) }) +
				"\n",
		);
		process.exitCode = 1;
		return;
	}

	const confirmed = [];
	const skipped_batches = [];
	for (const b of pending) {
		const batchId = b?.batch_id || b?.id || null;
		if (!batchId) {
			skipped_batches.push({ batch_id: null, reason: "missing_batch_id" });
			continue;
		}
		const createdAt = b?.created_date || b?.createdAt || b?.created_at || null;
		if (!isOldEnough(createdAt)) {
			skipped_batches.push({ batch_id: batchId, reason: "too_new", created_at: createdAt });
			continue;
		}

		const amount = num(b?.total_amount ?? b?.amount ?? null);
		const currency = normalizeCurrency(b?.currency);
		if (!(amount > 0)) {
			skipped_batches.push({
				batch_id: batchId,
				reason: "missing_amount",
				created_at: createdAt,
				currency,
			});
			continue;
		}

		if (!isLikelyBankRail(b)) {
			skipped_batches.push({
				batch_id: batchId,
				reason: "non_bank_rail",
				created_at: createdAt,
				amount,
				currency,
				gateway_ref: b?.gateway_ref ?? null,
			});
			continue;
		}
		if (isAttijariBankWire(b)) {
			skipped_batches.push({
				batch_id: batchId,
				reason: "attijari_manual_confirmation_required",
				created_at: createdAt,
				amount,
				currency,
				gateway_ref: b?.gateway_ref ?? null,
			});
			continue;
		}

		const createdMs = createdAt ? Date.parse(createdAt) : Number.NaN;
		const minTxMs = Number.isFinite(createdMs) ? createdMs - 24 * 60 * 60_000 : Number.NaN;
		const filteredTx = Number.isFinite(minTxMs)
			? tx.filter((t) => {
					const d = t?.date ? Date.parse(String(t.date)) : Number.NaN;
					return !Number.isFinite(d) ? true : d >= minTxMs;
				})
			: tx;

		const candidates = matchCandidates(filteredTx, { amount, currency });
		if (candidates.length !== 1) {
			skipped_batches.push({
				batch_id: batchId,
				reason: candidates.length === 0 ? "no_plaid_match" : "multiple_plaid_matches",
				candidate_count: candidates.length,
				created_at: createdAt,
				amount,
				currency,
			});
			continue;
		}
		const matched = candidates[0];

		const proof = slimTx(matched);
		const proofHash = sha256Json(proof);
		const gatewayRef = `PLAID_TX_${proof?.transaction_id || proofHash.slice(0, 12)}`;

		await batchEntity.update(b.id, {
			status: "completed",
			gateway_ref: gatewayRef,
			confirmed_at: nowIso(),
		});

		const items = await itemEntity.filter(
			{ batch_id: batchId },
			"-created_date",
			2000,
			0,
		);
		for (const it of items) {
			await itemEntity.update(it.id, { status: "paid_out" });
			if (it.revenue_event_id) {
				try {
					await eventEntity.update(it.revenue_event_id, { settled: true });
				} catch {
					// ignore per-item failures; batch proof is still recorded
				}
			}
		}

		const record = {
			ok: true,
			batch_id: b.batch_id,
			gateway_ref: gatewayRef,
			confirmed_at: nowIso(),
			proof_hash: proofHash,
			proof,
		};

		const reportFile = writeJson(
			path.resolve(
				"exports",
				"reports",
				`bank_reconcile_${String(b.batch_id).replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`,
			),
			record,
		);

		const commFile = writeJson(
			path.resolve(
				"exports",
				"communications",
				`owner_settlement_confirmed_${String(b.batch_id).replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`,
			),
			{
				type: "owner_settlement_confirmed",
				batch_id: b.batch_id,
				created_at: nowIso(),
				email: {
					to: ownerNotifyEmail(),
					subject: `Settlement confirmed: ${b.batch_id}`,
					body: `Settlement marked as completed.\nBatch: ${b.batch_id}\nRef: ${gatewayRef}\nProof: ${proofHash}\n`,
				},
			},
		);

		confirmed.push({
			batch_id: b.batch_id,
			gateway_ref: gatewayRef,
			proof_hash: proofHash,
			report: reportFile,
			communication: commFile,
		});
	}

	let recent_status_counts = null;
	if (pending.length === 0) {
		try {
			const recent = await batchEntity.filter({}, "-created_date", 200, 0);
			recent_status_counts = countBy(recent, (x) => x?.status);
		} catch {
			recent_status_counts = null;
		}
	}

	process.stdout.write(
		JSON.stringify(
			{
				ok: true,
				pending_found: pending.length,
				confirmed: confirmed.length,
				confirmed_batches: confirmed,
				skipped_batches,
				recent_status_counts,
			},
			null,
			2,
		) + "\n",
	);
}

const selfPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isMain = argvPath && path.resolve(selfPath) === argvPath;

if (isMain) {
	main().catch((e) => {
		process.stdout.write(
			JSON.stringify({ ok: false, error: e?.message || String(e) }) + "\n",
		);
		process.exitCode = 1;
	});
}
