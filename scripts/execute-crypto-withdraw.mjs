import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { binanceClient } from "../src/crypto/binance-client.mjs";
 import ccxt from "ccxt";

function envTrue(name) {
	const v = process.env[name];
	if (v == null) return false;
	return String(v).toLowerCase() === "true";
}

function getArg(name, def) {
	const idx = process.argv.indexOf(name);
	if (idx >= 0 && idx < process.argv.length - 1) return process.argv[idx + 1];
	return def;
}

function mapNetwork(v) {
	const s = String(v ?? "").toUpperCase();
	if (s === "ERC20" || s === "ETH") return "ETH";
	if (s === "BEP20" || s === "BSC") return "BSC";
	if (s === "TRX" || s === "TRON") return "TRX";
	return "BSC";
}

async function main() {
	if (envTrue("SAFE_MODE") || envTrue("SWARM_SAFE_MODE") || envTrue("BUNKER_MODE")) {
		const outDir = path.resolve("out", "crypto");
		fs.mkdirSync(outDir, { recursive: true });
		const payload = {
			ok: false,
			error: "kill_switch_active",
			reason: envTrue("BUNKER_MODE") ? "bunker_mode" : "safe_mode",
			queued: true,
			at: new Date().toISOString(),
		};
		fs.writeFileSync(
			path.join(outDir, `withdraw_queue_${Date.now()}.json`),
			JSON.stringify(payload, null, 2),
			"utf8",
		);
		console.error("SAFE/BUNKER mode active: withdrawal is queued, not executed");
		process.exitCode = 1;
		return;
	}
	if (!envTrue("CRYPTO_WITHDRAW_ENABLE")) {
		console.error("CRYPTO_WITHDRAW_ENABLE is not true: aborting");
		process.exitCode = 1;
		return;
	}
	if (
		String(process.env.CRYPTO_LIVE_CONFIRM || "").trim() !==
		"I_CONFIRM_CRYPTO_SETTLEMENT"
	) {
		console.error(
			"CRYPTO_LIVE_CONFIRM missing: set CRYPTO_LIVE_CONFIRM=I_CONFIRM_CRYPTO_SETTLEMENT",
		);
		process.exitCode = 1;
		return;
	}
	const amountStr = getArg(
		"--amount",
		process.env.CRYPTO_OVERRIDE_AMOUNT_USDT ?? "0",
	);
	const network = mapNetwork(process.env.CRYPTO_NETWORK ?? "BEP20");
	const address =
		process.env.TRUST_WALLET_USDT_ERC20 ??
		process.env.TRUST_WALLET_USDT_BEP20 ??
		process.env.TRUST_WALLET_ADDRESS;
	const amount = Number(amountStr);
	if (!address || String(address).trim() === "")
		throw new Error("Missing TRUST_WALLET address");
	if (!Number.isFinite(amount) || amount <= 0)
		throw new Error("Invalid amount");
	const outDir = path.resolve("out", "crypto");
	fs.mkdirSync(outDir, { recursive: true });
	let result;
	try {
		result = await binanceClient.withdraw({
			coin: "USDT",
			address,
			amount,
			network,
			name: "OwnerSettlement",
		});
		const errCode = Number(result?.code ?? 0);
		const errMsg = String(result?.msg ?? result?.message ?? "");
		if (errCode < 0 || /-10(21|22)/.test(errMsg)) {
			const exchange = new ccxt.binance({
				apiKey: process.env.BINANCE_API_KEY,
				secret: process.env.BINANCE_API_SECRET,
				options: { adjustForTimeDifference: true },
			});
			const r = await exchange.withdraw("USDT", amount, address, undefined, {
				network,
			});
			const payload = {
				ok: true,
				network,
				amount,
				address,
				result: r,
				at: new Date().toISOString(),
			};
			fs.writeFileSync(
				path.join(outDir, `binance_withdraw_${Date.now()}.json`),
				JSON.stringify(payload, null, 2),
				"utf8",
			);
			console.log(
			 JSON.stringify({
					ok: true,
					id: r?.id ?? null,
					status: r?.msg ?? r?.message ?? "sent",
				}),
			);
			return;
		}
		const payload = {
			ok: true,
			network,
			amount,
			address,
			result,
			at: new Date().toISOString(),
		};
		fs.writeFileSync(
			path.join(outDir, `binance_withdraw_${Date.now()}.json`),
			JSON.stringify(payload, null, 2),
			"utf8",
		);
		console.log(
			JSON.stringify({
				ok: true,
				id: result?.id ?? null,
				status: result?.msg ?? result?.message ?? "sent",
			}),
		);
	} catch (e) {
		try {
			const exchange = new ccxt.binance({
				apiKey: process.env.BINANCE_API_KEY,
				secret: process.env.BINANCE_API_SECRET,
				options: { adjustForTimeDifference: true },
			});
			const r = await exchange.withdraw("USDT", amount, address, undefined, {
				network,
			});
			const payload = {
				ok: true,
				network,
				amount,
				address,
				result: r,
				at: new Date().toISOString(),
			};
			fs.writeFileSync(
				path.join(outDir, `binance_withdraw_${Date.now()}.json`),
				JSON.stringify(payload, null, 2),
				"utf8",
			);
			console.log(
				JSON.stringify({
					ok: true,
					id: r?.id ?? null,
					status: r?.msg ?? r?.message ?? "sent",
				}),
			);
			return;
		} catch {}
		const payload = {
			ok: false,
			network,
			amount,
			address,
			error: e?.message ?? String(e),
			at: new Date().toISOString(),
		};
		fs.writeFileSync(
			path.join(outDir, `binance_withdraw_err_${Date.now()}.json`),
			JSON.stringify(payload, null, 2),
			"utf8",
		);
		console.error(e?.message ?? String(e));
		process.exitCode = 1;
	}
}

main();
