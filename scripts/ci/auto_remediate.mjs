#!/usr/bin/env node

const apiBase = "https://api.github.com";

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function parseRepoSlug() {
  const slug = process.env.TARGET_REPO || process.env.GITHUB_REPOSITORY;
  if (!slug) throw new Error("Missing TARGET_REPO or GITHUB_REPOSITORY");
  const [owner, repo] = slug.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo slug: ${slug}`);
  return { owner, repo };
}

function pickToken() {
  return process.env.REPO_TOKEN || process.env.GITHUB_TOKEN || "";
}

async function ghFetch(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: token ? `Bearer ${token}` : "",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.message || text || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return json;
}

async function listFailedRuns({ owner, repo, token }) {
  const data = await ghFetch(`/repos/${owner}/${repo}/actions/runs?status=failure&per_page=5`, { token });
  return data.workflow_runs || [];
}

async function rerunWorkflow({ owner, repo, token, runId }) {
  await ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, { token, method: "POST" });
}

async function getDefaultBranch({ owner, repo, token }) {
  const repoInfo = await ghFetch(`/repos/${owner}/${repo}`, { token });
  return repoInfo.default_branch || "main";
}

async function getRefSha({ owner, repo, token, branch }) {
  const ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { token });
  return ref.object?.sha;
}

async function createBranch({ owner, repo, token, branchName, baseSha }) {
  await ghFetch(`/repos/${owner}/${repo}/git/refs`, {
    token,
    method: "POST",
    body: { ref: `refs/heads/${branchName}`, sha: baseSha },
  });
}

async function listWorkflowFiles({ owner, repo, token }) {
  const items = await ghFetch(`/repos/${owner}/${repo}/contents/.github/workflows`, { token });
  if (!Array.isArray(items)) return [];
  return items.filter((i) => i.type === "file" && (i.name.endsWith(".yml") || i.name.endsWith(".yaml")));
}

async function getFile({ owner, repo, token, path }) {
  const file = await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, { token });
  const content = Buffer.from(file.content || "", "base64").toString("utf8");
  return { sha: file.sha, content };
}

async function putFile({ owner, repo, token, path, branch, sha, message, content }) {
  await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    token,
    method: "PUT",
    body: {
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      sha,
    },
  });
}

async function createPr({ owner, repo, token, head, base, title, body }) {
  const pr = await ghFetch(`/repos/${owner}/${repo}/pulls`, {
    token,
    method: "POST",
    body: { title, head, base, body },
  });
  return pr.number;
}

function applyBase44GuardToWorkflow(yamlText) {
  const needle = "node ./scripts/export-full-base44.mjs";
  if (!yamlText.includes(needle)) return { changed: false, content: yamlText };
  if (yamlText.includes("skipping export-full-base44")) return { changed: false, content: yamlText };

  const guarded = `if [ -z "$BASE44_APP_ID" ] || [ -z "$BASE44_SERVICE_TOKEN" ]; then
            echo "No Base44 credentials set — skipping export-full-base44."
          else
            set -o pipefail
            node ./scripts/export-full-base44.mjs
          fi`;

  return { changed: true, content: yamlText.replace(needle, guarded) };
}

async function maybeAutoPr({ owner, repo, token, autoPr }) {
  if (!autoPr) return;

  const workflowFiles = await listWorkflowFiles({ owner, repo, token });
  if (workflowFiles.length === 0) return;

  const defaultBranch = await getDefaultBranch({ owner, repo, token });
  const baseSha = await getRefSha({ owner, repo, token, branch: defaultBranch });
  if (!baseSha) throw new Error("Could not resolve base branch SHA");

  const branchName = `ci/auto-remediate/${Date.now()}`;
  await createBranch({ owner, repo, token, branchName, baseSha });

  let touched = 0;

  for (const wf of workflowFiles) {
    const path = `.github/workflows/${wf.name}`;
    const { sha, content } = await getFile({ owner, repo, token, path });
    const patched = applyBase44GuardToWorkflow(content);
    if (!patched.changed) continue;
    await putFile({
      owner,
      repo,
      token,
      path,
      branch: branchName,
      sha,
      message: "ci: guard Base44 export when secrets missing",
      content: patched.content,
    });
    touched++;
  }

  if (touched === 0) return;

  const prNumber = await createPr({
    owner,
    repo,
    token,
    head: branchName,
    base: defaultBranch,
    title: "ci: guard Base44 export when secrets missing",
    body: "Autonomous remediation: prevents workflow failures on missing Base44 secrets.",
  });

  console.log(`Created PR #${prNumber}`);
}

async function main() {
  const token = pickToken();
  if (!token) requiredEnv("GITHUB_TOKEN");

  const { owner, repo } = parseRepoSlug();
  const autoPr = (process.env.AUTO_PR || "false").toLowerCase() === "true";

  console.log(`Workflow Health Operator targeting ${owner}/${repo}`);

  const failed = await listFailedRuns({ owner, repo, token });
  for (const run of failed) {
    console.log(`Found failed run ${run.id} (${run.name})`);
    try {
      await rerunWorkflow({ owner, repo, token, runId: run.id });
      console.log(`Rerun requested for ${run.id}`);
    } catch (e) {
      console.warn(`Rerun failed for ${run.id}: ${e.message}`);
    }
  }

  try {
    await maybeAutoPr({ owner, repo, token, autoPr });
  } catch (e) {
    console.warn(`AUTO_PR step failed: ${e.message}`);
  }

  console.log("Operator run complete");
}

await main();

