import { fileURLToPath } from "node:url";
import { buildMissionPlan } from "../src/swarm/mission-planner.mjs";
import { MissionOrchestrator } from "../src/swarm/mission-orchestrator.mjs";

function str(name) {
  const v = process.env[name];
  return v == null ? "" : String(v).trim();
}

function deployStatuses() {
  const raw = str("SWARM_DEPLOY_STATUSES") || "pending";
  const list = raw
    .split(/[,\s]+/g)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return new Set(list.length ? list : ["pending"]);
}

function normalizeStatus(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  return s || null;
}

async function main() {
  try {
    const plan = buildMissionPlan({});
    const allowed = deployStatuses();
    const ready = Array.isArray(plan?.missions)
      ? plan.missions.filter(
          (m) =>
            m?.ready === true &&
            allowed.has(normalizeStatus(m?.status) || "pending"),
        )
      : [];

    const nowIso = new Date().toISOString();

    const proposals = ready.map((m, idx) => ({
      id: `mission:${m.id}`,
      type: "VELOCITY_OPPORTUNITY",
      source_mission_id: m.id,
      title: m.title,
      channel: m.channel,
      priority: m.priority,
      created_at: nowIso,
      idx,
    }));

    if (proposals.length === 0) {
      process.stdout.write(
        `${JSON.stringify({ ok: true, skipped: true, reason: "no_ready_missions" })}\n`,
      );
      return;
    }

    const orchestrator = new MissionOrchestrator();
    const results = await orchestrator.processProposals(proposals);

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        proposals: proposals.length,
        executed: results.length,
        at: nowIso,
      })}\n`,
    );
  } catch (e) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: e?.message ?? String(e) })}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
