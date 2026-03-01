import "dotenv/config";

function str(name) {
	const v = process.env[name];
	return v == null ? "" : String(v).trim();
}

async function vercelFetch(path, { token, teamId } = {}) {
	const base = "https://api.vercel.com";
	const u = new URL(base + path);
	if (teamId) u.searchParams.set("teamId", teamId);
	const res = await fetch(u.toString(), {
		headers: { Authorization: `Bearer ${token}` },
	});
	const text = await res.text().catch(() => "");
	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = { raw: text };
	}
	return { ok: res.ok, status: res.status, json };
}

function extractRepo(project) {
	const p = project || {};
	const link = p.link || p.gitRepository || p.gitRepositoryLink || null;
	if (link) {
		const repo =
			link.repo ||
			link.repository ||
			link.repoName ||
			(link.org && link.repo ? `${link.org}/${link.repo}` : null) ||
			null;
		return repo ? String(repo) : null;
	}
	const git = p.gitRepository || p.gitRepositoryLink || null;
	if (git?.repo) return String(git.repo);
	return null;
}

async function main() {
	const token = str("VERCEL_TOKEN");
	const teamId = str("VERCEL_TEAM_ID") || str("VERCEL_ORG_ID");
	const projectName =
		str("VERCEL_PROJECT_NAME") || str("VERCEL_PROJECT") || "realworldcerts-site";
	const expectedRepo = str("VERCEL_EXPECT_GITHUB_REPO");

	if (!token) {
		process.stdout.write(
			JSON.stringify(
				{
					ok: false,
					error: "missing_vercel_token",
					hint: "Set VERCEL_TOKEN and optionally VERCEL_TEAM_ID + VERCEL_PROJECT_NAME",
				},
				null,
				2,
			) + "\n",
		);
		process.exitCode = 2;
		return;
	}

	const res = await vercelFetch(`/v9/projects/${encodeURIComponent(projectName)}`, {
		token,
		teamId,
	});
	if (!res.ok) {
		process.stdout.write(
			JSON.stringify(
				{
					ok: false,
					error: "vercel_api_error",
					status: res.status,
					response: res.json,
				},
				null,
				2,
			) + "\n",
		);
		process.exitCode = 1;
		return;
	}

	const repo = extractRepo(res.json);
	const matches =
		expectedRepo && repo
			? String(repo).toLowerCase() === String(expectedRepo).toLowerCase()
			: null;

	process.stdout.write(
		JSON.stringify(
			{
				ok: true,
				project: res.json?.name || projectName,
				git_repo: repo,
				expected_repo: expectedRepo || null,
				matches_expected: matches,
			},
			null,
			2,
		) + "\n",
	);
}

main().catch((e) => {
	process.stdout.write(
		JSON.stringify({ ok: false, error: e?.message || String(e) }, null, 2) +
			"\n",
	);
	process.exitCode = 1;
});
