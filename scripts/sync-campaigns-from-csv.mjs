import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { buildBase44Client, buildBase44ServiceClient } from "../src/base44-client.mjs";

function parseCsvLine(line) {
	const result = [];
	let current = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === "," && !inQuotes) {
			result.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	result.push(current);
	return result.map((v) => v.trim());
}

function readCsv(filePath) {
	const content = fs.readFileSync(filePath, "utf8");
	const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
	const headers = parseCsvLine(lines[0]);
	const rows = lines.slice(1).map(parseCsvLine);
	return { headers, rows };
}

function toObj(headers, cols) {
	const o = {};
	for (let i = 0; i < headers.length; i++) {
		o[headers[i]] = cols[i] ?? "";
	}
	return o;
}

function getCampaignEntityName() {
	return process.env.BASE44_CAMPAIGN_ENTITY ?? "Campaign";
}

function parseMaybeJson(s) {
	if (!s) return null;
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

function parseNumberOrNull(s) {
	if (s === undefined || s === null) return null;
	const t = String(s).trim();
	if (!t) return null;
	const n = Number(t.replace(/[^0-9.\-]/g, ""));
	return Number.isFinite(n) ? n : null;
}

function normalizeAgents(raw) {
	const parsed = parseMaybeJson(raw);
	if (Array.isArray(parsed)) return parsed.filter((x) => !!x).map((x) => String(x).trim());
	const str = String(raw ?? "").trim();
	if (!str) return [];
	let candidate = str;
	if (candidate.startsWith("[") && !candidate.endsWith("]")) candidate = candidate + "]";
	const tryJson = parseMaybeJson(candidate);
	if (Array.isArray(tryJson)) return tryJson.filter((x) => !!x).map((x) => String(x).trim());
	const cleaned = candidate.replace(/[[\]"]/g, "");
	return cleaned
		.split(/[,;|]/)
		.map((x) => String(x).trim())
		.filter((x) => x.length > 0);
}

function normalizeTargetMetrics(raw) {
	const parsed = parseMaybeJson(raw);
	if (parsed && typeof parsed === "object") return parsed;
	const str = String(raw ?? "").trim();
	if (!str) return null;
	const cleaned = str.replace(/^\{/, "").replace(/\}$/, "");
	const parts = cleaned.split(/[,;|]/);
	const out = {};
	for (const part of parts) {
		const segs = part.split(/:/);
		if (!segs[0]) continue;
		const k = String(segs[0]).trim();
		let v = segs.length > 1 ? String(segs.slice(1).join(":")).trim() : null;
		if (v && /^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
		out[k] = v;
	}
	return Object.keys(out).length ? out : null;
}

async function main() {
	const args = process.argv.slice(2);
	const ix = args.indexOf("--in");
	const inputPath =
		(ix !== -1 && args[ix + 1]) ||
		path.join(process.cwd(), "rank", "Campaign_export (5).csv");
	if (!fs.existsSync(inputPath)) {
		console.error(`Input CSV not found: ${inputPath}`);
		process.exit(2);
	}
	const { headers, rows } = readCsv(inputPath);
	const online = buildBase44ServiceClient({ mode: "online" });
	const offline = buildBase44Client({ mode: "offline" });

	const entityName = getCampaignEntityName();
	const onlineEntity = online.asServiceRole.entities[entityName];
	const offlineEntity = offline.asServiceRole.entities[entityName];

	let created = 0;
	let updated = 0;
	for (const cols of rows) {
		const r = toObj(headers, cols);
		const id = r.id?.trim() || null;
		const agents = normalizeAgents(r.agents);
		const target_metrics = normalizeTargetMetrics(r.target_metrics);
		const patch = {
			name: r.name,
			description: r.description,
			target_url: r.target_url,
			agents,
			status: r.status || "active",
			start_date: r.start_date || null,
			end_date: r.end_date || null,
			target_metrics,
			budget: parseNumberOrNull(r.budget),
		};
		try {
			if (id) {
				await onlineEntity.update(id, patch);
				updated++;
				continue;
			}
			let didUpdate = false;
			try {
				const existing = await onlineEntity.filter(
					{ name: r.name, target_url: r.target_url },
					"-created_date",
					1,
					0,
					["id"],
				);
				if (Array.isArray(existing) && existing[0]?.id) {
					await onlineEntity.update(existing[0].id, patch);
					updated++;
					didUpdate = true;
				}
			} catch {}
			if (!didUpdate) {
				let createdRec = null;
				try {
					createdRec = await onlineEntity.create(patch);
				} catch {}
				const offlineId =
					(createdRec && createdRec.id) ? createdRec.id : `offline_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
				await offlineEntity.create({ ...patch, id: offlineId });
				created++;
			}
		} catch (err) {
			console.warn("Sync failed for campaign", {
				name: r.name,
				error: String(err?.message ?? err),
			});
		}
	}
	console.log(`Campaign sync completed. Created: ${created}, Updated: ${updated}`);
}

main();
