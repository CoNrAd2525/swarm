import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

function loadPayerRegistry() {
	const file = path.resolve("data/payers/registry.json");
	if (!fs.existsSync(file)) return {};
	try {
		const raw = fs.readFileSync(file, "utf8");
		const data = JSON.parse(raw);
		if (data && typeof data === "object") return data;
	} catch {}
	return {};
}

function readCsv(file) {
	const s = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
	const lines = s.trim().split("\n");
	const headers = lines[0].split(",");
	const rows = lines.slice(1).map((l) => {
		const vals = [];
		let cur = "";
		let inQ = false;
		for (let i = 0; i < l.length; i++) {
			const ch = l[i];
			if (inQ) {
				if (ch === '"') {
					if (l[i + 1] === '"') {
						cur += '"';
						i++;
					} else {
						inQ = false;
					}
				} else {
					cur += ch;
				}
			} else {
				if (ch === ",") {
					vals.push(cur);
					cur = "";
				} else if (ch === '"') {
					inQ = true;
				} else {
					cur += ch;
				}
			}
		}
		vals.push(cur);
		const obj = {};
		for (let i = 0; i < headers.length; i++) obj[headers[i]] = vals[i] ?? "";
		return obj;
	});
	return { headers, rows };
}

function parseCsvLine(l) {
	const vals = [];
	let cur = "";
	let inQ = false;
	for (let i = 0; i < l.length; i++) {
		const ch = l[i];
		if (inQ) {
			if (ch === '"') {
				if (l[i + 1] === '"') {
					cur += '"';
					i++;
				} else {
					inQ = false;
				}
			} else {
				cur += ch;
			}
		} else {
			if (ch === ",") {
				vals.push(cur);
				cur = "";
			} else if (ch === '"') {
				inQ = true;
			} else {
				cur += ch;
			}
		}
	}
	vals.push(cur);
	return vals;
}

function readSpreadsheet(file) {
	const ext = path.extname(file).toLowerCase();
	if (ext === ".csv") return readCsv(file);
	const s = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
	const cand =
		"recipient,recipient_email,recipient_name,amount,currency,batch_id,item_id,note,payer_name,payer_email,payer_company,purpose,reference,prq_link";
	const idx = s.indexOf(cand);
	if (idx < 0) return { headers: [], rows: [] };
	const tail = s.slice(idx).split("\n");
	const headers = tail[0].split(",");
	const rows = [];
	for (let k = 1; k < tail.length; k++) {
		const line = tail[k].trim();
		if (!line) continue;
		const commaCount = (line.match(/,/g) || []).length;
		if (commaCount >= headers.length - 1) {
			const vals = parseCsvLine(line);
			const obj = {};
			for (let i = 0; i < headers.length; i++) obj[headers[i]] = vals[i] ?? "";
			rows.push(obj);
		} else {
			if (rows.length) break;
		}
	}
	if (rows.length) return { headers, rows };
	const rest = s.slice(idx + cand.length);
	const m = rest.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+,[^\r\n]+/);
	if (!m) return { headers, rows: [] };
	const vals = parseCsvLine(m[0]);
	const obj = {};
	for (let i = 0; i < headers.length; i++) obj[headers[i]] = vals[i] ?? "";
	return { headers, rows: [obj] };
}

function sanitizeBatchId(raw, fallback = "manual_payoneer_batch") {
	const normalized = String(raw || "")
		.trim()
		.replace(/[^A-Za-z0-9._-]+/g, "_")
		.replace(/^_+|_+$/g, "");
	return normalized || fallback;
}

function normalizeSettlementRow(row, sourceFile = "") {
	if (!row || typeof row !== "object") return row;
	if (row.recipient_email || row.batch_id) return { ...row };
	if (!row.payee_email && !row.payee_id) return { ...row };
	const fileBase = sourceFile
		? path.basename(sourceFile, path.extname(sourceFile))
		: "manual_payoneer_batch";
	const batchId = sanitizeBatchId(fileBase);
	return {
		recipient: row.payee_id || "Owner",
		recipient_email: row.payee_email || "",
		recipient_name: row.payee_id || "Owner",
		amount: row.amount || "",
		currency: row.currency || "USD",
		batch_id: batchId,
		item_id: `${batchId}-ITEM-1`,
		note: row.status || row.note || "",
		payer_name: "Operations",
		payer_email: "",
		payer_company: "RWC_Ops",
		purpose: "Manual settlement",
		reference: row.reference || batchId,
		prq_link: "",
	};
}
function latestPospProof() {
	const dir = path.resolve("exports/posp-proofs");
	if (!fs.existsSync(dir)) return null;
	const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
	if (!files.length) return null;
	const abs = files
		.map((f) => path.join(dir, f))
		.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
	try {
		return JSON.parse(fs.readFileSync(abs[0], "utf8"));
	} catch {
		return null;
	}
}

function envBool(name, fallback = false) {
	const raw = process.env[name];
	if (raw == null) return fallback;
	return String(raw).trim().toLowerCase() === "true";
}

function findRecentArtifact(outDir, prefix) {
	if (!fs.existsSync(outDir)) return null;
	const matches = fs
		.readdirSync(outDir)
		.filter((name) => name.includes(prefix))
		.map((name) => {
			const absFile = path.join(outDir, name);
			const stat = fs.statSync(absFile);
			return { name, mtimeMs: stat.mtimeMs };
		})
		.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return matches[0] ?? null;
}

function buildEmail({
	payerEmail,
	payerName,
	amount,
	currency,
	recipientName,
	purpose,
	reference,
	prqLink,
	batchId,
}) {
	const subject = `Payment Request ${amount} ${currency} — ${recipientName} (${batchId})`;
	const posp = latestPospProof();
	const pospLine = posp
		? `\nEvidence: PoSP score ${posp.score}, proof ${posp.proof_hash}`
		: "";
	const body =
		`Hello ${payerName || "Billing"},\n\n` +
		`This is a reminder to fulfill the Payoneer payment request for ${amount} ${currency} to ${recipientName}.\n` +
		(purpose ? `Purpose: ${purpose}\n` : "") +
		(reference ? `Reference: ${reference}\n` : "") +
		(prqLink ? `Payoneer Request Link: ${prqLink}\n` : "") +
		`${pospLine}\n\n` +
		`If you require additional documentation or invoice details, reply to this message.\n` +
		`Thank you,\nOperations`;
	return { to: payerEmail, subject, body };
}

function resolveEscalationRecipients() {
	const raw =
		process.env.PAYONEER_ESCALATION_EMAILS ||
		process.env.PAYONEER_ESCALATION_EMAIL ||
		"customersupport@payoneer.com";
	return String(raw)
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}

function buildEscalationEmail({
	payerEmail,
	payerName,
	amount,
	currency,
	recipientName,
	purpose,
	reference,
	prqLink,
	batchId,
}) {
	const to = resolveEscalationRecipients();
	const subject = `Escalation: Pending Payoneer payout ${amount} ${currency} (${batchId})`;
	const body =
		`Dear Payoneer Support,\n\n` +
		`Please escalate the pending payout request for batch ${batchId}.\n` +
		`Recipient: ${recipientName}\n` +
		`Amount: ${amount} ${currency}\n` +
		(payerName ? `Payer: ${payerName}\n` : "") +
		(payerEmail ? `Payer email: ${payerEmail}\n` : "") +
		(purpose ? `Purpose: ${purpose}\n` : "") +
		(reference ? `Reference: ${reference}\n` : "") +
		(prqLink ? `PRQ link: ${prqLink}\n` : "") +
		`\nPlease review and confirm the release path for this payout.\n`;
	return { to, subject, body };
}

function buildEscalationPayload(row, { delayHours }) {
	const email = buildEscalationEmail({
		payerEmail: row.payer_email,
		payerName: row.payer_name,
		amount: row.amount,
		currency: row.currency,
		recipientName: row.recipient_name,
		purpose: row.purpose,
		reference: row.reference,
		prqLink: row.prq_link,
		batchId: row.batch_id,
	});
	return {
		type: "payoneer_payout_escalation",
		created_at: new Date().toISOString(),
		escalate_at: new Date(
			Date.now() + Math.max(0, delayHours) * 60 * 60 * 1000,
		).toISOString(),
		batch_id: row.batch_id,
		item_id: row.item_id,
		amount: row.amount,
		currency: row.currency,
		payer_email: row.payer_email,
		payer_name: row.payer_name,
		purpose: row.purpose,
		reference: row.reference,
		prq_link: row.prq_link,
		email,
	};
}

function resolvePayerEmail({
	payer_email,
	payer_name,
	payer_company,
	recipient_email,
	batch_id,
	reference,
}) {
	const selfEmails = new Set([
		"younesdgc@gmail.com",
		"younestsouli2019@gmail.com",
	]);
	const key = `${String(payer_name || "").trim()}|${String(payer_company || "").trim()}`;
	const registry = loadPayerRegistry();
	const companyKey = String(payer_company || "").trim();
	const registryEntry =
		registry[companyKey] || registry[key] || registry[batch_id];
	const directOwnerPrivate =
		companyKey === "Private" &&
		String(reference || "").trim() === "DirectRevenueToOwner"
			? registry.RWC_Ops || registry.RealWorldCerts || null
			: null;
	const registryEmail = (directOwnerPrivate || registryEntry)?.email;
	let byEnv = {};
	try {
		if (process.env.PAYER_EMAIL_OVERRIDES_JSON) {
			byEnv = JSON.parse(process.env.PAYER_EMAIL_OVERRIDES_JSON);
		}
	} catch {}
	const sources = [
		() => byEnv[key],
		() => byEnv[batch_id],
		() => registryEmail,
	];
	const recipientLower = String(recipient_email || "").toLowerCase();
	for (const get of sources) {
		const v = get();
		if (!v) continue;
		const lower = String(v).toLowerCase();
		if (selfEmails.has(lower)) continue;
		if (lower === recipientLower) continue;
		return v;
	}
	return null;
}

function main() {
	const args = Object.fromEntries(
		process.argv.slice(2).map((a) => {
			const [k, v] = a.includes("=") ? a.split("=") : [a, true];
			return [k.replace(/^--/, ""), v];
		}),
	);
	const dirArg = args.dir || "";
	const onlyPayer = args.payer || "";
	const outDirArg = args.out || "";
	const delayHours = Number(args.delay_hours || "48");
	const autoEscalate =
		args.auto_escalate === "true" ||
		args["auto-escalate"] === "true" ||
		envBool("PAYONEER_AUTO_ESCALATE", false);
	const escalationDelayHours = Number(
		args.escalation_delay_hours ??
			args["escalation-delay-hours"] ??
			process.env.PAYONEER_ESCALATION_DELAY_HOURS ??
			delayHours,
	);
	if (dirArg) {
		const dir = path.resolve(dirArg);
		if (!fs.existsSync(dir)) {
			process.stdout.write("missing_or_invalid_input_dir\n");
			process.exitCode = 2;
			return;
		}
		const allFiles = fs
			.readdirSync(dir)
			.filter((f) => {
				const n = f.toLowerCase();
				return n.endsWith(".csv") || n.endsWith(".xls") || n.endsWith(".xlsx");
			})
			.sort();
		const byBase = new Map();
		for (const f of allFiles) {
			const ext = path.extname(f).toLowerCase();
			const base = f.slice(0, -ext.length);
			if (!byBase.has(base)) byBase.set(base, []);
			byBase.get(base).push({ name: f, ext });
		}
		const files = [];
		for (const [, items] of byBase) {
			const csv = items.find((x) => x.ext === ".csv");
			if (csv) {
				files.push(csv.name);
			} else {
				files.push(items[0].name);
			}
		}
		const outDir = path.resolve(outDirArg || "exports/communications");
		if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
		const created = [];
		for (const f of files) {
			const abs = path.join(dir, f);
			try {
				const { rows: rawRows } = readSpreadsheet(abs);
				const rows = rawRows.map((row) => normalizeSettlementRow(row, abs));
				if (!rows.length) continue;
				const unknown = [];
				for (const r of rows) {
					const resolvedEmail = resolvePayerEmail({
						payer_email: r.payer_email,
						payer_name: r.payer_name,
						payer_company: r.payer_company,
						recipient_email: r.recipient_email,
						batch_id: r.batch_id,
						reference: r.reference,
					});
					if (!resolvedEmail) {
						const sig = `${String(r.payer_name || "").trim()}|${String(
							r.payer_company || "",
						).trim()}`;
						if (!unknown.includes(sig)) unknown.push(sig);
					}
				}
				if (unknown.length) {
					process.stdout.write(
						`${JSON.stringify({
							ok: false,
							type: "unknown_payers",
							file: abs,
							items: unknown,
						})}\n`,
					);
					continue;
				}
				for (let r of rows) {
					const resolvedEmail = resolvePayerEmail({
						payer_email: r.payer_email,
						payer_name: r.payer_name,
						payer_company: r.payer_company,
						recipient_email: r.recipient_email,
						batch_id: r.batch_id,
						reference: r.reference,
					});
					if (!resolvedEmail) continue;
					r = { ...r, payer_email: resolvedEmail };
					if (
						onlyPayer &&
						String(r.payer_email || "").toLowerCase() !==
							String(onlyPayer).toLowerCase()
					)
						continue;
					const comm = buildEmail({
						payerEmail: r.payer_email,
						payerName: r.payer_name,
						amount: r.amount,
						currency: r.currency,
						recipientName: r.recipient_name,
						purpose: r.purpose,
						reference: r.reference,
						prqLink: r.prq_link,
						batchId: r.batch_id,
					});
					const existingFollowup = findRecentArtifact(
						outDir,
						`payoneer_followup_${r.batch_id}_`,
					);
					const existingFiles = existingFollowup ? [existingFollowup] : [];
					if (existingFiles.length) {
						const latest = existingFiles[0];
						const ageHours = (Date.now() - latest.mtimeMs) / (1000 * 60 * 60);
						if (ageHours < delayHours) continue;
					}
					const outFile = path.join(
						outDir,
						`payoneer_followup_${r.batch_id}_${Date.now()}.json`,
					);
					const payload = {
						created_at: new Date().toISOString(),
						followup_at: new Date(
							Date.now() + delayHours * 60 * 60 * 1000,
						).toISOString(),
						batch_id: r.batch_id,
						item_id: r.item_id,
						amount: r.amount,
						currency: r.currency,
						payer_email: r.payer_email,
						payer_name: r.payer_name,
						purpose: r.purpose,
						reference: r.reference,
						prq_link: r.prq_link,
						email: comm,
					};
					fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
					created.push(outFile);
					if (autoEscalate) {
						const existingEscalation = findRecentArtifact(
							outDir,
							`payoneer_escalation_${r.batch_id}_`,
						);
						const escalationAgeHours = existingEscalation
							? (Date.now() - existingEscalation.mtimeMs) / (1000 * 60 * 60)
							: Number.POSITIVE_INFINITY;
						if (escalationAgeHours >= escalationDelayHours) {
							const escalationFile = path.join(
								outDir,
								`payoneer_escalation_${r.batch_id}_${Date.now()}.json`,
							);
							const escalationPayload = buildEscalationPayload(r, {
								delayHours: escalationDelayHours,
							});
							fs.writeFileSync(
								escalationFile,
								JSON.stringify(escalationPayload, null, 2),
							);
							created.push(escalationFile);
						}
					}
				}
			} catch {}
		}
		process.stdout.write(
			`${JSON.stringify({ ok: true, count: created.length, files: created })}\n`,
		);
		return;
	}
	let input = args.file || args.path || "";
	if (input) {
		const ext = path.extname(input).toLowerCase();
		if (ext === ".xls" || ext === ".xlsx") {
			const base = input.slice(0, -ext.length);
			const csvCandidate = `${base}.csv`;
			if (fs.existsSync(csvCandidate)) input = csvCandidate;
		}
	}
	if (!input || !fs.existsSync(input)) {
		process.stdout.write("missing_or_invalid_input_file\n");
		process.exitCode = 2;
		return;
	}
	const { rows: rawRows } = readSpreadsheet(input);
	const rows = rawRows.map((row) => normalizeSettlementRow(row, input));
	if (!rows.length) {
		process.stdout.write("empty_csv\n");
		process.exitCode = 3;
		return;
	}
	let r = onlyPayer
		? rows.find(
				(x) =>
					String(x.payer_email || "").toLowerCase() ===
					String(onlyPayer).toLowerCase(),
			) || rows[0]
		: rows[0];
	const resolvedEmail = resolvePayerEmail({
		payer_email: r.payer_email,
		payer_name: r.payer_name,
		payer_company: r.payer_company,
		recipient_email: r.recipient_email,
		batch_id: r.batch_id,
		reference: r.reference,
	});
	if (!resolvedEmail) {
		process.stdout.write("missing_payer_email\n");
		process.exitCode = 4;
		return;
	}
	r = { ...r, payer_email: resolvedEmail };
	const comm = buildEmail({
		payerEmail: r.payer_email,
		payerName: r.payer_name,
		amount: r.amount,
		currency: r.currency,
		recipientName: r.recipient_name,
		purpose: r.purpose,
		reference: r.reference,
		prqLink: r.prq_link,
		batchId: r.batch_id,
	});
	const outDir = path.resolve(outDirArg || "exports/communications");
	if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
	const outFile = path.join(
		outDir,
		`payoneer_followup_${r.batch_id}_${Date.now()}.json`,
	);
	const payload = {
		created_at: new Date().toISOString(),
		followup_at: new Date(
			Date.now() + delayHours * 60 * 60 * 1000,
		).toISOString(),
		batch_id: r.batch_id,
		item_id: r.item_id,
		amount: r.amount,
		currency: r.currency,
		payer_email: r.payer_email,
		payer_name: r.payer_name,
		purpose: r.purpose,
		reference: r.reference,
		prq_link: r.prq_link,
		email: comm,
	};
	fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
	const outputs = [outFile];
	if (autoEscalate) {
		const escalationFile = path.join(
			outDir,
			`payoneer_escalation_${r.batch_id}_${Date.now()}.json`,
		);
		const escalationPayload = buildEscalationPayload(r, {
			delayHours: escalationDelayHours,
		});
		fs.writeFileSync(escalationFile, JSON.stringify(escalationPayload, null, 2));
		outputs.push(escalationFile);
	}
	process.stdout.write(`${outputs.join("\n")}\n`);
}

const selfPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isMain = argvPath && path.resolve(selfPath) === argvPath;

if (isMain) main();

export { buildEscalationPayload, buildEmail, buildEscalationEmail, normalizeSettlementRow, resolvePayerEmail };
