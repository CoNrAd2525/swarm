import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
	buildAttijariWirePacket,
	buildInstructionPath,
	buildPacketPath,
} from "./lib/attijari-wire.mjs";

function parseArgs(argv) {
	const args = {};
	for (let i = 2; i < argv.length; i++) {
		const current = argv[i];
		if (!current.startsWith("--")) {
			if (!args._) args._ = [];
			args._.push(current);
			continue;
		}
		const key = current.slice(2);
		const next = argv[i + 1];
		if (!next || next.startsWith("--")) {
			args[key] = true;
		} else {
			args[key] = next;
			i++;
		}
	}
	return args;
}

function readJsonMaybe(filePath) {
	try {
		if (!fs.existsSync(filePath)) return null;
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
}

function writeJson(filePath, payload) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function resolveString(...values) {
	for (const value of values) {
		const text = String(value ?? "").trim();
		if (text) return text;
	}
	return "";
}

function resolveNumber(...values) {
	for (const value of values) {
		const num = Number(value);
		if (Number.isFinite(num) && num > 0) return num;
	}
	return null;
}

function buildInstructionFromArgs(batchId, args, existing = {}) {
	const createdAt = resolveString(
		args["created-at"],
		existing.created_at,
		new Date().toISOString(),
	);
	const ownerName = resolveString(
		args["beneficiary-name"],
		existing?.beneficiary?.name,
		process.env.OWNER_NAME,
		process.env.BANK_BENEFICIARY_NAME,
		"Owner",
	);
	const rib = resolveString(
		args.rib,
		existing?.beneficiary?.rib,
		process.env.OWNER_BANK_RIB,
		process.env.BANK_RIB,
	);
	const iban = resolveString(
		args.iban,
		existing?.beneficiary?.iban,
		process.env.OWNER_IBAN,
		process.env.BANK_IBAN,
		rib,
	);
	const instruction = {
		batch_id: batchId,
		amount: resolveNumber(args.amount, existing.amount),
		currency: resolveString(args.currency, existing.currency, "MAD"),
		provider: "ATTIJARIWAFA_BANK",
		beneficiary: {
			name: ownerName,
			rib,
			iban,
			swift: resolveString(
				args.swift,
				existing?.beneficiary?.swift,
				process.env.OWNER_SWIFT,
				process.env.BANK_SWIFT,
				"N/A",
			),
			bank_name: resolveString(
				args["bank-name"],
				existing?.beneficiary?.bank_name,
				process.env.OWNER_BANK_NAME,
				"Attijariwafa Bank",
			),
		},
		reference: resolveString(
			args.reference,
			existing.reference,
			`Settlement ${batchId}`,
		),
		status: "PENDING_MANUAL_WIRE",
		created_at: createdAt,
		recorded_via: "record-attijari-submission",
	};
	const submittedBy = resolveString(args["submitted-by"], existing.submitted_by);
	if (submittedBy) instruction.submitted_by = submittedBy;
	const notes = resolveString(args.notes, existing.notes);
	if (notes) instruction.notes = notes;
	return instruction;
}

async function main() {
	const args = parseArgs(process.argv);
	const batchId = args._?.[0];
	if (!batchId) {
		throw new Error(
			"Usage: node scripts/record-attijari-submission.mjs <BATCH_ID> [--instruction <PATH>] [--amount <NUMBER>] [--currency <CODE>] [--reference <TEXT>] [--rib <RIB>]",
		);
	}

	const instructionPath = path.resolve(
		resolveString(args.instruction, buildInstructionPath(batchId)),
	);
	const existingInstruction = readJsonMaybe(instructionPath) ?? {};
	const instruction = buildInstructionFromArgs(
		batchId,
		args,
		existingInstruction,
	);
	if (!Number.isFinite(Number(instruction.amount)) || Number(instruction.amount) <= 0) {
		throw new Error(
			`Missing amount for batch ${batchId}. Provide --amount or create the instruction file first.`,
		);
	}
	if (!resolveString(instruction?.beneficiary?.rib, instruction?.beneficiary?.iban)) {
		throw new Error(
			`Missing beneficiary bank destination for batch ${batchId}. Provide --rib/--iban or create the instruction file first.`,
		);
	}

	writeJson(instructionPath, instruction);

	const packet = buildAttijariWirePacket({
		batchId,
		amount: instruction.amount,
		currency: instruction.currency,
		beneficiary: instruction.beneficiary,
		reference: instruction.reference,
		instructionPath,
		createdAt: instruction.created_at,
		expectedConfirmationBy: resolveString(args["expected-confirmation-by"]),
	});
	packet.recorded_via = "record-attijari-submission";
	if (instruction.submitted_by) packet.submitted_by = instruction.submitted_by;
	if (instruction.notes) packet.notes = instruction.notes;

	const packetPath = buildPacketPath(batchId);
	writeJson(packetPath, packet);

	process.stdout.write(
		`${JSON.stringify({
			ok: true,
			batch_id: batchId,
			instruction_path: instructionPath,
			packet_path: packetPath,
			expected_confirmation_by: packet.expected_confirmation_by,
		})}\n`,
	);
}

main().catch((error) => {
	process.stdout.write(
		`${JSON.stringify({ ok: false, error: error?.message ?? String(error) })}\n`,
	);
	process.exitCode = 1;
});
