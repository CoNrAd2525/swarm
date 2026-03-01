import { OwnerSettlementEnforcer } from "../policy/owner-settlement.mjs";

function normalizeRoute(route) {
	return String(route || "").toLowerCase();
}

export function enforceOwnerSettlementForRoute(route, transactions) {
	const r = normalizeRoute(route);
	const ownerDest = OwnerSettlementEnforcer.getOwnerAccountForType(r);
	if (!ownerDest && r !== "smart_contract_owner")
		throw new Error(`missing_owner_destination_for_route:${r}`);
	const list = Array.isArray(transactions) ? transactions : [];
	if (list.length === 0) throw new Error("missing_transactions");
	return list.map((t) => {
		const amount = Number(t?.amount);
		if (!Number.isFinite(amount) || amount <= 0) {
			throw new Error("invalid_amount");
		}
		const currency = String(t?.currency || "USD").toUpperCase();
		const reference = t?.reference;
		if (r === "smart_contract_owner") {
			return {
				amount,
				currency,
				destination: t?.destination ?? null,
				reference,
			};
		}
		return {
			amount,
			currency,
			destination: ownerDest,
			reference,
		};
	});
}
