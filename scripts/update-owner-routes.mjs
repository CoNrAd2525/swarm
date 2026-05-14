import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
	const args = {};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith("--")) continue;
		const key = a.slice(2);
		const next = argv[i + 1];
		if (!next || next.startsWith("--")) {
			args[key] = true;
		} else {
			args[key] = next;
			i++;
		}
	}
	return args;
}

function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJsonMaybe(filePath) {
	try {
		const txt = fs.readFileSync(filePath, "utf8");
		return JSON.parse(txt);
	} catch {
		return null;
	}
}

function main() {
	const args = parseArgs(process.argv);
	const outDir = path.resolve("data", "owner");
	const filePath = path.join(outDir, "owner-routes.json");
	ensureDir(outDir);

	const inputFile = args.file || args["file"];
	let payload = null;
	if (inputFile) {
		const abs = path.resolve(String(inputFile));
		const j = readJsonMaybe(abs);
		if (j && typeof j === "object") payload = j;
	}

	if (!payload) {
		const priority = String(
			args.priority ||
				process.env.PAYMENT_ROUTING_PRIORITY ||
				"bank_transfer,wise,payoneer,crypto,paypal,googlepay",
		)
			.split(",")
			.map((r) => r.trim())
			.filter(Boolean);

		payload = {
			priority,
			bank: {
				enabled:
					String(args.bank_enable ?? process.env.BANK_WIRE_ENABLE ?? "false").toLowerCase() ===
					"true",
				provider: String(args.bank_provider ?? process.env.BANK_WIRE_PROVIDER ?? "WISE").toUpperCase(),
				beneficiaryName:
					args.beneficiary_name ?? process.env.OWNER_BENEFICIARY_NAME ?? "",
				iban: args.iban ?? process.env.OWNER_IBAN ?? process.env.BANK_IBAN ?? "",
				swift: args.swift ?? process.env.OWNER_SWIFT ?? "",
				routingNumber:
					args.routing_number ??
					process.env.OWNER_ROUTING_NUMBER ??
					process.env.OWNER_ROUTING ??
					"",
				sortCode: args.sort_code ?? process.env.OWNER_SORT_CODE ?? "",
				accountNumber:
					args.account_number ??
					process.env.OWNER_ACCOUNT_NUMBER ??
					process.env.OWNER_BANK_ACCOUNT_NUM ??
					"",
				country: args.bank_country ?? process.env.OWNER_BANK_COUNTRY ?? "",
				allowlist:
					args.bank_allowlist_json ??
					process.env.OWNER_BENEFICIARY_ALLOWLIST_JSON ??
					"[]",
			},
			wise: {
				enabled:
					String(args.wise_enable ?? process.env.WISE_ENABLE ?? "false").toLowerCase() ===
					"true",
				environment: String(args.wise_environment ?? process.env.WISE_ENVIRONMENT ?? ""),
				email: args.owner_wise_email ?? process.env.OWNER_WISE_EMAIL ?? "",
			},
			paypal: {
				disabled:
					String(
						args.paypal_disabled ?? process.env.PAYPAL_DISABLED ?? "false",
					).toLowerCase() === "true",
				clientId: args.paypal_client_id ?? process.env.PAYPAL_CLIENT_ID ?? "",
				clientSecret:
					args.paypal_client_secret ?? process.env.PAYPAL_CLIENT_SECRET ?? "",
				webhookId: args.paypal_webhook_id ?? process.env.PAYPAL_WEBHOOK_ID ?? "",
				ownerEmail:
					args.owner_paypal_email ??
					process.env.OWNER_PAYPAL_EMAIL ??
					process.env.PAYPAL_EMAIL ??
					"",
			},
			payoneer: {
				enabled:
					String(
						args.payoneer_enable ?? process.env.PAYONEER_ENABLE ?? "false",
					).toLowerCase() === "true",
				base: args.payoneer_api_base ?? process.env.PAYONEER_API_BASE ?? "",
				clientId: args.payoneer_client_id ?? process.env.PAYONEER_CLIENT_ID ?? "",
				clientSecret:
					args.payoneer_client_secret ?? process.env.PAYONEER_CLIENT_SECRET ?? "",
			},
			payoneer_standard: {
				enabled:
					String(
						args.payoneer_standard_enable ??
							process.env.PAYONEER_ENABLE_STANDARD ??
							"false",
					).toLowerCase() === "true",
				email:
					args.owner_payoneer_email ??
					process.env.OWNER_PAYONEER_EMAIL ??
					process.env.PAYONEER_EMAIL ??
					"",
			},
			crypto: {
				enabled:
					String(
						args.crypto_enable ?? process.env.CRYPTO_WITHDRAW_ENABLE ?? "false",
					).toLowerCase() === "true",
				address:
					args.trust_wallet_address ??
					process.env.TRUST_WALLET_ADDRESS ??
					process.env.TRUST_WALLET_USDT_ERC20 ??
					"",
			},
			googlepay: {
				enabled:
					String(args.googlepay_enable ?? process.env.GOOGLEPAY_ENABLE ?? "false").toLowerCase() ===
					"true",
				email:
					args.googlepay_email ??
					process.env.OWNER_GOOGLEPAY_EMAIL ??
					process.env.GOOGLEPAY_ACCOUNT_EMAIL ??
					"",
			},
		};
	}

	fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
	process.stdout.write(
		`${JSON.stringify({ ok: true, file: filePath, routes: payload.priority }, null, 2)}\n`,
	);
}

main();
