import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

function requestsPath(cwd = process.cwd()) {
	return path.join(cwd, "data", "classroom", "requests.json");
}

function lockPath(cwd = process.cwd()) {
	return path.join(cwd, "data", "locks", "classroom_requests.lock");
}

async function withFileLock(
	fn,
	{ cwd = process.cwd(), timeoutMs = 8000 } = {},
) {
	const p = lockPath(cwd);
	await fs.mkdir(path.dirname(p), { recursive: true });
	const start = Date.now();

	while (true) {
		try {
			const handle = await fs.open(p, "wx");
			try {
				await handle.writeFile(
					JSON.stringify({ pid: process.pid, at: Date.now() }),
					"utf8",
				);
			} catch {
				// ignore
			} finally {
				await handle.close();
			}
			try {
				return await fn();
			} finally {
				try {
					await fs.rm(p, { force: true });
				} catch {
					// ignore
				}
			}
		} catch {
			try {
				const st = await fs.stat(p);
				if (Date.now() - st.mtimeMs > 30_000) {
					await fs.rm(p, { force: true });
				}
			} catch {
				// ignore
			}
			if (Date.now() - start > timeoutMs) {
				throw new Error("classroom_requests_lock_timeout");
			}
			await sleep(80);
		}
	}
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
	return await withFileLock(
		async () => {
			const p = requestsPath(cwd);
			const dir = path.dirname(p);
			await fs.mkdir(dir, { recursive: true });

			const requests = await readClassroomRequests({ cwd });
			requests.push(record);
			const trimmed =
				requests.length > max
					? requests.slice(requests.length - max)
					: requests;

			const tmp = `${p}.tmp`;
			await fs.writeFile(
				tmp,
				JSON.stringify({ requests: trimmed }, null, 2),
				"utf8",
			);
			await fs.rename(tmp, p);
			return { ok: true, path: p, total: trimmed.length };
		},
		{ cwd },
	);
}

export async function getClassroomRequestMetrics({
	cwd = process.cwd(),
	windowMs = 24 * 60 * 60 * 1000,
} = {}) {
	const requests = await readClassroomRequests({ cwd });
	const cutoff = Date.now() - windowMs;
	const lastWindow = requests.filter(
		(r) => Number(r?.at || 0) >= cutoff,
	).length;
	return { total: requests.length, last_window: lastWindow };
}
