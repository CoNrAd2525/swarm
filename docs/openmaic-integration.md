# OpenMAIC Integration Notes (RealWorldCerts)

## What it is

OpenMAIC (Open Multi-Agent Interactive Classroom) is an open-source platform that converts a topic or document into an interactive classroom experience with multi-agent teaching, slides, quizzes, simulations, and project-based learning.

Source: <https://github.com/THU-MAIC/OpenMAIC>

## License / compliance

OpenMAIC is AGPL-3.0 licensed and also advertises commercial licensing for closed-source/commercial use. If RealWorldCerts embeds or runs OpenMAIC as part of the product experience, treat this as a licensing decision:

- Option A (low risk, fast): Link out to OpenMAIC hosted demo and keep RealWorldCerts as a separate system.
- Option B (AGPL compliant): Self-host OpenMAIC and publish source + modifications as required by AGPL when providing network access.
- Option C (recommended for commercial): Obtain a commercial license from the maintainers, then integrate deeply.

## Product opportunities for RealWorldCerts

- “Interactive Classroom” upsell: convert premium guides into interactive lessons with quizzes and grading.
- “Simulation labs”: HTML interactive exercises per certification domain (cloud networking, IAM policy evaluation, SOC triage).
- “PBL tracks”: role-based projects (e.g., “Cloud Security Engineer Week 1–4”) with deliverables.
- “Exportables”: PPTX + HTML exports as paid downloads or bundle add-ons.

## Integration architecture options

### 1) External link / deep-link

- Add a RealWorldCerts page describing the feature.
- Send the user to a hosted OpenMAIC session (or to a self-hosted OpenMAIC URL).
- Track conversions (UTM parameters, referral code).

Pros: no infra, no licensing entanglement, fast.
Cons: weaker control of UX and analytics.

### 2) Microservice (recommended)

Run OpenMAIC as its own service (container or Vercel), and integrate with RealWorldCerts via:

- SSO handoff (RealWorldCerts issues a signed token, OpenMAIC validates)
- “Generate classroom” API calls from RealWorldCerts jobs/daemons
- Embed via separate subdomain (e.g., class.realworldcerts.com)

Pros: isolation, upgradeability, clear boundaries.
Cons: operational complexity; licensing needs to be resolved.

### 3) Native re-implementation (longer term)

Rebuild only the pieces needed (quiz engine + scene types + export) inside RealWorldCerts. Use OpenMAIC as inspiration, not code.

Pros: full ownership, no dependency on external runtime.
Cons: more engineering.

## Data & security requirements

- Never send PII to third-party providers without explicit consent.
- Keep classroom generation inputs minimal (cert guide excerpt + objective).
- Log only non-sensitive metadata; store raw documents in vault if needed.
- Reuse existing secrets scanning and “hands-free policy” to block risky deployments.

## Minimal implementation plan (fast path)

1) Create an “Interactive Classroom” landing page on RealWorldCerts describing the feature.
2) Add a “Generate Classroom” button that:
   - Sends a request to a separate OpenMAIC service, or
   - Opens the hosted OpenMAIC site.
3) Add per-guide metadata so premium guides can trigger classroom generation.
4) Add monitoring: job status, failure reasons, and conversion stats.

