import { shouldAvoidPayPal } from "./geopolicy.mjs";
import { OwnerSettlementEnforcer } from "./owner-settlement.mjs";

export function getEffectiveRoutes(_amount, currency) {
	const cfg = OwnerSettlementEnforcer.getPaymentConfiguration();
	let routes = [...cfg.settlement_priority];
	if (shouldAvoidPayPal()) routes = routes.filter((r) => r !== "paypal");
	routes = routes.filter(
		(r) => !OwnerSettlementEnforcer.missingCredentials(r, cfg),
	);
	const smartAvailable = !OwnerSettlementEnforcer.missingCredentials(
		"smart_contract_owner",
		cfg,
	);
	if (smartAvailable && !routes.includes("smart_contract_owner")) {
		const idx = routes.indexOf("crypto");
		if (idx >= 0) routes.splice(idx + 1, 0, "smart_contract_owner");
		else routes.push("smart_contract_owner");
	}
	// Add Payoneer Standard if API route is unavailable but standard is available
	const hasPayoneerApi = routes.includes("payoneer");
	const payoneerStdAvailable = !OwnerSettlementEnforcer.missingCredentials(
		"payoneer_standard",
		cfg,
	);
	if (
		!hasPayoneerApi &&
		payoneerStdAvailable &&
		!routes.includes("payoneer_standard")
	) {
		routes.push("payoneer_standard");
	}
	const cur = String(currency || "").toUpperCase();
	if (cur === "USDT") {
		const order = [
			"smart_contract_owner",
			"crypto",
			"cryptobox",
			"tron",
			"bank_transfer",
			"payoneer",
			"payoneer_standard",
			"stripe",
			"paypal",
		];
		const set = new Set(routes);
		routes = order.filter((r) => set.has(r));
	} else if (
		String(process.env.FORCE_BANK_WIRE || "").toLowerCase() === "true"
	) {
		// Check if Wise is specifically requested
		const forceWise =
			String(process.env.BANK_WIRE_PROVIDER || "").toUpperCase() === "WISE";
		if (forceWise && routes.includes("wise")) {
			// Prioritize Wise when specifically requested
			const order = [
				"wise",
				"bank_transfer",
				"smart_contract_owner",
				"crypto",
				"payoneer",
				"payoneer_standard",
				"stripe",
				"paypal",
			];
			const set = new Set(routes);
			routes = order.filter((r) => set.has(r));
		} else {
			// Default bank wire priority
			const order = [
				"bank_transfer",
				"smart_contract_owner",
				"crypto",
				"payoneer",
				"payoneer_standard",
				"stripe",
				"paypal",
			];
			const set = new Set(routes);
			routes = order.filter((r) => set.has(r));
		}
	}
	return routes;
}
