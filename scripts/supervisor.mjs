import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";

/**
 * SELF-HEALING SUPERVISOR (v1.0)
 *
 * Objective: Keep all autonomous daemons running. Restart if they crash.
 * Monitor:
 *  - auto-settle-owner-daemon.mjs
 *  - cleanup-daemon.mjs
 *  - site-upgrade-daemon.mjs
 */
const DAEMONS = [
	{
		name: "Settlement",
		script: "scripts/auto-settle-owner-daemon.mjs",
		env: { SWARM_LIVE: "true", WISE_ENABLE: "true" },
	},
	{ name: "Cleanup", script: "scripts/cleanup-daemon.mjs", env: {} },
	{ name: "SiteUpgrade", script: "scripts/site-upgrade-daemon.mjs", env: {} },
	{ name: "RevenueSwarm", script: "scripts/revenue-swarm-daemon.mjs", env: {} },
	{ name: "Recovery", script: "scripts/recovery-daemon.mjs", env: {} },
];

function safeJsonRead(file) {
	try {
		if (!fs.existsSync(file)) return null;
		const raw = fs.readFileSync(file, "utf8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function evaluatePolicyOnce() {
	try {
		spawnSync(process.execPath, ["scripts/secrets-scan.mjs"], {
			cwd: process.cwd(),
			encoding: "utf8",
		});
	} catch {}
	let secrets = safeJsonRead("logs/security/secrets-summary.json");
	if (!secrets) secrets = { by_severity: { critical: 0, high: 0 } };
	const critical = Number(secrets?.by_severity?.critical || 0);
	const high = Number(secrets?.by_severity?.high || 0);
	const blockPayments = critical > 0 || high > 0;
	let plaidExit = 0;
	try {
		const res = spawnSync(process.execPath, ["scripts/plaid-preflight.mjs"], {
			cwd: process.cwd(),
			encoding: "utf8",
		});
		plaidExit = Number(res.status ?? 0);
	} catch {
		plaidExit = 1;
	}
	const plaidLiveReady = plaidExit === 0;
	const out = {
		at: new Date().toISOString(),
		block_payments: blockPayments,
		reasons: blockPayments ? ["secrets_scan_findings"] : [],
		plaid_live_ready: plaidLiveReady,
	};
	try {
		fs.mkdirSync("logs/security", { recursive: true });
		fs.writeFileSync(
			"logs/security/policy-status.json",
			JSON.stringify(out, null, 2),
		);
	} catch {}
	return out;
}

class Supervisor {
	constructor() {
		this.processes = new Map();
		this.policy = { at_ms: 0, status: null };
	}

	_getPolicy() {
		const now = Date.now();
		if (this.policy.status && now - this.policy.at_ms < 10 * 60 * 1000) {
			return this.policy.status;
		}
		const status = evaluatePolicyOnce();
		this.policy = { at_ms: now, status };
		return status;
	}

	startDaemon(daemon) {
		const policy = this._getPolicy();
		if (daemon.name === "Settlement" && policy.block_payments) {
			console.log(
				`[Supervisor] 🛑 Settlement blocked by policy (${policy.reasons.join(",")}). Retrying in 10m...`,
			);
			setTimeout(() => this.startDaemon(daemon), 10 * 60 * 1000);
			return;
		}
		console.log(`[Supervisor] 🚀 Starting ${daemon.name}...`);

		const env = { ...process.env, ...daemon.env };
		if (daemon.name === "Settlement") {
			env.EMERGENCY_PAYMENT_LOCK = String(
				policy.block_payments ? "true" : "false",
			);
			env.PLAID_ENABLED = String(policy.plaid_live_ready ? "true" : "false");
		}

		const child = spawn("node", [daemon.script], {
			cwd: process.cwd(),
			env,
			stdio: "inherit",
		});

		child.on("exit", (code) => {
			console.log(
				`[Supervisor] ⚠️ ${daemon.name} exited with code ${code}. Restarting in 5s...`,
			);
			this.processes.delete(daemon.name);
			setTimeout(() => this.startDaemon(daemon), 5000);
		});

		child.on("error", (err) => {
			console.error(`[Supervisor] ❌ ${daemon.name} error:`, err.message);
		});

		this.processes.set(daemon.name, child);
	}

	startAll() {
		console.log("🛠 [Supervisor] Initializing all autonomous systems...");
		for (const daemon of DAEMONS) {
			this.startDaemon(daemon);
		}
	}

	stopAll() {
		console.log("\n🛑 [Supervisor] Shutting down all systems...");
		for (const [_name, child] of this.processes) {
			child.kill("SIGINT");
		}
	}
}

const supervisor = new Supervisor();
supervisor.startAll();

process.on("SIGINT", () => supervisor.stopAll());
