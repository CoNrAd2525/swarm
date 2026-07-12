import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("record-attijari-submission writes instruction and deadline-tracked packet", () => {
	const repoRoot = path.resolve(import.meta.dirname, "..");
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "attijari-record-"));
	const batchId = "batch-manual-123";

	const stdout = execFileSync(
		process.execPath,
		[
			path.join(repoRoot, "scripts", "record-attijari-submission.mjs"),
			batchId,
			"--amount",
			"2450.55",
			"--currency",
			"MAD",
			"--reference",
			`Settlement ${batchId}`,
			"--beneficiary-name",
			"Owner",
			"--rib",
			"007810000448500030594182",
			"--submitted-by",
			"ops@example.com",
			"--notes",
			"Legacy manual transfer",
		],
		{
			cwd: tempDir,
			env: {
				...process.env,
				ATTIJARI_CONFIRM_DEADLINE_HOURS: "12",
			},
			encoding: "utf8",
		},
	);

	const result = JSON.parse(stdout.trim());
	const instructionPath = path.join(
		tempDir,
		"exports",
		"bank-wire",
		`bank_wire_instruction_${batchId}.json`,
	);
	const packetPath = path.join(
		tempDir,
		"exports",
		"bank-wire",
		`attijari_wire_packet_${batchId}.json`,
	);
	assert.equal(result.ok, true);
	assert.equal(result.instruction_path, instructionPath);
	assert.equal(result.packet_path, packetPath);
	assert.equal(fs.existsSync(instructionPath), true);
	assert.equal(fs.existsSync(packetPath), true);

	const instruction = JSON.parse(fs.readFileSync(instructionPath, "utf8"));
	const packet = JSON.parse(fs.readFileSync(packetPath, "utf8"));
	assert.equal(instruction.provider, "ATTIJARIWAFA_BANK");
	assert.equal(instruction.status, "PENDING_MANUAL_WIRE");
	assert.equal(instruction.submitted_by, "ops@example.com");
	assert.equal(packet.batch_id, batchId);
	assert.equal(packet.recorded_via, "record-attijari-submission");
	assert.equal(packet.submitted_by, "ops@example.com");
	assert.equal(packet.notes, "Legacy manual transfer");
	assert.equal(packet.receipt_artifact_path.endsWith(".receipt.json"), true);
	assert.match(packet.confirm_command, /confirm-attijari-wire-transfer/);
	assert.equal(
		Date.parse(packet.expected_confirmation_by) > Date.parse(packet.created_at),
		true,
	);
});
