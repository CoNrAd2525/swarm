import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { maybeSendAlert } from "../src/alerts.mjs";

function isAttijariBankName(value) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.includes("attijari");
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

function toSafeBatchId(value) {
	return String(value ?? "").replace(/[^a-zA-Z0-9._-]+/g, "_");
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

function buildEscalation(packet) {
	const batchId = String(packet?.batch_id ?? "");
	const to = Array.from(
		new Set(
			String(
				process.env.ATTIJARI_WIRE_ESCALATION_EMAILS ||
					process.env.OWNER_NOTIFY_EMAIL ||
					"",
			)
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean),
		),
	);
	return {
		type: "attijari_wire_confirmation_escalation",
		provider: "ATTIJARIWAFA_BANK",
		batch_id: batchId,
		status: "pending_confirmation_deadline_missed",
		created_at: new Date().toISOString(),
		expected_confirmation_by: packet?.expected_confirmation_by ?? null,
		receipt_artifact_path: packet?.receipt_artifact_path ?? null,
		instruction_path: packet?.instruction_path ?? null,
		portal_url: packet?.portal_url ?? "",
		amount: packet?.amount ?? null,
		currency: packet?.currency ?? null,
		reference: packet?.reference ?? null,
		beneficiary: packet?.beneficiary ?? {},
		email: {
			to,
			subject: `Attijari wire confirmation overdue: ${batchId}`,
			body: [
				"Attijari wire confirmation deadline was missed.",
				`Batch: ${batchId}`,
				`Amount: ${String(packet?.amount ?? "")} ${String(packet?.currency ?? "")}`.trim(),
				`Reference: ${String(packet?.reference ?? "")}`,
				`Expected confirmation by: ${String(packet?.expected_confirmation_by ?? "")}`,
				`Instruction: ${String(packet?.instruction_path ?? "")}`,
				`Receipt artifact: ${String(packet?.receipt_artifact_path ?? "")}`,
			].join("\n"),
		},
	};
}

function buildFallbackPacketFromInstruction(instructionFile, instruction) {
	if (!instruction?.batch_id) return null;
	if (
		!isAttijariBankName(instruction?.beneficiary?.bank_name) &&
		String(instruction?.provider ?? "") !== "ATTIJARIWAFA_BANK"
	) {
		return null;
	}
	const createdAt = String(instruction?.created_at ?? new Date().toISOString());
	const deadlineHours = Math.max(
		1,
		Number(process.env.ATTIJARI_CONFIRM_DEADLINE_HOURS || "24"),
	);
	return {
		type: "attijari_manual_wire_packet",
		provider: "ATTIJARIWAFA_BANK",
		batch_id: instruction.batch_id,
		amount: instruction.amount,
		currency: instruction.currency,
		reference: instruction.reference,
		created_at: createdAt,
		expected_confirmation_by: new Date(
			Date.parse(createdAt) + deadlineHours * 60 * 60 * 1000,
		).toISOString(),
		instruction_path: instructionFile,
		receipt_artifact_path: path.resolve(
			"exports",
			"bank-wire",
			`bank_wire_instruction_${toSafeBatchId(instruction.batch_id)}.receipt.json`,
		),
		portal_url: process.env.ATTIJARI_PORTAL_URL || "",
		beneficiary: instruction.beneficiary ?? {},
	};
}

function isPastDeadline(packet, now = Date.now()) {
	const deadline = Date.parse(
		packet?.expected_confirmation_by || packet?.created_at || "",
	);
	if (!Number.isFinite(deadline)) return false;
	return deadline <= now;
}

async function getBase44ClientIfAvailable() {
	try {
		const mod = await import("../src/base44-client.mjs");
		const base44 = mod?.buildBase44ServiceClient?.();
		return { base44, available: true, reason: null };
	} catch (error) {
		return {
			base44: null,
			available: false,
			reason: error?.code || error?.message || String(error),
		};
	}
}

async function main() {
	const bankWireDir = path.resolve("exports", "bank-wire");
	if (!fs.existsSync(bankWireDir)) {
		process.stdout.write(
			`${JSON.stringify({
				ok: true,
				scanned: 0,
				escalated: 0,
				base44: { available: false, reason: "not_needed" },
			})}\n`,
		);
		return;
	}

	const allFiles = fs.readdirSync(bankWireDir);
	const packetFiles = allFiles
		.filter(
			(name) =>
				name.startsWith("attijari_wire_packet_") &&
				name.endsWith(".json") &&
				!name.endsWith(".escalation.json"),
		)
		.map((name) => path.join(bankWireDir, name));
	const instructionFiles = allFiles
		.filter(
			(name) =>
				name.startsWith("bank_wire_instruction_") &&
				name.endsWith(".json") &&
				!name.endsWith(".receipt.json"),
		)
		.map((name) => path.join(bankWireDir, name));

	const base44Status = await getBase44ClientIfAvailable();
	const base44 = base44Status.base44;

	const candidates = new Map();
	for (const packetFile of packetFiles) {
		const packet = readJsonMaybe(packetFile);
		if (packet?.batch_id) candidates.set(String(packet.batch_id), packet);
	}
	for (const instructionFile of instructionFiles) {
		const instruction = readJsonMaybe(instructionFile);
		const fallbackPacket = buildFallbackPacketFromInstruction(
			instructionFile,
			instruction,
		);
		if (fallbackPacket?.batch_id && !candidates.has(String(fallbackPacket.batch_id))) {
			candidates.set(String(fallbackPacket.batch_id), fallbackPacket);
		}
	}

	const results = [];
	for (const packet of candidates.values()) {
		if (!packet?.batch_id) {
			results.push({ status: "invalid_packet" });
			continue;
		}

		const receiptPath = String(packet.receipt_artifact_path || "").trim();
		if (receiptPath && fs.existsSync(receiptPath)) {
			results.push({ batch_id: packet.batch_id, status: "confirmed" });
			continue;
		}
		if (!isPastDeadline(packet)) {
			results.push({ batch_id: packet.batch_id, status: "awaiting_deadline" });
			continue;
		}

		const escalation = buildEscalation(packet);
		const escalationPath = buildEscalationPath(packet.batch_id);
		const communicationPath = buildCommunicationPath(packet.batch_id);
		if (!fs.existsSync(escalationPath)) {
			writeJson(escalationPath, escalation);
			writeJson(communicationPath, escalation.email);
		}
		try {
			await maybeSendAlert(base44, escalation.email);
		} catch {}
		results.push({
			batch_id: packet.batch_id,
			status: "escalated",
			escalation_path: escalationPath,
			communication_path: communicationPath,
		});
	}

	process.stdout.write(
		`${JSON.stringify({
			ok: true,
			scanned: candidates.size,
			escalated: results.filter((item) => item.status === "escalated").length,
			base44: {
				available: base44Status.available,
				reason: base44Status.reason,
			},
			results,
		})}\n`,
	);
}

main().catch((error) => {
	process.stdout.write(
		`${JSON.stringify({ ok: false, error: error?.message ?? String(error) })}\n`,
	);
	process.exitCode = 1;
});
