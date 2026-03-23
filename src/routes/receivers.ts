import { Hono } from "hono";
import { genId } from "../ids";

const app = new Hono();

// POST /v1/instances/:instanceId/receivers — create individual receiver
// POST /v1/instances/:instanceId/receivers — create business receiver
// Distinguish by presence of `business_name` in body
app.post("/", async (c) => {
  const body = await c.req.json();
  const isBusiness = !!body.business_name;

  const id = genId("receiver");
  const now = new Date().toISOString();

  if (isBusiness) {
    return c.json({
      id,
      type: "business",
      business_name: body.business_name,
      email: body.email ?? null,
      status: "active",
      kyc_status: "approved",
      instance_id: c.req.param("instanceId"),
      created_at: now,
      updated_at: now,
    });
  }

  return c.json({
    id,
    type: "individual",
    first_name: body.first_name ?? "Test",
    last_name: body.last_name ?? "User",
    email: body.email ?? null,
    status: "active",
    kyc_status: "approved",
    instance_id: c.req.param("instanceId"),
    created_at: now,
    updated_at: now,
  });
});

// GET /v1/instances/:instanceId/receivers/:receiverId
app.get("/:receiverId", (c) => {
  const now = new Date().toISOString();
  return c.json({
    id: c.req.param("receiverId"),
    type: "individual",
    first_name: "Test",
    last_name: "User",
    email: "test@example.com",
    status: "active",
    kyc_status: "approved",
    instance_id: c.req.param("instanceId"),
    created_at: now,
    updated_at: now,
  });
});

// POST /v1/instances/:instanceId/receivers/:receiverId/bank-accounts
app.post("/:receiverId/bank-accounts", async (c) => {
  const body = await c.req.json();
  const receiverId = c.req.param("receiverId");
  const now = new Date().toISOString();

  return c.json({
    id: genId("bankAccount"),
    type: body.type ?? "ach",
    name: body.name,
    beneficiary_name: body.beneficiary_name,
    routing_number: body.routing_number,
    account_number: body.account_number,
    account_type: body.account_type ?? "checking",
    account_class: body.account_class ?? "individual",
    status: "active",
    recipient_relationship: body.recipient_relationship ?? "first_party",
    address_line_1: body.address_line_1 ?? "",
    address_line_2: body.address_line_2 ?? null,
    city: body.city ?? "",
    state_province_region: body.state_province_region ?? "",
    country: body.country ?? "US",
    postal_code: body.postal_code ?? "",
    receiver_id: receiverId,
    created_at: now,
  });
});

// GET /v1/instances/:instanceId/receivers/:receiverId/virtual-accounts
app.get("/:receiverId/virtual-accounts", (c) => {
  const receiverId = c.req.param("receiverId");

  return c.json([
    {
      id: genId("virtualAccount"),
      banking_partner: "lead_bank",
      kyc_status: "approved",
      us: {
        ach: { routing_number: "021000021", account_number: "123456789012" },
        wire: { routing_number: "021000021", account_number: "123456789012" },
        rtp: { routing_number: "021000021", account_number: "123456789012" },
        swift_bic_code: "LEADUS33",
        account_type: "checking",
        beneficiary: {
          name: "Test Beneficiary",
          address_line_1: "123 Test St",
        },
        receiving_bank: {
          name: "Lead Bank",
          address_line_1: "456 Bank Ave",
        },
      },
      token: "USDC",
      blockchain_wallet_id: `bw_${receiverId.slice(3, 15)}`,
      receiver_id: receiverId,
    },
  ]);
});

// GET /v1/instances/:instanceId/receivers/:receiverId/blockchain-wallets
app.get("/:receiverId/blockchain-wallets", (c) => {
  const receiverId = c.req.param("receiverId");

  return c.json([
    {
      id: `bw_${receiverId.slice(3, 15)}`,
      name: "Primary Wallet",
      network: "polygon",
      address: "0x" + "a".repeat(40),
      is_account_abstraction: false,
      receiver_id: receiverId,
      signature_tx_hash: null,
    },
  ]);
});

// POST /v1/instances/:instanceId/receivers/:receiverId/blockchain-wallets
app.post("/:receiverId/blockchain-wallets", async (c) => {
  const body = await c.req.json();
  const receiverId = c.req.param("receiverId");

  return c.json({
    id: genId("blockchainWallet"),
    name: body.name,
    network: body.network,
    address: body.address,
    is_account_abstraction: body.is_account_abstraction ?? false,
    receiver_id: receiverId,
    signature_tx_hash: null,
  });
});

export default app;
