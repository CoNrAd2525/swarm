import fs from "fs";
import path from "path";
function env(name){ return process.env[name] || ""; }
function out(s){ process.stdout.write(String(s) + "\n"); }
function fail(msg){ out(JSON.stringify({ ok:false, error: msg })); process.exit(0); }
function main(){
  const keyB64 = env("GOOGLE_ADMIN_KEY_BASE64");
  const delegatedUser = env("GOOGLE_ADMIN_DELEGATED_USER"); // admin@your-domain
  const orgUnitPath = env("GOOGLE_ADMIN_ORG_UNIT") || "/Agents";
  const requestsPath = path.resolve("data","agents_requests.csv");
  if (!keyB64 || !delegatedUser) {
    fail("Provisioning disabled: missing GOOGLE_ADMIN_KEY_BASE64 or GOOGLE_ADMIN_DELEGATED_USER");
    return;
  }
  if (!fs.existsSync(requestsPath)) {
    fail("No requests file found at " + requestsPath);
    return;
  }
  const rows = fs.readFileSync(requestsPath, "utf8").trim().split(/\r?\n/).slice(1);
  const reqs = rows.map(l=>{
    const [givenName,surname,primaryEmail,password] = l.split(",");
    return { name: { givenName, familyName: surname }, primaryEmail, password };
  }).filter(x=>x.primaryEmail);
  out(JSON.stringify({ ok:true, ready:true, found:reqs.length, note:"Implement Directory API call here with domain-wide delegation" }));
}
main();
