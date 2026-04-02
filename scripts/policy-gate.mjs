import { spawnSync } from "node:child_process";
import fs from "node:fs";

function safeReadJson(p) {
	try {
		if (!fs.existsSync(p)) return null;
		return JSON.parse(fs.readFileSync(p, "utf8"));
	} catch {
		return null;
	}
}

function run(cmd, args) {
	const res = spawnSync(cmd, args, { cwd: process.cwd(), encoding: "utf8" });
	return {
		code: Number(res.status ?? 0),
		stdout: String(res.stdout ?? ""),
		stderr: String(res.stderr ?? ""),
	};
}

function main() {
	const secrets = run(process.execPath, ["scripts/secrets-scan.mjs"]);
	const secretsSummary = safeReadJson("logs/security/secrets-summary.json") || {
		by_severity: { critical: 0, high: 0 },
	};
	const critical = Number(secretsSummary?.by_severity?.critical || 0);
	const high = Number(secretsSummary?.by_severity?.high || 0);
	const blockPayments = critical > 0 || high > 0;

	const plaid = run(process.execPath, ["scripts/plaid-preflight.mjs"]);
	const plaidLiveReady = plaid.code === 0;
	const requirePlaid =
		String(process.env.POLICY_REQUIRE_PLAID || "").toLowerCase() === "true";
	const blockOnPlaid = requirePlaid && !plaidLiveReady;

	const status = {
		ok: !blockPayments && !blockOnPlaid,
		at: new Date().toISOString(),
		block_payments: blockPayments,
		reasons: [
			...(blockPayments ? ["secrets_scan_findings"] : []),
			...(blockOnPlaid ? ["plaid_preflight_failed"] : []),
		],
		plaid_live_ready: plaidLiveReady,
		require_plaid: requirePlaid,
		secrets_scan_exit: secrets.code,
		plaid_preflight_exit: plaid.code,
	};

	try {
		fs.mkdirSync("logs/security", { recursive: true });
		fs.writeFileSync(
			"logs/security/policy-status.json",
			JSON.stringify(status, null, 2),
		);
	} catch {
		// ignore
	}

	process.stdout.write(`${JSON.stringify(status)}\n`);
	if (blockPayments || blockOnPlaid) process.exit(9);
	process.exit(0);
}

main();
