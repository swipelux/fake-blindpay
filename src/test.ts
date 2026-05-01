/**
 * End-to-end test script for fake-blindpay.
 * Starts the server, runs all endpoint tests, prints a report, and exits.
 */

const BASE = "http://localhost:3001";
const INSTANCE_ID = "inst_test123";
const API = `${BASE}/v1/instances/${INSTANCE_ID}`;
const ADMIN = `${BASE}/admin`;
const HEADERS = {
  Authorization: "Bearer test-api-key",
  "Content-Type": "application/json",
};

interface TestResult {
  name: string;
  passed: boolean;
  status: number;
  body: unknown;
  error?: string;
}

const results: TestResult[] = [];

async function test(
  name: string,
  method: string,
  url: string,
  body?: unknown,
  validate?: (status: number, body: unknown) => string | null,
  headers?: Record<string, string>,
) {
  try {
    const res = await fetch(url, {
      method,
      headers: headers ?? HEADERS,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    const err = validate?.(res.status, json) ?? null;
    results.push({
      name,
      passed: !err,
      status: res.status,
      body: json,
      error: err ?? undefined,
    });
  } catch (e) {
    results.push({
      name,
      passed: false,
      status: 0,
      body: null,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function run() {
  // Wait for server readiness
  for (let i = 0; i < 20; i++) {
    try {
      await fetch(`${BASE}/health`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // Reset state before tests
  await fetch(`${ADMIN}/reset`, { method: "POST" });

  console.log("Running fake-blindpay endpoint tests...\n");

  // ==================== RECEIVERS ====================

  let individualReceiverId: string | undefined;
  let businessReceiverId: string | undefined;

  await test(
    "Create individual receiver",
    "POST",
    `${API}/receivers`,
    { first_name: "John", last_name: "Doe", email: "john@example.com" },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!b.id?.startsWith("rc_")) return `Bad id: ${b.id}`;
      if (b.type !== "individual") return `Expected individual, got ${b.type}`;
      if (b.first_name !== "John") return `Wrong first_name: ${b.first_name}`;
      if (b.last_name !== "Doe") return `Wrong last_name: ${b.last_name}`;
      if (b.kyc_status !== "approved") return `Wrong kyc: ${b.kyc_status}`;
      individualReceiverId = b.id;
      return null;
    },
  );

  await test(
    "Create business receiver",
    "POST",
    `${API}/receivers`,
    {
      business_name: "Acme Corp",
      email: "acme@example.com",
      country: "US",
      website: "https://acme.com",
    },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!b.id?.startsWith("rc_")) return `Bad id: ${b.id}`;
      if (b.type !== "business") return `Expected business, got ${b.type}`;
      if (b.business_name !== "Acme Corp") return `Wrong name: ${b.business_name}`;
      businessReceiverId = b.id;
      return null;
    },
  );

  // --- Receiver validation errors ---

  await test(
    "Reject individual receiver without first_name",
    "POST",
    `${API}/receivers`,
    { last_name: "Doe", email: "john@example.com" },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("first_name")) return `Missing field hint: ${b.message}`;
      return null;
    },
  );

  await test(
    "Reject individual receiver without email",
    "POST",
    `${API}/receivers`,
    { first_name: "John", last_name: "Doe" },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("email")) return `Missing field hint: ${b.message}`;
      return null;
    },
  );

  await test(
    "Reject individual receiver with invalid email",
    "POST",
    `${API}/receivers`,
    { first_name: "John", last_name: "Doe", email: "not-an-email" },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("email")) return `Missing email hint: ${b.message}`;
      return null;
    },
  );

  await test(
    "Reject business receiver without email",
    "POST",
    `${API}/receivers`,
    { business_name: "Acme Corp", country: "US" },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("email")) return `Missing field hint: ${b.message}`;
      return null;
    },
  );

  // --- Stateful receiver lookup ---

  await test(
    "Get created receiver by ID",
    "GET",
    `${API}/receivers/${individualReceiverId}`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.id !== individualReceiverId) return `Bad id: ${b.id}`;
      if (b.first_name !== "John") return `Wrong first_name: ${b.first_name}`;
      if (b.kyc_status !== "approved") return `Wrong kyc: ${b.kyc_status}`;
      return null;
    },
  );

  await test(
    "Return 404 for unknown receiver",
    "GET",
    `${API}/receivers/rc_does_not_exist`,
    undefined,
    (s, b: any) => {
      if (s !== 404) return `Expected 404, got ${s}`;
      return null;
    },
  );

  // ==================== RECEIVER LIST + KYC STATUS ====================

  await test(
    "Create receiver with kyc_status=verifying",
    "POST",
    `${API}/receivers`,
    {
      first_name: "Pending",
      last_name: "Person",
      email: "pending@example.com",
      kyc_status: "verifying",
    },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.kyc_status !== "verifying") return `Expected verifying, got ${b.kyc_status}`;
      if (b.kyc_type !== "standard") return `Expected default kyc_type=standard, got ${b.kyc_type}`;
      return null;
    },
  );

  await test(
    "Create receiver with custom kyc_type=enhanced",
    "POST",
    `${API}/receivers`,
    {
      first_name: "Enhanced",
      last_name: "Person",
      email: "enhanced@example.com",
      kyc_type: "enhanced",
    },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.kyc_type !== "enhanced") return `Expected enhanced, got ${b.kyc_type}`;
      return null;
    },
  );

  await test(
    "Reject invalid kyc_status",
    "POST",
    `${API}/receivers`,
    {
      first_name: "Bad",
      last_name: "Status",
      email: "bad@example.com",
      kyc_status: "totally_invalid",
    },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("kyc_status")) return `Missing hint: ${b.message}`;
      return null;
    },
  );

  await test(
    "Reject invalid kyc_type",
    "POST",
    `${API}/receivers`,
    {
      first_name: "Bad",
      last_name: "Type",
      email: "badtype@example.com",
      kyc_type: "totally_invalid",
    },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("kyc_type")) return `Missing hint: ${b.message}`;
      return null;
    },
  );

  // ==================== BANK ACCOUNTS ====================

  const receiverId = individualReceiverId!;

  await test(
    "Create bank account (ACH)",
    "POST",
    `${API}/receivers/${receiverId}/bank-accounts`,
    {
      type: "ach",
      name: "Primary Checking",
      beneficiary_name: "John Doe",
      routing_number: "021000021",
      account_number: "123456789",
      account_type: "checking",
      account_class: "individual",
      recipient_relationship: "first_party",
      address_line_1: "123 Main St",
      city: "New York",
      state_province_region: "NY",
      country: "US",
      postal_code: "10001",
    },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!b.id?.startsWith("ba_")) return `Bad id: ${b.id}`;
      if (b.routing_number !== "021000021") return `Wrong routing: ${b.routing_number}`;
      if (b.account_class !== "individual") return `Wrong class: ${b.account_class}`;
      return null;
    },
  );

  await test(
    "Create business bank account",
    "POST",
    `${API}/receivers/${receiverId}/bank-accounts`,
    {
      type: "ach",
      beneficiary_name: "Acme Corp",
      routing_number: "021000021",
      account_number: "987654321",
      account_type: "checking",
      account_class: "business",
      recipient_relationship: "vendor_or_supplier",
    },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.account_class !== "business") return `Wrong class: ${b.account_class}`;
      return null;
    },
  );

  await test(
    "List bank accounts for receiver",
    "GET",
    `${API}/receivers/${receiverId}/bank-accounts`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!Array.isArray(b)) return "Expected array";
      if (b.length !== 2) return `Expected 2 accounts, got ${b.length}`;
      return null;
    },
  );

  await test(
    "Return 404 for bank account on unknown receiver",
    "POST",
    `${API}/receivers/rc_nonexistent/bank-accounts`,
    {
      type: "ach",
      beneficiary_name: "Nobody",
      routing_number: "021000021",
      account_number: "123456789",
    },
    (s, b: any) => {
      if (s !== 404) return `Expected 404, got ${s}`;
      return null;
    },
  );

  await test(
    "Reject bank account with invalid routing number",
    "POST",
    `${API}/receivers/${receiverId}/bank-accounts`,
    {
      type: "ach",
      beneficiary_name: "John Doe",
      routing_number: "12345",
      account_number: "123456789",
    },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("routing_number")) return `Missing hint: ${b.message}`;
      return null;
    },
  );

  await test(
    "Reject bank account without beneficiary_name",
    "POST",
    `${API}/receivers/${receiverId}/bank-accounts`,
    {
      type: "ach",
      routing_number: "021000021",
      account_number: "123456789",
    },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("beneficiary_name")) return `Missing hint: ${b.message}`;
      return null;
    },
  );

  await test(
    "Reject bank account with invalid account_type",
    "POST",
    `${API}/receivers/${receiverId}/bank-accounts`,
    {
      type: "ach",
      beneficiary_name: "John Doe",
      routing_number: "021000021",
      account_number: "123456789",
      account_type: "credit",
    },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("account_type")) return `Missing hint: ${b.message}`;
      return null;
    },
  );

  await test(
    "Reject bank account with invalid recipient_relationship",
    "POST",
    `${API}/receivers/${receiverId}/bank-accounts`,
    {
      type: "ach",
      beneficiary_name: "John Doe",
      routing_number: "021000021",
      account_number: "123456789",
      recipient_relationship: "friend",
    },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("recipient_relationship")) return `Missing hint: ${b.message}`;
      return null;
    },
  );

  // ==================== VIRTUAL ACCOUNTS ====================

  await test(
    "Get virtual accounts for created receiver",
    "GET",
    `${API}/receivers/${receiverId}/virtual-accounts`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!Array.isArray(b) || b.length === 0) return "Expected non-empty array";
      const va = b[0];
      if (!va.us?.ach?.routing_number) return "Missing ACH routing number";
      if (!va.us?.wire?.routing_number) return "Missing wire routing number";
      if (!va.us?.swift_bic_code) return "Missing SWIFT BIC code";
      if (va.kyc_status !== "approved") return `Wrong kyc: ${va.kyc_status}`;
      return null;
    },
  );

  await test(
    "Return 404 for virtual accounts on unknown receiver",
    "GET",
    `${API}/receivers/rc_nonexistent/virtual-accounts`,
    undefined,
    (s, b: any) => {
      if (s !== 404) return `Expected 404, got ${s}`;
      return null;
    },
  );

  // ==================== BLOCKCHAIN WALLETS ====================

  await test(
    "Create blockchain wallet",
    "POST",
    `${API}/receivers/${receiverId}/blockchain-wallets`,
    {
      name: "E2E Wallet",
      address: "0x" + "b".repeat(40),
      network: "polygon",
      is_account_abstraction: false,
    },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!b.id?.startsWith("bw_")) return `Bad id: ${b.id}`;
      if (b.network !== "polygon") return `Wrong network: ${b.network}`;
      if (b.is_account_abstraction !== false) return "Expected AA=false";
      return null;
    },
  );

  await test(
    "Create blockchain wallet with account-abstraction=true",
    "POST",
    `${API}/receivers/${receiverId}/blockchain-wallets`,
    {
      name: "AA Wallet",
      address: "0x" + "c".repeat(40),
      network: "base",
      is_account_abstraction: true,
    },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.is_account_abstraction !== true) return "Expected AA=true";
      if (b.network !== "base") return `Wrong network: ${b.network}`;
      return null;
    },
  );

  await test(
    "List blockchain wallets for receiver",
    "GET",
    `${API}/receivers/${receiverId}/blockchain-wallets`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!Array.isArray(b)) return "Expected array";
      if (b.length !== 2) return `Expected 2 wallets, got ${b.length}`;
      return null;
    },
  );

  await test(
    "Return 404 for blockchain wallets on unknown receiver",
    "GET",
    `${API}/receivers/rc_nonexistent/blockchain-wallets`,
    undefined,
    (s, b: any) => {
      if (s !== 404) return `Expected 404, got ${s}`;
      return null;
    },
  );

  await test(
    "Return 404 creating wallet on unknown receiver",
    "POST",
    `${API}/receivers/rc_nonexistent/blockchain-wallets`,
    {
      name: "Bad Wallet",
      address: "0x" + "d".repeat(40),
      network: "polygon",
    },
    (s, b: any) => {
      if (s !== 404) return `Expected 404, got ${s}`;
      return null;
    },
  );

  await test(
    "Reject blockchain wallet without name",
    "POST",
    `${API}/receivers/${receiverId}/blockchain-wallets`,
    {
      address: "0x" + "d".repeat(40),
      network: "polygon",
    },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("name")) return `Missing hint: ${b.message}`;
      return null;
    },
  );

  await test(
    "Reject blockchain wallet with invalid address",
    "POST",
    `${API}/receivers/${receiverId}/blockchain-wallets`,
    {
      name: "Bad Wallet",
      address: "not-an-address",
      network: "polygon",
    },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("address")) return `Missing hint: ${b.message}`;
      return null;
    },
  );

  await test(
    "Reject blockchain wallet with non-boolean is_account_abstraction",
    "POST",
    `${API}/receivers/${receiverId}/blockchain-wallets`,
    {
      name: "Bad AA Wallet",
      address: "0x" + "e".repeat(40),
      network: "polygon",
      is_account_abstraction: "yes",
    },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("is_account_abstraction")) return `Missing hint: ${b.message}`;
      return null;
    },
  );

  // ==================== PAYIN FLOW ====================

  let quoteId: string | undefined;
  await test(
    "Create payin quote",
    "POST",
    `${API}/payin-quotes`,
    {
      blockchain_wallet_id: "bw_test",
      currency_type: "sender",
      request_amount: 50000,
      payment_method: "ach",
      token: "USDC",
    },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!b.id?.startsWith("qu_")) return `Bad id: ${b.id}`;
      if (b.sender_amount !== 50000) return `Wrong sender_amount: ${b.sender_amount}`;
      if (b.receiver_amount >= b.sender_amount) return "Receiver >= sender (no fee?)";
      quoteId = b.id;
      return null;
    },
  );

  // Payin quote validation tests
  await test(
    "Reject payin quote without blockchain_wallet_id",
    "POST",
    `${API}/payin-quotes`,
    { payment_method: "ach", token: "USDC", request_amount: 10000 },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("blockchain_wallet_id")) return `Missing hint: ${b.message}`;
      return null;
    },
  );

  await test(
    "Reject payin quote with invalid token",
    "POST",
    `${API}/payin-quotes`,
    {
      blockchain_wallet_id: "bw_test",
      payment_method: "ach",
      token: "BTC",
      request_amount: 10000,
    },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("token")) return `Missing hint: ${b.message}`;
      return null;
    },
  );

  await test(
    "Reject payin quote below minimum amount",
    "POST",
    `${API}/payin-quotes`,
    {
      blockchain_wallet_id: "bw_test",
      payment_method: "ach",
      token: "USDC",
      request_amount: 500,
    },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("1000")) return `Missing min hint: ${b.message}`;
      return null;
    },
  );

  // Initiate payin
  let payinId: string | undefined;
  await test(
    "Initiate payin (EVM)",
    "POST",
    `${API}/payins/evm`,
    { payin_quote_id: quoteId ?? "qu_fallback" },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!b.id?.startsWith("pi_")) return `Bad id: ${b.id}`;
      if (b.status !== "processing") return `Expected processing, got ${b.status}`;
      if (!b.blindpay_bank_details?.routing_number) return "Missing bank details";
      if (!b.memo_code) return "Missing memo_code";
      if (b.sender_amount !== 50000) return `Payin should inherit quote amount, got ${b.sender_amount}`;
      payinId = b.id;
      return null;
    },
  );

  await test(
    "Reject payin without quote_id",
    "POST",
    `${API}/payins/evm`,
    {},
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      return null;
    },
  );

  await test(
    "Reject payin with unknown quote_id",
    "POST",
    `${API}/payins/evm`,
    { payin_quote_id: "qu_does_not_exist" },
    (s, b: any) => {
      if (s !== 404) return `Expected 404, got ${s}`;
      return null;
    },
  );

  // --- Status lifecycle tests ---

  await test(
    "Payin status is processing after creation",
    "GET",
    `${API}/payins/${payinId}`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.status !== "processing") return `Expected processing, got ${b.status}`;
      return null;
    },
  );

  await test(
    "Return 404 for unknown payin",
    "GET",
    `${API}/payins/pi_does_not_exist`,
    undefined,
    (s, b: any) => {
      if (s !== 404) return `Expected 404, got ${s}`;
      return null;
    },
  );

  // ==================== ADMIN ENDPOINTS ====================

  await test(
    "Admin: complete payin",
    "POST",
    `${ADMIN}/payins/${payinId}/complete`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.payin_status !== "completed") return `Expected completed, got ${b.payin_status}`;
      return null;
    },
    { "Content-Type": "application/json" },
  );

  await test(
    "Payin status is completed after admin complete",
    "GET",
    `${API}/payins/${payinId}`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.status !== "completed") return `Expected completed, got ${b.status}`;
      return null;
    },
  );

  // Create another payin for reject test
  let quoteId2: string | undefined;
  let payinId2: string | undefined;
  await test(
    "Create second payin quote",
    "POST",
    `${API}/payin-quotes`,
    {
      blockchain_wallet_id: "bw_test",
      currency_type: "sender",
      request_amount: 20000,
      payment_method: "ach",
      token: "USDT",
    },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      quoteId2 = b.id;
      return null;
    },
  );

  await test(
    "Initiate second payin",
    "POST",
    `${API}/payins/evm`,
    { payin_quote_id: quoteId2 },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.token !== "USDT") return `Should inherit token from quote, got ${b.token}`;
      payinId2 = b.id;
      return null;
    },
  );

  await test(
    "Admin: reject payin",
    "POST",
    `${ADMIN}/payins/${payinId2}/reject`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.payin_status !== "failed") return `Expected failed, got ${b.payin_status}`;
      return null;
    },
    { "Content-Type": "application/json" },
  );

  await test(
    "Admin: return 404 for unknown payin",
    "POST",
    `${ADMIN}/payins/pi_nonexistent/complete`,
    undefined,
    (s, b: any) => {
      if (s !== 404) return `Expected 404, got ${s}`;
      return null;
    },
    { "Content-Type": "application/json" },
  );

  // ==================== ADMIN RESET ====================

  await test(
    "Admin: reset all state",
    "POST",
    `${ADMIN}/reset`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.status !== "ok") return `Expected ok, got ${b.status}`;
      return null;
    },
    { "Content-Type": "application/json" },
  );

  await test(
    "Receiver gone after reset",
    "GET",
    `${API}/receivers/${individualReceiverId}`,
    undefined,
    (s, b: any) => {
      if (s !== 404) return `Expected 404 after reset, got ${s}`;
      return null;
    },
  );

  await test(
    "Payin gone after reset",
    "GET",
    `${API}/payins/${payinId}`,
    undefined,
    (s, b: any) => {
      if (s !== 404) return `Expected 404 after reset, got ${s}`;
      return null;
    },
  );

  // ==================== PAYOUT FX RATE ====================

  await test(
    "Get payout FX rate",
    "POST",
    `${API}/quotes/fx`,
    {
      currency_type: "sender",
      from: "USDC",
      to: "USD",
      request_amount: 100000,
    },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (typeof b.result_amount !== "number") return "Missing result_amount";
      if (b.result_amount >= 100000) return "Result >= request (no fee?)";
      return null;
    },
  );

  await test(
    "Reject FX quote without currencies",
    "POST",
    `${API}/quotes/fx`,
    { request_amount: 10000 },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      return null;
    },
  );

  await test(
    "Reject FX quote with invalid from currency",
    "POST",
    `${API}/quotes/fx`,
    { from: "BTC", to: "USD", request_amount: 10000 },
    (s, b: any) => {
      if (s !== 400) return `Expected 400, got ${s}`;
      if (!b.message?.includes("from")) return `Missing hint: ${b.message}`;
      return null;
    },
  );

  // ==================== AUTH CHECK ====================

  try {
    const res = await fetch(`${API}/payin-quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    results.push({
      name: "Reject request without Bearer token",
      passed: res.status === 401,
      status: res.status,
      body: json,
      error: res.status !== 401 ? `Expected 401, got ${res.status}` : undefined,
    });
  } catch (e) {
    results.push({
      name: "Reject request without Bearer token",
      passed: false,
      status: 0,
      body: null,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ==================== REPORT ====================

  console.log("\n" + "=".repeat(60));
  console.log("FAKE-BLINDPAY ENDPOINT TEST REPORT");
  console.log("=".repeat(60) + "\n");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const r of results) {
    const icon = r.passed ? "PASS" : "FAIL";
    console.log(`[${icon}] ${r.name} (HTTP ${r.status})`);
    if (r.error) console.log(`       Error: ${r.error}`);
  }

  console.log("\n" + "-".repeat(60));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log("-".repeat(60));

  if (failed > 0) {
    console.log("\nFailed test details:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`\n  ${r.name}:`);
      console.log(`    Status: ${r.status}`);
      console.log(`    Error: ${r.error}`);
      console.log(
        `    Body: ${JSON.stringify(r.body, null, 2).slice(0, 500)}`,
      );
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

run();
