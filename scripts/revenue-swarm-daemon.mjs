import "dotenv/config";
import { runRevenueSwarm } from "../src/revenue/swarm-runner.mjs";

async function startRevenueSwarmDaemon() {
	console.log("🚀 Starting The Revenue Swarm Daemon...");
	const isOnce = process.argv.includes("--once");

	const cycle = async () => {
		try {
			const result = await runRevenueSwarm();
			console.log(
				`[RevenueSwarm] Cycle complete. Ecosystem Earnings: $${result.total_ecosystem_earnings.toFixed(2)} USD. Forecast: $${result.mission_forecast.toFixed(2)} USD/day. Classroom requests: ${Number(result.classroom_requests_24h || 0)} (24h) / ${Number(result.classroom_requests_total || 0)} (total).`,
			);
		} catch (e) {
			console.error(`[RevenueSwarm] Cycle failed: ${e.message}`);
		}
	};

	// Initial cycle
	await cycle();

	if (isOnce) {
		console.log("✅ Revenue Swarm initialization and one-shot cycle complete.");
		process.exit(0);
	}

	// Schedule regular cycles
	const intervalId = setInterval(cycle, 60 * 60 * 1000); // 1 hour check

	// Graceful shutdown
	process.on("SIGINT", () => {
		console.log("\n🛑 Shutting down revenue swarm daemon...");
		clearInterval(intervalId);
		process.exit(0);
	});
}

startRevenueSwarmDaemon().catch(console.error);
