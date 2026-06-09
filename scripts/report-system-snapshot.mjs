import fs from "node:fs";
import path from "node:path";

function exists(rel) {
	try {
		fs.accessSync(path.resolve(rel));
		return true;
	} catch {
		return false;
	}
}

function main() {
	const out = {
		ok: true,
		ts: new Date().toISOString(),
		repo: process.env.GITHUB_REPOSITORY || null,
		ref: process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || null,
		sha: process.env.GITHUB_SHA || null,
		run_id: process.env.GITHUB_RUN_ID || null,
		versions: {
			node: process.version,
		},
		paths: {
			package_json: exists("package.json"),
			api_dir: exists("api"),
			scripts_dir: exists("scripts"),
			workflows_dir: exists(".github/workflows"),
			rank_output_dir: exists("rank/output"),
			api_specs_dir: exists("api-specs"),
		},
		disclaimer:
			"Static artifacts only. This snapshot does not prove live hosting or external API connectivity.",
	};
	process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

main();

