import fs from "node:fs";
import path from "node:path";
import { initSecretGuard } from "./security/secret-guard.mjs";

function readEnvFiles() {
        const explicit = process.env.SWARM_ENV_PATH
                ? path.resolve(process.env.SWARM_ENV_PATH)
                : null;
        return [
                path.resolve(process.cwd(), ".env.local"),
                path.resolve(process.cwd(), ".env"),
                path.resolve(process.cwd(), ".env.deploy"),
                path.resolve(process.cwd(), ".env.storage"),
                explicit,
        ].filter(Boolean);
}

function parseEnvFile(envPath) {
        const content = fs.readFileSync(envPath, "utf8");
        const lines = content.split("\n");
        for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) continue;
                const eq = trimmed.indexOf("=");
                if (eq <= 0) continue;
                const key = trimmed.slice(0, eq).trim();
                let val = trimmed.slice(eq + 1).trim();
                if (
                        (val.startsWith('"') && val.endsWith('"')) ||
                        (val.startsWith("'") && val.endsWith("'"))
                ) {
                        val = val.slice(1, -1);
                }
                if (!Object.hasOwn(process.env, key)) {
                        process.env[key] = val;
                }
        }
}

function mirrorIfMissing(primary, alternate) {
        const left = String(process.env[primary] ?? "").trim();
        const right = String(process.env[alternate] ?? "").trim();
        if (!left && right) process.env[primary] = right;
        if (!right && left) process.env[alternate] = left;
}

function normalizeEnvAliases() {
        mirrorIfMissing("OWNER_PAYPAL_EMAIL", "PAYPAL_OWNER_EMAIL");
        mirrorIfMissing("OWNER_PAYPAL_EMAIL", "PAYPAL_EMAIL");
        mirrorIfMissing("OWNER_PAYONEER_EMAIL", "PAYONEER_EMAIL");
        mirrorIfMissing("OWNER_IBAN", "BANK_IBAN");
        mirrorIfMissing("OWNER_BANK_RIB", "MOROCCAN_BANK_RIB");
        mirrorIfMissing("OWNER_SWIFT", "SWIFT_BIC");
        mirrorIfMissing("OWNER_CRYPTO_ADDRESS", "TRUST_WALLET_ADDRESS");
        mirrorIfMissing("OWNER_CRYPTO_ADDRESS", "TRUST_WALLET_USDT_ERC20");
        mirrorIfMissing("OWNER_BENEFICIARY_NAME", "BANK_ACCOUNT_NAME");
}

export function loadEnv() {
	try {
                for (const envPath of readEnvFiles()) {
                        if (fs.existsSync(envPath)) {
                                parseEnvFile(envPath);
			}
		}
	} catch (e) {
		try {
			process.stderr.write(
                                `[env] Failed to parse env files: ${e?.message || String(e)}\n`,
			);
		} catch {}
	}

        normalizeEnvAliases();

	try {
		initSecretGuard();
	} catch {
		try {
			process.stderr.write(
				"[env] Secret guard initialization failed; continuing without guard.\n",
			);
		} catch {}
	}
}

// Auto-load when imported
loadEnv();
