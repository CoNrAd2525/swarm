# 📊 Swarm Market Research — TikTok Network

## Overview

**149 TikTok accounts** imported, enriched, and stored in the Base44 `TikTokAccount` entity.
Source: `younesli00` following list — export du 2026-05-27.

---

## Tier Breakdown

| Tier | Range | Count | Key accounts |
|------|-------|-------|-------------|
| 🟣 **Mega** | 1M+ | 1 | @qurantv1997 (1M) |
| 🔴 **Macro** | 100k–1M | 13 | @techdropp (481k), @flourishingphilosophy (474k), @moksha_3m (393k) |
| 🟠 **Mid** | 10k–100k | 28 | @valisbvck (90k), @zahi_shop4 (77k), @mondes_de_shopping (85k) |
| 🟡 **Micro** | 1k–10k | 64 | Majority — e-commerce & local shops |
| ⚪ **Nano** | <1k | 43 | High engagement hidden gems |

---

## Niche Distribution

| Niche | Count | Top account |
|-------|-------|-------------|
| `general` | 104 | @creeps.world (301k) |
| `art_design` | 18 | @thoughtplunge (278k) |
| `ecommerce` | 17 | @uatac_uniform (164k) |
| `tech` | 13 | @techdropp (481k) |
| `self_improvement` | 3 | @flourishingphilosophy (474k) |
| `health` | 3 | @moksha_3m (393k) |
| `religion` | 2 | @qurantv1997 (1M) |
| `finance` | 2 | @sat0shinakomoto (25k) |
| `spirituality` | 3 | @highvibetribe1 (28k) |

---

## Hidden Gems (Nano with >15% engagement)

These small accounts punch far above their weight:

| Username | Followers | Engagement Rate | Niche |
|---------|-----------|----------------|-------|
| @patron.watches | 100 | 74.2% | ecommerce |
| @culturium | 100 | 74.2% | general |
| @redabxqnjfs | 51 | 73.5% | ecommerce |
| @ditaye01 | 16 | 62.5% | tech/ecommerce |
| @fitnahperfume | 68 | 35.8% | ecommerce |
| @lfasi.shop | 164 | 32.6% | ecommerce |

---

## Outreach Pipeline

Run the pipeline locally:

```bash
# Dry run (default — no real submissions)
python3 market_research/outreach_pipeline.py

# Filter by tier
python3 market_research/outreach_pipeline.py --tier=macro

# Filter by niche
python3 market_research/outreach_pipeline.py --niche=ecommerce

# Live mode — submits to SwarmSupervisor for approval
python3 market_research/outreach_pipeline.py --live --tier=macro
```

### Pipeline flow

```
outreach_pipeline.py
       │
       ├── Segment A: Macro/Mega + ecommerce/tech
       │       └── POST /submit_transaction → SwarmSupervisor
       │               └── Tier 2/3 → Owner approval required
       │
       ├── Segment B: Mid + self_improvement/health
       │       └── DM outreach (no financial commitment yet)
       │
       └── Segment C: Nano hidden gems (engagement >15%)
               └── Watch list / monitoring
```

---

## Base44 Entity Schema

```json
{
  "tiktok_user_id": "string",
  "username": "string",
  "follower_count": "number",
  "influencer_tier": "mega | macro | mid | micro | nano",
  "engagement_rate": "number",
  "niche_tags": ["string"],
  "swarm_status": "prospect | contacted | active_partner | rejected | monitoring",
  "swarm_notes": "string",
  "import_batch": "string"
}
```

Update status after outreach:
```js
// Base44 SDK
await TikTokAccount.update(id, {
  swarm_status: "contacted",
  swarm_notes: "Sent DM 2026-06-05 — awaiting reply"
});
```

---

## Files

| File | Description |
|------|-------------|
| `tiktok_accounts_summary.json` | Aggregated stats + top accounts |
| `outreach_pipeline.py` | Segmentation + outreach + supervisor routing |

---

*Last updated: 2026-06-05 — 149 accounts imported*
