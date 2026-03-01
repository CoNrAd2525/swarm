import test from "node:test";
import assert from "node:assert/strict";
import {
	applyPhase0ToRow,
	ensurePhase0Dependency,
	isRevenueGeneratingMission,
} from "../src/swarm/mission-phase0.mjs";

test("ensurePhase0Dependency adds INF-001 when missing", () => {
	const mp = { task: "build_store" };
	const out = ensurePhase0Dependency(mp, "INF-001");
	assert.equal(out.dependent_on, "INF-001");
});

test("ensurePhase0Dependency preserves existing string and prepends INF-001", () => {
	const mp = { dependent_on: "MKT-001" };
	const out = ensurePhase0Dependency(mp, "INF-001");
	assert.deepEqual(out.dependent_on, ["INF-001", "MKT-001"]);
});

test("applyPhase0ToRow injects dependency for revenue missions", () => {
	const row = {
		id: "STO-001",
		type: "store_setup",
		mission_parameters: JSON.stringify({ task: "build_store" }),
	};
	const out = applyPhase0ToRow(row);
	const mp = JSON.parse(out.mission_parameters);
	assert.ok(mp.dependent_on);
});

test("applyPhase0ToRow does not modify infrastructure missions", () => {
	const row = {
		id: "INF-001",
		type: "infrastructure",
		mission_parameters: JSON.stringify({ task: "autonomous_registration" }),
	};
	const out = applyPhase0ToRow(row);
	assert.equal(out.mission_parameters, row.mission_parameters);
});

test("isRevenueGeneratingMission matches by task", () => {
	assert.equal(
		isRevenueGeneratingMission({ type: "unknown", missionParameters: { task: "configure_payouts" } }),
		true,
	);
});
