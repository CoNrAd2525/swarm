import { randomUUID } from "node:crypto";
import { PrivacyMasker } from "../../util/privacy-masker.mjs";

export class WiseGateway {
	constructor({ audit }) {
		this.audit = audit;
		this.apiKey = process.env.WISE_API_KEY;
		this.profileId = process.env.WISE_PROFILE_ID;
		this.environment = process.env.WISE_ENVIRONMENT || "live";
		this.baseUrl =
			this.environment === "live"
				? "https://api.wise.com"
				: "https://api.sandbox.transferwise.tech";
	}

	async makeAuthenticatedRequest(endpoint, options = {}) {
		if (!this.apiKey) {
			throw new Error("Wise API key not configured");
		}

		const response = await fetch(`${this.baseUrl}${endpoint}`, {
			...options,
			headers: {
				...options.headers,
				Authorization: `Bearer ${this.apiKey}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			const errorData = await response.text();
			throw new Error(`Wise API error: ${response.status} - ${errorData}`);
		}

		return response;
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

	_getOwnerBankSpec(currency) {
		const ccy = String(currency || "").toUpperCase().trim();
		const name = String(process.env.OWNER_BENEFICIARY_NAME || "").trim();
		if (!name) throw new Error("WiseGateway: Missing OWNER_BENEFICIARY_NAME");

		if (ccy === "EUR") {
			const iban = this._normIban(process.env.OWNER_IBAN);
			if (!iban) throw new Error("WiseGateway: Missing OWNER_IBAN for EUR");
			return { currency: "EUR", name, type: "iban", details: { iban } };
		}
		if (ccy === "GBP") {
			const sortCode = this._normDigits(process.env.OWNER_SORT_CODE);
			const accountNumber = this._normDigits(process.env.OWNER_ACCOUNT_NUMBER);
			if (!sortCode || !accountNumber)
				throw new Error(
					"WiseGateway: Missing OWNER_SORT_CODE/OWNER_ACCOUNT_NUMBER for GBP",
				);
			return {
				currency: "GBP",
				name,
				type: "sort_code",
				details: { sortCode, accountNumber },
			};
		}
		if (ccy === "USD") {
			const abartn = this._normDigits(
				process.env.OWNER_ROUTING_NUMBER || process.env.OWNER_ROUTING,
			);
			const accountNumber = this._normDigits(process.env.OWNER_ACCOUNT_NUMBER);
			if (!abartn || !accountNumber)
				throw new Error(
					"WiseGateway: Missing OWNER_ROUTING_NUMBER/OWNER_ACCOUNT_NUMBER for USD",
				);
			const accountType = String(
				process.env.OWNER_ACCOUNT_TYPE || "CHECKING",
			).toUpperCase();
			const legalType = String(process.env.OWNER_LEGAL_TYPE || "PRIVATE").toUpperCase();
			return {
				currency: "USD",
				name,
				type: "aba",
				details: { legalType, abartn, accountNumber, accountType },
			};
		}
		throw new Error(`WiseGateway: Unsupported currency for bank payout (${ccy})`);
	}

	async _findExistingOwnerBankRecipient(spec) {
		const list = await this.makeAuthenticatedRequest(
			`/v1/accounts?profile=${this.profileId}`,
		);
		const recipients = await list.json();
		const rows = Array.isArray(recipients) ? recipients : [];
		const type = String(spec.type || "").toLowerCase();
		const ccy = String(spec.currency || "").toUpperCase();
		const wantName = String(spec.name || "").toLowerCase();

		for (const r of rows) {
			if (!r || typeof r !== "object") continue;
			if (String(r.currency || "").toUpperCase() !== ccy) continue;
			if (String(r.type || "").toLowerCase() !== type) continue;
			const holder = String(r.accountHolderName || "").toLowerCase();
			if (wantName && holder && holder !== wantName) continue;
			const d = r.details || {};
			if (type === "iban") {
				if (this._normIban(d.iban) === this._normIban(spec.details.iban)) return r;
			} else if (type === "sort_code") {
				if (
					this._normDigits(d.sortCode) === this._normDigits(spec.details.sortCode) &&
					this._normDigits(d.accountNumber) ===
						this._normDigits(spec.details.accountNumber)
				)
					return r;
			} else if (type === "aba") {
				if (
					this._normDigits(d.abartn) === this._normDigits(spec.details.abartn) &&
					this._normDigits(d.accountNumber) ===
						this._normDigits(spec.details.accountNumber)
				)
					return r;
			}
		}
		return null;
	}

	async _getOrCreateOwnerBankRecipientId(currency) {
		const ccy = String(currency || "").toUpperCase().trim();
		const envKey = `OWNER_WISE_BANK_RECIPIENT_ID_${ccy}`;
		const cached =
			String(process.env[envKey] || "").trim() ||
			String(process.env.OWNER_WISE_BANK_RECIPIENT_ID || "").trim();
		if (cached) return cached;

		await this._ensureProfileAndRecipient();
		const spec = this._getOwnerBankSpec(ccy);
		const existing = await this._findExistingOwnerBankRecipient(spec);
		if (existing?.id) {
			process.env[envKey] = String(existing.id);
			return String(existing.id);
		}

		const createdRes = await this.makeAuthenticatedRequest("/v1/accounts", {
			method: "POST",
			body: JSON.stringify({
				profile: this.profileId,
				accountHolderName: spec.name,
				currency: spec.currency,
				type: spec.type,
				details: spec.details,
			}),
		});
		const created = await createdRes.json();
		if (!created?.id) throw new Error("WiseGateway: Failed to create recipient");
		process.env[envKey] = String(created.id);
		return String(created.id);
	}

	async _ensureProfileAndRecipient() {
		if (this.profileId && process.env.OWNER_WISE_RECIPIENT_ID) return;

		console.log(
			"[WiseGateway] Missing Profile ID or Recipient ID. Starting autonomous discovery...",
		);

		// 1. Discover Profile
		const profilesResponse =
			await this.makeAuthenticatedRequest("/v1/profiles");
		const profiles = await profilesResponse.json();
		const profile = profiles.find((p) => p.type === "personal") || profiles[0];
		if (!profile) throw new Error("WiseGateway: No profiles found on account");
		this.profileId = profile.id;
		console.log(`[WiseGateway] Discovered Profile ID: ${this.profileId}`);

		// 2. Discover Recipient (matching owner email or first available)
		const ownerEmail = process.env.OWNER_WISE_EMAIL;
		const recipientsResponse = await this.makeAuthenticatedRequest(
			`/v1/accounts?profile=${this.profileId}`,
		);
		const recipients = await recipientsResponse.json();

		let recipient = recipients.find(
			(r) => r.type === "balance" && r.currency === "USD",
		);
		if (!recipient && ownerEmail) {
			recipient = recipients.find(
				(r) =>
					r.accountHolderName?.toLowerCase().includes("younes") ||
					r.details?.email === ownerEmail,
			);
		}

		if (!recipient && recipients.length > 0) recipient = recipients[0];
		if (!recipient)
			throw new Error("WiseGateway: No suitable recipients found on account");

		process.env.OWNER_WISE_RECIPIENT_ID = recipient.id;
		console.log(
			`[WiseGateway] Discovered Recipient ID: ${recipient.id} (${recipient.accountHolderName})`,
		);
	}

	async executeTransfer(transferDetails) {
		const live =
			String(process.env.SWARM_LIVE || "false").toLowerCase() === "true";
		const enabled =
			String(process.env.WISE_ENABLE || "false").toLowerCase() === "true";

		if (!live) throw new Error("WiseGateway: SWARM_LIVE=true required");
		if (!enabled) throw new Error("WiseGateway: WISE_ENABLE=true required");
		if (!this.apiKey) throw new Error("WiseGateway: Missing WISE_API_KEY");

		await this._ensureProfileAndRecipient();

		const { payoutBatchId, description } = transferDetails || {};
		let { amount, currency } = transferDetails || {};
		if (
			amount == null &&
			Array.isArray(transferDetails?.transactions) &&
			transferDetails.transactions.length > 0
		) {
			const list = transferDetails.transactions;
			currency = (list[0].currency || "USD").toUpperCase();
			let total = 0;
			for (const t of list) {
				const c = (t.currency || "USD").toUpperCase();
				if (c !== currency)
					throw new Error(
						`WiseGateway: Mixed currencies not supported (${c} vs ${currency})`,
					);
				const amt = Number(t.amount);
				if (!Number.isFinite(amt) || amt <= 0) continue;
				total += amt;
			}
			if (!(total > 0)) throw new Error("WiseGateway: Sum of amounts is zero");
			amount = Number(total.toFixed(2));
		}
		const recipient = process.env.OWNER_WISE_RECIPIENT_ID;

		// 1. Create a Quote
		const quoteResponse = await this.makeAuthenticatedRequest(
			`/v3/profiles/${this.profileId}/quotes`,
			{
				method: "POST",
				body: JSON.stringify({
					sourceCurrency: currency || "USD",
					targetCurrency: currency || "USD",
					sourceAmount: amount,
					targetAmount: null,
					payOut: "BALANCE",
				}),
			},
		);
		const quote = await quoteResponse.json();

		// 2. Create the Transfer
		const sanitizedReference = (description || `Payout ${payoutBatchId}`)
			.replace(/[^a-zA-Z0-9- ]/g, " ")
			.substring(0, 40);

		const transferData = {
			targetAccount: recipient, // This should be the Wise recipient ID
			quoteUuid: quote.id,
			customerTransactionId: randomUUID(),
			details: {
				reference: sanitizedReference,
				transferPurpose: "Personal payment",
				sourceOfFunds: "Other",
			},
		};

		const transferResponse = await this.makeAuthenticatedRequest(
			"/v1/transfers",
			{
				method: "POST",
				body: JSON.stringify(transferData),
			},
		);
		const transfer = await transferResponse.json();

		// 3. Fund the Transfer from balance
		const fundResponse = await this.makeAuthenticatedRequest(
			`/v3/profiles/${this.profileId}/transfers/${transfer.id}/payments`,
			{
				method: "POST",
				body: JSON.stringify({ type: "BALANCE" }),
			},
		);
		const fundResult = await fundResponse.json();

		this.audit.log(
			"WISE_TRANSFER_EXECUTED",
			payoutBatchId || null,
			transfer.id,
			{ status: transfer.status, amount, currency },
			"System",
			{ reassurance: PrivacyMasker.reassurance("wise") },
		);

		return {
			ok: true,
			transactionId: transfer.id,
			status: transfer.status,
			fundResult,
		};
	}

	async executeOwnerBankTransfer({
		amount,
		currency = "USD",
		reference,
		payoutBatchId,
	} = {}) {
		const live =
			String(process.env.SWARM_LIVE || "false").toLowerCase() === "true";
		const enabled =
			String(process.env.WISE_ENABLE || "false").toLowerCase() === "true";
		if (!live) throw new Error("WiseGateway: SWARM_LIVE=true required");
		if (!enabled) throw new Error("WiseGateway: WISE_ENABLE=true required");
		if (!this.apiKey) throw new Error("WiseGateway: Missing WISE_API_KEY");
		if (String(this.environment || "").toLowerCase() !== "live")
			throw new Error("WiseGateway: WISE_ENVIRONMENT=live required");

		const ccy = String(currency || "USD").toUpperCase();
		const n = Number(amount);
		if (!Number.isFinite(n) || n <= 0)
			throw new Error("WiseGateway: Invalid amount");

		const recipientId = await this._getOrCreateOwnerBankRecipientId(ccy);
		const quoteResponse = await this.makeAuthenticatedRequest(
			`/v3/profiles/${this.profileId}/quotes`,
			{
				method: "POST",
				body: JSON.stringify({
					sourceCurrency: ccy,
					targetCurrency: ccy,
					sourceAmount: n,
					targetAmount: null,
					payOut: "BANK_TRANSFER",
				}),
			},
		);
		const quote = await quoteResponse.json();

		const rawRef = reference || (payoutBatchId ? `Payout ${payoutBatchId}` : "Owner payout");
		const sanitizedReference = String(rawRef)
			.replace(/[^a-zA-Z0-9- ]/g, " ")
			.substring(0, 40);
		const transferResponse = await this.makeAuthenticatedRequest("/v1/transfers", {
			method: "POST",
			body: JSON.stringify({
				targetAccount: recipientId,
				quoteUuid: quote.id,
				customerTransactionId: randomUUID(),
				details: {
					reference: sanitizedReference,
					transferPurpose: "Personal payment",
					sourceOfFunds: "Other",
				},
			}),
		});
		const transfer = await transferResponse.json();
		const fundResponse = await this.makeAuthenticatedRequest(
			`/v3/profiles/${this.profileId}/transfers/${transfer.id}/payments`,
			{ method: "POST", body: JSON.stringify({ type: "BALANCE" }) },
		);
		const fundResult = await fundResponse.json();

		this.audit?.log?.(
			"WISE_BANK_PAYOUT_EXECUTED",
			payoutBatchId || null,
			transfer.id,
			{ status: transfer.status, amount: n, currency: ccy },
			"System",
			{ reassurance: PrivacyMasker.reassurance("wise") },
		);

		return { ok: true, transactionId: transfer.id, status: transfer.status, fundResult };
	}

	async getTransferStatus(transferId) {
		if (!this.apiKey) {
			throw new Error("Wise API key not configured");
		}

		const response = await this.makeAuthenticatedRequest(
			`/v1/transfers/${transferId}`,
			{
				method: "GET",
			},
		);

		const transfer = await response.json();
		return {
			id: transfer.id,
			status: transfer.status,
			sourceCurrency: transfer.sourceCurrency,
			targetCurrency: transfer.targetCurrency,
			sourceAmount: transfer.sourceAmount,
			targetAmount: transfer.targetAmount,
			created: transfer.created,
			updated: transfer.updated,
			details: transfer.details,
		};
	}
}
