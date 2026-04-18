## Mirror Repos

This project supports pushing an autonomous mirror of the repository into a separate GitHub repository so operations remain independent of any local machine.

### Canonical vs mirror

- Canonical ops repo: contains workflows and automation.
- Mirror repo: receives all tracked repo updates (code, workflows, docs, and artifacts that are committed to git).

### GitHub Actions mirror workflow

Workflow: `.github/workflows/mirror-nd3.yml`

It pushes:
- The current branch HEAD to the mirror repo (forced, so the mirror always matches canonical)
- Tags (best-effort)

It refuses to mirror if sensitive files are tracked (guardrail check via `git ls-files`).

### Required GitHub secrets (canonical repo)

- `MIRROR_REPO`: `OWNER/REPO` (example: `CoNrAd2525/Nouveau-dossier-3-`)
- `MIRROR_PUSH_TOKEN`: a fine-grained GitHub token with `contents: read/write` access to the mirror repo

Optional:
- `MIRROR_BRANCH`: target branch (default: `main`)

### Notes

- Do not reuse tokens that have been exposed. Revoke and rotate immediately if a token ever leaks.
- Do not track `.env`, runtime state, or any personal data in the canonical repo if you want the mirror to remain safe.
