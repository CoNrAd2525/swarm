import assert from "node:assert/strict";
import test from "node:test";

import {
	buildFundsRecoveryCommunication,
	buildFundsRecoveryIncident,
} from "../src/finance/funds-recovery.mjs";

test("buildFundsRecoveryIncident reports unresolved remaining loss", () => {
	const incident = buildFundsRecoveryIncident({
		id: "recovery_1",
		deficit: 500,
		recoveredAmount: 125,
		seizedAssets: [{ id: "evt_1" }, { id: "evt_2" }],
		targetReserve: 50000,
	});

	assert.equal(incident.type, "funds_loss_recovery_incident");
	assert.equal(incident.status, "PARTIALLY_RECOVERED");
	assert.equal(incident.remaining_loss, 375);
	assert.deepEqual(incident.seized_asset_ids, ["evt_1", "evt_2"]);
	assert.equal(incident.recovery_priority, "IMMEDIATE");
});

test("buildFundsRecoveryCommunication targets configured recipients", () => {
	const prev = process.env.FUNDS_RECOVERY_EMAILS;
	try {
		process.env.FUNDS_RECOVERY_EMAILS = "ops@example.com,owner@example.com";
		const communication = buildFundsRecoveryCommunication({
			id: "recovery_2",
			status: "OPEN",
			target_reserve: 50000,
			deficit_detected: 1000,
			value_recovered: 0,
			remaining_loss: 1000,
			assets_seized: 0,
		});

		assert.deepEqual(communication.email.to, [
			"ops@example.com",
			"owner@example.com",
		]);
		assert.match(communication.email.subject, /Funds recovery required/);
		assert.match(communication.email.body, /Remaining loss: 1000 USD/);
	} finally {
		if (prev == null) delete process.env.FUNDS_RECOVERY_EMAILS;
		else process.env.FUNDS_RECOVERY_EMAILS = prev;
	}
});
