import https from "node:https";

function postJSON(hostname, path, token, body) {
  const data = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        hostname,
        path,
        headers: {
          "Accept": "application/vnd.github+json",
          "User-Agent": "trae-deploy-bot",
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": data.length.toString(),
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
      (res) => {
        const chunks = nba();
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          const bodyStr = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, body: bodyStr });
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function nba() {
  const arr = [];
  arr.push = Array.prototype.push.bind(arr);
  return arr;
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const repo = process.env.VERCEL_GIT_REPO || "CoNrAd2525/swarm";
  const ref = process.env.VERCEL_GIT_BRANCH || "master";
  if (!token) {
    console.error("missing GITHUB_TOKEN in env");
    process.exitCode = 1;
    return;
  }
  const path = `/repos/${repo}/actions/workflows/site-deploy.yml/dispatches`;
  const payload = { ref, inputs: { environment: "prod" } };
  const r = await postJSON("api.github.com", path, token, payload);
  console.log(JSON.stringify({ ok: r.status >= 200 && r.status < 300, status: r.status, response: r.body.slice(0, 500) }));
}

main().catch((e) => {
  console.error(String(e && e.stack) || String(e));
  process.exitCode = 1;
});
