import "dotenv/config";
import fs from "fs";
import path from "path";
import { PayPalGateway } from "../src/financial/gateways/PayPalGateway.mjs";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
	const args = {};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith("--")) continue;
		const k = a.slice(2);
		const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true;
		args[k] = v;
		if (v !== true) i++;
	}
	return args;
}

function listCsv(v) {
	if (!v) return [];
	return String(v)
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function ownerPayPalAllowlist() {
	const csv = listCsv(process.env.AUTONOMOUS_ALLOWED_PAYPAL_RECIPIENTS);
	if (csv.length > 0) return csv.map((x) => String(x).toLowerCase());
	const raw = String(process.env.OWNER_BENEFICIARY_ALLOWLIST_JSON || "").trim();
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((entry) => {
				const rail = String(entry?.rail ?? "").trim().toLowerCase();
				if (rail && rail !== "paypal") return null;
				const email = String(
					entry?.email ?? entry?.recipient ?? entry?.paypal ?? "",
				)
					.trim()
					.toLowerCase();
				return email.includes("@") ? email : null;
			})
			.filter(Boolean);
	} catch {
		return [];
	}
}

async function main() {
	const args = parseArgs(process.argv);
	const amount = Number(args.amount || process.env.PAYPAL_ONCE_AMOUNT || "0");
	const email =
		args.email ||
		process.env.PAYPAL_ONCE_EMAIL ||
		process.env.OWNER_PAYPAL_EMAIL;
	const note = args.note || process.env.SETTLEMENT_NOTE || "Owner payout";
	const currency = String(
		args.currency || process.env.PAYPAL_ONCE_CURRENCY || "USD",
	).toUpperCase();

	const live =
		String(process.env.SWARM_LIVE ?? "false").toLowerCase() === "true";
	const paypalMode = String(process.env.PAYPAL_MODE ?? "live").toLowerCase();
	const paypalBase = String(
		process.env.PAYPAL_API_BASE_URL ?? "",
	).toLowerCase();
	if (!live) {
		console.log(
			JSON.stringify({
				ok: false,
				error: "SWARM_LIVE_false",
				hint: "set SWARM_LIVE=true",
			}),
		);
		return;
	}
	if (paypalMode === "sandbox" || paypalBase.includes("sandbox.paypal.com")) {
		console.log(
			JSON.stringify({
				ok: false,
				error: "paypal_sandbox_configured",
				hint: "remove sandbox for live payout",
			}),
		);
		return;
	}
	if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
		console.log(
			JSON.stringify({
				ok: false,
				error: "missing_paypal_credentials",
				hint: "set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET",
			}),
		);
		return;
	}

	if (!email || !(amount > 0)) {
		console.log(
			JSON.stringify({ ok: false, error: "missing_email_or_amount" }),
		);
		return;
	}
	const gw = new PayPalGateway();
	const outDir = path.resolve("settlements/paypal");
	if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
	const filePath = path.join(
		outDir,
		`owner_paypal_payout_once_${Date.now()}.json`,
	);

	const allowSend =
		String(process.env.PAYPAL_PPP2_APPROVED ?? "false").toLowerCase() ===
			"true" &&
		String(process.env.PAYPAL_PPP2_ENABLE_SEND ?? "false").toLowerCase() ===
			"true";
	const allowlist = ownerPayPalAllowlist();
	const allowlisted =
		allowlist.length > 0 && allowlist.includes(String(email).toLowerCase());
	const confirm =
		String(args.confirm || process.env.PAYPAL_LIVE_CONFIRM || "").trim() ===
		"I_CONFIRM_PAYPAL_PAYOUT";

	let result = null;
	let batchId = null;
	let sync = null;
	try {
		if (!allowlisted || !allowSend || !confirm) {
			const invoice = await gw.createInvoices([
				{ amount, currency, destination: email },
			]);
			result = {
				fallback: "invoice",
				blocked: {
					allowlisted,
					allowSend,
					confirm,
				},
				data: invoice,
			};
		} else {
			const res = await gw.executePayout([
				{ amount, currency, destination: email, reference: note },
			]);
			fs.writeFileSync(filePath, JSON.stringify(res, null, 2));
			batchId =
				res?.result?.batch_header?.payout_batch_id ??
				res?.batch_header?.payout_batch_id ??
				null;
			if (batchId) {
				const s = spawnSync(
					process.execPath,
					["src/sync-paypal-payout-batch.mjs", "--batchId", String(batchId)],
					{ encoding: "utf8" },
				);
				sync = { ok: s.status === 0, out: s.stdout, err: s.stderr };
			}
			result = { payout: res };
		}
	} catch (e) {
		const msg = e && e.message ? e.message : String(e);
		if (msg.includes("AUTHORIZATION_ERROR")) {
                        console.log(
                                JSON.stringify({
                                        ok: false,
                                        error: "paypal_authorization_error_no_external_transfer",
                                        no_external_transfer_executed: true,
                                        requires_human_approval: false,
                                        owner_hands_free_policy: true,
                                        reroute_to_builder_executor: true,
                                        message:
                                                "No external transfer was executed. PayPal authorization failed before a live payout batch could be created. Re-run through the real Builder+ payout executor once the live route prerequisites are satisfied.",
                                        details: {
                                                amount,
                                                currency,
                                                destination: email,
                                        },
                                }),
                        );
                        process.exitCode = 1;
                        return;
		} else {
			console.log(JSON.stringify({ ok: false, error: msg }));
			return;
		}
	}

	console.log(
		JSON.stringify({
			ok: !!batchId || !!result,
			filePath,
			batchId,
			sync,
			result,
		}),
	);
}

main();
