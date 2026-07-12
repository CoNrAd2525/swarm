import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
	isAttijariBankWire,
	resolveGatewayInstructionPath,
} from "../scripts/lib/bank-confirmation-guards.mjs";

test("isAttijariBankWire detects Attijari from batch metadata", () => {
	assert.equal(
		isAttijariBankWire({
			beneficiary: { bank_name: "Attijariwafa Bank" },
		}),
		true,
	);
	assert.equal(
		isAttijariBankWire({
			beneficiary: { bank_name: "Wise Europe" },
		}),
		false,
	);
});

test("isAttijariBankWire detects Attijari from FILE gateway instructions", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attijari-wire-"));
	const instructionPath = path.join(dir, "wire.json");
	fs.writeFileSync(
		instructionPath,
		JSON.stringify({
			beneficiary: {
				bank_name: "Attijariwafa Bank",
			},
		}),
		"utf8",
	);

	const batch = { gateway_ref: `FILE:${instructionPath}` };
	assert.equal(resolveGatewayInstructionPath(batch), instructionPath);
	assert.equal(isAttijariBankWire(batch), true);
});
