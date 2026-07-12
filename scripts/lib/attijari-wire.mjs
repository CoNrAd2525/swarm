import path from "node:path";

function isAttijariBankName(value) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.includes("attijari");
}

function toSafeBatchId(value) {
	return String(value ?? "").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function buildInstructionPath(batchId) {
	return path.resolve(
		"exports",
		"bank-wire",
		`bank_wire_instruction_${toSafeBatchId(batchId)}.json`,
	);
}

function buildReceiptPath(batchId) {
	return path.resolve(
		"exports",
		"bank-wire",
		`bank_wire_instruction_${toSafeBatchId(batchId)}.receipt.json`,
	);
}

function buildPacketPath(batchId) {
	return path.resolve(
		"exports",
		"bank-wire",
		`attijari_wire_packet_${toSafeBatchId(batchId)}.json`,
	);
}

function buildEscalationPath(batchId) {
	return path.resolve(
		"exports",
		"bank-wire",
		`attijari_wire_packet_${toSafeBatchId(batchId)}.escalation.json`,
	);
}

function buildCommunicationPath(batchId) {
	return path.resolve(
		"exports",
		"communications",
		`attijari_wire_packet_${toSafeBatchId(batchId)}.json`,
	);
}

function resolveDestination(beneficiary = {}) {
	return (
		String(beneficiary?.rib ?? "").trim() ||
		String(beneficiary?.iban ?? "").trim() ||
		String(beneficiary?.account ?? "").trim()
	);
}

function buildAttijariWirePacket({
	batchId,
	amount,
	currency,
	beneficiary = {},
	reference,
	instructionPath = buildInstructionPath(batchId),
	createdAt = new Date().toISOString(),
	expectedConfirmationBy,
}) {
	const receiptPath = buildReceiptPath(batchId);
	const deadlineHours = Math.max(
		1,
		Number(process.env.ATTIJARI_CONFIRM_DEADLINE_HOURS || "24"),
	);
	return {
		type: "attijari_manual_wire_packet",
		provider: "ATTIJARIWAFA_BANK",
		batch_id: batchId,
		amount,
		currency,
		reference,
		created_at: createdAt,
		expected_confirmation_by:
			expectedConfirmationBy ||
			new Date(
				Date.parse(createdAt) + deadlineHours * 60 * 60 * 1000,
			).toISOString(),
		instruction_path: instructionPath,
		receipt_artifact_path: receiptPath,
		portal_url: process.env.ATTIJARI_PORTAL_URL || "",
		beneficiary,
		steps: [
			"Open the Attijari wire portal or branch workflow.",
			"Submit the transfer using the exact beneficiary and reference values.",
			"Capture the Attijari transaction reference and any receipt URL or file.",
			"Run the confirmation command to write the receipt artifact and close the batch.",
		],
		confirm_command:
			`node ./scripts/confirm-attijari-wire-transfer.mjs ${String(batchId)} ` +
			`--transaction-id=<ATTIJARI_REFERENCE> --receipt-url=<OPTIONAL_RECEIPT_URL>`,
	};
}

function buildAttijariWireReceipt({
	batchId,
	transactionId,
	amount,
	currency,
	reference,
	beneficiary = {},
	receiptUrl = "",
	submittedAt = new Date().toISOString(),
}) {
	return {
		type: "attijari_wire_receipt",
		provider: "ATTIJARIWAFA_BANK",
		batch_id: batchId,
		transaction_id: transactionId,
		amount,
		currency,
		reference,
		status: "submitted_manual_attijari_wire",
		submitted_at: submittedAt,
		confirmed_at: submittedAt,
		receipt_url: receiptUrl,
		destination: resolveDestination(beneficiary),
		bank_rib: String(beneficiary?.rib ?? "").trim(),
		beneficiary,
	};
}

export {
	buildAttijariWirePacket,
	buildAttijariWireReceipt,
	buildInstructionPath,
	buildPacketPath,
	buildReceiptPath,
	isAttijariBankName,
};
