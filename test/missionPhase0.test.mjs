import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	applyPhase0ToRow,
	ensurePhase0Dependency,
	isRevenueGeneratingMission,
} from "../src/swarm/mission-phase0.mjs";
import { ensureNextLevelStrategyMissions } from "../src/swarm/supervisor.mjs";

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

test("ensureNextLevelStrategyMissions backfills index entries for preexisting mission files", () => {
	const prev = process.cwd();
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-missions-"));
	try {
		process.chdir(tmp);
		const missionDir = path.resolve("data/swarm/missions");
		fs.mkdirSync(missionDir, { recursive: true });
		const preId = "INF-010";
		const preFile = path.join(missionDir, `${preId}.json`);
		fs.writeFileSync(preFile, JSON.stringify({ id: preId }, null, 2));
		fs.writeFileSync(path.join(missionDir, "index.json"), JSON.stringify([], null, 2));
		ensureNextLevelStrategyMissions();
		const idx = JSON.parse(
			fs.readFileSync(path.join(missionDir, "index.json"), "utf8"),
		);
		assert.ok(
			Array.isArray(idx) && idx.some((e) => e?.id === preId && e?.file === preFile),
		);
		const createdAgain = ensureNextLevelStrategyMissions();
		assert.deepEqual(createdAgain, []);
	} finally {
		process.chdir(prev);
		fs.rmSync(tmp, { recursive: true, force: true });
	}
});
