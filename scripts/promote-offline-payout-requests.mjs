import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { buildBase44Client, buildBase44ServiceClient } from "../src/base44-client.mjs";
import {
	getPayoutRequestConfigFromEnv,
	createBase44PayoutRequestIdempotent,
} from "../src/base44-payout-request.mjs";

function getOfflineStorePath() {
	const v = String(process.env.BASE44_OFFLINE_STORE_PATH ?? "").trim();
	return v || path.join(process.cwd(), ".base44-offline-store.json");
}

function toPayloadFromOffline(cfg, rec) {
	const map = cfg.fieldMap;
	return {
		amount: Number(rec?.[map.amount] ?? 0),
		currency: String(rec?.[map.currency] ?? "USD"),
		status: String(rec?.[map.status] ?? "pending"),
		source: rec?.[map.source] ?? null,
		externalId: rec?.[map.externalId] ?? null,
		occurredAt: rec?.[map.occurredAt] ?? null,
		destinationSummary: rec?.[map.destinationSummary] ?? {},
		metadata: rec?.[map.metadata] ?? {},
	};
}

async function main() {
	const cfg = getPayoutRequestConfigFromEnv();
	const offlinePath = getOfflineStorePath();
	if (!fs.existsSync(offlinePath)) {
		console.log(`No offline store found: ${offlinePath}`);
		return;
	}
	const txt = fs.readFileSync(offlinePath, "utf8");
	const store = JSON.parse(txt);
	const bucket = store?.entities?.[cfg.payoutEntityName]?.records ?? [];
	if (!Array.isArray(bucket) || bucket.length === 0) {
		console.log("No offline payout requests to promote");
		return;
	}

	const online = buildBase44ServiceClient({ mode: "online" });
	const offline = buildBase44Client({ mode: "offline" });
	const offlineEntity = offline.asServiceRole.entities[cfg.payoutEntityName];

	let promoted = 0;
	for (const rec of bucket) {
		const metaKey = cfg.fieldMap.metadata;
		const metadata = rec?.[metaKey] ?? {};
		if (metadata?.promoted === true) continue;
		const payload = toPayloadFromOffline(cfg, rec);
		try {
			const created = await createBase44PayoutRequestIdempotent(online, cfg, payload, {
				dryRun: false,
			});
			const onlineId = created?.id ?? created?.createdId ?? null;
			const newMeta = {
				...metadata,
				promoted: true,
				promoted_at: new Date().toISOString(),
				online_id: onlineId,
			};
			await offlineEntity.update(rec.id, { [metaKey]: newMeta });
			promoted++;
		} catch (err) {
			console.warn("Promotion failed for offline record", {
				id: rec?.id,
				error: String(err?.message ?? err),
			});
		}
	}
	console.log(`Promotion completed. Promoted: ${promoted}`);
}

main();
