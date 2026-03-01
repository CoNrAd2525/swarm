import 'dotenv/config';
import { EnhancedSettlementAgent } from '../reports/enhanced_settlement_agent.mjs';

// Direct Banking Circle Transfer for $9,950
async function processOwnerSettlement() {
	console.log('🏦 Processing owner settlement via Banking Circle...');
	
	const settlementAgent = new EnhancedSettlementAgent();
	
	try {
		// Initialize the agent and test all rails
		await settlementAgent.initialize();
		
		// Create payee link for your settlement
		const ownerSettlement = {
			ref: `owner_settlement_${Date.now()}`,
			amount: 9950,
			currency: 'EUR',
			name: 'Real World Certs Ltd',
			iban: 'LU774080000041265646', // Your verified EUR account
			description: 'Owner settlement - $9,950 via Banking Circle',
			created_at: new Date().toISOString()
		};
		
		console.log('💰 Settlement details:');
		console.log(`   Amount: €${ownerSettlement.amount}`);
		console.log(`   Currency: ${ownerSettlement.currency}`);
		console.log(`   IBAN: ${ownerSettlement.iban}`);
		console.log(`   Reference: ${ownerSettlement.description}`);
		
		// Process the payment
		console.log('\n🚀 Initiating transfer...');
		const result = await settlementAgent.processPayment(ownerSettlement);
		
		console.log('\n✅ Settlement completed successfully!');
		console.log(`   Transaction ID: ${result.transactionId}`);
		console.log(`   Status: ${result.status}`);
		console.log(`   Rail: ${result.rail}`);
		
		// Show agent stats
		const stats = settlementAgent.getStats();
		console.log('\n📊 Agent Statistics:');
		console.log(`   Processed: ${stats.processed}`);
		console.log(`   Failed: ${stats.failed}`);
		console.log(`   Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
		
		return result;
		
	} catch (error) {
		console.error('\n❌ Settlement failed:', error.message);
		
		// Try fallback methods
		console.log('\n🔄 Attempting fallback methods...');
		await attemptFallbackMethods(settlementAgent);
		
		throw error;
	}
}

async function attemptFallbackMethods(agent) {
	const fallbackMethods = [
		{ name: 'Wise', method: 'processWithWise' },
		{ name: 'PayPal', method: 'processWithPayPal' },
		{ name: 'Crypto', method: 'processWithCrypto' }
	];
	
	for (const { name, method } of fallbackMethods) {
		try {
			console.log(`   Trying ${name}...`);
			// Would implement actual fallback logic here
			console.log(`   ⚠️ ${name} not yet configured for fallback`);
		} catch (error) {
			console.log(`   ❌ ${name} failed: ${error.message}`);
		}
	}
	
	console.log('\n❌ All fallback methods failed');
}

// Run the settlement
if (import.meta.url === `file://${process.argv[1]}`) {
	console.log('🎯 Direct Banking Circle Settlement Script');
	console.log('=' .repeat(50));
	
	processOwnerSettlement()
		.then((result) => {
			console.log('\n🎉 Settlement process completed!');
			process.exit(0);
		})
		.catch((error) => {
			console.error('\n💥 Settlement process failed:', error.message);
			process.exit(1);
		});
}

export { processOwnerSettlement };