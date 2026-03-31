import "dotenv/config";
import { buildBase44ServiceClient } from "../src/base44-client.mjs";

async function confirmExternalSettlement() {
	const batchId = process.argv[2];
	const txId = process.argv[3] || `MANUAL_${Date.now()}`;

	if (!batchId) {
		console.log(
			"Usage: node scripts/external-confirmator.mjs <BATCH_ID> [TRANSACTION_ID]",
		);

		// List pending external confirmations
		const base44 = buildBase44ServiceClient();
		const batchEntity = base44.asServiceRole.entities.PayoutBatch;

		// In offline mode, filter manually if needed
		let pending = [];
		try {
			pending = await batchEntity.filter(
				{ status: "pending_external_confirmation" },
				"-created_date",
				100,
				0,
			);
		} catch (_e) {
			console.log(
				"Error filtering batches. Ensure BASE44_OFFLINE_MODE=true if offline.",
			);
			return;
		}

		if (pending.length === 0) {
			console.log("No batches pending external confirmation.");
		} else {
			console.log("\nPending External Confirmations:");
			pending.forEach((b) => {
				console.log(
					`- ${b.batch_id} (${b.total_amount} ${b.currency}) via ${b.payout_method}`,
				);
			});
		}
		return;
	}

	console.log(`Confirming settlement for batch: ${batchId}...`);

	const base44 = buildBase44ServiceClient();
	const batchEntity = base44.asServiceRole.entities.PayoutBatch;
	const itemEntity = base44.asServiceRole.entities.PayoutItem;
	const eventEntity = base44.asServiceRole.entities.RevenueEvent;

	const batches = await batchEntity.filter(
		{ batch_id: batchId },
		"-created_date",
		1,
		0,
	);
	if (batches.length === 0) {
		console.error(`Batch ${batchId} not found.`);
		return;
	}

	const batch = batches[0];
	await batchEntity.update(batch.id, {
		status: "completed",
		gateway_ref: txId,
		confirmed_at: new Date().toISOString(),
	});

	const items = await itemEntity.filter(
		{ batch_id: batchId },
		"-created_date",
		1000,
		0,
	);
	for (const item of items) {
		await itemEntity.update(item.id, { status: "paid_out" });

		// Also update the original revenue event
		if (item.revenue_event_id) {
			const events = await eventEntity.filter(
				{ id: item.revenue_event_id },
				"-created_date",
				1,
				0,
			);
			if (events.length > 0) {
				await eventEntity.update(events[0].id, { settled: true });
			}
		}
	}

	console.log(`✅ Batch ${batchId} confirmed and marked as COMPLETED.`);
	console.log(`Transaction ID recorded: ${txId}`);
}

confirmExternalSettlement().catch(console.error);
