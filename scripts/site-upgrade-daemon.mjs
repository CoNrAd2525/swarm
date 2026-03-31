import "dotenv/config";
import { PlaidEnquiryAgent } from "../src/revenue/PlaidEnquiryAgent.mjs";
import { AutonomousUpgradeAgent } from "../src/site/AutonomousUpgradeAgent.mjs";
import { RevenueRecoveryAgent } from "../src/site/RevenueRecoveryAgent.mjs";

async function runSiteUpgradeDaemon() {
	const agent = new AutonomousUpgradeAgent();
	const revenueAgent = new RevenueRecoveryAgent();
	const plaidAgent = new PlaidEnquiryAgent();
	await agent.init();
	await plaidAgent.init();

	console.log("🚀 Starting The Autonomous Website Upgrade Daemon...");
	const isOnce = process.argv.includes("--once");

	// 1. Content Injection
	await agent.generateNewCertificationGuide(
		"Certified Information Security Manager (CISM)",
	);

	// 2. SEO Check
	await agent.optimizeMetadata();

	// 3. Spawn upgrade agents
	await agent.spawnUpdateAgent("Landing Page Hero Optimization");

	// 4. Revenue Reconciliation
	await revenueAgent.runReconciliation();

	// 5. Plaid "Not Scored" Follow-up
	await plaidAgent.runAutonomousEnquiry();

	// Initial mission cycle
	await agent.runAutonomousCycle();

	if (isOnce) {
		console.log(
			"✅ Site Upgrade v1.0 initialization and one-shot cycle complete.",
		);
		process.exit(0);
	}

	// Schedule regular mission cycles
	const intervalId = setInterval(
		async () => {
			try {
				await revenueAgent.runReconciliation();
				await plaidAgent.runAutonomousEnquiry();
				await agent.runAutonomousCycle();
			} catch (e) {
				console.error(`[UpgradeAgent] Autonomous cycle failed: ${e.message}`);
			}
		},
		60 * 60 * 1000,
	); // 1 hour check

	// Graceful shutdown
	process.on("SIGINT", () => {
		console.log("\n🛑 Shutting down site upgrade daemon...");
		clearInterval(intervalId);
		process.exit(0);
	});
}

runSiteUpgradeDaemon().catch(console.error);
