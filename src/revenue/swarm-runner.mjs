import { MirrorSwarmAgent } from "../site/MirrorSwarmAgent.mjs";
import { MissionRunnerAgent } from "./MissionRunnerAgent.mjs";
import { RevenueWatchAgent } from "./RevenueWatchAgent.mjs";

export async function runRevenueSwarm() {
	const missionAgent = new MissionRunnerAgent();
	const watchAgent = new RevenueWatchAgent();
	const mirrorAgent = new MirrorSwarmAgent();

	await missionAgent.init();
	await watchAgent.init();
	await mirrorAgent.init();

	console.log(
		`\n🚀 [${new Date().toISOString()}] RevenueSwarm: Initializing mission-driven cycles...`,
	);

	// 1. Run Pending Missions (Marketing, Content, Financial)
	await missionAgent.runPendingMissions();

	// 2. Monitor Mirror Sites
	await mirrorAgent.monitorMirrors();

	// 3. Generate Real-Time Revenue Report
	const report = await watchAgent.generateRealTimeReport();

	return {
		ok: true,
		ran: true,
		at: new Date().toISOString(),
		total_ecosystem_earnings: report.total_ecosystem_earnings,
		mission_forecast: report.mission_forecast,
		classroom_requests_total: report.classroom_requests_total ?? 0,
		classroom_requests_24h: report.classroom_requests_24h ?? 0,
	};
}
