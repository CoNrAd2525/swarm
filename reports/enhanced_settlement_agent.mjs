import 'dotenv/config';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
	PayPalAuthManager,
	WiseAuthManager,
	BinanceAuthManager,
	BankingCircleAuthManager
} from '../src/payment-auth-managers.mjs';

const PAYEE_LINKS_PATH = path.resolve(process.cwd(), 'dist_rwc/site-data/payee_links.json');

class EnhancedSettlementAgent {
	constructor() {
		this.processedPayments = [];
		this.failedPayments = [];
		this.authManagers = {
			paypal: new PayPalAuthManager(),
			wise: new WiseAuthManager(),
			binance: new BinanceAuthManager(),
			banking_circle: new BankingCircleAuthManager()
		};
	}

	async initialize() {
		console.log('🚀 Initializing Enhanced Settlement Agent...');
		
		// Test all payment rails
		await this.testAllRails();
		
		console.log('✅ Enhanced Settlement Agent initialized');
	}

	async testAllRails() {
		const rails = ['paypal', 'wise', 'binance', 'banking_circle'];
		const results = {};
		
		for (const rail of rails) {
			try {
				console.log(`🧪 Testing ${rail}...`);
				await this.testRail(rail);
				results[rail] = { status: 'healthy', message: 'Connection successful' };
				console.log(`✅ ${rail} is healthy`);
			} catch (error) {
				results[rail] = { status: 'error', message: error.message };
				console.log(`❌ ${rail} failed: ${error.message}`);
			}
		}
		
		return results;
	}

	async testRail(rail) {
		switch (rail) {
			case 'paypal':
				await this.authManagers.paypal.getAccessToken();
				break;
				
			case 'wise':
				await this.authManagers.wise.getProfile();
				break;
				
			case 'binance':
				await this.authManagers.binance.testConnection();
				break;
				
			case 'banking_circle':
				await this.authManagers.banking_circle.getAccounts();
				break;
		}
	}

	async processPayment(payeeLink) {
		const log = createLogger();
		
		log.info(`🚀 Processing payment for ${payeeLink.ref} - Amount: ${payeeLink.amount} ${payeeLink.currency}`);
		
		const paymentRails = [
			'BANKING_CIRCLE',
			'WISE', 
			'PAYPAL',
			'CRYPTO'
		];
		
		for (const rail of paymentRails) {
			try {
				log.info(`🔄 Trying ${rail} for ${payeeLink.ref}`);
				
				let result;
				switch (rail) {
					case 'BANKING_CIRCLE':
						result = await this.processWithBankingCircle(payeeLink);
						break;
						
					case 'WISE':
						result = await this.processWithWise(payeeLink);
						break;
						
					case 'PAYPAL':
						result = await this.processWithPayPal(payeeLink);
						break;
						
					case 'CRYPTO':
						result = await this.processWithCrypto(payeeLink);
						break;
				}
				
				if (result) {
					log.success(`✅ Payment processed via ${rail} for ${payeeLink.ref}`);
					this.processedPayments.push({ ...result, rail });
					return result;
				}
			} catch (error) {
				log.error(`❌ ${rail} failed for ${payeeLink.ref}: ${error.message}`);
				continue;
			}
		}
		
		const error = new Error('All payment rails failed');
		this.failedPayments.push({ payeeLink, error: error.message });
		throw error;
	}

	async processWithBankingCircle(payeeLink) {
		console.log(`🏦 Processing Banking Circle transfer for: ${payeeLink.ref}`);
		
		// Use your verified EUR account
		const senderAccount = {
			iban: 'LU774080000041265646', // Your verified EUR account
			name: 'Real World Certs Ltd'
		};
		
		const transferData = {
			requestId: uuidv4(),
			sender: senderAccount,
			recipient: {
				iban: payeeLink.iban || payeeLink.account_number,
				name: payeeLink.name
			},
			amount: {
				amount: payeeLink.amount,
				currency: payeeLink.currency
			},
			reference: payeeLink.description || `Payment ${payeeLink.ref}`
		};
		
		const response = await this.authManagers.banking_circle.makeAuthenticatedRequest('/v2/transfers', {
			method: 'POST',
			body: JSON.stringify(transferData)
		});
		
		const result = await response.json();
		
		if (!response.ok) {
			throw new Error(result.message || 'Banking Circle transfer failed');
		}
		
		return {
			transactionId: result.id,
			status: 'completed',
			amount: payeeLink.amount,
			currency: payeeLink.currency,
			rail: 'banking_circle'
		};
	}

	async processWithWise(payeeLink) {
		console.log(`💳 Processing Wise transfer for: ${payeeLink.ref}`);
		
		const profile = await this.authManagers.wise.getProfile();
		
		const transferData = {
			profileId: process.env.WISE_PROFILE_ID,
			customerTransactionId: uuidv4(), // Fixed: Use UUID instead of payeeLink.ref
			targetAccount: payeeLink.wise_account_id,
			quoteUuid: payeeLink.wise_quote_id,
			amount: payeeLink.amount,
			currency: payeeLink.currency,
			reference: payeeLink.description || `Payment ${payeeLink.ref}`
		};
		
		const response = await this.authManagers.wise.makeAuthenticatedRequest('/v1/transfers', {
			method: 'POST',
			body: JSON.stringify(transferData)
		});
		
		const result = await response.json();
		
		if (!response.ok) {
			throw new Error(result.message || 'Wise transfer failed');
		}
		
		return {
			transactionId: result.id,
			status: result.status,
			amount: payeeLink.amount,
			currency: payeeLink.currency,
			rail: 'wise'
		};
	}

	async processWithPayPal(payeeLink) {
		console.log(`💰 Processing PayPal payment for: ${payeeLink.ref}`);
		
		const payoutData = {
			sender_batch_header: {
				sender_batch_id: uuidv4(),
				email_subject: 'Payment from Real World Certs',
				email_message: payeeLink.description || 'Payment for services'
			},
			items: [{
				recipient_type: 'EMAIL',
				amount: {
					value: payeeLink.amount.toString(),
					currency: payeeLink.currency
				},
				receiver: payeeLink.paypal_email,
				note: payeeLink.description || `Payment ${payeeLink.ref}`,
				sender_item_id: payeeLink.ref
			}]
		};
		
		const response = await this.authManagers.paypal.makeAuthenticatedRequest('/v1/payments/payouts', {
			method: 'POST',
			body: JSON.stringify(payoutData)
		});
		
		const result = await response.json();
		
		if (!response.ok) {
			throw new Error(result.message || 'PayPal payout failed');
		}
		
		return {
			transactionId: result.batch_header.payout_batch_id,
			status: result.batch_header.batch_status,
			amount: payeeLink.amount,
			currency: payeeLink.currency,
			rail: 'paypal'
		};
	}

	async processWithCrypto(payeeLink) {
		console.log(`₿ Processing crypto withdrawal for: ${payeeLink.ref}`);
		
		const withdrawalData = {
			coin: payeeLink.crypto_currency || 'USDT',
			address: payeeLink.crypto_address,
			amount: payeeLink.amount,
			network: payeeLink.crypto_network || 'TRC20'
		};
		
		const response = await this.authManagers.binance.makeAuthenticatedRequest('/sapi/v1/capital/withdraw/apply', {
			method: 'POST',
			body: JSON.stringify(withdrawalData)
		});
		
		const result = await response.json();
		
		if (!response.ok) {
			throw new Error(result.msg || 'Crypto withdrawal failed');
		}
		
		return {
			transactionId: result.id,
			status: 'processing',
			amount: payeeLink.amount,
			currency: payeeLink.crypto_currency || 'USDT',
			rail: 'crypto'
		};
	}

	async processBatch(payeeLinks) {
		const results = [];
		
		for (const payeeLink of payeeLinks) {
			try {
				const result = await this.processPayment(payeeLink);
				results.push({ success: true, result });
			} catch (error) {
				results.push({ success: false, error: error.message, payeeLink });
			}
		}
		
		return results;
	}

	getStats() {
		return {
			processed: this.processedPayments.length,
			failed: this.failedPayments.length,
			successRate: this.processedPayments.length / (this.processedPayments.length + this.failedPayments.length) || 0
		};
	}
}

function createLogger() {
	const logDir = path.resolve(process.cwd(), 'logs');
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir, { recursive: true });
	}
	
	const logFilePath = path.resolve(logDir, 'enhanced_settlement.log');
	const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

	return {
		info: (message) => {
			console.log(message);
			logStream.write(`[INFO] ${new Date().toISOString()}: ${message}\n`);
		},
		error: (message, error) => {
			console.error(message, error);
			logStream.write(`[ERROR] ${new Date().toISOString()}: ${message}\n${error?.stack || error}\n`);
		},
		success: (message) => {
			console.log(`✅ ${message}`);
			logStream.write(`[SUCCESS] ${new Date().toISOString()}: ${message}\n`);
		}
	};
}

export { EnhancedSettlementAgent };