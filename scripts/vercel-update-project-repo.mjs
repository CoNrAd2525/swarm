import "dotenv/config";

function str(name) {
	const v = process.env[name];
	return v == null ? "" : String(v).trim();
}

async function vercelFetchJson(path, { token, teamId, method = "GET", body } = {}) {
	const base = "https://api.vercel.com";
	const u = new URL(base + path);
	if (teamId) u.searchParams.set("teamId", teamId);
	const res = await fetch(u.toString(), {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
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

async function main() {
	const token = str("VERCEL_TOKEN");
	const teamId = str("VERCEL_TEAM_ID") || str("VERCEL_ORG_ID");
	const projectName =
		str("VERCEL_PROJECT_NAME") || str("VERCEL_PROJECT") || "realworldcerts-site";
	const repo = str("VERCEL_GIT_REPO");
	const gitType = str("VERCEL_GIT_PROVIDER") || "github";
	const branch = str("VERCEL_GIT_BRANCH");
	const rootDirectory = str("VERCEL_ROOT_DIRECTORY") || "rank";

	if (!token) {
		process.stdout.write(
			JSON.stringify({ ok: false, error: "missing_vercel_token" }, null, 2) + "\n",
		);
		process.exitCode = 2;
		return;
	}
	if (!repo) {
		process.stdout.write(
			JSON.stringify(
				{
					ok: false,
					error: "missing_vercel_git_repo",
					hint: "Set VERCEL_GIT_REPO like CoNrAd2525/swarm",
				},
				null,
				2,
			) + "\n",
		);
		process.exitCode = 2;
		return;
	}

	const body = {
		rootDirectory,
		git: {
			type: gitType,
			repo,
			...(branch ? { branch } : {}),
		},
	};

	const res = await vercelFetchJson(
		`/v9/projects/${encodeURIComponent(projectName)}`,
		{
			token,
			teamId,
			method: "PATCH",
			body,
		},
	);

	process.stdout.write(
		JSON.stringify(
			{
				ok: res.ok,
				status: res.status,
				project: projectName,
				request: {
				rootDirectory,
				git: {
					type: gitType,
					repo,
					...(branch ? { branch } : {}),
				},
			},
				response: res.json,
			},
			null,
			2,
		) + "\n",
	);
	if (!res.ok) process.exitCode = 1;
}

main().catch((e) => {
	process.stdout.write(
		JSON.stringify({ ok: false, error: e?.message || String(e) }, null, 2) + "\n",
	);
	process.exitCode = 1;
});
