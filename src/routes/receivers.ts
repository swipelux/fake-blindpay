import { Hono } from "hono";
import { genId } from "../ids";
import {
  storeReceiver,
  getReceiver,
  storeBankAccount,
  getBankAccounts,
  storeBlockchainWallet,
  getBlockchainWallets,
  RECEIVER_KYC_STATUSES,
  RECEIVER_KYC_TYPES,
  type Receiver,
} from "../store";

const app = new Hono();

// --- Validation helpers ---

function resolveKyc(
  body: Record<string, unknown>,
): { kyc_status: Receiver["kyc_status"]; kyc_type: Receiver["kyc_type"] } | { error: string } {
  const status = body.kyc_status ?? "approved";
  const type = body.kyc_type ?? "standard";
  if (typeof status !== "string" || !(RECEIVER_KYC_STATUSES as readonly string[]).includes(status)) {
    return { error: `kyc_status must be one of: ${RECEIVER_KYC_STATUSES.join(", ")}` };
  }
  if (typeof type !== "string" || !(RECEIVER_KYC_TYPES as readonly string[]).includes(type)) {
    return { error: `kyc_type must be one of: ${RECEIVER_KYC_TYPES.join(", ")}` };
  }
  return {
    kyc_status: status as Receiver["kyc_status"],
    kyc_type: type as Receiver["kyc_type"],
  };
}

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
  const instanceId = c.req.param("instanceId") ?? "inst_unknown";
  const now = new Date().toISOString();
  const id = genId("receiver");

  const kyc = resolveKyc(body);
  if ("error" in kyc) {
    return c.json({ error: "validation_error", message: kyc.error }, 400);
  }

  if (isBusiness) {
    const err = requireFields(body, ["business_name", "email", "country"]);
    if (err) {
      return c.json({ error: "validation_error", message: err }, 400);
    }
    if (!validateEmail(body.email)) {
      return c.json({ error: "validation_error", message: "Invalid email format" }, 400);
    }

    const receiver = {
      id,
      type: "business" as const,
      business_name: body.business_name ?? body.legal_name,
      legal_name: body.legal_name ?? body.business_name,
      email: body.email,
      country: body.country,
      website: body.website ?? null,
      tax_id: body.tax_id ?? null,
      doing_business_as: body.doing_business_as ?? null,
      status: "active",
      kyc_status: kyc.kyc_status,
      kyc_type: kyc.kyc_type,
      instance_id: instanceId,
      created_at: now,
      updated_at: now,
    };
    storeReceiver(receiver);
    return c.json(receiver);
  }

  // Individual receiver
  const err = requireFields(body, ["first_name", "last_name", "email"]);
  if (err) {
    return c.json({ error: "validation_error", message: err }, 400);
  }
  if (!validateEmail(body.email)) {
    return c.json({ error: "validation_error", message: "Invalid email format" }, 400);
  }

  const receiver = {
    id,
    type: "individual" as const,
    first_name: body.first_name,
    last_name: body.last_name,
    email: body.email,
    country: body.country ?? "US",
    date_of_birth: body.date_of_birth ?? null,
    phone: body.phone ?? null,
    status: "active",
    kyc_status: kyc.kyc_status,
    kyc_type: kyc.kyc_type,
    instance_id: instanceId,
    created_at: now,
    updated_at: now,
  };
  storeReceiver(receiver);
  return c.json(receiver);
});

// GET /v1/instances/:instanceId/receivers/:receiverId
app.get("/:receiverId", (c) => {
  const receiverId = c.req.param("receiverId");
  const receiver = getReceiver(receiverId);
  if (!receiver) {
    return c.json({ error: "not_found", message: `Receiver ${receiverId} not found` }, 404);
  }
  return c.json(receiver);
});

// POST /v1/instances/:instanceId/receivers/:receiverId/bank-accounts
app.post("/:receiverId/bank-accounts", async (c) => {
  const body = await c.req.json();
  const receiverId = c.req.param("receiverId");

  if (!getReceiver(receiverId)) {
    return c.json({ error: "not_found", message: `Receiver ${receiverId} not found` }, 404);
  }

  const err = requireFields(body, [
    "type",
    "beneficiary_name",
    "routing_number",
    "account_number",
  ]);
  if (err) {
    return c.json({ error: "validation_error", message: err }, 400);
  }

  if (!/^\d{9}$/.test(body.routing_number)) {
    return c.json(
      { error: "validation_error", message: "routing_number must be exactly 9 digits" },
      400,
    );
  }

  const validAccountTypes = ["checking", "saving"];
  if (body.account_type && !validAccountTypes.includes(body.account_type)) {
    return c.json(
      { error: "validation_error", message: `account_type must be one of: ${validAccountTypes.join(", ")}` },
      400,
    );
  }

  const validAccountClasses = ["individual", "business"];
  if (body.account_class && !validAccountClasses.includes(body.account_class)) {
    return c.json(
      { error: "validation_error", message: `account_class must be one of: ${validAccountClasses.join(", ")}` },
      400,
    );
  }

  const validRelationships = [
    "first_party", "employee", "independent_contractor", "vendor_or_supplier",
    "subsidiary_or_affiliate", "merchant_or_partner", "customer", "landlord",
    "family", "other",
  ];
  if (body.recipient_relationship && !validRelationships.includes(body.recipient_relationship)) {
    return c.json(
      { error: "validation_error", message: `recipient_relationship must be one of: ${validRelationships.join(", ")}` },
      400,
    );
  }

  const now = new Date().toISOString();
  const account = {
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
  };
  storeBankAccount(account);
  return c.json(account);
});

// GET /v1/instances/:instanceId/receivers/:receiverId/bank-accounts
app.get("/:receiverId/bank-accounts", (c) => {
  const receiverId = c.req.param("receiverId");
  if (!getReceiver(receiverId)) {
    return c.json({ error: "not_found", message: `Receiver ${receiverId} not found` }, 404);
  }
  return c.json(getBankAccounts(receiverId));
});

// GET /v1/instances/:instanceId/receivers/:receiverId/virtual-accounts
app.get("/:receiverId/virtual-accounts", (c) => {
  const receiverId = c.req.param("receiverId");
  if (!getReceiver(receiverId)) {
    return c.json({ error: "not_found", message: `Receiver ${receiverId} not found` }, 404);
  }

  // Virtual accounts are derived from receiver — one per receiver
  const wallets = getBlockchainWallets(receiverId);
  const blockchainWalletId = wallets.length > 0
    ? wallets[0].id
    : `bw_${receiverId.slice(3, 15)}`;

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
      blockchain_wallet_id: blockchainWalletId,
      receiver_id: receiverId,
    },
  ]);
});

// GET /v1/instances/:instanceId/receivers/:receiverId/blockchain-wallets
app.get("/:receiverId/blockchain-wallets", (c) => {
  const receiverId = c.req.param("receiverId");
  if (!getReceiver(receiverId)) {
    return c.json({ error: "not_found", message: `Receiver ${receiverId} not found` }, 404);
  }
  return c.json(getBlockchainWallets(receiverId));
});

// POST /v1/instances/:instanceId/receivers/:receiverId/blockchain-wallets
app.post("/:receiverId/blockchain-wallets", async (c) => {
  const body = await c.req.json();
  const receiverId = c.req.param("receiverId");

  if (!getReceiver(receiverId)) {
    return c.json({ error: "not_found", message: `Receiver ${receiverId} not found` }, 404);
  }

  const err = requireFields(body, ["name", "address", "network"]);
  if (err) {
    return c.json({ error: "validation_error", message: err }, 400);
  }

  if (
    body.is_account_abstraction !== undefined &&
    typeof body.is_account_abstraction !== "boolean"
  ) {
    return c.json(
      { error: "validation_error", message: "is_account_abstraction must be a boolean" },
      400,
    );
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(body.address)) {
    return c.json(
      { error: "validation_error", message: "address must be a valid EVM address (0x + 40 hex chars)" },
      400,
    );
  }

  const wallet = {
    id: genId("blockchainWallet"),
    name: body.name,
    network: body.network,
    address: body.address,
    is_account_abstraction: body.is_account_abstraction ?? false,
    receiver_id: receiverId,
    signature_tx_hash: null,
  };
  storeBlockchainWallet(wallet);
  return c.json(wallet);
});

export default app;
