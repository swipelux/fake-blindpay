import { Hono } from "hono";

const app = new Hono();

// POST /v1/instances/:instanceId/quotes/fx — payout FX rate
app.post("/fx", async (c) => {
  const body = await c.req.json();
  const requestAmount: number = body.request_amount ?? 10000;

  // 1:1 rate with 1% fee for mock
  const fee = Math.round(requestAmount * 0.01);
  const resultAmount = requestAmount - fee;

  return c.json({
    commercial_quotation: 100,
    blindpay_quotation: 100,
    result_amount: resultAmount,
    instance_flat_fee: null,
    instance_percentage_fee: 1,
  });
});

export default app;
