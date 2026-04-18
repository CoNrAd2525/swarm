# Swarm Memory in Base44

- Memory entities: SwarmMemory, SwarmDirective, SwarmChangeSet
- Access patterns:
  - Read: query by scope (global|project) and tag
  - Update: idempotent upserts keyed by memory_id
  - Audit: log transactions in TransactionLog
- Write policy:
  - Only service role writes
  - Offline mode queues updates
  - Bunker mode queues directives
- Data model:
  - SwarmMemory: memory_id, scope, tags, content, updated_at
  - SwarmDirective: directive_id, status, priority, payload, created_at, applied_at
  - SwarmChangeSet: changeset_id, subject, message, sha256, chunk_count, created_at
- Update flow:
  - Agents fetch active directives
  - Apply and record ChangeSet
  - Update SwarmMemory entries with outcome
  - Append TransactionLog with evidence
- Autonomy rules:
  - Require live mode and owner routing
  - Respect unit economics
  - Enter paused_kyc_required when KYC needed
  - Queue when keys missing
- Verification:
  - Health proofs updated in Mission
  - Metrics for sync and webhook
  - Settlement index prevents duplicate processing

## Recent additions

- Security posture memory:
  - Secrets scan outputs: logs/security/secrets-summary.json and logs/security/rotation-checklist.md
  - Policy status: logs/security/policy-status.json used to gate settlement daemons
- Growth signal memory:
  - Classroom requests capture: data/classroom/requests.json and logs/classroom_requests.jsonl
  - Swarm metrics: revenue reports include classroom_requests_total and classroom_requests_24h

- Safeguarding compartment memory:
  - Run an isolated supervisor profile by setting SWARM_STATE_DIR and SWARM_ARCHIVE_DIR
  - Optional dedicated Base44 entities:
    - Campaigns: SWARM_SAFEGUARDING_CAMPAIGN_ENTITY + SWARM_SAFEGUARDING_CAMPAIGNS_CSV
    - Missions: SWARM_SAFEGUARDING_MISSION_ENTITY + SWARM_SAFEGUARDING_MISSIONS_CSV
  - Semi-linked monitoring: set SWARM_BRIDGE_DIR to write a minimal heartbeat JSON for external dashboards
