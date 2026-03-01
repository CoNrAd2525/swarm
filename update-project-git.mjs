import "dotenv/config";


const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_TEAM_ID;
const projectName = process.env.VERCEL_PROJECT_NAME || "realworldcerts-site";
const repo = process.env.VERCEL_GIT_REPO;
const gitType = process.env.VERCEL_GIT_PROVIDER || "github";
const branch = process.env.VERCEL_GIT_BRANCH;
const rootDirectory = process.env.VERCEL_ROOT_DIRECTORY || "rank";

async function updateProjectGit() {
	const base = "https://api.vercel.com";
	const u = new URL(base + `/v9/projects/${encodeURIComponent(projectName)}`);
	if (teamId) u.searchParams.set("teamId", teamId);
	
	// Update rootDirectory and git link configuration
	const body = {
		rootDirectory,
		link: {
			type: gitType,
			repo,
			...(branch ? { productionBranch: branch } : {}),
		},
	};
	
	console.log("Attempting to update with body:", JSON.stringify(body, null, 2));
	
	const res = await fetch(u.toString(), {
		method: "PATCH",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	
	const responseText = await res.text();
	let json;
	try {
		json = JSON.parse(responseText);
	} catch {
		json = { raw: responseText };
	}
	
	console.log("Response:", JSON.stringify({
		status: res.status,
		ok: res.ok,
		json
	}, null, 2));
}

updateProjectGit().catch(console.error);
