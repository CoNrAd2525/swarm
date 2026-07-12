import assert from "node:assert/strict";
import test from "node:test";

import {
	buildEscalationPayload,
	normalizeSettlementRow,
	resolvePayerEmail,
} from "../scripts/generate-payoneer-followups.mjs";

test("buildEscalationPayload targets escalation recipients and preserves batch details", () => {
	const prev = process.env.PAYONEER_ESCALATION_EMAILS;
	try {
		process.env.PAYONEER_ESCALATION_EMAILS =
			"ops@example.com,support@example.com";
		const payload = buildEscalationPayload(
			{
				batch_id: "batch-123",
				item_id: "item-1",
				amount: "245.00",
				currency: "USD",
				payer_email: "billing@example.com",
				payer_name: "Acme Billing",
				recipient_name: "Owner Account",
				purpose: "Settlement payout",
				reference: "INV-42",
				prq_link: "https://payoneer.test/prq/42",
			},
			{ delayHours: 6 },
		);

		assert.equal(payload.type, "payoneer_payout_escalation");
		assert.equal(payload.batch_id, "batch-123");
		assert.deepEqual(payload.email.to, [
			"ops@example.com",
			"support@example.com",
		]);
		assert.match(payload.email.subject, /Escalation: Pending Payoneer payout/);
		assert.match(payload.email.body, /batch batch-123/i);
		assert.match(payload.email.body, /PRQ link: https:\/\/payoneer\.test\/prq\/42/);
	} finally {
		if (prev == null) delete process.env.PAYONEER_ESCALATION_EMAILS;
		else process.env.PAYONEER_ESCALATION_EMAILS = prev;
	}
});


test("resolvePayerEmail uses the RWC_Ops registry alias", () => {
	const resolved = resolvePayerEmail({
		payer_email: "younesdgc@gmail.com",
		payer_name: "Operations",
		payer_company: "RWC_Ops",
		recipient_email: "younestsouli2019@gmail.com",
		batch_id: "PAYO_1773251436053",
	});

	assert.equal(resolved, "billing@realworldcerts.com");
});


test("normalizeSettlementRow converts manual CSV rows into canonical payout rows", () => {
	const normalized = normalizeSettlementRow(
		{
			payee_id: "Owner",
			amount: "1000",
			currency: "USD",
			reference: "Settlement batch_1000",
			payee_email: "younestsouli2019@gmail.com",
			status: "WAITING_MANUAL_EXECUTION",
		},
		"manual_payoneer_batch_1000.csv",
	);

	assert.equal(normalized.batch_id, "manual_payoneer_batch_1000");
	assert.equal(normalized.item_id, "manual_payoneer_batch_1000-ITEM-1");
	assert.equal(normalized.payer_company, "RWC_Ops");
	assert.equal(normalized.purpose, "Manual settlement");
});


test("resolvePayerEmail reroutes direct owner private payouts through ops alias", () => {
	const resolved = resolvePayerEmail({
		payer_email: "younesdgc@gmail.com",
		payer_name: "Younes Tsouli",
		payer_company: "Private",
		recipient_email: "younestsouli2019@gmail.com",
		batch_id: "PAYO_1773232798277",
		reference: "DirectRevenueToOwner",
	});

	assert.equal(resolved, "billing@realworldcerts.com");
});
