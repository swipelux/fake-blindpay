import type { Receiver } from "./store";
import { storeReceiver, clearAll } from "./store";

/**
 * Fixture receivers seeded at startup. Stable ids so wallet-infra
 * guardrails can rely on a known list without leaking status into
 * the id (status is exposed only via the official `kyc_status` field).
 */
export const FIXTURE_INSTANCE_ID = "inst_test123";

export const FIXTURE_RECEIVERS: Receiver[] = [
  {
    id: "rc_fixture_001",
    type: "business",
    business_name: "Hevn Inc",
    legal_name: "Hevn Inc",
    email: "ops@hevn-inc.example",
    country: "US",
    status: "active",
    kyc_status: "approved",
    kyc_type: "standard",
    instance_id: FIXTURE_INSTANCE_ID,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rc_fixture_002",
    type: "business",
    business_name: "Acme Holdings Ltd",
    legal_name: "Acme Holdings Ltd",
    email: "ops@acme-holdings.example",
    country: "US",
    status: "active",
    kyc_status: "verifying",
    kyc_type: "standard",
    instance_id: FIXTURE_INSTANCE_ID,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rc_fixture_003",
    type: "business",
    business_name: "Globex Corporation",
    legal_name: "Globex Corporation",
    email: "ops@globex.example",
    country: "US",
    status: "active",
    kyc_status: "rejected",
    kyc_type: "standard",
    instance_id: FIXTURE_INSTANCE_ID,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rc_fixture_004",
    type: "individual",
    first_name: "John",
    last_name: "Doe",
    email: "john.doe@example.com",
    country: "US",
    status: "active",
    kyc_status: "approved",
    kyc_type: "standard",
    instance_id: FIXTURE_INSTANCE_ID,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

export function seedFixtureReceivers(): void {
  for (const r of FIXTURE_RECEIVERS) {
    storeReceiver(r);
  }
}

/** Clears all in-memory state then re-seeds the fixture. Used by POST /admin/reset. */
export function resetState(): void {
  clearAll();
  seedFixtureReceivers();
}
