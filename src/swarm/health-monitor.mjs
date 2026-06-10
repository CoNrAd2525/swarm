import fs from "node:fs/promises";
import path from "node:path";

import { SwarmMemory } from "./shared-memory.mjs";

async function readJson(filePath, fallback) {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return JSON.parse(raw);
	} catch {
		return fallback;
	}
}

function summarizeRails(rails) {
	const entries = Object.entries(rails || {});
	const degraded = entries
		.filter(([, value]) => value && value.status && value.status !== "healthy")
		.map(([key, value]) => ({
			rail: key,
			status: value.status,
		}));

	return {
		total: entries.length,
		degraded,
		healthy: degraded.length === 0,
	};
}

function summarizeMirrors(mirrors) {
	const items = Array.isArray(mirrors) ? mirrors : [];
	if (items.length === 0) {
		return {
			total: 0,
			degraded: [
				{
					name: "mirror-inventory",
					status: "missing_or_empty",
					last_sync: null,
				},
			],
			healthy: false,
		};
	}
	const degraded = items.filter((mirror) => {
		const status = String(mirror?.status || "").toLowerCase();
		return status && status !== "healthy" && status !== "active" && status !== "ok";
	});
	return {
		total: items.length,
		degraded: degraded.map((mirror) => ({
			name: mirror.name || mirror.region || mirror.url || "unknown",
			status: mirror.status || "unknown",
			last_sync: mirror.last_sync || null,
		})),
		healthy: degraded.length === 0,
	};
}
export class AgentHealthMonitor {
	constructor({ memory = null, intervalMs = 30000, staleMs = 120000 } = {}) {
		this.memory = memory || new SwarmMemory();
		this.intervalMs = intervalMs;
		this.staleMs = staleMs;
		this.started = false;
		this.intervalId = null;
		this.snapshotPath = path.resolve("data/swarm/sync-health.json");
		this.siteDataSnapshotPath = path.resolve(
			"rank/output/site-data/swarm-sync-health.json",
		);
		this.mirrorSitesPath = path.resolve("data/mirror-sites.json");
	}

	async start() {
		if (this.started) {
			return { ok: true, intervalMs: this.intervalMs, alreadyStarted: true };
		}

		this.started = true;
		this.intervalId = setInterval(() => {
			this.check().catch((error) => {
				console.error("[AgentHealthMonitor] check failed:", error.message);
			});
		}, this.intervalMs);

		const snapshot = await this.check();
		return {
			ok: snapshot.ok,
			intervalMs: this.intervalMs,
			snapshot,
		};
	}

	async stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.started = false;
	}

	async check() {
		const nowIso = new Date().toISOString();
		const nowMs = Date.now();
		const agents = (await this.memory.read("agents")) || [];
		const rails = (await this.memory.read("payment_rails")) || {};
		const payeeLinks = (await this.memory.read("payee_links")) || [];
		const mirrors = await readJson(this.mirrorSitesPath, []);

		const activeAgents = agents.filter((agent) => agent?.status === "active");
		const staleAgents = activeAgents.filter((agent) => {
			const lastHeartbeat = agent?.last_heartbeat_at
				? new Date(agent.last_heartbeat_at).getTime()
				: 0;
			return !lastHeartbeat || nowMs - lastHeartbeat > this.staleMs;
		});
		const pendingSettlements = payeeLinks.filter((item) => {
			const status = String(item?.status || "").toLowerCase();
			return ["pending", "approved", "processing", "submitted"].includes(status);
		});

		const railSummary = summarizeRails(rails);
		const mirrorSummary = summarizeMirrors(mirrors);
		const snapshot = {
			ok:
				staleAgents.length === 0 &&
				railSummary.healthy &&
				mirrorSummary.healthy,
			at: nowIso,
			agents: {
				total: agents.length,
				active: activeAgents.length,
				stale: staleAgents.map((agent) => ({
					id: agent.id || agent.agent_id || "unknown",
					role: agent.role || agent.name || "unknown",
					last_heartbeat_at: agent.last_heartbeat_at || null,
				})),
			},
			rails: railSummary,
			settlements: {
				pending_count: pendingSettlements.length,
			},
			mirrors: mirrorSummary,
		};

		await this.writeSnapshot(snapshot);
		await this.memory.appendLog({
			type: "sync_health_check",
			ok: snapshot.ok,
			at: nowIso,
			stale_agents: snapshot.agents.stale.length,
			degraded_rails: snapshot.rails.degraded.length,
			degraded_mirrors: snapshot.mirrors.degraded.length,
			pending_settlements: snapshot.settlements.pending_count,
		});

		return snapshot;
	}

	async writeSnapshot(snapshot) {
		for (const filePath of [this.snapshotPath, this.siteDataSnapshotPath]) {
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
		}
	}
}
