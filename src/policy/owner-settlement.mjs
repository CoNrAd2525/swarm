function isPlaceholder(v) {
	if (v == null) return true;
	const s = String(v).trim();
	if (!s) return true;
	if (/^YOUR_[A-Z0-9_]+$/i.test(s)) return true;
	if (/^(REPLACE_ME|CHANGEME|TODO)$/i.test(s)) return true;
	return false;
}

function normEmail(v) {
	if (!v) return null;
	const s = String(v).trim();
	return s.includes("@") ? s.toLowerCase() : null;
}

export function getPaymentConfiguration() {
	const SAFE_MODE =
		String(
			process.env.SAFE_MODE || process.env.SWARM_SAFE_MODE || "false",
		).toLowerCase() === "true";
	const priorityEnv =
		process.env.PAYMENT_ROUTING_PRIORITY ||
		"mpc,safe,bank_transfer,crypto,payoneer,wise,paypal,googlepay";
	const settlement_priority = priorityEnv
		.split(/[,\s]+/g)
		.map((r) => r.trim())
		.filter(Boolean);
	const creds = {
		mpc: {
			enabled:
				String(process.env.MPC_ENABLE || "false").toLowerCase() === "true",
			provider: process.env.MPC_PROVIDER || "FIREBLOCKS",
			org: process.env.MPC_ORG_NAME || "",
		},
		safe: {
			enabled:
				String(process.env.SAFE_ENABLE || "false").toLowerCase() === "true",
			chain: String(process.env.SAFE_CHAIN || "").toUpperCase(),
			address: process.env.SAFE_ADDRESS || "",
		},
		paypal: {
			clientId: process.env.PAYPAL_CLIENT_ID,
			clientSecret: process.env.PAYPAL_CLIENT_SECRET,
			approved:
				String(
					process.env.PAYPAL_PPP2_APPROVED ||
						process.env.PPP2_APPROVED ||
						"false",
				).toLowerCase() === "true",
			enableSend:
				String(
					process.env.PAYPAL_PPP2_ENABLE_SEND ||
						process.env.PPP2_ENABLE_SEND ||
						"false",
				).toLowerCase() === "true",
			disabled: (() => {
				const raw =
					String(process.env.PAYPAL_DISABLED || "false").toLowerCase() ===
					"true";
				const approved =
					String(
						process.env.PAYPAL_PPP2_APPROVED ||
							process.env.PPP2_APPROVED ||
							"false",
					).toLowerCase() === "true";
				const sendEnabled =
					String(
						process.env.PAYPAL_PPP2_ENABLE_SEND ||
							process.env.PPP2_ENABLE_SEND ||
							"false",
					).toLowerCase() === "true";
				return raw || !(approved && sendEnabled);
			})(),
		},
		bank: {
			enabled:
				String(process.env.BANK_WIRE_ENABLE || "false").toLowerCase() ===
				"true",
			provider: String(process.env.BANK_WIRE_PROVIDER || "").toUpperCase(),
			beneficiaryName: process.env.OWNER_BENEFICIARY_NAME,
			iban: process.env.OWNER_IBAN,
			swift: process.env.OWNER_SWIFT,
			allowlist: process.env.OWNER_BENEFICIARY_ALLOWLIST_JSON || "[]",
		},
		payoneer: {
			enabled:
				String(process.env.PAYONEER_ENABLE || "false").toLowerCase() === "true",
			base: process.env.PAYONEER_API_BASE,
			clientId: process.env.PAYONEER_CLIENT_ID,
			clientSecret: process.env.PAYONEER_CLIENT_SECRET,
		},
		payoneer_standard: {
			enabled:
				String(
					process.env.PAYONEER_ENABLE_STANDARD || "false",
				).toLowerCase() === "true",
			email: process.env.OWNER_PAYONEER_EMAIL || process.env.PAYONEER_EMAIL,
		},
		crypto: {
			enabled:
				String(process.env.CRYPTO_WITHDRAW_ENABLE || "false").toLowerCase() ===
				"true",
			address:
				process.env.TRUST_WALLET_ADDRESS || process.env.TRUST_WALLET_USDT_ERC20,
		},
		cryptobox: {
			enabled:
				String(process.env.CRYPTOBOX_ENABLE || "false").toLowerCase() ===
				"true",
			url:
				process.env.BINANCE_CRYPTOBOX_URL ||
				"https://www.binance.com/en/my/wallet/account/payment/cryptobox",
		},
		wise: {
			enabled:
				String(process.env.WISE_ENABLE || "false").toLowerCase() === "true",
			email: process.env.OWNER_WISE_EMAIL,
		},
		googlepay: {
			enabled:
				String(process.env.GOOGLEPAY_ENABLE || "false").toLowerCase() ===
				"true",
			email: process.env.OWNER_GOOGLEPAY_EMAIL,
		},
		smart_contract_owner: {
			enabled:
				String(process.env.OWNER_VAULT_ENABLE || "false").toLowerCase() ===
				"true",
			contractAddress: process.env.OWNER_VAULT_CONTRACT_ADDRESS,
			chain: String(process.env.OWNER_VAULT_CHAIN || "").toUpperCase(),
		},
	};
	return { settlement_priority, creds, SAFE_MODE };
}

export function explainMissingCredentials(route, cfg) {
	const reasons = [];
	const live =
		String(process.env.SWARM_LIVE || "false").toLowerCase() === "true";
	if (!live) reasons.push("SWARM_LIVE=false");
	if (cfg?.SAFE_MODE === true) reasons.push("SAFE_MODE=true");
	if (reasons.length) return reasons;
	const r = String(route || "").toLowerCase();
	if (r === "paypal") {
		const c = cfg?.creds?.paypal || {};
		if (c.disabled) reasons.push("PAYPAL_DISABLED_OR_PPP2_NOT_READY");
		if (!getOwnerAccountForType("paypal"))
			reasons.push("OWNER_PAYPAL_EMAIL_MISSING");
		return reasons;
	}
	if (r === "mpc") {
		const c = cfg?.creds?.mpc || {};
		if (!c.enabled) reasons.push("MPC_ENABLE=false");
		if (!c.provider) reasons.push("MPC_PROVIDER_MISSING");
		return reasons;
	}
	if (r === "safe") {
		const c = cfg?.creds?.safe || {};
		if (!c.enabled) reasons.push("SAFE_ENABLE=false");
		if (!c.address) reasons.push("SAFE_ADDRESS_MISSING");
		return reasons;
	}
	if (r === "bank_transfer" || r === "bank") {
		const c = cfg?.creds?.bank || {};
		if (!c.enabled) reasons.push("BANK_WIRE_ENABLE=false");
		const prov = String(c.provider || "").toUpperCase();
		if (!["LIVE", "WISE"].includes(prov))
			reasons.push("BANK_WIRE_PROVIDER_UNSUPPORTED");
		const hasIban = !!String(process.env.OWNER_IBAN || "").trim();
		const hasUsd =
			!!String(process.env.OWNER_ROUTING_NUMBER || process.env.OWNER_ROUTING || "")
				.replace(/\D+/g, "")
				.trim() && !!String(process.env.OWNER_ACCOUNT_NUMBER || "").replace(/\D+/g, "").trim();
		const hasGbp =
			!!String(process.env.OWNER_SORT_CODE || "").replace(/\D+/g, "").trim() &&
			!!String(process.env.OWNER_ACCOUNT_NUMBER || "").replace(/\D+/g, "").trim();
		if (!hasIban && !hasUsd && !hasGbp) reasons.push("OWNER_BANK_DETAILS_MISSING");
		if (!c.beneficiaryName) reasons.push("OWNER_BENEFICIARY_NAME_MISSING");
		if (prov === "WISE") {
			if (String(process.env.WISE_ENABLE || "false").toLowerCase() !== "true")
				reasons.push("WISE_ENABLE=false");
			if (String(process.env.WISE_ENVIRONMENT || "").toLowerCase() !== "live")
				reasons.push("WISE_ENVIRONMENT_NOT_LIVE");
			if (!process.env.WISE_API_KEY) reasons.push("WISE_API_KEY_MISSING");
			if (!process.env.WISE_PROFILE_ID) reasons.push("WISE_PROFILE_ID_MISSING");
		} else {
			if (!c.iban) reasons.push("OWNER_IBAN_MISSING");
			if (!c.swift) reasons.push("OWNER_SWIFT_MISSING");
		}
		try {
			const allow = JSON.parse(c.allowlist || "[]");
			if (!Array.isArray(allow) || allow.length === 0)
				reasons.push("OWNER_BENEFICIARY_ALLOWLIST_EMPTY");
		} catch {
			reasons.push("OWNER_BENEFICIARY_ALLOWLIST_INVALID_JSON");
		}
		return reasons;
	}
	if (r === "payoneer") {
		const c = cfg?.creds?.payoneer || {};
		if (!c.enabled) reasons.push("PAYONEER_ENABLE=false");
		if (!getOwnerAccountForType("payoneer"))
			reasons.push("OWNER_PAYONEER_EMAIL_MISSING");
		if (isPlaceholder(c.base)) reasons.push("PAYONEER_API_BASE_MISSING");
		if (isPlaceholder(c.clientId)) reasons.push("PAYONEER_CLIENT_ID_MISSING");
		if (isPlaceholder(c.clientSecret))
			reasons.push("PAYONEER_CLIENT_SECRET_MISSING");
		return reasons;
	}
	if (r === "payoneer_standard") {
		const c = cfg?.creds?.payoneer_standard || {};
		if (!c.enabled) reasons.push("PAYONEER_ENABLE_STANDARD=false");
		const email = String(c.email || "").trim();
		if (!email || !email.includes("@")) reasons.push("PAYONEER_EMAIL_MISSING");
		return reasons;
	}
	if (r === "crypto") {
		const c = cfg?.creds?.crypto || {};
		if (!c.enabled) reasons.push("CRYPTO_WITHDRAW_ENABLE=false");
		if (!c.address) reasons.push("TRUST_WALLET_ADDRESS_MISSING");
		return reasons;
	}
	if (r === "cryptobox") {
		const c = cfg?.creds?.cryptobox || {};
		if (!c.enabled) reasons.push("CRYPTOBOX_ENABLE=false");
		return reasons;
	}
	if (r === "wise") {
		const c = cfg?.creds?.wise || {};
		if (!c.enabled) reasons.push("WISE_ENABLE=false");
		const email = String(c.email || "").trim();
		if (!email || !email.includes("@")) reasons.push("OWNER_WISE_EMAIL_MISSING");
		if (String(process.env.WISE_ENVIRONMENT || "").toLowerCase() !== "live")
			reasons.push("WISE_ENVIRONMENT_NOT_LIVE");
		if (!process.env.WISE_API_KEY) reasons.push("WISE_API_KEY_MISSING");
		if (!process.env.WISE_PROFILE_ID) reasons.push("WISE_PROFILE_ID_MISSING");
		return reasons;
	}
	if (r === "googlepay") {
		const c = cfg?.creds?.googlepay || {};
		if (!c.enabled) reasons.push("GOOGLEPAY_ENABLE=false");
		const email = String(c.email || "").trim();
		if (!email || !email.includes("@")) reasons.push("GOOGLEPAY_EMAIL_MISSING");
		return reasons;
	}
	if (r === "smart_contract_owner") {
		const c = cfg?.creds?.smart_contract_owner || {};
		if (!c.enabled) reasons.push("OWNER_VAULT_ENABLE=false");
		if (!c.contractAddress) reasons.push("OWNER_VAULT_CONTRACT_ADDRESS_MISSING");
		return reasons;
	}
	return ["UNKNOWN_ROUTE"];
}

export function missingCredentials(route, cfg) {
	return explainMissingCredentials(route, cfg).length > 0;
}

export function getOwnerAccountForType(type) {
	const t = String(type || "").toLowerCase();
	if (t === "paypal")
		return (
			normEmail(process.env.OWNER_PAYPAL_EMAIL) ||
			normEmail(process.env.PAYPAL_EMAIL)
		);
	if (t === "payoneer" || t === "payoneer_standard")
		return (
			normEmail(process.env.OWNER_PAYONEER_EMAIL) ||
			normEmail(process.env.PAYONEER_EMAIL)
		);
	if (t === "bank_transfer") {
		return (
			process.env.OWNER_IBAN ||
			process.env.OWNER_BANK_RIB ||
			process.env.MOROCCAN_BANK_RIB ||
			process.env.BANK_IBAN ||
			null
		);
	}
	if (t === "crypto") {
		return (
			process.env.OWNER_CRYPTO_ADDRESS ||
			process.env.OWNER_TRUST_WALLET ||
			process.env.TRUST_WALLET_ADDRESS ||
			process.env.TRUST_WALLET_USDT_ERC20 ||
			null
		);
	}
	if (t === "cryptobox") {
		return process.env.BINANCE_CRYPTOBOX_URL || null;
	}
	if (t === "mpc") {
		return process.env.MPC_ORG_NAME || process.env.MPC_PROVIDER || null;
	}
	if (t === "safe") {
		return process.env.SAFE_ADDRESS || null;
	}
	if (t === "wise") {
		return (
			normEmail(process.env.OWNER_WISE_EMAIL) ||
			normEmail(process.env.OWNER_WISE_RECIPIENT_ID)
		);
	}
	if (t === "googlepay") {
		return (
			normEmail(process.env.OWNER_GOOGLEPAY_EMAIL) ||
			process.env.OWNER_GOOGLEPAY_ID ||
			null
		);
	}
	if (t === "plaid") {
		return (
			process.env.PLAID_OWNER_ACCOUNT_ID ||
			process.env.OWNER_BANK_ACCOUNT_NUM ||
			null
		);
	}
	if (t === "cheque") {
		return process.env.OWNER_BENEFICIARY_NAME || null;
	}
	if (t === "smart_contract_owner") {
		return process.env.OWNER_VAULT_CONTRACT_ADDRESS || null;
	}
	return null;
}

export const OwnerSettlementEnforcer = {
	getPaymentConfiguration,
	missingCredentials,
	explainMissingCredentials,
	getOwnerAccountForType,
};
