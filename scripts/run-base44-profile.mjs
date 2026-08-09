import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { base44Request, getBase44ConnectorConfig } from "../src/util/base44-request.mjs";
import { loadCredsFromCredsTxt } from "../src/utils/creds-txt-loader.mjs";

const PROFILE_SETTINGS = {
	flow: {
		baseUrl: "https://agent-flow-ai-9855ea98.base44.app/api",
		appId: "6888ac155ebf84dd9855ea98",
		mode: "push",
	},
	swarm: {
		baseUrl: "https://agent-swarm-efe0bd7e.base44.app/api",
		appId: "689afeabf1db9c30efe0bd7e",
		mode: "push",
	},
	builder: {
		baseUrl: "https://agent-swarm-efe0bd7e.base44.app/api",
		appId: "689afeabf1db9c30efe0bd7e",
		mode: "builder_wire",
	},
};

function getProfileArg() {
	const raw = String(process.argv[2] || "").trim().toLowerCase();
	if (!raw || !PROFILE_SETTINGS[raw]) {
		throw new Error("PROFILE_REQUIRED: use 'flow', 'swarm', or 'builder'");
	}
	return raw;
}

function nonEmpty(...values) {
	for (const value of values) {
		const text = String(value || "").trim();
		if (text) return text;
	}
	return "";
}

function candidateFiles(cwd) {
	return [
		process.env.BASE44_CREDENTIALS_FILE,
		path.resolve(cwd, "..", "Base44.txt"),
		path.resolve(cwd, "..", "base44.txt"),
	].filter(Boolean);
}

function readCredentialsText(cwd) {
	for (const file of candidateFiles(cwd)) {
		if (fs.existsSync(file)) {
			return { file, text: fs.readFileSync(file, "utf8") };
		}
	}
	throw new Error("BASE44_CREDENTIALS_FILE_NOT_FOUND");
}

function findApiKey(text, profile) {
	const { baseUrl, appId } = PROFILE_SETTINGS[profile];
	const anchors = [baseUrl, appId].filter(Boolean);
	for (const anchor of anchors) {
		const idx = text.indexOf(anchor);
		if (idx >= 0) {
			const end = Math.min(text.length, idx + 12000);
			const window = text.slice(idx, end);
			const match =
				window.match(/api_key\s*["':=\s]+([a-f0-9]{24,})/i) ||
				window.match(/"api_key"\s*:\s*"([a-f0-9]{24,})"/i);
			if (match?.[1]) return match[1];
		}
	}
	const globalMatch = text.match(new RegExp(`${appId}[\\s\\S]{0,1200}?api_key\\s*["':=\\s]+([a-f0-9]{24,})`, "i"));
	if (globalMatch?.[1]) return globalMatch[1];
	throw new Error(`BASE44_API_KEY_NOT_FOUND_FOR_PROFILE:${profile}`);
}

function configureProfileEnv(profile, fileText) {
	const settings = PROFILE_SETTINGS[profile];
	process.env.BASE44_API_URL = process.env.BASE44_API_URL || settings.baseUrl;
	process.env.BASE44_APP_ID = process.env.BASE44_APP_ID || settings.appId;
	process.env.BASE44_API_KEY =
		process.env.BASE44_API_KEY || findApiKey(fileText, profile);
}

function getConfig() {
	return getBase44ConnectorConfig(process.env);
}

async function request(endpoint, method = "GET", body = null) {
	return base44Request(endpoint, {
		method,
		body,
		config: getConfig(),
		includeAppPath: true,
		clientName: "BuilderPayoutExecutorWire/2026.07",
	});
}

function normalizeList(payload) {
	if (Array.isArray(payload)) return payload;
	if (Array.isArray(payload?.items)) return payload.items;
	if (Array.isArray(payload?.data)) return payload.data;
	return [];
}

async function upsertBy(entity, field, value, payload) {
	const params = new URLSearchParams({
		q: JSON.stringify({ [field]: value }),
		limit: "5",
	});
	const existing = normalizeList(await request(`/entities/${entity}?${params.toString()}`));
	if (existing[0]?.id) {
		try {
			return {
				created: false,
				record: await request(`/entities/${entity}/${existing[0].id}`, "PUT", payload),
			};
		} catch (error) {
			if (!String(error?.message || "").includes("405")) throw error;
			return {
				created: false,
				record: await request(`/entities/${entity}/${existing[0].id}`, "PATCH", payload),
			};
		}
	}
	return {
		created: true,
		record: await request(`/entities/${entity}`, "POST", payload),
	};
}

function parseJsonFromOutput(text) {
	const lines = String(text || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	for (let i = lines.length - 1; i >= 0; i--) {
		try {
			return JSON.parse(lines[i]);
		} catch {}
	}
	return null;
}

function runExecutorDryRun() {
	const batchId = `BUILDER_WIRE_${Date.now()}`;
	const result = spawnSync(
		process.execPath,
		[
			path.resolve("scripts", "owner-multi-route-settle.mjs"),
			"--dry-run",
			"--load-creds",
			"--amount",
			"1",
			"--currency",
			"USD",
			"--batch-id",
			batchId,
			"--note",
			"Builder+ payout executor wiring verification",
		],
		{ cwd: process.cwd(), env: process.env, encoding: "utf8" },
	);
	if (result.status !== 0) {
		throw new Error(`EXECUTOR_DRY_RUN_FAILED:${result.stderr || result.stdout || result.status}`);
	}
	const payload = parseJsonFromOutput(result.stdout);
	if (!payload?.ok) throw new Error("EXECUTOR_DRY_RUN_UNPARSEABLE");
	return payload;
}

function buildRecipients() {
	const recipients = [];
	const paypal = nonEmpty(process.env.OWNER_PAYPAL_EMAIL, process.env.PAYPAL_EMAIL);
	const payoneer = nonEmpty(process.env.OWNER_PAYONEER_EMAIL, process.env.PAYONEER_EMAIL);
	const bank = nonEmpty(
		process.env.BANK_IBAN,
		process.env.IBAN_BC,
		process.env.MOROCCAN_BANK_RIB,
		process.env.ACCOUNT_NUMBER_BARCLAYS,
		process.env.ACCOUNT_NUMBER_MUFG,
	);
	const wallet = nonEmpty(
		process.env.TRUST_WALLET_ADDRESS,
		process.env.BYBIT_USDT_ERC20,
		process.env.TRUST_WALLET_USDT_ERC20,
	);
	if (paypal) recipients.push({ name: "Builder+ Owner PayPal", recipient_type: "paypal_email", currency: "USD", account_identifier: paypal, notes: "Primary owner PayPal route for Builder+ payout execution", is_default: true });
	if (payoneer) recipients.push({ name: "Builder+ Owner Payoneer", recipient_type: "payoneer", currency: "USD", account_identifier: payoneer, notes: "Primary owner Payoneer route for Builder+ payout execution", is_default: !paypal });
	if (bank) recipients.push({ name: "Builder+ Owner Bank", recipient_type: "bank_account", currency: String(process.env.OWNER_BANK_CURRENCY || "EUR").toUpperCase(), account_identifier: bank, bank_name: nonEmpty(process.env.BANK_NAME, process.env.BANK_WIRE_BANK_NAME, "Owner settlement bank"), country: nonEmpty(process.env.BANK_COUNTRY, process.env.BANK_WIRE_COUNTRY), swift_bic: nonEmpty(process.env.SWIFT_BIC, process.env.BANK_SWIFT_BIC), sort_code: nonEmpty(process.env.SORT_CODE, process.env.BANK_SORT_CODE), notes: "Primary owner bank route for Builder+ payout execution", is_default: !paypal && !payoneer });
	if (wallet) recipients.push({ name: "Builder+ Owner Crypto", recipient_type: "crypto_wallet", currency: String(process.env.OWNER_CRYPTO_CURRENCY || "USDT").toUpperCase(), account_identifier: wallet, notes: "Primary owner crypto route for Builder+ payout execution", is_default: false });
	return recipients;
}

async function wireBuilderPayoutExecutor() {
	loadCredsFromCredsTxt({});
	const timestamp = new Date().toISOString();
	const dryRun = runExecutorDryRun();
	const recipientResults = [];
	for (const recipient of buildRecipients()) {
		const result = await upsertBy("PayoutRecipient", "name", recipient.name, recipient);
		recipientResults.push({ id: result.record?.id || null, name: recipient.name, created: result.created });
	}
	const agent = await upsertBy("Agent", "name", "Builder+ Payout Executor", {
		name: "Builder+ Payout Executor",
		description: "Real owner payout execution agent wired to the repo's multi-route settlement command with audit logging and route safety.",
		type: "payment_agent",
		status: "active",
		system_prompt: "Execute only owner-directed payout batches via the live multi-route settlement runner. Fail closed on missing credentials or confirmations and never mark receipts as confirmed without downstream proof.",
		capabilities: ["owner_settlement_execution", "multi_route_payouts", "idempotent_execution", "audit_logging", "route_selection", "payoneer_fallback", "attijari_escalation"],
		current_workload: 0,
		max_workload: 1,
		task_queue: [],
		collaboration_rules: { requires_owner_directive: true, fails_closed_on_missing_confirmation: true },
		revenue_config: { command_path: "scripts/owner-multi-route-settle.mjs", daemon_path: "scripts/auto-settle-owner-daemon.mjs", route_source: "src/policy/route-optimizer.mjs", routes_verified: dryRun.routes_considered || [], recipient_names: recipientResults.map((item) => item.name) },
		automation_config: { execution_mode: "external_command", live_guard_env: "SWARM_LIVE", credentials_loader: "src/utils/creds-txt-loader.mjs", default_command: "node ./scripts/owner-multi-route-settle.mjs --load-creds --batch-id {batch_id} --amount {amount} --currency {currency} --note {note}", dry_run_command: "node ./scripts/owner-multi-route-settle.mjs --dry-run --load-creds --batch-id {batch_id} --amount {amount} --currency {currency} --note {note}", verified_at: timestamp },
		performance_metrics: { wired_at: timestamp, last_dry_run_batch_id: dryRun.payout_batch_id || null, last_dry_run_status: dryRun.status || null, raw_status_hint: dryRun.raw_status_hint || null },
	});
	const workflow = await upsertBy("Workflow", "name", "Builder+ Owner Payout Execution", {
		name: "Builder+ Owner Payout Execution",
		description: "Workflow that routes owner payout work to the real Builder+ payout executor command and records the selected rails.",
		category: "custom",
		status: "active",
		trigger: { source_entity: "Task", match: { title: "Execute owner payout batch via Builder+" }, manual_dispatch_allowed: true },
		nodes: [{ id: "validate_owner_guard", type: "gate", description: "Check owner directive and route readiness before execution" }, { id: "execute_builder_payout", type: "command", agent_id: agent.record?.id || null, command: "node ./scripts/owner-multi-route-settle.mjs --load-creds --batch-id {batch_id} --amount {amount} --currency {currency} --note {note}" }, { id: "audit_result", type: "audit", description: "Persist masked gateway output and route attempt summary" }],
		execution_stats: { wired_at: timestamp, last_verified_batch_id: dryRun.payout_batch_id || null, last_verified_routes: dryRun.routes_considered || [], last_verified_route_attempt: dryRun.route_attempted || null },
	});
	const task = await upsertBy("Task", "title", "Builder+ payout executor live wiring", {
		title: "Builder+ payout executor live wiring",
		description: "Completed wiring task proving the real Builder+ payout executor is linked to the live swarm workflow and verified through a dry run.",
		type: "automation_setup",
		priority: "high",
		status: "completed",
		assigned_agent_id: agent.record?.id || null,
		requesting_agent_id: agent.record?.id || null,
		workflow_id: workflow.record?.id || null,
		result_data: { verified_at: timestamp, executor_script: "scripts/owner-multi-route-settle.mjs", daemon_script: "scripts/auto-settle-owner-daemon.mjs", dry_run: dryRun },
		due_date: timestamp,
	});
	const appProject = await upsertBy("AppProject", "name", "Builder+", {
		name: "Builder+",
		concept: "Hands-free builder and payout execution control plane for owner settlement routing, auditability, and recovery-safe revenue operations.",
		status: "live",
		revenue_model: "custom",
		tech_stack: ["Node.js", "Base44", "PayPal", "Payoneer", "Attijari", "Wise", "Crypto"],
		target_market: "Owner operations and payout automation",
		repo_url: "https://github.com/CoNrAd2525/swarm",
		assigned_meta_agent: agent.record?.id || "Builder+ Payout Executor",
		build_progress: { status: "wired", wired_at: timestamp, workflow_id: workflow.record?.id || null, recipient_count: recipientResults.length },
		milestones: ["Builder+ payout executor wired to live Base44 app", "Real multi-route settlement command verified via dry run", "Owner payout recipients synchronized from local credentials"],
		niche: "Payout operations automation",
		priority: "critical",
	});
	const report = { ok: true, timestamp, dry_run: dryRun, records: { app_project: { id: appProject.record?.id || null, created: appProject.created }, agent: { id: agent.record?.id || null, created: agent.created }, workflow: { id: workflow.record?.id || null, created: workflow.created }, task: { id: task.record?.id || null, created: task.created }, recipients: recipientResults } };
	const auditsDir = path.resolve("audits");
	fs.mkdirSync(auditsDir, { recursive: true });
	const reportPath = path.join(auditsDir, `builder-payout-executor-wiring-${Date.now()}.json`);
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
	process.stdout.write(`${JSON.stringify({ ...report, report_path: reportPath })}\n`);
}

async function main() {
	const cwd = process.cwd();
	const profile = getProfileArg();
	const { file, text } = readCredentialsText(cwd);
	configureProfileEnv(profile, text);

	process.stdout.write(
		`${JSON.stringify({
			ok: true,
			profile,
			credentials_file: file,
			base_url: process.env.BASE44_API_URL,
			app_id: process.env.BASE44_APP_ID,
			auth_mode: "api_key",
		})}\n`,
	);

	if (PROFILE_SETTINGS[profile].mode === "builder_wire") {
		await wireBuilderPayoutExecutor();
		return;
	}

	const mod = await import("./push-to-base44.mjs");
	if (typeof mod.main !== "function") {
		throw new Error("PUSH_TO_BASE44_MAIN_NOT_EXPORTED");
	}
	await mod.main();
}

main().catch((error) => {
	process.stderr.write(`${error?.message || String(error)}\n`);
	process.exit(1);
});
