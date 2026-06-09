import fs from "node:fs";
import path from "node:path";

function ensureDir(p) {
	fs.mkdirSync(p, { recursive: true });
}

function writeText(p, txt) {
	ensureDir(path.dirname(p));
	fs.writeFileSync(p, txt);
}

function copyFileIfExists(from, to) {
	try {
		fs.copyFileSync(from, to);
		return true;
	} catch {
		return false;
	}
}

function firstExisting(paths) {
	for (const p of paths) {
		try {
			if (fs.existsSync(p)) return p;
		} catch {}
	}
	return null;
}

function safeJsonFileExists(p) {
	try {
		const st = fs.statSync(p);
		return st.isFile() && st.size > 2;
	} catch {
		return false;
	}
}

function main() {
	const outRoot = path.resolve("rank", "output");
	const outOpenApi = path.join(outRoot, "openapi");
	const outSiteData = path.join(outRoot, "site-data");
	ensureDir(outOpenApi);
	ensureDir(outSiteData);
	writeText(path.join(outRoot, ".nojekyll"), "");

	const specs = [
		{
			in: firstExisting([
				path.resolve("api-specs", "AgentSwarm-openapi-spec.json"),
				path.resolve("AgentSwarm-openapi-spec.json"),
			]),
			out: path.join(outOpenApi, "AgentSwarm-openapi-spec.json"),
			label: "AgentSwarm API",
		},
		{
			in: firstExisting([
				path.resolve("api-specs", "AgentFlow-openapi-spec.json"),
				path.resolve("AgentFlow-openapi-spec.json"),
				path.resolve("AgentFlow AI-openapi-spec.json"),
			]),
			out: path.join(outOpenApi, "AgentFlow-openapi-spec.json"),
			label: "AgentFlow API",
		},
	];

	const copied = specs.map((s) => ({
		...s,
		ok: s.in ? copyFileIfExists(s.in, s.out) : false,
	}));

	const watchdog = [
		{
			path: path.join(outSiteData, "api_pipeline_snapshot.json"),
			label: "API pipeline snapshot",
		},
		{
			path: path.join(outSiteData, "owner_routing_check.json"),
			label: "Owner routing env check",
		},
	].map((x) => ({ ...x, ok: safeJsonFileExists(x.path) }));

	const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Swarm Public Artifacts</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:32px;line-height:1.45;max-width:920px}
      code{background:#f2f2f2;padding:2px 6px;border-radius:6px}
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:16px}
      .card{border:1px solid #e6e6e6;border-radius:10px;padding:14px}
      a{color:#0a58ca;text-decoration:none}
      a:hover{text-decoration:underline}
      .muted{color:#666}
      ul{margin:8px 0 0 18px}
    </style>
  </head>
  <body>
    <h1>Swarm Public Artifacts</h1>
    <p class="muted">This page hosts static artifacts (schemas, checks, snapshots). It is not a running API server.</p>
    <div class="grid">
      <div class="card">
        <h2>OpenAPI</h2>
        <ul>
          ${copied
						.map((s) => {
							const name = path.basename(s.out);
							return `<li>${s.ok ? `<a href="openapi/${name}">${s.label}</a>` : `${s.label} (missing)`}</li>`;
						})
						.join("")}
        </ul>
      </div>
      <div class="card">
        <h2>Watchdog</h2>
        <ul>
          ${watchdog
						.map((w) => {
							const name = path.basename(w.path);
							return `<li>${w.ok ? `<a href="site-data/${name}">${w.label}</a>` : `${w.label} (missing)`}</li>`;
						})
						.join("")}
        </ul>
      </div>
      <div class="card">
        <h2>Notes</h2>
        <ul>
          <li>To reach live systems, configure secrets and deploy the runtime workloads.</li>
          <li>Local <code>file:///</code> links are navigation only; they do not imply hosting.</li>
        </ul>
      </div>
    </div>
  </body>
</html>`;
	writeText(path.join(outRoot, "index.html"), html);
}

main();
