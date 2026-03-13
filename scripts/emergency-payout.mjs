import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { ExternalGatewayManager } from "../src/finance/ExternalGatewayManager.mjs";
import { StorageManager } from "../src/storage/StorageManager.mjs";
import { OwnerSettlementEnforcer } from "../src/policy/owner-settlement.mjs";
import { PrivacyMasker } from "../src/util/privacy-masker.mjs";
import { withRetry } from "../src/core/retry.mjs";

class AuditLogger {
  constructor() {
    this.dir = path.join(process.cwd(), "logs", "emergency");
    fs.mkdirSync(this.dir, { recursive: true });
  }
  log(event, id, oldState, newState, actor, details) {
    const line = {
      ts: new Date().toISOString(),
      event,
      id,
      actor,
      oldState,
      newState,
      details,
    };
    const file = path.join(this.dir, `${new Date().toISOString().slice(0,10)}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(line) + "\n");
    console.log(`[AUDIT] ${event}`, details || "");
  }
}

class SimpleExecutor {
  constructor() {
    this.map = new Map();
  }
  async execute(key, fn) {
    if (this.map.has(key)) return this.map.get(key);
    const res = await fn();
    this.map.set(key, res);
    return res;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const k = a.replace(/^--/, "");
      const v = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      out[k] = v;
    }
  }
  return out;
}

function buildRecipientItems({ amount, currency, destination, note }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("invalid_amount");
  return [
    {
      amount: amt,
      currency: currency || "USD",
      recipient_email: destination, // will be used per-route appropriately
      recipient_address: destination,
      note: note || `Emergency payout ${new Date().toISOString()}`,
    },
  ];
}

async function main() {
  const args = parseArgs();
  const amount = args.amount || process.env.EMERGENCY_PAYOUT_AMOUNT;
  const currency = args.currency || process.env.EMERGENCY_PAYOUT_CURRENCY || "USD";
  const destination =
    args.to ||
    args.destination ||
    process.env.EMERGENCY_PAYOUT_DESTINATION ||
    process.env.OWNER_CRYPTO_BEP20 ||
    process.env.PAYPAL_RECEIVER_EMAIL;
  const routeOverride = args.route || process.env.EMERGENCY_PAYOUT_ROUTE;
  const idempotencyKey =
    args.key ||
    process.env.EMERGENCY_PAYOUT_KEY ||
    `emergency_${Date.now()}`;

  if (!amount || !destination) {
    console.error("Usage: node scripts/emergency-payout.mjs --amount 100 --currency USDT --to alice@example.com [--route paypal|crypto|bank_transfer|mpc|safe]");
    process.exit(1);
  }

  const storage = new StorageManager();
  const audit = new AuditLogger();
  const exec = new SimpleExecutor();
  const egm = new ExternalGatewayManager(storage, audit, exec);

  const items = buildRecipientItems({
    amount,
    currency,
    destination,
    note: args.note,
  });

  const cfg = OwnerSettlementEnforcer.getPaymentConfiguration();
  const allowed = cfg.settlement_priority.slice();
  const chosenRoute =
    routeOverride && allowed.includes(routeOverride)
      ? routeOverride
      : null;

  const payoutBatchId = `EMERGENCY_${Date.now()}`;
  let prepared = null;

  if (chosenRoute) {
    if (chosenRoute === "paypal") {
      prepared = await egm.initiatePayPalPayout(payoutBatchId, items, idempotencyKey, "Emergency");
    } else if (chosenRoute === "bank_transfer") {
      prepared = await egm.initiateBankWireTransfer(payoutBatchId, items, idempotencyKey, "Emergency");
    } else if (chosenRoute === "crypto") {
      prepared = await egm.initiateCryptoTransfer(payoutBatchId, items, idempotencyKey, "Emergency");
    } else if (chosenRoute === "smart_contract_owner") {
      prepared = await egm.initiateAutoSettlement(payoutBatchId, items, idempotencyKey, "Emergency");
    } else {
      prepared = await egm.initiateAutoSettlement(payoutBatchId, items, idempotencyKey, "Emergency");
    }
  } else {
    prepared = await egm.initiateAutoSettlement(payoutBatchId, items, idempotencyKey, "Emergency");
  }

  const masked = {
    destination: PrivacyMasker.maskUnknown(destination),
    amount: Number(amount),
    currency: currency,
    route: chosenRoute || "auto",
  };
  audit.log("EMERGENCY_PAYOUT_PREPARED", payoutBatchId, null, prepared, "Emergency", masked);

  const routeAttempted = prepared?.route_attempted || chosenRoute || "auto";
  const broadcast = await egm.broadcastSettlement(routeAttempted, prepared, items, "Emergency");
  audit.log("EMERGENCY_PAYOUT_BROADCAST", payoutBatchId, null, broadcast, "Emergency", { routeAttempted });

  console.log(JSON.stringify({ prepared, broadcast }, null, 2));
}

main().catch((e) => {
  console.error("EMERGENCY_PAYOUT_FAILED", e?.message || String(e));
  process.exit(1);
});
