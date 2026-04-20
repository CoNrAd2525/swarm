import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeTextIfChanged(p, text) {
	ensureDir(path.dirname(p));
	const next = String(text ?? "");
	try {
		const prev = fs.readFileSync(p, "utf8");
		if (prev === next) return false;
	} catch {}
	fs.writeFileSync(p, next, "utf8");
	return true;
}

function escapeHtml(s) {
	return String(s ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function getDomain() {
	const a = String(process.env.SITE_DOMAIN || "").trim();
	const b = String(process.env.SITE_CNAME || "").trim();
	return a || b || "realworldcerts.com";
}

function parseLocales() {
	const raw = String(process.env.RWC_COURSE_LOCALES || process.env.COURSES_LOCALES || "")
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	return raw.length ? raw : ["fr", "es", "ar", "de", "it"];
}

function normalizeLocale(locale) {
	return String(locale || "")
		.trim()
		.toLowerCase();
}

function supportedLocales(locales) {
	return (locales || []).map(normalizeLocale).filter((l) => l && l in i18n);
}

function cachePath() {
	return path.resolve("rank", "output", "site-data", "i18n-cache.json");
}

function readJson(p) {
	try {
		return JSON.parse(fs.readFileSync(p, "utf8"));
	} catch {
		return null;
	}
}

function writeJson(p, obj) {
	ensureDir(path.dirname(p));
	fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

function hashKey(locale, text) {
	const h = crypto.createHash("sha256");
	h.update(`${locale}\n${text}`);
	return h.digest("hex").slice(0, 32);
}

function getOpenAiKey() {
	return (
		String(process.env.OPENAI_API_KEY || "").trim() ||
		String(process.env.OPENAI_KEY || "").trim()
	);
}

function getOpenAiModel() {
	return String(process.env.OPENAI_MODEL || "").trim() || "gpt-4o-mini";
}

function getOpenRouterKey() {
	return (
		String(process.env.OPENROUTER_API_KEY || "").trim() ||
		String(process.env.OPENROUTER_KEY || "").trim()
	);
}

function getOpenRouterModel() {
	return String(process.env.OPENROUTER_MODEL || "").trim() || "openai/gpt-4o-mini";
}

function llmProvider() {
	if (getOpenRouterKey()) return "openrouter";
	if (getOpenAiKey()) return "openai";
	return "none";
}

function llmModel() {
	if (llmProvider() === "openrouter") return getOpenRouterModel();
	if (llmProvider() === "openai") return getOpenAiModel();
	return null;
}

function translationEnabled() {
	const provider = llmProvider();
	if (provider === "none") return false;
	const v = String(process.env.RWC_ENABLE_LLM_TRANSLATION || "").trim().toLowerCase();
	if (!v) return false;
	return v === "true" || v === "1" || v === "yes";
}

function translationMaxCalls() {
	const raw = String(process.env.RWC_TRANSLATION_MAX_CALLS_PER_RUN || "").trim();
	const n = raw ? Number(raw) : 120;
	return Number.isFinite(n) && n >= 0 ? n : 120;
}

function translationPolicyViolations(text) {
	const t = String(text || "").toLowerCase();
	const patterns = [
		/accredited|accreditation|official certification|officially certified|guaranteed job|guaranteed hire/i,
		/accr[ée]dit[ée]|\bcertification officielle\b|\bemploi garanti\b|\bembauche garantie\b/i,
		/acreditad[oa]|\bcertificaci[oó]n oficial\b|\btrabajo garantizado\b|\bcontrataci[oó]n garantizada\b/i,
		/معتمد|اعتماد|شهادة رسمية|وظيفة مضمونة|توظيف مضمون/i,
		/akkreditiert|amtliche zertifizierung|job garantiert|garantierte einstellung/i,
		/accreditat[oa]|certificazione ufficiale|lavoro garantito|assunzione garantita/i,
	];
	return patterns.filter((re) => re.test(t)).map((re) => String(re));
}

function looksUntranslated(locale, source, translated) {
	const l = normalizeLocale(locale);
	if (l === "en") return false;
	const s = String(source ?? "").trim();
	const t = String(translated ?? "").trim();
	if (!s || !t) return true;
	if (t === s && s.length >= 12) return true;
	return false;
}

async function translateViaOpenAi({ locale, text }) {
	const apiKey = getOpenAiKey();
	const model = getOpenAiModel();
	const r = await fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			temperature: 0.2,
			messages: [
				{
					role: "system",
					content:
						"Translate the user text into the requested language. Preserve meaning, structure, and product names. Do not add claims, certifications, numbers, or extra content. Output only the translation.",
				},
				{
					role: "user",
					content: `LANG=${locale}\nTEXT=${text}`,
				},
			],
		}),
	});
	if (!r.ok) {
		const t = await r.text();
		throw new Error(`openai_http_${r.status}:${t.slice(0, 200)}`);
	}
	const json = await r.json();
	const out = json?.choices?.[0]?.message?.content;
	return String(out ?? "").trim();
}

async function translateViaOpenRouter({ locale, text }) {
	const apiKey = getOpenRouterKey();
	const model = getOpenRouterModel();
	const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"HTTP-Referer": String(process.env.SITE_URL || process.env.SITE_DOMAIN || "https://realworldcerts.com"),
			"X-Title": "realworldcerts-i18n",
		},
		body: JSON.stringify({
			model,
			temperature: 0.2,
			messages: [
				{
					role: "system",
					content:
						"Translate the user text into the requested language. Preserve meaning, structure, and product names. Do not add claims, certifications, numbers, or extra content. Output only the translation.",
				},
				{
					role: "user",
					content: `LANG=${locale}\nTEXT=${text}`,
				},
			],
		}),
	});
	if (!r.ok) {
		const t = await r.text();
		throw new Error(`openrouter_http_${r.status}:${t.slice(0, 200)}`);
	}
	const json = await r.json();
	const out = json?.choices?.[0]?.message?.content;
	return String(out ?? "").trim();
}

async function translateViaLlm({ locale, text }) {
	const provider = llmProvider();
	if (provider === "openrouter") return translateViaOpenRouter({ locale, text });
	if (provider === "openai") return translateViaOpenAi({ locale, text });
	return null;
}

async function translateText({ locale, text, cache, useLlm, budget }) {
	const key = hashKey(locale, text);
	if (cache[key]) return cache[key];
	if (!useLlm) return null;
	if (budget.used >= budget.max) return null;
	const t = await translateViaLlm({ locale, text });
	if (!t) return null;
	budget.used += 1;
	const violations = translationPolicyViolations(t);
	if (violations.length) {
		budget.violations.push({ locale, key, violations });
		return null;
	}
	if (looksUntranslated(locale, text, t)) {
		budget.violations.push({ locale, key, violations: ["untranslated_or_identical"] });
		return null;
	}
	cache[key] = t;
	return t;
}

const catalog = [
	{
		sku: "cybersecurity-foundations",
		price: 39,
		level: "techbeginner",
		hours: "6h",
		title_en: "Cybersecurity Foundations — IAM & Threat Modeling",
		desc_en: "Access control, identity & policy, threat modeling, secure workflows.",
		learn_en: ["Understand IAM", "Build threat models", "Apply secure patterns"],
		detail_learn_en: [
			"Identity & access control fundamentals (users, roles, permissions)",
			"Least privilege and secure policy design",
			"Threat modeling workflow (assets → threats → mitigations)",
			"Secure-by-default patterns for common systems",
		],
		detail_outline_en: [
			"Security basics: CIA, risk, and attack surface",
			"IAM concepts: authentication vs authorization",
			"Policies: allow/deny logic and common pitfalls",
			"Threat modeling: STRIDE-style thinking",
			"Mitigations: logging, segmentation, validation",
			"Practical exercises + review checklist",
		],
	},
	{
		sku: "networking-essentials",
		price: 29,
		level: "techbeginner",
		hours: "5h",
		title_en: "Networking Essentials — DNS, HTTPS, CDN",
		desc_en: "Hands‑on fundamentals for DNS, TLS/HTTPS, caching/CDNs and status codes.",
		learn_en: ["Configure DNS", "Explain HTTPS", "Optimize with CDN"],
		detail_learn_en: [
			"DNS records, propagation, and troubleshooting",
			"TLS/HTTPS basics and certificate concepts",
			"HTTP caching, CDNs, and performance trade-offs",
			"Status codes and browser/network debugging",
		],
		detail_outline_en: [
			"DNS fundamentals: A/AAAA/CNAME/TXT",
			"HTTPS: TLS handshake and certificates",
			"HTTP essentials: requests, headers, status codes",
			"Caching: browser, CDN, and origin settings",
			"CDN patterns and when to use them",
			"Exercises + practical checklist",
		],
	},
	{
		sku: "business-analytics",
		price: 45,
		level: "non-techintermediate",
		hours: "8h",
		title_en: "Business Analytics — Excel, SQL & Dashboards",
		desc_en: "Data cleaning, pivot tables, SQL queries, and executive dashboards.",
		learn_en: ["Analyze data", "Build dashboards", "Present insights"],
		detail_learn_en: [
			"Clean data, build pivot tables, and summarize metrics",
			"Write practical SQL queries for reporting",
			"Build dashboards and KPI views",
			"Communicate insights with clear narratives",
		],
		detail_outline_en: [
			"Data basics: types, quality, and cleaning",
			"Excel pivots and reporting workflows",
			"SQL fundamentals: select, join, group by",
			"Dashboards: KPIs, trends, and segmentation",
			"Storytelling: slides, memos, and decisions",
			"Exercises + templates",
		],
	},
	{
		sku: "legal-research-genai",
		price: 49,
		level: "non-techintermediate",
		hours: "6h",
		title_en: "Legal Research with GenAI — Citations & Bluebook Basics",
		desc_en: "Responsible AI assistance, citation hygiene, Bluebook overview.",
		learn_en: ["Structure queries", "Verify citations", "Apply Bluebook"],
		detail_learn_en: [
			"Use AI as an assistant while maintaining responsibility and verification",
			"Build research workflows and query strategies",
			"Check sources and citation hygiene",
			"Bluebook overview and common patterns",
		],
		detail_outline_en: [
			"Research workflow: issue → sources → synthesis",
			"Prompting for research without hallucinations",
			"Verification: primary vs secondary sources",
			"Citation hygiene and Bluebook basics",
			"Drafting: memos and structured outputs",
			"Exercises + checklists",
		],
	},
	{
		sku: "project-management",
		price: 35,
		level: "non-techbeginner",
		hours: "5h",
		title_en: "Project Management — Sprint Planning & Risk Logs",
		desc_en: "Agile sprints, burndown charts, risk registers and stakeholder updates.",
		learn_en: ["Plan sprints", "Track risks", "Communicate status"],
		detail_learn_en: [
			"Sprint planning and prioritization",
			"Risk registers, issue tracking, and mitigation planning",
			"Simple metrics: burndown and throughput",
			"Stakeholder communication and status updates",
		],
		detail_outline_en: [
			"Project basics: scope, time, and constraints",
			"Agile sprint planning and backlog hygiene",
			"Risk logs and mitigation workflow",
			"Progress tracking: burndown and checkpoints",
			"Stakeholder updates that reduce churn",
			"Exercises + templates",
		],
	},
	{
		sku: "mock-exam-fundamentals",
		price: 15,
		level: "techbeginner",
		hours: "0.5h",
		title_en: "Mock Exam — Fundamentals (Timed)",
		desc_en: "Timed practice exam with auto‑scoring and topic analytics.",
		learn_en: ["Exam pacing", "Identify weak topics"],
		detail_learn_en: [
			"Timed pacing practice",
			"Topic-level analytics and review strategy",
			"Repeatable workflows for improvement",
		],
		detail_outline_en: [
			"Warm-up and pacing strategy",
			"Timed exam session",
			"Score review and weak-topic plan",
		],
	},
	{
		sku: "mock-exam-professional",
		price: 25,
		level: "techintermediate",
		hours: "0.75h",
		title_en: "Mock Exam — Professional (Advanced)",
		desc_en: "Advanced mock exam covering real exam patterns.",
		learn_en: ["Complex scenarios", "Reduce errors"],
		detail_learn_en: [
			"Advanced scenario practice",
			"Error pattern reduction",
			"Structured review loops",
		],
		detail_outline_en: ["Timed exam session", "Deep review and remediation plan"],
	},
	{
		sku: "mock-marathon",
		price: 55,
		level: "techadvanced",
		hours: "2.5h",
		title_en: "Mock Marathon — Three Exams Series",
		desc_en: "Three consecutive mocks with progressive difficulty.",
		learn_en: ["Stamina", "Consistency", "Time management"],
		detail_learn_en: [
			"Stamina and time management",
			"Consistency across multiple runs",
			"Review process and weak-topic refinement",
		],
		detail_outline_en: ["Mock 1", "Mock 2", "Mock 3", "Review and plan"],
	},
	{
		sku: "enterprise-team-pack",
		price: 199,
		level: "bundleall",
		hours: "20h",
		title_en: "Enterprise Team Pack — Multi‑track Access",
		desc_en: "Team bundle with business+tech tracks, templates, and support.",
		learn_en: ["Team onboarding", "Shared resources", "Support channel"],
		detail_learn_en: [
			"Team onboarding approach and track selection",
			"Shared templates and internal rollout",
			"Support workflow and escalation routes",
		],
		detail_outline_en: ["Tracks and bundles", "Onboarding plan", "Support and operations"],
	},
	{
		sku: "cloud-fundamentals",
		price: 49,
		level: "techbeginner",
		hours: "7h",
		title_en: "Cloud Fundamentals — IAM, Networking, and Cost Control",
		desc_en: "Core cloud concepts: identity, networking, security, and cost hygiene.",
		learn_en: ["Understand cloud IAM", "Design secure networks", "Control cloud cost"],
		detail_learn_en: [
			"Core cloud services and shared responsibility basics",
			"IAM: roles, permissions, and least privilege",
			"Networking: VPC/VNet concepts, routing, and firewalls",
			"Cost control: budgets, tagging, and alerts",
		],
		detail_outline_en: [
			"Cloud mental models and service categories",
			"IAM and least privilege",
			"Networking fundamentals",
			"Logging and monitoring basics",
			"Cost controls and operational hygiene",
			"Exercises + checklists",
		],
	},
	{
		sku: "python-automation",
		price: 59,
		level: "techintermediate",
		hours: "9h",
		title_en: "Python Automation — Data Pipelines & Scripts that Ship",
		desc_en: "Practical automation: file workflows, APIs, data transforms, and scheduling.",
		learn_en: ["Automate workflows", "Call APIs safely", "Ship reliable scripts"],
		detail_learn_en: [
			"Build robust scripts with logging and error handling",
			"Work with files, CSV/JSON, and transforms",
			"Call APIs with retries and rate-limit safety",
			"Schedule jobs and monitor outcomes",
		],
		detail_outline_en: [
			"Project setup and environment hygiene",
			"File workflows and data transforms",
			"HTTP APIs: auth, retries, and pagination",
			"Scheduling and monitoring",
			"Packaging and operational checklists",
			"Exercises + templates",
		],
	},
	{
		sku: "excel-finance",
		price: 39,
		level: "non-techbeginner",
		hours: "6h",
		title_en: "Excel for Finance — Forecasts, Models & Decision Tables",
		desc_en: "Practical Excel models: forecasting, sensitivity tables, and clean reporting.",
		learn_en: ["Build forecasts", "Create models", "Report cleanly"],
		detail_learn_en: [
			"Build clean financial tables and model layouts",
			"Forecasting basics and scenario planning",
			"Sensitivity tables and decision support",
			"Reporting: charts and executive summaries",
		],
		detail_outline_en: [
			"Model structure and assumptions",
			"Forecasting and scenarios",
			"Sensitivity and what-if analysis",
			"Reporting and chart hygiene",
			"Templates and review checklists",
			"Exercises",
		],
	},
	{
		sku: "customer-success-ops",
		price: 35,
		level: "non-techintermediate",
		hours: "5h",
		title_en: "Customer Success Ops — Support Playbooks & Retention Loops",
		desc_en: "Support workflows, playbooks, escalation, and retention metrics.",
		learn_en: ["Build playbooks", "Improve retention", "Run escalations"],
		detail_learn_en: [
			"Support playbooks and response standards",
			"Escalation routes and incident communication",
			"Retention loops: feedback, fixes, and follow-ups",
			"Metrics: response time, churn signals, and QA",
		],
		detail_outline_en: [
			"Support system basics",
			"Playbooks and escalation",
			"Retention loops and quality control",
			"Metrics and reporting",
			"Templates and checklists",
			"Exercises",
		],
	},
];

const i18n = {
	fr: {
		lang: "fr",
		dir: "ltr",
		brand_sub: "Cours et ressources",
		courses: "Cours",
		payments: "Paiements",
		support: "Support",
		how_access: "Comment l’accès fonctionne",
		access_p1: "Après paiement, vous recevez par email les liens d’accès (Google Drive) et les supports inclus.",
		access_p2: "Besoin d’aide ou de tarifs équipe ? Contactez le support.",
		go_payments: "Aller aux paiements",
		buy: "Acheter",
		details: "Détails",
		course_details: "Détails du cours",
		what_learn: "Ce que vous allez apprendre",
		outline: "Plan",
	},
	es: {
		lang: "es",
		dir: "ltr",
		brand_sub: "Cursos y recursos",
		courses: "Cursos",
		payments: "Pagos",
		support: "Soporte",
		how_access: "Cómo funciona el acceso",
		access_p1: "Después del pago, recibes por email los enlaces de acceso (Google Drive) y los materiales incluidos.",
		access_p2: "¿Necesitas ayuda o precios para equipos? Contacta con soporte.",
		go_payments: "Ir a pagos",
		buy: "Comprar",
		details: "Detalles",
		course_details: "Detalles del curso",
		what_learn: "Lo que aprenderás",
		outline: "Temario",
	},
	ar: {
		lang: "ar",
		dir: "rtl",
		brand_sub: "دورات وموارد",
		courses: "الدورات",
		payments: "المدفوعات",
		support: "الدعم",
		how_access: "كيف يعمل الوصول",
		access_p1: "بعد الدفع ستتلقى عبر البريد الإلكتروني روابط الوصول (Google Drive) وأي مواد تدريبية مرفقة.",
		access_p2: "تحتاج مساعدة أو أسعار للشركات؟ تواصل مع الدعم.",
		go_payments: "الانتقال إلى المدفوعات",
		buy: "شراء",
		details: "التفاصيل",
		course_details: "تفاصيل الدورة",
		what_learn: "ماذا ستتعلم",
		outline: "المحتوى",
	},
	de: {
		lang: "de",
		dir: "ltr",
		brand_sub: "Kurse & Ressourcen",
		courses: "Kurse",
		payments: "Zahlung",
		support: "Support",
		how_access: "So funktioniert der Zugriff",
		access_p1:
			"Nach der Zahlung erhältst du per E‑Mail die Zugriff-Links (Google Drive) und alle enthaltenen Materialien.",
		access_p2:
			"Brauchst du Hilfe oder Team‑Preise? Kontaktiere den Support.",
		go_payments: "Zu den Zahlungen",
		buy: "Kaufen",
		details: "Details",
		course_details: "Kursdetails",
		what_learn: "Das lernst du",
		outline: "Inhalt",
	},
	it: {
		lang: "it",
		dir: "ltr",
		brand_sub: "Corsi e risorse",
		courses: "Corsi",
		payments: "Pagamenti",
		support: "Supporto",
		how_access: "Come funziona l’accesso",
		access_p1:
			"Dopo il pagamento ricevi via email i link di accesso (Google Drive) e i materiali inclusi.",
		access_p2:
			"Hai bisogno di aiuto o prezzi per team? Contatta il supporto.",
		go_payments: "Vai ai pagamenti",
		buy: "Acquista",
		details: "Dettagli",
		course_details: "Dettagli del corso",
		what_learn: "Cosa imparerai",
		outline: "Programma",
	},
};

function translateCourseTitle(locale, titleEn) {
	if (locale === "fr") {
		const map = {
			"Cybersecurity Foundations — IAM & Threat Modeling":
				"Fondamentaux cybersécurité — IAM & modélisation des menaces",
			"Networking Essentials — DNS, HTTPS, CDN":
				"Réseaux essentiels — DNS, HTTPS, CDN",
			"Business Analytics — Excel, SQL & Dashboards":
				"Analyse business — Excel, SQL & tableaux de bord",
			"Legal Research with GenAI — Citations & Bluebook Basics":
				"Recherche juridique avec IA — citations & bases Bluebook",
			"Project Management — Sprint Planning & Risk Logs":
				"Gestion de projet — sprints & registre des risques",
			"Mock Exam — Fundamentals (Timed)":
				"Examen blanc — fondamentaux (chronométré)",
			"Mock Exam — Professional (Advanced)":
				"Examen blanc — professionnel (avancé)",
			"Mock Marathon — Three Exams Series":
				"Marathon d’examens — série de trois examens",
			"Enterprise Team Pack — Multi‑track Access":
				"Pack équipe entreprise — accès multi-parcours",
		};
		return map[titleEn] || titleEn;
	}
	if (locale === "es") {
		const map = {
			"Cybersecurity Foundations — IAM & Threat Modeling":
				"Fundamentos de ciberseguridad — IAM y modelado de amenazas",
			"Networking Essentials — DNS, HTTPS, CDN":
				"Redes esenciales — DNS, HTTPS, CDN",
			"Business Analytics — Excel, SQL & Dashboards":
				"Analítica de negocio — Excel, SQL y dashboards",
			"Legal Research with GenAI — Citations & Bluebook Basics":
				"Investigación jurídica con IA — citas y bases de Bluebook",
			"Project Management — Sprint Planning & Risk Logs":
				"Gestión de proyectos — sprints y registro de riesgos",
			"Mock Exam — Fundamentals (Timed)":
				"Simulacro — fundamentos (cronometrado)",
			"Mock Exam — Professional (Advanced)":
				"Simulacro — profesional (avanzado)",
			"Mock Marathon — Three Exams Series":
				"Maratón de simulacros — tres exámenes",
			"Enterprise Team Pack — Multi‑track Access":
				"Pack empresarial — acceso multirruta",
		};
		return map[titleEn] || titleEn;
	}
	if (locale === "ar") {
		const map = {
			"Cybersecurity Foundations — IAM & Threat Modeling":
				"أساسيات الأمن السيبراني — IAM ونمذجة التهديدات",
			"Networking Essentials — DNS, HTTPS, CDN":
				"أساسيات الشبكات — DNS وHTTPS وCDN",
			"Business Analytics — Excel, SQL & Dashboards":
				"تحليلات الأعمال — Excel وSQL ولوحات البيانات",
			"Legal Research with GenAI — Citations & Bluebook Basics":
				"البحث القانوني بالذكاء الاصطناعي — الاقتباسات وأساسيات Bluebook",
			"Project Management — Sprint Planning & Risk Logs":
				"إدارة المشاريع — تخطيط السبرنت وسجل المخاطر",
			"Mock Exam — Fundamentals (Timed)":
				"اختبار تجريبي — الأساسيات (مؤقت)",
			"Mock Exam — Professional (Advanced)":
				"اختبار تجريبي — احترافي (متقدم)",
			"Mock Marathon — Three Exams Series":
				"ماراثون اختبارات — ثلاث اختبارات متتالية",
			"Enterprise Team Pack — Multi‑track Access":
				"حزمة فرق الشركات — وصول متعدد المسارات",
		};
		return map[titleEn] || titleEn;
	}
	if (locale === "de") {
		const map = {
			"Cybersecurity Foundations — IAM & Threat Modeling":
				"Cybersecurity Grundlagen — IAM & Bedrohungsmodellierung",
			"Networking Essentials — DNS, HTTPS, CDN":
				"Netzwerk‑Grundlagen — DNS, HTTPS, CDN",
			"Business Analytics — Excel, SQL & Dashboards":
				"Business Analytics — Excel, SQL & Dashboards",
			"Legal Research with GenAI — Citations & Bluebook Basics":
				"Juristische Recherche mit GenAI — Zitate & Bluebook Grundlagen",
			"Project Management — Sprint Planning & Risk Logs":
				"Projektmanagement — Sprintplanung & Risikologs",
			"Mock Exam — Fundamentals (Timed)":
				"Probeprüfung — Grundlagen (zeitlich)",
			"Mock Exam — Professional (Advanced)":
				"Probeprüfung — Professional (fortgeschritten)",
			"Mock Marathon — Three Exams Series":
				"Mock‑Marathon — Serie aus drei Prüfungen",
			"Enterprise Team Pack — Multi‑track Access":
				"Enterprise Team Pack — Multi‑Track Zugriff",
		};
		return map[titleEn] || titleEn;
	}
	if (locale === "it") {
		const map = {
			"Cybersecurity Foundations — IAM & Threat Modeling":
				"Fondamenti di cybersecurity — IAM e threat modeling",
			"Networking Essentials — DNS, HTTPS, CDN":
				"Fondamenti di networking — DNS, HTTPS, CDN",
			"Business Analytics — Excel, SQL & Dashboards":
				"Business analytics — Excel, SQL e dashboard",
			"Legal Research with GenAI — Citations & Bluebook Basics":
				"Ricerca legale con GenAI — citazioni e basi Bluebook",
			"Project Management — Sprint Planning & Risk Logs":
				"Project management — sprint e registro rischi",
			"Mock Exam — Fundamentals (Timed)":
				"Simulazione — fondamentali (cronometrata)",
			"Mock Exam — Professional (Advanced)":
				"Simulazione — professional (avanzata)",
			"Mock Marathon — Three Exams Series":
				"Maratona mock — serie di tre prove",
			"Enterprise Team Pack — Multi‑track Access":
				"Pacchetto team enterprise — accesso multi‑percorso",
		};
		return map[titleEn] || titleEn;
	}
	return titleEn;
}

function translateShort(locale, text) {
	if (locale === "fr") {
		const map = {
			"Access control, identity & policy, threat modeling, secure workflows.":
				"Contrôle d’accès, identité et politiques, modélisation des menaces, workflows sécurisés.",
			"Hands‑on fundamentals for DNS, TLS/HTTPS, caching/CDNs and status codes.":
				"Fondamentaux pratiques pour DNS, TLS/HTTPS, cache/CDN et codes de statut.",
			"Data cleaning, pivot tables, SQL queries, and executive dashboards.":
				"Nettoyage des données, tableaux croisés, requêtes SQL et dashboards.",
			"Responsible AI assistance, citation hygiene, Bluebook overview.":
				"Usage responsable de l’IA, hygiène des citations, aperçu Bluebook.",
			"Agile sprints, burndown charts, risk registers and stakeholder updates.":
				"Sprints Agile, burndown, registre des risques et communication.",
			"Timed practice exam with auto‑scoring and topic analytics.":
				"Examen chronométré avec scoring automatique et analyse par thème.",
			"Advanced mock exam covering real exam patterns.":
				"Examen avancé basé sur des schémas réels.",
			"Three consecutive mocks with progressive difficulty.":
				"Trois examens consécutifs à difficulté progressive.",
			"Team bundle with business+tech tracks, templates, and support.":
				"Pack équipe avec parcours business+tech, modèles et support.",
		};
		return map[text] || text;
	}
	if (locale === "es") {
		const map = {
			"Access control, identity & policy, threat modeling, secure workflows.":
				"Control de acceso, identidad y políticas, modelado de amenazas y flujos seguros.",
			"Hands‑on fundamentals for DNS, TLS/HTTPS, caching/CDNs and status codes.":
				"Fundamentos prácticos de DNS, TLS/HTTPS, caché/CDN y códigos de estado.",
			"Data cleaning, pivot tables, SQL queries, and executive dashboards.":
				"Limpieza de datos, tablas dinámicas, SQL y dashboards ejecutivos.",
			"Responsible AI assistance, citation hygiene, Bluebook overview.":
				"Uso responsable de IA, verificación de citas y panorama de Bluebook.",
			"Agile sprints, burndown charts, risk registers and stakeholder updates.":
				"Sprints ágiles, burndown, registro de riesgos y comunicación.",
			"Timed practice exam with auto‑scoring and topic analytics.":
				"Simulacro cronometrado con autoevaluación y análisis por tema.",
			"Advanced mock exam covering real exam patterns.":
				"Simulacro avanzado basado en patrones reales.",
			"Three consecutive mocks with progressive difficulty.":
				"Tres simulacros consecutivos con dificultad progresiva.",
			"Team bundle with business+tech tracks, templates, and support.":
				"Pack para equipos con rutas business+tech, plantillas y soporte.",
		};
		return map[text] || text;
	}
	if (locale === "ar") {
		const map = {
			"Access control, identity & policy, threat modeling, secure workflows.":
				"التحكم بالوصول والهوية والسياسات ونمذجة التهديدات وتدفقات عمل آمنة.",
			"Hands‑on fundamentals for DNS, TLS/HTTPS, caching/CDNs and status codes.":
				"أساسيات عملية لـ DNS وTLS/HTTPS والتخزين المؤقت/CDN وأكواد الحالة.",
			"Data cleaning, pivot tables, SQL queries, and executive dashboards.":
				"تنظيف البيانات وجداول Pivot واستعلامات SQL ولوحات بيانات تنفيذية.",
			"Responsible AI assistance, citation hygiene, Bluebook overview.":
				"استخدام مسؤول للذكاء الاصطناعي والتحقق من المراجع ونظرة على Bluebook.",
			"Agile sprints, burndown charts, risk registers and stakeholder updates.":
				"سبرنتات Agile ومخططات Burndown وسجل المخاطر وتحديثات أصحاب المصلحة.",
			"Timed practice exam with auto‑scoring and topic analytics.":
				"اختبار مؤقت مع تصحيح تلقائي وتحليل حسب الموضوع.",
			"Advanced mock exam covering real exam patterns.":
				"اختبار متقدم يغطي أنماطًا شائعة في الامتحانات.",
			"Three consecutive mocks with progressive difficulty.":
				"ثلاث اختبارات متتالية مع صعوبة متدرجة.",
			"Team bundle with business+tech tracks, templates, and support.":
				"حزمة للفرق تشمل مسارات أعمال وتقنية وقوالب ودعم.",
		};
		return map[text] || text;
	}
	if (locale === "de") {
		const map = {
			"Access control, identity & policy, threat modeling, secure workflows.":
				"Zugriffskontrolle, Identität & Policies, Bedrohungsmodellierung, sichere Workflows.",
			"Hands‑on fundamentals for DNS, TLS/HTTPS, caching/CDNs and status codes.":
				"Praxis‑Grundlagen zu DNS, TLS/HTTPS, Caching/CDNs und Statuscodes.",
			"Data cleaning, pivot tables, SQL queries, and executive dashboards.":
				"Datenbereinigung, Pivot‑Tabellen, SQL‑Abfragen und Management‑Dashboards.",
			"Responsible AI assistance, citation hygiene, Bluebook overview.":
				"Verantwortungsvoller KI‑Einsatz, Zitierhygiene, Bluebook‑Überblick.",
			"Agile sprints, burndown charts, risk registers and stakeholder updates.":
				"Agile Sprints, Burndown, Risikoregister und Stakeholder‑Updates.",
		};
		return map[text] || text;
	}
	if (locale === "it") {
		const map = {
			"Access control, identity & policy, threat modeling, secure workflows.":
				"Controllo accessi, identità e policy, threat modeling, workflow sicuri.",
			"Hands‑on fundamentals for DNS, TLS/HTTPS, caching/CDNs and status codes.":
				"Fondamenti pratici di DNS, TLS/HTTPS, caching/CDN e codici di stato.",
			"Data cleaning, pivot tables, SQL queries, and executive dashboards.":
				"Pulizia dati, tabelle pivot, query SQL e dashboard executive.",
			"Responsible AI assistance, citation hygiene, Bluebook overview.":
				"Uso responsabile dell’IA, igiene delle citazioni, panoramica Bluebook.",
			"Agile sprints, burndown charts, risk registers and stakeholder updates.":
				"Sprint Agile, burndown, registro rischi e aggiornamenti stakeholder.",
		};
		return map[text] || text;
	}
	return text;
}

function translateBullets(locale, bullets) {
	return (bullets || []).map((b) => {
		const mapFr = {
			"Understand IAM": "Comprendre l’IAM",
			"Build threat models": "Construire des modèles de menaces",
			"Apply secure patterns": "Appliquer des patterns sécurisés",
			"Configure DNS": "Configurer le DNS",
			"Explain HTTPS": "Expliquer HTTPS",
			"Optimize with CDN": "Optimiser avec un CDN",
			"Analyze data": "Analyser des données",
			"Build dashboards": "Créer des tableaux de bord",
			"Present insights": "Présenter des insights",
			"Structure queries": "Structurer les requêtes",
			"Verify citations": "Vérifier les citations",
			"Apply Bluebook": "Appliquer Bluebook",
			"Plan sprints": "Planifier des sprints",
			"Track risks": "Suivre les risques",
			"Communicate status": "Communiquer l’avancement",
			"Exam pacing": "Gestion du temps",
			"Identify weak topics": "Identifier les points faibles",
			"Complex scenarios": "Scénarios complexes",
			"Reduce errors": "Réduire les erreurs",
			"Stamina": "Endurance",
			"Consistency": "Régularité",
			"Time management": "Gestion du temps",
			"Team onboarding": "Onboarding d’équipe",
			"Shared resources": "Ressources partagées",
			"Support channel": "Canal support",
		};
		const mapLongFr = {
			"Identity & access control fundamentals (users, roles, permissions)":
				"Fondamentaux IAM (utilisateurs, rôles, permissions)",
			"Least privilege and secure policy design":
				"Moindre privilège et conception de politiques sûres",
			"Threat modeling workflow (assets → threats → mitigations)":
				"Workflow de modélisation des menaces (actifs → menaces → mitigations)",
			"Secure-by-default patterns for common systems":
				"Patterns secure-by-default pour les systèmes courants",
			"Security basics: CIA, risk, and attack surface":
				"Bases sécurité : CIA, risque et surface d’attaque",
			"IAM concepts: authentication vs authorization":
				"Concepts IAM : authentification vs autorisation",
			"Policies: allow/deny logic and common pitfalls":
				"Politiques : logique allow/deny et pièges courants",
			"Threat modeling: STRIDE-style thinking":
				"Modélisation des menaces : approche type STRIDE",
			"Mitigations: logging, segmentation, validation":
				"Mitigations : logs, segmentation, validation",
			"Practical exercises + review checklist":
				"Exercices pratiques + checklist de révision",
			"DNS records, propagation, and troubleshooting":
				"Enregistrements DNS, propagation et dépannage",
			"TLS/HTTPS basics and certificate concepts":
				"Bases TLS/HTTPS et concepts de certificats",
			"HTTP caching, CDNs, and performance trade-offs":
				"Cache HTTP, CDNs et compromis de performance",
			"Status codes and browser/network debugging":
				"Codes de statut et débogage navigateur/réseau",
			"DNS fundamentals: A/AAAA/CNAME/TXT":
				"Fondamentaux DNS : A/AAAA/CNAME/TXT",
			"HTTPS: TLS handshake and certificates":
				"HTTPS : handshake TLS et certificats",
			"HTTP essentials: requests, headers, status codes":
				"HTTP : requêtes, en-têtes, codes de statut",
			"Caching: browser, CDN, and origin settings":
				"Cache : navigateur, CDN et configuration origin",
			"CDN patterns and when to use them":
				"Patterns CDN et quand les utiliser",
			"Exercises + practical checklist":
				"Exercices + checklist pratique",
			"Clean data, build pivot tables, and summarize metrics":
				"Nettoyer les données, créer des TCD et résumer des métriques",
			"Write practical SQL queries for reporting":
				"Écrire des requêtes SQL pratiques pour le reporting",
			"Build dashboards and KPI views":
				"Construire des dashboards et vues KPI",
			"Communicate insights with clear narratives":
				"Communiquer des insights avec des récits clairs",
			"Data basics: types, quality, and cleaning":
				"Bases data : types, qualité et nettoyage",
			"Excel pivots and reporting workflows":
				"Tableaux croisés Excel et workflows de reporting",
			"SQL fundamentals: select, join, group by":
				"SQL : select, join, group by",
			"Dashboards: KPIs, trends, and segmentation":
				"Dashboards : KPIs, tendances et segmentation",
			"Storytelling: slides, memos, and decisions":
				"Storytelling : slides, mémos et décisions",
			"Exercises + templates":
				"Exercices + modèles",
			"Use AI as an assistant while maintaining responsibility and verification":
				"Utiliser l’IA comme assistante en gardant responsabilité et vérification",
			"Build research workflows and query strategies":
				"Construire des workflows de recherche et stratégies de requêtes",
			"Check sources and citation hygiene":
				"Vérifier les sources et l’hygiène des citations",
			"Bluebook overview and common patterns":
				"Aperçu du Bluebook et modèles courants",
			"Research workflow: issue → sources → synthesis":
				"Workflow : question → sources → synthèse",
			"Prompting for research without hallucinations":
				"Prompts de recherche sans hallucinations",
			"Verification: primary vs secondary sources":
				"Vérification : sources primaires vs secondaires",
			"Citation hygiene and Bluebook basics":
				"Hygiène des citations et bases Bluebook",
			"Drafting: memos and structured outputs":
				"Rédaction : mémos et livrables structurés",
			"Exercises + checklists":
				"Exercices + checklists",
			"Sprint planning and prioritization":
				"Planification de sprint et priorisation",
			"Risk registers, issue tracking, and mitigation planning":
				"Registre des risques, suivi des incidents et plan de mitigation",
			"Simple metrics: burndown and throughput":
				"Métriques simples : burndown et débit",
			"Stakeholder communication and status updates":
				"Communication avec les parties prenantes et status",
			"Project basics: scope, time, and constraints":
				"Bases projet : périmètre, temps et contraintes",
			"Agile sprint planning and backlog hygiene":
				"Sprints Agile et hygiène du backlog",
			"Risk logs and mitigation workflow":
				"Journal des risques et workflow de mitigation",
			"Progress tracking: burndown and checkpoints":
				"Suivi : burndown et jalons",
			"Stakeholder updates that reduce churn":
				"Mises à jour qui réduisent l’attrition",
			"Warm-up and pacing strategy":
				"Échauffement et stratégie de rythme",
			"Timed exam session":
				"Session d’examen chronométrée",
			"Score review and weak-topic plan":
				"Revue du score et plan des points faibles",
			"Advanced scenario practice":
				"Pratique de scénarios avancés",
			"Error pattern reduction":
				"Réduction des schémas d’erreurs",
			"Structured review loops":
				"Boucles de révision structurées",
			"Deep review and remediation plan":
				"Revue approfondie et plan de remédiation",
			"Stamina and time management":
				"Endurance et gestion du temps",
			"Consistency across multiple runs":
				"Régularité sur plusieurs essais",
			"Review process and weak-topic refinement":
				"Process de revue et amélioration des points faibles",
			"Mock 1":
				"Examen 1",
			"Mock 2":
				"Examen 2",
			"Mock 3":
				"Examen 3",
			"Review and plan":
				"Revue et plan",
			"Team onboarding approach and track selection":
				"Onboarding d’équipe et choix des parcours",
			"Shared templates and internal rollout":
				"Modèles partagés et déploiement interne",
			"Support workflow and escalation routes":
				"Workflow support et escalades",
			"Tracks and bundles":
				"Parcours et bundles",
			"Onboarding plan":
				"Plan d’onboarding",
			"Support and operations":
				"Support et opérations",
		};
		const mapEs = {
			"Understand IAM": "Entender IAM",
			"Build threat models": "Crear modelos de amenazas",
			"Apply secure patterns": "Aplicar patrones seguros",
			"Configure DNS": "Configurar DNS",
			"Explain HTTPS": "Explicar HTTPS",
			"Optimize with CDN": "Optimizar con CDN",
			"Analyze data": "Analizar datos",
			"Build dashboards": "Crear dashboards",
			"Present insights": "Presentar hallazgos",
			"Structure queries": "Estructurar consultas",
			"Verify citations": "Verificar citas",
			"Apply Bluebook": "Aplicar Bluebook",
			"Plan sprints": "Planificar sprints",
			"Track risks": "Gestionar riesgos",
			"Communicate status": "Comunicar estado",
			"Exam pacing": "Ritmo del examen",
			"Identify weak topics": "Identificar temas débiles",
			"Complex scenarios": "Escenarios complejos",
			"Reduce errors": "Reducir errores",
			"Stamina": "Resistencia",
			"Consistency": "Constancia",
			"Time management": "Gestión del tiempo",
			"Team onboarding": "Onboarding del equipo",
			"Shared resources": "Recursos compartidos",
			"Support channel": "Canal de soporte",
		};
		const mapLongEs = {
			"Identity & access control fundamentals (users, roles, permissions)":
				"Fundamentos de IAM (usuarios, roles y permisos)",
			"Least privilege and secure policy design":
				"Mínimo privilegio y diseño seguro de políticas",
			"Threat modeling workflow (assets → threats → mitigations)":
				"Flujo de modelado de amenazas (activos → amenazas → mitigaciones)",
			"Secure-by-default patterns for common systems":
				"Patrones seguros por defecto para sistemas comunes",
			"Security basics: CIA, risk, and attack surface":
				"Bases de seguridad: CIA, riesgo y superficie de ataque",
			"IAM concepts: authentication vs authorization":
				"Conceptos IAM: autenticación vs autorización",
			"Policies: allow/deny logic and common pitfalls":
				"Políticas: lógica allow/deny y errores comunes",
			"Threat modeling: STRIDE-style thinking":
				"Modelado de amenazas: enfoque tipo STRIDE",
			"Mitigations: logging, segmentation, validation":
				"Mitigaciones: logs, segmentación y validación",
			"Practical exercises + review checklist":
				"Ejercicios prácticos + checklist de revisión",
			"DNS records, propagation, and troubleshooting":
				"Registros DNS, propagación y solución de problemas",
			"TLS/HTTPS basics and certificate concepts":
				"Fundamentos TLS/HTTPS y conceptos de certificados",
			"HTTP caching, CDNs, and performance trade-offs":
				"Caché HTTP, CDNs y compromisos de rendimiento",
			"Status codes and browser/network debugging":
				"Códigos de estado y depuración de red/navegador",
			"DNS fundamentals: A/AAAA/CNAME/TXT":
				"Fundamentos DNS: A/AAAA/CNAME/TXT",
			"HTTPS: TLS handshake and certificates":
				"HTTPS: handshake TLS y certificados",
			"HTTP essentials: requests, headers, status codes":
				"HTTP: solicitudes, encabezados y códigos de estado",
			"Caching: browser, CDN, and origin settings":
				"Caché: navegador, CDN y configuración del origen",
			"CDN patterns and when to use them":
				"Patrones CDN y cuándo usarlos",
			"Exercises + practical checklist":
				"Ejercicios + checklist práctico",
			"Clean data, build pivot tables, and summarize metrics":
				"Limpiar datos, crear tablas dinámicas y resumir métricas",
			"Write practical SQL queries for reporting":
				"Escribir consultas SQL prácticas para reporting",
			"Build dashboards and KPI views":
				"Crear dashboards y vistas de KPI",
			"Communicate insights with clear narratives":
				"Comunicar hallazgos con narrativas claras",
			"Data basics: types, quality, and cleaning":
				"Conceptos de datos: tipos, calidad y limpieza",
			"Excel pivots and reporting workflows":
				"Tablas dinámicas en Excel y flujos de reporting",
			"SQL fundamentals: select, join, group by":
				"SQL: select, join, group by",
			"Dashboards: KPIs, trends, and segmentation":
				"Dashboards: KPI, tendencias y segmentación",
			"Storytelling: slides, memos, and decisions":
				"Storytelling: slides, memos y decisiones",
			"Exercises + templates":
				"Ejercicios + plantillas",
			"Use AI as an assistant while maintaining responsibility and verification":
				"Usar IA como asistente manteniendo responsabilidad y verificación",
			"Build research workflows and query strategies":
				"Crear flujos de investigación y estrategias de consulta",
			"Check sources and citation hygiene":
				"Comprobar fuentes y la higiene de citas",
			"Bluebook overview and common patterns":
				"Panorama de Bluebook y patrones comunes",
			"Research workflow: issue → sources → synthesis":
				"Flujo: tema → fuentes → síntesis",
			"Prompting for research without hallucinations":
				"Prompts de investigación sin alucinaciones",
			"Verification: primary vs secondary sources":
				"Verificación: fuentes primarias vs secundarias",
			"Citation hygiene and Bluebook basics":
				"Higiene de citas y bases de Bluebook",
			"Drafting: memos and structured outputs":
				"Redacción: memos y salidas estructuradas",
			"Exercises + checklists":
				"Ejercicios + checklists",
			"Sprint planning and prioritization":
				"Planificación de sprint y priorización",
			"Risk registers, issue tracking, and mitigation planning":
				"Registro de riesgos, seguimiento de incidencias y mitigación",
			"Simple metrics: burndown and throughput":
				"Métricas: burndown y throughput",
			"Stakeholder communication and status updates":
				"Comunicación con stakeholders y actualizaciones",
			"Project basics: scope, time, and constraints":
				"Bases de proyecto: alcance, tiempo y restricciones",
			"Agile sprint planning and backlog hygiene":
				"Sprints ágiles y mantenimiento del backlog",
			"Risk logs and mitigation workflow":
				"Registro de riesgos y flujo de mitigación",
			"Progress tracking: burndown and checkpoints":
				"Seguimiento: burndown y puntos de control",
			"Stakeholder updates that reduce churn":
				"Actualizaciones que reducen la rotación",
			"Warm-up and pacing strategy":
				"Calentamiento y estrategia de ritmo",
			"Timed exam session":
				"Sesión cronometrada",
			"Score review and weak-topic plan":
				"Revisión de resultados y plan de temas débiles",
			"Advanced scenario practice":
				"Práctica de escenarios avanzados",
			"Error pattern reduction":
				"Reducción de patrones de error",
			"Structured review loops":
				"Ciclos de revisión estructurados",
			"Deep review and remediation plan":
				"Revisión profunda y plan de mejora",
			"Stamina and time management":
				"Resistencia y gestión del tiempo",
			"Consistency across multiple runs":
				"Constancia en múltiples intentos",
			"Review process and weak-topic refinement":
				"Proceso de revisión y refinamiento de temas débiles",
			"Mock 1":
				"Simulacro 1",
			"Mock 2":
				"Simulacro 2",
			"Mock 3":
				"Simulacro 3",
			"Review and plan":
				"Revisión y plan",
			"Team onboarding approach and track selection":
				"Onboarding del equipo y selección de rutas",
			"Shared templates and internal rollout":
				"Plantillas compartidas y despliegue interno",
			"Support workflow and escalation routes":
				"Flujo de soporte y escalado",
			"Tracks and bundles":
				"Rutas y bundles",
			"Onboarding plan":
				"Plan de onboarding",
			"Support and operations":
				"Soporte y operaciones",
		};
		const mapAr = {
			"Understand IAM": "فهم IAM",
			"Build threat models": "بناء نماذج تهديدات",
			"Apply secure patterns": "تطبيق أنماط آمنة",
			"Configure DNS": "تهيئة DNS",
			"Explain HTTPS": "شرح HTTPS",
			"Optimize with CDN": "التحسين عبر CDN",
			"Analyze data": "تحليل البيانات",
			"Build dashboards": "إنشاء لوحات بيانات",
			"Present insights": "عرض النتائج",
			"Structure queries": "هيكلة الاستعلامات",
			"Verify citations": "التحقق من المراجع",
			"Apply Bluebook": "تطبيق Bluebook",
			"Plan sprints": "تخطيط السبرنت",
			"Track risks": "متابعة المخاطر",
			"Communicate status": "التواصل حول الحالة",
			"Exam pacing": "إدارة وقت الاختبار",
			"Identify weak topics": "تحديد نقاط الضعف",
			"Complex scenarios": "سيناريوهات معقدة",
			"Reduce errors": "تقليل الأخطاء",
			"Stamina": "التحمل",
			"Consistency": "الاستمرارية",
			"Time management": "إدارة الوقت",
			"Team onboarding": "تهيئة الفريق",
			"Shared resources": "موارد مشتركة",
			"Support channel": "قناة الدعم",
		};
		const mapLongAr = {
			"Identity & access control fundamentals (users, roles, permissions)":
				"أساسيات IAM (المستخدمون والأدوار والصلاحيات)",
			"Least privilege and secure policy design":
				"مبدأ أقل صلاحية وتصميم سياسات آمن",
			"Threat modeling workflow (assets → threats → mitigations)":
				"سير عمل نمذجة التهديدات (الأصول → التهديدات → إجراءات التخفيف)",
			"Secure-by-default patterns for common systems":
				"أنماط آمنة افتراضيًا للأنظمة الشائعة",
			"Security basics: CIA, risk, and attack surface":
				"أساسيات الأمن: CIA والمخاطر وسطح الهجوم",
			"IAM concepts: authentication vs authorization":
				"مفاهيم IAM: المصادقة مقابل التفويض",
			"Policies: allow/deny logic and common pitfalls":
				"السياسات: منطق السماح/المنع والأخطاء الشائعة",
			"Threat modeling: STRIDE-style thinking":
				"نمذجة التهديدات: تفكير بأسلوب STRIDE",
			"Mitigations: logging, segmentation, validation":
				"التخفيف: التسجيل والتقسيم والتحقق",
			"Practical exercises + review checklist":
				"تمارين عملية + قائمة تحقق للمراجعة",
			"DNS records, propagation, and troubleshooting":
				"سجلات DNS والانتشار واستكشاف الأخطاء",
			"TLS/HTTPS basics and certificate concepts":
				"أساسيات TLS/HTTPS ومفاهيم الشهادات",
			"HTTP caching, CDNs, and performance trade-offs":
				"التخزين المؤقت لـ HTTP وCDN ومفاضلات الأداء",
			"Status codes and browser/network debugging":
				"أكواد الحالة وتصحيح أخطاء المتصفح/الشبكة",
			"DNS fundamentals: A/AAAA/CNAME/TXT":
				"أساسيات DNS: A/AAAA/CNAME/TXT",
			"HTTPS: TLS handshake and certificates":
				"HTTPS: مصافحة TLS والشهادات",
			"HTTP essentials: requests, headers, status codes":
				"أساسيات HTTP: الطلبات والرؤوس وأكواد الحالة",
			"Caching: browser, CDN, and origin settings":
				"التخزين المؤقت: المتصفح وCDN وإعدادات المصدر",
			"CDN patterns and when to use them":
				"أنماط CDN ومتى نستخدمها",
			"Exercises + practical checklist":
				"تمارين + قائمة تحقق عملية",
			"Clean data, build pivot tables, and summarize metrics":
				"تنظيف البيانات وبناء جداول Pivot وتلخيص المقاييس",
			"Write practical SQL queries for reporting":
				"كتابة استعلامات SQL عملية للتقارير",
			"Build dashboards and KPI views":
				"بناء لوحات بيانات وعروض KPI",
			"Communicate insights with clear narratives":
				"عرض النتائج بقصص واضحة",
			"Data basics: types, quality, and cleaning":
				"أساسيات البيانات: الأنواع والجودة والتنظيف",
			"Excel pivots and reporting workflows":
				"جداول Pivot في Excel وتدفقات التقارير",
			"SQL fundamentals: select, join, group by":
				"أساسيات SQL: select وjoin وgroup by",
			"Dashboards: KPIs, trends, and segmentation":
				"لوحات البيانات: KPI والاتجاهات والتقسيم",
			"Storytelling: slides, memos, and decisions":
				"السرد: عروض ومذكرات وقرارات",
			"Exercises + templates":
				"تمارين + قوالب",
			"Use AI as an assistant while maintaining responsibility and verification":
				"استخدام الذكاء الاصطناعي كمساعد مع الحفاظ على المسؤولية والتحقق",
			"Build research workflows and query strategies":
				"بناء تدفقات بحث واستراتيجيات استعلام",
			"Check sources and citation hygiene":
				"التحقق من المصادر ونظافة الاقتباسات",
			"Bluebook overview and common patterns":
				"نظرة عامة على Bluebook وأنماط شائعة",
			"Research workflow: issue → sources → synthesis":
				"سير العمل: مسألة → مصادر → خلاصة",
			"Prompting for research without hallucinations":
				"صياغة المطالبات دون هلوسة",
			"Verification: primary vs secondary sources":
				"التحقق: مصادر أولية مقابل ثانوية",
			"Citation hygiene and Bluebook basics":
				"نظافة الاقتباس وأساسيات Bluebook",
			"Drafting: memos and structured outputs":
				"التحرير: مذكرات ومخرجات منظمة",
			"Exercises + checklists":
				"تمارين + قوائم تحقق",
			"Sprint planning and prioritization":
				"تخطيط السبرنت وتحديد الأولويات",
			"Risk registers, issue tracking, and mitigation planning":
				"سجل المخاطر وتتبع المشكلات وخطط التخفيف",
			"Simple metrics: burndown and throughput":
				"مقاييس بسيطة: burndown وthroughput",
			"Stakeholder communication and status updates":
				"التواصل مع أصحاب المصلحة وتحديثات الحالة",
			"Project basics: scope, time, and constraints":
				"أساسيات المشروع: النطاق والوقت والقيود",
			"Agile sprint planning and backlog hygiene":
				"تخطيط سبرنت Agile وتنظيم الـ backlog",
			"Risk logs and mitigation workflow":
				"سجلات المخاطر وسير عمل التخفيف",
			"Progress tracking: burndown and checkpoints":
				"متابعة التقدم: burndown ونقاط تحقق",
			"Stakeholder updates that reduce churn":
				"تحديثات تقلل التسرب",
			"Warm-up and pacing strategy":
				"تهيئة واستراتيجية وتيرة",
			"Timed exam session":
				"جلسة اختبار مؤقتة",
			"Score review and weak-topic plan":
				"مراجعة النتيجة وخطة نقاط الضعف",
			"Advanced scenario practice":
				"تدريب سيناريوهات متقدمة",
			"Error pattern reduction":
				"تقليل أنماط الأخطاء",
			"Structured review loops":
				"دورات مراجعة منظمة",
			"Deep review and remediation plan":
				"مراجعة معمقة وخطة تحسين",
			"Stamina and time management":
				"التحمل وإدارة الوقت",
			"Consistency across multiple runs":
				"الاستمرارية عبر محاولات متعددة",
			"Review process and weak-topic refinement":
				"عملية مراجعة وتحسين نقاط الضعف",
			"Mock 1":
				"اختبار 1",
			"Mock 2":
				"اختبار 2",
			"Mock 3":
				"اختبار 3",
			"Review and plan":
				"مراجعة وخطة",
			"Team onboarding approach and track selection":
				"تهيئة الفريق واختيار المسارات",
			"Shared templates and internal rollout":
				"قوالب مشتركة وتطبيق داخلي",
			"Support workflow and escalation routes":
				"سير عمل الدعم ومسارات التصعيد",
			"Tracks and bundles":
				"المسارات والحزم",
			"Onboarding plan":
				"خطة التهيئة",
			"Support and operations":
				"الدعم والعمليات",
		};
		if (locale === "fr") return mapFr[b] || mapLongFr[b] || b;
		if (locale === "es") return mapEs[b] || mapLongEs[b] || b;
		if (locale === "ar") return mapAr[b] || mapLongAr[b] || b;
		if (locale === "de") return b;
		if (locale === "it") return b;
		return b;
	});
}

function alternates({ domain, pathEn, locales }) {
	const tags = [];
	tags.push(`<link rel="alternate" hreflang="en" href="https://${domain}${pathEn}">`);
	for (const l of locales) {
		tags.push(
			`<link rel="alternate" hreflang="${escapeHtml(l)}" href="https://${domain}${pathEn.replace(/\\.html$/, `.${l}.html`)}">`,
		);
	}
	tags.push(`<link rel="alternate" hreflang="x-default" href="https://${domain}${pathEn}">`);
	return tags.join("\n  ");
}

function pageShell({ locale, title, canonicalUrl, body }) {
	const t = i18n[locale];
	const dir = t.dir === "rtl" ? " dir=\"rtl\"" : "";
	const extraRtl = t.dir === "rtl" ? "<style>body{direction:rtl}</style>" : "";
	return [
		"<!doctype html>",
		`<html lang="${t.lang}"${dir}>`,
		"<head>",
		"  <meta charset=\"utf-8\">",
		"  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
		`  <title>${escapeHtml(title)}</title>`,
		`  <link rel=\"canonical\" href=\"${escapeHtml(canonicalUrl)}\">`,
		`  ${alternates({ domain: getDomain(), pathEn: "/courses.html", locales: supportedLocales(parseLocales()) })}`,
		"  <link rel=\"stylesheet\" href=\"/assets/style.css\">",
		extraRtl,
		"</head>",
		"<body>",
		"  <header class=\"site\">",
		"    <div class=\"container row\">",
		"      <div class=\"brand\">",
		"        <div>",
		"          <h1 class=\"title\"><a href=\"/\">RealWorldCerts</a></h1>",
		`          <div class=\"subtitle\">${escapeHtml(t.brand_sub)}</div>`,
		"        </div>",
		"      </div>",
		"      <nav class=\"nav\">",
		`        <a href="/courses.${locale}.html">${escapeHtml(t.courses)}</a>`,
		`        <a href="/payments.html">${escapeHtml(t.payments)}</a>`,
		`        <a href="/contact.html">${escapeHtml(t.support)}</a>`,
		"      </nav>",
		"    </div>",
		"  </header>",
		`  <main class="container">${body}</main>`,
		"  <footer class=\"site\">",
		"    <div class=\"container\"><p>&copy; 2026 RealWorldCerts. All rights reserved.</p></div>",
		"  </footer>",
		"</body>",
		"</html>",
	].join("\n");
}

function buildCoursesListPage({ locale, domain }) {
	const t = i18n[locale];
	const localeLabels = {
		fr: "Français",
		es: "Español",
		ar: "العربية",
		de: "Deutsch",
		it: "Italiano",
	};
	const locales = parseLocales().filter((l) => l in i18n);
	const links = [
		`<a class="btn secondary" href="/courses.html">English</a>`,
		...locales.map(
			(l) =>
				`<a class="btn secondary" href="/courses.${l}.html">${escapeHtml(localeLabels[l] || l)}</a>`,
		),
	].join(" ");
	const langBar = [
		"<div class=\"card\">",
		"<h2>Languages</h2>",
		`<p>${links}</p>`,
		"</div>",
	].join("\n");
	const access = [
		"<div class=\"card\">",
		`<h2>${escapeHtml(t.how_access)}</h2>`,
		`<p>${escapeHtml(t.access_p1)}</p>`,
		`<p>${escapeHtml(t.access_p2)} <a class="btn" href="/contact.html">${escapeHtml(t.support)}</a></p>`,
		`<p><a class="btn" href="/payments.html">${escapeHtml(t.go_payments)}</a></p>`,
		"</div>",
	].join("\n");

	const cards = catalog
		.map((c) => {
			const title = translateCourseTitle(locale, c.title_en);
			const desc = translateShort(locale, c.desc_en);
			const bullets = translateBullets(locale, c.learn_en);
			const detailsHref = `/courses/${c.sku}.${locale}.html`;
			return [
				"<div class=\"card\">",
				`<h3>${escapeHtml(title)}</h3>`,
				`<p>${escapeHtml(c.level + c.hours)}</p>`,
				`<p>${escapeHtml(desc)}</p>`,
				"<ul>",
				...bullets.map((b) => `  <li>${escapeHtml(b)}</li>`),
				"</ul>",
				`<p>$${escapeHtml(String(c.price))}</p>`,
				"<div class=\"cta\">",
				`  <a class="btn" href="/payments.html?sku=${encodeURIComponent(c.sku)}&amount=${encodeURIComponent(String(c.price))}">${escapeHtml(t.buy)}</a>`,
				`  <a class="btn secondary" href="${escapeHtml(detailsHref)}">${escapeHtml(t.details)}</a>`,
				"</div>",
				"</div>",
			].join("\n");
		})
		.join("\n");

	return pageShell({
		locale,
		title: `RealWorldCerts - ${t.courses}`,
		canonicalUrl: `https://${domain}/courses.${locale}.html`,
		body: `${langBar}\n${access}\n<div class="grid">\n${cards}\n</div>`,
	});
}

async function buildCourseDetail({ locale, domain, course, cache, useLlm, locales }) {
	const t = i18n[locale];
	const title =
		(await translateText({
			locale,
			text: course.title_en,
			cache,
			useLlm,
			budget: cache.__budget,
		})) ||
		translateCourseTitle(locale, course.title_en);
	const desc =
		(await translateText({
			locale,
			text: course.desc_en,
			cache,
			useLlm,
			budget: cache.__budget,
		})) ||
		translateShort(locale, course.desc_en);
	const learnTranslated = [];
	for (const x of course.detail_learn_en) {
		learnTranslated.push(
			(await translateText({ locale, text: x, cache, useLlm, budget: cache.__budget })) ||
				translateBullets(locale, [x])[0],
		);
	}
	const outlineTranslated = [];
	for (const x of course.detail_outline_en) {
		outlineTranslated.push(
			(await translateText({ locale, text: x, cache, useLlm, budget: cache.__budget })) ||
				translateBullets(locale, [x])[0],
		);
	}
	const dir = t.dir === "rtl" ? " dir=\"rtl\"" : "";
	const extraRtl = t.dir === "rtl" ? "<style>body{direction:rtl}</style>" : "";
	const canonicalPath = `/courses/${course.sku}.${locale}.html`;

	return [
		"<!doctype html>",
		`<html lang="${t.lang}"${dir}>`,
		"<head>",
		"  <meta charset=\"utf-8\">",
		"  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
		`  <title>${escapeHtml(title)} | RealWorldCerts</title>`,
		`  <meta name="description" content="${escapeHtml(desc)}">`,
		`  <link rel="canonical" href="https://${domain}${canonicalPath}">`,
		`  ${alternates({ domain, pathEn: `/courses/${course.sku}.html`, locales })}`,
		"  <link rel=\"stylesheet\" href=\"/assets/style.css\">",
		extraRtl,
		"</head>",
		"<body>",
		"  <header class=\"site\">",
		"    <div class=\"container row\">",
		"      <div class=\"brand\">",
		"        <div>",
		"          <h1 class=\"title\"><a href=\"/\">RealWorldCerts</a></h1>",
		`          <div class=\"subtitle\">${escapeHtml(t.course_details)}</div>`,
		"        </div>",
		"      </div>",
		"      <nav class=\"nav\">",
		`        <a href="/courses.${locale}.html">${escapeHtml(t.courses)}</a>`,
		`        <a href="/payments.html">${escapeHtml(t.payments)}</a>`,
		`        <a href="/contact.html">${escapeHtml(t.support)}</a>`,
		"      </nav>",
		"    </div>",
		"  </header>",
		"  <main class=\"container\">",
		"    <div class=\"card\">",
		`      <h2>${escapeHtml(title)}</h2>`,
		`      <p class="text-muted">${escapeHtml(course.level)} • ~${escapeHtml(course.hours)} • SKU: ${escapeHtml(course.sku)}</p>`,
		"      <div class=\"cta\">",
		`        <a class="btn" href="/payments.html?sku=${encodeURIComponent(course.sku)}&amount=${encodeURIComponent(String(course.price))}">${escapeHtml(t.buy)} ($${escapeHtml(String(course.price))})</a>`,
		`        <a class="btn secondary" href="/contact.html">${escapeHtml(t.support)}</a>`,
		"      </div>",
		"    </div>",
		"    <div class=\"grid\">",
		"      <div class=\"card\">",
		`        <h3>${escapeHtml(t.what_learn)}</h3>`,
		"        <ul>",
		...learnTranslated.map((x) => `          <li>${escapeHtml(x)}</li>`),
		"        </ul>",
		"      </div>",
		"      <div class=\"card\">",
		`        <h3>${escapeHtml(t.outline)}</h3>`,
		"        <ol>",
		...outlineTranslated.map((x) => `          <li>${escapeHtml(x)}</li>`),
		"        </ol>",
		"      </div>",
		"    </div>",
		"    <div class=\"card\">",
		`      <h3>${escapeHtml(t.how_access)}</h3>`,
		`      <p>${escapeHtml(t.access_p1)}</p>`,
		"    </div>",
		"  </main>",
		"  <footer class=\"site\">",
		"    <div class=\"container\"><p>© RealWorldCerts</p></div>",
		"  </footer>",
		"</body>",
		"</html>",
	].join("\n");
}

function ensureSitemapUrls(sitemapPath, urls) {
	let xml = "";
	try {
		xml = fs.readFileSync(sitemapPath, "utf8");
	} catch {
		return { ok: false, reason: "missing_sitemap" };
	}
	let changed = false;
	for (const u of urls) {
		if (xml.includes(`<loc>${u}</loc>`)) continue;
		xml = xml.replace(
			"</urlset>",
			`  <url>\n    <loc>${u}</loc>\n  </url>\n</urlset>`,
		);
		changed = true;
	}
	if (changed) fs.writeFileSync(sitemapPath, xml, "utf8");
	return { ok: true, changed };
}

async function main() {
	const domain = getDomain();
	const rankOut = path.resolve("rank", "output");
	const coursesDir = path.join(rankOut, "courses");
	ensureDir(coursesDir);

	const locales = supportedLocales(parseLocales());
	const written = [];
	const useLlm = translationEnabled();
	const cPath = cachePath();
	const cache = readJson(cPath) || {};
	cache.__budget = {
		max: translationMaxCalls(),
		used: 0,
		violations: [],
	};

	for (const locale of locales) {
		const listHtml = buildCoursesListPage({ locale, domain });
		if (writeTextIfChanged(path.join(rankOut, `courses.${locale}.html`), listHtml))
			written.push(`rank/output/courses.${locale}.html`);

		for (const c of catalog) {
			const detail = await buildCourseDetail({
				locale,
				domain,
				course: c,
				cache,
				useLlm,
				locales,
			});
			const outPath = path.join(coursesDir, `${c.sku}.${locale}.html`);
			if (writeTextIfChanged(outPath, detail))
				written.push(`rank/output/courses/${c.sku}.${locale}.html`);
		}
	}

	const budgetInfo = cache.__budget;
	delete cache.__budget;
	if (useLlm) writeJson(cPath, cache);

	const sitemapPath = path.join(rankOut, "sitemap.xml");
	const urls = [];
	for (const locale of locales) {
		urls.push(`https://${domain}/courses.${locale}.html`);
		for (const c of catalog) {
			urls.push(`https://${domain}/courses/${c.sku}.${locale}.html`);
		}
	}
	const sm = ensureSitemapUrls(sitemapPath, urls);

	process.stdout.write(
		`${JSON.stringify(
			{
				ok: true,
				written: written.length,
				files: written,
				sitemap: sm,
				translation: useLlm
					? {
							provider: llmProvider(),
							model: llmModel(),
							calls_used: budgetInfo.used,
							calls_max: budgetInfo.max,
							violations: budgetInfo.violations.length,
						}
					: { enabled: false },
			},
			null,
			2,
		)}\n`,
	);
}

main().catch((err) => {
	process.stderr.write(`${String(err?.message ?? err)}\n`);
	process.exit(1);
});
