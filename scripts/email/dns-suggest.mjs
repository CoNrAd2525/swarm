import fs from "node:fs";
import path from "node:path";
function main() {
  const domain = process.env.SITE_DOMAIN || "realworldcerts.com";
  const spf = `v=spf1 include:spf.mailgun.org include:_spf.google.com ~all`;
  const dmarc = `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; ruf=mailto:dmarc@${domain}; adkim=s; aspf=s; pct=100`;
  const out = {
    domain,
    records: [
      { type: "TXT", host: "@", value: spf },
      { type: "TXT", host: "_dmarc", value: dmarc },
      { type: "CNAME", host: "selector1._domainkey", value: "selector1-yourprovider._domainkey" },
      { type: "CNAME", host: "selector2._domainkey", value: "selector2-yourprovider._domainkey" },
      { type: "MX", host: "@", value: "mail." + domain, priority: 10 },
    ],
  };
  const egress = path.resolve("dist_rwc", "egress");
  if (!fs.existsSync(egress)) fs.mkdirSync(egress, { recursive: true });
  fs.writeFileSync(path.join(egress, "email_dns_records.json"), JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify({ file: path.join(egress, "email_dns_records.json") }));
}
main();
