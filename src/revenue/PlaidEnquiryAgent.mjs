import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * PLAID ENQUIRY AGENT (v1.0)
 *
 * Objective: Autonomously draft follow-up emails for "Not Scored" Plaid Signal/Risk transactions.
 * Features:
 *  - Issue Identification: Processes transaction IDs with missing risk scores.
 *  - Email Drafting: Creates professional enquiries for Plaid Support.
 *  - Log Tracking: Maintains a record of all drafted enquiries.
 */
export class PlaidEnquiryAgent {
	constructor(_options = {}) {
		this.enquiryLogPath = path.join(
			process.cwd(),
			"logs",
			"plaid-enquiry-log.json",
		);
	}

	async init() {
		await fs.mkdir(path.dirname(this.enquiryLogPath), { recursive: true });
		if (!(await this._exists(this.enquiryLogPath))) {
			await fs.writeFile(
				this.enquiryLogPath,
				JSON.stringify({ enquiries: [] }, null, 2),
			);
		}
	}

	async _exists(p) {
		try {
			await fs.access(p);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * DRAFT ENQUIRY: PLAID SIGNAL "NOT SCORED"
	 */
	async draftNotScoredEnquiry(transactionIds) {
		console.log(
			`[PlaidEnquiry] 📧 Drafting follow-up for ${transactionIds.length} "Not Scored" transactions...`,
		);

		const idsList = transactionIds.map((id) => `- ${id}`).join("\n");
		const draft = `
Subject: Urgent: Technical Enquiry - Plaid Signal Transactions "Not Scored"

Dear Plaid Support Team,

We are reaching out regarding several transactions processed through our Plaid Signal integration that have returned a "Not Scored" status. 

These transactions are critical for our real-time risk assessment and automated settlement flows. Below are the specific Transaction IDs for your review:

${idsList}

Could you please investigate why these specific transactions were not assigned a risk score? We need to ensure our scoring model is functioning as expected for the February 2026 window.

We look forward to your detailed technical assessment.

Regards,
Autonomous Finance Agent
RealWorldCerts Infrastructure
        `;

		const data = JSON.parse(await fs.readFile(this.enquiryLogPath, "utf8"));
		const enquiryId = `enq-${crypto.randomBytes(4).toString("hex")}`;

		data.enquiries.push({
			id: enquiryId,
			timestamp: Date.now(),
			transactionIds,
			content: draft,
			status: "drafted",
		});

		await fs.writeFile(this.enquiryLogPath, JSON.stringify(data, null, 2));
		console.log(`[PlaidEnquiry] ✅ Enquiry draft [${enquiryId}] saved to log.`);
		return draft;
	}

	async runAutonomousEnquiry(inputIds) {
		console.log(
			`\n🚀 [${new Date().toISOString()}] Starting Plaid Enquiry Cycle...`,
		);

		let idsToProcess = inputIds || [];

		// IMPROVEMENT: Autonomously scan ledger_updates for scoring issues
		try {
			const ledgerPath = path.resolve("data", "ledger_updates.json");
			const data = JSON.parse(await fs.readFile(ledgerPath, "utf8"));

			const newIds = data
				.filter(
					(entry) =>
						entry.action === "plaid_webhook" &&
						entry.body?.status === "NOT_SCORED",
				)
				.map((entry) => entry.body?.transaction_id)
				.filter(Boolean);

			idsToProcess = [...new Set([...idsToProcess, ...newIds])];
		} catch (_e) {
			// No ledger or parse error, skip autonomous scan
		}

		if (idsToProcess.length === 0) {
			console.log("[PlaidEnquiry] No IDs provided or discovered for enquiry.");
			return;
		}

		const draft = await this.draftNotScoredEnquiry(idsToProcess);
		console.log("[PlaidEnquiry] Enquiry cycle complete.");
		return draft;
	}
}
