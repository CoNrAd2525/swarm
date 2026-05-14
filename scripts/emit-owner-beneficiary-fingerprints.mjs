import "dotenv/config";
import crypto from "node:crypto";
import { BankWireGateway } from "../src/financial/gateways/BankWireGateway.mjs";

function normIban(v) {
	return String(v || "")
		.replace(/\s+/g, "")
		.toUpperCase()
		.trim();
}

function normDigits(v) {
	return String(v || "").replace(/\D+/g, "").trim();
}

function legacyFp({ name, iban, swift }) {
	const n = `${String(name || "").trim()}|${normIban(iban)}|${String(swift || "")
		.trim()
		.toUpperCase()}`;
	if (!String(name || "").trim() || !normIban(iban) || !String(swift || "").trim())
		return null;
	return crypto.createHash("sha256").update(n).digest("hex");
}

const name = String(process.env.OWNER_BENEFICIARY_NAME || "").trim();
const iban = normIban(process.env.OWNER_IBAN);
const swift = String(process.env.OWNER_SWIFT || "").trim().toUpperCase();
const routing = normDigits(process.env.OWNER_ROUTING_NUMBER || process.env.OWNER_ROUTING);
const sortCode = normDigits(process.env.OWNER_SORT_CODE);
const accountNumber = normDigits(process.env.OWNER_ACCOUNT_NUMBER);

const gw = new BankWireGateway({ provider: process.env.BANK_WIRE_PROVIDER });

const candidates = [];
if (name && iban) candidates.push({ name, currency: "EUR", iban, swift: swift || undefined });
if (name && routing && accountNumber)
	candidates.push({ name, currency: "USD", routing, accountNumber });
if (name && sortCode && accountNumber)
	candidates.push({ name, currency: "GBP", sortCode, accountNumber });

const fingerprints = [];
for (const c of candidates) {
	fingerprints.push(gw.computeBeneficiaryFingerprint(c));
	if (c.currency === "EUR") {
		const lf = legacyFp({ name: c.name, iban: c.iban, swift: c.swift });
		if (lf) fingerprints.push(lf);
	}
}

process.stdout.write(
	`${JSON.stringify({ ok: fingerprints.length > 0, fingerprints }, null, 2)}\n`,
);
