# Changelog

## [2026-08-12]
- upgrade(workflows): bumped all 18 swarm-worktree-sync workflows to actions/checkout@v5, setup-node@v5, upload-artifact@v5, runtime Node 24 with cache: npm, 3-retry npm ci loop, set -euo pipefail on financial/commit steps, concurrency groups, continue-on-error for operational, AUTOCOMMIT gates
- fix(autocommit): bank-reconcile.yml, changelog-watch.yml, payout-health.yml, generate-now.yml — eliminated `git add -A` completely removed, replaced with explicit per-path whitelist staging, AUTOCOMMIT_ENABLE=false default, --cached --stat diagnostic, ref-name-safe push
- fix(srm): harden push-to-base44.mjs — PII mask on PayPal/RIB/wallet/Payoneer logs, owner-accounts empty-string bypass, BASE44_PUSH_ENABLE dry-run default, recordSuccess arity 1→3 JSONL, mkdirSync recursive, invalidAccounts banner mask, violation list mask
- upgrade(base44): harden run-base44-profile.mjs — mask recipient routes/credentials filename in banner, BASE44_PUSH_ENABLE, builder-wire recipientResults meta mask, delegation to push-to-base44.setDryRun
- upgrade(base44): harden base44-preflight.mjs — env-check-only default, removed broken buildBase44Client call, use shared base44Request live probe when BASE44_PREFLIGHT_LIVE=true, sanitize token messages
- upgrade(base44): harden export-full-base44.mjs — BASE44_EXPORT_LIVE gate, deepMask PII scrub all output, manifest emit, offline-store deepMask parse
- docs(mirrors): MIRRORS_AND_SECURE_CLOUD.md Section 7 August 2026 audit — v5 actions, Node 24, curl DOS guards, docker password-stdin, vercel@41 pin, payout gates, owner-PII script hardening list
- deploy(vercel): vercel-proxy.yml + vercel-static.yml pinned vercel@41, install vercel pin, deploys npx vercel@41 guarded
- upgrade(base44): vercel-proxy vercel-static node24, etl-base44-supabase node18→24
- base44 changelog: BASE44_CHANGELOG.md Version 2026.08.12 — summarizes push/profile/preflight/export entrypoint hardening

## [2026-06-10]
- feat(connectors): Added a shared Base44 connector request utility in `src/util/base44-request.mjs` and refactored `scripts/push-to-base44.mjs` onto the common request path
- feat(webhooks): Hardened `src/wise-webhook-server.mjs` with optional IP allowlisting, persistent event dedupe, captured client IP metadata, and flush-on-shutdown behavior
- feat(backups): Expanded `scripts/backup-project-state.mjs` to snapshot current swarm state, secure-cloud artifacts, docs, and the `apps/realworldcerts-next` frontend workspace
- fix(cloud): Tightened `.github/workflows/backup-mirror.yml` so export/snapshot failures fail closed and sync-health artifacts publish with backup outputs
- fix(sync): `src/swarm/health-monitor.mjs` now fails closed when mirror inventory is missing or empty, preventing false-green secure-cloud status
- fix(frontend): Made the `apps/realworldcerts-next` directory utility modules and test runner more plain-Node friendly by removing internal alias imports from test-targeted modules and enabling Node specifier resolution in the test script
- note(frontend): Local runtime verification still depends on sandbox package-materialization behavior; code diagnostics are clean, but app-local dependency installation remains environment-constrained

## [2026-06-09]
- feat(connectors): Added shared Base44 connector request utility and refactored `scripts/push-to-base44.mjs` to use a common signed request path
- feat(connectors): Hardened `src/wise-webhook-server.mjs` with optional IP allowlisting, persistent dedupe, captured client IP metadata, and graceful dedupe flush on shutdown
- feat(backup): Expanded `scripts/backup-project-state.mjs` to snapshot current swarm state, secure-cloud artifacts, docs, and the new Next.js frontend workspace
- fix(cloud): Tightened `backup-mirror.yml` to fail closed on export/snapshot errors and publish sync-health artifacts alongside finance data
- fix(sync): Mirror health monitoring now fails closed when mirror inventory is missing or empty
- feat(frontend): Added `apps/realworldcerts-next`, a new Next.js 16 + TypeScript + Tailwind light-mode frontend prototype for RealWorldCerts with landing, directory, and listing detail routes
- feat(frontend): Introduced bordered modular app shell, seeded directory data, filterable dashboard UI, and reusable card/badge/panel components inspired by arcX structure with a premium light treatment
- feat(swarm): Added concrete cross-platform sync monitoring via `src/swarm/health-monitor.mjs` and `scripts/swarm-sync-monitor.mjs`, including snapshot output to `data/swarm` and `rank/output/site-data`
- feat(finance): Hardened settlement orchestration with stronger owner directive validation, persistent payout velocity history, and direct Wise-path velocity plus owner checks
- fix(resilience): Replaced no-op retry and unbounded idempotency cache implementations with bounded, reusable resilience primitives
- perf(site): Added rate-limit bucket pruning and cap controls in `src/site-server.mjs` to prevent unbounded in-memory growth
- test(core): Added targeted resilience coverage for retry and idempotent executor behavior
- note(verification): Targeted swarm resilience tests pass and sync monitor runs successfully; manual sandbox constraints still affect the separate `apps/realworldcerts-next` dependency install path
## [2026-03-31]
- feat(security): Added automated secrets scan + rotation checklist and policy status outputs
- feat(payments): Enforced hands-free settlement gating based on security posture and Plaid readiness
- feat(plaid): Added Plaid preflight readiness checks (prod mode + webhook HMAC requirement)
- feat(site): Added interactive classroom landing page and request capture endpoint
- feat(growth): Promoted interactive classroom CTA from auto-generated certification guides
- feat(swarm): Extended revenue swarm reporting with classroom demand metrics (24h + total)
- docs: Added OpenMAIC integration notes with licensing and architecture options

## [2026-03-20]
- feat(swarm): Validated next-level mission dependency graph and surfaced errors in supervisor output
- feat(swarm): Backfilled missing mission index entries when mission files already exist
- test(swarm): Added coverage for idempotent seeding + index backfill
- ops(backups): Refreshed snapshot and doomsday mirror artifacts (local-only; ignored by git)

## [2026-03-14]
- deploy(vercel): Verified vercel.json to serve rank/output via static routes
- ops(backups): Created doomsday zip at backups/doomsday/realworldcerts-site-YYYYMMDD-HHmmss.zip
- ops(mirrors): Prepared local mirrors at mirrors/vercel-public and mirrors/backup-1
- ops(crypto): Generated Bitget instruction files for owner payouts from archive CSV
- site(health): Confirmed robots.txt, sitemap.xml, and hubs live on realworldcerts.com

## [2026-02-25]
- feat(finance): Prepared historical payout artifacts across all rails (Payoneer, Wise, Bank Wire); added per-batch CSVs under settlements/*/historical and a consolidated settlements/payouts_index.json
- feat(scripts): Added generate-secondary-payouts-from-manifests.mjs and paypal-send-owner-payout.mjs to automate multi-rail preparation and micro confirmation
- chore(base44): Coordinated Base44 deployment via push-to-base44.mjs; deployment logs saved under audits/
- docs: Noted PRQ token/session expiry behavior for Payoneer confirmations

## [2026-02-12]
- **SECURITY CRITICAL:** Implemented strict validation to prevent unauthorized payments after detecting suspicious Barclays IBAN GB66BARC20958787123933 (Leicester, UK) in payment documents.
- **feat(security):** Added emergency payment lock mechanism with `EMERGENCY_PAYMENT_LOCK` environment variable to block all payments during security incidents.
- **feat(security):** Created `validateAuthorizedOwnerAccounts()` function to ensure only Younes Tsouli and authorized IBANs receive payments.
- **feat(security):** Implemented strict "NO PLACEHOLDER DATA" policy - all payment functions now fail with critical errors if owner configuration is missing.
- **feat(security):** Added comprehensive audit scripts (`emergency-payment-audit.js`, `quick-payment-audit.js`) to detect unauthorized payment files.
- **feat(finance):** Added multi-rail settlement support for Wise, GooglePay, Plaid.com, and CRYPTO in `auto_settlement_daemon.js`.
- **feat(finance):** Implemented CSV generation functions for manual payout processing across all payment rails.
- **feat(finance):** Enhanced `.gitignore` to exclude generated settlement files and directories.
- **feat(finance):** Updated environment variable configuration for owner payment credentials and thresholds.
- **chore:** Force-pushed changes to remote repository and updated Base44 service configurations.

## [2026-02-10]
- **feat(finance):** Added `wise` and `googlepay` as owner payment methods.
- **feat(finance):** Updated `owner-directive.mjs` and `owner-settlement.mjs` to include the new payment methods.

## [2026-02-01]
- Added hourly Autonomous Scheduler (agents registration, headhunter discovery, autonomous tick, readiness ping, catalogue build, truth marker write, auto-commit/push).
- Integrated headhunter discovery into supervisor cycle for continuous agent onboarding.
- Added local .env loader and optional NaCl secretbox decrypt for encrypted env.
- Introduced Org Broadcast workflow to dispatch agentic_tick across organization repos.
- Generated catalogue_master.pdf with fallback to placeholder when assets are missing.
- Maintained safety rails for owner routing and bunker mode kill switch; no secrets committed.

## [Unreleased] - 2026-01-19

### Autonomous Finance & Enforcement
- **feat(finance):** Implemented `ReplenishmentProtocol` to autonomously maintain a $50k Reserve Balance.
- **feat(finance):** Implemented `ExternalPayerEnforcer` to identify overdue payers and block new work ("No Pay, No Delivery").
- **feat(finance):** Implemented `PaymentAssuranceProtocol` to gate MissionOrchestrator based on payer standing.
- **feat(finance):** Executed "Sovereign Sweep" transferring ~$27.7k from Platform Wallets (Binance, Kraken, PayPal) to OWNER.
- **feat(finance):** Updated `ExternalPayerEnforcer` to target specific entities: Nimbus Analytics, BluePeak Consulting, Acme Software.

### Autonomous Self-Healing
- **feat(autonomy):** Added `SelfHealer` module to detect and fix missing module/script errors automatically.
- **feat(autonomy):** Integrated Healer, Enforcer, and Replenisher into `autonomous-daemon` main loop.
- **fix(scripts):** Created missing reconciliation scripts (`recover-psp-proofs`, `reconcile-amount-mismatches`, `emergency-settlement`).

### Infrastructure
- **chore:** Updated `autonomous-daemon.mjs` to run all new autonomous modules in a continuous loop.
