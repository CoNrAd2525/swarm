# 🤖 Swarm — Supervised Autonomous Agent Network

> Last updated: **2026-06-05** | Status: **Active Development**

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    SWARM NETWORK                     │
│                                                      │
│  Agents (Node.js)    →    SwarmSupervisor (Base44)   │
│  orchestrate-settlement        ↓                     │
│  market-research           Constitution              │
│                             Enforcement              │
│                                ↓                     │
│                          Risk Tiering                │
│                                ↓                     │
│                     Owner Approval (5 min TTL)       │
│                                ↓                     │
│                        Immutable Ledger              │
└─────────────────────────────────────────────────────┘
```

---

## Modules

### 🏛 `base44/` — Supervised Backend (Base44)

| File | Description |
|------|-------------|
| `ARCHITECTURE.md` | Full architecture doc + integration guide |
| `functions/swarmSupervisor.ts` | Backend Deno function — all gating logic |
| `entities/SwarmAgent.json` | Agent registry schema |
| `entities/SwarmTransaction.json` | Transaction schema |
| `entities/SwarmLedger.json` | Immutable ledger schema |
| `entities/SwarmApprovalRequest.json` | Approval queue schema |
| `entities/SwarmAuditLog.json` | Audit log schema |

**Endpoint:** `https://superagent-d5a9f123.base44.app/functions/swarmSupervisor`

**Constitution hash:** `008a1afa6cc55c63385d1b0b98b057ec06f9c9c9df174870da03bbcb9dab4839`

---

### 📊 `market_research/` — TikTok Network Intelligence

| File | Description |
|------|-------------|
| `README.md` | Full breakdown, tiers, niches, hidden gems |
| `tiktok_accounts_summary.json` | 149 accounts — stats + top performers |
| `outreach_pipeline.py` | Segmented outreach + supervisor routing |

**149 accounts** tiered and niche-tagged:
- 🟣 Mega (1M+): 1 — @qurantv1997
- 🔴 Macro (100k–1M): 13 — @techdropp, @flourishingphilosophy, @moksha_3m
- 🟠 Mid (10k–100k): 28
- 🟡 Micro (1k–10k): 64
- ⚪ Nano (<1k): 43 — several with >30% engagement

---

## SwarmSupervisor API

| Action | Description |
|--------|-------------|
| `submit_transaction` | Submit for gating — auto or approval-required |
| `approve_transaction` | Owner approves/rejects (5 min TTL) |
| `kill_switch` | Emergency stop — agent or global |
| `heartbeat` | Agent liveness signal |
| `get_status` | Live dashboard |

**Risk tiers:**
- Tier 1 (≤$500, reconciliation) → **auto-approved**
- Tier 2 ($500–$2500) → **owner approval required**
- Tier 3 (>$2500) → **HIGH RISK — owner approval required**

---

## Quick Start

```bash
# Check swarm status
curl -X POST https://superagent-d5a9f123.base44.app/functions/swarmSupervisor \
  -H "Content-Type: application/json" \
  -d '{"action":"get_status"}'

# Submit a transaction
curl -X POST https://superagent-d5a9f123.base44.app/functions/swarmSupervisor \
  -H "Content-Type: application/json" \
  -d '{"action":"submit_transaction","agent_id":"AGENT_01","intent":"SETTLE_REVENUE_TO_OWNER","amount_usd":500,"currency":"USD","destination":"owner@paypal.com","destination_type":"paypal"}'

# Run outreach pipeline (dry run)
python3 market_research/outreach_pipeline.py --tier=macro
```

---

## Entity: TikTokAccount

Stored in Base44. 149 records with:
- `influencer_tier` — mega/macro/mid/micro/nano
- `engagement_rate` — likes/video ÷ followers × 100
- `niche_tags` — auto-detected from bio
- `swarm_status` — prospect → contacted → active_partner

---

*Built with [Base44](https://base44.com) · Supervised by human-on-the-loop architecture*
