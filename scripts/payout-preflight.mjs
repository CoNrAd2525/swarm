import "dotenv/config";

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

function listCsv(name) {
	const v = str(name);
	if (!v) return [];
	return v
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function section(title) {
	console.log(`\n=== ${title} ===`);
}

function row(label, ok, detail = "") {
	const state = ok ? "OK" : "MISSING";
	console.log(`${state.padEnd(8)} ${label}${detail ? `  ${detail}` : ""}`);
	return ok;
}

function warn(msg) {
	console.log(`WARN     ${msg}`);
}

function normalizeNetwork(n) {
	const v = String(n || "").trim().toUpperCase();
	if (!v) return "";
	if (["BSC", "BEP20", "BEP-20"].includes(v)) return "BSC";
	if (["ETH", "ERC20", "ERC-20"].includes(v)) return "ETH";
	if (v === "TRC20") return "TRON";
	return v;
}

const ownerPayPal = str("OWNER_PAYPAL_EMAIL");
const ownerCrypto = str("OWNER_CRYPTO_BEP20") || str("TRUST_WALLET_ADDRESS");

section("Global");
row("SWARM_LIVE", boolEnv("SWARM_LIVE"));
row("FINANCIAL_MODE=LIVE", str("FINANCIAL_MODE").toUpperCase() === "LIVE");

section("PayPal (payouts)");
row("PAYPAL_MODE=live", str("PAYPAL_MODE").toLowerCase() === "live");
row("PAYPAL_CLIENT_ID", has("PAYPAL_CLIENT_ID"));
row("PAYPAL_CLIENT_SECRET", has("PAYPAL_CLIENT_SECRET"));
row("PAYPAL_WEBHOOK_ID", has("PAYPAL_WEBHOOK_ID"));
row("PAYPAL_PPP2_APPROVED", boolEnv("PAYPAL_PPP2_APPROVED"));
row("PAYPAL_PPP2_ENABLE_SEND", boolEnv("PAYPAL_PPP2_ENABLE_SEND"));
row(
	"PAYPAL_LIVE_CONFIRM=I_CONFIRM_PAYPAL_PAYOUT (for one-off send)",
	str("PAYPAL_LIVE_CONFIRM") === "I_CONFIRM_PAYPAL_PAYOUT",
);
row("OWNER_PAYPAL_EMAIL", !!ownerPayPal);
const allowed = listCsv("AUTONOMOUS_ALLOWED_PAYPAL_RECIPIENTS");
if (ownerPayPal && allowed.length > 0 && !allowed.includes(ownerPayPal)) {
	warn("OWNER_PAYPAL_EMAIL not in AUTONOMOUS_ALLOWED_PAYPAL_RECIPIENTS");
}
row("BASE44_ENABLE_PAYOUT_LEDGER_WRITE", boolEnv("BASE44_ENABLE_PAYOUT_LEDGER_WRITE"));
row(
	"BASE44_ENABLE_PAYPAL_PAYOUT_STATUS_WRITE",
	boolEnv("BASE44_ENABLE_PAYPAL_PAYOUT_STATUS_WRITE"),
);

section("Crypto (withdraw/transfer)");
row("OWNER_CRYPTO_BEP20 or TRUST_WALLET_ADDRESS", !!ownerCrypto);
row("CRYPTO_WITHDRAW_ENABLE", boolEnv("CRYPTO_WITHDRAW_ENABLE"));
row(
	"CRYPTO_LIVE_CONFIRM=I_CONFIRM_CRYPTO_SETTLEMENT",
	str("CRYPTO_LIVE_CONFIRM") === "I_CONFIRM_CRYPTO_SETTLEMENT",
);
const cryptoOverrideNetwork = normalizeNetwork(str("CRYPTO_NETWORK"));
if (cryptoOverrideNetwork && cryptoOverrideNetwork !== "BSC") {
	warn(`CRYPTO_NETWORK override forces network=${cryptoOverrideNetwork}`);
}
if (has("CRYPTO_OVERRIDE_AMOUNT_USDT")) {
	warn("CRYPTO_OVERRIDE_AMOUNT_USDT is set (will override ledger amounts)");
}
row("TRUST_WALLET_PRIVATE_KEY or BNB_CHAIN_PRIVATE_KEY", has("TRUST_WALLET_PRIVATE_KEY") || has("BNB_CHAIN_PRIVATE_KEY"));
row("BINANCE_API_KEY", has("BINANCE_API_KEY"));
row("BINANCE_API_SECRET", has("BINANCE_API_SECRET"));
row("BYBIT_API_KEY", has("BYBIT_API_KEY"));
row("BYBIT_API_SECRET", has("BYBIT_API_SECRET"));
row("BITGET_API_KEY", has("BITGET_API_KEY"));
row("BITGET_API_SECRET", has("BITGET_API_SECRET"));
row("BITGET_PASSPHRASE", has("BITGET_PASSPHRASE"));

section("Payoneer (manual export)");
row("PAYONEER_PRQ_TOKEN", has("PAYONEER_PRQ_TOKEN"));
row("OWNER_PAYONEER_EMAIL", has("OWNER_PAYONEER_EMAIL"));
warn("Automated Payoneer API execution is not implemented; exports require manual submission.");

section("Bank wire (manual export)");
row("MOROCCAN_BANK_RIB", has("MOROCCAN_BANK_RIB"));
row("OWNER_BANK_ACCOUNT_NUM", has("OWNER_BANK_ACCOUNT_NUM"));
warn("Automated bank wire execution/reconciliation is not implemented; exports require manual processing.");

section("Stripe (not wired)");
row("STRIPE_SECRET_KEY", has("STRIPE_SECRET_KEY"));
warn("Stripe intake→ledger and payout execution/reconciliation are not implemented in the current flow.");

console.log("\nPreflight completed. No secret values were printed.");
