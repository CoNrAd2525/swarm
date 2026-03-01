import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function parsePsEnvFile(file) {
  const txt = fs.readFileSync(file, "utf8");
  const env = {};
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^\$env:([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function main() {
  const [envFileArg, scriptArg, ...rest] = process.argv.slice(2);
  if (!envFileArg || !scriptArg) {
    process.stderr.write(
      "usage: node run-with-envfile.mjs <env_file> <script> [args...]\n",
    );
    process.exit(2);
    return;
  }
  const envFile = path.resolve(envFileArg);
  const script = path.resolve(scriptArg);
  const add = parsePsEnvFile(envFile);
  const env = { ...process.env, ...add };
  const r = spawnSync("node", [script, ...rest], { env, stdio: "inherit" });
  process.exitCode = r.status ?? 0;
}

main();
