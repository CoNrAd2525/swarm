import { OwnerSettlementEnforcer } from "../policy/owner-settlement.mjs";

function normalizeRoute(route) {
	return String(route || "").toLowerCase();
}

export function enforceOwnerSettlementForRoute(route, transactions) {
	const r = normalizeRoute(route);
	const ownerDest = OwnerSettlementEnforcer.getOwnerAccountForType(r);
	const bankAllow =
		r === "bank_transfer" || r === "bank"
			? new Set(OwnerSettlementEnforcer.listOwnerDestinationsForRoute(r))
			: null;
	if (!ownerDest && r !== "smart_contract_owner" && !bankAllow?.size)
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
		if (bankAllow) {
			const desired = t?.destination ?? t?.recipient_address ?? null;
			const normalized = desired == null ? "" : String(desired).replace(/\s+/g, "").trim();
			const use =
				normalized && bankAllow.has(normalized)
					? normalized
					: OwnerSettlementEnforcer.getOwnerAccountForType("bank_transfer");
			if (!use) throw new Error("missing_owner_bank_destination");
			return {
				amount,
				currency,
				destination: use,
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
