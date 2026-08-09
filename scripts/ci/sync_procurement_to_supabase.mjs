#!/usr/bin/env node

import fs from "node:fs";

function str(name) {
  const v = process.env[name];
  return v == null ? "" : String(v).trim();
}

function required(name) {
  const v = str(name);
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

function pickBucket() {
  return str("SUPABASE_PROCUREMENT_BUCKET") || str("MIRROR_SUPABASE_BUCKET") || "swarm-mirror";
}

function readEvent() {
  const p = required("GITHUB_EVENT_PATH");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

async function ghRequest(path, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const text = await res.text().catch(() => "");
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`github_error:${res.status}:${text}`);
  return json;
}

async function uploadToSupabase({ url, key, bucket, objectPath, body }) {
  const base = url.replace(/\/+$/g, "");
  try {
    await fetch(`${base}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: bucket, name: bucket, public: false }),
    });
  } catch {}

  const ep = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;
  const res = await fetch(ep, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "content-type": "application/json",
      "x-upsert": "true",
    },
    body,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`supabase_error:${res.status}:${text}`);
}

const event = readEvent();
const issue = event?.issue;
if (!issue) throw new Error("missing_issue_in_event");

const repo = required("GITHUB_REPOSITORY");
const token = str("GITHUB_TOKEN");
if (!token) throw new Error("missing_env:GITHUB_TOKEN");

const supabaseUrl = required("SUPABASE_URL");
const supabaseKey = required("SUPABASE_SERVICE_ROLE_KEY");
const bucket = pickBucket();

const issueNumber = issue.number;
const [owner, name] = repo.split("/");
const full = await ghRequest(`/repos/${owner}/${name}/issues/${issueNumber}`, token);

const payload = {
  repo,
  issue_number: issueNumber,
  title: full?.title || "",
  state: full?.state || "",
  created_at: full?.created_at || "",
  updated_at: full?.updated_at || "",
  labels: (full?.labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean),
  body: full?.body || "",
  url: full?.html_url || "",
};

const ts = new Date().toISOString().replace(/[:.]/g, "");
const objectPath = `procurement/${repo}/${issueNumber}/${ts}.json`;

await uploadToSupabase({
  url: supabaseUrl,
  key: supabaseKey,
  bucket,
  objectPath,
  body: JSON.stringify(payload),
});

console.log(`uploaded:${bucket}:${objectPath}`);
