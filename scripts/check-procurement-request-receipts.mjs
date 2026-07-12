import {
	buildProcurementReceiptEscalation,
	escalationPathForRequest,
	hasEscalationArtifact,
	hasReceiptArtifact,
	listProcurementRequestFiles,
	readJsonMaybe,
	shouldEscalateMissingReceipt,
	writeJson,
} from "./lib/procurement-requests.mjs";

function main() {
	const files = listProcurementRequestFiles();
	const escalated = [];
	const pending = [];

	for (const filePath of files) {
		const request = readJsonMaybe(filePath, null);
		if (!request) continue;

		const receiptPresent = hasReceiptArtifact(filePath);
		if (receiptPresent) {
			pending.push({
				file: filePath,
				status: "receipt_present",
			});
			continue;
		}

		if (!shouldEscalateMissingReceipt(request)) {
			pending.push({
				file: filePath,
				status: "awaiting_receipt_deadline",
				expected_receipt_by: request.expectedReceiptBy ?? null,
			});
			continue;
		}

		if (hasEscalationArtifact(filePath)) {
			pending.push({
				file: filePath,
				status: "already_escalated",
			});
			continue;
		}

		const escalation = buildProcurementReceiptEscalation(request);
		const escalationPath = escalationPathForRequest(filePath);
		writeJson(escalationPath, escalation);
		escalated.push({
			request: filePath,
			escalation: escalationPath,
			id: escalation.id,
		});
	}

	process.stdout.write(
		`${JSON.stringify({
			ok: true,
			checked: files.length,
			escalated: escalated.length,
			escalations: escalated,
			pending,
		})}\n`,
	);
}

main();
