import "dotenv/config";

function verifyCryptoReceivingAddresses() {
	console.log("🔍 Verifying Crypto Receiving Addresses Configuration...\n");
	
	const addresses = {
		"OWNER_CRYPTO_BEP20": process.env.OWNER_CRYPTO_BEP20,
		"TRUST_WALLET_USDT_ERC20": process.env.TRUST_WALLET_USDT_ERC20,
		"OWNER_TRUST_WALLET": process.env.OWNER_TRUST_WALLET,
		"OWNER_CRYPTO_ADDRESS": process.env.OWNER_CRYPTO_ADDRESS,
	};
	
	console.log("📋 Configured Addresses:");
	Object.entries(addresses).forEach(([key, value]) => {
		if (value) {
			console.log(`✅ ${key}: ${value}`);
		} else {
			console.log(`❌ ${key}: NOT CONFIGURED`);
		}
	});
	
	console.log("\n🔗 Address Validation:");
	Object.entries(addresses).forEach(([key, value]) => {
		if (value) {
			// Basic crypto address validation
			const isValid = value.length >= 26 && value.length <= 42 && value.startsWith('0x');
			console.log(`${isValid ? '✅' : '❌'} ${key}: ${isValid ? 'Valid format' : 'Invalid format'}`);
		}
	});
	
	console.log("\n🎯 Primary Receiving Routes:");
	
	// Check which addresses are actually used in the settlement flows
	const primaryRoutes = {
		"BEP20 (Binance/BSC)": process.env.OWNER_CRYPTO_BEP20,
		"ERC20 (Ethereum)": process.env.TRUST_WALLET_USDT_ERC20 || process.env.OWNER_TRUST_WALLET,
		"Fallback": process.env.OWNER_CRYPTO_ADDRESS || process.env.OWNER_TRUST_WALLET,
	};
	
	Object.entries(primaryRoutes).forEach(([network, address]) => {
		if (address) {
			console.log(`✅ ${network}: ${address}`);
		} else {
			console.log(`❌ ${network}: Not configured`);
		}
	});
	
	console.log("\n📊 Summary:");
	const configuredCount = Object.values(addresses).filter(Boolean).length;
	console.log(`Total addresses configured: ${configuredCount}/4`);
	
	if (configuredCount > 0) {
		console.log("✅ Crypto receiving routes are configured and ready");
		console.log("ℹ️  These addresses will receive funds from swarm revenue generation");
	} else {
		console.log("❌ No crypto receiving addresses configured");
	}
}

verifyCryptoReceivingAddresses();