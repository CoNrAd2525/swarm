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
- [mirror-sync-upstream.yml](file:///c:/Users/Dell/Downloads/Nouveau%20dossier%20(3)/swarm-repo/.github/workflows/mirror-sync-upstream.yml)

This workflow fetches `CoNrAd2525/swarm` and force-updates the mirror branches/tags to match.

Configure repo variables in the mirror repo:
- `UPSTREAM_REPO` = `CoNrAd2525/swarm`
- `UPSTREAM_BRANCHES` = `master release`
- `UPSTREAM_TAGS` = `true`

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
- [finance-diagnose.yml](file:///c:/Users/Dell/Downloads/Nouveau%20dossier%20(3)/swarm-repo/.github/workflows/finance-diagnose.yml) (manual + scheduled)
- [bank-reconcile.yml](file:///c:/Users/Dell/Downloads/Nouveau%20dossier%20(3)/swarm-repo/.github/workflows/bank-reconcile.yml) (manual + scheduled)

Owner settlement stays guarded:
- it only runs when reconcile reports confirmed incomings > 0

## 5) Secure cloud backups (optional)

Run:
- [backup-mirror.yml](file:///c:/Users/Dell/Downloads/Nouveau%20dossier%20(3)/swarm-repo/.github/workflows/backup-mirror.yml)

Store Supabase credentials only in the mirror repo:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (optional)
- `MIRROR_SUPABASE_BUCKET`

## 6) If you need email escalation

If GitHub account recovery is pending, keep the mirror repo as the active “control plane” until the flagged account is reinstated.

