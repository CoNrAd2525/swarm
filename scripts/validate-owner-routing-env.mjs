import "dotenv/config";
import { OwnerSettlementEnforcer } from "../src/policy/owner-settlement.mjs";

function b(v) {
	return String(v || "false").toLowerCase() === "true";
}

function ok(name, present) {
	return { name, ok: !!present };
}

function has(v) {
	return v != null && String(v).trim() !== "";
}

function main() {
	const cfg = OwnerSettlementEnforcer.getPaymentConfiguration();
	const out = {
		SWARM_LIVE: b(process.env.SWARM_LIVE),
		routes: cfg.settlement_priority,
		checks: [],
	};

	// PayPal
	if (cfg.settlement_priority.includes("paypal")) {
		const paypal = cfg.creds.paypal;
		out.checks.push(ok("PAYPAL_ENABLED", !paypal.disabled));
		out.checks.push(ok("PAYPAL_CLIENT_ID", has(paypal.clientId)));
		out.checks.push(ok("PAYPAL_CLIENT_SECRET", has(paypal.clientSecret)));
	}

	// Bank Wire
	if (cfg.settlement_priority.includes("bank_transfer")) {
		const bank = cfg.creds.bank;
		out.checks.push(ok("BANK_WIRE_ENABLE", bank.enabled));
		out.checks.push(ok("BANK_WIRE_PROVIDER", bank.provider === "LIVE"));
		out.checks.push(ok("OWNER_BENEFICIARY_NAME", has(bank.beneficiaryName)));
		out.checks.push(
			ok(
				"OWNER_IBAN",
				has(
					process.env.OWNER_IBAN ||
						process.env.MOROCCAN_BANK_RIB ||
						process.env.BANK_IBAN,
				),
			),
		);
		out.checks.push(ok("OWNER_SWIFT", has(bank.swift)));
		try {
			const allow = JSON.parse(bank.allowlist || "[]");
			out.checks.push(
				ok("BANK_ALLOWLIST", Array.isArray(allow) && allow.length > 0),
			);
		} catch {
			out.checks.push(ok("BANK_ALLOWLIST", false));
		}
	}

	// Wise
	if (cfg.settlement_priority.includes("wise")) {
		const w = cfg.creds.wise;
		out.checks.push(ok("WISE_ENABLE", w.enabled));
		out.checks.push(
			ok(
				"WISE_ENVIRONMENT",
				String(process.env.WISE_ENVIRONMENT || "").toLowerCase() === "live",
			),
		);
		out.checks.push(ok("WISE_API_KEY", has(process.env.WISE_API_KEY)));
		out.checks.push(ok("OWNER_WISE_EMAIL", has(w.email)));
	}

	// Google Pay
	if (cfg.settlement_priority.includes("googlepay")) {
		const g = cfg.creds.googlepay;
		out.checks.push(ok("GOOGLEPAY_ENABLE", g.enabled));
		out.checks.push(ok("OWNER_GOOGLEPAY_EMAIL", has(g.email)));
	}

	// Payoneer API
	if (cfg.settlement_priority.includes("payoneer")) {
		const p = cfg.creds.payoneer;
		out.checks.push(ok("PAYONEER_ENABLE", p.enabled));
		out.checks.push(ok("PAYONEER_API_BASE", has(p.base)));
		out.checks.push(ok("PAYONEER_CLIENT_ID", has(p.clientId)));
		out.checks.push(ok("PAYONEER_CLIENT_SECRET", has(p.clientSecret)));
	}

	// Payoneer Standard
	if (cfg.settlement_priority.includes("payoneer_standard")) {
		const ps = cfg.creds.payoneer_standard;
		out.checks.push(ok("PAYONEER_ENABLE_STANDARD", ps.enabled));
		out.checks.push(ok("OWNER_PAYONEER_EMAIL", has(ps.email)));
	}

	// Crypto
	if (cfg.settlement_priority.includes("crypto")) {
		const c = cfg.creds.crypto;
		out.checks.push(ok("CRYPTO_WITHDRAW_ENABLE", c.enabled));
		out.checks.push(ok("TRUST_WALLET_ADDRESS", has(c.address)));
	}

	// CryptoBox
	if (cfg.settlement_priority.includes("cryptobox")) {
		const cx = cfg.creds.cryptobox;
		out.checks.push(ok("CRYPTOBOX_ENABLE", cx.enabled));
		out.checks.push(ok("BINANCE_CRYPTOBOX_URL", has(cx.url)));
	}

	// Smart contract owner vault
	if (cfg.settlement_priority.includes("smart_contract_owner")) {
		const sc = cfg.creds.smart_contract_owner;
		out.checks.push(ok("OWNER_VAULT_ENABLE", sc.enabled));
		out.checks.push(
			ok("OWNER_VAULT_CONTRACT_ADDRESS", has(sc.contractAddress)),
		);
	}

	// Owner accounts for routing
	out.owner_accounts = {
		paypal: OwnerSettlementEnforcer.getOwnerAccountForType("paypal"),
		payoneer: OwnerSettlementEnforcer.getOwnerAccountForType("payoneer"),
		bank_transfer:
			OwnerSettlementEnforcer.getOwnerAccountForType("bank_transfer"),
		crypto: OwnerSettlementEnforcer.getOwnerAccountForType("crypto"),
		cryptobox: OwnerSettlementEnforcer.getOwnerAccountForType("cryptobox"),
		smart_contract_owner: OwnerSettlementEnforcer.getOwnerAccountForType(
			"smart_contract_owner",
		),
	};

	// Summary
	const allOk = out.checks.every((c) => c.ok) && out.SWARM_LIVE;
	process.stdout.write(`${JSON.stringify({ ok: allOk, ...out }, null, 2)}\n`);
}

main();
