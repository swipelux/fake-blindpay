import { Hono } from "hono";
import { genId } from "../ids";

const app = new Hono();

const FAKE_BANK_DETAILS = {
  routing_number: "021000021",
  account_number: "123456789012",
  account_type: "checking",
  beneficiary: {
    name: "Blindpay Treasury",
    address_line_1: "100 Finance Blvd",
  },
  receiving_bank: {
    name: "Lead Bank",
    address_line_1: "456 Bank Ave",
  },
};

function buildPayinResponse(
  id: string,
  quoteId: string,
  instanceId: string,
  status: "processing" | "on_hold" | "completed" | "failed" | "refunded",
  senderAmount: number,
  receiverAmount: number,
  token: string,
  paymentMethod: string,
) {
  const now = new Date().toISOString();
  return {
    id,
    status,
    payment_method: paymentMethod,
    token,
    currency: "USD",
    sender_amount: senderAmount,
    receiver_amount: receiverAmount,
    memo_code: quoteId,
    blindpay_bank_details: FAKE_BANK_DETAILS,
    payin_quote_id: quoteId,
    receiver_id: "rc_fake_receiver",
    instance_id: instanceId,
    commercial_quotation: 100,
    blindpay_quotation: 100,
    total_fee_amount: 0,
    transaction_fee_amount: 0,
    partner_fee_amount: 0,
    billing_fee_amount: 0,
    created_at: now,
    updated_at: now,
  };
}

// POST /v1/instances/:instanceId/payin-quotes
app.post("/payin-quotes", async (c) => {
  const body = await c.req.json();
  const quoteId = genId("quote");

  const requestAmount: number = body.request_amount ?? 10000;
  const fee = Math.round(requestAmount * 0.01); // 1% fee
  const receiverAmount = requestAmount - fee;

  return c.json({
    id: quoteId,
    sender_amount: requestAmount,
    receiver_amount: receiverAmount,
    flat_fee: fee,
    billing_fee_amount: 0,
    partner_fee_amount: 0,
    commercial_quotation: 100,
    blindpay_quotation: 100,
    expires_at: Date.now() + 5 * 60 * 1000, // 5 min
  });
});

// POST /v1/instances/:instanceId/payins/evm — initiate payin
app.post("/payins/evm", async (c) => {
  const body = await c.req.json();
  const instanceId = c.req.param("instanceId") ?? "inst_unknown";
  const payinId = genId("payin");
  const quoteId: string = body.payin_quote_id ?? "qu_unknown";

  return c.json(
    buildPayinResponse(
      payinId,
      quoteId,
      instanceId,
      "processing",
      10000,
      9900,
      "USDC",
      "ach",
    ),
  );
});

// GET /v1/instances/:instanceId/payins/:payinId — get payin status
app.get("/payins/:payinId", (c) => {
  const instanceId = c.req.param("instanceId") ?? "inst_unknown";
  const payinId = c.req.param("payinId")!;

  // Stateless: always return completed for GET lookups
  return c.json(
    buildPayinResponse(
      payinId,
      "qu_resolved",
      instanceId,
      "completed",
      10000,
      9900,
      "USDC",
      "ach",
    ),
  );
});

export default app;
