function normalizeIp(raw) {
	const value = String(raw || "").trim();
	if (!value) return "";
	const first = value.split(",")[0].trim();
	if (first.startsWith("::ffff:")) return first.slice(7);
	return first;
}

function parseIpv4(ip) {
	const parts = String(ip || "")
		.split(".")
		.map((part) => Number(part));
	if (parts.length !== 4) return null;
	if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
		return null;
	}
	return (
		parts[0] * 256 ** 3 +
		parts[1] * 256 ** 2 +
		parts[2] * 256 +
		parts[3]
	);
}

function parseRule(rule) {
	const value = normalizeIp(rule);
	if (!value) return null;

	if (!value.includes("/")) {
		return { type: "exact", value };
	}

	const [base, prefixRaw] = value.split("/");
	const prefix = Number(prefixRaw);
	const ipv4 = parseIpv4(base);
	if (ipv4 == null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
		return null;
	}

	const mask =
		prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
	return {
		type: "cidr4",
		base: ipv4,
		mask,
	};
}

export class IPAllowlist {
	constructor(allowedIpsEnv = process.env.WEBHOOK_ALLOWED_IPS || "") {
		this.rules = String(allowedIpsEnv || "")
			.split(",")
			.map((entry) => parseRule(entry))
			.filter(Boolean);
	}

	isAllowed(clientIp) {
		if (this.rules.length === 0) return true;

		const normalized = normalizeIp(clientIp);
		if (!normalized) return false;

		const ipv4 = parseIpv4(normalized);
		return this.rules.some((rule) => {
			if (rule.type === "exact") {
				return normalized === rule.value;
			}
			if (rule.type === "cidr4" && ipv4 != null) {
				return (ipv4 & rule.mask) === (rule.base & rule.mask);
			}
			return false;
		});
	}
}
