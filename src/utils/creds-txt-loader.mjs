import fs from "node:fs";
import path from "node:path";

function isPlaceholderValue(value) {
	if (value == null) return true;
	const v = String(value).trim();
	if (!v) return true;
	if (/^\s*<\s*YOUR_[A-Z0-9_]+\s*>\s*$/i.test(v)) return true;
	if (/^\s*YOUR_[A-Z0-9_]+\s*$/i.test(v)) return true;
	if (/^\s*(REPLACE_ME|CHANGEME|TODO)\s*$/i.test(v)) return true;
	return false;
}

function parseCredsLines(lines) {
	const out = new Map();
	for (const lineRaw of lines) {
		const t = String(lineRaw || "").trim();
		if (!t) continue;
		let m = t.match(/^\s*\$env\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
		if (!m) m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.+)$/);
		if (!m) continue;
		const name = String(m[1] || "").trim();
		const v = String(m[2] || "")
			.trim()
			.replace(/^["']|["']$/g, "");
		if (!name) continue;
		if (isPlaceholderValue(v)) continue;
		out.set(name, v);
	}
	return out;
}

export function loadCredsFromCredsTxt({
	credsPath = path.join(process.cwd(), "CREDS.txt"),
	override = false,
} = {}) {
	try {
		if (!fs.existsSync(credsPath))
			return { ok: false, loaded: 0, path: credsPath };
		const raw = fs.readFileSync(credsPath, "utf8");
		const lines = raw.split(/\r?\n/g);
		const kv = parseCredsLines(lines);
		let loaded = 0;
		for (const [k, v] of kv.entries()) {
			const cur = process.env[k];
			if (override || isPlaceholderValue(cur)) {
				process.env[k] = v;
				loaded++;
			}
		}
		return { ok: true, loaded, path: credsPath };
	} catch {
		return { ok: false, loaded: 0, path: credsPath };
	}
}
