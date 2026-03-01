import "dotenv/config";


const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_TEAM_ID;
const projectName = process.env.VERCEL_PROJECT_NAME || "realworldcerts-site";

async function getProject() {
	const base = "https://api.vercel.com";
	const u = new URL(base + `/v9/projects/${encodeURIComponent(projectName)}`);
	if (teamId) u.searchParams.set("teamId", teamId);
	
	const res = await fetch(u.toString(), {
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});
	
	const json = await res.json();
	console.log(JSON.stringify(json, null, 2));
}

getProject().catch(console.error);
