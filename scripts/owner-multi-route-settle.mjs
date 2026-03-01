import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { ExternalGatewayManager } from "../src/finance/ExternalGatewayManager.mjs";
import { getEffectiveRoutes } from "../src/policy/route-optimizer.mjs";
import { parseArgs } from "../src/utils/cli.mjs";
import { loadCredsFromCredsTxt } from "../src/utils/creds-txt-loader.mjs";

function isLive() {
	return String(process.env.SWARM_LIVE || "false").toLowerCase() === "true";
}

function maskDestination(v) {
	const s = String(v || "");
	if (!s) return "";
	if (s.includes("@")) {
		const [a, b] = s.split("@");
		const left = a.length <= 2 ? a : `${a.slice(0, 2)}...`;
		return `${left}@${b}`;
	}
	if (s.startsWith("0x") && s.length > 10)
		return `${s.slice(0, 6)}...${s.slice(-4)}`;
	if (s.length > 10) return `${s.slice(0, 4)}...${s.slice(-4)}`;
	return s;
}

class FileStorage {
	constructor() {
		this.dataDir = path.join(process.cwd(), "data", "settlements");
		fs.mkdirSync(this.dataDir, { recursive: true });
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

async function main() {
	const args = parseArgs(process.argv);
	const dryRun = args["dry-run"] === true || args.dryRun === true;
	const loadCreds =
		args["load-creds"] !== false && args.loadCreds !== false;
	if (loadCreds) {
		const override =
			args["override-creds"] === true || args.overrideCreds === true;
		loadCredsFromCredsTxt({ override });
	}
	if (!dryRun && !isLive()) {
		process.stderr.write(
			JSON.stringify({ ok: false, error: "SWARM_LIVE=true required" }) + "\n",
		);
		process.exitCode = 1;
		return;
	}

	if (args.priority || args["priority"]) {
		process.env.PAYMENT_ROUTING_PRIORITY = String(args.priority || args["priority"]);
		process.env.FORCE_BANK_WIRE = "false";
	}
	if (args["paypal-timeout-ms"] || args.paypalTimeoutMs) {
		const ms = Number(args["paypal-timeout-ms"] ?? args.paypalTimeoutMs);
		if (Number.isFinite(ms) && ms >= 1000)
			process.env.PAYPAL_HTTP_TIMEOUT_MS = String(Math.floor(ms));
	}
	if (args["ccxt-timeout-ms"] || args.ccxtTimeoutMs) {
		const ms = Number(args["ccxt-timeout-ms"] ?? args.ccxtTimeoutMs);
		if (Number.isFinite(ms) && ms >= 1000)
			process.env.CCXT_HTTP_TIMEOUT_MS = String(Math.floor(ms));
	}
	if (args["crypto-provider-priority"] || args.cryptoProviderPriority) {
		const v = String(
			args["crypto-provider-priority"] ?? args.cryptoProviderPriority ?? "",
		).trim();
		if (v) process.env.CRYPTO_PROVIDER_PRIORITY = v;
	}

	const amount = Number(args.amount ?? 0);
	const currency = String(args.currency || "USD").toUpperCase();
	if (!Number.isFinite(amount) || amount <= 0) {
		process.stderr.write(JSON.stringify({ ok: false, error: "invalid_amount" }) + "\n");
		process.exitCode = 1;
		return;
	}

	const payoutBatchId = String(
		args.batchId ?? args["batch-id"] ?? `OWNER_MULTI_${Date.now()}`,
	);
	const idempotencyKey = String(
		args.idem ?? args["idempotency-key"] ?? `IDEMPOTENCY_${payoutBatchId}`,
	);
	const actor = String(args.actor ?? "OwnerMultiRouteRunner");
	const routes = getEffectiveRoutes(amount, currency);

	const recipientItems = [
		{
			amount,
			currency,
			recipient_email: process.env.OWNER_PAYPAL_EMAIL || process.env.PAYPAL_EMAIL || "",
			recipient_address: process.env.TRUST_WALLET_ADDRESS || "",
			note: String(args.note ?? `Owner settlement ${payoutBatchId}`),
		},
	];

	const audit = new FileAudit();
	const storage = new FileStorage();
	audit.log(
		"OWNER_MULTI_ROUTE_REQUEST",
		payoutBatchId,
		null,
		{
			payout_batch_id: payoutBatchId,
			routes_considered: routes,
			route_disable_json_present:
				(process.env.ROUTE_DISABLE_JSON ?? "").trim() !== "",
			force_bank_wire: String(process.env.FORCE_BANK_WIRE || ""),
			paypal_http_timeout_ms: process.env.PAYPAL_HTTP_TIMEOUT_MS ?? null,
			ccxt_http_timeout_ms: process.env.CCXT_HTTP_TIMEOUT_MS ?? null,
		},
		actor,
	);

	if (dryRun) {
		audit.log(
			"OWNER_MULTI_ROUTE_DRY_RUN",
			payoutBatchId,
			null,
			{
				payout_batch_id: payoutBatchId,
				routes_considered: routes,
				item_preview: recipientItems.map((x) => ({
					amount: x.amount,
					currency: x.currency,
					recipient_email_masked: maskDestination(x.recipient_email),
					recipient_address_masked: maskDestination(x.recipient_address),
				})),
			},
			actor,
		);
		process.stdout.write(
			JSON.stringify(
				{
					ok: true,
					dry_run: true,
					payout_batch_id: payoutBatchId,
					routes_considered: routes,
					item_preview: recipientItems.map((x) => ({
						amount: x.amount,
						currency: x.currency,
						recipient_email_masked: maskDestination(x.recipient_email),
						recipient_address_masked: maskDestination(x.recipient_address),
					})),
				},
				null,
				2,
			) + "\n",
		);
		return;
	}

	const manager = new ExternalGatewayManager(
		storage,
		audit,
		new IdempotentExecutor(storage),
	);

	const prepared = await manager.initiateAutoSettlement(
		payoutBatchId,
		recipientItems,
		idempotencyKey,
		actor,
	);

	const attempted = String(prepared?.route_attempted || "");
	const gw = prepared?.gateway_response || null;
	const masked = Array.isArray(gw?.masked_recipients)
		? gw.masked_recipients
		: Array.isArray(gw?.items)
			? gw.items.map((x) => ({ ...x, destination: maskDestination(x?.destination) }))
			: null;

	process.stdout.write(
		JSON.stringify(
			{
				ok: true,
				payout_batch_id: payoutBatchId,
				routes_considered: routes,
				route_attempted: attempted,
				status: prepared?.status || null,
				processed_at: prepared?.processed_at || null,
				gateway_response_masked: masked,
				raw_status_hint:
					prepared?.status === "success"
						? "executed"
						: prepared?.status === "processing"
							? "prepared_or_submitted"
							: "unknown",
			},
			null,
			2,
		) + "\n",
	);
}

main().catch((e) => {
	process.stderr.write(
		JSON.stringify({
			ok: false,
			error: e?.message || String(e),
			hint: "See logs/audit/* for ROUTE_FAILURE + ALL_ROUTES_FAILED",
		}) + "\n",
	);
	process.exitCode = 1;
});
