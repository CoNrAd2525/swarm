import assert from "node:assert/strict";
import test from "node:test";

import {
	buildAttijariWirePacket,
	buildAttijariWireReceipt,
	buildPacketPath,
	buildReceiptPath,
	isAttijariBankName,
} from "../scripts/lib/attijari-wire.mjs";

test("isAttijariBankName detects attijari variants", () => {
	assert.equal(isAttijariBankName("Attijariwafa Bank"), true);
	assert.equal(isAttijariBankName("attijari branch"), true);
	assert.equal(isAttijariBankName("Wise"), false);
});

test("buildAttijariWirePacket includes receipt artifact and confirm command", () => {
	const packet = buildAttijariWirePacket({
		batchId: "batch-123",
		amount: 2500,
		currency: "MAD",
		reference: "Settlement batch-123",
		createdAt: "2026-06-21T10:00:00.000Z",
		beneficiary: {
			name: "Owner",
			rib: "007810000448500030594182",
			bank_name: "Attijariwafa Bank",
		},
	});

	assert.equal(packet.type, "attijari_manual_wire_packet");
	assert.equal(packet.provider, "ATTIJARIWAFA_BANK");
	assert.equal(packet.receipt_artifact_path, buildReceiptPath("batch-123"));
	assert.equal(packet.confirm_command.includes("confirm-attijari-wire-transfer.mjs"), true);
	assert.equal(packet.steps.length > 0, true);
	assert.equal(packet.created_at, "2026-06-21T10:00:00.000Z");
	assert.equal(Date.parse(packet.expected_confirmation_by) > Date.parse(packet.created_at), true);
	assert.equal(buildPacketPath("batch-123").includes("attijari_wire_packet_batch-123"), true);
});

test("buildAttijariWireReceipt preserves transfer details for receipt scanning", () => {
	const receipt = buildAttijariWireReceipt({
		batchId: "batch-456",
		transactionId: "ATJ-789",
		amount: 1200,
		currency: "MAD",
		reference: "Settlement batch-456",
		beneficiary: {
			rib: "007810000448500030594182",
			iban: "MA64007810000448500030594182",
		},
		receiptUrl: "https://attijari.example/receipt/ATJ-789",
		submittedAt: "2026-06-21T12:00:00.000Z",
	});

	assert.equal(receipt.type, "attijari_wire_receipt");
	assert.equal(receipt.transaction_id, "ATJ-789");
	assert.equal(receipt.destination, "007810000448500030594182");
	assert.equal(receipt.status, "submitted_manual_attijari_wire");
	assert.match(receipt.receipt_url, /attijari\.example/);
});
