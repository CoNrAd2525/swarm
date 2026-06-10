import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createDedupeStore } from "./dedupe-store.mjs";
import { IPAllowlist } from "./security/ip-allowlist.mjs";
import { parseArgs } from "./utils/cli.mjs";

function readRawBody(req, { limitBytes }) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > limitBytes) {
				reject(new Error("Request body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

function json(res, status, data) {
	const body = JSON.stringify(data);
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(body),
	});
	res.end(body);
}

function getPathname(req) {
	try {
		const raw = req?.url ?? "/";
		const u = new URL(raw, "http://localhost");
		const p = u.pathname || "/";
		if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
		return p;
	} catch {
		return "/";
	}
}

function ensureLogDir() {
	const dir = path.resolve("out", "wise");
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function appendEventLog(evt) {
	const dir = ensureLogDir();
	const f = path.join(dir, "webhooks.jsonl");
	fs.appendFileSync(f, `${JSON.stringify(evt)}\n`, "utf8");
}

function getClientIp(req) {
	return (
		String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
		req.socket?.remoteAddress ||
		""
	);
}

function getEventId(headers, parsedBody) {
	return String(
		headers["x-event-id"] ||
			headers["x-request-id"] ||
			headers["x-hook-id"] ||
			parsedBody?.event_id ||
			parsedBody?.id ||
			"",
	).trim();
}

function buildServer({
	port = 5056,
	pathPrefix = "/callback",
	allowlist = new IPAllowlist(process.env.WISE_WEBHOOK_ALLOWED_IPS || ""),
	dedupeStore = null,
} = {}) {
	return http.createServer(async (req, res) => {
		const method = String(req.method || "GET").toUpperCase();
		const p = getPathname(req);
		if (method !== "POST" || p !== pathPrefix) {
			json(res, 404, { ok: false });
			return;
		}

		const clientIp = getClientIp(req);
		if (!allowlist.isAllowed(clientIp)) {
			json(res, 403, { ok: false, error: "forbidden_origin" });
			return;
		}

		let raw = "";
		try {
			raw = await readRawBody(req, { limitBytes: 1024 * 1024 });
		} catch {
			json(res, 413, { ok: false });
			return;
		}
		let parsed = null;
		try {
			parsed = JSON.parse(raw);
		} catch {
			parsed = { raw };
		}
		const hdrs = {};
		for (const k of Object.keys(req.headers || {})) {
			hdrs[k.toLowerCase()] = req.headers[k];
		}
		const eventId = getEventId(hdrs, parsed);
		if (dedupeStore && eventId && dedupeStore.isRecentlyDone(eventId)) {
			json(res, 200, { ok: true, duplicate: true, event_id: eventId });
			return;
		}
		const evt = {
			received_at: new Date().toISOString(),
			client_ip: clientIp,
			event_id: eventId || null,
			headers: hdrs,
			body: parsed,
		};
		appendEventLog(evt);
		if (dedupeStore && eventId) {
			dedupeStore.markDone(eventId);
		}
		json(res, 200, { ok: true });
	});
}

async function main() {
	const args = parseArgs(process.argv);
	const port = Number(args.port ?? process.env.WISE_WEBHOOK_PORT ?? "5056");
	const pathPrefix =
		String(args.path ?? process.env.WISE_WEBHOOK_PATH ?? "/callback") ||
		"/callback";
	const allowlist = new IPAllowlist(
		process.env.WISE_WEBHOOK_ALLOWED_IPS || process.env.WEBHOOK_ALLOWED_IPS || "",
	);
	const dedupeStore = createDedupeStore({
		filePath: path.resolve("data/wise/webhook-dedupe.json"),
		ttlMs: Number(process.env.WISE_WEBHOOK_DEDUPE_TTL_MS || "604800000"),
		maxEntries: Number(process.env.WISE_WEBHOOK_DEDUPE_MAX_ENTRIES || "10000"),
		flushIntervalMs: Number(process.env.WISE_WEBHOOK_DEDUPE_FLUSH_MS || "5000"),
	});
	await dedupeStore.load().catch(() => {});
	dedupeStore.start();
	const flushAndExit = async (code) => {
		try {
			await dedupeStore.flush();
		} catch {}
		dedupeStore.stop();
		process.exit(code);
	};
	process.on("SIGINT", () => {
		flushAndExit(0).catch(() => process.exit(0));
	});
	process.on("SIGTERM", () => {
		flushAndExit(0).catch(() => process.exit(0));
	});
	const server = buildServer({ port, pathPrefix, allowlist, dedupeStore });
	server.listen(port, () => {
		process.stdout.write(
			JSON.stringify({
				ok: true,
				listening: `http://localhost:${port}${pathPrefix}`,
			}) + "\n",
		);
	});
}

main().catch((e) => {
	process.stderr.write(String(e?.message ?? e) + "\n");
	process.exitCode = 1;
});
