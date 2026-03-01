import fs from "node:fs";

const ledgerPath = new URL("../data/financial/settlement_ledger.json", import.meta.url);
const text = fs.readFileSync(ledgerPath, "utf8");
JSON.parse(text);
console.log("ledger json ok");

