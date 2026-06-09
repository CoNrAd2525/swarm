import fs from "node:fs";
import path from "node:path";
import { pollNews } from "../src/swarm/news-watch.mjs";

function ensureDir(p) {
	fs.mkdirSync(p, { recursive: true });
}

function readUrls() {
	const raw = String(process.env.CHANGELOG_URLS_JSON || "").trim();
	if (raw) {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
				return parsed;
			}
		} catch {}
	}
	return [
		"https://github.blog/changelog/2026-05-15-github-app-installation-tokens-per-request-override-header/",
		"https://developer.paypal.com/docs/release-notes/",
		"https://plaid.com/changelog/",
		"https://vercel.com/changelog",
	];
}

async function main() {
	const urls = readUrls();
	const outDir = path.resolve("rank", "output", "site-data");
	ensureDir(outDir);
	const res = await pollNews(urls, { outDir });
	const stable = path.join(outDir, "changelog_watch.json");
	if (res?.file && fs.existsSync(res.file)) {
		const txt = fs.readFileSync(res.file, "utf8");
		fs.writeFileSync(stable, txt);
		try {
			fs.unlinkSync(res.file);
		} catch {}
		process.stdout.write(JSON.stringify({ ok: true, urls: urls.length, out: stable }) + "\n");
		return;
	}
	fs.writeFileSync(
		stable,
		JSON.stringify({ created_at: new Date().toISOString(), entries: [] }, null, 2) + "\n",
	);
	process.stdout.write(JSON.stringify({ ok: true, urls: urls.length, out: stable }) + "\n");
}

main();
