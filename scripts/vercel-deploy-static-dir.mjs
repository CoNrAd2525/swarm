import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

function str(name) {
	const v = process.env[name];
	return v == null ? "" : String(v).trim();
}

function ensureDirExists(dir) {
	if (!fs.existsSync(dir)) throw new Error(`missing_deploy_dir:${dir}`);
}

function run(cmd, args, cwd) {
	const r = spawnSync(cmd, args, {
		cwd,
		stdio: "inherit",
		shell: process.platform === "win32",
		env: { ...process.env },
	});
	if (r.error) throw r.error;
	if (r.status !== 0) throw new Error(`command_failed:${cmd}`);
}

function main() {
	const token = str("VERCEL_TOKEN");
	const projectName =
		str("VERCEL_PROJECT_NAME") || str("VERCEL_PROJECT") || "realworldcerts-site";
	const teamId = str("VERCEL_TEAM_ID") || str("VERCEL_ORG_ID");
	const dir =
		str("VERCEL_DEPLOY_DIR") ||
		path.resolve(process.cwd(), "rank", "output");

	if (!token) {
		process.stdout.write(
			JSON.stringify(
				{
					ok: false,
					error: "missing_vercel_token",
					hint: "Set VERCEL_TOKEN and optionally VERCEL_DEPLOY_DIR + VERCEL_PROJECT_NAME",
				},
				null,
				2,
			) + "\n",
		);
		process.exitCode = 2;
		return;
	}

	ensureDirExists(dir);

	const args = [
		"vercel",
		"deploy",
		"--prod",
		"--yes",
		"--name",
		projectName,
	];
	if (teamId) args.push("--scope", teamId);

	process.env.VERCEL_TOKEN = token;
	run("npx", args, dir);
}

main();
