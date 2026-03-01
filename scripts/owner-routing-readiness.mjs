import fs from "node:fs";
import path from "node:path";
function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
function exists(p){ try{ return fs.existsSync(p); }catch{ return false; } }
function readEnv(){
  return {
    SWARM_LIVE: process.env.SWARM_LIVE,
    BASE44_ENABLE_PAYOUT_LEDGER_WRITE: process.env.BASE44_ENABLE_PAYOUT_LEDGER_WRITE,
    BASE44_ENABLE_PAYPAL_PAYOUT_STATUS_WRITE: process.env.BASE44_ENABLE_PAYPAL_PAYOUT_STATUS_WRITE,
    BASE44_EVIDENCE_RELAXED: process.env.BASE44_EVIDENCE_RELAXED || process.env.EVIDENCE_RELAXED || process.env.BASE44_RELAX_HARD_EVIDENCE,
    BUNKER_MODE: process.env.BUNKER_MODE,
    PAYPAL_OWNER_EMAIL: process.env.PAYPAL_OWNER_EMAIL,
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  };
}
function statusFlag(v){ return v===true || v==="true" || v==="1"; }
function readiness(){
  const env = readEnv();
  const paypalGateway = exists(path.resolve("src","financial","gateways","PayPalGateway.mjs"));
  const killSwitch = statusFlag(env.BUNKER_MODE);
  const ownerEmailOk = !!env.PAYPAL_OWNER_EMAIL && env.PAYPAL_OWNER_EMAIL.includes("@");
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
  return {
    timestamp: new Date().toISOString(),
    env: {
      SWARM_LIVE: swarmLive,
      BASE44_ENABLE_PAYOUT_LEDGER_WRITE: payoutsWriteOk,
      BASE44_ENABLE_PAYPAL_PAYOUT_STATUS_WRITE: payoutStatusWriteOk,
      BASE44_EVIDENCE_RELAXED: evidenceRelaxed,
      BUNKER_MODE: killSwitch,
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
    overall_ready: ownerEmailOk && swarmLive && payoutsWriteOk && !killSwitch,
  };
}
const outPath = path.resolve("dist_rwc","site-data","payments_readiness.json");
ensureDir(path.dirname(outPath));
const r = readiness();
fs.writeFileSync(outPath, JSON.stringify(r,null,2), "utf8");
console.log(JSON.stringify({ ok:true, out: outPath, overall_ready: r.overall_ready }));
