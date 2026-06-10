import crypto from "node:crypto";

function trimSlash(value) {
	return String(value || "").replace(/\/+$/, "");
}

function joinUrl(base, endpoint) {
	const left = trimSlash(base);
	const right = String(endpoint || "").replace(/^\/+/, "");
	return `${left}/${right}`;
}

export function getBase44ConnectorConfig(env = process.env) {
	const apiUrl = String(env.BASE44_API_URL || "").trim();
	const serverUrl = String(env.BASE44_SERVER_URL || "").trim();
	const baseUrl = apiUrl
		? trimSlash(apiUrl)
		: serverUrl
			? joinUrl(trimSlash(serverUrl), "api")
			: "https://api.base44.com/v1";

	return {
		baseUrl,
		appId: String(env.BASE44_APP_ID || env.DEFAULT_BASE44_APP_ID || "").trim(),
		serviceToken: String(env.BASE44_SERVICE_TOKEN || "").trim(),
		secret: String(env.BASE44_API_SECRET || "").trim(),
		timeoutMs: Number(env.BASE44_TIMEOUT || "30000"),
	};
}

export function buildBase44Headers({
	body = null,
	headers = {},
	config = getBase44ConnectorConfig(),
	clientName = "SwarmConnector/2026.06",
} = {}) {
	const merged = {
		"Content-Type": "application/json",
		"X-Client": clientName,
		...headers,
	};

	if (config.serviceToken) {
		merged.Authorization = `Bearer ${config.serviceToken}`;
		merged["X-Service-Token"] = config.serviceToken;
	}

	if (config.secret) {
		const timestamp = Date.now().toString();
		const payload = body == null ? "" : JSON.stringify(body);
		const signature = crypto
			.createHmac("sha256", config.secret)
			.update(timestamp + payload)
			.digest("hex");
		merged["X-B44-Signature"] = signature;
		merged["X-B44-Timestamp"] = timestamp;
	}

	return merged;
}

export async function base44Request(endpoint, options = {}) {
	const {
		method = "GET",
		body = null,
		headers = {},
		config = getBase44ConnectorConfig(),
		includeAppPath = false,
		clientName,
	} = options;

	let baseUrl = trimSlash(config.baseUrl);
	if (includeAppPath) {
		if (!config.appId) {
			throw new Error("BASE44_APP_ID_REQUIRED");
		}
		baseUrl = joinUrl(baseUrl, `apps/${config.appId}`);
	}

	const url = joinUrl(baseUrl, endpoint);
	const signal =
		typeof AbortSignal !== "undefined" && Number(config.timeoutMs) > 0
			? AbortSignal.timeout(Number(config.timeoutMs))
			: undefined;

	const response = await fetch(url, {
		method,
		headers: buildBase44Headers({
			body,
			headers,
			config,
			clientName,
		}),
		body: body == null ? undefined : JSON.stringify(body),
		signal,
	});

	const text = await response.text();
	let payload = null;
	try {
		payload = text ? JSON.parse(text) : null;
	} catch {
		payload = text;
	}

	if (!response.ok) {
		throw new Error(
			`BASE44_REQUEST_FAILED:${response.status}:${typeof payload === "string" ? payload : JSON.stringify(payload)}`,
		);
	}

	return payload;
}
