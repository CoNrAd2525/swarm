import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { buildBase44ServiceClient } from "../src/base44-client.mjs";
import {
	buildAttijariWireReceipt,
	buildInstructionPath,
	buildReceiptPath,
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

function isMissingReference(value) {
        const v = String(value ?? "").trim();
        if (!v) return true;
        if (/^ATTIJARI_\d+$/i.test(v)) return true;
        if (/^(TODO|CHANGEME|REPLACE_ME)$/i.test(v)) return true;
        if (/^<.*>$/.test(v)) return true;
        return false;
}

async function main() {
	const args = parseArgs(process.argv);
	const batchId = args._?.[0];
	if (!batchId) {
		throw new Error(
			"Usage: node scripts/confirm-attijari-wire-transfer.mjs <BATCH_ID> --transaction-id <ATTIJARI_REFERENCE> [--receipt-url <URL>]",
		);
	}

        const transactionId = String(args["transaction-id"] ?? "").trim();
        if (isMissingReference(transactionId)) {
                throw new Error(
                        "A real Attijari transaction reference is required. Re-run with --transaction-id <ATTIJARI_REFERENCE> after the bank wire is actually submitted.",
                );
        }
	const receiptUrl = String(args["receipt-url"] ?? "").trim();
	const submittedAt = String(args["submitted-at"] ?? new Date().toISOString());
	const instructionPath = buildInstructionPath(batchId);
	const instruction = readJsonMaybe(instructionPath);
	if (!instruction) {
		throw new Error(`Missing instruction artifact for batch ${batchId}: ${instructionPath}`);
	}

	const receiptPath = buildReceiptPath(batchId);
	const receipt = buildAttijariWireReceipt({
		batchId,
		transactionId,
		amount: instruction.amount,
		currency: instruction.currency,
		reference: instruction.reference,
		beneficiary: instruction.beneficiary,
		receiptUrl,
		submittedAt,
	});
	fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
	fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");

	const base44 = buildBase44ServiceClient();
	const batchEntity = base44.asServiceRole.entities.PayoutBatch;
	const itemEntity = base44.asServiceRole.entities.PayoutItem;
	const eventEntity = base44.asServiceRole.entities.RevenueEvent;

	const batches = await batchEntity.filter({ batch_id: batchId }, "-created_date", 1, 0);
	if (batches.length === 0) {
		throw new Error(`Batch ${batchId} not found.`);
	}

	const batch = batches[0];
	await batchEntity.update(batch.id, {
		status: "completed",
		gateway_ref: `ATTIJARI:${transactionId}`,
		confirmed_at: submittedAt,
	});

	const items = await itemEntity.filter({ batch_id: batchId }, "-created_date", 1000, 0);
	for (const item of items) {
		await itemEntity.update(item.id, { status: "paid_out" });
		if (item.revenue_event_id) {
			try {
				const events = await eventEntity.filter(
					{ id: item.revenue_event_id },
					"-created_date",
					1,
					0,
				);
				if (events.length > 0) {
					await eventEntity.update(events[0].id, { settled: true });
				}
			} catch {}
		}
	}

	process.stdout.write(
		`${JSON.stringify({
			ok: true,
			batch_id: batchId,
			transaction_id: transactionId,
			receipt_path: receiptPath,
			gateway_ref: `ATTIJARI:${transactionId}`,
		})}\n`,
	);
}

main().catch((error) => {
	process.stdout.write(
		`${JSON.stringify({ ok: false, error: error?.message ?? String(error) })}\n`,
	);
	process.exitCode = 1;
});
