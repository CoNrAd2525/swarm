import fs from "node:fs";
import path from "node:path";

function safeJsonRead(file) {
	try {
		if (!fs.existsSync(file)) return null;
		const txt = fs.readFileSync(file, "utf8");
		return JSON.parse(txt);
	} catch {
		return null;
	}
}

function safeJsonParse(raw) {
	if (raw == null) return null;
	if (typeof raw === "object") return raw;
	const s = String(raw).trim();
	if (!s) return null;
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

function normalizeId(v) {
	return String(v || "").trim();
}

function normalizeStr(v) {
	return String(v == null ? "" : v).trim();
}

function normalizeStatus(v) {
	return normalizeStr(v).toLowerCase();
}

function normalizePriority(v) {
	const p = normalizeStr(v).toLowerCase();
	if (p === "critical") return "critical";
	if (p === "high") return "high";
	if (p === "low") return "low";
	return "medium";
}

function normalizeType(v) {
	return normalizeStr(v).toLowerCase();
}

function parseDependenciesFromMissionParams(params) {
	const mp = safeJsonParse(params) || {};
	const dep = mp.dependent_on ?? mp.dependentOn ?? null;
	if (dep == null) return [];
	if (Array.isArray(dep))
		return dep.map((x) => normalizeId(x)).filter(Boolean);
	const s = normalizeId(dep);
	return s ? [s] : [];
}

function computePhase(id, type) {
	const up = normalizeId(id).toUpperCase();
	const t = normalizeType(type);
	if (up.startsWith("INF-")) return 0;
	if (up.startsWith("MKT-")) return 1;
	if (up.startsWith("STO-")) return 2;
	if (up.startsWith("PAY-")) return 2;
	if (up.startsWith("OPS-")) return 3;
	if (t === "infrastructure") return 0;
	if (t === "market_research") return 1;
	if (t === "store_setup") return 2;
	if (t === "financial_setup") return 2;
	if (t === "marketing") return 3;
	if (t === "operations") return 4;
	return 9;
}

export function buildMissionPlan({
	missionDir = path.resolve("data/swarm/missions"),
}) {
	const idxPath = path.join(missionDir, "index.json");
	const idx = safeJsonRead(idxPath);
	const entries = Array.isArray(idx) ? idx : [];
	const missions = [];
	const byId = new Map();

	for (const ent of entries) {
		const file = ent?.file ? path.resolve(ent.file) : null;
		if (!file || !fs.existsSync(file)) continue;
		const m = safeJsonRead(file);
		if (!m) continue;
		const id = normalizeId(m.id || ent?.id);
		if (!id) continue;
		if (byId.has(id)) continue;

		const data = m.data || {};
		const row = data?.row || data;
		const title = normalizeStr(m.title || row?.title || row?.["Mission Title"]);
		const type = normalizeType(row?.type || row?.category || m.channel);
		const status = normalizeStatus(row?.status || m.status || "");
		const priority = normalizePriority(row?.priority || m.priority);
		const missionParams =
			row?.mission_parameters ??
			row?.missionParameters ??
			data?.mission_parameters ??
			null;
		const deps = parseDependenciesFromMissionParams(missionParams);

		const phase = computePhase(id, type);
		const mission = {
			id,
			title,
			type,
			status: status || null,
			priority,
			channel: normalizeType(m.channel || type || "operations"),
			dependencies: deps,
			phase,
			file,
		};
		byId.set(id, mission);
		missions.push(mission);
	}

	for (const m of missions) {
		const missing = [];
		for (const dep of m.dependencies) {
			if (!byId.has(dep)) missing.push(dep);
		}
		m.missing_dependencies = missing;
		m.ready = missing.length === 0;
	}

	missions.sort((a, b) => {
		if (a.phase !== b.phase) return a.phase - b.phase;
		const pr = { critical: 0, high: 1, medium: 2, low: 3 };
		const ap = pr[a.priority] ?? 9;
		const bp = pr[b.priority] ?? 9;
		if (ap !== bp) return ap - bp;
		return a.id.localeCompare(b.id);
	});

	const summary = {
		total: missions.length,
		ready: missions.filter((m) => m.ready).length,
		blocked: missions.filter((m) => !m.ready).length,
	};

	return { at: new Date().toISOString(), summary, missions };
}

export function writeMissionPlan(plan, outPath = "data/swarm/mission-plan.json") {
	const abs = path.resolve(outPath);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, JSON.stringify(plan, null, 2));
	return abs;
}
