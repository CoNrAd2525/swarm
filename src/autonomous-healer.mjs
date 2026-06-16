import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

export class SelfHealer {
	constructor() {
		this.logPath = path.resolve("logs/self-healing.jsonl");
		this.strategies = [
			{
				name: "create_missing_module",
				pattern: /Cannot find module '(.+?)'/,
				action: async (match) => {
					const missingPath = match[1];
					if (!missingPath.includes("scripts") && !missingPath.includes("src"))
						return false;

					console.log(
						`[SelfHealer] Detected missing module: ${missingPath}. Attempting stub creation...`,
					);

					const content = missingPath.endsWith(".mjs")
						? 'console.log("Stub auto-created by SelfHealer"); export default {};'
						: "";

					try {
						await fs.mkdir(path.dirname(missingPath), { recursive: true });
						await fs.writeFile(missingPath, content);
						return true;
					} catch (e) {
						console.error(`[SelfHealer] Failed to create stub: ${e.message}`);
						return false;
					}
				},
			},
			{
				name: "fix_syntax_error",
				pattern: /SyntaxError: .+?\n.*at .+?\((.+?):(\d+):(\d+)\)/,
				action: async (match) => {
					const filePath = match[1];
					console.log(
						`[SelfHealer] Detected syntax error in ${filePath}. Attempting git revert...`,
					);
					return await this.revertFileViaGit(filePath);
				},
			},
			{
				name: "fix_syntax_error_simple",
				pattern: /SyntaxError: Unexpected token/,
				action: async (match) => {
					const fileMatch = match.input?.match(/at\s+(.+?):(\d+):(\d+)/);
					if (!fileMatch) return false;
					const filePath = fileMatch[1];
					console.log(
						`[SelfHealer] Detected syntax error in ${filePath}. Attempting git revert...`,
					);
					return await this.revertFileViaGit(filePath);
				},
			},
			{
				name: "fix_undefined_method",
				pattern: /TypeError: (?:.*)\.(\w+) is not a function/,
				action: async (match) => {
					const methodName = match[1];
					console.warn(
						`[SelfHealer] CRITICAL: Method '${methodName}' is missing. Manual intervention or advanced codegen required.`,
					);
					return false;
				},
			},
		];
	}

	async revertFileViaGit(filePath) {
		const absPath = path.resolve(filePath);
		try {
			const res = spawnSync("git", [
				"checkout",
				"HEAD",
				"--",
				absPath,
			], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
				cwd: process.cwd(),
			});
			if (res.status === 0) {
				console.log(`[SelfHealer] Reverted ${filePath} to HEAD.`);
				return true;
			}
			if (res.status !== 0) {
				const errMsg = (res.stderr || res.stdout || "").trim();
				console.warn(
					`[SelfHealer] git checkout failed for ${filePath}: ${errMsg}`,
				);
				return false;
			}
		} catch (e) {
			console.warn(
				`[SelfHealer] git checkout threw for ${filePath}: ${e.message}`,
			);
		}
		return false;
	}

	async sourceScanAndHeal({ directories = ["src", "scripts"] } = {}) {
		const cwd = process.cwd();
		const errors = [];
		for (const dir of directories) {
			const absDir = path.resolve(cwd, dir);
			try {
				await this._walkAndCheck(absDir, errors);
			} catch {
				continue;
			}
		}
		if (errors.length === 0) return { ok: true, errors: [] };

		const results = [];
		for (const { filePath, errorText } of errors) {
			const healed = await this.attemptHeal(errorText + `\n    at ${filePath}:1:1`);
			results.push({ filePath, error: errorText.slice(0, 200), healed });
		}
		const allHealed = results.every((r) => r.healed);
		return { ok: allHealed, errors: results };
	}

	async _walkAndCheck(dir, errors) {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
				await this._walkAndCheck(full, errors);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!entry.name.endsWith(".mjs") && !entry.name.endsWith(".js")) continue;
			const res = spawnSync(process.execPath, ["--check", full], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});
			if (res.status !== 0) {
				errors.push({ filePath: full, errorText: res.stderr || res.stdout || "" });
			}
		}
	}

	async attemptHeal(errorText) {
		for (const strategy of this.strategies) {
			const match = errorText.match(strategy.pattern);
			if (match) {
				const success = await strategy.action(match);
				await this.logHealAttempt(strategy.name, match[0], success);
				if (success) return true;
			}
		}
		return false;
	}

	async logHealAttempt(strategy, error, success) {
		const entry = {
			at: new Date().toISOString(),
			strategy,
			error,
			success,
		};
		try {
			await fs.mkdir(path.dirname(this.logPath), { recursive: true });
			await fs.appendFile(this.logPath, JSON.stringify(entry) + "\n");
		} catch {}
	}
}
