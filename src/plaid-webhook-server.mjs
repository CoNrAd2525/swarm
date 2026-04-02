import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { parseArgs } from "./utils/cli.mjs";

function safeReadJson(file) {
	try {
		const raw = fs.readFileSync(file, "utf8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
function safeWriteJson(file, data) {
	try {
		const tmp = `${file}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
		fs.renameSync(tmp, file);
		return true;
	} catch {
		return false;
	}
}

function readRawBody(req, limitBytes) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > limitBytes) {
				reject(new Error("too_large"));
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
		return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
	} catch {
		return "/";
	}
}

function ensureLogDir() {
	const dir = path.resolve("out", "plaid");
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function appendEventLog(evt) {
	const dir = ensureLogDir();
	const f = path.join(dir, "webhooks.jsonl");
	fs.appendFileSync(f, `${JSON.stringify(evt)}\n`, "utf8");
}
function appendLedgerUpdate(evt) {
	try {
		const file = path.resolve("data", "ledger_updates.json");
		const existing = safeReadJson(file);
		const arr = Array.isArray(existing) ? existing : [];
		const body = evt?.body || {};
		const raw = evt?.raw || "";
		const secret =
			String(process.env.PLAID_WEBHOOK_HMAC_SECRET || "").trim() ||
			String(process.env.PLAID_WEBHOOK_SIGNATURE_SECRET || "").trim();
		let signatureValid = null;
		if (secret) {
			try {
				const calc = crypto
					.createHmac("sha256", secret)
					.update(raw, "utf8")
					.digest("hex");
				const hdrs = evt?.headers || {};
				const provided = String(
					hdrs["plaid-signature"] || hdrs["x-plaid-signature"] || "",
				).trim();
				if (provided) {
					const a = Buffer.from(calc, "utf8");
					const b = Buffer.from(provided, "utf8");
					signatureValid =
						a.length === b.length && crypto.timingSafeEqual(a, b);
				} else {
					signatureValid = false;
				}
			} catch {
				signatureValid = false;
			}
		}
		const summary = {
			timestamp: new Date().toISOString(),
			action: "plaid_webhook",
			webhook_type: body.webhook_type ?? null,
			webhook_code: body.webhook_code ?? null,
			item_id: body.item_id ?? null,
			account_id: body.account_id ?? null,
			amount: body.amount ?? null,
			currency: body.iso_currency_code ?? body.currency ?? null,
			status: body.transfer?.status ?? body.status ?? null,
			evidence: {
				headers: evt?.headers ?? {},
				signature_valid: signatureValid,
			},
		};
		arr.push(summary);
		safeWriteJson(file, arr);
	} catch {
		/* noop */
	}
}

function verifyWebhook(raw, headers) {
	const secret =
		String(process.env.PLAID_WEBHOOK_HMAC_SECRET || "").trim() ||
		String(process.env.PLAID_WEBHOOK_SIGNATURE_SECRET || "").trim();
	if (!secret) return { ok: true };
	let provided = "";
	try {
		provided = String(
			headers["plaid-signature"] || headers["x-plaid-signature"] || "",
		).trim();
	} catch {
		provided = "";
	}
	if (!provided) return { ok: false, error: "missing_signature" };
	try {
		const calc = crypto
			.createHmac("sha256", secret)
			.update(raw, "utf8")
			.digest("hex");
		const a = Buffer.from(calc, "utf8");
		const b = Buffer.from(provided, "utf8");
		if (a.length !== b.length) return { ok: false, error: "bad_signature" };
		return crypto.timingSafeEqual(a, b)
			? { ok: true }
			: { ok: false, error: "bad_signature" };
	} catch {
		return { ok: false, error: "bad_signature" };
	}
}

function buildServer(_port, pathPrefix) {
	return http.createServer(async (req, res) => {
		const method = String(req.method || "GET").toUpperCase();
		const p = getPathname(req);
		if (method !== "POST" || p !== pathPrefix) {
			json(res, 404, { ok: false });
			return;
		}
		let raw = "";
		try {
			raw = await readRawBody(req, 1024 * 1024);
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
		const verified = verifyWebhook(raw, hdrs);
		if (!verified.ok) {
			json(res, 401, { ok: false, error: verified.error || "unauthorized" });
			return;
		}
		const evt = {
			received_at: new Date().toISOString(),
			headers: hdrs,
			body: parsed,
			raw,
		};
		appendEventLog(evt);
		appendLedgerUpdate(evt);
		json(res, 200, { ok: true });
	});
}

async function main() {
	const args = parseArgs(process.argv);
	const port = Number(args.port ?? process.env.PLAID_WEBHOOK_PORT ?? "5057");
	const pathPrefix =
		String(args.path ?? process.env.PLAID_WEBHOOK_PATH ?? "/plaid/webhook") ||
		"/plaid/webhook";
	const server = buildServer(port, pathPrefix);
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
