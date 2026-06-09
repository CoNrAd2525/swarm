import "../src/load-env.mjs";
import fs from "node:fs";
import path from "node:path";
import {
	buildBase44Client,
	ensureBase44UserAuth,
	resolveServerUrl,
} from "../src/base44-client.mjs";

function str(name) {
	const v = process.env[name];
	return v == null ? "" : String(v).trim();
}

function safeUrl(u) {
	const s = String(u || "").trim();
	if (!s) return null;
	try {
		const x = new URL(s);
		return { origin: x.origin, pathname: x.pathname || "/" };
	} catch {
		return { raw: s };
	}
}

function tokenMeta(raw) {
	const t = String(raw || "").trim();
	const parts = t.split(".");
	const looksJwt = parts.length === 3 && parts.every((p) => p.length > 0);
	const looksHex = /^[a-f0-9]+$/i.test(t) && t.length >= 24;
	return {
		present: Boolean(t),
		length: t.length,
		looks_jwt: looksJwt,
		looks_hex: looksHex,
	};
}

function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeJson(file, payload) {
	ensureDir(path.dirname(file));
	fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	return file;
}

async function run() {
	const appId =
		str("BASE44_APP_ID") ||
		str("DEFAULT_BASE44_APP_ID") ||
		"689afeabf1db9c30efe0bd7e";
	const serviceToken = str("BASE44_SERVICE_TOKEN");
	const apiUrl = str("BASE44_API_URL");
	const strict = str("STRICT_PREFLIGHT").toLowerCase() === "true";

	const payload = {
		ok: true,
		at: new Date().toISOString(),
		env: {
			BASE44_APP_ID: Boolean(str("BASE44_APP_ID")),
			DEFAULT_BASE44_APP_ID: Boolean(str("DEFAULT_BASE44_APP_ID")),
			BASE44_SERVICE_TOKEN: Boolean(serviceToken),
			BASE44_API_URL: Boolean(apiUrl),
		},
		server: {
			resolved_server_url: safeUrl(resolveServerUrl()),
			base44_api_url: safeUrl(apiUrl),
		},
		token: tokenMeta(serviceToken),
		probe: {
			ok: null,
			status: null,
			message: null,
			reason: null,
		},
	};

	if (!serviceToken) {
		payload.ok = false;
		payload.probe.ok = false;
		payload.probe.reason = "missing_env";
	} else {
		try {
			const client = buildBase44Client();
			await ensureBase44UserAuth(client).catch(() => {});
			await client.entities.PayoutBatch.list("-created_date", 1, 0);
			payload.probe.ok = true;
		} catch (e) {
			payload.ok = false;
			payload.probe.ok = false;
			payload.probe.status = Number.isFinite(e?.status) ? e.status : null;
			payload.probe.message = e?.message || String(e);
			payload.probe.reason =
				e?.data?.extra_data?.reason || e?.data?.reason || null;
		}
	}

	try {
		await fs.promises.mkdir("logs", { recursive: true });
		await fs.promises.writeFile(
			"logs/base44-preflight.json",
			JSON.stringify(payload, null, 2),
		);
	} catch {}

	const reportFile = writeJson(
		path.resolve("exports", "reports", "base44_preflight_last.json"),
		payload,
	);
	process.stdout.write(
		`${JSON.stringify({ ...payload, report: reportFile }, null, 2)}\n`,
	);
	if (strict && payload.probe.ok === false) process.exitCode = 2;
}

run().catch((e) => {
	process.stderr.write(`${e?.message || String(e)}\n`);
	process.exit(1);
});
