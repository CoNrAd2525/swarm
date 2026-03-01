import { execSync } from "node:child_process";

function sh(cmd) {
  return execSync(cmd, { stdio: "inherit" });
}

const CANONICAL_BRANCH = process.env.CANONICAL_BRANCH || "main";
const IMPORT_URL = process.env.IMPORT_URL || "";
const IMPORT_BRANCH = process.env.IMPORT_BRANCH || "main";
const SUBTREE_PREFIX = process.env.SUBTREE_PREFIX || "legacy-nosim";
const IMPORT_REMOTE = process.env.IMPORT_REMOTE || "nosim";

if (!IMPORT_URL) {
  process.stderr.write("IMPORT_URL missing\n");
  process.exit(2);
}

try {
  sh(`git rev-parse --is-inside-work-tree`);
  sh(`git fetch origin ${CANONICAL_BRANCH}`);
  sh(`git checkout -B merge-nosim origin/${CANONICAL_BRANCH}`);
  try {
    sh(`git remote add ${IMPORT_REMOTE} ${IMPORT_URL}`);
  } catch {}
  sh(`git fetch ${IMPORT_REMOTE} ${IMPORT_BRANCH}`);
  sh(
    `git subtree add --prefix=${SUBTREE_PREFIX} ${IMPORT_REMOTE} ${IMPORT_BRANCH}`
  );
  sh(`git status`);
  process.stdout.write("OK\n");
} catch (e) {
  process.stderr.write(String(e.message || e) + "\n");
  process.exit(1);
}
