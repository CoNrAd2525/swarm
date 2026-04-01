import fs from "node:fs/promises";
import path from "node:path";

function requestsPath(cwd = process.cwd()) {
	return path.join(cwd, "data", "classroom", "requests.json");
}

export async function readClassroomRequests({ cwd = process.cwd() } = {}) {
	try {
		const p = requestsPath(cwd);
		const raw = await fs.readFile(p, "utf8");
		const doc = JSON.parse(raw);
		return Array.isArray(doc?.requests) ? doc.requests : [];
	} catch {
		return [];
	}
}

export async function appendClassroomRequest(
	record,
	{ cwd = process.cwd(), max = 2000 } = {},
) {
	const p = requestsPath(cwd);
	const dir = path.dirname(p);
	await fs.mkdir(dir, { recursive: true });

	const requests = await readClassroomRequests({ cwd });
	requests.push(record);
	const trimmed =
		requests.length > max ? requests.slice(requests.length - max) : requests;

	const tmp = `${p}.tmp`;
	await fs.writeFile(tmp, JSON.stringify({ requests: trimmed }, null, 2), "utf8");
	await fs.rename(tmp, p);
	return { ok: true, path: p, total: trimmed.length };
}

export async function getClassroomRequestMetrics({
	cwd = process.cwd(),
	windowMs = 24 * 60 * 60 * 1000,
} = {}) {
	const requests = await readClassroomRequests({ cwd });
	const cutoff = Date.now() - windowMs;
	const lastWindow = requests.filter((r) => Number(r?.at || 0) >= cutoff).length;
	return { total: requests.length, last_window: lastWindow };
}

