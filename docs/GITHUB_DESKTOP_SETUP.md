# GitHub Desktop + Secrets Setup

## Goal

Use GitHub Desktop to commit/push safely, and use GitHub repository secrets (not local `.env`) for production workflows.

## GitHub Desktop workflow (recommended)

1. Open GitHub Desktop.
2. Add local repository: `swarm-repo` (or `repo-git2` if that is your canonical remote).
3. Ensure the current branch is `master` for development and `release` for deployment triggers.
4. Review changes, commit with a clear message, and push.
5. If you need to deploy, fast-forward `release` to the same commit as `master` and push `release`.

## GitHub Actions secrets (where production config lives)

Secrets are referenced by workflows under `.github/workflows/`.

Minimum set for SWARM + revenue:

- BASE44_APP_ID
- BASE44_SERVICE_TOKEN
- PAYPAL_CLIENT_ID
- PAYPAL_CLIENT_SECRET
- PAYPAL_WEBHOOK_ID
- OWNER_DASH_TOKEN
- SITE_PUBLIC_URL
- PUBLIC_WEBHOOK_BASE_URL

Supabase ETL:

- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

Vercel deploy:

- VERCEL_TOKEN

## Local helper files

- `.env.example` lists key names but should not contain real secrets.
- `scripts/CREDS.template.txt` can be copied to `scripts/CREDS.txt` and filled, then synced to GitHub org secrets using `scripts/gh-sync-org-secrets.ps1`.
- `scripts/list-required-secrets.mjs` prints required and optional secret names as JSON.

