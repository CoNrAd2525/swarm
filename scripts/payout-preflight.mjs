import "dotenv/config";
import { OwnerSettlementEnforcer } from "../src/policy/owner-settlement.mjs";

function boolEnv(name) {
	const v = process.env[name];
	if (v == null) return false;
	return ["1", "true", "yes", "y", "on"].includes(String(v).toLowerCase());
}

function has(name) {
	return process.env[name] != null && String(process.env[name]).trim() !== "";
}

function str(name) {
	return has(name) ? String(process.env[name]).trim() : "";
}

function section(title) {
	process.stdout.write(`\n=== ${title} ===\n`);
}

function row(label, ok, detail = "") {
	const state = ok ? "OK" : "MISSING";
	process.stdout.write(
		`${state.padEnd(8)} ${label}${detail ? `  ${detail}` : ""}\n`,
	);
	return ok;
}

function info(msg) {
	process.stdout.write(`INFO     ${msg}\n`);
}

function summarizeReasons(reasons) {
	const list = Array.isArray(reasons) ? reasons : [];
	if (list.length === 0) return "";
	return list.join(",");
}

const cfg = OwnerSettlementEnforcer.getPaymentConfiguration();
const routes = Array.from(
	new Set((cfg?.settlement_priority || []).map((r) => String(r).trim()).filter(Boolean)),
);

section("Global");
row("SWARM_LIVE", boolEnv("SWARM_LIVE"));
row("SAFE_MODE (blocks payouts)", boolEnv("SAFE_MODE") || boolEnv("SWARM_SAFE_MODE"));
row("FINANCIAL_MODE=LIVE", str("FINANCIAL_MODE").toUpperCase() === "LIVE");

section("Owner Accounts (presence only)");
row("OWNER_PAYPAL_EMAIL", has("OWNER_PAYPAL_EMAIL") || has("PAYPAL_EMAIL"));
row("OWNER_PAYONEER_EMAIL", has("OWNER_PAYONEER_EMAIL") || has("PAYONEER_EMAIL"));
row("OWNER_WISE_EMAIL", has("OWNER_WISE_EMAIL"));
row("TRUST_WALLET_ADDRESS", has("TRUST_WALLET_ADDRESS") || has("TRUST_WALLET_USDT_ERC20"));
row("OWNER_IBAN", has("OWNER_IBAN") || has("BANK_IBAN") || has("MOROCCAN_BANK_RIB"));
row("OWNER_SWIFT", has("OWNER_SWIFT") || has("BIC") || has("SWIFT"));

section("Route Availability");
if (routes.length === 0) {
	process.stdout.write("WARN     No PAYMENT_ROUTING_PRIORITY routes configured.\n");
} else {
	for (const r of routes) {
		const reasons = OwnerSettlementEnforcer.explainMissingCredentials(r, cfg);
		const ok = reasons.length === 0;
		row(`route:${r}`, ok, ok ? "" : summarizeReasons(reasons));
	}
}

section("Confirmation Pipeline Checks");
row("BASE44 app configured", has("BASE44_APP_ID") && has("BASE44_SERVICE_TOKEN"));
row("PayPal revenue writes enabled", boolEnv("BASE44_ENABLE_REVENUE_FROM_PAYPAL"));
row("Payout ledger writes enabled", boolEnv("BASE44_ENABLE_PAYOUT_LEDGER_WRITE"));
row(
	"PayPal payout status writes enabled",
	boolEnv("BASE44_ENABLE_PAYPAL_PAYOUT_STATUS_WRITE"),
);
row("PayPal webhook configured", has("PAYPAL_WEBHOOK_ID") && has("PAYPAL_CLIENT_ID") && has("PAYPAL_CLIENT_SECRET"));
row("Wise live configured", str("WISE_ENVIRONMENT").toLowerCase() === "live" && has("WISE_API_KEY") && has("WISE_PROFILE_ID"));

section("Execution Reality");
info("PayPal: automated payout execution supported when PPP2 is approved and send is enabled.");
info("Wise: automated transfer execution supported (from Wise balance), but webhook-based confirmation write-back is not wired by default.");
const bankProvider = String(process.env.BANK_WIRE_PROVIDER || "").toUpperCase();
if (bankProvider === "WISE") {
	info("Bank wire: automated execution via Wise (BANK_WIRE_PROVIDER=WISE) when allowlisted and Wise live creds are present.");
} else {
	info("Bank wire: manual wire instructions only unless BANK_WIRE_PROVIDER=WISE is enabled.");
}
info("Payoneer: API route requires provider access; if unavailable, use standard/manual exports.");

process.stdout.write("\nPreflight completed. No secret values were printed.\n");
