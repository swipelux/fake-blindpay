/**
 * End-to-end test script for fake-blindpay.
 * Starts the server, runs all endpoint tests, prints a report, and exits.
 */

const BASE = "http://localhost:3001";
const INSTANCE_ID = "inst_test123";
const API = `${BASE}/v1/instances/${INSTANCE_ID}`;
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
  path: string,
  body?: unknown,
  validate?: (status: number, body: unknown) => string | null,
) {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: HEADERS,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    const err = validate?.(res.status, json) ?? null;
    results.push({
      name,
      passed: res.status < 400 && !err,
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

  console.log("Running fake-blindpay endpoint tests...\n");

  // ---------- RECEIVERS ----------

  // Create individual receiver
  await test(
    "Create individual receiver",
    "POST",
    "/receivers",
    { first_name: "John", last_name: "Doe", email: "john@example.com" },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!b.id?.startsWith("rc_")) return `Bad id: ${b.id}`;
      if (b.type !== "individual") return `Expected individual, got ${b.type}`;
      return null;
    },
  );

  // Create business receiver
  await test(
    "Create business receiver",
    "POST",
    "/receivers",
    { business_name: "Acme Corp", email: "acme@example.com" },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!b.id?.startsWith("rc_")) return `Bad id: ${b.id}`;
      if (b.type !== "business") return `Expected business, got ${b.type}`;
      return null;
    },
  );

  const receiverId = "rc_test_receiver_001";

  // Get receiver
  await test(
    "Get receiver",
    "GET",
    `/receivers/${receiverId}`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.id !== receiverId) return `Bad id: ${b.id}`;
      return null;
    },
  );

  // ---------- BANK ACCOUNTS ----------

  await test(
    "Create bank account (ACH)",
    "POST",
    `/receivers/${receiverId}/bank-accounts`,
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
      return null;
    },
  );

  // ---------- VIRTUAL ACCOUNTS ----------

  await test(
    "Get virtual accounts",
    "GET",
    `/receivers/${receiverId}/virtual-accounts`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!Array.isArray(b) || b.length === 0) return "Expected non-empty array";
      const va = b[0];
      if (!va.us?.ach?.routing_number) return "Missing ACH routing number";
      if (!va.us?.wire?.routing_number) return "Missing wire routing number";
      if (!va.us?.swift_bic_code) return "Missing SWIFT BIC code";
      return null;
    },
  );

  // ---------- BLOCKCHAIN WALLETS ----------

  await test(
    "Get blockchain wallets",
    "GET",
    `/receivers/${receiverId}/blockchain-wallets`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!Array.isArray(b) || b.length === 0) return "Expected non-empty array";
      if (!b[0].address) return "Missing wallet address";
      return null;
    },
  );

  await test(
    "Create blockchain wallet",
    "POST",
    `/receivers/${receiverId}/blockchain-wallets`,
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
      return null;
    },
  );

  // ---------- PAYIN FLOW ----------

  // Create payin quote
  let quoteId: string | undefined;
  await test(
    "Create payin quote",
    "POST",
    "/payin-quotes",
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

  // Initiate payin
  let payinId: string | undefined;
  await test(
    "Initiate payin (EVM)",
    "POST",
    "/payins/evm",
    { payin_quote_id: quoteId ?? "qu_fallback" },
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (!b.id?.startsWith("pi_")) return `Bad id: ${b.id}`;
      if (b.status !== "processing") return `Expected processing, got ${b.status}`;
      if (!b.blindpay_bank_details?.routing_number) return "Missing bank details";
      if (!b.memo_code) return "Missing memo_code";
      payinId = b.id;
      return null;
    },
  );

  // Get payin status
  await test(
    "Get payin status",
    "GET",
    `/payins/${payinId ?? "pi_fallback"}`,
    undefined,
    (s, b: any) => {
      if (s !== 200) return `Expected 200, got ${s}`;
      if (b.status !== "completed") return `Expected completed, got ${b.status}`;
      if (!b.blindpay_bank_details) return "Missing bank details on GET";
      return null;
    },
  );

  // ---------- PAYOUT FX RATE ----------

  await test(
    "Get payout FX rate",
    "POST",
    "/quotes/fx",
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

  // ---------- AUTH CHECK ----------

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

  // ---------- REPORT ----------

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
      console.log(`    Body: ${JSON.stringify(r.body, null, 2).slice(0, 500)}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

run();
