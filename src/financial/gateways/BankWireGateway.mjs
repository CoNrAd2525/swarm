import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { WiseGateway } from "../../finance/gateways/WiseGateway.mjs";
import { OwnerSettlementEnforcer } from "../../policy/owner-settlement.mjs";

/**
 * BankWireGateway (LIVE ONLY)
 *
 * Simulation paths are removed. This gateway will NOT submit any payment unless
 * explicitly configured for LIVE provider and required env flags are set.
 * Use RouteManager failover or disable the route until a real provider is integrated.
 */
export class BankWireGateway {
	constructor({ provider = process.env.BANK_WIRE_PROVIDER, audit } = {}) {
		this.provider = String(provider || "").toUpperCase();
		this.audit = audit;
		this.wise = new WiseGateway({ audit: this.audit });
	}

	_normIban(v) {
		return String(v || "")
			.replace(/\s+/g, "")
			.toUpperCase()
			.trim();
	}

	_normDigits(v) {
		return String(v || "").replace(/\D+/g, "").trim();
	}

        _normBank(v) {
                return String(v || "").replace(/\s+/g, "").trim();
        }

        resolveOwnerForCurrency(currency, transactions = []) {
                const ccy = String(currency || process.env.OWNER_BANK_CURRENCY || "USD")
                        .toUpperCase()
                        .trim();
                const first = Array.isArray(transactions) ? transactions[0] || {} : {};
                const explicitDest = this._normBank(
                        first?.destination ?? first?.recipient_address ?? first?.recipient ?? "",
                );
                const knownBanks = new Set(
                        OwnerSettlementEnforcer.listOwnerDestinationsForRoute("bank_transfer").map((x) =>
                                this._normBank(x),
                        ),
                );
                const chosenRib = explicitDest && knownBanks.has(explicitDest)
                        ? explicitDest
                        : this._normBank(
                                        process.env.OWNER_BANK_RIB ||
                                                process.env.MOROCCAN_BANK_RIB ||
                                                "",
                                ) || undefined;
                return {
                        name: process.env.OWNER_BENEFICIARY_NAME,
                        currency: ccy,
                        iban: process.env.OWNER_IBAN,
                        rib: chosenRib,
                        swift: process.env.OWNER_SWIFT,
                        routing: process.env.OWNER_ROUTING_NUMBER || process.env.OWNER_ROUTING,
                        sortCode: process.env.OWNER_SORT_CODE,
                        accountNumber: process.env.OWNER_ACCOUNT_NUMBER,
                        bankName: process.env.OWNER_BANK_NAME,
                        bankCountry: process.env.OWNER_BANK_COUNTRY || undefined,
                };
        }

	computeBeneficiaryFingerprint({
		name,
		currency,
		iban,
		rib,
		swift,
		routing,
		sortCode,
		accountNumber,
	}) {
		const norm = [
			String(name || "").trim(),
			String(currency || "").toUpperCase().trim(),
			this._normIban(iban),
			String(rib || "").trim(),
			String(swift || "").trim().toUpperCase(),
			this._normDigits(routing),
			this._normDigits(sortCode),
			this._normDigits(accountNumber),
		].join("|");
		return crypto.createHash("sha256").update(norm).digest("hex");
	}

        ensureReady({ currency, transactions } = {}) {
		const live =
			String(process.env.SWARM_LIVE || "false").toLowerCase() === "true";
		const enabled =
			String(process.env.BANK_WIRE_ENABLE || "false").toLowerCase() === "true";
		if (!live) throw new Error("BankWireGateway: SWARM_LIVE=true required");
		if (!enabled)
			throw new Error("BankWireGateway: BANK_WIRE_ENABLE=true required");

		const provider = String(this.provider || "").toUpperCase();
		if (!["LIVE", "WISE"].includes(provider)) {
			throw new Error(
				`BankWireGateway: Unsupported BANK_WIRE_PROVIDER=${provider} (use WISE for automated execution or LIVE for manual instructions)`,
			);
		}

                const owner = this.resolveOwnerForCurrency(currency, transactions);
		if (!owner.name) {
			throw new Error("BankWireGateway: Missing OWNER_BENEFICIARY_NAME");
		}
		const hasEur = !!this._normIban(owner.iban);
		const hasRib = !!String(owner.rib || "").trim();
		const hasUsd = !!this._normDigits(owner.routing) && !!this._normDigits(owner.accountNumber);
		const hasGbp = !!this._normDigits(owner.sortCode) && !!this._normDigits(owner.accountNumber);
		if (
			!hasEur &&
			!hasUsd &&
			!hasGbp &&
			!(provider === "LIVE" && hasRib)
		) {
			throw new Error(
				"BankWireGateway: Missing bank destination (need OWNER_IBAN or OWNER_ROUTING_NUMBER+OWNER_ACCOUNT_NUMBER or OWNER_SORT_CODE+OWNER_ACCOUNT_NUMBER)",
			);
		}

		const fp = this.computeBeneficiaryFingerprint(owner);
		const legacyFp =
			hasEur && owner.swift
				? crypto
						.createHash("sha256")
						.update(
							`${String(owner.name || "").trim()}|${this._normIban(owner.iban)}|${String(owner.swift || "")
								.trim()
								.toUpperCase()}`,
						)
						.digest("hex")
				: null;
		const ribFp = hasRib
			? crypto
					.createHash("sha256")
					.update(
						`${String(owner.name || "").trim()}|${String(owner.currency || "")
							.toUpperCase()
							.trim()}|${String(owner.rib || "").trim()}`,
					)
					.digest("hex")
			: null;
		const allowJson = process.env.OWNER_BENEFICIARY_ALLOWLIST_JSON || "[]";
		let allow = [];
		try {
			allow = JSON.parse(allowJson);
		} catch {
			allow = [];
		}
		const allowSet = new Set(
			Array.isArray(allow) ? allow.map((x) => String(x)) : [],
		);
		const allowed =
			allowSet.has(fp) ||
			(legacyFp ? allowSet.has(legacyFp) : false) ||
			(ribFp ? allowSet.has(ribFp) : false);
		if (!allowed)
			throw new Error(
				"BankWireGateway: Owner beneficiary not allowlisted (OWNER_BENEFICIARY_ALLOWLIST_JSON)",
			);

		if (provider === "WISE") {
			if (String(process.env.WISE_ENABLE || "false").toLowerCase() !== "true")
				throw new Error("BankWireGateway: WISE_ENABLE=true required");
			if (String(process.env.WISE_ENVIRONMENT || "").toLowerCase() !== "live")
				throw new Error("BankWireGateway: WISE_ENVIRONMENT=live required");
			if (!process.env.WISE_API_KEY || !process.env.WISE_PROFILE_ID)
				throw new Error("BankWireGateway: Missing WISE_API_KEY/WISE_PROFILE_ID");
			if (hasRib && !hasEur && !hasUsd && !hasGbp) {
				throw new Error("BankWireGateway: WISE provider requires IBAN or routing details (RIB alone not supported)");
			}
		}

		return { owner };
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
		const { amount, currency, reference } =
			this.normalizeTransactions(transactions);
                const { owner } = this.ensureReady({ currency, transactions });

		if (String(this.provider || "").toUpperCase() === "WISE") {
			const res = await this.wise.executeOwnerBankTransfer({
				amount,
				currency,
				reference,
			});
			return {
				ok: true,
				route: "bank_wire",
				mode: "automated",
				reference,
				amount,
				currency,
				beneficiary: {
					name: owner.name,
					currency: owner.currency,
					bankCountry: owner.bankCountry,
				},
				transactionId: res.transactionId,
				status: res.status,
				created_at: new Date().toISOString(),
			};
		}

		const instructions = {
			ok: true,
			route: "bank_wire",
			mode: "manual",
			reference,
			amount,
			currency,
			beneficiary: owner,
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
				instructions,
				"System",
			);
		}

		return { ...instructions, filePath };
	}
}
