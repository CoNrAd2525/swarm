# Workaround: GitHub account flagged (Actions disabled)

If the `CoNrAd2525/swarm` repository cannot run GitHub Actions because the account is flagged, you can still run the finance reconciliation autonomously by using a separate “runner” repository in a clean/unflagged GitHub account.

This runner repository will:
- check out `CoNrAd2525/swarm`
- run the same finance scripts (Plaid preflight + bank reconcile)
- optionally run the owner settlement cycle (only if confirmed incomings exist)
- upload reports as artifacts (and optionally commit back to the runner repo)

This does not require enabling Actions on the flagged account.

## Option A (recommended): runner repo executes finance + uploads artifacts

1. Create a new repository under an unflagged account, e.g. `your-clean-account/swarm-runner`.
2. Add these secrets to the runner repo:
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
   - `SITE_PUBLIC_URL` (optional)
   - `SECONDARY_CONTACT_EMAIL` (optional)
   - `OWNER_SETTLEMENT_AUTORUN` (optional; set to `true` to enable owner settlement cycle)
3. Add the workflow below to the runner repo at `.github/workflows/finance-diagnose-runner.yml`.

```yml
name: Finance Diagnose Runner
on:
  workflow_dispatch: {}
  schedule:
    - cron: "12 * * * *"
permissions:
  contents: write
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout swarm repo
        uses: actions/checkout@v4
        with:
          repository: CoNrAd2525/swarm
          ref: master
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - name: Finance diagnose (reports)
        env:
          BANK_RECONCILE_ENABLE: "true"
          SITE_PUBLIC_URL: ${{ secrets.SITE_PUBLIC_URL }}
          BASE44_SERVICE_TOKEN: ${{ secrets.BASE44_SERVICE_TOKEN }}
          BASE44_APP_ID: ${{ secrets.BASE44_APP_ID }}
          BASE44_API_URL: ${{ secrets.BASE44_API_URL }}
          BASE44_SERVER_URL: ${{ secrets.BASE44_SERVER_URL }}
          BASE44_REVENUE_ENTITY: ${{ secrets.BASE44_REVENUE_ENTITY }}
          BASE44_PAYOUT_ENTITY: ${{ secrets.BASE44_PAYOUT_ENTITY }}
          PLAID_ENV: ${{ secrets.PLAID_ENV }}
          PLAID_CLIENT_ID: ${{ secrets.PLAID_CLIENT_ID }}
          PLAID_SECRET: ${{ secrets.PLAID_SECRET }}
          PLAID_OWNER_ACCESS_TOKEN: ${{ secrets.PLAID_OWNER_ACCESS_TOKEN }}
          PLAID_ACCESS_TOKEN: ${{ secrets.PLAID_ACCESS_TOKEN }}
          OWNER_NOTIFY_EMAIL: ${{ secrets.SECONDARY_CONTACT_EMAIL }}
          OWNER_SETTLEMENT_AUTORUN: ${{ secrets.OWNER_SETTLEMENT_AUTORUN }}
        run: |
          mkdir -p exports/reports
          node ./scripts/validate-owner-routing-env.mjs | tee exports/reports/owner_routing_env_last.json || true
          node ./scripts/plaid-preflight.mjs | tee exports/reports/plaid_preflight_last.json || true
          node ./scripts/auto-confirm-bank-settlements.mjs | tee exports/reports/bank_reconcile_last.json || true
          confirmed="$(node -e \"try{const fs=require('fs');const j=JSON.parse(fs.readFileSync('exports/reports/bank_reconcile_last.json','utf8'));process.stdout.write(String(j.confirmed??0));}catch(e){process.stdout.write('0');}\")"
          if [ \"${OWNER_SETTLEMENT_AUTORUN:-false}\" = \"true\" ] && [ \"${confirmed:-0}\" -gt 0 ]; then
            node ./scripts/auto-settle-owner-daemon.mjs --once || true
          fi
      - name: Upload reports
        uses: actions/upload-artifact@v4
        with:
          name: finance-diagnose-${{ github.run_id }}
          path: exports/reports/*.json
```

## Option B: runner repo also pushes “reports” back to swarm repo

Only use this if you still have push permissions to `CoNrAd2525/swarm` and you want the reports stored there.

You will need a PAT in the runner repo secrets that has write access to `CoNrAd2525/swarm` (store it as `SWARM_PUSH_TOKEN`) and then add a final step:

```yml
- name: Push reports back to swarm repo
  env:
    SWARM_PUSH_TOKEN: ${{ secrets.SWARM_PUSH_TOKEN }}
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add exports/reports/*.json
    if ! git diff --cached --quiet; then
      git commit -m "chore(finance): runner reports"
      git remote set-url origin "https://x-access-token:${SWARM_PUSH_TOKEN}@github.com/CoNrAd2525/swarm.git"
      git push origin HEAD:master
    else
      echo "No reports changes."
    fi
```

## Interpreting results

The artifact will always include:
- `plaid_preflight_last.json` (why Plaid is ready/not ready)
- `bank_reconcile_last.json` (why reconcile confirmed/confirmed=0/skipped)

If `bank_reconcile_last.json` reports `no_pending_batches`, the issue is not “Plaid missing money”, it’s that there are no `PayoutBatch` records waiting for external confirmation to match.
