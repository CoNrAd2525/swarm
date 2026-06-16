import fs from "node:fs/promises";
import path from "node:path";
import { AgentHeartbeat } from "./agent-heartbeat.mjs";
import { SwarmMemory } from "./shared-memory.mjs";

export class PaymentSyncAgent {
	constructor({ memory = null, heartbeat = null } = {}) {
		this.memory = memory || new SwarmMemory();
		this.heartbeat = heartbeat || new AgentHeartbeat({ memory: this.memory });
		this.isRunning = false;
		this.syncInterval = 30000; // 30 seconds
		this.syncIntervalId = null;
	}

	async start() {
		if (this.isRunning) return;

		this.isRunning = true;

		// Start heartbeat
		await this.heartbeat.start();

		// Start sync interval
		this.syncIntervalId = setInterval(() => this.sync(), this.syncInterval);

		// Initial sync
		await this.sync();

		console.log(
			`💰 Payment sync agent started (interval: ${this.syncInterval}ms)`,
		);
	}

	async stop() {
		if (!this.isRunning) return;

		this.isRunning = false;

		// Stop sync interval
		if (this.syncIntervalId) {
			clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}

		// Stop heartbeat
		await this.heartbeat.stop();

		console.log("💰 Payment sync agent stopped");
	}

	async sync() {
		try {
			console.log("🔄 Starting payment synchronization...");

			// Sync payment rails
			await this.syncPaymentRails();

			// Sync pending settlements
			await this.syncPendingSettlements();

			// Sync agent coordination
			await this.syncAgentCoordination();

			// Log sync completion
			await this.logSync("success");

			console.log("✅ Payment synchronization completed");
		} catch (error) {
			console.error("❌ Payment sync error:", error.message);
			await this.logSync("error", error.message);
		}
	}

	async syncPaymentRails() {
		const rails = {
			paypal: await this.checkPayPalStatus(),
			wise: await this.checkWiseStatus(),
			binance: await this.checkBinanceStatus(),
			banking_circle: await this.checkBankingCircleStatus(),
		};

		// Store rail status
		await this.memory.write("payment_rails", rails);

		// Update agent with rail status
		await this.updateAgentStatus("payment_rails", rails);
	}

	async checkPayPalStatus() {
		try {
			const clientId = process.env.PAYPAL_CLIENT_ID;
			const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

			if (!clientId || !clientSecret) {
				return { status: "error", message: "Missing credentials" };
			}

			// Test token generation
			const auth = Buffer.from(`${clientId}:${clientSecret}`).toString(
				"base64",
			);
			const domain = process.env.PAYPAL_ENV === 'live' ? 'https://api.paypal.com' : 'https://api.sandbox.paypal.com';
		const response = await fetch(
			`${domain}/v1/oauth2/token`,
				{
					method: "POST",
					headers: {
						Authorization: `Basic ${auth}`,
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: "grant_type=client_credentials",
				},
			);

			if (response.ok) {
				return { status: "healthy", message: "Authentication working" };
			} else {
				return { status: "error", message: `HTTP ${response.status}` };
			}
		} catch (error) {
			return { status: "error", message: error.message };
		}
	}

	async checkWiseStatus() {
		try {
			const apiKey = process.env.WISE_API_KEY;
			const profileId = process.env.WISE_PROFILE_ID;

			if (!apiKey || !profileId) {
				return { status: "error", message: "Missing credentials" };
			}

			const response = await fetch(
				`https://api.wise.com/v1/profiles/${profileId}`,
				{
					headers: {
						Authorization: `Bearer ${apiKey}`,
					},
				},
			);

			if (response.ok) {
				return { status: "healthy", message: "API accessible" };
			} else {
				return { status: "error", message: `HTTP ${response.status}` };
			}
		} catch (error) {
			return { status: "error", message: error.message };
		}
	}

	async checkBinanceStatus() {
		try {
			const apiKey = process.env.BINANCE_API_KEY;

			if (!apiKey) {
				return { status: "error", message: "Missing API key" };
			}

			const response = await fetch("https://api.binance.com/api/v3/ping", {
				headers: {
					"X-MBX-APIKEY": apiKey,
				},
			});

			if (response.ok) {
				return { status: "healthy", message: "API accessible" };
			} else {
				return { status: "error", message: `HTTP ${response.status}` };
			}
		} catch (error) {
			return { status: "error", message: error.message };
		}
	}

	async checkBankingCircleStatus() {
		try {
			const apiKey =
				process.env.BANKING_CIRCLE_API_KEY || process.env.BC_API_KEY;

			if (!apiKey) {
				return { status: "error", message: "Missing API key" };
			}

			// Test with a simple API call
			const response = await fetch(
				"https://api.bankingcircle.com/v2/accounts",
				{
					headers: {
						Authorization: `Bearer ${apiKey}`,
					},
				},
			);

			if (response.ok) {
				return { status: "healthy", message: "API accessible" };
			} else {
				return { status: "error", message: `HTTP ${response.status}` };
			}
		} catch (error) {
			return { status: "error", message: error.message };
		}
	}

	async syncPendingSettlements() {
		try {
			// Check for pending settlements
			const payeeLinks = (await this.memory.read("payee_links")) || [];
			const pendingSettlements = payeeLinks.filter(
				(link) => link.status === "pending" || !link.status,
			);

			if (pendingSettlements.length > 0) {
				console.log(
					`📋 Found ${pendingSettlements.length} pending settlements`,
				);

				// Attempt to process pending settlements
				for (const settlement of pendingSettlements) {
					await this.processSettlement(settlement);
				}
			}
		} catch (error) {
			console.error("❌ Settlement sync error:", error.message);
		}
	}

	async processSettlement(settlement) {
		try {
			// Get available payment rails
			const rails = (await this.memory.read("payment_rails")) || {};

			// Find healthy rail
			const healthyRail = Object.entries(rails).find(
				([name, status]) => status.status === "healthy",
			);

			if (!healthyRail) {
				console.log("❌ No healthy payment rails available");
				return;
			}

			console.log(`💸 Processing settlement via ${healthyRail[0]}`);

			// Mark as processing
			settlement.status = "processing";
			settlement.rail = healthyRail[0];
			settlement.processed_at = new Date().toISOString();

			// Update settlement
			await this.updateSettlement(settlement);
		} catch (error) {
			console.error(`❌ Settlement processing error:`, error.message);
		}
	}

	async syncAgentCoordination() {
		try {
			// Check for dead agents
			const deadAgents = await this.heartbeat.getStaleAgents();

			if (deadAgents.length > 0) {
				console.log(`⚰️ Found ${deadAgents.length} dead agents`);

				// Mark dead agents
				for (const agent of deadAgents) {
					await this.heartbeat.markAgentDead(agent.id);
				}
			}

			// Replenish agents if needed
			await this.replenishAgents();
		} catch (error) {
			console.error("❌ Agent coordination error:", error.message);
		}
	}

	async replenishAgents() {
		try {
			const agents = (await this.memory.read("agents")) || [];
			const activeAgents = agents.filter((a) => a.status === "active");

			if (activeAgents.length < 5) {
				console.log(`🔧 Replenishing agents (current: ${activeAgents.length})`);

				// Create payment coordination agent
				const paymentAgent = {
					id: `payment_sync_${Date.now()}`,
					name: "Payment Coordination Agent",
					role: "payment_coordinator",
					status: "active",
					created_at: new Date().toISOString(),
					last_heartbeat_at: new Date().toISOString(),
				};

				agents.push(paymentAgent);
				await this.memory.write("agents", agents);
			}
		} catch (error) {
			console.error("❌ Agent replenishment error:", error.message);
		}
	}

	async updateAgentStatus(key, status) {
		try {
			const agents = (await this.memory.read("agents")) || [];

			// Find payment coordinator agent
			const paymentAgent = agents.find((a) => a.role === "payment_coordinator");

			if (paymentAgent) {
				paymentAgent.status_data = paymentAgent.status_data || {};
				paymentAgent.status_data[key] = status;
				paymentAgent.last_heartbeat_at = new Date().toISOString();

				await this.memory.write("agents", agents);
			}
		} catch (error) {
			console.error("❌ Agent status update error:", error.message);
		}
	}

	async updateSettlement(settlement) {
		try {
			const payeeLinks = (await this.memory.read("payee_links")) || [];

			const updatedLinks = payeeLinks.map((link) =>
				link.ref === settlement.ref ? settlement : link,
			);

			await this.memory.write("payee_links", updatedLinks);
		} catch (error) {
			console.error("❌ Settlement update error:", error.message);
		}
	}

	async logSync(status, message = "") {
		const logEntry = {
			type: "payment_sync",
			status,
			message,
			timestamp: new Date().toISOString(),
		};

		await this.memory.appendLog(logEntry);
	}
}
