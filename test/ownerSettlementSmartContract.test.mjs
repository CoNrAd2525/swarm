import assert from "node:assert/strict";
import test from "node:test";

import { OwnerSettlementEnforcer } from "../src/policy/owner-settlement.mjs";

function withEnv(map, fn) {
	const prev = {};
	for (const [k, v] of Object.entries(map)) {
		prev[k] = process.env[k];
		process.env[k] = v;
	}
	return Promise.resolve()
		.then(() => fn())
		.finally(() => {
			for (const [k, v] of Object.entries(prev)) {
				if (v === undefined) delete process.env[k];
				else process.env[k] = v;
			}
		});
}

test("smart_contract_owner route is available with required env", async () => {
	await withEnv(
		{
			SWARM_LIVE: "true",
			SAFE_MODE: "false",
			OWNER_VAULT_ENABLE: "true",
			OWNER_VAULT_CONTRACT_ADDRESS:
				"0x0000000000000000000000000000000000000001",
			PAYMENT_ROUTING_PRIORITY: "smart_contract_owner,crypto",
		},
		() => {
			const cfg = OwnerSettlementEnforcer.getPaymentConfiguration();
			assert.ok(cfg.creds.smart_contract_owner);
			assert.equal(cfg.creds.smart_contract_owner.enabled, true);
			assert.equal(
				cfg.creds.smart_contract_owner.contractAddress,
				"0x0000000000000000000000000000000000000001",
			);
			const missing = OwnerSettlementEnforcer.missingCredentials(
				"smart_contract_owner",
				cfg,
			);
			assert.equal(missing, false);
			const acct = OwnerSettlementEnforcer.getOwnerAccountForType(
				"smart_contract_owner",
			);
			assert.equal(acct, "0x0000000000000000000000000000000000000001");
		},
	);
});

test("smart_contract_owner route is unavailable when contract is missing", async () => {
	await withEnv(
		{
			SWARM_LIVE: "true",
			SAFE_MODE: "false",
			OWNER_VAULT_ENABLE: "true",
			OWNER_VAULT_CONTRACT_ADDRESS: "",
			PAYMENT_ROUTING_PRIORITY: "smart_contract_owner,crypto",
		},
		() => {
			const cfg = OwnerSettlementEnforcer.getPaymentConfiguration();
			const missing = OwnerSettlementEnforcer.missingCredentials(
				"smart_contract_owner",
				cfg,
			);
			assert.equal(missing, true);
		},
	);
});
