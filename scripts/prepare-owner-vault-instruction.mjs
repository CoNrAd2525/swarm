import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { Interface, parseUnits } from "ethers";
import { parseArgs } from "../src/utils/cli.mjs";

function normalizeAmount(v) {
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return null;
	return Number(n.toFixed(2));
}

function buildInstruction({
	amount,
	tokenSymbol,
	tokenDecimals,
	to,
	batchId,
	contractAddress,
	chain,
	calldata,
}) {
	const prepared_at = new Date().toISOString();
	return {
		provider: "evm_owner_vault",
		action: "release_to_owner",
		chain,
		contract_address: contractAddress,
		token_symbol: tokenSymbol,
		token_decimals: tokenDecimals,
		to,
		amount,
		batch_id: batchId,
		calldata,
		prepared_at,
	};
}

function encodeCall({ to, amount, tokenDecimals, batchId }) {
	const decimals =
		Number.isFinite(tokenDecimals) && tokenDecimals > 0 ? tokenDecimals : 18;
	const iface = new Interface([
		"function releaseToOwner(address to, uint256 amount, string batchId)",
	]);
	const amountWei = parseUnits(String(amount), decimals);
	return iface.encodeFunctionData("releaseToOwner", [
		to,
		amountWei,
		String(batchId || ""),
	]);
}

function main() {
	const args = parseArgs(process.argv);
	const amount = normalizeAmount(args.amount ?? args.a);
	const tokenSymbol = String(args.token ?? args.symbol ?? "USDT").toUpperCase();
	const tokenDecimalsRaw =
		args.decimals ??
		process.env.OWNER_VAULT_TOKEN_DECIMALS ??
		process.env.USDT_DECIMALS;
	const tokenDecimals = tokenDecimalsRaw ? Number(tokenDecimalsRaw) : 18;
	const to =
		String(args.to ?? args.destination ?? args.owner ?? "").trim() ||
		String(
			process.env.OWNER_CRYPTO_BEP20 || process.env.TRUST_WALLET_ADDRESS || "",
		).trim();
	const batchId = String(args.batch ?? args.batch_id ?? "").trim();
	const contractAddress = String(
		args.contract ??
			args.contract_address ??
			process.env.OWNER_VAULT_CONTRACT_ADDRESS ??
			"",
	).trim();
	const chain = String(
		args.chain ??
			process.env.OWNER_VAULT_CHAIN ??
			process.env.CRYPTO_CHAIN ??
			"BSC",
	)
		.toUpperCase()
		.trim();
	const out = String(args.out ?? args.o ?? "").trim();

	if (!amount || !to || !contractAddress) {
		process.stdout.write(
			`${JSON.stringify({
				ok: false,
				error: "missing_amount_destination_or_contract",
			})}\n`,
		);
		process.exitCode = 1;
		return;
	}

	const calldata = encodeCall({
		to,
		amount,
		tokenDecimals,
		batchId,
	});
	const payload = buildInstruction({
		amount,
		tokenSymbol,
		tokenDecimals,
		to,
		batchId,
		contractAddress,
		chain,
		calldata,
	});

	process.stdout.write(
		`${JSON.stringify({ ok: true, instruction: payload }, null, 2)}\n`,
	);

	if (out) {
		const filePath = path.resolve(process.cwd(), out);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
	}
}

main();
