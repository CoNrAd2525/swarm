import { EventEmitter } from 'node:events';
import { SwarmMemory } from "./shared-memory.mjs";

export class AgentCommunicationProtocol extends EventEmitter {
	constructor({ memory = null } = {}) {
		super();
		this.memory = memory || new SwarmMemory();
		this.messageQueue = [];
		this.isProcessing = false;
		this.processInterval = 5000; // 5 seconds
		this.processIntervalId = null;
	}

	async start() {
		if (this.processIntervalId) return;
		
		this.processIntervalId = setInterval(() => this.processMessages(), this.processInterval);
		
		console.log(`📡 Agent communication protocol started (interval: ${this.processInterval}ms)`);
	}

	async stop() {
		if (!this.processIntervalId) return;
		
		clearInterval(this.processIntervalId);
		this.processIntervalId = null;
		
		console.log('📡 Agent communication protocol stopped');
	}

	async sendMessage(fromAgentId, toAgentId, messageType, payload) {
		const message = {
			id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			from: fromAgentId,
			to: toAgentId,
			type: messageType,
			payload,
			timestamp: new Date().toISOString(),
			status: 'pending'
		};
		
		// Store in memory
		const messages = await this.memory.read('agent_messages') || [];
		messages.push(message);
		await this.memory.write('agent_messages', messages);
		
		// Add to processing queue
		this.messageQueue.push(message);
		
		console.log(`📤 Message sent: ${fromAgentId} -> ${toAgentId} (${messageType})`);
		
		return message;
	}

	async broadcastMessage(fromAgentId, messageType, payload) {
		const agents = await this.memory.read('agents') || [];
		const activeAgents = agents.filter(a => a.status === 'active' && a.id !== fromAgentId);
		
		const broadcasts = [];
		for (const agent of activeAgents) {
			const message = await this.sendMessage(fromAgentId, agent.id, messageType, payload);
			broadcasts.push(message);
		}
		
		return broadcasts;
	}

	async processMessages() {
		if (this.isProcessing || this.messageQueue.length === 0) return;
		
		this.isProcessing = true;
		
		try {
			const messages = [...this.messageQueue];
			this.messageQueue = [];
			
			for (const message of messages) {
				await this.handleMessage(message);
			}
			
		} catch (error) {
			console.error('❌ Message processing error:', error.message);
		} finally {
			this.isProcessing = false;
		}
	}

	async handleMessage(message) {
		try {
			console.log(`📨 Processing message: ${message.type} from ${message.from}`);
			
			switch (message.type) {
				case 'payment_request':
					await this.handlePaymentRequest(message);
					break;
					
				case 'payment_status':
					await this.handlePaymentStatus(message);
					break;
					
				case 'rail_status':
					await this.handleRailStatus(message);
					break;
					
				case 'sync_request':
					await this.handleSyncRequest(message);
					break;
					
				case 'sync_response':
					await this.handleSyncResponse(message);
					break;
					
				case 'coordination_request':
					await this.handleCoordinationRequest(message);
					break;
					
				default:
					console.log(`⚠️ Unknown message type: ${message.type}`);
			}
			
			// Mark message as processed
			message.status = 'processed';
			await this.updateMessage(message);
			
			// Emit event for external listeners
			this.emit('message_processed', message);
			
		} catch (error) {
			console.error(`❌ Message handling error for ${message.type}:`, error.message);
			message.status = 'error';
			message.error = error.message;
			await this.updateMessage(message);
		}
	}

	async handlePaymentRequest(message) {
		const { amount, currency, recipient } = message.payload;
		
		console.log(`💰 Payment request: ${amount} ${currency} to ${recipient}`);
		
		// Get payment coordinator agent
		const agents = await this.memory.read('agents') || [];
		const paymentAgent = agents.find(a => a.role === 'payment_coordinator');
		
		if (paymentAgent) {
			// Forward to payment coordinator
			await this.sendMessage(
				message.to,
				paymentAgent.id,
				'process_payment',
				{ amount, currency, recipient, request_id: message.id }
			);
		} else {
			// No payment coordinator available
			await this.sendMessage(
				message.to,
				message.from,
				'payment_failed',
				{ 
					request_id: message.id,
					error: 'No payment coordinator available'
				}
			);
		}
	}

	async handlePaymentStatus(message) {
		const { request_id, status, transaction_id, error } = message.payload;
		
		console.log(`📊 Payment status: ${status} for request ${request_id}`);
		
		// Update payment status in memory
		const payments = await this.memory.read('payment_status') || {};
		payments[request_id] = {
			status,
			transaction_id,
			error,
			updated_at: new Date().toISOString()
		};
		
		await this.memory.write('payment_status', payments);
	}

	async handleRailStatus(message) {
		const { rail, status, message: railMessage } = message.payload;
		
		console.log(`🛤️ Rail status: ${rail} is ${status}`);
		
		// Update rail status in memory
		const rails = await this.memory.read('payment_rails') || {};
		rails[rail] = {
			status,
			message: railMessage,
			updated_at: new Date().toISOString()
		};
		
		await this.memory.write('payment_rails', rails);
	}

	async handleSyncRequest(message) {
		const { sync_type } = message.payload;
		
		console.log(`🔄 Sync request: ${sync_type} from ${message.from}`);
		
		// Get current status
		const status = await this.getAgentStatus(message.from);
		
		// Send sync response
		await this.sendMessage(
			message.to,
			message.from,
			'sync_response',
			{
				sync_type,
				status,
				agent_id: message.to
			}
		);
	}

	async handleSyncResponse(message) {
		const { sync_type, status, agent_id } = message.payload;
		
		console.log(`📡 Sync response: ${agent_id} status for ${sync_type}`);
		
		// Update agent status in memory
		const agents = await this.memory.read('agents') || [];
		const agent = agents.find(a => a.id === agent_id);
		
		if (agent) {
			agent.sync_status = agent.sync_status || {};
			agent.sync_status[sync_type] = {
				status,
				updated_at: new Date().toISOString()
			};
			
			await this.memory.write('agents', agents);
		}
	}

	async handleCoordinationRequest(message) {
		const { action, target_agents, payload } = message.payload;
		
		console.log(`🎯 Coordination request: ${action} for ${target_agents.length} agents`);
		
		// Forward to target agents
		for (const targetAgentId of target_agents) {
			await this.sendMessage(
				message.to,
				targetAgentId,
				'coordination_action',
				{ action, payload, coordinator: message.from }
			);
		}
	}

	async getAgentStatus(agentId) {
		const agents = await this.memory.read('agents') || [];
		const agent = agents.find(a => a.id === agentId);
		
		if (!agent) return { exists: false };
		
		return {
			exists: true,
			status: agent.status,
			last_heartbeat: agent.last_heartbeat_at,
			role: agent.role,
			capabilities: agent.capabilities || []
		};
	}

	async updateMessage(message) {
		const messages = await this.memory.read('agent_messages') || [];
		
		const index = messages.findIndex(m => m.id === message.id);
		if (index !== -1) {
			messages[index] = message;
			await this.memory.write('agent_messages', messages);
		}
	}

	async getPendingMessages(agentId) {
		const messages = await this.memory.read('agent_messages') || [];
		return messages.filter(m => 
			m.to === agentId && 
			m.status === 'pending' &&
			new Date(m.timestamp) > new Date(Date.now() - 300000) // Last 5 minutes
		);
	}

	async cleanupOldMessages() {
		const messages = await this.memory.read('agent_messages') || [];
		const cutoff = new Date(Date.now() - 3600000); // 1 hour ago
		
		const filtered = messages.filter(m => new Date(m.timestamp) > cutoff);
		
		if (filtered.length < messages.length) {
			await this.memory.write('agent_messages', filtered);
			console.log(`🧹 Cleaned up ${messages.length - filtered.length} old messages`);
		}
	}
}