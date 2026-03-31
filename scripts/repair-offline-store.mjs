import fs from "node:fs";
import path from "node:path";

async function repairJson() {
	const storePath = path.join(process.cwd(), ".base44-offline-store.json");
	let content = fs.readFileSync(storePath, "utf8");

	console.log("Original length:", content.length);

	// Try to find the last valid '}' that is part of a record
	let lastValidIndex = -1;
	// We search backwards for a '}' that could be the end of a record or the whole object
	for (let i = content.length - 1; i >= 0; i--) {
		if (content[i] === "}") {
			const testSuffixes = [
				"]}]}", // end of records array, entity object, entities object, root object
				"]}}",
				"]}",
				"}",
			];

			for (const suffix of testSuffixes) {
				const testJson = content.substring(0, i + 1) + suffix;
				try {
					JSON.parse(testJson);
					console.log(
						"Found valid truncation at index",
						i,
						"with suffix",
						suffix,
					);
					lastValidIndex = i;
					content = testJson;
					break;
				} catch (_e) {
					// ignore
				}
			}
			if (lastValidIndex !== -1) break;
		}
	}

	if (lastValidIndex !== -1) {
		fs.writeFileSync(storePath, content, "utf8");
		console.log("Repaired file written. New length:", content.length);
	} else {
		console.log("Could not repair automatically. Falling back to .bak file...");
		const bakPath = `${storePath}.bak`;
		if (fs.existsSync(bakPath)) {
			fs.copyFileSync(bakPath, storePath);
			console.log("Restored from backup.");
		} else {
			console.log("No backup found!");
		}
	}
}

repairJson().catch(console.error);
