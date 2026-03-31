import fs from "node:fs/promises";
import path from "node:path";

const EXCLUDES = new Set([
	"node_modules",
	".git",
	"dist_rwc",
	"exports",
	"out",
	"reports",
	".vscode",
	".idea",
]);

const PATTERNS = [
	{ id: "aws_access_key", re: /AKIA[0-9A-Z]{16}/g },
	{
		id: "private_key_block",
		re: /-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----/g,
	},
	{ id: "hex_private_key", re: /\b[0-9a-fA-F]{64}\b/g },
	{
		id: "jwt_token",
		re: /eyJ[a-zA-Z0-9\-_]{10,}\.[a-zA-Z0-9\-_]{10,}\.[a-zA-Z0-9\-_]{10,}/g,
	},
	{
		id: "wise_api_key",
		re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
	},
	{ id: "plaid_client_id", re: /PLAID_CLIENT_ID\s*=\s*[^\s]+/g },
	{ id: "plaid_secret", re: /PLAID_SECRET\s*=\s*[^\s]+/g },
	{ id: "paypal_client_id", re: /PAYPAL_CLIENT_ID\s*=\s*[^\s]+/g },
	{ id: "paypal_client_secret", re: /PAYPAL_CLIENT_SECRET\s*=\s*[^\s]+/g },
	{
		id: "generic_secret",
		re: /(CLIENT_SECRET|API_KEY|ACCESS_TOKEN|SECRET)\s*=\s*[A-Za-z0-9_.-]{20,}/g,
	},
];

function classifySeverity(id) {
	if (id === "private_key_block" || id === "hex_private_key") return "critical";
	if (
		id === "plaid_secret" ||
		id === "paypal_client_secret" ||
		id === "generic_secret"
	)
		return "high";
	if (id === "aws_access_key" || id === "jwt_token" || id === "wise_api_key")
		return "high";
	return "medium";
}

const EXT_ALLOW = new Set([
	".js",
	".mjs",
	".ts",
	".json",
	".md",
	".yml",
	".yaml",
	".env",
	".txt",
	".cfg",
	".ini",
	".ps1",
	".sh",
]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

async function* walk(dir) {
	let entries = [];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const ent of entries) {
		if (EXCLUDES.has(ent.name)) continue;
		const full = path.join(dir, ent.name);
		if (ent.isDirectory()) {
			yield* walk(full);
		} else if (ent.isFile()) {
			const ext = path.extname(ent.name).toLowerCase();
			if (!EXT_ALLOW.has(ext)) continue;
			try {
				const st = await fs.stat(full);
				if (st.size > MAX_FILE_BYTES) continue;
				yield full;
			} catch {}
		}
	}
}

export class SecretsScanner {
	constructor({
		root = process.cwd(),
		reportPath = path.join(
			process.cwd(),
			"logs",
			"security",
			"secrets-report.json",
		),
	} = {}) {
		this.root = root;
		this.reportPath = reportPath;
	}

	async init() {
		await fs.mkdir(path.dirname(this.reportPath), { recursive: true });
	}

	async scan() {
		const findings = [];
		for await (const file of walk(this.root)) {
			try {
				const txt = await fs.readFile(file, "utf8");
				for (const p of PATTERNS) {
					p.re.lastIndex = 0;
					let match = p.re.exec(txt);
					let count = 0;
					while (match && count < 5) {
						const snippet = match[0].slice(0, 120);
						findings.push({
							file: path.relative(this.root, file),
							pattern: p.id,
							severity: classifySeverity(p.id),
							offset: match.index,
							snippet,
						});
						count++;
						match = p.re.exec(txt);
					}
				}
			} catch {}
		}
		const summary = {
			at: new Date().toISOString(),
			total: findings.length,
			by_severity: {
				critical: findings.filter((f) => f.severity === "critical").length,
				high: findings.filter((f) => f.severity === "high").length,
				medium: findings.filter((f) => f.severity === "medium").length,
			},
			findings,
		};
		await fs.writeFile(this.reportPath, JSON.stringify(summary, null, 2));
		return summary;
	}
}
