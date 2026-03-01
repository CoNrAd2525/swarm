import { createPayPalPayoutBatch, getPayPalBalance } from "../src/paypal-api.mjs";

function env(name, fallback = null) {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") return fallback;
  return String(v).trim();
}

function nowId(prefix) {
  return `${prefix}_${Date.now()}`;
}

async function main() {
  const receiver =
    env("OWNER_PAYPAL_EMAIL") ||
    env("PAYPAL_OWNER_EMAIL") ||
    "younestsouli2019@gmail.com";
  const amount = env("PAYOUT_AMOUNT", "0.01");
  const currency = env("PAYOUT_CURRENCY", "USD");
  const senderBatchId = nowId("owner_live");
  const senderItemId = nowId("owner");
  try {
    const res = await createPayPalPayoutBatch({
      senderBatchId,
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: String(amount), currency: String(currency) },
          receiver,
          note: env("PAYOUT_NOTE", "Owner payout"),
          sender_item_id: senderItemId,
        },
      ],
      emailSubject: env("PAYOUT_EMAIL_SUBJECT"),
      emailMessage: env("PAYOUT_EMAIL_MESSAGE"),
    });
    const bal = await getPayPalBalance().catch(() => null);
    const out = {
      ok: true,
      senderBatchId,
      itemId: senderItemId,
      receiver,
      amount,
      currency,
      result: res,
      balance: bal,
    };
    process.stdout.write(`${JSON.stringify(out)}\n`);
  } catch (e) {
    const out = { ok: false, error: e?.message ?? String(e) };
    process.stderr.write(`${JSON.stringify(out)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}

