import 'dotenv/config';
// PayPal Authentication Manager
class PayPalAuthManager {
	constructor() {
		this.accessToken = null;
		this.tokenExpiry = null;
		this.clientId = process.env.PAYPAL_CLIENT_ID;
		this.clientSecret = process.env.PAYPAL_CLIENT_SECRET;
		this.environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
		this.baseUrl = this.environment === 'live' 
			? 'https://api.paypal.com' 
			: 'https://api.sandbox.paypal.com';
	}

	async getAccessToken() {
		// Check if token is still valid
		if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
			return this.accessToken;
		}

		// Refresh token
		return await this.refreshAccessToken();
	}

	async refreshAccessToken() {
		if (!this.clientId || !this.clientSecret) {
			throw new Error('PayPal credentials not configured');
		}

		try {
			const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
			
			const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
				method: 'POST',
				headers: {
					'Authorization': `Basic ${auth}`,
					'Content-Type': 'application/x-www-form-urlencoded',
					'Accept': 'application/json'
				},
				body: 'grant_type=client_credentials'
			});

			if (!response.ok) {
				const errorData = await response.text();
				throw new Error(`PayPal auth failed: ${response.status} - ${errorData}`);
			}

			const data = await response.json();
			
			this.accessToken = data.access_token;
			// Set expiry 5 minutes before actual expiry for safety
			this.tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);
			
			console.log('🔑 PayPal access token refreshed successfully');
			return this.accessToken;
			
		} catch (error) {
			console.error('❌ PayPal authentication error:', error.message);
			throw error;
		}
	}

	async makeAuthenticatedRequest(endpoint, options = {}) {
		const token = await this.getAccessToken();
		
		const response = await fetch(`${this.baseUrl}${endpoint}`, {
			...options,
			headers: {
				...options.headers,
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorData = await response.text();
			throw new Error(`PayPal API error: ${response.status} - ${errorData}`);
		}

		return response;
	}
}

// Wise Authentication Manager  
class WiseAuthManager {
	constructor() {
		this.apiKey = process.env.WISE_API_KEY;
		this.profileId = process.env.WISE_PROFILE_ID;
		this.environment = process.env.WISE_ENVIRONMENT || 'sandbox';
		this.baseUrl = this.environment === 'live'
			? 'https://api.wise.com'
			: 'https://api.sandbox.transferwise.tech';
	}

	async makeAuthenticatedRequest(endpoint, options = {}) {
		if (!this.apiKey) {
			throw new Error('Wise API key not configured');
		}

		const response = await fetch(`${this.baseUrl}${endpoint}`, {
			...options,
			headers: {
				...options.headers,
				'Authorization': `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorData = await response.text();
			throw new Error(`Wise API error: ${response.status} - ${errorData}`);
		}

		return response;
	}

	async getProfile() {
		if (!this.profileId) {
			throw new Error('Wise profile ID not configured');
		}

		const response = await this.makeAuthenticatedRequest(`/v1/profiles/${this.profileId}`);
		return await response.json();
	}
}

// Binance Authentication Manager
class BinanceAuthManager {
	constructor() {
		this.apiKey = process.env.BINANCE_API_KEY;
		this.apiSecret = process.env.BINANCE_API_SECRET;
		this.environment = process.env.BINANCE_ENVIRONMENT || 'testnet';
		this.baseUrl = this.environment === 'live'
			? 'https://api.binance.com'
			: 'https://testnet.binance.vision';
	}

	async makeAuthenticatedRequest(endpoint, options = {}) {
		if (!this.apiKey) {
			throw new Error('Binance API key not configured');
		}

		const response = await fetch(`${this.baseUrl}${endpoint}`, {
			...options,
			headers: {
				...options.headers,
				'X-MBX-APIKEY': this.apiKey,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorData = await response.text();
			throw new Error(`Binance API error: ${response.status} - ${errorData}`);
		}

		return response;
	}

	async testConnection() {
		const response = await this.makeAuthenticatedRequest('/api/v3/ping');
		return await response.json();
	}
}

// Banking Circle Authentication Manager
class BankingCircleAuthManager {
	constructor() {
		this.apiKey = process.env.BANKING_CIRCLE_API_KEY || process.env.BC_API_KEY;
		this.environment = process.env.BANKING_CIRCLE_ENVIRONMENT || 'sandbox';
		this.baseUrl = this.environment === 'live'
			? 'https://api.bankingcircle.com'
			: 'https://sandbox.bankingcircle.com';
	}

	async makeAuthenticatedRequest(endpoint, options = {}) {
		if (!this.apiKey) {
			throw new Error('Banking Circle API key not configured');
		}

		const response = await fetch(`${this.baseUrl}${endpoint}`, {
			...options,
			headers: {
				...options.headers,
				'Authorization': `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorData = await response.text();
			throw new Error(`Banking Circle API error: ${response.status} - ${errorData}`);
		}

		return response;
	}

	async getAccounts() {
		const response = await this.makeAuthenticatedRequest('/v2/accounts');
		return await response.json();
	}
}

export { 
	PayPalAuthManager, 
	WiseAuthManager, 
	BinanceAuthManager, 
	BankingCircleAuthManager 
};
