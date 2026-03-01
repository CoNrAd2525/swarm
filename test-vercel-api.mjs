import "dotenv/config";


const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_TEAM_ID;
const projectName = process.env.VERCEL_PROJECT_NAME || "realworldcerts-site";

async function testApi() {
	const base = "https://api.vercel.com";
	const u = new URL(base + `/v9/projects/${encodeURIComponent(projectName)}`);
	if (teamId) u.searchParams.set("teamId", teamId);
	
	// Try different formats
	const formats = [
		{
			name: "git object",
			body: {
				git: {
					type: "github",
					repo: "CoNrAd2525/swarm",
					branch: "master"
				}
			}
		},
		{
			name: "gitRepository object",
			body: {
				gitRepository: {
					type: "github", 
					repo: "CoNrAd2525/swarm",
					branch: "master"
				}
			}
		},
		{
			name: "repository object",
			body: {
				repository: {
					type: "github",
					repo: "CoNrAd2525/swarm",
					branch: "master"
				}
			}
		}
	];
	
	for (const format of formats) {
		console.log(`\nTesting ${format.name}:`);
		console.log("Request body:", JSON.stringify(format.body, null, 2));
		
		const res = await fetch(u.toString(), {
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(format.body),
		});
		
		const responseText = await res.text();
		let json;
		try {
			json = JSON.parse(responseText);
		} catch {
			json = { raw: responseText };
		}
		
		console.log("Response status:", res.status);
		console.log("Response:", JSON.stringify(json, null, 2));
		
		if (res.ok) {
			console.log("✅ Success with", format.name);
			break;
		}
	}
}

testApi().catch(console.error);
