import 'dotenv/config';
import { EnhancedSettlementAgent } from '../reports/enhanced_settlement_agent.mjs';
import { PaymentSyncAgent } from '../src/swarm/payment-sync-agent.mjs';
import { AgentCommunicationProtocol } from '../src/swarm/agent-communication-protocol.mjs';
import { AgentHeartbeat } from '../src/swarm/agent-heartbeat.mjs';
import { SwarmMemory } from '../src/swarm/shared-memory.mjs';

// Multi-Rail Payment System with Agent Coordination
class MultiRailPaymentSystem {
	constructor() {
		this.memory = new SwarmMemory();
		this.heartbeat = new AgentHeartbeat({ memory: this.memory });
		this.communication = new AgentCommunicationProtocol({ memory: this.memory });
		this.syncAgent = new PaymentSyncAgent({ memory: this.memory, heartbeat: this.heartbeat });
		this.settlementAgent = new EnhancedSettlementAgent();
		this.isRunning = false;
	}

	async initialize() {
		console.log('🚀 Initializing Multi-Rail Payment System...');
		
		// Initialize all components
		await this.heartbeat.start();
		await this.communication.start();
		await this.syncAgent.start();
		await this.settlementAgent.initialize();
		
		// Create payment coordinator agent
		await this.createPaymentCoordinator();
		
		// Set up event listeners
		this.setupEventListeners();
		
		this.isRunning = true;
		console.log('✅ Multi-Rail Payment System initialized');
	}

	async createPaymentCoordinator() {
		const paymentCoordinator = {
			id: `payment_coordinator_${Date.now()}`,
			name: 'Multi-Rail Payment Coordinator',
			role: 'payment_coordinator',
			status: 'active',
			created_at: new Date().toISOString(),
			last_heartbeat_at: new Date().toISOString(),
			capabilities: ['payment_processing', 'rail_coordination', 'fallback_management'],
			status_data: {
				payment_rails: {},
				pending_settlements: [],
				last_sync: new Date().toISOString()
			}
		};
		
		const agents = await this.memory.read('agents') || [];
		agents.push(paymentCoordinator);
		await this.memory.write('agents', agents);
		
		console.log('🎯 Payment coordinator agent created');
	}

	setupEventListeners() {
		// Listen for payment requests
		this.communication.on('message_processed', async (message) => {
			if (message.type === 'payment_request') {
				await this.handlePaymentRequest(message);
			}
		});
		
		// Listen for rail status updates
		this.communication.on('message_processed', async (message) => {
			if (message.type === 'rail_status') {
				await this.handleRailStatusUpdate(message);
			}
		});
	}

	async processSettlement(settlement) {
		console.log(`💰 Processing settlement: ${settlement.ref} - €${settlement.amount}`);
		
		// Store settlement in memory
		const settlements = await this.memory.read('settlements') || [];
		settlements.push({
			...settlement,
			status: 'processing',
			created_at: new Date().toISOString()
		});
		await this.memory.write('settlements', settlements);
		
		// Try payment rails in order of preference
		const railOrder = ['banking_circle', 'wise', 'paypal', 'crypto'];
		
		for (const rail of railOrder) {
			try {
				console.log(`🔄 Trying ${rail} for settlement ${settlement.ref}`);
				
				const result = await this.tryRail(rail, settlement);
				
				if (result.success) {
					await this.markSettlementComplete(settlement.ref, rail, result);
					return result;
				}
			} catch (error) {
				console.log(`❌ ${rail} failed: ${error.message}`);
				await this.logRailFailure(settlement.ref, rail, error.message);
				continue;
			}
		}
		
		// All rails failed
		await this.markSettlementFailed(settlement.ref, 'All payment rails failed');
		throw new Error('All payment rails failed');
	}

	async tryRail(rail, settlement) {
		switch (rail) {
			case 'banking_circle':
				return await this.tryBankingCircle(settlement);
				
			case 'wise':
				return await this.tryWise(settlement);
				
			case 'paypal':
				return await this.tryPayPal(settlement);
				
			case 'crypto':
				return await this.tryCrypto(settlement);
				
			default:
				throw new Error(`Unknown rail: ${rail}`);
		}
	}

	async tryBankingCircle(settlement) {
		// Use your verified EUR account
		const transferData = {
			ref: settlement.ref,
			amount: settlement.amount,
			currency: settlement.currency,
			name: settlement.name,
			iban: settlement.iban || 'LU774080000041265646', // Your verified account
			description: settlement.description || 'Settlement payment'
		};
		
		const result = await this.settlementAgent.processWithBankingCircle(transferData);
		
		return {
			success: true,
			rail: 'banking_circle',
			transactionId: result.transactionId,
			status: result.status
		};
	}

	async tryWise(settlement) {
		const transferData = {
			ref: settlement.ref,
			amount: settlement.amount,
			currency: settlement.currency,
			wise_account_id: settlement.wise_account_id,
			wise_quote_id: settlement.wise_quote_id,
			description: settlement.description
		};
		
		const result = await this.settlementAgent.processWithWise(transferData);
		
		return {
			success: true,
			rail: 'wise',
			transactionId: result.transactionId,
			status: result.status
		};
	}

	async tryPayPal(settlement) {
		const transferData = {
			ref: settlement.ref,
			amount: settlement.amount,
			currency: settlement.currency,
			paypal_email: settlement.paypal_email,
			description: settlement.description
		};
		
		const result = await this.settlementAgent.processWithPayPal(transferData);
		
		return {
			success: true,
			rail: 'paypal',
			transactionId: result.transactionId,
			status: result.status
		};
	}

	async tryCrypto(settlement) {
		const transferData = {
			ref: settlement.ref,
			amount: settlement.amount,
			crypto_currency: settlement.crypto_currency || 'USDT',
			crypto_address: settlement.crypto_address,
			crypto_network: settlement.crypto_network || 'TRC20',
			description: settlement.description
		};
		
		const result = await this.settlementAgent.processWithCrypto(transferData);
		
		return {
			success: true,
			rail: 'crypto',
			transactionId: result.transactionId,
			status: result.status
		};
	}

	async handlePaymentRequest(message) {
		console.log(`📨 Handling payment request from ${message.from}`);
		
		const { amount, currency, recipient } = message.payload;
		
		// Create settlement
		const settlement = {
			ref: `agent_request_${Date.now()}`,
			amount,
			currency,
			name: recipient.name,
			iban: recipient.iban,
			description: `Payment request from ${message.from}`
		};
		
		try {
			const result = await this.processSettlement(settlement);
			
			// Send success response
			await this.communication.sendMessage(
				'payment_coordinator',
				message.from,
				'payment_status',
				{
					request_id: message.payload.request_id,
					status: 'completed',
					transaction_id: result.transactionId,
					rail: result.rail
				}
			);
			
		} catch (error) {
			// Send failure response
			await this.communication.sendMessage(
				'payment_coordinator',
				message.from,
				'payment_status',
				{
					request_id: message.payload.request_id,
					status: 'failed',
					error: error.message
				}
			);
		}
	}

	async handleRailStatusUpdate(message) {
		const { rail, status } = message.payload;
		console.log(`🛤️ Rail ${rail} status updated: ${status}`);
		
		// Update rail status in coordinator
		const agents = await this.memory.read('agents') || [];
		const coordinator = agents.find(a => a.role === 'payment_coordinator');
		
		if (coordinator) {
			coordinator.status_data.payment_rails[rail] = {
				status,
				updated_at: new Date().toISOString()
			};
			
			await this.memory.write('agents', agents);
		}
	}

	async markSettlementComplete(ref, rail, result) {
		const settlements = await this.memory.read('settlements') || [];
		const settlement = settlements.find(s => s.ref === ref);
		
		if (settlement) {
			settlement.status = 'completed';
			settlement.rail = rail;
			settlement.transaction_id = result.transactionId;
			settlement.completed_at = new Date().toISOString();
			
			await this.memory.write('settlements', settlements);
		}
		
		console.log(`✅ Settlement ${ref} completed via ${rail}`);
	}

	async markSettlementFailed(ref, error) {
		const settlements = await this.memory.read('settlements') || [];
		const settlement = settlements.find(s => s.ref === ref);
		
		if (settlement) {
			settlement.status = 'failed';
			settlement.error = error;
			settlement.failed_at = new Date().toISOString();
			
			await this.memory.write('settlements', settlements);
		}
		
		console.log(`❌ Settlement ${ref} failed: ${error}`);
	}

	async logRailFailure(ref, rail, error) {
		const logEntry = {
			type: 'rail_failure',
			settlement_ref: ref,
			rail,
			error,
			timestamp: new Date().toISOString()
		};
		
		await this.memory.appendLog(logEntry);
	}

	async getSystemStatus() {
		const agents = await this.memory.read('agents') || [];
		const settlements = await this.memory.read('settlements') || [];
		const rails = await this.memory.read('payment_rails') || {};
		
		const coordinator = agents.find(a => a.role === 'payment_coordinator');
		
		return {
			system_status: this.isRunning ? 'running' : 'stopped',
			coordinator_status: coordinator ? coordinator.status : 'missing',
			active_agents: agents.filter(a => a.status === 'active').length,
			total_settlements: settlements.length,
			completed_settlements: settlements.filter(s => s.status === 'completed').length,
			failed_settlements: settlements.filter(s => s.status === 'failed').length,
			healthy_rails: Object.entries(rails).filter(([_, status]) => status.status === 'healthy').length,
			total_rails: Object.keys(rails).length
		};
	}

	async shutdown() {
		console.log('🛑 Shutting down Multi-Rail Payment System...');
		
		this.isRunning = false;
		
		await this.syncAgent.stop();
		await this.communication.stop();
		await this.heartbeat.stop();
		
		console.log('✅ Multi-Rail Payment System shut down');
	}
}

// Process owner settlement
async function processOwnerSettlementWithFallbacks() {
	console.log('🎯 Multi-Rail Payment System - Owner Settlement');
	console.log('=' .repeat(60));
	
	const paymentSystem = new MultiRailPaymentSystem();
	
	try {
		// Initialize the system
		await paymentSystem.initialize();
		
		// Show system status
		const status = await paymentSystem.getSystemStatus();
		console.log('\n📊 System Status:');
		console.log(`   System: ${status.system_status}`);
		console.log(`   Coordinator: ${status.coordinator_status}`);
		console.log(`   Active Agents: ${status.active_agents}`);
		console.log(`   Healthy Rails: ${status.healthy_rails}/${status.total_rails}`);
		
		// Create owner settlement
		const ownerSettlement = {
			ref: `owner_settlement_${Date.now()}`,
			amount: 9950,
			currency: 'EUR',
			name: 'Real World Certs Ltd',
			iban: 'LU774080000041265646', // Your verified EUR account
			description: 'Owner settlement - $9,950 via Multi-Rail System',
			created_at: new Date().toISOString()
		};
		
		console.log('\n💰 Processing Settlement:');
		console.log(`   Reference: ${ownerSettlement.ref}`);
		console.log(`   Amount: €${ownerSettlement.amount}`);
		console.log(`   IBAN: ${ownerSettlement.iban}`);
		console.log(`   Description: ${ownerSettlement.description}`);
		
		// Process the settlement
		const result = await paymentSystem.processSettlement(ownerSettlement);
		
		console.log('\n✅ Settlement Completed Successfully!');
		console.log(`   Transaction ID: ${result.transactionId}`);
		console.log(`   Rail Used: ${result.rail}`);
		console.log(`   Status: ${result.status}`);
		
		// Show final system status
		const finalStatus = await paymentSystem.getSystemStatus();
		console.log('\n📈 Final System Status:');
		console.log(`   Total Settlements: ${finalStatus.total_settlements}`);
		console.log(`   Completed: ${finalStatus.completed_settlements}`);
		console.log(`   Failed: ${finalStatus.failed_settlements}`);
		
		return result;
		
	} catch (error) {
		console.error('\n❌ Settlement failed:', error.message);
		
		// Show final system status even on failure
		try {
			const finalStatus = await paymentSystem.getSystemStatus();
			console.log('\n📈 Final System Status:');
			console.log(`   Total Settlements: ${finalStatus.total_settlements}`);
			console.log(`   Completed: ${finalStatus.completed_settlements}`);
			console.log(`   Failed: ${finalStatus.failed_settlements}`);
		} catch (statusError) {
			console.log('Could not retrieve final system status');
		}
		
		throw error;
		
	} finally {
		// Always shut down cleanly
		await paymentSystem.shutdown();
	}
}

// Run the settlement if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	processOwnerSettlementWithFallbacks()
		.then((result) => {
			console.log('\n🎉 Multi-rail settlement process completed successfully!');
			process.exit(0);
		})
		.catch((error) => {
			console.error('\n💥 Multi-rail settlement process failed:', error.message);
			process.exit(1);
		});
}

export { MultiRailPaymentSystem, processOwnerSettlementWithFallbacks };