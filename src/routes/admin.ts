import { Hono } from "hono";
import { updatePayinStatus, type PayinStatus } from "../store";
import { resetState } from "../seed";

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

// POST /admin/reset — clear all in-memory state and re-seed fixture receivers
app.post("/reset", (c) => {
  resetState();
  return c.json({ status: "ok", message: "All state cleared" });
});

export default app;
