import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildBase44ServiceClient } from "../src/base44-client.mjs";
import { ExternalGatewayManager } from "../src/finance/ExternalGatewayManager.mjs";
import { OwnerSettlementEnforcer } from "../src/policy/owner-settlement.mjs";
import { parseArgs } from "../src/utils/cli.mjs";

function boolEnv(name, fallback = false) {
	const v = process.env[name];
	if (v == null) return fallback;
	const s = String(v).trim().toLowerCase();
	return ["1", "true", "yes", "y", "on"].includes(s);
}

function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function nowIso() {
	return new Date().toISOString();
}

function isoDaysAgo(days) {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - days);
	return d.toISOString();
}

function isSundayNow() {
	return new Date().getDay() === 0;
}

function shouldWritePayoutLedger() {
	return boolEnv("BASE44_ENABLE_PAYOUT_LEDGER_WRITE", true);
}

function toFixedMoney(n) {
	const x = Number(n);
	if (!Number.isFinite(x)) return null;
	return Number(x.toFixed(2));
}

function groupByCurrency(events) {
	const out = new Map();
	for (const e of events) {
		const cur = String(e?.currency || "USD").toUpperCase();
		if (!out.has(cur)) out.set(cur, []);
		out.get(cur).push(e);
	}
	return out;
}

function sha256(text) {
	return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

class FileStorage {
	constructor() {
		this.dataDir = path.join(process.cwd(), "data", "salary");
		ensureDir(this.dataDir);
	}
	load(type, id) {
		const file = path.join(this.dataDir, `${type}_${id}.json`);
		if (!fs.existsSync(file)) return null;
		try {
			return JSON.parse(fs.readFileSync(file, "utf8"));
		} catch {
			return null;
		}
	}
	save(type, id, data) {
		const file = path.join(this.dataDir, `${type}_${id}.json`);
		fs.writeFileSync(file, JSON.stringify(data, null, 2));
		return data;
	}
}

class FileAudit {
	constructor() {
		this.logDir = path.join(process.cwd(), "logs", "audit");
		ensureDir(this.logDir);
	}
	log(event, id, oldState, newState, actor, details) {
		const entry = {
			timestamp: nowIso(),
			event,
			id,
			actor,
			oldState,
			newState,
			details,
		};
		const logFile = path.join(
			this.logDir,
			`${new Date().toISOString().split("T")[0]}.jsonl`,
		);
		fs.appendFileSync(logFile, JSON.stringify(entry) + "\n");
	}
}

class IdempotentExecutor {
	constructor(storage) {
		this.storage = storage;
	}
	async execute(idempotencyKey, fn) {
		const key = String(idempotencyKey || "").trim();
		if (!key) throw new Error("missing_idempotency_key");
		const existing = this.storage?.load("idem", key) ?? null;
		if (existing) return existing;
		const res = await fn();
		this.storage?.save("idem", key, res);
		return res;
	}
}

async function listRecentSalaryBatches(batchEntity) {
	let batches = [];
	try {
		batches = await batchEntity.filter({}, "-created_date", 250, 0);
	} catch {
		batches = [];
	}
	return (batches || []).filter((b) =>
		String(b?.batch_id || "").startsWith("SALARY_WEEKLY_"),
	);
}

function extractPeriodEnd(batch) {
	const notes = batch?.notes;
	if (notes && typeof notes === "object") {
		const end = notes.period_end || notes.periodEnd || null;
		if (end && !Number.isNaN(Date.parse(end))) return String(end);
	}
	const created =
		batch?.created_at || batch?.createdAt || batch?.created_date || null;
	if (created && !Number.isNaN(Date.parse(created))) return String(created);
	return null;
}

function normalizeRevenueEvents(events, { fromIso, toIso } = {}) {
	const fromT = fromIso ? Date.parse(fromIso) : null;
	const toT = toIso ? Date.parse(toIso) : null;
	const out = [];
	for (const e of events || []) {
		if (!e) continue;
		const occurred =
			e?.occurred_at || e?.occurredAt || e?.confirmation_date || e?.created_date;
		const t = Date.parse(occurred || "");
		if (Number.isFinite(fromT) && Number.isFinite(t) && t < fromT) continue;
		if (Number.isFinite(toT) && Number.isFinite(t) && t >= toT) continue;
		if (e?.settled !== true && String(e?.status || "").toUpperCase() !== "SETTLED")
			continue;
		const amount = Number(e?.amount);
		if (!Number.isFinite(amount) || amount <= 0) continue;
		out.push({
			id: String(e.id),
			amount,
			currency: String(e.currency || "USD").toUpperCase(),
			occurred_at: occurred,
		});
	}
	return out;
}

function pickBankDestination() {
	return (
		process.env.OWNER_SALARY_BANK_RIB ||
		process.env.OWNER_SALARY_RIB ||
		process.env.OWNER_IBAN ||
		process.env.OWNER_BANK_RIB ||
		process.env.MOROCCAN_BANK_RIB ||
		""
	);
}

function pickSalaryPct() {
	const raw = process.env.PERSONAL_SALARY_PCT || process.env.SALARY_PCT || "0.10";
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0 || n >= 1) return 0.1;
	return n;
}

async function writeBatchAndItem(base44, { batchId, amount, currency, recipient, notes }) {
	if (!shouldWritePayoutLedger()) return { ok: true, skipped: true };
	const batchEntity = base44.asServiceRole.entities.PayoutBatch;
	const itemEntity = base44.asServiceRole.entities.PayoutItem;
	const created_at = nowIso();
	let batchRec = null;
	try {
		const existing = await batchEntity.filter(
			{ batch_id: batchId },
			"-created_date",
			1,
			0,
		);
		if (Array.isArray(existing) && existing[0]?.id) batchRec = existing[0];
	} catch {}
	if (!batchRec) {
		batchRec = await batchEntity.create({
			batch_id: batchId,
			status: "pending_external_confirmation",
			total_amount: amount,
			currency,
			notes,
			payout_method: "BANK_WIRE",
			owner_directive_enforced: true,
			created_at,
		});
	}
	const itemId = `SALARY_ITEM_${sha256(batchId).slice(0, 16)}`;
	let itemRec = null;
	try {
		const existingItems = await itemEntity.filter(
			{ batch_id: batchId },
			"-created_date",
			1,
			0,
		);
		if (Array.isArray(existingItems) && existingItems[0]?.id)
			itemRec = existingItems[0];
	} catch {}
	if (!itemRec) {
		itemRec = await itemEntity.create({
			item_id: itemId,
			batch_id: batchId,
			status: "pending",
			amount,
			currency,
			recipient,
			recipient_type: "owner",
			created_at,
		});
	}
	return { ok: true, batch: batchRec, item: itemRec };
}

async function updateGatewayRef(base44, batchRec, { gateway_ref, status } = {}) {
	if (!shouldWritePayoutLedger()) return { ok: true, skipped: true };
	if (!batchRec?.id) return { ok: false, error: "missing_batch_record_id" };
	const patch = {};
	if (gateway_ref) patch.gateway_ref = gateway_ref;
	if (status) patch.status = status;
	if (Object.keys(patch).length === 0) return { ok: true, skipped: true };
	const batchEntity = base44.asServiceRole.entities.PayoutBatch;
	await batchEntity.update(batchRec.id, patch);
	return { ok: true };
}

function deriveGatewayRef(prepared) {
	const attempted = String(prepared?.route_attempted || "");
	const gw = prepared?.gateway_response || null;
	const txId = gw?.transactionId || gw?.transaction_id || null;
	if (txId) return `${attempted.toUpperCase()}:${txId}`;
	const filePath = gw?.filePath || gw?.file_path || null;
	if (filePath) return `FILE:${path.basename(String(filePath))}`;
	return attempted ? attempted.toUpperCase() : null;
}

async function main() {
	const args = parseArgs(process.argv);
	const dryRun = args["dry-run"] === true || args.dryRun === true;
	const force = args.force === true || args["force"] === true;
	const actor = String(args.actor || "PersonalSalaryWeeklyRunner");
	const lookbackDays = Number(args["lookback-days"] ?? args.lookbackDays ?? 7);
	const minAmount = Number(args["min-amount"] ?? args.minAmount ?? 1);

	if (!force && !isSundayNow()) {
		process.stdout.write(
			JSON.stringify({ ok: true, skipped: true, reason: "scheduled_for_sunday" }) +
				"\n",
		);
		return;
	}

	const salaryPct = pickSalaryPct();
	const toIso = nowIso();
	const fromIsoBase = Number.isFinite(lookbackDays) && lookbackDays > 0 ? isoDaysAgo(lookbackDays) : isoDaysAgo(7);

	let base44 = null;
	try {
		base44 = buildBase44ServiceClient();
	} catch (e) {
		if (dryRun) {
			process.stdout.write(
				JSON.stringify({
					ok: true,
					dry_run: true,
					skipped: true,
					reason: "missing_base44",
					detail: e?.message || String(e),
				}) + "\n",
			);
			return;
		}
		process.stdout.write(
			JSON.stringify({ ok: false, error: "missing_base44", detail: e?.message || String(e) }) +
				"\n",
		);
		process.exitCode = 1;
		return;
	}

	const batchEntity = base44.asServiceRole.entities.PayoutBatch;
	const eventEntity = base44.asServiceRole.entities.RevenueEvent;

	const recentSalary = await listRecentSalaryBatches(batchEntity);
	let fromIso = fromIsoBase;
	if (recentSalary.length > 0) {
		const last = recentSalary
			.map((b) => ({ b, end: extractPeriodEnd(b) }))
			.filter((x) => x.end)
			.sort((a, b) => Date.parse(b.end) - Date.parse(a.end))[0];
		if (last?.end) fromIso = last.end;
	}

	let rawEvents = [];
	try {
		rawEvents = await eventEntity.filter({}, "-created_date", 2000, 0);
	} catch {
		rawEvents = [];
	}

	const events = normalizeRevenueEvents(rawEvents, { fromIso, toIso });
	const grouped = groupByCurrency(events);
	const preferredBankDestination =
		OwnerSettlementEnforcer.getOwnerAccountForCategory("salary") ||
		OwnerSettlementEnforcer.getOwnerAccountForType("bank_transfer") ||
		pickBankDestination();

	const outputs = [];
	for (const [currency, list] of grouped.entries()) {
		const gross = list.reduce((sum, e) => sum + Number(e.amount || 0), 0);
		const salary = toFixedMoney(gross * salaryPct);
		if (!(salary > 0) || salary < minAmount) {
			outputs.push({
				currency,
				ok: true,
				skipped: true,
				reason: "below_minimum",
				gross,
				salary_pct: salaryPct,
				salary_amount: salary,
			});
			continue;
		}

		const batchId = `SALARY_WEEKLY_${toIso.slice(0, 10).replace(/-/g, "")}_${currency}`;
		const idem = `IDEMPOTENCY_${batchId}`;
		const notes = {
			category: "personal_salary",
			salary_pct: salaryPct,
			period_start: fromIso,
			period_end: toIso,
			gross_revenue_amount: toFixedMoney(gross),
			revenue_event_count: list.length,
		};

		if (dryRun) {
			outputs.push({
				ok: true,
				dry_run: true,
				batch_id: batchId,
				currency,
				gross_revenue_amount: toFixedMoney(gross),
				salary_pct: salaryPct,
				salary_amount: salary,
				from: fromIso,
				to: toIso,
			});
			continue;
		}

		const storage = new FileStorage();
		const audit = new FileAudit();
		const executor = new IdempotentExecutor(storage);
		const manager = new ExternalGatewayManager(storage, audit, executor);

		const prepared = await manager.initiateAutoSettlement(
			batchId,
			[
				{
					amount: salary,
					currency,
					recipient_address: preferredBankDestination,
					note: `Personal Salary ${fromIso.slice(0, 10)}-${toIso.slice(0, 10)}`,
				},
			],
			idem,
			actor,
		);

		const routeAttempted = String(prepared?.route_attempted || "");
		const resolvedRecipient =
			OwnerSettlementEnforcer.getOwnerAccountForType(routeAttempted) ||
			preferredBankDestination ||
			null;
		if (!resolvedRecipient) {
			throw new Error("missing_owner_destination_for_attempted_route");
		}
		const written = await writeBatchAndItem(base44, {
			batchId,
			amount: salary,
			currency,
			recipient: resolvedRecipient,
			notes: { ...notes, route_attempted: routeAttempted || null },
		});

		const gatewayRef = deriveGatewayRef(prepared);
		if (written?.batch?.id) {
			await updateGatewayRef(base44, written.batch, {
				gateway_ref: gatewayRef,
				status: "pending_external_confirmation",
			});
		}

		const reportDir = path.resolve("exports", "reports");
		ensureDir(reportDir);
		const reportPath = path.join(
			reportDir,
			`personal_salary_${batchId.replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`,
		);
		fs.writeFileSync(
			reportPath,
			JSON.stringify(
				{
					ok: true,
					batch_id: batchId,
					currency,
					period_start: fromIso,
					period_end: toIso,
					gross_revenue_amount: toFixedMoney(gross),
					salary_pct: salaryPct,
					salary_amount: salary,
					route_attempted: prepared?.route_attempted || null,
					status: prepared?.status || null,
					gateway_ref: gatewayRef,
					reported_at: nowIso(),
				},
				null,
				2,
			) + "\n",
			"utf8",
		);

		outputs.push({
			ok: true,
			batch_id: batchId,
			currency,
			gross_revenue_amount: toFixedMoney(gross),
			salary_pct: salaryPct,
			salary_amount: salary,
			gateway_ref: gatewayRef,
			report: reportPath,
		});
	}

	process.stdout.write(
		JSON.stringify(
			{
				ok: true,
				dry_run: dryRun,
				actor,
				from: fromIso,
				to: toIso,
				salary_pct: salaryPct,
				currencies: outputs,
			},
			null,
			2,
		) + "\n",
	);
}

main().catch((e) => {
	process.stdout.write(
		JSON.stringify({ ok: false, error: e?.message || String(e) }) + "\n",
	);
	process.exitCode = 1;
});
