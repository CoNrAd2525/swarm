import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";

function envStr(name, def) {
	const v = process.env[name];
	if (v == null) return def;
	const s = String(v).trim();
	return s ? s : def;
}
function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function writeJson(file, data) {
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
	fs.renameSync(tmp, file);
}
function appendLedger(summary) {
	try {
		const file = path.resolve("data", "ledger_updates.json");
		let arr = [];
		if (fs.existsSync(file)) {
			try {
				arr = JSON.parse(fs.readFileSync(file, "utf8"));
				if (!Array.isArray(arr)) arr = [];
			} catch {
				arr = [];
			}
		}
		arr.push(summary);
		writeJson(file, arr);
	} catch {}
}
function nowIso() {
	return new Date().toISOString();
}
async function plaidPost(url, body) {
	const res = await axios.post(url, body, {
		headers: { "Content-Type": "application/json" },
		timeout: 30000,
	});
	return res.data;
}
async function main() {
	const outDir = path.resolve("out", "plaid");
	ensureDir(outDir);
	const base = "https://sandbox.plaid.com";
	let public_token = null;
	let access_token = null;
	const client_id =
		envStr("PLAID_Client_ID", "") || envStr("PLAID_CLIENT_ID", "");
	const secret =
		envStr("PLAID_SANDBOX_SECRET", "") || envStr("PLAID_SECRET", "");
	if (!client_id || !secret) {
		const payload = { ok: false, error: "missing_plaid_credentials", at: nowIso() };
		writeJson(path.join(outDir, `mission_err_${Date.now()}.json`), payload);
		process.stdout.write(JSON.stringify(payload) + "\n");
		process.exitCode = 1;
		return;
	}
	let amount = envStr("PLAID_MISSION_AMOUNT_USD", "1.00");
	const webhook =
		envStr("PUBLIC_WEBHOOK_BASE_URL", "") ||
		envStr("PUBLIC_BASE_URL", "") ||
		"";
	const institution_id = envStr("PLAID_SANDBOX_INSTITUTION_ID", "ins_109508");
	let step = "sandbox_public_token_create";
	try {
		const linkTokenData = await plaidPost(`${base}/sandbox/public_token/create`, {
			client_id,
			secret,
			institution_id,
			initial_products: ["auth", "transfer"],
			options: webhook ? { webhook } : {},
		});
		public_token = linkTokenData.public_token;
		step = "item_public_token_exchange";
		const exch = await plaidPost(`${base}/item/public_token/exchange`, {
			client_id,
			secret,
			public_token,
		});
		access_token = exch.access_token;
		step = "accounts_get";
		const accts = await plaidPost(`${base}/accounts/get`, {
			client_id,
			secret,
			access_token,
		});
		const account_id =
			accts?.accounts?.find((a) => String(a.subtype || "").toLowerCase() === "checking")
				?.account_id || accts?.accounts?.[0]?.account_id;
		if (!account_id) throw new Error("no_account_id");
		step = "transfer_authorization_create";
		async function doAuth(a, t) {
			return plaidPost(`${base}/transfer/authorization/create`, {
				client_id,
				secret,
				access_token,
				account_id,
				type: t,
				amount: a,
				network: "ach",
				ach_class: "ppd",
				device: {
					ip_address: envStr("PLAID_DEVICE_IP", "127.0.0.1"),
					user_agent: envStr("PLAID_DEVICE_UA", "swarm"),
				},
				user: {
					legal_name: envStr("PLAID_USER_LEGAL_NAME", "Test User"),
					email_address: envStr("PLAID_USER_EMAIL", "test@example.com"),
					address: {
						street: envStr("PLAID_USER_ADDR_STREET", "1 Main St"),
						city: envStr("PLAID_USER_ADDR_CITY", "San Francisco"),
						region: envStr("PLAID_USER_ADDR_REGION", "CA"),
						postal_code: envStr("PLAID_USER_ADDR_POSTAL", "94105"),
						country: envStr("PLAID_USER_ADDR_COUNTRY", "US"),
					},
				},
			});
		}
		// Prefer credit flow in Sandbox for higher approval likelihood
		let authz = await doAuth(amount, "credit");
		if (authz.decision !== "approved") {
			const denied = {
				timestamp: nowIso(),
				action: "plaid_transfer_authorization_denied",
				amount: Number(amount),
				decision: authz.decision,
				rationale_code: authz.authorization?.rationale_code || null,
				rationale_description:
					authz.authorization?.rationale || authz.authorization?.decision_rationale || null,
			};
			appendLedger(denied);
			const smallAmount = "1.00";
			authz = await doAuth(smallAmount, "debit");
			if (authz.decision !== "approved") {
				const denied2 = {
					timestamp: nowIso(),
					action: "plaid_transfer_authorization_denied_retry",
					amount: Number(smallAmount),
					decision: authz.decision,
					rationale_code: authz.authorization?.rationale_code || null,
					rationale_description:
						authz.authorization?.rationale || authz.authorization?.decision_rationale || null,
				};
				appendLedger(denied2);
				authz = await doAuth(smallAmount, "credit");
				if (authz.decision !== "approved") throw new Error("authorization_denied");
				amount = smallAmount;
			} else {
				amount = smallAmount;
			}
		}
		step = "transfer_create";
		const transfer = await plaidPost(`${base}/transfer/create`, {
			client_id,
			secret,
			access_token,
			account_id,
			authorization_id: authz.authorization.id,
			type: authz.authorization.type || "debit",
			amount,
			description: envStr("PLAID_TRANSFER_DESC", "Owner Settlement"),
		});
		// Simulate funds availability in Sandbox ledger
		try {
			await plaidPost(`${base}/sandbox/transfer/ledger/simulate_available`, {
				client_id,
				secret,
				access_token,
				transfer_id: transfer.transfer.id,
			});
		} catch {}
		const receipt = {
			ok: true,
			at: nowIso(),
			amount,
			public_token,
			access_token_masked: access_token ? "***" : null,
			account_id,
			authorization_id: authz.authorization.id,
			transfer_id: transfer.transfer.id,
			status: transfer.transfer.status || "initiated",
		};
		writeJson(path.join(outDir, `mission_${Date.now()}.json`), receipt);
		const ledgerSummary = {
			timestamp: nowIso(),
			action: "plaid_transfer_initiated",
			amount: Number(amount),
			currency: "USD",
			status: receipt.status,
			reference_id: receipt.transfer_id,
			webhook_type: "transfer",
			webhook_code: "transfer.initiated",
		};
		appendLedger(ledgerSummary);
		process.stdout.write(JSON.stringify(receipt) + "\n");
	} catch (e) {
		if (String(e?.message ?? e) === "authorization_denied") {
			try {
				const auth = await plaidPost(`${base}/auth/get`, {
					client_id,
					secret,
					access_token,
				});
				const fallback = {
					ok: true,
					fallback: true,
					at: nowIso(),
					step,
					action: "plaid_auth_numbers_retrieved",
					count: Array.isArray(auth?.numbers?.ach) ? auth.numbers.ach.length : 0,
				};
				writeJson(path.join(outDir, `mission_fallback_${Date.now()}.json`), fallback);
				appendLedger({
					timestamp: nowIso(),
					action: "plaid_auth_numbers_retrieved",
					status: "ready_for_billing",
				});
				process.stdout.write(JSON.stringify(fallback) + "\n");
				return;
			} catch {}
		}
		const payload = { ok: false, error: String(e?.message ?? e), step, at: nowIso() };
		writeJson(path.join(outDir, `mission_err_${Date.now()}.json`), payload);
		process.stdout.write(JSON.stringify(payload) + "\n");
		process.exitCode = 1;
	}
}
main();
