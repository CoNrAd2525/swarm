import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export class BankWireGateway {
	constructor({ provider = process.env.BANK_WIRE_PROVIDER, audit } = {}) {
		this.provider = String(provider || "").toUpperCase();
		this.audit = audit;
	}

	computeBeneficiaryFingerprint({ name, iban, swift }) {
		const norm = `${String(name || "").trim()}|${String(iban || "")
			.replace(/\s+/g, "")
			.toUpperCase()}|${String(swift || "")
			.trim()
			.toUpperCase()}`;
		return crypto.createHash("sha256").update(norm).digest("hex");
	}

	computeBeneficiaryFingerprintV2(beneficiary) {
		const b = beneficiary || {};
		const currency = String(b.currency || "").trim().toUpperCase();
		const name = String(b.name || "").trim();
		const iban = String(b.iban || "")
			.replace(/\s+/g, "")
			.toUpperCase();
		const swift = String(b.swift || b.bic || "").trim().toUpperCase();
		const accountNumber = String(b.accountNumber || "").trim();
		const routingNumber = String(b.routingNumber || "").trim();
		const sortCode = String(b.sortCode || "").trim();
		const bankCode = String(b.bankCode || "").trim();
		const branchCode = String(b.branchCode || "").trim();

		const norm = [
			currency,
			name,
			iban,
			swift,
			accountNumber,
			routingNumber,
			sortCode,
			bankCode,
			branchCode,
		]
			.map((x) => String(x || "").trim())
			.join("|");
		return crypto.createHash("sha256").update(norm).digest("hex");
	}

	parseOwnerBeneficiaries() {
		const raw = process.env.OWNER_BENEFICIARIES_JSON;
		if (raw) {
			let parsed = null;
			try {
				parsed = JSON.parse(raw);
			} catch {
				parsed = null;
			}
			if (!Array.isArray(parsed))
				throw new Error("BankWireGateway: OWNER_BENEFICIARIES_JSON must be an array");
			return parsed.map((b) => ({
				currency: String(b?.currency || "").toUpperCase(),
				name: b?.name,
				iban: b?.iban,
				swift: b?.swift,
				bic: b?.bic,
				accountNumber: b?.accountNumber,
				routingNumber: b?.routingNumber,
				sortCode: b?.sortCode,
				bankCode: b?.bankCode,
				branchCode: b?.branchCode,
				accountType: b?.accountType,
				bankName: b?.bankName,
				bankCountry: b?.bankCountry,
				bankAddress: b?.bankAddress,
			}));
		}

		return [
			{
				currency: String(process.env.OWNER_BANK_CURRENCY || "USD").toUpperCase(),
				name: process.env.OWNER_BENEFICIARY_NAME,
				iban: process.env.OWNER_IBAN,
				swift: process.env.OWNER_SWIFT,
				accountNumber: process.env.OWNER_ACCOUNT_NUMBER,
				routingNumber: process.env.OWNER_ROUTING_NUMBER,
				sortCode: process.env.OWNER_SORT_CODE,
				bankCode: process.env.OWNER_BANK_CODE,
				branchCode: process.env.OWNER_BRANCH_CODE,
				accountType: process.env.OWNER_ACCOUNT_TYPE,
				bankName: process.env.OWNER_BANK_NAME,
				bankCountry: process.env.OWNER_BANK_COUNTRY || undefined,
				bankAddress: process.env.OWNER_BANK_ADDRESS || undefined,
			},
		];
	}

	ensureReady() {
		const live =
			String(process.env.SWARM_LIVE || "false").toLowerCase() === "true";
		const enabled =
			String(process.env.BANK_WIRE_ENABLE || "false").toLowerCase() === "true";
		if (!live) throw new Error("BankWireGateway: SWARM_LIVE=true required");
		if (!enabled)
			throw new Error("BankWireGateway: BANK_WIRE_ENABLE=true required");

		if (this.provider !== "LIVE") {
			throw new Error(
				"BankWireGateway: Simulation disabled. Set BANK_WIRE_PROVIDER=LIVE or disable route",
			);
		}

		const allowJson = process.env.OWNER_BENEFICIARY_ALLOWLIST_JSON || "[]";
		let allow = [];
		try {
			allow = JSON.parse(allowJson);
		} catch {
			allow = [];
		}
		const allowSet =
			Array.isArray(allow) ? new Set(allow.map((x) => String(x))) : new Set();

		const beneficiaries = this.parseOwnerBeneficiaries();
		if (beneficiaries.length === 0)
			throw new Error("BankWireGateway: No owner beneficiaries configured");

		const usable = beneficiaries.filter((b) => {
			if (!b?.name) return false;
			if (!b?.currency) return false;
			const hasIban = Boolean(b?.iban && b?.swift);
			const hasAccount = Boolean(
				b?.accountNumber &&
					(b?.routingNumber || b?.sortCode || b?.bankCode || b?.swift || b?.bic),
			);
			return hasIban || hasAccount;
		});
		if (usable.length === 0)
			throw new Error(
				"BankWireGateway: Owner beneficiaries missing required fields",
			);

		const anyAllowed = usable.some((b) =>
			allowSet.has(this.computeBeneficiaryFingerprintV2(b)),
		);
		if (!anyAllowed)
			throw new Error(
				"BankWireGateway: Owner beneficiary not allowlisted (OWNER_BENEFICIARY_ALLOWLIST_JSON)",
			);

		return { beneficiaries: usable, allowSet };
	}

	normalizeTransactions(transactions) {
		const list = Array.isArray(transactions) ? transactions : [];
		if (list.length === 0)
			throw new Error("BankWireGateway: No transactions provided");
		const currency = (list[0].currency || "USD").toUpperCase();
		let total = 0;
		for (const t of list) {
			const c = (t.currency || "USD").toUpperCase();
			if (c !== currency)
				throw new Error(
					`BankWireGateway: Mixed currencies not supported (${c} vs ${currency})`,
				);
			const amt = Number(t.amount);
			if (!Number.isFinite(amt) || amt <= 0) continue;
			total += amt;
		}
		if (!(total > 0))
			throw new Error("BankWireGateway: Sum of amounts is zero");
		const reference =
			list[0]?.reference ||
			`Owner wire ${new Date().toISOString().slice(0, 10)}`;
		return { amount: Number(total.toFixed(2)), currency, reference };
	}

	async executeTransfer(transactions) {
		const { beneficiaries, allowSet } = this.ensureReady();
		const { amount, currency, reference } = this.normalizeTransactions(transactions);

		const beneficiary =
			beneficiaries.find(
				(b) => String(b.currency || "").toUpperCase() === String(currency),
			) || null;
		if (!beneficiary)
			throw new Error(`BankWireGateway: No beneficiary configured for ${currency}`);

		const fp = this.computeBeneficiaryFingerprintV2(beneficiary);
		if (!allowSet.has(fp))
			throw new Error(
				"BankWireGateway: Selected beneficiary not allowlisted (OWNER_BENEFICIARY_ALLOWLIST_JSON)",
			);

		const instructions = {
			ok: true,
			route: "bank_wire",
			mode: "manual",
			reference,
			amount,
			currency,
			beneficiary: {
				currency: beneficiary.currency,
				name: beneficiary.name,
				iban: beneficiary.iban || null,
				swift: beneficiary.swift || beneficiary.bic || null,
				accountNumber: beneficiary.accountNumber || null,
				routingNumber: beneficiary.routingNumber || null,
				sortCode: beneficiary.sortCode || null,
				bankCode: beneficiary.bankCode || null,
				branchCode: beneficiary.branchCode || null,
				accountType: beneficiary.accountType || null,
				bankName: beneficiary.bankName || null,
				bankCountry: beneficiary.bankCountry || null,
				bankAddress: beneficiary.bankAddress || null,
			},
			created_at: new Date().toISOString(),
		};

		const shouldWrite =
			String(
				process.env.BANK_WIRE_WRITE_INSTRUCTIONS || "true",
			).toLowerCase() === "true";
		let filePath = null;
		if (shouldWrite) {
			const dir = path.resolve("exports", "bank_wire");
			await fs.mkdir(dir, { recursive: true });
			const safe = reference.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
			filePath = path.join(dir, `wire_instructions_${safe}.json`);
			await fs.writeFile(
				filePath,
				`${JSON.stringify(instructions, null, 2)}\n`,
				"utf8",
			);
		}

		if (this.audit?.log) {
			this.audit.log(
				"BANK_WIRE_INSTRUCTIONS_READY",
				null,
				null,
				{ ...instructions, filePath },
				"System",
			);
		}

		return { ...instructions, filePath };
	}
}
