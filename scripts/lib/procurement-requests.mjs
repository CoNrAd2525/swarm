import fs from "node:fs";
import path from "node:path";

function ensureDir(dir) {
	const abs = path.resolve(process.cwd(), dir);
	if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
	return abs;
}

function readJsonMaybe(filePath, fallback = null) {
	try {
		if (!fs.existsSync(filePath)) return fallback;
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return fallback;
	}
}

function normalizeEmailList(raw, fallback = []) {
	const list = Array.isArray(raw)
		? raw
		: String(raw ?? "")
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean);
	const merged = list.length > 0 ? list : fallback;
	return Array.from(new Set(merged.map((value) => String(value).trim()).filter(Boolean)));
}

function buildOwnerProcurementRequest() {
	const now = new Date().toISOString();
	const receiptDeadlineHours = Number(
		process.env.PROCUREMENT_RECEIPT_DEADLINE_HOURS ?? "24",
	);
	return {
		type: "owner_procurement_request",
		version: 2,
		requestedAt: now,
		expectedReceiptBy: new Date(
			Date.now() + Math.max(1, receiptDeadlineHours) * 60 * 60 * 1000,
		).toISOString(),
		status: "requested",
		owner: {
			name: "Mr Younes Tsouli",
			phone: "+212639158209",
			email: "younesdgc@gmail.com",
			shippingAddress: {
				line1: "Lot. Rita LOT C Immeuble B",
				line2: "Appartement 17, 610 Bouznika Ouest",
				city: "Bouznika",
				region: "Ben Slimane",
				postalCode: "13100",
				country: "Morocco",
			},
		},
		requirements: {
			purpose: "primary_development_and_ai_work",
			notes: [
				"heavy daily use for software development and autonomous agent work",
				"must prioritize GPU performance within budget",
			],
		},
		items: [
			{
				category: "laptop",
				name: "Acer Nitro 5",
				preferredCpu: "AMD Ryzen 7",
				preferredGpu: "NVIDIA RTX 4060",
				minRamGb: 16,
				minPrimarySsdGb: 512,
				brandPreferences: {
					primaryStorageBrand: "Western Digital",
				},
				internalStorageLayout: [
					{
						slot: "primary",
						type: "ssd_nvme",
						brand: "Western Digital",
						minSizeGb: 1000,
						role: "os_and_apps",
					},
					{
						slot: "secondary",
						type: "ssd_or_hdd",
						brand: "Western Digital",
						minSizeGb: 1000,
						role: "projects_and_datasets",
					},
				],
				warranty: {
					minYears: 2,
					requireOnsiteOrPickup: true,
				},
			},
			{
				category: "accessory",
				name: "laptop_backpack_or_bag",
				requirements: {
					fitsInches: 15.6,
					waterResistant: true,
					paddingLevel: "high",
				},
			},
			{
				category: "accessory",
				name: "wireless_mouse",
				requirements: {
					connection: "2.4ghz_or_bluetooth",
					use: "productivity",
					handedness: "right_or_ambidextrous",
				},
			},
		],
		constraints: {
			currency: "MAD",
			maxBudgetApprox: 30000,
			priority: "high",
			unitEconomicsGuardrails: true,
		},
	};
}

function buildProcurementReceiptEscalation(request) {
	const to = normalizeEmailList(process.env.PROCUREMENT_ESCALATION_EMAILS, [
		process.env.OWNER_NOTIFY_EMAIL || request?.owner?.email || "younesdgc@gmail.com",
	]);
	const batchId = String(request?.requestedAt ?? Date.now()).replace(/[^a-zA-Z0-9._-]+/g, "_");
	return {
		type: "owner_procurement_request_escalation",
		id: `procurement_escalation_${batchId}`,
		created_at: new Date().toISOString(),
		requested_at: request?.requestedAt ?? null,
		expected_receipt_by: request?.expectedReceiptBy ?? null,
		status: "escalated_missing_receipt",
		email: {
			to,
			subject: "Procurement request not received yet",
			body: [
				"Procurement request receipt has not been confirmed yet.",
				`Requested at: ${request?.requestedAt ?? "unknown"}`,
				`Expected receipt by: ${request?.expectedReceiptBy ?? "unknown"}`,
				`Owner: ${request?.owner?.name ?? "unknown"}`,
				`Purpose: ${request?.requirements?.purpose ?? "unknown"}`,
			].join("\n"),
		},
	};
}

function listProcurementRequestFiles(dir = "exports/procurement-requests") {
	const abs = path.resolve(process.cwd(), dir);
	if (!fs.existsSync(abs)) return [];
	return fs
		.readdirSync(abs)
		.filter((name) => name.endsWith(".json"))
		.filter((name) => !name.includes("receipt") && !name.includes("escalation"))
		.map((name) => path.join(abs, name))
		.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function buildRequestBaseName(requestFile) {
	return path.basename(requestFile, path.extname(requestFile));
}

function hasReceiptArtifact(requestFile) {
	const dir = path.dirname(requestFile);
	const base = buildRequestBaseName(requestFile);
	return fs
		.readdirSync(dir)
		.some((name) => name.startsWith(`${base}.receipt`) && name.endsWith(".json"));
}

function hasEscalationArtifact(requestFile) {
	const dir = path.dirname(requestFile);
	const base = buildRequestBaseName(requestFile);
	return fs
		.readdirSync(dir)
		.some((name) => name.startsWith(`${base}.escalation`) && name.endsWith(".json"));
}

function shouldEscalateMissingReceipt(request) {
	const expectedReceiptBy = Date.parse(String(request?.expectedReceiptBy ?? ""));
	if (!Number.isFinite(expectedReceiptBy)) return false;
	return Date.now() >= expectedReceiptBy;
}

function escalationPathForRequest(requestFile) {
	const dir = path.dirname(requestFile);
	const base = buildRequestBaseName(requestFile);
	return path.join(dir, `${base}.escalation.json`);
}

function writeJson(filePath, payload) {
	ensureDir(path.dirname(filePath));
	fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
	return filePath;
}

function latestProcurementRequest() {
	const files = listProcurementRequestFiles();
	if (!files.length) return null;
	const filePath = files[0];
	const request = readJsonMaybe(filePath, null);
	if (!request) return null;
	return { filePath, request };
}

export {
	buildOwnerProcurementRequest,
	buildProcurementReceiptEscalation,
	escalationPathForRequest,
	hasEscalationArtifact,
	hasReceiptArtifact,
	latestProcurementRequest,
	listProcurementRequestFiles,
	readJsonMaybe,
	shouldEscalateMissingReceipt,
	writeJson,
};
