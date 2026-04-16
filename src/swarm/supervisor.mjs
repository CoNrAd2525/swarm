import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { parse as csvParse } from "csv-parse/sync";
import { calculatePosp, writePospProof } from "../consensus/posp.mjs";
import { runRevenueSwarm } from "../revenue/swarm-runner.mjs";
import {
	checkEgressIp,
	writeEgressStatus,
} from "../security/egress-ip-guard.mjs";
import { AgentReplenisher } from "./agent-replenisher.mjs";
import { aimsToMissions, loadAims, writeMissions } from "./aims-ingest.mjs";
import { applyPhase0ToRow } from "./mission-phase0.mjs";
import { buildMissionPlan, writeMissionPlan } from "./mission-planner.mjs";
import { pollNews } from "./news-watch.mjs";
import { checkNewBatches } from "./payoneer-watch.mjs";
import { writeRoutesStatus } from "./routes-status.mjs";
import { SwarmMemory } from "./shared-memory.mjs";

function parseCsvList(raw) {
	return String(raw || "")
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
}

function allowedMissionStatuses() {
	const env = parseCsvList(process.env.SWARM_MISSION_IMPORT_STATUSES);
	if (env.length) return new Set(env);
	return new Set(["deployed", "pending"]);
}

function allowedMissionCategories() {
	const env = parseCsvList(process.env.SWARM_MISSION_IMPORT_CATEGORIES);
	if (env.length) return new Set(env);
	return new Set([
		"operations",
		"content_creation",
		"infrastructure",
		"market_research",
		"store_setup",
		"financial_setup",
		"marketing",
	]);
}

function indexAddUnique(index, entry) {
	if (!entry?.id || !entry?.file) return;
	if (index.some((e) => e?.id === entry.id)) return;
	index.push(entry);
}

function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeJsonRead(file) {
	try {
		if (!fs.existsSync(file)) return null;
		const txt = fs.readFileSync(file, "utf8");
		return JSON.parse(txt);
	} catch {
		return null;
	}
}

function computeDailyRevenueCurrent() {
	try {
		const file = path.resolve("data/financial/settlement_ledger.json");
		const json = safeJsonRead(file);
		if (!json || !Array.isArray(json.transactions)) return 0;
		const start = new Date();
		start.setUTCHours(0, 0, 0, 0);
		const end = new Date();
		end.setUTCHours(23, 59, 59, 999);
		let total = 0;
		for (const t of json.transactions) {
			const ts = new Date(String(t?.timestamp || ""));
			if (Number.isNaN(ts.getTime())) continue;
			if (ts >= start && ts <= end) {
				const amt = Number(t?.amount || 0);
				if (Number.isFinite(amt)) total += amt;
			}
		}
		return Math.max(0, total);
	} catch {
		return 0;
	}
}

function writeSuccessMetrics({ target, current }) {
	const dir = path.resolve("data/swarm");
	ensureDir(dir);
	const file = path.join(dir, "success_metrics.json");
	const payload = {
		at: new Date().toISOString(),
		target_per_day: target,
		current_per_day: current,
		ok: Number(current) >= Number(target),
		failure_reason: Number(current) > 0 ? null : "EMPTY_OWNER_ACCOUNTS",
	};
	fs.writeFileSync(file, JSON.stringify(payload, null, 2));
	return file;
}

function readBase44ExportMissions() {
	try {
		const file = path.resolve("data/base44_export/Mission.json");
		if (!fs.existsSync(file)) return [];
		const txt = fs.readFileSync(file, "utf8");
		const json = JSON.parse(txt);
		return Array.isArray(json) ? json : [];
	} catch {
		return [];
	}
}

function syncBase44Missions() {
	const missionDir = path.resolve("data/swarm/missions");
	ensureDir(missionDir);
	const base44 = readBase44ExportMissions();
	if (!base44.length) return [];
	const out = [];
	const allowedStatus = allowedMissionStatuses();
	const allowedCat = allowedMissionCategories();
	for (const m of base44) {
		const title = String(m?.title || "").trim();
		const status = String(m?.status || "")
			.trim()
			.toLowerCase();
		const category = String(m?.category || "")
			.trim()
			.toLowerCase();
		const id = String(m?.id || "").trim() || `b44_${Date.now()}`;
		if (!title) continue;
		if (!allowedStatus.has(status)) continue;
		if (category && !allowedCat.has(category)) continue;
		const targetFile = path.join(missionDir, `${id}.json`);
		if (fs.existsSync(targetFile)) continue;
		const mission = {
			id,
			title,
			channel: category || "operations",
			priority: String(m?.priority || "medium"),
			status,
			data: { ...(m?.data || m?.meta || {}), status, category },
			created_at: m?.created_date || new Date().toISOString(),
		};
		out.push(mission);
	}
	if (!out.length) return [];
	const indexPath = path.join(missionDir, "index.json");
	let index = [];
	try {
		if (fs.existsSync(indexPath))
			index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
	} catch {
		index = [];
	}
	for (const mission of out) {
		const f = path.join(missionDir, `${mission.id}.json`);
		fs.writeFileSync(f, JSON.stringify(mission, null, 2));
		indexAddUnique(index, { id: mission.id, file: f });
	}
	fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
	return out.map((m) => m.id);
}

function readCsv(filePath) {
	try {
		const txt = fs.readFileSync(filePath, "utf8");
		return csvParse(txt, { columns: true, skip_empty_lines: true });
	} catch {
		return [];
	}
}

function listArchiveMissionCsvs() {
	try {
		const dir = path.resolve("archive");
		if (!fs.existsSync(dir)) return [];
		const files = fs
			.readdirSync(dir)
			.filter((f) => /^Mission_export.*\.csv$/i.test(f))
			.map((f) => path.join(dir, f));
		return files;
	} catch {
		return [];
	}
}

function normalizeCsvMission(row) {
	const title = String(row?.title ?? row?.["Mission Title"] ?? row?.[0] ?? "")
		.trim()
		.replace(/^"|"$/g, "");
	const category = String(row?.category ?? row?.type ?? "")
		.trim()
		.toLowerCase();
	const status = String(row?.status ?? "")
		.trim()
		.toLowerCase();
	const id =
		String(row?.id ?? row?.mission_id ?? row?.["Mission ID"] ?? "").trim() ||
		`csv_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
	return { id, title, category, status, row };
}

function syncArchiveCsvMissions() {
	const missionDir = path.resolve("data/swarm/missions");
	ensureDir(missionDir);
	const files = listArchiveMissionCsvs();
	if (!files.length) return [];
	const out = [];
	const allowed = allowedMissionCategories();
	const allowedStatus = allowedMissionStatuses();
	for (const file of files) {
		const rows = readCsv(file);
		for (const r of rows) {
			const r2 = applyPhase0ToRow(r);
			const m = normalizeCsvMission(r2);
			if (!m.title) continue;
			if (!allowedStatus.has(m.status)) continue;
			if (!allowed.has(m.category)) continue;
			const targetFile = path.join(missionDir, `${m.id}.json`);
			if (fs.existsSync(targetFile)) continue;
			const mission = {
				id: m.id,
				title: m.title,
				channel: m.category || "operations",
				priority: String(r2?.priority || "high"),
				status: m.status,
				data: r2,
				created_at: new Date().toISOString(),
			};
			out.push(mission);
		}
	}
	if (!out.length) return [];
	const indexPath = path.join(missionDir, "index.json");
	let index = [];
	try {
		if (fs.existsSync(indexPath))
			index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
	} catch {
		index = [];
	}
	for (const mission of out) {
		const f = path.join(missionDir, `${mission.id}.json`);
		fs.writeFileSync(f, JSON.stringify(mission, null, 2));
		indexAddUnique(index, { id: mission.id, file: f });
	}
	fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
	return out.map((m) => m.id);
}

function ensureUpgradeMission() {
	const missionDir = path.resolve("data/swarm/missions");
	ensureDir(missionDir);
	const id = "b44_upgrade_premium";
	const targetFile = path.join(missionDir, `${id}.json`);
	if (fs.existsSync(targetFile)) return null;
	const mission = {
		id,
		title: "Upgrade Base44 plan to Premium using promo TAAFT",
		channel: "operations",
		priority: "high",
		data: {
			plan: "premium",
			promo_code: "TAAFT",
		},
		created_at: new Date().toISOString(),
	};
	fs.writeFileSync(targetFile, JSON.stringify(mission, null, 2));
	const indexPath = path.join(missionDir, "index.json");
	let index = [];
	try {
		if (fs.existsSync(indexPath))
			index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
	} catch {
		index = [];
	}
	indexAddUnique(index, { id: mission.id, file: targetFile });
	fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
	return id;
}

function ensurePhase0BootstrapMission() {
	const missionDir = path.resolve("data/swarm/missions");
	ensureDir(missionDir);
	const id = "INF-001";
	const targetFile = path.join(missionDir, `${id}.json`);
	if (fs.existsSync(targetFile)) return null;
	const mission = {
		id,
		title: "Self-Setup - DropMagic Identity & API Auth",
		channel: "infrastructure",
		priority: "critical",
		data: {
			mission_parameters: JSON.stringify({
				task: "autonomous_registration",
				platform: "https://dropmagic.ai/",
				registration_details: {
					business_name: "$ENV:SWARM_BUSINESS_NAME",
					email: "$ENV:DROPMAGIC_EMAIL",
				},
				api_config: {
					action: "generate_api_keys",
					scope: ["read", "write", "products", "orders", "analytics"],
					webhook_setup: {
						enable: true,
						events: ["order_created", "payment_captured"],
					},
				},
				verification_method: "automated_email_check",
			}),
		},
		created_at: new Date().toISOString(),
	};
	fs.writeFileSync(targetFile, JSON.stringify(mission, null, 2));
	const indexPath = path.join(missionDir, "index.json");
	let index = [];
	try {
		if (fs.existsSync(indexPath))
			index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
	} catch {
		index = [];
	}
	indexAddUnique(index, { id: mission.id, file: targetFile });
	fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
	return id;
}

function loadAgents() {
	const dir = path.resolve("data/swarm");
	const file = path.join(dir, "agents.json");
	ensureDir(dir);
	if (!fs.existsSync(file)) return { agents: [], path: file };
	try {
		const txt = fs.readFileSync(file, "utf8");
		const json = JSON.parse(txt);
		const agents = Array.isArray(json?.agents) ? json.agents : [];
		return { agents, path: file };
	} catch {
		return { agents: [], path: file };
	}
}

function saveAgents(filePath, agents) {
	const out = { agents };
	fs.writeFileSync(filePath, JSON.stringify(out, null, 2));
}

async function runCycle({ memory, replenisher, filePath }) {
	const aims = loadAims();
	const missions = aimsToMissions(aims);
	if (missions.length) {
		writeMissions(missions);
	}
	let headhunter = null;
	try {
		const hh = spawnSync(process.execPath, ["scripts/headhunter-daemon.mjs"], {
			cwd: process.cwd(),
			encoding: "utf8",
		});
		try {
			headhunter = JSON.parse((hh.stdout || "").trim());
		} catch {
			headhunter = { ok: false, raw: (hh.stdout || "").trim() };
		}
	} catch {
		headhunter = { ok: false };
	}
	const synced = syncBase44Missions();
	const syncedCsv = syncArchiveCsvMissions();
	let campaigns = { ok: true, output: null };
	try {
		const cs = spawnSync(
			process.execPath,
			[
				"scripts/sync-campaigns-from-csv.mjs",
				"--in",
				path.join(process.cwd(), "rank", "Campaign_export (5).csv"),
			],
			{
				cwd: process.cwd(),
				encoding: "utf8",
			},
		);
		campaigns.output = (cs.stdout || "").trim();
	} catch {
		campaigns = { ok: false };
	}
	let payoutPromotion = { ok: true, output: null };
	try {
		const prx = spawnSync(
			process.execPath,
			["scripts/promote-offline-payout-requests.mjs"],
			{
				cwd: process.cwd(),
				encoding: "utf8",
			},
		);
		payoutPromotion.output = (prx.stdout || "").trim();
	} catch {
		payoutPromotion = { ok: false };
	}
	let upgrade = { ok: true, output: null };
	try {
		const up = spawnSync(process.execPath, ["scripts/upgrade-plan.mjs"], {
			cwd: process.cwd(),
			encoding: "utf8",
		});
		upgrade.output = (up.stdout || "").trim();
	} catch {
		upgrade = { ok: false };
	}
	let upgradeMissionId = null;
	try {
		upgradeMissionId = ensureUpgradeMission();
	} catch {
		upgradeMissionId = null;
	}
	let phase0MissionId = null;
	try {
		phase0MissionId = ensurePhase0BootstrapMission();
	} catch {
		phase0MissionId = null;
	}
	let missionPlanPath = null;
	let missionDeploy = { ok: true, output: null };
	try {
		const plan = buildMissionPlan({});
		missionPlanPath = writeMissionPlan(plan);
	} catch {
		missionPlanPath = null;
	}
	try {
		const dm = spawnSync(process.execPath, ["scripts/deploy-missions.mjs"], {
			cwd: process.cwd(),
			encoding: "utf8",
			env: { ...process.env, SWARM_DEPLOY_STATUSES: "pending" },
		});
		missionDeploy.output = (dm.stdout || "").trim();
	} catch {
		missionDeploy = { ok: false, output: null };
	}
	const rep = replenisher.replenish();
	saveAgents(filePath, memory.get("agents"));
	const rev = await runRevenueSwarm();
	const holder = process.env.SWARM_INSTANCE_ID || `local:${process.pid}`;
	const posp = calculatePosp({
		agentId: holder,
		windowDays: Number(process.env.POSP_WINDOW_DAYS ?? "30") || 30,
	});
	const proofPath = writePospProof(posp);
	const missionDir = path.resolve("data/swarm/missions");
	try {
		const idxPath = path.join(missionDir, "index.json");
		if (fs.existsSync(idxPath)) {
			const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
			for (const ent of Array.isArray(idx) ? idx : []) {
				try {
					const m = JSON.parse(fs.readFileSync(ent.file, "utf8"));
					m.posp_proof = {
						score: posp.score,
						file: proofPath,
						hash: posp.proof_hash,
					};
					fs.writeFileSync(ent.file, JSON.stringify(m, null, 2));
				} catch {}
			}
		}
	} catch {}
	const current = computeDailyRevenueCurrent();
	const metricsFile = writeSuccessMetrics({ target: 1500, current });
	const newsSources = [
		"https://www.techuk.org/resource/new-ico-tech-futures-report-on-agentic-ai-opportunities-and-considerations.html",
		"https://securityboulevard.com/2026/01/bodysnatcher-cve-2025-12420-a-broken-authentication-and-agentic-hijacking-vulnerability-in-servicenow/",
		"https://thenewstack.io/map-your-api-landscape-to-prevent-agentic-ai-disaster/",
		"https://www.zacks.com/stock/news/2815867/paypals-agentic-commerce-expansion-will-it-boost-top-line-growth?cid=CS-NEWSNOW-HL-analyst_blog%7Cquick_take-2815867",
	];
	let news = null;
	try {
		news = await pollNews(newsSources);
	} catch {
		news = { ok: false };
	}
	let payoneer = null;
	try {
		payoneer = checkNewBatches({});
	} catch {
		payoneer = { ok: false };
	}
	let routesFile = null;
	try {
		routesFile = writeRoutesStatus();
	} catch {}
	let egressFile = null;
	let egress = null;
	try {
		egressFile = await writeEgressStatus();
		egress = await checkEgressIp();
	} catch {}
	let review = { ok: true, file: null };
	try {
		const pr = spawnSync(process.execPath, ["scripts/peer-review.mjs"], {
			cwd: process.cwd(),
			encoding: "utf8",
		});
		review.file = (pr.stdout || "").trim();
	} catch {
		review = { ok: false };
	}
	let followups = { ok: true, ran: [] };
	try {
		const dirs = String(
			process.env.FOLLOWUPS_DIRS || "submitted.manually,settlements/payoneer",
		)
			.split(",")
			.map((d) => d.trim())
			.filter((d) => !!d);
		const delay = String(process.env.FOLLOWUP_DELAY_HOURS || "24");
		for (const d of dirs) {
			const abs = path.resolve(d);
			if (!fs.existsSync(abs)) continue;
			const res = spawnSync(
				process.execPath,
				[
					"scripts/generate-payoneer-followups.mjs",
					`--dir=${abs}`,
					`--delay_hours=${delay}`,
				],
				{
					cwd: process.cwd(),
					encoding: "utf8",
				},
			);
			followups.ran.push({
				dir: abs,
				status: res.status,
				output: (res.stdout || "").trim(),
			});
		}
	} catch {
		followups = { ok: false };
	}
	const out = {
		ok: true,
		headhunter,
		replenish: rep,
		revenue: rev,
		campaigns_sync: campaigns,
		payout_promotion: payoutPromotion,
		base44_upgrade: upgrade,
		base44_upgrade_mission_id: upgradeMissionId,
		posp: { score: posp.score, proof: proofPath },
		news,
		payoneer,
		review,
		followups,
		routes_file: routesFile,
		egress_file: egressFile,
		egress,
		mission_plan_file: missionPlanPath,
		mission_deploy: missionDeploy,
		success_metrics_file: metricsFile,
		at: new Date().toISOString(),
	};
	console.log(JSON.stringify(out));
	return out;
}

export async function startSupervisor({ intervalMs, minActive } = {}) {
	const iv =
		Number(intervalMs ?? process.env.SWARM_SUPERVISOR_INTERVAL_MS ?? 60000) ||
		60000;
	const min =
		Number(minActive ?? process.env.SWARM_MIN_ACTIVE_AGENTS ?? 5) || 5;
	const { agents, path: filePath } = loadAgents();
	const memory = {
		get(key) {
			if (key === "agents") return agents;
			return null;
		},
		set(key, value) {
			if (key === "agents" && Array.isArray(value)) {
				agents.splice(0, agents.length, ...value);
			}
		},
	};
	const replenisher = new AgentReplenisher({ memory, minActive: min });
	await runCycle({ memory, replenisher, filePath });
	setInterval(() => {
		runCycle({ memory, replenisher, filePath }).catch(() => {});
	}, iv);
	return { ok: true, intervalMs: iv, minActive: min };
}

const selfPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isMain = argvPath && path.resolve(selfPath) === argvPath;

if (isMain) {
	startSupervisor().catch(() => {});
}
