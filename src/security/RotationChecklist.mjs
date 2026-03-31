import fs from "node:fs/promises";
import path from "node:path";

function providerFromFinding(f) {
	const id = f.pattern;
	if (id.includes("plaid")) return "Plaid";
	if (id.includes("paypal")) return "PayPal";
	if (id.includes("wise")) return "Wise";
	if (id.includes("aws")) return "AWS";
	if (id.includes("private_key")) return "Keys";
	if (id.includes("jwt")) return "Auth/JWT";
	return "Generic";
}

export class RotationChecklist {
	constructor({
		reportPath = path.join(
			process.cwd(),
			"logs",
			"security",
			"secrets-report.json",
		),
		outPath = path.join(
			process.cwd(),
			"logs",
			"security",
			"rotation-checklist.md",
		),
	} = {}) {
		this.reportPath = reportPath;
		this.outPath = outPath;
	}

	async generate() {
		let report = null;
		try {
			const raw = await fs.readFile(this.reportPath, "utf8");
			report = JSON.parse(raw);
		} catch {
			report = { findings: [] };
		}
		const groups = {};
		for (const f of report.findings || []) {
			const p = providerFromFinding(f);
			if (!groups[p]) groups[p] = [];
			groups[p].push(f);
		}
		const lines = [];
		lines.push("# Secrets Rotation Checklist");
		lines.push("");
		lines.push(`Generated: ${new Date().toISOString()}`);
		lines.push("");
		for (const [prov, list] of Object.entries(groups)) {
			lines.push(`## ${prov}`);
			lines.push("");
			lines.push("- Revoke exposed keys/tokens in provider console");
			lines.push("- Issue new credentials and restrict scopes");
			lines.push("- Update secrets manager and CI/CD variables");
			lines.push("- Replace local .env values via secret loader");
			lines.push("- Deploy and validate connectivity");
			lines.push("- Audit access logs for misuse");
			lines.push("");
			lines.push("Findings:");
			for (const f of list.slice(0, 10)) {
				lines.push(`- ${f.pattern} ${f.file}`);
			}
			lines.push("");
		}
		if (!Object.keys(groups).length) {
			lines.push("No findings detected.");
		}
		await fs.mkdir(path.dirname(this.outPath), { recursive: true });
		await fs.writeFile(this.outPath, lines.join("\n"));
		return this.outPath;
	}
}
