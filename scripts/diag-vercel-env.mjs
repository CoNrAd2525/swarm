import "dotenv/config";
import { loadCredsFromCredsTxt } from "../src/utils/creds-txt-loader.mjs";

function len(name) {
	const v = process.env[name];
	return v ? String(v).length : 0;
}

function has(name) {
	return len(name) > 0;
}

loadCredsFromCredsTxt();

process.stdout.write(
	JSON.stringify(
		{
			has_token: has("VERCEL_TOKEN"),
			token_len: len("VERCEL_TOKEN"),
			has_org_id: has("VERCEL_ORG_ID"),
			has_project_id: has("VERCEL_PROJECT_ID"),
			has_team_id: has("VERCEL_TEAM_ID"),
		},
		null,
		2,
	) + "\n",
);
