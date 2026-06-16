function plaidBaseUrl(env) {
	const mode = String(env.PLAID_ENV || "production")
		.trim()
		.toLowerCase();
	if (mode === "production") return "https://production.plaid.com";
	if (mode === "development") return "https://development.plaid.com";
	return "https://sandbox.plaid.com";
}

function safeJsonParse(txt) {
	try {
		return JSON.parse(txt);
	} catch {
		return null;
	}
}

export class PlaidClient {
	constructor({ env = process.env } = {}) {
		this.env = env;
		this.baseUrl = plaidBaseUrl(env);
	}

	_credentials() {
		const client_id = String(this.env.PLAID_CLIENT_ID || "").trim();
		const secret = String(this.env.PLAID_SECRET || "").trim();
		if (!client_id || !secret) {
			throw new Error("plaid_missing_credentials");
		}
		return { client_id, secret };
	}

	async post(path, body) {
		const { client_id, secret } = this._credentials();
		const url = `${this.baseUrl}${path}`;
		const payload = { client_id, secret, ...(body || {}) };
		const res = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});
		const text = await res.text();
		const json = safeJsonParse(text);
		if (!res.ok) {
			const msg =
				json?.error_message || json?.error_code || `plaid_http_${res.status}`;
			const e = new Error(String(msg));
			e.status = res.status;
			e.details = json;
			throw e;
		}
		return json ?? {};
	}

	async createLinkToken({
		client_user_id = "owner",
		products = ["auth"],
		webhook = null,
		redirect_uri = null,
		country_codes = ["US"],
		language = "en",
	} = {}) {
		return await this.post("/link/token/create", {
			user: { client_user_id },
			client_name: "RealWorldCerts",
			products,
			country_codes,
			language,
			webhook: webhook || undefined,
			redirect_uri: redirect_uri || undefined,
		});
	}

	async exchangePublicToken(public_token) {
		return await this.post("/item/public_token/exchange", { public_token });
	}

	async accountsGet(access_token) {
		return await this.post("/accounts/get", { access_token });
	}

	async transactionsGet(
		access_token,
		{
			start_date,
			end_date,
			options = { count: 500, offset: 0 },
		} = {},
	) {
		return await this.post("/transactions/get", {
			access_token,
			start_date,
			end_date,
			options,
		});
	}

	async transactionsSync(
		access_token,
		{ cursor = "", count = 500, options = {} } = {},
	) {
		return await this.post("/transactions/sync", {
			access_token,
			cursor,
			count,
			options,
		});
	}
}
