import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { RotationChecklist } from "../src/security/RotationChecklist.mjs";
import { SecretsScanner } from "../src/security/SecretsScanner.mjs";

async function run() {
	const roots = [path.resolve("src"), path.resolve("scripts")];
	let total = 0;
	const bySeverity = { critical: 0, high: 0, medium: 0 };
	const findings = [];
	for (const r of roots) {
		const reportPath = path.join(
			"logs",
			"security",
			`secrets-report-${path.basename(r)}.json`,
		);
		const scanner = new SecretsScanner({ root: r, reportPath });
		await scanner.init();
		const res = await scanner.scan();
		total += res.total;
		bySeverity.critical += res.by_severity.critical;
		bySeverity.high += res.by_severity.high;
		bySeverity.medium += res.by_severity.medium;
		for (const f of res.findings || []) {
			if (findings.length >= 250) break;
			findings.push(f);
		}
	}
	const mainReport = {
		at: new Date().toISOString(),
		total,
		by_severity: bySeverity,
		findings,
	};
	await fs.mkdir(path.join("logs", "security"), { recursive: true });
	await fs.writeFile(
		path.join("logs", "security", "secrets-summary.json"),
		JSON.stringify(mainReport, null, 2),
	);
	console.log(
		`[Scan] Findings: ${total} (critical=${bySeverity.critical}, high=${bySeverity.high})`,
	);
	const checklist = new RotationChecklist({
		reportPath: path.join("logs", "security", "secrets-summary.json"),
	});
	const out = await checklist.generate();
	console.log(`[Scan] Rotation checklist generated: ${out}`);
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
