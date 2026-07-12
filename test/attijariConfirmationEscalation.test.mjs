import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("check-attijari-wire-confirmations escalates expired historical instruction files", () => {
	const repoRoot = path.resolve(import.meta.dirname, "..");
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "attijari-confirmation-"));
	const bankWireDir = path.join(tempDir, "exports", "bank-wire");
	fs.mkdirSync(bankWireDir, { recursive: true });

	const batchId = "batch-old-attijari";
	const instructionPath = path.join(
		bankWireDir,
		`bank_wire_instruction_${batchId}.json`,
	);
	fs.writeFileSync(
		instructionPath,
		JSON.stringify(
			{
				batch_id: batchId,
				amount: 1800,
				currency: "MAD",
				provider: "ATTIJARIWAFA_BANK",
				reference: `Settlement ${batchId}`,
				created_at: "2026-06-18T00:00:00.000Z",
				beneficiary: {
					name: "Owner",
					rib: "007810000448500030594182",
					bank_name: "Attijariwafa Bank",
				},
			},
			null,
			2,
		) + "\n",
		"utf8",
	);

	const stdout = execFileSync(
		process.execPath,
		[path.join(repoRoot, "scripts", "check-attijari-wire-confirmations.mjs")],
		{
			cwd: tempDir,
			env: {
				...process.env,
				ATTIJARI_CONFIRM_DEADLINE_HOURS: "24",
				ATTIJARI_WIRE_ESCALATION_EMAILS: "ops@example.com",
			},
			encoding: "utf8",
		},
	);
	const result = JSON.parse(stdout.trim());
	const escalationPath = path.join(
		bankWireDir,
		`attijari_wire_packet_${batchId}.escalation.json`,
	);
	const communicationPath = path.join(
		tempDir,
		"exports",
		"communications",
		`attijari_wire_packet_${batchId}.json`,
	);

	assert.equal(result.ok, true);
	assert.equal(result.scanned, 1);
	assert.equal(result.escalated, 1);
	assert.equal(result.base44.available, false);
	assert.equal(fs.existsSync(escalationPath), true);
	assert.equal(fs.existsSync(communicationPath), true);

	const escalation = JSON.parse(fs.readFileSync(escalationPath, "utf8"));
	assert.equal(escalation.batch_id, batchId);
	assert.equal(escalation.status, "pending_confirmation_deadline_missed");
	assert.deepEqual(escalation.email.to, ["ops@example.com"]);
});
