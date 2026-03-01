import fs from "node:fs/promises";
import path from "node:path";
import { SwarmMemory } from "./shared-memory.mjs";

export class AgentHeartbeat {
	constructor({ memory = null, intervalMs = 30000 } = {}) {
		this.memory = memory || new SwarmMemory();
		this.intervalMs = intervalMs;
		this.isRunning = false;
		this.intervalId = null;
	}

	async start() {
		if (this.isRunning) return;
		
		this.isRunning = true;
		this.intervalId = setInterval(() => this.beat(), this.intervalMs);
		
		// Initial heartbeat
		await this.beat();
		
		console.log(`🔊 Agent heartbeat started (interval: ${this.intervalMs}ms)`);
	}

	async stop() {
		if (!this.isRunning) return;
		
		this.isRunning = false;
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		
		console.log('🔇 Agent heartbeat stopped');
	}

	async beat() {
		try {
			const agents = await this.memory.read('agents') || [];
			const now = new Date().toISOString();
			
			// Update heartbeat for all active agents
			const updatedAgents = agents.map(agent => {
				if (agent.status === 'active') {
					return {
						...agent,
						last_heartbeat_at: now
					};
				}
				return agent;
			});
			
			await this.memory.write('agents', updatedAgents);
			
			// Log heartbeat activity
			await this.logHeartbeat(now, updatedAgents.length);
			
		} catch (error) {
			console.error('❌ Heartbeat error:', error.message);
		}
	}

	async logHeartbeat(timestamp, agentCount) {
		const logEntry = {
			type: 'heartbeat',
			timestamp,
			agent_count: agentCount,
			status: 'active'
		};
		
		await this.memory.appendLog(logEntry);
	}

	async getStaleAgents(thresholdMs = 120000) { // 2 minutes default
		const agents = await this.memory.read('agents') || [];
		const now = Date.now();
		
		return agents.filter(agent => {
			if (agent.status !== 'active') return false;
			
			const lastHeartbeat = agent.last_heartbeat_at ? 
				new Date(agent.last_heartbeat_at).getTime() : 0;
			
			return (now - lastHeartbeat) > thresholdMs;
		});
	}

	async markAgentDead(agentId) {
		const agents = await this.memory.read('agents') || [];
		
		const updatedAgents = agents.map(agent => {
			if (agent.id === agentId) {
				return {
					...agent,
					status: 'dead',
					last_heartbeat_at: null
				};
			}
			return agent;
		});
		
		await this.memory.write('agents', updatedAgents);
		
		const logEntry = {
			type: 'agent_dead',
			agent_id: agentId,
			timestamp: new Date().toISOString()
		};
		
		await this.memory.appendLog(logEntry);
		
		console.log(`⚰️ Agent marked dead: ${agentId}`);
	}
}