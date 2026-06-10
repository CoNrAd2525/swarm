import test from "node:test";
import assert from "node:assert/strict";

import { IPAllowlist } from "../src/security/ip-allowlist.mjs";
import {
	base44Request,
	getBase44ConnectorConfig,
} from "../src/util/base44-request.mjs";

test("IPAllowlist accepts exact and CIDR IPv4 entries", () => {
	const allowlist = new IPAllowlist("127.0.0.1,10.0.0.0/8");

	assert.equal(allowlist.isAllowed("127.0.0.1"), true);
	assert.equal(allowlist.isAllowed("10.42.1.9"), true);
	assert.equal(allowlist.isAllowed("192.168.1.10"), false);
});

test("getBase44ConnectorConfig resolves api base url consistently", () => {
	const config = getBase44ConnectorConfig({
		BASE44_SERVER_URL: "https://base44.example.com/",
		BASE44_APP_ID: "app_123",
		BASE44_SERVICE_TOKEN: "token_abc",
	});

	assert.equal(config.baseUrl, "https://base44.example.com/api");
	assert.equal(config.appId, "app_123");
	assert.equal(config.serviceToken, "token_abc");
});

test("base44Request builds app-scoped request and parses JSON", async () => {
	const originalFetch = globalThis.fetch;
	try {
		let seenUrl = null;
		globalThis.fetch = async (url, options) => {
			seenUrl = String(url);
			assert.equal(options.method, "POST");
			assert.match(options.headers.Authorization, /^Bearer /);
			return {
				ok: true,
				status: 200,
				text: async () => JSON.stringify({ ok: true }),
			};
		};

		const result = await base44Request("/entities", {
			method: "POST",
			body: { hello: "world" },
			includeAppPath: true,
			config: {
				baseUrl: "https://api.base44.test/v1",
				appId: "app_42",
				serviceToken: "svc_token",
				secret: "",
				timeoutMs: 1000,
			},
		});

		assert.deepEqual(result, { ok: true });
		assert.equal(seenUrl, "https://api.base44.test/v1/apps/app_42/entities");
	} finally {
		globalThis.fetch = originalFetch;
	}
});
