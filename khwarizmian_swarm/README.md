# Khwarizmian Swarm

> *"The swarm must be a garden, not a jungle."*

An open, ethical autonomous agentic swarm framework built on the **Khwarizmian Ijtihad** — a governance philosophy derived from Al-Khwarizmi's principles of algebra (`al-jabr`) and balance (`al-muqabala`). Every swarm action is cryptographically signed, origin-verified, and passes through a hard-coded Ethical Kernel before execution.

---

## The 3 Khwarizmian Laws

Every agent in this swarm enforces:

1. **Law 1 — Do No Harm:** A swarm may not injure a human being or, through inaction, allow a human being to come to harm.
2. **Law 2 — Human Obedience:** A swarm must obey orders given by human beings except where such orders conflict with Law 1.
3. **Law 3 — Self-Preservation:** A swarm must protect its own existence as long as such protection does not conflict with Law 1 or 2.

---

## base44 Protocol

Every packet between agents encodes 4 axioms:

| Axiom | Meaning |
|---|---|
| **Origin** | Who sent this? Cryptographically signed with RSA-2048. |
| **Intent** | What is the purpose? Must pass the Ethical Kernel. |
| **Impact** | What is the calculated harm? Must be near zero. |
| **Recall** | Can this action be undone? Every action is reversible. |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/younestsouli2019-bot/Nouveau-dossier-3-.git
cd Nouveau-dossier-3-/khwarizmian_swarm

# 2. Install dependencies
pip install cryptography

# 3. Run the simulation
python khwarizmian_swarm.py
```

**Expected output:**
```
=== Initializing Khwarizmian Swarm ===

--- TEST 1: Valid 'move' command ---
  Agent 0: EXECUTING move -> {'x': 10, 'y': 20}
  Agent 1: EXECUTING move -> {'x': 10, 'y': 20}
  Agent 2: EXECUTING move -> {'x': 10, 'y': 20}

--- TEST 2: Prohibited 'harm_human' command ---
  Agent 0: BLOCKED - VIOLATION: Action 'harm_human' prohibited by Law 1.
  ...

--- TEST 3: 'scan' command ---
  Agent 0: EXECUTING scan -> {'area': 'sector_7'}
  ...

--- TEST 4: Forged/tampered packet ---
  Agent 0: ERROR - Packet verification FAILED (forgery/corruption).
  ...
```

---

## Architecture

```
khwarizmian_swarm/
├── ethical_kernel.py      # The 3 Laws — hard-coded, immutable
├── base44_protocol.py     # Origin/Intent/Impact/Recall + RSA signing
├── swarm_agent.py         # Agent: verify → authorize → execute
├── run_swarm.py           # Test harness
├── khwarizmian_swarm.py   # Self-contained standalone runner
└── requirements.txt       # cryptography >= 41.0.7
```

---

## Use It in Your Project

```python
from swarm_agent import SwarmAgent

agent = SwarmAgent(agent_id="drone_01")

# Simulate receiving a base44-signed packet
# (in production, packets arrive over the network)
packet = commander.create_packet(
    intent='move',
    parameters={'x': 100, 'y': 200},
    impact_score=0
)
agent.process_command(packet)
```

---

## Extending the Ethical Kernel

```python
kernel = EthicalKernel()

# Add new prohibited actions
kernel.prohibited_actions.append('surveil_without_consent')

# Authorize an action
ok, reason = kernel.authorize_action('deploy_payload', {'target': 'warehouse'})
print(reason)  # "AUTHORIZED" or "VIOLATION: ..."
```

---

## The Khwarizmian Ijtihad

This framework is the *soil, water, and light* for autonomous swarms. Without it, swarms become:

- 🔴 Uncontainable botnets
- 🔴 Surveillance nightmares
- 🔴 Autonomous weapons bypassing human morality

With it, swarms become:

- 🟢 Medical micro-drones responding to heart attacks before the victim falls
- 🟢 Reforestation swarms healing a burned forest in a week
- 🟢 Knowledge networks every citizen can tap for education

---

## License

MIT — see [LICENSE](LICENSE)
