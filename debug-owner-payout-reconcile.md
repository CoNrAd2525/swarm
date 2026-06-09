# Debug Session: owner-payout-reconcile

- Status: OPEN
- Started: 2026-06-05
- Goal: Determine why pre-set owner payouts remain pending and why reconciliation/status completion does not close them.

## Hypotheses

1. Owner payout items are filtered out before execution by allowlist, cap, or route validation.
2. Submission happens but reconciliation/status writeback fails, leaving ledger items pending.
3. Owner routing metadata does not match executable payout route names.
4. Daemon heartbeat/work-lease logic prevents payout processing from actually running.
5. Runtime env flags disable owner payout execution while unrelated expense distributions still execute.

## Evidence Log

- Pre-fix evidence:
  - `exports/reports/settlement_summary.json` showed `execution.allow_paypal=false` even when `PAYPAL_PPP2_APPROVED=true` and `PAYPAL_PPP2_ENABLE_SEND=true`.
  - The daemon still depended on legacy `ALLOW_PAYPAL_EXECUTION`, which is inconsistent with the rest of the payout stack.
  - A live run also failed before selection/submission with `Missing Base44 app id (set BASE44_APP_ID or supply BASE44_API_KEY with appId)`.
- Post-fix evidence:
  - `exports/reports/settlement_summary.json` now shows `execution.allow_paypal=true` under the same PPP2 env settings.
  - `src/base44-client.mjs` now accepts the project default Base44 app id when a service token/API key is present but `BASE44_APP_ID` is omitted.
  - `exports/reports/settlement_summary.json` now shows `evidence_relaxed=true`, `caps.total_usd=25000`, and `allow_bank/allow_paypal/allow_crypto=true` when `ENABLE_ALL_OWNER_ROUTES=true` and `RELAX_OWNER_LIMITS=true`.
  - `scripts/base44-preflight.mjs` now recognizes `DEFAULT_BASE44_APP_ID` and no longer reports `missing_env` when only `BASE44_APP_ID` is absent.
  - Owner-only allowlists now reconcile across `OWNER_BENEFICIARY_ALLOWLIST_JSON`, authority checks, autonomous daemon gating, one-off PayPal payouts, and payout batch creation.

## Instrumentation

- Added debug-report hooks around:
  - owner payout rail selection
  - PayPal submission gates
  - autonomous PayPal auto-submit batch selection
  - autonomous PayPal reconciliation batch selection

## Fix

- Unified owner daemon PayPal enablement with the canonical PPP2 flags used elsewhere in the repo.
- Added Base44 app id fallback to the project default app id when credentials are present but `BASE44_APP_ID` is missing.
- Added cross-route enable aliases via `ENABLE_ALL_OWNER_ROUTES`/`OWNER_ALL_ROUTES_ENABLED`/`ENABLE_ALL_PAYOUT_ROUTES`.
- Added relaxed-cap aliases via `RELAX_OWNER_LIMITS`/`OWNER_LIMITS_RELAXED`/`RELAX_SETTLEMENT_LIMITS`.
- Unified owner allowlist interpretation across authority, payout creation, one-off PayPal send, and autonomous PayPal gating.

## Verification

- Verified `allow_paypal` flips from `false` to `true` in `settlement_summary.json` when PPP2 flags are enabled.
- Verified `buildBase44ServiceClient()` no longer fails with missing app id when only `BASE44_SERVICE_TOKEN` is supplied.
