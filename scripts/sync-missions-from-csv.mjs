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

function getMissionEntityName() {
	return process.env.BASE44_MISSION_ENTITY ?? "Mission";
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

function normalizeIdList(raw) {
	const parsed = parseMaybeJson(raw);
	if (Array.isArray(parsed)) return parsed.filter(Boolean).map((x) => String(x).trim());
	const str = String(raw ?? "").trim();
	if (!str) return [];
	let candidate = str;
	if (candidate.startsWith("[") && !candidate.endsWith("]")) candidate = candidate + "]";
	const tryJson = parseMaybeJson(candidate);
	if (Array.isArray(tryJson)) return tryJson.filter(Boolean).map((x) => String(x).trim());
	const cleaned = candidate.replace(/[[\]"]/g, "");
	return cleaned
		.split(/[,;|]/)
		.map((x) => String(x).trim())
		.filter((x) => x.length > 0);
}

function parseJsonOrRawString(raw) {
	const parsed = parseMaybeJson(raw);
	if (parsed !== null) return parsed;
	const t = String(raw ?? "").trim();
	return t ? t : null;
}

function shouldWriteOffline() {
	const v = String(process.env.BASE44_WRITE_OFFLINE ?? "true").toLowerCase();
	return v === "true" || v === "1" || v === "yes";
}

async function main() {
	const args = process.argv.slice(2);
	const ix = args.indexOf("--in");
	const inputPath = (ix !== -1 && args[ix + 1]) || path.join(process.cwd(), "archive", "Mission_export.csv");
	if (!fs.existsSync(inputPath)) {
		console.error(`Input CSV not found: ${inputPath}`);
		process.exit(2);
	}
	const { headers, rows } = readCsv(inputPath);
	const online = buildBase44ServiceClient({ mode: "online" });
	const offline = shouldWriteOffline() ? buildBase44Client({ mode: "offline" }) : null;

	const entityName = getMissionEntityName();
	const onlineEntity = online.asServiceRole.entities[entityName];
	const offlineEntity = offline ? offline.asServiceRole.entities[entityName] : null;

	let created = 0;
	let updated = 0;
	for (const cols of rows) {
		const r = toObj(headers, cols);
		const id = r.id?.trim() || null;
		const patch = {
			title: r.title,
			type: r.type,
			priority: r.priority,
			status: r.status,
			assigned_agent_ids: normalizeIdList(r.assigned_agent_ids),
			mission_parameters: parseJsonOrRawString(r.mission_parameters),
			progress_data: parseJsonOrRawString(r.progress_data),
			estimated_duration_hours: parseNumberOrNull(r.estimated_duration_hours),
			actual_duration_hours: parseNumberOrNull(r.actual_duration_hours),
			deadline: r.deadline || null,
			completion_notes: r.completion_notes || null,
			revenue_generated: parseNumberOrNull(r.revenue_generated),
		};
		try {
			if (id) {
				await onlineEntity.update(id, patch);
				updated++;
				continue;
			}
			let createdRec = null;
			try {
				createdRec = await onlineEntity.create(patch);
			} catch {}
			if (offlineEntity) {
				const offlineId =
					(createdRec && createdRec.id) ? createdRec.id : `offline_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
				await offlineEntity.create({ ...patch, id: offlineId });
			}
			created++;
		} catch (err) {
			console.warn("Sync failed for mission", {
				title: r.title,
				error: String(err?.message ?? err),
			});
		}
	}
	console.log(`Mission sync completed. Created: ${created}, Updated: ${updated}`);
}

main();
