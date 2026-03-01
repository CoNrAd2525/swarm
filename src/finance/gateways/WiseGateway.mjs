import { PrivacyMasker } from "../../util/privacy-masker.mjs";

export class WiseGateway {
  constructor({ audit }) {
    this.audit = audit;
  }

  async executeTransfer(transferDetails) {
    const live =
      String(process.env.SWARM_LIVE || "false").toLowerCase() === "true";
    const enabled =
      String(process.env.WISE_ENABLE || "false").toLowerCase() === "true";
    const env = String(process.env.WISE_ENVIRONMENT || "").toLowerCase();
    if (!live) throw new Error("WiseGateway: SWARM_LIVE=true required");
    if (!enabled) throw new Error("WiseGateway: WISE_ENABLE=true required");
    if (env !== "live") {
      throw new Error(
        "WiseGateway: Simulation disabled. Set WISE_ENVIRONMENT=live or disable route",
      );
    }
    if (!process.env.WISE_API_KEY || !process.env.WISE_PROFILE_ID) {
      throw new Error("WiseGateway: Missing WISE_API_KEY or WISE_PROFILE_ID");
    }

    const { payoutBatchId, actor } = transferDetails || {};
    this.audit.log(
      "WISE_TRANSFER_PREPARED",
      payoutBatchId || null,
      null,
      { status: "WAITING_PROVIDER_INTEGRATION" },
      actor || "System",
      { reassurance: PrivacyMasker.reassurance("wise") },
    );
    throw new Error(
      "WiseGateway: LIVE provider integration not implemented. Disable route or integrate Wise.",
    );
  }
}
