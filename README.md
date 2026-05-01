Fake contract-driven implementation for small subset of Blindpay API, exclusively serving the purpose of isolated testing.

Paste this to you .env of wallet-infrastructure:
BLINDPAY_API_URL=https://fake-blindpay.lemongrass-7e22f2d4.eastus.azurecontainerapps.io

to imitate blindpay under the hood

## OpenAPI reference

The contract this fake implements is documented in `reference/blindpay-openapi.json` (BlindPay API v1.0.0). The fake covers a small subset of the spec — receivers (list, get, create), bank accounts, virtual accounts, blockchain wallets, payin quotes, payins, FX quotes, and admin helpers for tests.

## Fixture receivers

On startup, fake-blindpay seeds a fixed set of receivers used by the wallet-infrastructure name-match guardrails. They survive `POST /admin/reset`. See `src/seed.ts` for the canonical list. Statuses are exposed only via the official `kyc_status` field; ids and names are status-agnostic.
