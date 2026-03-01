import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function readText(p) {
	return fs.readFileSync(p, "utf8");
}

function git(args) {
	return execFileSync("git", args, {
		cwd: process.cwd(),
		encoding: "utf8",
		env: { ...process.env, GIT_PAGER: "cat" },
	});
}

function safeParseJsonFile(p) {
	try {
		return JSON.parse(fs.readFileSync(p, "utf8"));
	} catch {
		return null;
	}
}

function listChangedFiles() {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	const evt = eventPath ? safeParseJsonFile(eventPath) : null;
	let base = null;
	let head = null;
	if (evt?.pull_request?.base?.sha && evt?.pull_request?.head?.sha) {
		base = String(evt.pull_request.base.sha);
		head = String(evt.pull_request.head.sha);
	}
	if (!base && !head && evt?.before && evt?.after) {
		base = String(evt.before);
		head = String(evt.after);
	}
	let out = "";
	try {
		if (base && head && base !== "0000000000000000000000000000000000000000") {
			out = git(["diff", "--name-only", `${base}..${head}`]);
		} else {
			out = git(["diff", "--name-only", "HEAD~1..HEAD"]);
		}
	} catch {
		out = "";
	}
	const list = out
		.split(/\r?\n/g)
		.map((s) => s.trim())
		.filter(Boolean);
	if (list.length) return list;
	const fallback = [
		".github/workflows/deploy-pages.yml",
		".gitignore",
		"package.json",
	].filter((p) => fs.existsSync(path.resolve(p)));
	return fallback;
}

function isTextCandidate(file) {
	const ext = path.extname(file).toLowerCase();
	if (
		[
			".js",
			".mjs",
			".cjs",
			".ts",
			".tsx",
			".json",
			".yml",
			".yaml",
			".md",
			".txt",
			".html",
			".css",
			".env",
			".example",
		].includes(ext)
	)
		return true;
	if (file.endsWith(".env.example")) return true;
	return false;
}

function fileSizeSafe(p) {
	try {
		return fs.statSync(p).size;
	} catch {
		return 0;
	}
}

function checkDeployPagesWorkflow(errors) {
	const p = path.resolve(".github", "workflows", "deploy-pages.yml");
	if (!fs.existsSync(p)) return;
	const t = readText(p);
	if (!t.includes("path: rank/output")) {
		errors.push("deploy-pages.yml must deploy rank/output");
	}
	if (t.includes("path: site/realworldcerts") || t.includes("dist_rwc")) {
		errors.push("deploy-pages.yml must not deploy site/realworldcerts or dist_rwc");
	}
}

function checkGitignore(errors) {
	const p = path.resolve(".gitignore");
	if (!fs.existsSync(p)) return;
	const t = readText(p);
	if (!t.split(/\r?\n/g).some((l) => l.trim() === ".env"))
		errors.push(".gitignore must include .env");
	if (!t.split(/\r?\n/g).some((l) => l.trim().toLowerCase() === "creds.txt"))
		errors.push(".gitignore must include CREDS.txt");
}

function scanForSecrets(errors) {
	const tokenPattern = /\bvcp_[A-Za-z0-9]{20,}\b/g;
	const envTokenPattern = /\bVERCEL_TOKEN\s*[:=]\s*["']?vcp_[A-Za-z0-9]{20,}["']?/gi;
	const files = listChangedFiles();
	for (const f of files) {
		if (!f) continue;
		if (!isTextCandidate(f)) continue;
		const abs = path.resolve(f);
		if (!fs.existsSync(abs)) continue;
		const size = fileSizeSafe(abs);
		if (size > 2 * 1024 * 1024) continue;
		let t = "";
		try {
			t = readText(abs);
		} catch {
			continue;
		}
		if (envTokenPattern.test(t) || tokenPattern.test(t)) {
			errors.push(`possible_vercel_token_leak:${f}`);
		}
	}
}

function main() {
	const errors = [];
	checkDeployPagesWorkflow(errors);
	checkGitignore(errors);
	scanForSecrets(errors);
	if (errors.length) {
		process.stdout.write(JSON.stringify({ ok: false, errors }, null, 2) + "\n");
		process.exitCode = 1;
		return;
	}
	process.stdout.write(JSON.stringify({ ok: true }, null, 2) + "\n");
}

main();
