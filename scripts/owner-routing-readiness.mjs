import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
	OwnerSettlementEnforcer,
} from "../src/policy/owner-settlement.mjs";

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function loadEnv() {
  for (const file of [".env.local", ".env", ".env.deploy", ".env.storage"]) {
    const resolved = path.resolve(process.cwd(), file);
    if (fs.existsSync(resolved)) dotenv.config({ path: resolved, override: false });
  }
  if (!process.env.OWNER_PAYPAL_EMAIL && process.env.PAYPAL_OWNER_EMAIL) process.env.OWNER_PAYPAL_EMAIL = process.env.PAYPAL_OWNER_EMAIL;
  if (!process.env.PAYPAL_OWNER_EMAIL && process.env.OWNER_PAYPAL_EMAIL) process.env.PAYPAL_OWNER_EMAIL = process.env.OWNER_PAYPAL_EMAIL;
}
function readEnv() {
  return {
    SWARM_LIVE: process.env.SWARM_LIVE,
    BASE44_ENABLE_PAYOUT_LEDGER_WRITE: process.env.BASE44_ENABLE_PAYOUT_LEDGER_WRITE,
    BASE44_ENABLE_PAYPAL_PAYOUT_STATUS_WRITE: process.env.BASE44_ENABLE_PAYPAL_PAYOUT_STATUS_WRITE,
    BASE44_EVIDENCE_RELAXED: process.env.BASE44_EVIDENCE_RELAXED || process.env.EVIDENCE_RELAXED || process.env.BASE44_RELAX_HARD_EVIDENCE,
    BUNKER_MODE: process.env.BUNKER_MODE,
    OWNER_PAYPAL_EMAIL: process.env.OWNER_PAYPAL_EMAIL,
    PAYPAL_OWNER_EMAIL: process.env.PAYPAL_OWNER_EMAIL,
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  };
}
function statusFlag(v) { return v === true || v === "true" || v === "1"; }
function maskDestination(v) {
	const s = String(v || "").trim();
	if (!s) return "";
	if (s.includes("@")) {
		const [a, b] = s.split("@");
		const left = a.length <= 2 ? a : `${a.slice(0, 2)}...`;
		return `${left}@${b}`;
	}
	if (s.startsWith("0x") && s.length > 10) return `${s.slice(0, 6)}...${s.slice(-4)}`;
	if (s.length > 10) return `${s.slice(0, 4)}...${s.slice(-4)}`;
	return s;
}
function readiness() {
  loadEnv();
  const env = readEnv();
  const paypalGateway = exists(path.resolve("src", "financial", "gateways", "PayPalGateway.mjs"));
  const killSwitch = statusFlag(env.BUNKER_MODE);
  const ownerPaypal = String(env.OWNER_PAYPAL_EMAIL || env.PAYPAL_OWNER_EMAIL || "").trim();
  const ownerEmailOk = ownerPaypal.includes("@");
  const payoutsWriteOk = statusFlag(env.BASE44_ENABLE_PAYOUT_LEDGER_WRITE);
  const payoutStatusWriteOk = statusFlag(env.BASE44_ENABLE_PAYPAL_PAYOUT_STATUS_WRITE);
  const swarmLive = statusFlag(env.SWARM_LIVE);
  const clientCredsPresent = !!env.PAYPAL_CLIENT_ID && !!env.PAYPAL_CLIENT_SECRET;
  const evidenceRelaxed = statusFlag(env.BASE44_EVIDENCE_RELAXED);
  const directRails = {
    paypal: ownerEmailOk && paypalGateway && !killSwitch,
    crypto_usdt_erc20: true,
    payoneer: true,
    bank_wire: true,
  };
  const cfg = OwnerSettlementEnforcer.getPaymentConfiguration();
  const bankReasons = OwnerSettlementEnforcer.explainMissingCredentials("bank_transfer", cfg);
  const cryptoReasons = OwnerSettlementEnforcer.explainMissingCredentials("crypto", cfg);
  const vaultReasons = OwnerSettlementEnforcer.explainMissingCredentials("smart_contract_owner", cfg);
  const bankDest = OwnerSettlementEnforcer.getOwnerAccountForType("bank_transfer");
  const salaryDest = OwnerSettlementEnforcer.getOwnerAccountForCategory("salary");
  const debtDest = OwnerSettlementEnforcer.getOwnerAccountForCategory("debt");
  const cryptoDest = OwnerSettlementEnforcer.getOwnerAccountForType("crypto");
  const vaultContract = OwnerSettlementEnforcer.getOwnerAccountForType("smart_contract_owner");
  const railCards = [
    {
      id: "bank_wire",
      label: "Bank Wire (ACH/SWIFT)",
      route: "bank_transfer",
      ready: bankReasons.length === 0 && !killSwitch,
      destination_masked: maskDestination(bankDest),
      provider: String(cfg?.creds?.bank?.provider || "").toUpperCase() || null,
      missing: bankReasons,
    },
    {
      id: "crypto_payouts",
      label: "Crypto Payouts",
      route: "crypto",
      ready: cryptoReasons.length === 0 && !killSwitch,
      destination_masked: maskDestination(cryptoDest),
      provider_priority: process.env.CRYPTO_PROVIDER_PRIORITY || null,
      missing: cryptoReasons,
    },
    {
      id: "autonomous_fund_execution",
      label: "Autonomous Fund Execution",
      route: "smart_contract_owner",
      ready: vaultReasons.length === 0 && !killSwitch,
      contract_masked: maskDestination(vaultContract),
      chain: String(cfg?.creds?.smart_contract_owner?.chain || "").toUpperCase() || null,
      missing: vaultReasons,
    },
  ];
  return {
    timestamp: new Date().toISOString(),
    env: {
      SWARM_LIVE: swarmLive,
      BASE44_ENABLE_PAYOUT_LEDGER_WRITE: payoutsWriteOk,
      BASE44_ENABLE_PAYPAL_PAYOUT_STATUS_WRITE: payoutStatusWriteOk,
      BASE44_EVIDENCE_RELAXED: evidenceRelaxed,
      BUNKER_MODE: killSwitch,
      OWNER_PAYPAL_EMAIL: ownerEmailOk,
      PAYPAL_OWNER_EMAIL: ownerEmailOk,
      PAYPAL_CLIENT_ID: !!env.PAYPAL_CLIENT_ID,
      PAYPAL_CLIENT_SECRET: !!env.PAYPAL_CLIENT_SECRET,
    },
    components: {
      paypal_gateway_present: paypalGateway,
    },
    gates: {
      payment_kill_switch: killSwitch,
      owner_routing_verified: ownerEmailOk,
      client_creds_present: clientCredsPresent,
    },
    direct_rails_ready: directRails,
    rail_cards: railCards,
    routing_rules: {
      personal_salary_pct: 0.1,
      personal_salary_schedule: "weekly",
      personal_salary_default_rail: "BANK_WIRE",
      salary_bank_rib_configured: !!salaryDest,
      debt_bank_rib_configured: !!debtDest,
      salary_bank_rib_masked: maskDestination(salaryDest),
      debt_bank_rib_masked: maskDestination(debtDest),
    },
    overall_ready: ownerEmailOk && swarmLive && payoutsWriteOk && !killSwitch,
  };
}
const outPath = path.resolve("rank", "output", "site-data", "payments_readiness.json");
ensureDir(path.dirname(outPath));
const r = readiness();
fs.writeFileSync(outPath, JSON.stringify(r, null, 2), "utf8");
console.log(JSON.stringify({ ok: true, out: outPath, overall_ready: r.overall_ready }));
