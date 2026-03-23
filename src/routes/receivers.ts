import { Hono } from "hono";
import { genId } from "../ids";

const app = new Hono();

// --- Validation helpers ---

function requireFields(
  body: Record<string, unknown>,
  fields: string[],
): string | null {
  const missing = fields.filter(
    (f) => body[f] === undefined || body[f] === null || body[f] === "",
  );
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  return null;
}

function validateEmail(email: unknown): boolean {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /v1/instances/:instanceId/receivers — create receiver
app.post("/", async (c) => {
  const body = await c.req.json();
  const isBusiness = !!body.business_name || !!body.legal_name;
  const instanceId = c.req.param("instanceId");
  const now = new Date().toISOString();
  const id = genId("receiver");

  if (isBusiness) {
    // Business receiver validation
    const err = requireFields(body, [
      "business_name",
      "email",
      "country",
    ]);
    if (err) {
      return c.json(
        { error: "validation_error", message: err },
        400,
      );
    }
    if (!validateEmail(body.email)) {
      return c.json(
        { error: "validation_error", message: "Invalid email format" },
        400,
      );
    }

    return c.json({
      id,
      type: "business",
      business_name: body.business_name ?? body.legal_name,
      legal_name: body.legal_name ?? body.business_name,
      email: body.email,
      country: body.country,
      website: body.website ?? null,
      tax_id: body.tax_id ?? null,
      doing_business_as: body.doing_business_as ?? null,
      status: "active",
      kyc_status: "approved",
      instance_id: instanceId,
      created_at: now,
      updated_at: now,
    });
  }

  // Individual receiver validation
  const err = requireFields(body, [
    "first_name",
    "last_name",
    "email",
  ]);
  if (err) {
    return c.json(
      { error: "validation_error", message: err },
      400,
    );
  }
  if (!validateEmail(body.email)) {
    return c.json(
      { error: "validation_error", message: "Invalid email format" },
      400,
    );
  }

  return c.json({
    id,
    type: "individual",
    first_name: body.first_name,
    last_name: body.last_name,
    email: body.email,
    country: body.country ?? "US",
    date_of_birth: body.date_of_birth ?? null,
    phone: body.phone ?? null,
    status: "active",
    kyc_status: "approved",
    instance_id: instanceId,
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
    country: "US",
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

  // Validate required fields
  const err = requireFields(body, [
    "type",
    "beneficiary_name",
    "routing_number",
    "account_number",
  ]);
  if (err) {
    return c.json({ error: "validation_error", message: err }, 400);
  }

  // Validate routing number format (9 digits)
  if (!/^\d{9}$/.test(body.routing_number)) {
    return c.json(
      {
        error: "validation_error",
        message: "routing_number must be exactly 9 digits",
      },
      400,
    );
  }

  // Validate account type
  const validAccountTypes = ["checking", "saving"];
  if (body.account_type && !validAccountTypes.includes(body.account_type)) {
    return c.json(
      {
        error: "validation_error",
        message: `account_type must be one of: ${validAccountTypes.join(", ")}`,
      },
      400,
    );
  }

  // Validate account class
  const validAccountClasses = ["individual", "business"];
  if (body.account_class && !validAccountClasses.includes(body.account_class)) {
    return c.json(
      {
        error: "validation_error",
        message: `account_class must be one of: ${validAccountClasses.join(", ")}`,
      },
      400,
    );
  }

  // Validate recipient relationship
  const validRelationships = [
    "first_party",
    "employee",
    "independent_contractor",
    "vendor_or_supplier",
    "subsidiary_or_affiliate",
    "merchant_or_partner",
    "customer",
    "landlord",
    "family",
    "other",
  ];
  if (
    body.recipient_relationship &&
    !validRelationships.includes(body.recipient_relationship)
  ) {
    return c.json(
      {
        error: "validation_error",
        message: `recipient_relationship must be one of: ${validRelationships.join(", ")}`,
      },
      400,
    );
  }

  return c.json({
    id: genId("bankAccount"),
    type: body.type,
    name: body.name ?? `${body.beneficiary_name} - ${body.type?.toUpperCase()}`,
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

  // Validate required fields
  const err = requireFields(body, ["name", "address", "network"]);
  if (err) {
    return c.json({ error: "validation_error", message: err }, 400);
  }

  // Validate is_account_abstraction is a boolean when provided
  if (
    body.is_account_abstraction !== undefined &&
    typeof body.is_account_abstraction !== "boolean"
  ) {
    return c.json(
      {
        error: "validation_error",
        message: "is_account_abstraction must be a boolean",
      },
      400,
    );
  }

  // Validate address looks like an EVM address
  if (!/^0x[a-fA-F0-9]{40}$/.test(body.address)) {
    return c.json(
      {
        error: "validation_error",
        message: "address must be a valid EVM address (0x + 40 hex chars)",
      },
      400,
    );
  }

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
