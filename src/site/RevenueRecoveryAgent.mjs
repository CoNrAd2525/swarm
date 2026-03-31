import fs from "node:fs/promises";
import path from "node:path";
import { buildBase44ServiceClient } from "../base44-client.mjs";

/**
 * REVENUE RECOVERY AGENT (v1.0)
 *
 * Objective: Ensure 100% ingestion of website sales into the ledger.
 * Features:
 *  - IPN Log Scanning: Scans logs/paypal_ipn for verified payments.
 *  - Reconciliation: Compares logs with ledger records.
 *  - Autonomous Ingestion: Creates missing RevenueEvent records.
 */
export class RevenueRecoveryAgent {
	constructor(_options = {}) {
		this.ipnLogsDir = path.resolve("logs", "paypal_ipn");
		this.base44 = buildBase44ServiceClient();
	}

	async runReconciliation() {
		console.log(
			`\n🔄 [${new Date().toISOString()}] Starting Revenue Reconciliation...`,
		);

		try {
			const files = await fs.readdir(this.ipnLogsDir);
			const ipnFiles = files.filter(
				(f) =>
					f.startsWith("ipn_") && f.endsWith(".json") && !f.includes("error"),
			);

			console.log(
				`[RevenueAgent] Found ${ipnFiles.length} IPN logs to process.`,
			);

			const revenueEntity = this.base44.asServiceRole.entities.RevenueEvent;
			const existingEvents = await revenueEntity.list("-created_date", 1000, 0);
			const existingTxnIds = new Set(
				existingEvents.map((e) => e.metadata?.txn_id).filter(Boolean),
			);

			let recoveredCount = 0;

			for (const file of ipnFiles) {
				const filePath = path.join(this.ipnLogsDir, file);
				const log = JSON.parse(await fs.readFile(filePath, "utf8"));

				if (log.verified && log.payment_status === "Completed") {
					if (!existingTxnIds.has(log.txn_id)) {
						console.log(
							`[RevenueAgent] 💰 Found uningested revenue: ${log.gross} ${log.currency} (Txn: ${log.txn_id})`,
						);

						await revenueEntity.create({
							id: `rwc_${log.txn_id}`,
							amount: Number(log.gross || 0),
							currency: log.currency || "USD",
							status: "verified",
							settled: false,
							metadata: {
								source: "RECOVERY_AGENT",
								txn_id: log.txn_id,
								receiver_email: log.receiver_email,
								timestamp: log.timestamp,
							},
						});

						recoveredCount++;
						existingTxnIds.add(log.txn_id);
					}
				}
			}

			console.log(
				`[RevenueAgent] Reconciliation complete. Recovered ${recoveredCount} revenue events.`,
			);
		} catch (e) {
			console.error(`[RevenueAgent] Reconciliation failed: ${e.message}`);
		}
	}
}
