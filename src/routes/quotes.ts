import { Hono } from "hono";

const app = new Hono();

// POST /v1/instances/:instanceId/quotes/fx — payout FX rate
app.post("/fx", async (c) => {
  const body = await c.req.json();

  if (!body.from || !body.to) {
    return c.json(
      { error: "validation_error", message: "from and to currencies are required" },
      400,
    );
  }

  const validCurrencies = ["USDC", "USDT", "USDB", "USD", "EUR"];
  if (!validCurrencies.includes(body.from)) {
    return c.json(
      { error: "validation_error", message: `from must be one of: ${validCurrencies.join(", ")}` },
      400,
    );
  }
  if (!validCurrencies.includes(body.to)) {
    return c.json(
      { error: "validation_error", message: `to must be one of: ${validCurrencies.join(", ")}` },
      400,
    );
  }

  const requestAmount: number = body.request_amount ?? 10000;
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
