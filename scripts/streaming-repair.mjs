import fs from "node:fs";
import path from "node:path";

async function streamingRepair() {
	const storePath = path.join(process.cwd(), ".base44-offline-store.json");
	const stats = fs.statSync(storePath);
	console.log(
		`Analyzing file of size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`,
	);

	const fd = fs.openSync(storePath, "r");
	const bufferSize = 1024 * 1024; // 1MB buffer
	const buffer = Buffer.alloc(bufferSize);

	// We want to find the last valid "}]" (end of records array)
	// We'll scan backwards from the end of the file in 1MB chunks
	const _foundPos = -1;
	const _foundSuffix = "";

	for (
		let offset = Math.max(0, stats.size - bufferSize * 10);
		offset < stats.size;
		offset += bufferSize
	) {
		const bytesRead = fs.readSync(fd, buffer, 0, bufferSize, offset);
		const chunk = buffer.toString("utf8", 0, bytesRead);

		// Look for common end-of-record markers
		const markers = ["},", "}", "}]"];
		for (const marker of markers) {
			let lastIdx = chunk.lastIndexOf(marker);
			while (lastIdx !== -1) {
				const _absolutePos = offset + lastIdx + marker.length;
				const testContent = chunk.substring(0, lastIdx + marker.length);

				// Try to close it
				const suffixes = ["]}}}", "]}}", "]}", "}}", "}"];
				for (const _suffix of suffixes) {
					try {
						const _tail = testContent.substring(
							Math.max(0, testContent.length - 1000),
						);
						// This is just a heuristic, we can't parse the whole thing here
						// but we can check if the tail looks like a valid record end
					} catch (_e) {}
				}
				lastIdx = chunk.lastIndexOf(marker, lastIdx - 1);
			}
		}
	}

	// Actually, let's just find the LAST occurrence of '}]' in the whole file
	// and then try to close it.
	console.log('Searching for the absolute last "}]" in the file...');
	let lastRecordsEnd = -1;
	let currentOffset = 0;
	while (currentOffset < stats.size) {
		const bytesRead = fs.readSync(fd, buffer, 0, bufferSize, currentOffset);
		const chunk = buffer.toString("utf8", 0, bytesRead);
		const idx = chunk.lastIndexOf("}]");
		if (idx !== -1) {
			lastRecordsEnd = currentOffset + idx;
		}
		currentOffset += bufferSize - 100; // overlap to not miss markers
	}

	if (lastRecordsEnd !== -1) {
		console.log(`Found potential records end at byte ${lastRecordsEnd}`);
		const partial = Buffer.alloc(lastRecordsEnd + 2);
		fs.readSync(fd, partial, 0, lastRecordsEnd + 2, 0);
		const content = partial.toString("utf8");

		const suffixes = ["]}}}", "]}}", "]}", "}}", "}"];
		for (const suffix of suffixes) {
			try {
				const testJson = content + suffix;
				JSON.parse(testJson);
				console.log(`✅ Success! Repaired with suffix: ${suffix}`);
				fs.writeFileSync(storePath, testJson, "utf8");
				console.log(
					`New size: ${(testJson.length / 1024 / 1024).toFixed(2)} MB`,
				);
				return;
			} catch (_e) {}
		}
	}

	console.log("❌ Could not find a valid truncation point.");
	fs.closeSync(fd);
}

streamingRepair().catch(console.error);
