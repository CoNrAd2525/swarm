import "dotenv/config";
import { PlaidReadinessCheck } from "../src/plaid/ReadinessCheck.mjs";

async function run() {
	const check = new PlaidReadinessCheck({});
	const res = await check.run();
	if (!res.status.ok) {
		console.log(`[Plaid] Missing: ${res.status.missing.join(", ")}`);
		process.exitCode = 2;
	} else {
		console.log(`[Plaid] Ready, mode=${res.status.mode}`);
		if (res.status.mode !== "production") process.exitCode = 3;
	}
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
