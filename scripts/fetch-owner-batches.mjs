import "dotenv/config";
import { buildBase44ServiceClient } from "../src/base44-client.mjs";
import { getPayoutBatchConfigFromEnv } from "../src/emit-revenue-events.mjs";
import fs from "node:fs/promises";

async function fetchOwnerBatches() {
  console.log("Building Base44 client...");
  const client = buildBase44ServiceClient({ mode: "online" });
  if (!client) {
    console.error("Failed to build Base44 client");
    process.exit(1);
  }

  console.log("Client built successfully. Fetching payout batch config...");
  const payoutBatchCfg = getPayoutBatchConfigFromEnv();
  const batchEntity = client.asServiceRole.entities[payoutBatchCfg.entityName];

  console.log("Scanning for pending batches for owner...");

  // We need to filter for batches that are pending and belong to the owner.
  // The approve-pending-owner-batches.mjs script does this by checking notes and beneficiary.
  // I'll replicate that logic here.

  const allPendingBatches = await batchEntity.filter(
    { [payoutBatchCfg.fieldMap.status]: "pending_approval" },
    "-created_date",
    100,
    0
  );

  if (!Array.isArray(allPendingBatches) || allPendingBatches.length === 0) {
    console.log("No pending batches found.");
    return;
  }

  console.log(`Found ${allPendingBatches.length} total pending batches. Filtering for owner...`);

  const ownerBatches = [];
  const ownerName = process.env.OWNER_BENEFICIARY_NAME || "owner";

  for (const batch of allPendingBatches) {
    const notes = batch[payoutBatchCfg.fieldMap.notes];
    const beneficiary = notes?.beneficiary;

    let isOwner = false;
    if (beneficiary && String(beneficiary).toLowerCase().includes(ownerName.toLowerCase())) {
      isOwner = true;
    }

    if (isOwner) {
      ownerBatches.push(batch);
    }
  }

  if (ownerBatches.length === 0) {
    console.log("No pending batches found for the owner.");
    return;
  }

  console.log(`Found ${ownerBatches.length} pending batches for the owner.`);

  // Now, let's create a payee_links.json file from these batches.
  const payeeLinks = ownerBatches.map(batch => {
    const notes = batch[payoutBatchCfg.fieldMap.notes];
    return {
      ref: batch[payoutBatchCfg.fieldMap.batchId],
      amount: notes?.amount,
      currency: notes?.currency,
      link: `https://www.paypal.com/paypalme/YounesTsouli/${notes?.amount}${notes?.currency}`
    };
  });

  console.log("Generated payee links:", payeeLinks);

  await fs.writeFile(
    "./dist_rwc/site-data/payee_links.json",
    JSON.stringify(payeeLinks, null, 2)
  );

  console.log("Successfully wrote payee links to dist_rwc/site-data/payee_links.json");
}

fetchOwnerBatches().catch(console.error);
