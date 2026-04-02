import fs from "node:fs";
import path from "node:path";
import nacl from "tweetnacl";

function decode(b64) {
	try {
		return Buffer.from(String(b64), "base64");
	} catch {
		return Buffer.alloc(0);
	}
}

function encode(buf) {
	return Buffer.from(buf).toString("base64");
}

function storePath(cwd = process.cwd()) {
	return path.join(cwd, "data", "plaid", "items.enc.json");
}

function loadKey(env) {
	const keyRaw = String(env.PLAIDBOX_KEY || env.ENVBOX_KEY || "").trim();
	if (!keyRaw) return null;
	const key = decode(keyRaw);
	if (key.length !== nacl.secretbox.keyLength) return null;
	return key;
}

function decryptBox({ nonce, box }, key) {
	const n = decode(nonce || "");
	const b = decode(box || "");
	const opened = nacl.secretbox.open(
		new Uint8Array(b),
		new Uint8Array(n),
		new Uint8Array(key),
	);
	if (!opened) return null;
	try {
		return JSON.parse(Buffer.from(opened).toString("utf8"));
	} catch {
		return null;
	}
}

function encryptBox(payload, key) {
	const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
	const msg = Buffer.from(JSON.stringify(payload), "utf8");
	const box = nacl.secretbox(new Uint8Array(msg), nonce, new Uint8Array(key));
	return { nonce: encode(nonce), box: encode(box) };
}

export function getPlaidStoreMeta({
	env = process.env,
	cwd = process.cwd(),
} = {}) {
	const file = storePath(cwd);
	const key = loadKey(env);
	return {
		file,
		key_present: Boolean(key),
		file_present: fs.existsSync(file),
	};
}

export function loadPlaidItems({
	env = process.env,
	cwd = process.cwd(),
} = {}) {
	const file = storePath(cwd);
	const key = loadKey(env);
	if (!key) return { ok: false, items: [], reason: "missing_key", file };
	if (!fs.existsSync(file)) return { ok: true, items: [], file };
	let payload = null;
	try {
		payload = JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return { ok: false, items: [], reason: "bad_store_json", file };
	}
	const doc = decryptBox(payload || {}, key);
	const items = Array.isArray(doc?.items)
		? doc.items
		: Array.isArray(doc)
			? doc
			: [];
	return { ok: true, items, file };
}

export function savePlaidItems(
	items,
	{ env = process.env, cwd = process.cwd() } = {},
) {
	const file = storePath(cwd);
	const key = loadKey(env);
	if (!key) return { ok: false, reason: "missing_key", file };
	const dir = path.dirname(file);
	fs.mkdirSync(dir, { recursive: true });
	const payload = encryptBox({ items: Array.isArray(items) ? items : [] }, key);
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
	fs.renameSync(tmp, file);
	return { ok: true, file };
}

export function upsertPlaidItem(
	item,
	{ env = process.env, cwd = process.cwd(), max = 50 } = {},
) {
	const loaded = loadPlaidItems({ env, cwd });
	if (!loaded.ok) return loaded;
	const items = Array.isArray(loaded.items) ? loaded.items : [];
	const id = String(item?.item_id || "").trim();
	if (!id) return { ok: false, reason: "missing_item_id", file: loaded.file };
	const now = new Date().toISOString();
	const next = {
		item_id: id,
		access_token: String(item?.access_token || "").trim(),
		created_at: item?.created_at || now,
		updated_at: now,
		meta: item?.meta && typeof item.meta === "object" ? item.meta : {},
	};
	const out = [];
	let replaced = false;
	for (const it of items) {
		if (String(it?.item_id || "") === id) {
			out.push({ ...it, ...next });
			replaced = true;
		} else {
			out.push(it);
		}
	}
	if (!replaced) out.push(next);
	const trimmed = out.slice(Math.max(0, out.length - Math.max(1, max)));
	const saved = savePlaidItems(trimmed, { env, cwd });
	return saved.ok ? { ok: true, file: saved.file, item_id: id } : saved;
}

export function getPlaidItemById(
	item_id,
	{ env = process.env, cwd = process.cwd() } = {},
) {
	const loaded = loadPlaidItems({ env, cwd });
	if (!loaded.ok)
		return { ok: false, reason: loaded.reason, file: loaded.file };
	const id = String(item_id || "").trim();
	const it =
		(loaded.items || []).find((x) => String(x?.item_id || "") === id) || null;
	return { ok: true, file: loaded.file, item: it };
}

export function removePlaidItem(
	item_id,
	{ env = process.env, cwd = process.cwd() } = {},
) {
	const loaded = loadPlaidItems({ env, cwd });
	if (!loaded.ok)
		return { ok: false, reason: loaded.reason, file: loaded.file };
	const id = String(item_id || "").trim();
	if (!id) return { ok: false, reason: "missing_item_id", file: loaded.file };
	const items = Array.isArray(loaded.items) ? loaded.items : [];
	const filtered = items.filter((x) => String(x?.item_id || "") !== id);
	const saved = savePlaidItems(filtered, { env, cwd });
	return saved.ok ? { ok: true, file: saved.file, removed: id } : saved;
}
