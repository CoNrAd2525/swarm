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

function sanitizeMsg(text) {
	const s = String(text || "");
	if (!s) return s;
	const m = s.replace(/[a-f0-9]{24,}/g, (m) => `${m.slice(0, 4)}…${m.slice(-4)}`);
	return m;
}

function resolveServerUrl() {
	const base = str("BASE44_SERVER_URL") || str("BASE44_API_URL") || "";
	return base || null;
}

async function probeOnce({ appId, serviceToken, apiUrl }) {
	const config = getBase44ConnectorConfig({
		BASE44_APP_ID: appId,
		BASE44_SERVICE_TOKEN: serviceToken,
		BASE44_API_URL: apiUrl,
	});
	const res = await base44Request("/entities/PayoutBatch", {
		method: "GET",
		config,
		includeAppPath: true,
		clientName: "PreflightProbe/2026.08",
		query: { limit: 1, order_by: "-created_date" },
	});
	return { ok: true, res };
}

async function run() {
	const appId =
		str("BASE44_APP_ID") ||
		str("DEFAULT_BASE44_APP_ID") ||
		"689afeabf1db9c30efe0bd7e";
	const serviceToken = str("BASE44_SERVICE_TOKEN");
	const apiUrl = str("BASE44_API_URL");
	const strict = str("STRICT_PREFLIGHT").toLowerCase() === "true";
	const dryProbeOnly = process.env.BASE44_PREFLIGHT_LIVE !== "true";

	const payload = {
		ok: true,
		at: new Date().toISOString(),
		mode: dryProbeOnly ? "env_check_only" : "live_probe",
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
	} else if (dryProbeOnly) {
		payload.probe.ok = true;
		payload.probe.reason = "skipped_live_probe_set_BASE44_PREFLIGHT_LIVE_true";
	} else {
		try {
			await probeOnce({ appId, serviceToken, apiUrl });
			payload.probe.ok = true;
		} catch (e) {
			payload.ok = false;
			payload.probe.ok = false;
			payload.probe.status = Number.isFinite(e?.status) ? e.status : (Number.isFinite(e?.response?.status) ? e.response.status : null);
			payload.probe.message = sanitizeMsg(e?.message || String(e));
			payload.probe.reason = sanitizeMsg(
				e?.data?.extra_data?.reason || e?.data?.reason || (e?.response?.data ? String(e.response.data).slice(0, 200) : null) || null,
			);
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
