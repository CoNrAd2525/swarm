import { fileURLToPath } from "node:url";
import { buildMissionPlan } from "../src/swarm/mission-planner.mjs";
import { MissionOrchestrator } from "../src/swarm/mission-orchestrator.mjs";

async function main() {
  try {
    const plan = buildMissionPlan({});
    const ready = Array.isArray(plan?.missions)
      ? plan.missions.filter((m) => m?.ready === true)
      : [];

    const nowIso = new Date().toISOString();
    const ts = Date.now();

    const proposals = ready.map((m, idx) => ({
      id: `${m.id}-${ts}-${idx}`,
      type: "VELOCITY_OPPORTUNITY",
      source_mission_id: m.id,
      title: m.title,
      channel: m.channel,
      priority: m.priority,
      created_at: nowIso,
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
