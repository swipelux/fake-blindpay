import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import payins from "./routes/payins";
import quotes from "./routes/quotes";
import receivers from "./routes/receivers";

const app = new Hono();

app.use(logger());

// Auth middleware — validates Bearer token exists (any value accepted)
app.use("/v1/*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized", message: "Missing Bearer token" }, 401);
  }
  await next();
});

// Health check
app.get("/", (c) => c.json({ service: "fake-blindpay", status: "ok" }));
app.get("/health", (c) => c.json({ status: "ok" }));

// Mount routes under /v1/instances/:instanceId
app.route("/v1/instances/:instanceId", payins);
app.route("/v1/instances/:instanceId/quotes", quotes);
app.route("/v1/instances/:instanceId/receivers", receivers);

const port = parseInt(process.env.PORT ?? "3001", 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`fake-blindpay listening on port ${port}`);
});
