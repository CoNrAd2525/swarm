import process from "node:process";

function parseArgs(argv) {
	const args = {};
	for (let i = 2; i < argv.length; i += 1) {
		const token = argv[i];
		if (!token?.startsWith("--")) continue;
		const [key, value] = token.includes("=")
			? token.slice(2).split("=", 2)
			: [token.slice(2), argv[i + 1]];
		args[key] = value ?? true;
		if (!token.includes("=")) i += 1;
	}
	return args;
}

function requireString(value, label) {
	const v = String(value ?? "").trim();
	if (!v) throw new Error(`missing_${label}`);
	return v;
}

async function githubRequest(token, { method, url, body }) {
	const headers = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (body != null) headers["Content-Type"] = "application/json";
	const res = await fetch(url, {
		method,
		headers,
		body: body == null ? undefined : JSON.stringify(body),
	});
	const text = await res.text();
	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = null;
	}
	if (!res.ok) {
		const message =
			(json && (json.message || json.error)) || text || `http_${res.status}`;
		throw new Error(`github_api_error:${res.status}:${message}`);
	}
	return json;
}

async function main() {
	const args = parseArgs(process.argv);
	const repo = requireString(args.repo, "repo");
	const branch = String(args.branch || "master").trim() || "master";
	const token = String(
		process.env.GITHUB_ADMIN_TOKEN ||
			process.env.GITHUB_TOKEN_ADMIN ||
			process.env.GITHUB_TOKEN ||
			"",
	).trim();
	if (!token) throw new Error("missing_GITHUB_ADMIN_TOKEN");

	const strict = String(args.strict ?? "true") === "true";
	const requirePr = String(args.require_pr ?? "true") === "true";
	const approvals = Number(args.approvals ?? "1");
	const requireLinear = String(args.require_linear ?? "true") === "true";
	const enforceAdmins = String(args.enforce_admins ?? "true") === "true";

	const contexts = String(
		args.contexts ||
			"CI Guardrails / guardrails,RealWorldCerts Next CI / test-build",
	)
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	const [owner, name] = repo.split("/", 2);
	if (!owner || !name) throw new Error("invalid_repo_format_expected_owner_slash_repo");

	const url = `https://api.github.com/repos/${owner}/${name}/branches/${encodeURIComponent(
		branch,
	)}/protection`;

	const payload = {
		required_status_checks: {
			strict,
			contexts,
		},
		enforce_admins: enforceAdmins,
		required_pull_request_reviews: requirePr
			? {
					dismiss_stale_reviews: true,
					require_code_owner_reviews: false,
					required_approving_review_count: Math.max(1, approvals),
				}
			: null,
		restrictions: null,
		allow_force_pushes: false,
		allow_deletions: false,
		required_linear_history: requireLinear,
		required_conversation_resolution: true,
	};

	await githubRequest(token, {
		method: "PUT",
		url,
		body: payload,
	});

	process.stdout.write(
		JSON.stringify(
			{
				ok: true,
				repo,
				branch,
				required_status_checks: contexts,
				require_pr: requirePr,
				required_approvals: requirePr ? Math.max(1, approvals) : 0,
				enforce_admins: enforceAdmins,
				required_linear_history: requireLinear,
			},
			null,
			2,
		) + "\n",
	);
}

main().catch((err) => {
	process.stdout.write(
		JSON.stringify(
			{
				ok: false,
				error: String(err?.message || err),
			},
			null,
			2,
		) + "\n",
	);
	process.exitCode = 1;
});

