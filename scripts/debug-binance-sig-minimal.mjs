import { binanceClient } from "../src/crypto/binance-client.mjs";

console.log("🔍 BINANCE SIGNATURE DEBUG – OFFICIAL LIB + TIMESTAMP FIX");

const withdrawalParams = {
	address: "OWNER_CRYPTO_ADDRESS",
	amount: "850",
};

console.log("Attempting withdrawal with params:", withdrawalParams);

try {
	const result = await binanceClient.withdrawUSDTBep20(withdrawalParams);
	console.log("Withdrawal successful:", result);
} catch (e) {
	console.error("Debug script caught an error:", e);
	if (e.response) {
		console.error("Response data:", e.response.data);
	}
}
