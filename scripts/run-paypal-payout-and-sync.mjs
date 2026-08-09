import "dotenv/config";
import { PayPalGateway } from "../src/financial/gateways/PayPalGateway.mjs";
import { spawnSync } from "node:child_process";

function runSync(batchId) {
	const res = spawnSync(
		process.execPath,
		["src/sync-paypal-payout-batch.mjs", "--batchId", batchId],
		{ encoding: "utf8" },
	);
	return { ok: res.status === 0, out: res.stdout, err: res.stderr };
}

async function run() {
	process.env.PAYPAL_MODE = "PAYOUT";
	const gw = new PayPalGateway();
	const dest =
		process.env.PAYPAL_PAYOUT_EMAIL ||
		process.env.OWNER_PAYPAL_EMAIL ||
		process.env.PAYPAL_EMAIL;
	const amt = Number(process.env.PAYPAL_PAYOUT_AMOUNT || 25);
	const cur = process.env.PAYPAL_PAYOUT_CURRENCY || "USD";
	try {
		const res = await gw.createPayout(
			amt,
			cur,
			dest,
			"Owner Hands-Free Live Payout",
		);
		if (!res || !res.batch_header?.payout_batch_id) {
			console.log(
				JSON.stringify({ ok: false, error: "missing_batch_id", res }, null, 2),
			);
			return;
		}
		const batchId = res.batch_header.payout_batch_id;
		console.log(
			JSON.stringify({ ok: true, payout: { ...res, batchId } }, null, 2),
		);
		const sync = runSync(batchId);
		console.log(sync.out || "");
		if (!sync.ok) {
			console.error(sync.err || "SYNC_FAILED");
			process.exit(1);
		}
	} catch (e) {
		const msg = e && e.message ? e.message : String(e);
		if (msg.includes("AUTHORIZATION_ERROR")) {
			console.log(
				JSON.stringify(
					{
						ok: false,
						error: "paypal_authorization_error_no_external_transfer",
						no_external_transfer_executed: true,
						requires_human_approval: false,
						owner_hands_free_policy: true,
						reroute_to_builder_executor: true,
						message:
							"No external transfer was executed. PayPal authorization failed before a live payout batch could be created. Owner hands-free policy remains enabled; rerun through the real Builder+ payout executor once live route prerequisites are satisfied.",
						details: {
							amount: amt,
							currency: cur,
							destination: dest,
						},
					},
					null,
					2,
				),
			);
			process.exit(1);
		}
		console.error("PAYPAL_PAYOUT_FAILED", msg);
		process.exit(1);
	}
}

run().catch((e) => {
	console.error("PAYPAL_PAYOUT_FAILED", e && e.message ? e.message : String(e));
	process.exit(1);
});
