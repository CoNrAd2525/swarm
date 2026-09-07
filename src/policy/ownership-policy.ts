export const OWNERSHIP_POLICY = Object.freeze({
	cededAccounts: ["OWNER_RIB_SECONDARY"],
	owner: {
		id: "OWNER",
		effectiveAt: "2026-01-14T00:00:00Z",
		irrevocable: true,
	},
	enforcement: {
		hardFailOnViolation: true,
		autoRebindAllowed: false,
		freezeOnViolation: true,
	},
});
