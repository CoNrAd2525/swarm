import fs from "node:fs";
import path from "node:path";

function parseJsonMaybe(value) {
	if (!value) return null;
	if (typeof value === "object") return value;
	try {
		return JSON.parse(String(value));
	} catch {
		return null;
	}
}

function resolveGatewayInstructionPath(batch) {
	const gatewayRef = String(
		batch?.gateway_ref ?? batch?.notes?.gateway_ref ?? "",
	).trim();
	if (!gatewayRef.toUpperCase().startsWith("FILE:")) return null;
	const rawFile = gatewayRef.slice(5).trim();
	if (!rawFile) return null;
	const candidates = [];
	if (path.isAbsolute(rawFile)) {
		candidates.push(rawFile);
	} else {
		candidates.push(path.resolve(rawFile));
		candidates.push(path.resolve("exports", "bank-wire", rawFile));
		candidates.push(path.resolve("exports", "bank_wire", rawFile));
		candidates.push(path.resolve("exports", "bank", rawFile));
	}
	return candidates.find((filePath) => fs.existsSync(filePath)) ?? null;
}

function loadGatewayInstruction(batch) {
	const filePath = resolveGatewayInstructionPath(batch);
	if (!filePath) return null;
	try {
		return parseJsonMaybe(fs.readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
}

function collectBankSignals(batch) {
	const instruction = loadGatewayInstruction(batch);
	const destinationSummary = parseJsonMaybe(batch?.destination_summary);
	const metadata = parseJsonMaybe(batch?.metadata);
	return [
		batch?.provider,
		batch?.bank_name,
		batch?.bank,
		batch?.bank_provider,
		batch?.gateway_ref,
		batch?.reference,
		batch?.beneficiary_name,
		batch?.beneficiary?.bank_name,
		batch?.beneficiary?.bank,
		destinationSummary?.bank,
		destinationSummary?.provider,
		metadata?.bank_name,
		metadata?.bank_provider,
		instruction?.beneficiary?.bank_name,
		instruction?.beneficiary?.bank,
		instruction?.provider,
	]
		.map((value) => String(value ?? "").trim().toLowerCase())
		.filter(Boolean);
}

function isAttijariBankWire(batch) {
	return collectBankSignals(batch).some((value) => value.includes("attijari"));
}

export {
	collectBankSignals,
	isAttijariBankWire,
	loadGatewayInstruction,
	resolveGatewayInstructionPath,
};
