import "dotenv/config";
import { RecoveryCommand } from "../src/recovery/RecoveryCommand.mjs";

async function runRecoveryDaemon() {
	const recovery = new RecoveryCommand();
	await recovery.init();

	console.log("🚀 Starting The Disaster Recovery & Maintenance Daemon...");
	const isOnce = process.argv.includes("--once");
	const isDrill = process.argv.includes("--drill");

	if (isDrill) {
		await recovery.runDRDrill();
		process.exit(0);
	}

	// Initial maintenance cycle
	await recovery.runMaintenanceCycle();

	if (isOnce) {
		console.log("✅ Recovery initialization and one-shot cycle complete.");
		process.exit(0);
	}

	// Schedule regular cycles (Every 6 hours)
	const intervalId = setInterval(
		async () => {
			try {
				await recovery.runMaintenanceCycle();
			} catch (e) {
				console.error(`[Recovery] Maintenance cycle failed: ${e.message}`);
			}
		},
		6 * 60 * 60 * 1000,
	);

	// Graceful shutdown
	process.on("SIGINT", () => {
		console.log("\n🛑 Shutting down recovery daemon...");
		clearInterval(intervalId);
		process.exit(0);
	});
}

runRecoveryDaemon().catch(console.error);
