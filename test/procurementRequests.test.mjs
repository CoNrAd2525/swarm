import assert from "node:assert/strict";
import test from "node:test";

import {
	buildOwnerProcurementRequest,
	buildProcurementReceiptEscalation,
	shouldEscalateMissingReceipt,
} from "../scripts/lib/procurement-requests.mjs";

test("buildOwnerProcurementRequest includes receipt deadline", () => {
	const request = buildOwnerProcurementRequest();

	assert.equal(request.type, "owner_procurement_request");
	assert.equal(request.status, "requested");
	assert.ok(request.expectedReceiptBy);
	assert.equal(Array.isArray(request.items), true);
	assert.ok(request.items.length > 0);
});

test("shouldEscalateMissingReceipt only escalates after deadline", () => {
	assert.equal(
		shouldEscalateMissingReceipt({
			expectedReceiptBy: new Date(Date.now() - 60_000).toISOString(),
		}),
		true,
	);
	assert.equal(
		shouldEscalateMissingReceipt({
			expectedReceiptBy: new Date(Date.now() + 60_000).toISOString(),
		}),
		false,
	);
});

test("buildProcurementReceiptEscalation carries request timing and recipients", () => {
	const prev = process.env.PROCUREMENT_ESCALATION_EMAILS;
	try {
		process.env.PROCUREMENT_ESCALATION_EMAILS =
			"ops@example.com,procurement@example.com";
		const escalation = buildProcurementReceiptEscalation({
			requestedAt: "2026-06-21T00:00:00.000Z",
			expectedReceiptBy: "2026-06-22T00:00:00.000Z",
			owner: { name: "Mr Younes Tsouli", email: "owner@example.com" },
			requirements: { purpose: "primary_development_and_ai_work" },
		});

		assert.equal(escalation.type, "owner_procurement_request_escalation");
		assert.deepEqual(escalation.email.to, [
			"ops@example.com",
			"procurement@example.com",
		]);
		assert.match(escalation.email.body, /Procurement request receipt has not been confirmed yet/);
		assert.match(escalation.email.body, /Expected receipt by: 2026-06-22T00:00:00.000Z/);
	} finally {
		if (prev == null) delete process.env.PROCUREMENT_ESCALATION_EMAILS;
		else process.env.PROCUREMENT_ESCALATION_EMAILS = prev;
	}
});
