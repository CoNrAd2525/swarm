import "dotenv/config";

function str(v) {
	return v == null ? "" : String(v);
}

function safeParseJson(v) {
	if (v == null) return null;
	if (typeof v === "object") return v;
	const s = str(v).trim();
	if (!s) return null;
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

export function normalizeMissionType(v) {
	return str(v).trim().toLowerCase();
}

export function getMissionParametersFromRow(row) {
	const mp =
		row?.mission_parameters ?? row?.missionParameters ?? row?.params ?? null;
	return safeParseJson(mp) ?? null;
}

export function isPhase0Mission({ id, type }) {
	const t = normalizeMissionType(type);
	return (
		String(id || "")
			.trim()
			.toUpperCase() === "INF-001" || t === "infrastructure"
	);
}

export function isRevenueGeneratingMission({ type, missionParameters }) {
	const t = normalizeMissionType(type);
	if (
		[
			"market_research",
			"store_setup",
			"financial_setup",
			"marketing",
			"operations",
		].includes(t)
	)
		return true;
	const task = normalizeMissionType(missionParameters?.task);
	if (
		[
			"source_products",
			"build_store",
			"configure_payouts",
			"generate_content",
			"monitor_and_route",
		].includes(task)
	)
		return true;
	return false;
}

export function ensurePhase0Dependency(
	missionParameters,
	phase0Id = "INF-001",
) {
	const mp =
		missionParameters && typeof missionParameters === "object"
			? { ...missionParameters }
			: {};
	const cur = mp.dependent_on ?? mp.dependentOn ?? null;
	const p0 = String(phase0Id || "INF-001").trim();
	if (!p0) return mp;

	if (cur == null || cur === "") {
		mp.dependent_on = p0;
		return mp;
	}

	if (Array.isArray(cur)) {
		const out = cur.map((x) => String(x).trim()).filter(Boolean);
		if (!out.includes(p0)) out.unshift(p0);
		mp.dependent_on = out;
		return mp;
	}

	const s = String(cur).trim();
	if (!s) {
		mp.dependent_on = p0;
		return mp;
	}
	if (s === p0) {
		mp.dependent_on = s;
		return mp;
	}
	mp.dependent_on = [p0, s];
	return mp;
}

export function applyPhase0ToRow(row, { phase0Id = "INF-001" } = {}) {
	const mp = getMissionParametersFromRow(row);
	if (!mp) return row;
	const type = row?.type ?? row?.category ?? null;
	if (!isRevenueGeneratingMission({ type, missionParameters: mp })) return row;
	if (isPhase0Mission({ id: row?.id, type })) return row;
	const updated = ensurePhase0Dependency(mp, phase0Id);
	return { ...row, mission_parameters: JSON.stringify(updated) };
}
