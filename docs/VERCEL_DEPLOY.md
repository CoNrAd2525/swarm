# Vercel Deploy (Canonical Site: rank/)

This workspace contains multiple site outputs. The canonical website content is under:
- rank/

Recommended deploy artifact directory (static output):
- rank/output

Secrets
- Do not commit Vercel tokens into the repository.
- Prefer using a local-only .env (already gitignored) or CREDS.txt (local-only) for VERCEL_TOKEN.

Verify current Vercel project link
- Set:
  - VERCEL_TOKEN
  - VERCEL_PROJECT_NAME (optional, default: realworldcerts-site)
  - VERCEL_TEAM_ID or VERCEL_ORG_ID (optional)
  - VERCEL_EXPECT_GITHUB_REPO (optional, e.g. CoNrAd2525/swarm)
- Run:
  - node scripts/vercel-check-project-link.mjs

Update Vercel project to point at the correct GitHub repo/root
- Set:
  - VERCEL_TOKEN
  - VERCEL_PROJECT_NAME
  - VERCEL_GIT_REPO (e.g. CoNrAd2525/swarm)
  - VERCEL_ROOT_DIRECTORY (default: rank)
  - VERCEL_GIT_BRANCH (optional)
- Run:
  - node scripts/vercel-update-project-repo.mjs

Deploy static output from rank/output (no git linkage required)
- Set:
  - VERCEL_TOKEN
  - VERCEL_PROJECT_NAME
  - VERCEL_DEPLOY_DIR (optional, default: rank/output)
  - VERCEL_TEAM_ID or VERCEL_ORG_ID (optional)
- Run:
  - node scripts/vercel-deploy-static-dir.mjs
