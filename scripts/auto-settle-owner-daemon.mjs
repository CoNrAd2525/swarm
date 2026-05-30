import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import winston from "winston";
import { buildBase44ServiceClient } from "../src/base44-client.mjs";
import { getRevenueConfigFromEnv } from "../src/base44-revenue.mjs";
import { ExternalGatewayManager } from "../src/finance/ExternalGatewayManager.mjs";
import {
	enforceOwnerDirective,
	preExecutionOwnerCheck,
	validateOwnerDirectiveSetup,
} from "../src/owner-directive.mjs";
import { createPayPalPayoutBatch } from "../src/paypal-api.mjs";
import { OwnerSettlementEnforcer } from "../src/policy/owner-settlement.mjs";

// ============================================================================
// LOGGER CONFIGURATION
// ============================================================================

const logger = console;

// ============================================================================
// LIVE BACKEND DEPENDENCIES - NO MOCKS
// ============================================================================

// Real storage implementation
class RealStorage {
	constructor() {
		this.dataDir = path.join(process.cwd(), "data", "settlements");
		fs.mkdirSync(this.dataDir, { recursive: true });
	}

	load(type, id) {
		const file = path.join(this.dataDir, `${type}_${id}.json`);
		if (!fs.existsSync(file)) return null;
		try {
			return JSON.parse(fs.readFileSync(file, "utf8"));
		} catch (e) {
			logger.error(`[STORAGE] Error loading ${type}:${id}`, e);
			return null;
		}
	}

	save(type, id, data) {
		const file = path.join(this.dataDir, `${type}_${id}.json`);
		try {
			fs.writeFileSync(file, JSON.stringify(data, null, 2));
			return data;
		} catch (e) {
			logger.error(`[STORAGE] Error saving ${type}:${id}`, e);
			throw e;
		}
	}
}

// Real audit logger
class RealAuditLogger {
	constructor() {
		this.logDir = path.join(process.cwd(), "logs", "audit");
		fs.mkdirSync(this.logDir, { recursive: true });
	}

	log(event, id, oldState, newState, actor, details) {
		const entry = {
			timestamp: new Date().toISOString(),
			event,
			id,
			actor,
			oldState,
			newState,
			details,
		};

		if (event === "SETTLEMENT_VALUE") {
			const logFile = path.join(this.logDir, `settlement_values.jsonl`);
			fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
		}

		const logFile = path.join(
			this.logDir,
			`${new Date().toISOString().split("T")[0]}.jsonl`,
		);
		fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);

		logger.info(`[AUDIT] ${event} - ${id} - ${actor}`, details || "");
	}
}

// Real executor with idempotency
class RealExecutor {
	constructor() {
		this.executed = new Map();
	}

	async execute(idempotencyKey, fn, _context) {
		if (this.executed.has(idempotencyKey)) {
			logger.info(`[EXECUTOR] Skipping duplicate execution: ${idempotencyKey}`);
			return this.executed.get(idempotencyKey);
		}

		logger.info(`[EXECUTOR] Executing: ${idempotencyKey}`);
		const result = await fn();
		this.executed.set(idempotencyKey, result);
		return result;
	}
}

// Initialize real backend components
const realStorage = new RealStorage();
const realAuditLogger = new RealAuditLogger();
const realExecutor = new RealExecutor();
const externalGatewayManager = new ExternalGatewayManager(
	realStorage,
	realAuditLogger,
	realExecutor,
);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
	// Settlement frequency
	CHECK_INTERVAL_MS:
		Number(process.env.SETTLEMENT_CHECK_INTERVAL_MS ?? 60 * 1000) || 60 * 1000,

	// Auto-approval thresholds (no manual approval needed)
	AUTO_APPROVE_THRESHOLD:
		Number(process.env.AUTO_APPROVE_THRESHOLD_USD ?? 5000) || 5000,
	AUTO_APPROVE_ROLES: String(
		process.env.AUTO_APPROVE_ROLES ?? "finance,compliance",
	)
		.split(/[|,; ]/g)
		.map((x) => x.trim().toLowerCase())
		.filter(Boolean),

	// Batch configuration
	MIN_BATCH_SIZE: 1, // Settle even single events
	MAX_BATCH_SIZE: 100, // Max events per batch

	// Settlement urgency
	MAX_SETTLEMENT_DELAY_HOURS: 0.25, // 15 minutes max from verification to settlement

	// Rail preferences (in order) - Prefer Bank/Wise over Crypto
	RAIL_PRIORITY: [
		process.env.FORCE_BANK_WIRE === "true" ? "BANK_WIRE" : null,
		"BANK_WIRE",
		"CHEQUE",
		"WISE",
		"GOOGLEPAY",
		"PLAID",
		"PAYPAL",
		"PAYONEER",
		"CRYPTO",
	].filter(Boolean),

	// Modes
	ENABLE_IMMEDIATE_SETTLEMENT: true, // Settle as soon as verified
	ENABLE_EMERGENCY_MODE: false, // Bypass all checks (use with caution)

	// Security: Emergency payment lock
	EMERGENCY_PAYMENT_LOCK:
		(process.env.EMERGENCY_PAYMENT_LOCK || "false").toLowerCase() === "true", // Set to true to block ALL payments
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

class SettlementState {
	constructor() {
		this.running = false;
		this.lastCheck = null;
		this.lastSettlement = null;
		this.totalSettled = 0;
		this.settlementCount = 0;
		this.errors = [];
	}

	markCheck() {
		this.lastCheck = new Date().toISOString();
	}

	markSettlement(amount) {
		this.lastSettlement = new Date().toISOString();
		this.totalSettled += amount;
		this.settlementCount += 1;
	}

	addError(error) {
		this.errors.push({
			timestamp: new Date().toISOString(),
			message: error.message,
			stack: error.stack,
		});
		// Keep only last 50 errors
		if (this.errors.length > 50) {
			this.errors = this.errors.slice(-50);
		}
	}

	getStatus() {
		return {
			running: this.running,
			lastCheck: this.lastCheck,
			lastSettlement: this.lastSettlement,
			totalSettled: this.totalSettled,
			settlementCount: this.settlementCount,
			errorCount: this.errors.length,
			uptime: this.running
				? Date.now() - new Date(this.lastCheck).getTime()
				: 0,
		};
	}
}

const state = new SettlementState();

// ============================================================================
// SECURITY FUNCTIONS
// ============================================================================

/**
 * Emergency payment lock - prevents any payments if unauthorized accounts detected
 */
function enforceEmergencyPaymentLock() {
	if (CONFIG.EMERGENCY_PAYMENT_LOCK) {
		throw new Error(
			"🚨 EMERGENCY PAYMENT LOCK ACTIVE: All payments blocked due to security concerns. Contact Younes Tsouli immediately at younestsouli2019@gmail.com",
		);
	}
}

/**
 * Validate that only authorized owner accounts are being used
 */
function _validateAuthorizedOwnerAccounts(rail, recipientData) {
	const ownerName = process.env.OWNER_BENEFICIARY_NAME;
	const authorizedIbans = JSON.parse(
		process.env.OWNER_BENEFICIARY_ALLOWLIST_JSON || "[]",
	);

	// Check recipient name matches owner
	if (recipientData.name && recipientData.name !== ownerName) {
		throw new Error(
			`🚨 SECURITY ALERT: Unauthorized recipient name "${recipientData.name}" for ${rail}. Only "${ownerName}" is authorized.`,
		);
	}

	if (rail === "CHEQUE") {
		// Cheques are inherently manual, we just ensure the recipient is the owner name
		if (recipientData.name !== getOwnerAccounts().bank.name) {
			throw new Error(
				`🚨 SECURITY ALERT: Unauthorized Cheque recipient "${recipientData.name}". Only owner name allowed.`,
			);
		}
		logger.info(
			`✅ CHEQUE recipient validation passed for authorized owner: ${recipientData.name}`,
		);
		return;
	}

	// Check IBAN is in authorized list
	if (recipientData.iban && !authorizedIbans.includes(recipientData.iban)) {
		throw new Error(
			`🚨 SECURITY ALERT: Unauthorized IBAN "${recipientData.iban}" for ${rail}. Only authorized IBANs allowed: ${authorizedIbans.join(", ")}`,
		);
	}

	logger.info(
		`✅ ${rail} recipient validation passed for authorized owner account`,
	);
}

// ============================================================================
// MAIN SETTLEMENT LOOP
// ============================================================================

async function startAutoSettlementDaemon() {
	logger.info(`📡 SWARM_LIVE mode: ${process.env.SWARM_LIVE}`);
	logger.info("🚀 Starting Autonomous Settlement Daemon...");
	logger.info("📋 Configuration:", JSON.stringify(CONFIG, null, 2));

	// Validate owner directive setup
	try {
		validateOwnerDirectiveSetup();
		logger.info("✅ Owner Directive validated");
	} catch (error) {
		logger.error("❌ Owner Directive validation failed:", error.message);
		process.exit(1);
	}

	state.running = true;
	console.log(
		"✅ Daemon started - settlements will be processed every",
		CONFIG.CHECK_INTERVAL_MS / 1000,
		"seconds",
	);

	// Initial immediate check
	await performSettlementCycle();

	// Schedule regular checks
	const intervalId = setInterval(async () => {
		try {
			await performSettlementCycle();
		} catch (error) {
			console.error("❌ Settlement cycle error:", error);
			state.addError(error);
		}
	}, CONFIG.CHECK_INTERVAL_MS);

	// Graceful shutdown
	process.on("SIGINT", () => {
		logger.info("\n🛑 Shutting down settlement daemon...");
		clearInterval(intervalId);
		state.running = false;
		logger.info("📊 Final stats:", state.getStatus());
		winston.loggers.closeAll();
		process.exit(0);
	});

	return intervalId;
}

async function syncPendingWiseTransfers(gatewayManager) {
	const base44 = buildBase44ServiceClient();
	const batchEntity = base44.asServiceRole.entities.PayoutBatch;
	const itemEntity = base44.asServiceRole.entities.PayoutItem;

	const pendingWiseBatches = await batchEntity
		.filter(
			{ payout_method: "WISE", status: "processing" },
			"-created_date",
			100,
			0,
		)
		.catch(() => []);

	if (pendingWiseBatches.length === 0) return;

	logger.info(
		`🔄 Syncing status for ${pendingWiseBatches.length} Wise transfers...`,
	);

	for (const batch of pendingWiseBatches) {
		const transferId = batch.notes?.gateway_ref || batch.gateway_ref;
		if (!transferId) continue;

		try {
			const status =
				await gatewayManager.wiseGateway.getTransferStatus(transferId);
			logger.info(`Transfer ${transferId} status: ${status.status}`);

			if (status.status === "outgoing_payment_sent") {
				logger.info(
					`✅ Wise transfer ${transferId} completed! Updating ledger...`,
				);
				await batchEntity.update(batch.id, { status: "completed" });

				const items = await itemEntity.filter(
					{ batch_id: batch.batch_id },
					"-created_date",
					1000,
					0,
				);
				for (const item of items) {
					await itemEntity.update(item.id, { status: "paid_out" });
				}
			} else if (status.status === "cancelled") {
				logger.warn(`❌ Wise transfer ${transferId} was cancelled!`);
				await batchEntity.update(batch.id, { status: "failed" });
			}
		} catch (e) {
			logger.error(`Error syncing Wise transfer ${transferId}: ${e.message}`);
		}
	}
}

/**
 * Main settlement cycle - runs periodically
 */
async function performSettlementCycle() {
	try {
		state.markCheck();
		console.log(
			`\n🔄 [${new Date().toISOString()}] Starting settlement cycle...`,
		);

		// EMERGENCY SECURITY CHECK: Block all payments if lock is active
		enforceEmergencyPaymentLock();

		// Step 1: Fetch verified revenue events ready for settlement
		const readyEvents = await queryRevenueEvents({});

		if (readyEvents.length === 0) {
			logger.info("✅ No events ready for settlement");
			// Step 1.5: Sync pending Wise transfers even if no new events
			await syncPendingWiseTransfers(externalGatewayManager);
			return;
		}

		logger.info(`📦 Found ${readyEvents.length} events ready for settlement`);

		const grouped = _groupEventsByRail(readyEvents);
		const rails = CONFIG.RAIL_PRIORITY.filter((r) => grouped[r]?.length > 0);
		for (const rail of rails) {
			try {
				await _processRailBatch(rail, grouped[rail]);
			} catch (error) {
				logger.error(`❌ Failed to process ${rail} batch:`, error.message);
				state.addError(error);
				// Continue to next rail
			}
		}

		// Step 3: Final status sync
		await syncPendingWiseTransfers(externalGatewayManager);
	} catch (error) {
		logger.error("❌ Settlement cycle error:", error);
		state.addError(error);
	}
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Fetches revenue events that are verified and ready for settlement
 */
async function _fetchReadyForSettlement() {
	const csvPath = path.join(
		process.cwd(),
		"archive",
		"owner_bank_requests.csv",
	);
	logger.info(`Looking for CSV file at: ${csvPath}`);
	if (!fs.existsSync(csvPath)) {
		logger.info(
			"✅ No owner_bank_requests.csv file found. No events to settle.",
		);
		return [];
	}

	const csvData = fs.readFileSync(csvPath, "utf8");
	logger.info("CSV file read successfully.");
	const records = parse(csvData, {
		columns: true,
		skip_empty_lines: true,
	});
	logger.info(`Parsed ${records.length} records from CSV.`);

	const events = records.map((record, index) => ({
		id: `csv-${index}-${Date.now()}`,
		amount: parseFloat(record.amount_usd),
		currency: "USD",
		verification_proof: "csv-import",
		status: "VERIFIED",
		created_at: new Date().toISOString(),
		metadata: {
			title: record.title,
			beneficiary_name: record.beneficiary_name,
			iban: record.IBAN,
			reference: record.reference,
		},
	}));

	logger.info(`Mapped ${events.length} events from CSV records.`);
	return events;
}

async function queryRevenueEvents(query) {
	logger.info(
		`[${new Date().toISOString()}] Querying revenue events with: ${JSON.stringify(query)}`,
	);

	const storePath = path.join(process.cwd(), ".base44-offline-store.json");
	const hasOfflineStore =
		fs.existsSync(storePath) && fs.statSync(storePath).size > 1000000; // > 1MB
	const isOffline =
		(process.env.BASE44_OFFLINE_MODE || "false").toLowerCase() === "true" ||
		hasOfflineStore;

	if (isOffline && !process.env.BASE44_OFFLINE_MODE) {
		logger.info(
			`[${new Date().toISOString()}] Large offline store found. Forcing BASE44_OFFLINE_MODE=true`,
		);
		process.env.BASE44_OFFLINE_MODE = "true";
	}

	const base44 = buildBase44ServiceClient();
	const cfg = getRevenueConfigFromEnv();
	const entityName = cfg.entityName || "RevenueEvent";
	const entity = base44.asServiceRole.entities[entityName];

	if (isOffline) {
		logger.info(
			`[${new Date().toISOString()}] Running in offline mode. Loading all events from the local store.`,
		);
		// In offline mode, we ignore the 'settled' flag in the initial query
		const offlineQuery = { ...query };
		delete offlineQuery.settled;

		const offlineData = await entity
			.filter(offlineQuery, "-created_date", 10000, 0)
			.catch((e) => {
				logger.error(
					`[${new Date().toISOString()}] Offline filter error: ${e.message}`,
				);
				return [];
			});

		if (!Array.isArray(offlineData) || offlineData.length === 0) {
			logger.info(
				`[${new Date().toISOString()}] No data found in offline store for ${entityName}`,
			);
			return [];
		}

		// In offline mode, we assume events are ready to be settled if they are not settled.
		// We accept 'verified', 'confirmed', 'VERIFIED', 'CONFIRMED' or undefined status.
		const filtered = offlineData
			.filter((row) => {
				const isSettled =
					row.settled === true || !!row.payoutBatchId || !!row.payout_batch_id;
				const status = String(row.status || "").toLowerCase();
				const isVerified =
					!row.status || status === "verified" || status === "confirmed";
				return !isSettled && isVerified;
			})
			.map((row) => ({
				id: row.id ?? null,
				amount: Number(row.amount ?? 0),
				currency: row.currency ?? cfg.defaultCurrency,
				verification_proof: row.id,
				status: "VERIFIED",
				created_at: row.created_date ?? new Date().toISOString(),
				metadata: row.metadata ?? {},
			}));

		logger.info(
			`[${new Date().toISOString()}] Found ${filtered.length} eligible offline events out of ${offlineData.length} total.`,
		);
		return filtered.filter(
			(e) => e.id && Number.isFinite(e.amount) && e.amount > 0,
		);
	}

	const evidenceRelaxed =
		(process.env.BASE44_EVIDENCE_RELAXED ||
			process.env.EVIDENCE_RELAXED ||
			"false")
			.toLowerCase() === "true";

	const filter = {};
	if (!evidenceRelaxed && cfg.fieldMap.status)
		filter[cfg.fieldMap.status] = "VERIFIED";
	if (cfg.fieldMap.payoutBatchId) filter[cfg.fieldMap.payoutBatchId] = null;
	if (!evidenceRelaxed && cfg.fieldMap.verificationProof)
		filter[cfg.fieldMap.verificationProof] = { $ne: null };
	const recs = await entity
		.filter(filter, "-created_date", 250, 0)
		.catch(() => []);
	logger.info(
		`[${new Date().toISOString()}] Found ${recs.length} revenue events.`,
	);
	if (!Array.isArray(recs) || recs.length === 0) return [];
	const mapped = recs
		.map((row) => ({
			id: row[cfg.fieldMap.externalId] ?? row.id ?? null,
			amount: Number(row[cfg.fieldMap.amount] ?? 0),
			currency: row[cfg.fieldMap.currency] ?? cfg.defaultCurrency,
			verification_proof: row[cfg.fieldMap.verificationProof] ?? null,
			status: row[cfg.fieldMap.status] ?? null,
			created_at: row[cfg.fieldMap.occurredAt] ?? null,
		}))
		.filter((e) => {
			if (!e.id || !Number.isFinite(e.amount) || !(e.amount > 0)) return false;
			const st = String(e.status || "").toLowerCase();
			const statusOk = evidenceRelaxed
				? !e.status ||
					st === "verified" ||
					st === "confirmed" ||
					st === "earned"
				: st === "verified";
			const proofOk = evidenceRelaxed ? true : e.verification_proof != null;
			return statusOk && proofOk;
		});
	if (mapped.length === 0 && recs.length > 0) {
		try {
			const row = recs[0] || {};
			const keys = Object.keys(row);
			const fm = cfg.fieldMap || {};
			const sample = {
				at: new Date().toISOString(),
				entity: cfg.entityName,
				fieldMap: fm,
				rowKeys: keys.slice(0, 200),
				fields: {
					id: {
						key: fm.externalId,
						present: fm.externalId ? row[fm.externalId] != null : false,
						type: fm.externalId ? typeof row[fm.externalId] : null,
					},
					amount: {
						key: fm.amount,
						present: fm.amount ? row[fm.amount] != null : false,
						type: fm.amount ? typeof row[fm.amount] : null,
						coerced: fm.amount ? Number(row[fm.amount] ?? 0) : null,
					},
					currency: {
						key: fm.currency,
						present: fm.currency ? row[fm.currency] != null : false,
						type: fm.currency ? typeof row[fm.currency] : null,
					},
					verification_proof: {
						key: fm.verificationProof,
						present: fm.verificationProof
							? row[fm.verificationProof] != null
							: false,
						type: fm.verificationProof ? typeof row[fm.verificationProof] : null,
					},
					payout_batch_id: {
						key: fm.payoutBatchId,
						present: fm.payoutBatchId ? row[fm.payoutBatchId] != null : false,
						type: fm.payoutBatchId ? typeof row[fm.payoutBatchId] : null,
					},
					status: {
						key: fm.status,
						present: fm.status ? row[fm.status] != null : false,
						type: fm.status ? typeof row[fm.status] : null,
					},
				},
			};
			fs.mkdirSync(path.resolve("exports", "reports"), { recursive: true });
			fs.writeFileSync(
				path.resolve("exports", "reports", "revenue_event_fieldmap_debug.json"),
				`${JSON.stringify(sample, null, 2)}\n`,
				"utf8",
			);
		} catch {}
	}
	return mapped;
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Groups events by optimal payment rail
 */
function _groupEventsByRail(events) {
	const batches = {};

	for (const event of events) {
		const rail = selectOptimalOwnerAccount(event.amount, event.currency).type;

		if (!batches[rail]) {
			batches[rail] = [];
		}

		batches[rail].push(event);
	}

	return batches;
}

/**
 * Processes a batch of events for a specific rail
 */
async function _processRailBatch(rail, events, options = {}) {
	logger.info(`⚡ Processing ${rail} batch: ${events.length} events`);

	// Step 1: Create payout batch
	const batch = await createPayoutBatch(rail, events, options);
	logger.info(`📦 Created batch: ${batch.batch_id}`);

	// Step 2: Auto-approve (if under threshold)
	const totalAmount = events.reduce((sum, e) => sum + e.amount, 0);

	if (
		totalAmount <= CONFIG.AUTO_APPROVE_THRESHOLD ||
		CONFIG.ENABLE_EMERGENCY_MODE
	) {
		logger.info(
			`✅ Auto-approving batch (${totalAmount} ${events[0]?.currency || "USD"})`,
		);
		await approveBatch(batch.batch_id);
	} else {
		const role = String(
			process.env.AUTONOMOUS_ROLE ?? process.env.RUNTIME_ROLE ?? "",
		).toLowerCase();
		if (role && CONFIG.AUTO_APPROVE_ROLES.includes(role)) {
			logger.info(
				`✅ Role-based auto-approve (${role}) for amount ${totalAmount}`,
			);
			await approveBatch(batch.batch_id);
		} else {
			logger.info(
				`⏳ Batch requires manual approval (${totalAmount} ${events[0]?.currency || "USD"})`,
			);
			return; // Wait for manual approval
		}
	}

	// Step 3: Validate owner directive (CRITICAL)
	try {
		await preExecutionOwnerCheck({ batch });
		logger.info("✅ Owner directive validated");
	} catch (error) {
		logger.error("❌ Owner directive violation:", error.message);
		throw error;
	}

	if (CONFIG.ENABLE_IMMEDIATE_SETTLEMENT || isSundayNow()) {
		const execResult = await executeSettlement(rail, batch);
		if (execResult?.ok === false) {
			logger.info(
				`⏳ Settlement execution not completed for ${rail}: ${String(execResult?.reason ?? "unknown")}`,
			);
			return;
		}
		await markEventsSettled(
			events.map((e) => e.id),
			batch.batch_id,
		);
	} else {
		logger.info("⏳ Execution scheduled for Sunday");
	}

	state.markSettlement(totalAmount);
	logger.info(`✅ Settled ${events.length} events via ${rail}`);
}

// ============================================================================
// PAYOUT EXECUTION
// ============================================================================

/**
 * Creates a payout batch in the ledger
 */
async function createPayoutBatch(rail, events, options = {}) {
	const totalAmount = events.reduce((sum, e) => sum + e.amount, 0);
	const currency = events[0]?.currency || "USD";
	const ownerAccounts = getOwnerAccounts();
	if (rail === "BANK_WIRE" && !ownerAccounts?.bank?.name) {
		throw new Error("missing_owner_beneficiary_name_for_bank_wire");
	}
	const recipient =
		rail === "PAYPAL"
			? ownerAccounts.paypal
			: rail === "BANK_WIRE"
				? ownerAccounts.bank.rib
				: rail === "WISE"
					? ownerAccounts.wise.recipientId || ownerAccounts.wise.email
					: rail === "CRYPTO"
						? ownerAccounts.crypto.address
						: ownerAccounts.payoneer.accountId;

	const batch = {
		batch_id: `BATCH_${rail}_${Date.now()}`,
		rail,
		total_amount: totalAmount,
		currency,
		status: "pending_approval",
		revenue_event_ids: events.map((e) => e.id),
		items: events.map((e) => ({
			amount: e.amount,
			currency: e.currency,
			recipient,
			recipient_type: "owner",
			sender_item_id: `ITEM_${Date.now()}_${Math.floor(Math.random() * 1e9)}`,
			revenue_event_id: e.id,
		})),
		created_at: new Date().toISOString(),
		owner_directive_enforced: true,
		micro_reroute: options?.microReroute === true,
	};

	// Validate all destinations
	for (const item of batch.items) {
		enforceOwnerDirective(item.recipient, item.recipient_type);
	}

	logger.info(`📝 Created batch:`, {
		id: batch.batch_id,
		events: batch.revenue_event_ids.length,
		amount: totalAmount,
		currency,
	});

	if (shouldWritePayoutLedger()) {
		const base44 = buildBase44ServiceClient();
		const payoutBatchEntity = base44.asServiceRole.entities.PayoutBatch;
		const payoutItemEntity = base44.asServiceRole.entities.PayoutItem;
		const _created = await payoutBatchEntity.create({
			batch_id: batch.batch_id,
			status: "pending_approval",
			total_amount: totalAmount,
			currency,
			notes: {
				recipient,
				recipient_type: "owner",
				micro_reroute: options?.microReroute === true,
			},
			payout_method: rail,
			revenue_event_ids: batch.revenue_event_ids,
			owner_directive_enforced: true,
			created_at: batch.created_at,
		});
		for (const it of batch.items) {
			await payoutItemEntity
				.create({
					item_id: it.sender_item_id,
					batch_id: batch.batch_id,
					status: "pending",
					amount: it.amount,
					currency: it.currency,
					recipient: it.recipient,
					recipient_type: it.recipient_type,
					revenue_event_id: it.revenue_event_id,
					created_at: new Date().toISOString(),
				})
				.catch(() => null);
		}
	}

	return batch;
}

/**
 * Approves a payout batch
 */
async function approveBatch(batchId) {
	logger.info(`✅ Approving batch: ${batchId}`);

	if (shouldWritePayoutLedger()) {
		const base44 = buildBase44ServiceClient();
		const entity = base44.asServiceRole.entities.PayoutBatch;
		const recs = await entity.filter(
			{ batch_id: batchId },
			"-created_date",
			1,
			0,
		);
		if (recs.length > 0) {
			await entity.update(recs[0].id, { status: "approved" });
		}
	}
}

/**
 * Executes a settlement for a given rail and batch
 */
async function executeSettlement(rail, batch) {
	logger.info(`🚀 Executing ${rail} settlement...`);

	const storage = new RealStorage();
	const audit = new RealAuditLogger();
	const executor = new RealExecutor();
	const gatewayManager = new ExternalGatewayManager(storage, audit, executor);

	switch (rail) {
		case "PAYPAL":
			return await executePayPalSettlement(batch);
		case "BANK_WIRE":
			return await executeBankWireSettlement(batch);
		case "CHEQUE":
			return await executeChequeSettlement(batch);
		case "GOOGLEPAY":
			return await executeGooglePaySettlement(batch);
		case "PLAID":
			return await executePlaidSettlement(batch);
		case "PAYONEER":
			return await executePayoneerSettlement(batch);
		case "WISE":
			return await executeWiseSettlement(batch, gatewayManager);
		case "CRYPTO":
			return await executeCryptoSettlement(batch, gatewayManager);
		default:
			throw new Error(`Unsupported payment rail: ${rail}`);
	}
}

/**
 * PayPal Payout execution
 */
async function executePayPalSettlement(batch) {
	logger.info("💳 Executing PayPal payout...");

	if (!shouldWritePayoutLedger()) return { ok: true };
	if (!isPayPalPayoutSendEnabled())
		return { ok: false, reason: "paypal_send_disabled" };
	requireLiveMode("submit_paypal_payout_batch");
	const items = batch.items.map((item) => ({
		recipient_type: "EMAIL",
		receiver: item.recipient,
		amount: { value: Number(item.amount).toFixed(2), currency: item.currency },
		note: `Payout ${batch.batch_id}`,
		sender_item_id: item.sender_item_id,
	}));
	const response = await createPayPalPayoutBatch({
		senderBatchId: batch.batch_id,
		items,
		emailSubject: "You have a payout",
		emailMessage: `Payout batch ${batch.batch_id}`,
	});
	const paypalBatchId = response?.batch_header?.payout_batch_id ?? null;
	logger.info("✅ PayPal payout submitted:", paypalBatchId);
	const base44 = buildBase44ServiceClient();
	const batchEntity = base44.asServiceRole.entities.PayoutBatch;
	const itemEntity = base44.asServiceRole.entities.PayoutItem;
	const recs = await batchEntity.filter(
		{ batch_id: String(batch.batch_id) },
		"-created_date",
		1,
		0,
	);
	if (recs.length > 0) {
		await batchEntity.update(recs[0].id, {
			status: "processing",
			gateway_ref: paypalBatchId,
		});
		const itemRecs = await itemEntity.filter(
			{ batch_id: String(batch.batch_id) },
			"-created_date",
			1000,
			0,
		);
		for (const item of itemRecs) {
			await itemEntity.update(item.id, { status: "processing" });
		}
	}
	return { ok: true, paypal_batch_id: paypalBatchId };
}

/**
 * Bank Wire CSV generation
 */
async function executeBankWireSettlement(batch) {
	logger.info("🏦 Generating Bank Wire Instructions...");

	const owner = getOwnerAccounts().bank;
	const instructions = {
		batch_id: batch.batch_id,
		amount: batch.total_amount,
		currency: batch.currency,
		beneficiary: {
			name: owner.name,
			rib: owner.rib,
			iban: process.env.OWNER_IBAN || owner.rib,
			swift: process.env.OWNER_SWIFT || "N/A",
			bank_name: process.env.OWNER_BANK_NAME || "N/A",
		},
		reference: `Settlement ${batch.batch_id}`,
		status: "PENDING_MANUAL_WIRE",
		created_at: new Date().toISOString(),
	};

	const filename = `bank_wire_instruction_${batch.batch_id}.json`;
	const exportsDir = path.join(process.cwd(), "exports", "bank-wire");
	fs.mkdirSync(exportsDir, { recursive: true });
	await fs.promises.writeFile(
		path.join(exportsDir, filename),
		JSON.stringify(instructions, null, 2),
	);

	logger.info(`✅ Bank Wire instructions generated: ${filename}`);
	await updateLedgerForAPISettlement(
		batch.batch_id,
		"pending_external_confirmation",
		`FILE:${filename}`,
	);

	return { ok: true, filename, instructions, exported: true };
}

/**
 * Cheque generation
 */
async function executeChequeSettlement(batch) {
	logger.info("🎫 Generating Cheque Issuance Request...");

	const owner = getOwnerAccounts().bank;
	const request = {
		batch_id: batch.batch_id,
		amount: batch.total_amount,
		currency: batch.currency,
		payable_to: owner.name,
		memo: `Autonomous Settlement ${batch.batch_id}`,
		status: "PENDING_CHEQUE_MAILING",
		created_at: new Date().toISOString(),
	};

	const filename = `cheque_request_${batch.batch_id}.json`;
	const exportsDir = path.join(process.cwd(), "exports", "cheques");
	fs.mkdirSync(exportsDir, { recursive: true });
	await fs.promises.writeFile(
		path.join(exportsDir, filename),
		JSON.stringify(request, null, 2),
	);

	logger.info(`✅ Cheque request generated: ${filename}`);
	await updateLedgerForAPISettlement(
		batch.batch_id,
		"pending_external_confirmation",
		`FILE:${filename}`,
	);

	return { ok: true, filename, request, exported: true };
}

/**
 * Payoneer CSV generation
 */
async function executePayoneerSettlement(batch) {
	logger.info("💼 Generating Payoneer CSV...");

	// Generate Payoneer CSV
	const csv = generatePayoneerCSV(batch);
	const filename = `payoneer_${batch.batch_id}.csv`;

	const exportsDir = path.join(process.cwd(), "exports", "payoneer");
	fs.mkdirSync(exportsDir, { recursive: true });
	await fs.promises.writeFile(path.join(exportsDir, filename), csv);
	// fs.writeFileSync(`./exports/${filename}`, csv);

	logger.info(`✅ Payoneer CSV generated: ${filename}`);

	return { ok: true, filename, csv };
}

/**
 * Wise API execution
 */
async function executeWiseSettlement(batch, gatewayManager) {
	logger.info("💳 Executing Wise payout via API...");

	const _ownerAccounts = getOwnerAccounts();
	const recipient =
		process.env.OWNER_WISE_RECIPIENT_ID || batch.items[0]?.recipient;

	if (!recipient) {
		throw new Error("WiseGateway: Missing OWNER_WISE_RECIPIENT_ID");
	}

	const result = await gatewayManager.wiseGateway.executeTransfer({
		amount: batch.total_amount,
		currency: batch.currency,
		recipient,
		payoutBatchId: batch.batch_id,
		description: `Settlement ${batch.batch_id}`,
	});

	if (result.ok) {
		logger.info(`✅ Wise payout executed: ${result.transactionId}`);
		await updateLedgerForAPISettlement(
			batch.batch_id,
			"processing",
			result.transactionId,
		);
	}

	return result;
}

/**
 * GooglePay CSV generation
 */
async function executeGooglePaySettlement(batch) {
	logger.info("💳 Executing GooglePay payout...");
	const csv = generateGooglePayCSV(batch);
	const filename = `googlepay_${batch.batch_id}.csv`;

	const exportsDir = path.join(process.cwd(), "exports", "googlepay");
	fs.mkdirSync(exportsDir, { recursive: true });
	await fs.promises.writeFile(path.join(exportsDir, filename), csv);

	logger.info(`✅ GooglePay CSV generated: ${filename}`);
	await updateLedgerForAPISettlement(
		batch.batch_id,
		"pending_external_confirmation",
		`FILE:${filename}`,
	);
	return { ok: true, filename, csv, exported: true };
}

/**
 * Plaid CSV generation
 */
async function executePlaidSettlement(batch) {
	logger.info("💳 Executing Plaid payout...");
	const csv = generatePlaidCSV(batch);
	const filename = `plaid_${batch.batch_id}.csv`;

	const exportsDir = path.join(process.cwd(), "exports", "plaid");
	fs.mkdirSync(exportsDir, { recursive: true });
	await fs.promises.writeFile(path.join(exportsDir, filename), csv);

	logger.info(`✅ Plaid CSV generated: ${filename}`);
	await updateLedgerForAPISettlement(
		batch.batch_id,
		"pending_external_confirmation",
		`FILE:${filename}`,
	);
	return { ok: true, filename, csv, exported: true };
}

/**
 * Crypto API execution
 */
async function executeCryptoSettlement(batch, gatewayManager) {
	logger.info("💳 Executing Crypto payout via API...");

	const ownerAccounts = getOwnerAccounts();
	const destination = ownerAccounts.crypto;

	if (!destination) {
		throw new Error("CryptoGateway: Missing OWNER_CRYPTO_ADDRESS");
	}

	const transactions = [
		{
			destination,
			amount: batch.total_amount,
			network: process.env.CRYPTO_NETWORK || "BEP20",
			coin: "USDT",
		},
	];

	const result = await gatewayManager.cryptoGateway.executeTransfer(
		transactions,
		{ provider: "auto" },
	);

	if (result.status === "SUBMITTED" || result.status === "SUBMITTED_WITH_TX") {
		logger.info(
			`✅ Crypto payout submitted via ${result.provider}: ${result.transactionId}`,
		);
		await updateLedgerForAPISettlement(
			batch.batch_id,
			"processing",
			result.transactionId,
		);
		return {
			ok: true,
			transactionId: result.transactionId,
			provider: result.provider,
		};
	}

	return { ok: false, reason: result.status };
}

/**
 * Updates ledger for API-based settlements
 */
async function updateLedgerForAPISettlement(batchId, status, gatewayRef) {
	if (!shouldWritePayoutLedger()) return;

	const base44 = buildBase44ServiceClient();
	const batchEntity = base44.asServiceRole.entities.PayoutBatch;
	const itemEntity = base44.asServiceRole.entities.PayoutItem;

	const recs = await batchEntity.filter(
		{ batch_id: batchId },
		"-created_date",
		1,
		0,
	);
	if (recs.length > 0) {
		await batchEntity.update(recs[0].id, {
			status,
			gateway_ref: gatewayRef,
			updated_date: new Date().toISOString(),
		});

		const itemRecs = await itemEntity.filter(
			{ batch_id: batchId },
			"-created_date",
			1000,
			0,
		);
		for (const item of itemRecs) {
			await itemEntity.update(item.id, {
				status,
				updated_date: new Date().toISOString(),
			});
		}
	}
}

// ============================================================================
// LEDGER & STATE UPDATES
// ============================================================================

/**
 * Marks a list of events as settled in the ledger
 */
async function markEventsSettled(eventIds, batchId) {
	logger.info(`📝 Marking ${eventIds.length} events as settled`);

	if (!shouldWritePayoutLedger()) return;

	const base44 = buildBase44ServiceClient();
	const cfg = getRevenueConfigFromEnv();
	const entity = base44.asServiceRole.entities[cfg.entityName];

	for (const eventId of eventIds) {
		try {
			const recs = await entity.filter(
				{ [cfg.fieldMap.externalId]: eventId },
				"-created_date",
				1,
				0,
			);
			if (recs.length > 0) {
				await entity.update(recs[0].id, {
					[cfg.fieldMap.payoutBatchId]: batchId,
					[cfg.fieldMap.status]: "SETTLED",
				});
			}
		} catch (error) {
			console.error(`❌ Failed to mark event ${eventId} as settled:`, error);
		}
	}
}

// ============================================================================
// UTILITIES
// ============================================================================

function isSundayNow() {
	return new Date().getDay() === 0;
}

function shouldWritePayoutLedger() {
	return (process.env.WRITE_PAYOUT_LEDGER || "true").toLowerCase() === "true";
}

function isPayPalPayoutSendEnabled() {
	return (
		(process.env.ENABLE_PAYPAL_PAYOUT_SEND || "false").toLowerCase() === "true"
	);
}

function requireLiveMode(action) {
	if ((process.env.SWARM_LIVE || "false").toLowerCase() !== "true") {
		throw new Error(`Action '${action}' requires SWARM_LIVE=true`);
	}
}

/**
 * Emergency stop function
 */
function _emergencyStop() {
	logger.info("🚨 EMERGENCY STOP ACTIVATED");
	state.running = false;
	CONFIG.ENABLE_IMMEDIATE_SETTLEMENT = false;
	// You might want to add more logic here, like sending a notification
}

/**
 * Manual trigger for settlement cycle
 */
async function _triggerManualSettlement() {
	logger.info("⚡ Manual settlement triggered");
	await performSettlementCycle();
}

// ============================================================================
// CSV GENERATORS
// ============================================================================

function _generateBankWireCSV(batch) {
	const headers = "Amount,Currency,Recipient Name,Recipient IBAN,Reference";
	const rows = batch.items.map(
		(item) =>
			`${item.amount},${item.currency},${getOwnerAccounts().bank.name},${item.recipient},${item.revenue_event_id}`,
	);
	return [headers, ...rows].join("\n");
}

function generatePayoneerCSV(batch) {
	const headers =
		"Payment ID,Payee ID,Amount,Currency,Description,Mass payment ID";
	const rows = batch.items.map(
		(item) =>
			`${item.sender_item_id},${item.recipient},${item.amount},${item.currency},Settlement for ${item.revenue_event_id},${batch.batch_id}`,
	);
	return [headers, ...rows].join("\n");
}

function _generateWiseCSV(batch) {
	const headers = "amount,currency,recipientEmail,reference";
	const rows = batch.items.map(
		(item) =>
			`${item.amount},${item.currency},${getOwnerAccounts().wise.email},${item.revenue_event_id}`,
	);
	return [headers, ...rows].join("\n");
}

function generateGooglePayCSV(batch) {
	const headers = "amount,currency,recipient,reference";
	const rows = batch.items.map(
		(item) =>
			`${item.amount},${item.currency},${getOwnerAccounts().googlepay.email},${item.revenue_event_id}`,
	);
	return [headers, ...rows].join("\n");
}

function generatePlaidCSV(batch) {
	const headers = "amount,currency,accountId,reference";
	const rows = batch.items.map(
		(item) =>
			`${item.amount},${item.currency},${getOwnerAccounts().plaid.accountId},${item.revenue_event_id}`,
	);
	return [headers, ...rows].join("\n");
}

function _generateCryptoCSV(batch) {
	const headers = "amount,currency,address,network,reference";
	const rows = batch.items.map(
		(item) =>
			`${item.amount},${item.currency},${getOwnerAccounts().crypto.address},${getOwnerAccounts().crypto.network},${item.revenue_event_id}`,
	);
	return [headers, ...rows].join("\n");
}

// ============================================================================
// OWNER ACCOUNT MANAGEMENT
// ============================================================================

let ownerAccountsCache = null;

function getOwnerAccounts() {
	if (ownerAccountsCache) return ownerAccountsCache;

	const accounts = {
		paypal: OwnerSettlementEnforcer.getOwnerAccountForType("paypal"),
		bank: {
			name: String(process.env.OWNER_BENEFICIARY_NAME || "").trim() || null,
			rib: OwnerSettlementEnforcer.getOwnerAccountForType("bank_transfer"),
			iban: process.env.OWNER_IBAN || null,
			swift: process.env.OWNER_SWIFT || null,
			bank_name: process.env.OWNER_BANK_NAME || null,
		},
		plaid: {
			accountId:
				process.env.PLAID_OWNER_ACCOUNT_ID ||
				process.env.OWNER_BANK_ACCOUNT_NUM ||
				null,
		},
		payoneer: {
			accountId: OwnerSettlementEnforcer.getOwnerAccountForType("payoneer"),
		},
		wise: {
			email: OwnerSettlementEnforcer.getOwnerAccountForType("wise"),
			recipientId: process.env.OWNER_WISE_RECIPIENT_ID || null,
			profileId: process.env.WISE_PROFILE_ID || null,
		},
		googlepay: {
			email: OwnerSettlementEnforcer.getOwnerAccountForType("googlepay"),
		},
		crypto: {
			address: OwnerSettlementEnforcer.getOwnerAccountForType("crypto"),
			network: process.env.OWNER_CRYPTO_NETWORK || "BSC",
		},
	};

	ownerAccountsCache = accounts;
	return accounts;
}

function selectOptimalOwnerAccount(amount, currency) {
	const accounts = getOwnerAccounts();
	const priority = CONFIG.RAIL_PRIORITY;
	const paypalReady =
		!!accounts.paypal &&
		isPayPalPayoutSendEnabled() &&
		(process.env.SWARM_LIVE || "false").toLowerCase() === "true";

	for (const rail of priority) {
		const t = String(rail || "").toLowerCase();
		if (t === "paypal" && paypalReady) return { type: "PAYPAL" };
		if (
			t === "bank_wire" &&
			accounts.bank &&
			(accounts.bank.rib || accounts.bank.iban) &&
			accounts.bank.name
		)
			return { type: "BANK_WIRE" };
		if (t === "cheque" && accounts.bank && accounts.bank.name)
			return { type: "CHEQUE" };
		if (t === "payoneer" && accounts.payoneer && accounts.payoneer.accountId)
			return { type: "PAYONEER" };
		if (
			t === "wise" &&
			accounts.wise &&
			(accounts.wise.email || accounts.wise.recipientId)
		)
			return { type: "WISE" };
		if (t === "googlepay" && accounts.googlepay && accounts.googlepay.email)
			return { type: "GOOGLEPAY" };
		if (
			t === "plaid" &&
			(process.env.PLAID_ENABLED || "false").toLowerCase() === "true" &&
			accounts.plaid &&
			accounts.plaid.accountId
		)
			return { type: "PLAID" };
		if (t === "crypto" && accounts.crypto && accounts.crypto.address)
			return { type: "CRYPTO" };
	}

	throw new Error(`No suitable owner account found for ${amount} ${currency}`);
}

// ============================================================================
// ENTRY POINT
// ============================================================================

logger.info("🎯 Starting as standalone daemon...");
const isOnce = process.argv.includes("--once");
if (isOnce) {
	performSettlementCycle()
		.then(() => {
			process.exit(0);
		})
		.catch((error) => {
			logger.error("💥 One-shot settlement cycle failed:", error);
			process.exit(1);
		});
} else {
	startAutoSettlementDaemon().catch((error) => {
		logger.error("💥 Daemon startup failed:", error);
		process.exit(1);
	});
}
