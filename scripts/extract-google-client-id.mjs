import fs from "fs";
import path from "path";
function findClientSecretJson() {
  const root = process.cwd();
  const files = fs.readdirSync(root).filter(f => /^client_secret_.*\.json$/i.test(f));
  if (files.length) return path.join(root, files[0]);
  return null;
}
function parseClient(jsonPath){
  const j = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const web = j.web || j.installed || {};
  const client_id = web.client_id || "";
  const client_secret = web.client_secret || "";
  return { client_id, client_secret };
}
function writeEnv(client_id){
  const envPath = path.join(process.cwd(), ".env");
  let existing = "";
  if (fs.existsSync(envPath)) existing = fs.readFileSync(envPath, "utf8");
  const lines = existing.split(/\r?\n/).filter(Boolean).filter(l => !l.startsWith("GOOGLE_CLIENT_ID_WEB="));
  lines.push("GOOGLE_CLIENT_ID_WEB=" + client_id);
  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf8");
}
function main(){
  const p = findClientSecretJson();
  if (!p) {
    process.stdout.write(JSON.stringify({ ok:false, error:"client_secret JSON not found" })+"\n");
    return;
  }
  const { client_id } = parseClient(p);
  if (!client_id) {
    process.stdout.write(JSON.stringify({ ok:false, error:"client_id missing in JSON" })+"\n");
    return;
  }
  writeEnv(client_id);
  process.stdout.write(JSON.stringify({ ok:true, client_id, env: ".env" })+"\n");
}
main();
