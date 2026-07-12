import "../src/load-env.mjs";
import fs from "node:fs";
import path from "node:path";
import {
	base44Request,
	getBase44ConnectorConfig,
} from "../src/util/base44-request.mjs";

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
	const strict = str("STRICT_PREFLIGHT").toLowerCase() === "true";
	const config = getBase44ConnectorConfig(process.env);
	const authToken = config.serviceToken || config.apiKey;
	const probeEntity = str("BASE44_PREFLIGHT_ENTITY") || "Agent";

	const payload = {
		ok: true,
		at: new Date().toISOString(),
		env: {
			BASE44_APP_ID: Boolean(str("BASE44_APP_ID")),
			DEFAULT_BASE44_APP_ID: Boolean(str("DEFAULT_BASE44_APP_ID")),
			BASE44_SERVICE_TOKEN: Boolean(config.serviceToken),
			BASE44_API_KEY: Boolean(config.apiKey),
			BASE44_API_URL: Boolean(str("BASE44_API_URL")),
		},
		server: {
			base_url: safeUrl(config.baseUrl),
			app_id: config.appId || null,
			app_scoped_base: Boolean(config.appScopedBase),
		},
		token: tokenMeta(authToken),
		probe: {
			ok: null,
			entity: probeEntity,
			status: null,
			message: null,
			reason: null,
		},
	};

	if (!authToken) {
		payload.ok = false;
		payload.probe.ok = false;
		payload.probe.reason = "missing_env";
	} else {
		try {
			const result = await base44Request(`/entities/${probeEntity}?limit=1`, {
				method: "GET",
				config,
				includeAppPath: true,
				clientName: "SwarmBase44Preflight/2026.07",
			});
			payload.probe.ok = true;
			payload.probe.result_shape = Array.isArray(result)
				? "array"
				: result && typeof result === "object"
					? "object"
					: typeof result;
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
