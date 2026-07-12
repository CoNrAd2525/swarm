import path from "node:path";

function ensurePositiveNumber(value, fallback = 0) {
	const num = Number(value);
	return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeRecipientList(raw, fallback = []) {
	const source = Array.isArray(raw)
		? raw
		: String(raw ?? "")
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean);
	const merged = source.length > 0 ? source : fallback;
	return Array.from(new Set(merged.map((value) => String(value).trim()).filter(Boolean)));
}

function buildFundsRecoveryIncident({
	id = `recovery_${Date.now()}`,
	deficit,
	recoveredAmount,
	seizedAssets = [],
	targetReserve,
}) {
	const normalizedDeficit = ensurePositiveNumber(deficit, 0);
	const normalizedRecovered = Math.max(0, Number(recoveredAmount) || 0);
	const remainingLoss = Math.max(
		0,
		Number((normalizedDeficit - normalizedRecovered).toFixed(2)),
	);
	const timestamp = new Date().toISOString();
	const status =
		remainingLoss === 0
			? "RESOLVED"
			: normalizedRecovered > 0
				? "PARTIALLY_RECOVERED"
				: "OPEN";
	return {
		type: "funds_loss_recovery_incident",
		id,
		timestamp,
		target_reserve: ensurePositiveNumber(targetReserve, 0),
		deficit_detected: Number(normalizedDeficit.toFixed(2)),
		value_recovered: Number(normalizedRecovered.toFixed(2)),
		remaining_loss: remainingLoss,
		assets_seized: Array.isArray(seizedAssets) ? seizedAssets.length : 0,
		seized_asset_ids: Array.isArray(seizedAssets)
			? seizedAssets
					.map((entry) => entry?.id ?? entry?.external_id ?? null)
					.filter(Boolean)
			: [],
		status,
		recovery_priority: remainingLoss > 0 ? "IMMEDIATE" : "NORMAL",
	};
}

function buildFundsRecoveryCommunication(incident) {
	const to = normalizeRecipientList(process.env.FUNDS_RECOVERY_EMAILS, [
		process.env.OWNER_NOTIFY_EMAIL || process.env.OWNER_PAYPAL_EMAIL || "younesdgc@gmail.com",
	]);
	const subject =
		incident.remaining_loss > 0
			? `Funds recovery required: ${incident.remaining_loss} USD still missing`
			: `Funds recovery resolved: ${incident.value_recovered} USD recovered`;
	const body = [
		"Funds recovery incident detected.",
		`Incident: ${incident.id}`,
		`Status: ${incident.status}`,
		`Target reserve: ${incident.target_reserve} USD`,
		`Deficit detected: ${incident.deficit_detected} USD`,
		`Recovered: ${incident.value_recovered} USD`,
		`Remaining loss: ${incident.remaining_loss} USD`,
		`Assets seized: ${incident.assets_seized}`,
	].join("\n");
	return {
		type: "funds_loss_recovery_notification",
		created_at: new Date().toISOString(),
		email: { to, subject, body },
	};
}

function buildFundsRecoveryPaths(incidentId) {
	const safeId = String(incidentId).replace(/[^a-zA-Z0-9._-]+/g, "_");
	return {
		incident: path.resolve("exports", "recovery", `funds_recovery_${safeId}.json`),
		communication: path.resolve(
			"exports",
			"communications",
			`funds_recovery_${safeId}.json`,
		),
	};
}

export {
	buildFundsRecoveryCommunication,
	buildFundsRecoveryIncident,
	buildFundsRecoveryPaths,
};
