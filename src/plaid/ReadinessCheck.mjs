import fs from "node:fs/promises";

export class PlaidReadinessCheck {
	constructor({ env = process.env } = {}) {
		this.env = env;
	}

	async run() {
		const missing = [];
		if (!this.env.PLAID_CLIENT_ID) missing.push("PLAID_CLIENT_ID");
		if (!this.env.PLAID_SECRET) missing.push("PLAID_SECRET");
		const envName = String(this.env.PLAID_ENV || "").trim();
		const mode = envName || "unset";
		if (mode === "production") {
			const hmac = String(
				this.env.PLAID_WEBHOOK_HMAC_SECRET ||
					this.env.PLAID_WEBHOOK_SIGNATURE_SECRET ||
					"",
			).trim();
			if (!hmac) missing.push("PLAID_WEBHOOK_HMAC_SECRET");
		}
		const status = {
			ok: missing.length === 0,
			mode,
			missing,
			recommendation:
				missing.length === 0
					? mode === "production"
						? "ready"
						: "set PLAID_ENV=production for live Signal scoring"
					: "set required Plaid credentials in environment or secrets manager",
		};
		const out = {
			at: new Date().toISOString(),
			status,
		};
		await fs.mkdir("logs", { recursive: true });
		await fs.writeFile(
			"logs/plaid-readiness.json",
			JSON.stringify(out, null, 2),
		);
		return out;
	}
}
