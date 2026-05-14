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

export function missingCredentials(route, cfg) {
	const live =
		String(process.env.SWARM_LIVE || "false").toLowerCase() === "true";
	if (!live) return true;
	if (cfg?.SAFE_MODE === true) {
		return true;
	}
	const r = String(route || "").toLowerCase();
	if (r === "paypal") {
		const c = cfg?.creds?.paypal || {};
		if (c.disabled) return true;
		if (!getOwnerAccountForType("paypal")) return true;
		return false;
	}
	if (r === "mpc") {
		const c = cfg?.creds?.mpc || {};
		if (!c.enabled) return true;
		if (!c.provider) return true;
		return false;
	}
	if (r === "safe") {
		const c = cfg?.creds?.safe || {};
		if (!c.enabled) return true;
		if (!c.address) return true;
		return false;
	}
	if (r === "bank_transfer" || r === "bank") {
		const c = cfg?.creds?.bank || {};
		if (!c.enabled) return true;
		if (c.provider !== "LIVE") return true;
		if (!c.beneficiaryName || !c.iban || !c.swift) return true;
		try {
			const allow = JSON.parse(c.allowlist || "[]");
			if (!Array.isArray(allow) || allow.length === 0) return true;
		} catch {
			return true;
		}
		return false;
	}
	if (r === "payoneer") {
		const c = cfg?.creds?.payoneer || {};
		if (!c.enabled) return true;
		if (!getOwnerAccountForType("payoneer")) return true;
		if (
			isPlaceholder(c.base) ||
			isPlaceholder(c.clientId) ||
			isPlaceholder(c.clientSecret)
		)
			return true;
		return false;
	}
	if (r === "payoneer_standard") {
		const c = cfg?.creds?.payoneer_standard || {};
		if (!c.enabled) return true;
		const email = String(c.email || "").trim();
		if (!email || !email.includes("@")) return true;
		return false;
	}
	if (r === "crypto") {
		const c = cfg?.creds?.crypto || {};
		if (!c.enabled) return true;
		if (!c.address) return true;
		return false;
	}
	if (r === "cryptobox") {
		const c = cfg?.creds?.cryptobox || {};
		if (!c.enabled) return true;
		return false;
	}
	if (r === "wise") {
		const c = cfg?.creds?.wise || {};
		if (!c.enabled) return true;
		const email = String(c.email || "").trim();
		if (!email || !email.includes("@")) return true;
		if (String(process.env.WISE_ENVIRONMENT || "").toLowerCase() !== "live")
			return true;
		if (!process.env.WISE_API_KEY || !process.env.WISE_PROFILE_ID) return true;
		return false;
	}
	if (r === "googlepay") {
		const c = cfg?.creds?.googlepay || {};
		if (!c.enabled) return true;
		const email = String(c.email || "").trim();
		if (!email || !email.includes("@")) return true;
		return false;
	}
	if (r === "smart_contract_owner") {
		const c = cfg?.creds?.smart_contract_owner || {};
		if (!c.enabled) return true;
		if (!c.contractAddress) return true;
		return false;
	}
	return true;
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
	if (t === "bank_transfer" || t === "bank") {
		return (
			process.env.OWNER_IBAN ||
			process.env.MOROCCAN_BANK_RIB ||
			process.env.BANK_IBAN ||
			null
		);
	}
	if (t === "crypto") {
		return (
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
		return normEmail(process.env.OWNER_WISE_EMAIL);
	}
	if (t === "googlepay") {
		return normEmail(process.env.OWNER_GOOGLEPAY_EMAIL);
	}
	if (t === "smart_contract_owner") {
		return process.env.OWNER_VAULT_CONTRACT_ADDRESS || null;
	}
	return null;
}

export const OwnerSettlementEnforcer = {
	getPaymentConfiguration,
	missingCredentials,
	getOwnerAccountForType,
};
