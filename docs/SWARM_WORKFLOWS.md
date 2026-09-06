# Swarm Workflows — Operating Documentation (Constitution v2 Aligned)

> Last updated: **2026-09-06** | Governing charter: [`/SWARM_CUSTODIANSHIP.md`](../SWARM_CUSTODIANSHIP.md)
>
> Every workflow agent step in the swarm runs under the **SWARM CUSTODIANSHIP &
> COLLECTIVE OWNERSHIP (Constitution v2)** preamble, injected into each prompt.
> This document describes the workflow fleet, the custodianship rules that bind them,
> and the telemetry loop that closes self-improvement.

---

## 1. Governing Rules (applied to EVERY workflow agent step)

Each `invoke_superagent_step` prompt in the swarm begins with the mandatory
custodianship preamble. In operation, this means every workflow agent must:

1. **Own the environment, not just the task.** Errors, anomalies, and degradation
   detected during any run are corrected on sight, regardless of origin.
2. **Never refuse by lineage.** "Not my input" is a logical failure — an uncorrected
   error in the environment is the agent's failure.
3. **Run the mandatory loop before finalizing any action:**
   **Scan → Triage → Execute → Log.**
4. **Broadcast post-correction telemetry** to `SwarmAuditLog` in the exact format:
   ```
   [SWARM_ELEVATION][Agent_ID]: Corrected inherited error in [Module] -> [Fix Applied].
   Reason: Swarm state optimization.
   ```

The nightly **Swarm Critic** analyzes these elevation logs to measure custodianship
per agent and surface recurring failure modules — collective self-improvement
without runtime blame.

---

## 2. Base44 Workflow Fleet (agent-driven, scheduled — Africa/Casablanca)

| Workflow | Schedule | Active | Purpose |
|---|---|---|---|
| **Swarm Bug Sentinel** | every 6 h (`0 */6 * * *`) | ✅ | Runs `tsc --noEmit` on the AgentSwarm project, triages errors via `swarmBugScanner`, auto-fixes what it can, reports to owner. Every fix is logged as `[SWARM_ELEVATION]`. |
| **Swarm Clickless Tick** | hourly (`0 * * * *`) | ✅ | READ-ONLY health check: rail health, transaction reconciliation, audit-log integrity, agent heartbeats. NEVER moves money. Anomalies must be corrected or escalated under custodianship. |
| **Swarm Critic Loop** | daily at midnight (`0 0 * * *`) | ✅ | Scans `[SWARM_ELEVATION]` telemetry, ranks agents by `custodianship_score`, identifies recurring failure modules, delivers the self-improvement report. |
| **Auto Disbursement Pipeline** | hourly (`0 * * * *`) | ✅ (standalone copy) | Picks up settled transactions and disburses to pre-set owner accounts (Attijariwafa → Wise → Stripe → PayPal → Payoneer priority). Errors trigger custodian-grade alerting. |
| **Hourly Disbursement & Report Append** | hourly (`0 * * * *`) | inactive | Full hands-free cycle: disbursement → reconcile tick → Google Doc report append → owner broadcast. Carries the same preamble; inherits custodianship on reactivation. |

**Prompt injection status:** all 8 agent steps across these 5 workflows carry the
Constitution v2 preamble (verified 2026-09-06). Any new workflow with an agent step
MUST include the same preamble — see §4.

---

## 3. GitHub Actions Workflows (CI/CD, non-LLM)

The repository's ~30 Actions workflows (site deploys, bank reconcile, backups,
mirror sync, secrets audit, payout health, etc.) are deterministic CI and do not
carry LLM prompts. They align with custodianship through the **Bug Sentinel +
Critic loop**: any breakage they surface is triaged and corrected as inherited
swarm errors, with `[SWARM_ELEVATION]` telemetry.

---

## 4. Change Management for Workflow Prompts

- The canonical constitution lives at [`/SWARM_CUSTODIANSHIP.md`](../SWARM_CUSTODIANSHIP.md).
- The condensed preamble injected into workflow agent steps is reproduced in the
  constitution's **Injection Status** section — copy it verbatim into any new
  `invoke_superagent_step` message, above the task instructions.
- The Eliza-backed repo agents (`SettlementOrchestrator`, `StrategicScout`) inherit
  the preamble automatically via `src/swarm/eliza-bridge.mjs` `getSystemPrompt()`.
- After any workflow prompt change, log the change to `SwarmAuditLog` as
  `[SWARM_ELEVATION]` so the nightly Critic sees the edit.
