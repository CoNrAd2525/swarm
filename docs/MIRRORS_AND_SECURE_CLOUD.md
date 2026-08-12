# Mirrors + Secure Cloud (flagged GitHub account)

If the `CoNrAd2525` account is flagged and cannot run GitHub Actions, the fix is to run the automation from a clean mirror in a separate, unflagged GitHub account.

This gives you:
- a full repo mirror that stays up-to-date
- GitHub Actions running in the clean account
- secrets stored only in the clean account
- optional cloud backups (Supabase bucket)

## 1) Create a clean mirror repository

Create a repo under an unflagged GitHub account, e.g. `clean-account/swarm-mirror`.

Recommended settings:
- private repo
- Actions enabled

## 2) Populate it (one-time bootstrap)

Do a one-time push of `CoNrAd2525/swarm` into the clean mirror repository.

Avoid embedding tokens in remote URLs. Use GitHub Desktop or SSH.

## 3) Keep it synced automatically (mirror sync workflow)

The mirror repository should run:
- [mirror-sync-upstream.yml](../.github/workflows/mirror-sync-upstream.yml)

This workflow fetches `CoNrAd2525/swarm` and force-updates the mirror branches/tags to match.

Configure repo variables in the mirror repo:
- `UPSTREAM_REPO` = `CoNrAd2525/swarm`
- `UPSTREAM_BRANCHES` = `master release`
- `UPSTREAM_TAGS` = `true`

Health check (recommended):
- enable [mirror-health.yml](../.github/workflows/mirror-health.yml) in the mirror repo to continuously verify SHAs match upstream and to provide an artifact report

## 4) Run finance + settlement hands-free in the mirror

In the mirror repo, add secrets (do not store them in the flagged repo):
- `BASE44_SERVICE_TOKEN`
- `BASE44_APP_ID`
- `BASE44_API_URL` (optional)
- `BASE44_SERVER_URL` (optional)
- `BASE44_REVENUE_ENTITY` (optional)
- `BASE44_PAYOUT_ENTITY` (optional)
- `PLAID_ENV`
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_OWNER_ACCESS_TOKEN` (or `PLAID_ACCESS_TOKEN`)
- `SECONDARY_CONTACT_EMAIL` (optional)

Then run:
- [finance-diagnose.yml](../.github/workflows/finance-diagnose.yml) (manual + scheduled)
- [bank-reconcile.yml](../.github/workflows/bank-reconcile.yml) (manual + scheduled)

Owner settlement stays guarded:
- it only runs when reconcile reports confirmed incomings > 0

## 5) Secure cloud backups (optional)

Run:
- [backup-mirror.yml](../.github/workflows/backup-mirror.yml)

Current hardening in this repo:
- the backup workflow now fails closed instead of masking export/snapshot failures
- the workflow emits a swarm sync-health snapshot before artifact upload
- artifact coverage now includes `data/swarm`, `data/finance`, `data/mirror-sites.json`, and `rank/output/site-data`
- local snapshots include current frontend app sources plus swarm state and generated site-data, not only legacy static paths

Store Supabase credentials only in the mirror repo:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (optional)
- `MIRROR_SUPABASE_BUCKET`

## 6) If you need email escalation

If GitHub account recovery is pending, keep the mirror repo as the active "control plane" until the flagged account is reinstated.

## 7) August 2026 Audit: Workflow + SRM Hardening

Applied to mirror repo `CoNrAd2525/swarm` → propagate these changes into any clean mirror before enabling Actions:

### Workflow Hardening (required in every clean mirror)
- **Actions family upgraded to v5, Node 24**: all 18 workflows now use `actions/checkout@v5`, `actions/setup-node@v5` (with `cache: npm`), `actions/upload-artifact@v5` (with `if-no-files-found: ignore` on operational reports). Runtime pinned to Node `"24"` across every scheduled + deploy job.
- **Deterministic install loop (3 retries)**: every `setup-node` step followed by `n=0; until [ $n -ge 3 ]; do npm ci --no-audit --no-fund 2>/dev/null && break; n=$((n+1)); sleep 5; done`. When no lockfile (watchdogs) fallback to `npm i --no-audit --no-fund`.
- **Bash hardening**: every commit/payout/export run block uses `set -euo pipefail`. Operational-only steps guarded with `|| echo "…failed but continuing"`.
- **HIGH-RISK payout gates** (on `bank-reconcile.yml`, `payout-health.yml`): feature-gated env var defaults `AUTOCOMMIT_ENABLE=false`, `BANK_RECONCILE_ENABLE=false`. Allowlist CSV + numeric check, audit_only on dispatch.
- **All 4x `git add -A` eliminated** — bank-reconcile, changelog-watch, payout-health, generate-now use explicit path whitelists `ALLOWED=(...)` + per-path staging loop, guarded by `git diff --cached --quiet`.
- **Curl DOS guard** — backup-mirror Supabase/object-storage upload curl, doomsday-backup presigned URL upload curl, and mirror-sync smokes add `--connect-timeout 10/15 --max-time 60/300 -fSL` to avoid hanging on network blips.
- **SSH + Docker leak closure** (applicable to mirror's site deploy copies): `echo "$TOKEN" | docker login ghcr.io -u user --password-stdin` instead of `-p $TOKEN` (CWE-214). `.env` file contents never echoed — render with brace-group redirect and only `wc -l .env`.
- **Vercel pinning**: `vercel@41` supply-chain pin. Deploy uses `npx --yes vercel@41` so a global install isn't the only path. Pre-deploy build step guarded by `|| echo`.
- **Concurrency groups** on every scheduled job and deploy job. Cancel-in-progress: `false` for finance / ops / reports (don't interrupt money work), `true` for changelog-watch and doomsday.
- **SRM fallback path** (for copies of api-pipeline-watchdog.yml in the mirror): 2-level script resolution — first `./scripts/X`, then fallback `./Nouveau dossier (3)/Nouveau-dossier-3-/scripts/X` with `mkdir -p "$(dirname …)"` before write.

### Secure-Cloud PII Hardening
Apply these before loading owner secrets into the mirror repo:
- [push-to-base44.mjs](../scripts/push-to-base44.mjs) — PII masked (PayPal email, IBAN/RIB, crypto wallet, Payoneer), dry-run default (`BASE44_PUSH_ENABLE=true` required for live), `audits/` JSONL + `recordSuccess(msg, details, scope)` audit log.
- [run-base44-profile.mjs](../scripts/run-base44-profile.mjs) — Builder+ payout executor recipient names/routes masked in stdout banner, credentials file basename only, routes recorded in Base44 PayoutRecipient through upsert path, banner indicates dry_run state before delegating to push-to-base44.
- [base44-preflight.mjs](../scripts/base44-preflight.mjs) — env-only check default (`BASE44_PREFLIGHT_LIVE=true` required for live probe); sanitized error messages (no raw tokens).
- [export-full-base44.mjs](../scripts/export-full-base44.mjs) — dry-run default (set `BASE44_EXPORT_LIVE=true` to fetch); all writes PII-scrubbed via `deepMask()` (email/iban/wallet/beneficiary/recipient keys → masked strings) and manifests written.
- [owner-payout.yml](../.github/workflows/owner-payout.yml) — PayPal recipients allowlist case-insensitive, awk positive-amount check, logs via `jq -c 'walk(if type=="string" and length>48 then …)'` scrubbing, commit only `out/ out/payouts` paths.
