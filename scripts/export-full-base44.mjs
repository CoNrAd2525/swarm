import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { buildBase44ServiceClient } from "../src/base44-client.mjs";

const ENTITIES = [
	"Agent",
	"Campaign",
	"Analytics",
	"CoursePromotion",
	"WorkflowExecution",
	"SwarmCoordination",
	"Mission",
	"FinancialGoal",
	"TransactionLog",
	"RevenueEvent",
	"PayoutBatch",
];

function maskPII(value) {
	if (!value) return "[not configured]";
	const s = String(value);
	if (s.length <= 4) return "*".repeat(s.length);
	if (s.includes("@")) {
		const [local, domain] = s.split("@");
		const maskedLocal = local.length <= 2 ? "*".repeat(local.length) :
			local[0] + "*".repeat(Math.max(local.length - 2, 2)) + local[local.length - 1];
		return `${maskedLocal}@${domain}`;
	}
	return s[0] + "*".repeat(Math.max(s.length - 4, 4)) + s.slice(-4);
}

function deepMask(struct) {
	if (struct == null) return struct;
	if (typeof struct === "string") return struct;
	if (Array.isArray(struct)) return struct.map(deepMask);
	if (typeof struct === "object") {
		const out = {};
		for (const [k, v] of Object.entries(struct)) {
			const key = String(k).toLowerCase();
			if (typeof v === "string" && (key.includes("email") || key.includes("iban") || key.includes("beneficiary") || key.includes("recipient") || key.includes("wallet") || key.includes("address") || key.includes("account_identifier") || key.includes("swift") || key.includes("bic") || key.includes("rib"))) {
				out[k] = maskPII(v);
			} else {
				out[k] = deepMask(v);
			}
		}
		return out;
	}
	return struct;
}

async function main() {
	const dryRun = process.env.BASE44_EXPORT_LIVE !== "true";
	console.log(`Starting Full Base44 Backend Export (dry_run=${dryRun} — set BASE44_EXPORT_LIVE=true to fetch from live API)`);

	let client;
	try {
		client = buildBase44ServiceClient({ mode: "online" });
	} catch (err) {
		console.error("Failed to initialize Base44 client:", err.message);
		process.exit(1);
	}

	const outDir = path.resolve("data/base44_export");
	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true });
	}

	console.log(`Exporting to: ${outDir}`);

	const manifest = { at: new Date().toISOString(), dry_run: dryRun, entities: {} };

	for (const entityName of ENTITIES) {
		process.stdout.write(`Fetching ${entityName}... `);
		try {
			if (dryRun) {
				console.log(`SKIPPED (BASE44_EXPORT_LIVE != true)`);
				manifest.entities[entityName] = { skipped_dry_run: true };
				continue;
			}
			const entityService = client.asServiceRole.entities[entityName];
			if (!entityService) {
				console.log("SKIPPED (Not found in SDK)");
				manifest.entities[entityName] = { skipped_missing_sdk: true };
				continue;
			}

			const records = await entityService.list("-created_date", 1000, 0);
			const masked = deepMask(records);
			const filePath = path.join(outDir, `${entityName}.json`);
			fs.writeFileSync(filePath, JSON.stringify(masked, null, 2));
			console.log(`OK (${records.length} records) [masked on disk]`);
			manifest.entities[entityName] = { count: records.length, masked: true };
		} catch (err) {
			const safe = String(err.message || err).slice(0, 200);
			console.log(`FAILED: ${safe}`);
			manifest.entities[entityName] = { error: safe };
		}
	}

	const manifestPath = path.join(outDir, `export_manifest_${Date.now()}.json`);
	try {
		fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
	} catch {}

	// Also try to export the offline store if it exists, as a backup
	const offlinePath = path.resolve(".base44-offline-store.json");
	if (fs.existsSync(offlinePath)) {
		console.log("Backing up local offline store (PII-masked)...");
		try {
			const raw = JSON.parse(fs.readFileSync(offlinePath, "utf8"));
			fs.writeFileSync(
				path.join(outDir, "offline-store-backup.json"),
				JSON.stringify(deepMask(raw), null, 2),
			);
		} catch (parseErr) {
			console.log("Offline store backup skipped (parse error)");
		}
	}

	console.log("\nExport completed.");
	console.log(`Data saved to: ${outDir}`);
	console.log(`Manifest: ${manifestPath}`);
	console.log("Ready for migration to ownmy.app");
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
