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


---

## 5. Per-Workflow Runbooks

Every workflow below runs in the Base44 workflow engine (CNCF SWF v1.0), timezone
`Africa/Casablanca`. Agent steps (`invoke_superagent_step`) cost credits and always
begin with the Constitution v2 preamble. Debug any run via the workflow run log,
`get_backend_function_logs` for the named function, and `SwarmAuditLog` entries.

### 5.1 Swarm Bug Sentinel — `0 */6 * * *` (every 6h)

| # | Task | Type | Detail |
|---|------|------|--------|
| 1 | `scan_bugs` | agent | Runs `npx tsc --noEmit 2>&1` on the AgentSwarm project (fallback: `tsc-errors.txt`), parses errors into `[{file,line,column,message}]`, POSTs to backend fn `swarmBugScanner`, returns triaged fix plan or `status: idle`. |
| 2 | `check_results` | switch | `.scan_bugs.status == "triaged"` → `notify_bugs`; `== "idle"` → end; otherwise → `alert_error`. |
| 3 | `notify_bugs` | agent | Applies `fix_instruction` per auto-fixable bug, reports totals to owner, broadcasts each fix as `[SWARM_ELEVATION]`. |
| 4 | `alert_error` | agent | Brief owner alert on scanner failure. |

**Failure modes:** tsc unavailable → falls back to stale `tsc-errors.txt` (verify file
freshness before trusting an "idle"); `swarmBugScanner` API error → `alert_error`;
recurring same error → check tsconfig target (ES2022 baseline, commit `251fea8`).

### 5.2 Swarm Clickless Tick — `0 * * * *` (hourly)

| # | Task | Type | Detail |
|---|------|------|--------|
| 1 | `run_tick` | backend fn `swarmClicklessTick` | READ-ONLY phases: `rail-health`, `tx-reconcile`, `audit-integrity`, agent heartbeats. Returns `{status, phases[], uid}`. NEVER moves money. |
| 2 | `check_status` | switch | `status == "ok"` → end (silent); `"errors"`/`"warning"` → `report`; catch-all → `report`. |
| 3 | `report` | agent | Concise phase-by-phase health report to owner. |

**Failure modes:** a tick exception lands on the catch-all → `report` (never silent
failure); degraded rail → `warning` status; heartbeat gaps → check SwarmAgent records.

### 5.3 Swarm Critic Loop — `0 0 * * *` (daily, midnight)

| # | Task | Type | Detail |
|---|------|------|--------|
| 1 | `scan_audit` | backend fn `swarmCritic` | Scans `SwarmAuditLog` for `[SWARM_ELEVATION]` entries; computes per-agent `custodianship_score`, `inherited_error_drops`, recurring failure modules. |
| 2 | `notify_critic` | agent | Delivers the self-improvement report: best/worst custodians, module patterns. No blame — pattern analysis. |

**Failure modes:** zero elevation entries → report should state custodianship loop is
quiet (agents fixing nothing = no inherited errors — healthy); stale scores → check
`last_heartbeat` on SwarmAgent records.

### 5.4 Auto Disbursement Pipeline — `0 * * * *` (hourly)

| # | Task | Type | Detail |
|---|------|------|--------|
| 1 | `run_disbursement` | backend fn `autoDisbursePipeline` | Picks up settled transactions, disburses to pre-set owner accounts. Rail priority: **Attijariwafa → Wise → Stripe → PayPal → Payoneer**. |
| 2 | `check_results` | switch | `"completed"` → `notify_owner`; `"idle"` → end (nothing settled); catch-all → `alert_error`. |
| 3 | `notify_owner` | agent | Tx count, total amount, rail breakdown, fees. |
| 4 | `alert_error` | agent | Concise error alert + audit log pointer. |

**Failure modes:** `idle` is normal (no settled funds); rail config missing → error
alert (never blocks other rails); ledger mismatch → check SwarmLedger chain hashes.

### 5.5 Hourly Disbursement & Report Append — `0 * * * *` (inactive; supersedes 5.4 when active)

| # | Task | Type | Detail |
|---|------|------|--------|
| 1 | `disburse` | backend fn `autoDisbursePipeline` | Same as 5.4 step 1. |
| 2 | `tick` | backend fn `swarmClicklessTick` | Read-only reconcile of what step 1 did. |
| 3 | `append_report` | backend fn `appendDisbursementReport` | Appends cycle report to the Swarm Project Google Doc (googledrive `drive.file` scope). Args: `cycle_uid` = tick uid, cycle summary, disburse/tick results. |
| 4 | `broadcast` | agent | 2–3 line hands-free digest via `broadcast_message` — rail health, reconcile, audit-24h, doc-append status. Never asks for action. |

**Failure modes:** Google Doc append failure → broadcast still fires (report loss is
non-fatal, flagged in digest); both 5.4 and 5.5 active would double-run the pipeline —
keep only one active at a time.

### 5.6 Debugging quick reference

1. **Run log** — inspect step-by-step output of any failed run (workflow run history).
2. **Function logs** — `get_backend_function_logs(<function_name>)` for the exact fn.
3. **Telemetry** — `SwarmAuditLog` filtered on `event_type: SWARM_ELEVATION`.
4. **Heartbeats** — `SwarmAgent` records for agent-level health.
5. **Money trail** — `SwarmTransaction` → `SwarmLedger` (immutable hash chain).

Any error found during debugging is an inherited swarm error: fix it on sight and
log `[SWARM_ELEVATION]` per the charter.

---

## 6. Payout Safety Principles (post-L2-audit, 2026-09-07)

Binding on every money-adjacent agent step. These come from the L2 audit's PayPal
evidence gap and the public-repo sanitization incident.

1. **INSTRUCTION ≠ SUBMISSION ≠ ACCEPTANCE ≠ SETTLEMENT ≠ RECONCILIATION.** A payout
   instruction on disk (e.g. `WAITING_MANUAL_EXECUTION`) is not money sent. Never
   treat artifacts as payment records.
2. **UNKNOWN is a safe state.** If a provider call's outcome is ambiguous (network
   died, crash, no provider reference), NEVER auto-retry. Quarantine, then resolve
   via provider reconciliation (`getPayment` / statement evidence) first. Blind
   retry = duplicate money.
3. **Evidence gap → `RECONCILIATION_REQUIRED`, not payout.** Missing provider
   reference bodies (cf. PayPal 2026-08-26→28 history gap) mean hold + human
   review. Never re-pay because evidence is missing.
4. **Safe-by-default flags stay off.** `SWARM_LIVE=false`, `FINANCIAL_MODE=SAFE`,
   `RECOVERY_FORCE_EXECUTE=false` until reconciliation gaps are closed. No agent
   step may set these.
5. **Destinations are IDs, not literals.** Agents reference
   `owner_account_id` / env placeholders; full RIBs/IBANs/wallets live in the
   secret manager, never in Git (see BASE44_CHANGELOG 2026.09.07).
6. **No new autonomous payout dispatch** until the ledger-first payout state
   machine (payouts + payout_events, immutable, idempotent) exists. The current
   hourly pipeline runs only against dry-run-guarded backend functions.

### 6.1 Sanitization incident quick reference (2026-09-07)

Public repo exposed destinations in ~270 tracked files (RIBs, PayPal email, USDT
wallet, a Base44 API key, `.env.migration` with US bank + routing + TOTP secret).
HEAD is sanitized (commit `0b52856`); **Git history still contains everything**
until a `git filter-repo` rewrite is run — owner decision required.
