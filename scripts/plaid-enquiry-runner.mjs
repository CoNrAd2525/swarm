import "dotenv/config";
import { PlaidEnquiryAgent } from "../src/revenue/PlaidEnquiryAgent.mjs";

const PLAID_IDS = [
	"8bf7f6c2-627e-75d0-b944-74693afd366d",
	"b946f337-96e9-568d-96d5-105ae10696ae",
	"8a8475eb-3b83-71fb-35c6-3a4cecd7e5d6",
	"67778323-996d-e11d-0228-b1da309befc1",
	"1d12d845-2fcf-a01b-e5bd-f72da638a5aa",
	"451e6fe4-038e-3359-8aee-7f5247c1d03c",
	"e316aee8-c6ec-1197-4d76-6d1a430a9cce",
];

async function runPlaidEnquiry() {
	const agent = new PlaidEnquiryAgent();
	await agent.init();

	console.log("🚀 Starting Plaid 'Not Scored' Follow-up...");

	const draft = await agent.runAutonomousEnquiry(PLAID_IDS);

	console.log("\n--- DRAFTED EMAIL ---");
	console.log(draft);
	console.log("---------------------\n");

	console.log(
		"✅ Enquiry drafting complete. Log updated in logs/plaid-enquiry-log.json",
	);
}

runPlaidEnquiry().catch(console.error);
