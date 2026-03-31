import fs from "node:fs";
import path from "node:path";

async function finalRepair() {
	const storePath = path.join(process.cwd(), ".base44-offline-store.json");
	const stats = fs.statSync(storePath);
	const fd = fs.openSync(storePath, "r");

	// Read the last 5MB
	const readSize = Math.min(stats.size, 5 * 1024 * 1024);
	const buffer = Buffer.alloc(readSize);
	fs.readSync(fd, buffer, 0, readSize, stats.size - readSize);
	const tail = buffer.toString("utf8");

	// Find the last "}," (end of a record in an array)
	const marker = "},";
	let lastIdx = tail.lastIndexOf(marker);

	while (lastIdx !== -1) {
		const absolutePos = stats.size - readSize + lastIdx + 1; // pointing at '}'
		const partialBuffer = Buffer.alloc(absolutePos);
		fs.readSync(fd, partialBuffer, 0, absolutePos, 0);
		const content = partialBuffer.toString("utf8");

		const suffixes = ["]}}}", "]}}", "]}", "}}", "}"];
		for (const suffix of suffixes) {
			try {
				const testJson = content + suffix;
				JSON.parse(testJson);
				console.log(
					`✅ SUCCESS at position ${absolutePos} with suffix ${suffix}`,
				);
				fs.writeFileSync(storePath, testJson, "utf8");
				return;
			} catch (_e) {}
		}
		lastIdx = tail.lastIndexOf(marker, lastIdx - 1);
	}

	console.log("❌ All attempts failed.");
}

finalRepair().catch(console.error);
