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

// --- In-memory payin store for status lifecycle ---
// Key: payinId, Value: { createdAt, quoteId, ... }
const payinStore = new Map<
  string,
  {
    createdAt: number;
    quoteId: string;
    instanceId: string;
    senderAmount: number;
    receiverAmount: number;
    token: string;
    paymentMethod: string;
  }
>();

// How many ms before a payin transitions from processing → completed.
// Default 3s, controllable via PAYIN_COMPLETE_DELAY_MS env var or ?delay=<ms> query.
const DEFAULT_COMPLETE_DELAY_MS = parseInt(
  process.env.PAYIN_COMPLETE_DELAY_MS ?? "3000",
  10,
);

type PayinStatus = "processing" | "on_hold" | "completed" | "failed" | "refunded";

function resolvePayinStatus(createdAt: number, delayMs: number): PayinStatus {
  const elapsed = Date.now() - createdAt;
  if (elapsed < delayMs) return "processing";
  return "completed";
}

function buildPayinResponse(
  id: string,
  quoteId: string,
  instanceId: string,
  status: PayinStatus,
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

  // Validate required fields
  if (!body.blockchain_wallet_id) {
    return c.json(
      { error: "validation_error", message: "blockchain_wallet_id is required" },
      400,
    );
  }
  if (!body.payment_method) {
    return c.json(
      { error: "validation_error", message: "payment_method is required" },
      400,
    );
  }
  if (!body.token) {
    return c.json(
      { error: "validation_error", message: "token is required" },
      400,
    );
  }

  const validTokens = ["USDC", "USDT", "USDB"];
  if (!validTokens.includes(body.token)) {
    return c.json(
      {
        error: "validation_error",
        message: `token must be one of: ${validTokens.join(", ")}`,
      },
      400,
    );
  }

  const requestAmount: number = body.request_amount ?? 10000;
  if (requestAmount < 1000) {
    // Minimum $10 in cents
    return c.json(
      {
        error: "validation_error",
        message: "request_amount must be at least 1000 ($10.00)",
      },
      400,
    );
  }

  const fee = Math.round(requestAmount * 0.01); // 1% fee
  const receiverAmount = requestAmount - fee;
  const quoteId = genId("quote");

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

  if (!body.payin_quote_id) {
    return c.json(
      { error: "validation_error", message: "payin_quote_id is required" },
      400,
    );
  }

  const payinId = genId("payin");
  const quoteId: string = body.payin_quote_id;
  const senderAmount = 10000;
  const receiverAmount = 9900;
  const token = "USDC";
  const paymentMethod = "ach";

  // Store for status lifecycle tracking
  payinStore.set(payinId, {
    createdAt: Date.now(),
    quoteId,
    instanceId,
    senderAmount,
    receiverAmount,
    token,
    paymentMethod,
  });

  return c.json(
    buildPayinResponse(
      payinId,
      quoteId,
      instanceId,
      "processing",
      senderAmount,
      receiverAmount,
      token,
      paymentMethod,
    ),
  );
});

// GET /v1/instances/:instanceId/payins/:payinId — get payin status
// Status evolves over time: processing → completed (after PAYIN_COMPLETE_DELAY_MS)
// Override delay with ?delay=<ms> query param for testing
app.get("/payins/:payinId", (c) => {
  const instanceId = c.req.param("instanceId") ?? "inst_unknown";
  const payinId = c.req.param("payinId")!;
  const delayOverride = c.req.query("delay");
  const delayMs = delayOverride
    ? parseInt(delayOverride, 10)
    : DEFAULT_COMPLETE_DELAY_MS;

  const stored = payinStore.get(payinId);
  if (stored) {
    const status = resolvePayinStatus(stored.createdAt, delayMs);
    return c.json(
      buildPayinResponse(
        payinId,
        stored.quoteId,
        stored.instanceId,
        status,
        stored.senderAmount,
        stored.receiverAmount,
        stored.token,
        stored.paymentMethod,
      ),
    );
  }

  // Unknown payin — return completed (backwards-compatible fallback)
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
