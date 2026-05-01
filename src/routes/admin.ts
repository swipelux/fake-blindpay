import { Hono } from "hono";
import { updatePayinStatus, clearAll, updateReceiver, RECEIVER_KYC_STATUSES, RECEIVER_KYC_TYPES, type PayinStatus } from "../store";

const app = new Hono();

const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "";

async function fireWebhook(
  type: string,
  payin: { id: string; status: PayinStatus; paymentMethod: string; token: string; senderAmount: number; receiverAmount: number; quoteId: string; createdAt: string; updatedAt: string },
): Promise<void> {
  if (!WEBHOOK_URL) {
    console.log("[admin] WEBHOOK_URL not configured, skipping webhook dispatch");
    return;
  }

  const payload = {
    type,
    data: {
      id: payin.id,
      status: payin.status,
      payment_method: payin.paymentMethod,
      token: payin.token,
      sender_amount: payin.senderAmount,
      sender_currency: "USD",
      receiver_amount: payin.receiverAmount,
      receiver_currency: payin.token,
      memo_code: payin.quoteId,
      created_at: payin.createdAt,
      updated_at: payin.updatedAt,
    },
  };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log(`[admin] Webhook dispatched to ${WEBHOOK_URL}: ${res.status}`);
  } catch (err) {
    console.error(`[admin] Webhook dispatch failed:`, err);
  }
}

// POST /admin/payins/:id/complete
app.post("/payins/:id/complete", async (c) => {
  const id = c.req.param("id");
  const payin = updatePayinStatus(id, "completed");
  if (!payin) {
    return c.json({ error: "not_found", message: `Payin ${id} not found` }, 404);
  }
  await fireWebhook("payin.complete", payin);
  return c.json({ status: "ok", payin_id: payin.id, payin_status: payin.status });
});

// POST /admin/payins/:id/reject
app.post("/payins/:id/reject", async (c) => {
  const id = c.req.param("id");
  const payin = updatePayinStatus(id, "failed");
  if (!payin) {
    return c.json({ error: "not_found", message: `Payin ${id} not found` }, 404);
  }
  await fireWebhook("payin.update", payin);
  return c.json({ status: "ok", payin_id: payin.id, payin_status: payin.status });
});

// POST /admin/payins/:id/hold
app.post("/payins/:id/hold", async (c) => {
  const id = c.req.param("id");
  const payin = updatePayinStatus(id, "on_hold");
  if (!payin) {
    return c.json({ error: "not_found", message: `Payin ${id} not found` }, 404);
  }
  await fireWebhook("payin.update", payin);
  return c.json({ status: "ok", payin_id: payin.id, payin_status: payin.status });
});

// POST /admin/payins/:id/refund
app.post("/payins/:id/refund", async (c) => {
  const id = c.req.param("id");
  const payin = updatePayinStatus(id, "refunded");
  if (!payin) {
    return c.json({ error: "not_found", message: `Payin ${id} not found` }, 404);
  }
  await fireWebhook("payin.update", payin);
  return c.json({ status: "ok", payin_id: payin.id, payin_status: payin.status });
});

// POST /admin/reset — clear all in-memory state
app.post("/reset", (c) => {
  clearAll();
  return c.json({ status: "ok", message: "All state cleared" });
});

app.patch("/receivers/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  if (body.kyc_status !== undefined && !(RECEIVER_KYC_STATUSES as readonly string[]).includes(body.kyc_status)) {
    return c.json(
      { error: "validation_error", message: `kyc_status must be one of: ${RECEIVER_KYC_STATUSES.join(", ")}` },
      400,
    );
  }
  if (body.kyc_type !== undefined && !(RECEIVER_KYC_TYPES as readonly string[]).includes(body.kyc_type)) {
    return c.json(
      { error: "validation_error", message: `kyc_type must be one of: ${RECEIVER_KYC_TYPES.join(", ")}` },
      400,
    );
  }

  const updated = updateReceiver(id, {
    ...(body.kyc_status !== undefined ? { kyc_status: body.kyc_status } : {}),
    ...(body.kyc_type !== undefined ? { kyc_type: body.kyc_type } : {}),
  });
  if (!updated) {
    return c.json({ error: "not_found", message: `Receiver ${id} not found` }, 404);
  }
  return c.json(updated);
});

export default app;
