import "dotenv/config";
import { parseArgs } from "../src/utils/cli.mjs";
import { getPaymentConfiguration, missingCredentials } from "../src/policy/owner-settlement.mjs";
import { getEffectiveRoutes } from "../src/policy/route-optimizer.mjs";

function bool(v) {
	return String(v || "false").toLowerCase() === "true";
}

async function main() {
	const args = parseArgs(process.argv);
	const priority = args.priority ?? args["priority"] ?? null;
	if (priority != null && String(priority).trim()) {
		process.env.PAYMENT_ROUTING_PRIORITY = String(priority).trim();
	}
	const amount = Number(args.amount ?? 850);
	const currency = String(args.currency || "USD").toUpperCase();

	const cfg = getPaymentConfiguration();
	const live = bool(process.env.SWARM_LIVE);
	const safe = bool(process.env.SAFE_MODE) || bool(process.env.SWARM_SAFE_MODE);

	const perRoute = cfg.settlement_priority.map((r) => ({
		route: r,
		missing: missingCredentials(r, cfg),
	}));

	const effective = getEffectiveRoutes(amount, currency);

	process.stdout.write(
		JSON.stringify(
			{
				ok: true,
				live,
				safe_mode: safe,
				payment_routing_priority: cfg.settlement_priority,
				per_route: perRoute,
				effective_routes: effective,
			},
			null,
			2,
		) + "\n",
	);
}

main();
