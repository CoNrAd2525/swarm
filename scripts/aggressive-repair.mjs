import fs from "node:fs";
import path from "node:path";

async function aggressiveRepair() {
	const storePath = path.join(process.cwd(), ".base44-offline-store.json");
	const content = fs.readFileSync(storePath, "utf8");

	console.log("Attempting aggressive repair. Original length:", content.length);

	// Step 1: Find the last occurrence of '}]' which usually ends an entity's records array
	let lastRecordsEnd = content.lastIndexOf("}]");
	if (lastRecordsEnd === -1) {
		// Try just '}'
		lastRecordsEnd = content.lastIndexOf("}");
	}

	if (lastRecordsEnd !== -1) {
		console.log("Found potential record end at index", lastRecordsEnd);

		// We try to close the JSON from here
		const suffixes = [
			"}]}}", // records array, entity object, entities object, root object
			"}]}",
			"]}}",
			"]}",
			"}}",
			"}",
		];

		for (const suffix of suffixes) {
			const testJson = content.substring(0, lastRecordsEnd + 2) + suffix;
			try {
				JSON.parse(testJson);
				console.log("✅ Success! Found valid structure with suffix:", suffix);
				fs.writeFileSync(storePath, testJson, "utf8");
				return;
			} catch (_e) {
				// console.log('Failed with suffix', suffix, ':', e.message);
			}
		}
	}

	// Step 2: If that failed, we search backwards byte by byte for ANY point that can be validly closed
	console.log("Scanning backwards for valid truncation point...");
	for (let i = content.length - 1; i > 0; i--) {
		if (content[i] === "}" || content[i] === "]") {
			for (const suffix of ["]}]}", "}]}", "]}}", "]}", "}}", "}"]) {
				const testJson = content.substring(0, i + 1) + suffix;
				try {
					JSON.parse(testJson);
					console.log(
						`✅ Success! Found valid truncation at index ${i} with suffix: ${suffix}`,
					);
					fs.writeFileSync(storePath, testJson, "utf8");
					return;
				} catch (_e) {}
			}
		}
		if (i % 1000000 === 0)
			console.log(`Processed ${content.length - i} bytes...`);
	}

	console.log("❌ Aggressive repair failed.");
}

aggressiveRepair().catch(console.error);
