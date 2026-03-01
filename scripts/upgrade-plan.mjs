import "dotenv/config";
import { buildBase44Client } from "../src/base44-client.mjs";

async function main() {
    console.log("Starting Base44 Premium Upgrade process...");
    
    const promoCode = "TAAFT";
    const plan = "premium"; // annual
    
    // Skip online attempt as it causes 405 loop (no endpoint).
    // Directly queue for manual/autonomous browser handling.
    
    console.log("Online API not available for upgrade. Falling back to offline queueing.");
    
    const offline = buildBase44Client({ mode: "offline" });
    const request = {
        plan,
        promo_code: promoCode,
        discount: "15%",
        status: "pending_manual_completion",
        priority: "high",
        notes: "User authorized autonomous purchase. Use promo code TAAFT.",
        created_at: new Date().toISOString()
    };
    
    try {
        const result = await offline.asServiceRole.entities.SubscriptionRequest.create(request);
        console.log("Queued offline SubscriptionRequest:", result.id);
        console.log(`ACTION REQUIRED: Please complete upgrade to ${plan} using code ${promoCode} manually or authorize browser agent.`);
    } catch (err) {
        console.error("Failed to queue offline request:", err.message);
    }
}

main();
