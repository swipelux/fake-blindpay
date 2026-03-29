import { Hono } from "hono";
import { genId } from "../ids";
import {
  storeQuote,
  getQuote,
  storePayin,
  getPayin,
  type PayinStatus,
} from "../store";

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
  status: PayinStatus,
  senderAmount: number,
  receiverAmount: number,
  token: string,
  paymentMethod: string,
  createdAt: string,
  updatedAt: string,
) {
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
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

// POST /v1/instances/:instanceId/payin-quotes
app.post("/payin-quotes", async (c) => {
  const body = await c.req.json();

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
      { error: "validation_error", message: `token must be one of: ${validTokens.join(", ")}` },
      400,
    );
  }

  const requestAmount: number = body.request_amount ?? 10000;
  if (requestAmount < 1000) {
    return c.json(
      { error: "validation_error", message: "request_amount must be at least 1000 ($10.00)" },
      400,
    );
  }

  const fee = Math.round(requestAmount * 0.01);
  const receiverAmount = requestAmount - fee;
  const quoteId = genId("quote");

  const quote = {
    id: quoteId,
    blockchain_wallet_id: body.blockchain_wallet_id,
    currency_type: body.currency_type ?? "sender",
    request_amount: requestAmount,
    sender_amount: requestAmount,
    receiver_amount: receiverAmount,
    flat_fee: fee,
    payment_method: body.payment_method,
    token: body.token,
    commercial_quotation: 100,
    blindpay_quotation: 100,
    billing_fee_amount: 0,
    partner_fee_amount: 0,
    expires_at: Date.now() + 5 * 60 * 1000,
  };
  storeQuote(quote);

  return c.json({
    id: quoteId,
    sender_amount: requestAmount,
    receiver_amount: receiverAmount,
    flat_fee: fee,
    billing_fee_amount: 0,
    partner_fee_amount: 0,
    commercial_quotation: 100,
    blindpay_quotation: 100,
    expires_at: quote.expires_at,
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

  const quoteId: string = body.payin_quote_id;
  const quote = getQuote(quoteId);
  if (!quote) {
    return c.json(
      { error: "not_found", message: `Quote ${quoteId} not found` },
      404,
    );
  }

  const payinId = genId("payin");
  const now = new Date().toISOString();

  const payin = {
    id: payinId,
    status: "processing" as PayinStatus,
    quoteId,
    instanceId,
    receiverId: "rc_fake_receiver",
    senderAmount: quote.sender_amount,
    receiverAmount: quote.receiver_amount,
    token: quote.token,
    paymentMethod: quote.payment_method,
    createdAt: now,
    updatedAt: now,
  };
  storePayin(payin);

  return c.json(
    buildPayinResponse(
      payinId,
      quoteId,
      instanceId,
      "processing",
      payin.senderAmount,
      payin.receiverAmount,
      payin.token,
      payin.paymentMethod,
      now,
      now,
    ),
  );
});

// GET /v1/instances/:instanceId/payins/:payinId — get payin status
app.get("/payins/:payinId", (c) => {
  const payinId = c.req.param("payinId")!;
  const payin = getPayin(payinId);

  if (!payin) {
    return c.json(
      { error: "not_found", message: `Payin ${payinId} not found` },
      404,
    );
  }

  return c.json(
    buildPayinResponse(
      payinId,
      payin.quoteId,
      payin.instanceId,
      payin.status,
      payin.senderAmount,
      payin.receiverAmount,
      payin.token,
      payin.paymentMethod,
      payin.createdAt,
      payin.updatedAt,
    ),
  );
});

export default app;
