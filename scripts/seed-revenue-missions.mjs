import fs from "node:fs";
import path from "node:path";

function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeJsonIfMissing(filePath, payload) {
	if (fs.existsSync(filePath)) return false;
	ensureDir(path.dirname(filePath));
	fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	return true;
}

function nowIso() {
	return new Date().toISOString();
}

function parseLocales() {
	const raw = String(process.env.RWC_COURSE_LOCALES || process.env.COURSES_LOCALES || "")
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	return raw.length ? raw : ["fr", "es", "ar", "de", "it"];
}

function main() {
	const missionDir = path.resolve("data", "swarm", "missions");
	ensureDir(missionDir);
	const locales = parseLocales();

	const baseGuardrails = {
		no_spam: true,
		no_purchased_leads: true,
		no_unsolicited_sms: true,
		no_pii_storage: true,
		no_exam_dumps: true,
		no_impersonation: true,
		no_unauthorized_spend: true,
	};

	const missions = [
		{
			id: "REV-001",
			title: "Localized funnels: publish multilingual course pages and track conversions",
			channel: "marketing",
			priority: "high",
			status: "pending",
			data: {
				mission_parameters: JSON.stringify({
					task: "localized_funnels",
					locales,
					objectives: [
						"publish_language_course_pages",
						"add_language_links_on_courses_page",
						"validate_sitemap_entries",
						"monitor_payments_clickthrough",
					],
					guardrails: baseGuardrails,
				}),
			},
		},
		{
			id: "REV-002",
			title: "Content factory: weekly multilingual articles (no dumps) targeting high-intent queries",
			channel: "content_creation",
			priority: "medium",
			status: "pending",
			data: {
				mission_parameters: JSON.stringify({
					task: "multilang_content_factory",
					locales,
					objectives: [
						"publish_one_article_per_locale_per_week",
						"focus_on_exam_strategy_and_real_world_skills",
						"link_to_relevant_course_pages",
					],
					guardrails: baseGuardrails,
				}),
			},
		},
		{
			id: "REV-003",
			title: "Pricing experiments: bundles and localized landing A/B tests (no dark patterns)",
			channel: "financial_setup",
			priority: "medium",
			status: "pending",
			data: {
				mission_parameters: JSON.stringify({
					task: "pricing_experiments",
					objectives: [
						"bundle_mock_exams_with_courses",
						"test_price_anchors_and_refund_copy",
						"measure_conversion_rate_changes",
					],
					guardrails: { ...baseGuardrails, no_fake_timers: true, no_fake_scarcity: true },
				}),
			},
		},
		{
			id: "REV-004",
			title: "Classroom growth: convert support requests into paid bundles with fast response",
			channel: "classroom_growth",
			priority: "high",
			status: "pending",
			data: {
				mission_parameters: JSON.stringify({
					signals: { daily_threshold: 5 },
					task: "classroom_growth",
					objectives: [
						"respond_fast_to_inbound",
						"offer_bundle_options",
						"track_request_to_payment_rate",
					],
					guardrails: baseGuardrails,
				}),
			},
		},
	];

	const written = [];
	for (const m of missions) {
		const filePath = path.join(missionDir, `${m.id}.json`);
		const payload = {
			...m,
			created_at: nowIso(),
			last_executed_at: null,
			execution_log: [],
		};
		if (writeJsonIfMissing(filePath, payload)) written.push(`data/swarm/missions/${m.id}.json`);
	}

	process.stdout.write(`${JSON.stringify({ ok: true, seeded: written.length, written }, null, 2)}\n`);
}

main();
