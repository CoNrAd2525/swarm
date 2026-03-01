import { OwnerSettlementEnforcer } from "./policy/owner-settlement.mjs";

function getOwnerSettlementPriority() {
	const cfg = OwnerSettlementEnforcer.getPaymentConfiguration();
	return Array.isArray(cfg.settlement_priority) ? cfg.settlement_priority : [];
}

function selectPrimaryOwnerRail() {
	const prio = getOwnerSettlementPriority();
	if (prio.length > 0) return prio[0];
	return "paypal";
}

export { getOwnerSettlementPriority, selectPrimaryOwnerRail };
