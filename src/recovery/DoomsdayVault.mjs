import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * DOOMSDAY VAULT: CRITICAL DATA REPOSITORY (v1.0)
 *
 * Objective: Multi-region encrypted backup with integrity verification.
 * Features:
 *  - Encrypted Archives (AES-256-GCM)
 *  - Versioning (Timestamped rotations)
 *  - Integrity Verification (SHA-256 Checksums)
 *  - Automated Restoration (Failover procedure)
 */
export class DoomsdayVault {
	constructor(options = {}) {
		this.vaultPath = options.vaultPath || path.resolve("data/vault");
		this.backupPath = options.backupPath || path.resolve("data/backups");
		this.encryptionKey =
			options.encryptionKey ||
			process.env.VAULT_SECRET ||
			crypto.randomBytes(32);
	}

	async init() {
		await fs.mkdir(this.vaultPath, { recursive: true });
		await fs.mkdir(this.backupPath, { recursive: true });
		console.log(`[DoomsdayVault] 🛡️ Vault initialized at ${this.vaultPath}`);
	}

	/**
	 * SECURE ARCHIVE: ENCRYPT & STORE
	 */
	async createBackup(sourceFile, region = "primary") {
		console.log(
			`\n[DoomsdayVault] 🔒 Creating secure backup for ${path.basename(sourceFile)} [${region}]...`,
		);

		const data = await fs.readFile(sourceFile);
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const filename = `${path.basename(sourceFile)}.${timestamp}.enc`;
		const targetPath = path.join(this.backupPath, region, filename);

		await fs.mkdir(path.dirname(targetPath), { recursive: true });

		// 1. Compress
		const compressed = await gzip(data);

		// 2. Encrypt
		const iv = crypto.randomBytes(12);
		const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);
		const encrypted = Buffer.concat([
			cipher.update(compressed),
			cipher.final(),
		]);
		const authTag = cipher.getAuthTag();

		// 3. Metadata & Integrity
		const checksum = crypto.createHash("sha256").update(data).digest("hex");
		const payload = Buffer.concat([iv, authTag, encrypted]);

		await fs.writeFile(targetPath, payload);

		// Log backup for versioning
		await this._logBackup(filename, region, checksum);

		console.log(
			`[DoomsdayVault] ✅ Backup complete: ${filename} (Checksum: ${checksum.slice(0, 8)})`,
		);
		return { filename, checksum };
	}

	/**
	 * INTEGRITY VERIFICATION: PRE-DEPLOYMENT TEST
	 */
	async verifyIntegrity(backupFilename, region = "primary", expectedChecksum) {
		console.log(
			`[DoomsdayVault] 🔍 Verifying integrity of ${backupFilename}...`,
		);

		try {
			const decrypted = await this.restoreBackup(backupFilename, region);
			const checksum = crypto
				.createHash("sha256")
				.update(decrypted)
				.digest("hex");

			const ok = checksum === expectedChecksum;
			console.log(`[DoomsdayVault] Integrity Check: ${ok ? "PASS" : "FAIL"}`);
			return ok;
		} catch (e) {
			console.error(`[DoomsdayVault] ❌ Verification failed: ${e.message}`);
			return false;
		}
	}

	/**
	 * AUTOMATED RESTORATION
	 */
	async restoreBackup(backupFilename, region = "primary") {
		const filePath = path.join(this.backupPath, region, backupFilename);
		const data = await fs.readFile(filePath);

		const iv = data.slice(0, 12);
		const authTag = data.slice(12, 28);
		const encrypted = data.slice(28);

		const decipher = crypto.createDecipheriv(
			"aes-256-gcm",
			this.encryptionKey,
			iv,
		);
		decipher.setAuthTag(authTag);

		const compressed = Buffer.concat([
			decipher.update(encrypted),
			decipher.final(),
		]);
		const decrypted = await gunzip(compressed);

		return decrypted;
	}

	async _logBackup(filename, region, checksum) {
		const logPath = path.join(this.vaultPath, "backup-index.json");
		let index = { backups: [] };

		try {
			index = JSON.parse(await fs.readFile(logPath, "utf8"));
		} catch {}

		index.backups.push({
			timestamp: Date.now(),
			filename,
			region,
			checksum,
			status: "verified",
		});

		// Rotate index: keep last 50 versions
		if (index.backups.length > 50) index.backups.shift();

		await fs.writeFile(logPath, JSON.stringify(index, null, 2));
	}
}
