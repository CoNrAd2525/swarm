function entityMap(names) {
	return Object.fromEntries(
		names.map((name) => [name, { name, description: `${name} entity`, fields: [] }]),
	);
}

export const BASE44_PROFILES = {
	agent_flow: entityMap([
		"Agent",
		"Analytics",
		"Campaign",
		"CodeRepository",
		"ContentAsset",
		"CoursePromotion",
		"FinancialGoal",
		"KnowledgeEntry",
		"Mission",
		"PayoutBatch",
		"PayoutItem",
		"RevenueEvent",
		"SwarmCoordination",
		"TransactionLog",
		"WorkflowExecution",
		"User",
	]),
	agent_swarm: entityMap([
		"Campaign",
		"Task",
		"Workflow",
		"PayoutRecipient",
		"AppProject",
		"Agent",
		"ProductListing",
		"RevenueStream",
		"Mission",
		"AgentThreshold",
		"SocialPost",
		"PayoutBatch",
		"AgentHandoff",
		"TransactionLog",
		"RevenueEvent",
		"PayoutItem",
		"ReconciliationAlert",
		"AgentTemplate",
		"PayoutAlert",
		"User",
	]),
};

export function resolveBase44ProfileName(config = {}, env = process.env) {
	const explicit = String(
		env.BASE44_PROFILE || env.BASE44_TARGET_PROFILE || "",
	).trim();
	if (explicit) return explicit;

	const appId = String(config.appId || "").trim();
	const baseUrl = String(config.baseUrl || "").trim();

	if (
		appId === "6888ac155ebf84dd9855ea98" ||
		baseUrl.includes("agent-flow-ai-9855ea98.base44.app")
	) {
		return "agent_flow";
	}
	if (
		appId === "689afeabf1db9c30efe0bd7e" ||
		baseUrl.includes("agent-swarm-efe0bd7e.base44.app")
	) {
		return "agent_swarm";
	}

	return "legacy_finance";
}

export function resolveBase44Schemas({
	config,
	legacySchemas,
	env = process.env,
} = {}) {
	const profileName = resolveBase44ProfileName(config, env);
	return {
		profileName,
		schemas: BASE44_PROFILES[profileName] || legacySchemas,
	};
}
