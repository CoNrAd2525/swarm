import fs from "node:fs";
import path from "node:path";

const PROFILE_SETTINGS = {
	flow: {
		baseUrl: "https://agent-flow-ai-9855ea98.base44.app/api",
		appId: "6888ac155ebf84dd9855ea98",
	},
	swarm: {
		baseUrl: "https://agent-swarm-efe0bd7e.base44.app/api",
		appId: "689afeabf1db9c30efe0bd7e",
	},
};

function getProfileArg() {
	const raw = String(process.argv[2] || "").trim().toLowerCase();
	if (!raw || !PROFILE_SETTINGS[raw]) {
		throw new Error("PROFILE_REQUIRED: use 'flow' or 'swarm'");
	}
	return raw;
}

function candidateFiles(cwd) {
	return [
		process.env.BASE44_CREDENTIALS_FILE,
		path.resolve(cwd, "..", "Base44.txt"),
		path.resolve(cwd, "..", "base44.txt"),
	].filter(Boolean);
}

function readCredentialsText(cwd) {
	for (const file of candidateFiles(cwd)) {
		if (fs.existsSync(file)) {
			return { file, text: fs.readFileSync(file, "utf8") };
		}
	}
	throw new Error("BASE44_CREDENTIALS_FILE_NOT_FOUND");
}

function findApiKey(text, profile) {
	const { baseUrl, appId } = PROFILE_SETTINGS[profile];
	const anchors = [baseUrl, appId].filter(Boolean);
	for (const anchor of anchors) {
		const idx = text.indexOf(anchor);
		if (idx >= 0) {
			const start = idx;
			const end = Math.min(text.length, idx + 12000);
			const window = text.slice(start, end);
			const match =
				window.match(/api_key\s*["':=\s]+([a-f0-9]{24,})/i) ||
				window.match(/"api_key"\s*:\s*"([a-f0-9]{24,})"/i);
			if (match?.[1]) return match[1];
		}
	}
	const globalMatch = text.match(new RegExp(`${appId}[\\s\\S]{0,1200}?api_key\\s*["':=\\s]+([a-f0-9]{24,})`, "i"));
	if (globalMatch?.[1]) return globalMatch[1];
	throw new Error(`BASE44_API_KEY_NOT_FOUND_FOR_PROFILE:${profile}`);
}

async function main() {
	const cwd = process.cwd();
	const profile = getProfileArg();
	const settings = PROFILE_SETTINGS[profile];
	const { file, text } = readCredentialsText(cwd);
	const apiKey = process.env.BASE44_API_KEY || findApiKey(text, profile);

	process.env.BASE44_API_URL = process.env.BASE44_API_URL || settings.baseUrl;
	process.env.BASE44_APP_ID = process.env.BASE44_APP_ID || settings.appId;
	process.env.BASE44_API_KEY = apiKey;

	const mod = await import("./push-to-base44.mjs");
	if (typeof mod.main !== "function") {
		throw new Error("PUSH_TO_BASE44_MAIN_NOT_EXPORTED");
	}

	process.stdout.write(
		`${JSON.stringify({
			ok: true,
			profile,
			credentials_file: file,
			base_url: process.env.BASE44_API_URL,
			app_id: process.env.BASE44_APP_ID,
			auth_mode: "api_key",
		})}\n`,
	);
	await mod.main();
}

main().catch((error) => {
	process.stderr.write(`${error?.message || String(error)}\n`);
	process.exit(1);
});
