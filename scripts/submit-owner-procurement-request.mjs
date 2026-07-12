import path from "node:path";
import {
	buildOwnerProcurementRequest,
	writeJson,
} from "./lib/procurement-requests.mjs";

function main() {
	const req = buildOwnerProcurementRequest();
	const tsSafe = req.requestedAt.replace(/[:.]/g, "-");
	const dir = path.resolve("exports/procurement-requests");
	const fileName = `owner-laptop-request-acer-nitro5-${tsSafe}.json`;
	const filePath = path.join(dir, fileName);
	writeJson(filePath, req);
	console.log("Owner procurement request written to", filePath);
}

main();
