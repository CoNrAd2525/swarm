import "dotenv/config";
import { getPayPalAccessToken } from "../src/paypal-api.mjs";
import { parseArgs } from "../src/utils/cli.mjs";
import { loadCredsFromCredsTxt } from "../src/utils/creds-txt-loader.mjs";

async function main() {
	const args = parseArgs(process.argv);
	if (args["load-creds"] !== false && args.loadCreds !== false) {
		const override =
			args["override-creds"] === true || args.overrideCreds === true;
		loadCredsFromCredsTxt({ override });
	}
	const timeoutMsRaw = args["timeout-ms"] ?? args.timeoutMs ?? null;
	const timeoutMs = timeoutMsRaw != null ? Number(timeoutMsRaw) : null;
	if (timeoutMs != null && Number.isFinite(timeoutMs) && timeoutMs >= 1000) {
		process.env.PAYPAL_HTTP_TIMEOUT_MS = String(Math.floor(timeoutMs));
	}
	const baseUrl = args["base-url"] ?? args.baseUrl ?? null;
	if (baseUrl != null && String(baseUrl).trim()) {
		process.env.PAYPAL_API_BASE_URL = String(baseUrl).trim();
	}
	const swarmLiveRaw = args["swarm-live"] ?? args.swarmLive ?? null;
	if (swarmLiveRaw != null) {
		const v = String(swarmLiveRaw).toLowerCase();
		process.env.SWARM_LIVE = ["1", "true", "yes", "y", "on"].includes(v)
			? "true"
			: "false";
	}

	const started = Date.now();
	try {
		await getPayPalAccessToken();
		const tookMs = Date.now() - started;
		process.stdout.write(
			JSON.stringify(
				{
					ok: true,
					timeout_ms: Number(process.env.PAYPAL_HTTP_TIMEOUT_MS ?? 0) || null,
					took_ms: tookMs,
				},
				null,
				2,
			) + "\n",
		);
	} catch (e) {
		const tookMs = Date.now() - started;
		process.stdout.write(
			JSON.stringify(
				{
					ok: false,
					error: e?.message || String(e),
					timeout_ms: Number(process.env.PAYPAL_HTTP_TIMEOUT_MS ?? 0) || null,
					took_ms: tookMs,
				},
				null,
				2,
			) + "\n",
		);
		process.exitCode = 1;
	}
}

main();
