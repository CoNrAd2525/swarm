import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import { parseArgs } from "../src/utils/cli.mjs";

function isoDaysFromNow(days) {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + Number(days || 0));
	return d.toISOString();
}

function nowIso() {
	return new Date().toISOString();
}

function envPlaceholder(name, def = "", resolveEnv = false) {
	if (resolveEnv) {
		const v = String(process.env[name] || "").trim();
		if (v) return v;
	}
	return def || `$ENV:${name}`;
}

function buildMissions({
	status,
	createdById,
	createdBy,
	platformUrl,
	resolveEnv,
}) {
	const createdAt = nowIso();
	const updatedAt = createdAt;
	const ownerEmail =
		createdBy || envPlaceholder("SWARM_OWNER_EMAIL", "", resolveEnv);

	const rows = [];

	const infParams = {
		task: "autonomous_registration",
		platform: platformUrl,
		registration_details: {
			business_name: envPlaceholder(
				"SWARM_BUSINESS_NAME",
				"Auto-Swarm Business",
				resolveEnv,
			),
			email: envPlaceholder(
				"DROPMAGIC_EMAIL",
				ownerEmail || "owner@example.com",
				resolveEnv,
			),
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
	};

	rows.push({
		id: "INF-001",
		title: "Self-Setup - DropMagic Identity & API Auth",
		type: "infrastructure",
		priority: "critical",
		assigned_agent_ids: JSON.stringify(["sysadmin_agent", "browser_automation_agent"]),
		estimated_duration_hours: 12,
		deadline: isoDaysFromNow(2),
		mission_parameters: JSON.stringify(infParams),
		status,
		created_date: createdAt,
		updated_date: updatedAt,
		created_by_id: createdById,
		created_by: ownerEmail,
		is_sample: false,
		progress_data: JSON.stringify({
			step: "initiating_browser_session",
			api_status: "not_connected",
		}),
		revenue_generated: 0,
		actual_duration_hours: "",
		completion_notes: "",
	});

	const mkt1Params = {
		task: "source_products",
		platforms: ["temu", "tiktok"],
		criteria: {
			min_engagement_rate: 0.05,
			niche: envPlaceholder(
				"DROPSHIPPING_NICHE",
				"profitable_dropshipping",
				resolveEnv,
			),
			min_supply_margin: 2.5,
		},
		output_format: "json",
		target_keywords: ["viral gadgets", "home organizers", "car accessories"],
		dropmagic_api_integration: true,
		max_products_to_research: 50,
		dependent_on: "INF-001",
	};

	rows.push({
		id: "MKT-001",
		title: "Market Research - Winning Products (TikTok/Temu)",
		type: "market_research",
		priority: "high",
		assigned_agent_ids: JSON.stringify(["market_research_agent", "trend_analyst_agent"]),
		estimated_duration_hours: 48,
		deadline: isoDaysFromNow(7),
		mission_parameters: JSON.stringify(mkt1Params),
		status,
		created_date: createdAt,
		updated_date: updatedAt,
		created_by_id: createdById,
		created_by: ownerEmail,
		is_sample: false,
		progress_data: JSON.stringify({ step: "analyzing_social_signals", products_found: 0 }),
		revenue_generated: 0,
		actual_duration_hours: "",
		completion_notes: "",
	});

	const stoParams = {
		task: "build_store",
		platform: platformUrl,
		store_type: "general",
		automation_level: "full",
		product_uploading: "auto",
		seo_optimization: "auto",
		theme: "modern_conversion",
		backend_integration: "api_v1",
		dependent_on: ["INF-001", "MKT-001"],
	};

	rows.push({
		id: "STO-001",
		title: "Store Setup - DropMagic Autonomous Build",
		type: "store_setup",
		priority: "high",
		assigned_agent_ids: JSON.stringify(["web_scraping_agent", "content_creation_agent"]),
		estimated_duration_hours: 72,
		deadline: isoDaysFromNow(9),
		mission_parameters: JSON.stringify(stoParams),
		status,
		created_date: createdAt,
		updated_date: updatedAt,
		created_by_id: createdById,
		created_by: ownerEmail,
		is_sample: false,
		progress_data: JSON.stringify({ step: "awaiting_api_credentials", store_url: "" }),
		revenue_generated: 0,
		actual_duration_hours: "",
		completion_notes: "",
	});

	const payParams = {
		task: "configure_payouts",
		payment_gateways: ["stripe", "paypal"],
		bank_accounts: {
			us: {
				bank: envPlaceholder("PAYOUT_US_BANK_NAME", "US Bank", resolveEnv),
				account: envPlaceholder("PAYOUT_US_ACCOUNT", "", resolveEnv),
				routing: envPlaceholder("PAYOUT_US_ROUTING", "", resolveEnv),
				swift: envPlaceholder("PAYOUT_US_SWIFT", "", resolveEnv),
				currency: "USD",
				holder: envPlaceholder("PAYOUT_US_HOLDER", "", resolveEnv),
			},
			uk: {
				bank: envPlaceholder("PAYOUT_UK_BANK_NAME", "UK Bank", resolveEnv),
				account: envPlaceholder("PAYOUT_UK_ACCOUNT", "", resolveEnv),
				sort: envPlaceholder("PAYOUT_UK_SORT", "", resolveEnv),
				currency: "GBP",
				holder: envPlaceholder("PAYOUT_UK_HOLDER", "", resolveEnv),
			},
			eu: {
				bank: envPlaceholder("PAYOUT_EU_BANK_NAME", "EU Bank", resolveEnv),
				iban: envPlaceholder("PAYOUT_EU_IBAN", "", resolveEnv),
				bic: envPlaceholder("PAYOUT_EU_BIC", "", resolveEnv),
				currency: "EUR",
				holder: envPlaceholder("PAYOUT_EU_HOLDER", "", resolveEnv),
			},
		},
		paypal: envPlaceholder("OWNER_PAYPAL_EMAIL", ownerEmail || "", resolveEnv),
		payoneer_token: envPlaceholder("PAYONEER_TOKEN", "", resolveEnv),
		api_backend: "auto_configure",
		dependent_on: ["INF-001"],
	};

	rows.push({
		id: "PAY-001",
		title: "Financial Infrastructure - Multi-Currency Payout Setup",
		type: "financial_setup",
		priority: "critical",
		assigned_agent_ids: JSON.stringify(["finance_agent", "api_integration_agent"]),
		estimated_duration_hours: 24,
		deadline: isoDaysFromNow(8),
		mission_parameters: JSON.stringify(payParams),
		status,
		created_date: createdAt,
		updated_date: updatedAt,
		created_by_id: createdById,
		created_by: ownerEmail,
		is_sample: false,
		progress_data: JSON.stringify({ step: "verifying_payout_routing", gateways_active: [] }),
		revenue_generated: 0,
		actual_duration_hours: "",
		completion_notes: "",
	});

	const mkt2Params = {
		task: "generate_content",
		platforms: ["tiktok_ads", "facebook_ads", "organic_content"],
		style: "ugc",
		target_audience: "global_18_45",
		budget_optimization: "auto",
		dependent_on: ["MKT-001", "STO-001"],
	};

	rows.push({
		id: "MKT-002",
		title: "Content & Ad Generation - Viral Launch",
		type: "marketing",
		priority: "high",
		assigned_agent_ids: JSON.stringify(["content_creation_agent", "video_gen_agent"]),
		estimated_duration_hours: 168,
		deadline: isoDaysFromNow(12),
		mission_parameters: JSON.stringify(mkt2Params),
		status,
		created_date: createdAt,
		updated_date: updatedAt,
		created_by_id: createdById,
		created_by: ownerEmail,
		is_sample: false,
		progress_data: JSON.stringify({ step: "idle", campaigns_created: 0 }),
		revenue_generated: 0,
		actual_duration_hours: "",
		completion_notes: "",
	});

	const opsParams = {
		task: "monitor_and_route",
		frequency: "daily",
		currency_conversion: "auto",
		profit_split: { reinvest: 0.4, payout: 0.6 },
		payout_priority: ["us", "uk", "eu"],
		fallback_payment: "paypal",
		dependent_on: ["PAY-001", "STO-001"],
	};

	rows.push({
		id: "OPS-001",
		title: "Revenue Routing & Autonomous Operations",
		type: "operations",
		priority: "medium",
		assigned_agent_ids: JSON.stringify(["finance_agent", "ops_manager_agent"]),
		estimated_duration_hours: 720,
		deadline: isoDaysFromNow(365),
		mission_parameters: JSON.stringify(opsParams),
		status,
		created_date: createdAt,
		updated_date: updatedAt,
		created_by_id: createdById,
		created_by: ownerEmail,
		is_sample: false,
		progress_data: JSON.stringify({ step: "monitoring", total_revenue: 0, last_payout_date: "" }),
		revenue_generated: 0,
		actual_duration_hours: "",
		completion_notes: "",
	});

	return rows;
}

function main() {
	const args = parseArgs(process.argv);
	const status = String(args.status || "pending").trim().toLowerCase();
	const createdById = String(args["created-by-id"] ?? args.createdById ?? "").trim();
	const createdBy = String(args["created-by"] ?? args.createdBy ?? "").trim();
	const platformUrl = String(args.platform ?? "https://dropmagic.ai/").trim();
	const resolveEnv =
		args["resolve-env"] === true || args.resolveEnv === true;

	const rows = buildMissions({
		status,
		createdById,
		createdBy,
		platformUrl,
		resolveEnv,
	});

	const columns = [
		"title",
		"type",
		"priority",
		"status",
		"assigned_agent_ids",
		"mission_parameters",
		"progress_data",
		"estimated_duration_hours",
		"actual_duration_hours",
		"deadline",
		"completion_notes",
		"revenue_generated",
		"id",
		"created_date",
		"updated_date",
		"created_by_id",
		"created_by",
		"is_sample",
	];

	const csv = stringify(rows, { header: true, columns });

	const out = String(args.out || "").trim();
	if (out) {
		const abs = path.resolve(out);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, csv, "utf8");
		process.stdout.write(JSON.stringify({ ok: true, out: abs }) + "\n");
		return;
	}

	process.stdout.write(csv);
}

main();
