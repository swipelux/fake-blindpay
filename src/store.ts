import { genId } from "./ids";

// ── Receiver ────────────────────────────────────────────────

export const RECEIVER_KYC_STATUSES = [
  "verifying",
  "approved",
  "rejected",
  "deprecated",
  "pending_review",
  "awaiting_contract",
] as const;
export type ReceiverKycStatus = (typeof RECEIVER_KYC_STATUSES)[number];

export const RECEIVER_KYC_TYPES = ["light", "standard", "enhanced"] as const;
export type ReceiverKycType = (typeof RECEIVER_KYC_TYPES)[number];

export interface Receiver {
  id: string;
  type: "individual" | "business";
  first_name?: string;
  last_name?: string;
  business_name?: string;
  legal_name?: string;
  email: string;
  country: string;
  date_of_birth?: string | null;
  phone?: string | null;
  website?: string | null;
  tax_id?: string | null;
  doing_business_as?: string | null;
  status: string;
  kyc_status: ReceiverKycStatus;
  kyc_type: ReceiverKycType;
  instance_id: string;
  created_at: string;
  updated_at: string;
}

// ── Bank Account ────────────────────────────────────────────

export interface BankAccount {
  id: string;
  type: string;
  name: string;
  beneficiary_name: string;
  routing_number: string;
  account_number: string;
  account_type: string;
  account_class: string;
  status: string;
  recipient_relationship: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state_province_region: string;
  country: string;
  postal_code: string;
  receiver_id: string;
  created_at: string;
}

// ── Blockchain Wallet ───────────────────────────────────────

export interface BlockchainWallet {
  id: string;
  name: string;
  network: string;
  address: string;
  is_account_abstraction: boolean;
  receiver_id: string;
  signature_tx_hash: string | null;
}

// ── Quote ───────────────────────────────────────────────────

export interface Quote {
  id: string;
  blockchain_wallet_id: string;
  currency_type: string;
  request_amount: number;
  sender_amount: number;
  receiver_amount: number;
  flat_fee: number;
  payment_method: string;
  token: string;
  commercial_quotation: number;
  blindpay_quotation: number;
  billing_fee_amount: number;
  partner_fee_amount: number;
  expires_at: number;
}

// ── Payin ───────────────────────────────────────────────────

export type PayinStatus = "processing" | "on_hold" | "completed" | "failed" | "refunded";

export interface Payin {
  id: string;
  status: PayinStatus;
  quoteId: string;
  instanceId: string;
  receiverId: string;
  senderAmount: number;
  receiverAmount: number;
  token: string;
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
}

// ── Maps ────────────────────────────────────────────────────

const receivers = new Map<string, Receiver>();
const bankAccountsByReceiver = new Map<string, BankAccount[]>();
const blockchainWalletsByReceiver = new Map<string, BlockchainWallet[]>();
const quotes = new Map<string, Quote>();
const payins = new Map<string, Payin>();

// ── Receivers ───────────────────────────────────────────────

export function storeReceiver(receiver: Receiver): void {
  receivers.set(receiver.id, receiver);
}

export function getReceiver(id: string): Receiver | undefined {
  return receivers.get(id);
}

export function listReceivers(instanceId?: string): Receiver[] {
  const all = Array.from(receivers.values());
  if (!instanceId) return all;
  return all.filter((r) => r.instance_id === instanceId);
}

export function updateReceiver(
  id: string,
  partial: Partial<Pick<Receiver, "kyc_status" | "kyc_type" | "updated_at">>,
): Receiver | undefined {
  const existing = receivers.get(id);
  if (!existing) return undefined;
  const updated: Receiver = {
    ...existing,
    ...partial,
    updated_at: partial.updated_at ?? new Date().toISOString(),
  };
  receivers.set(id, updated);
  return updated;
}

// ── Bank Accounts ───────────────────────────────────────────

export function storeBankAccount(account: BankAccount): void {
  const list = bankAccountsByReceiver.get(account.receiver_id) ?? [];
  list.push(account);
  bankAccountsByReceiver.set(account.receiver_id, list);
}

export function getBankAccounts(receiverId: string): BankAccount[] {
  return bankAccountsByReceiver.get(receiverId) ?? [];
}

// ── Blockchain Wallets ──────────────────────────────────────

export function storeBlockchainWallet(wallet: BlockchainWallet): void {
  const list = blockchainWalletsByReceiver.get(wallet.receiver_id) ?? [];
  list.push(wallet);
  blockchainWalletsByReceiver.set(wallet.receiver_id, list);
}

export function getBlockchainWallets(receiverId: string): BlockchainWallet[] {
  return blockchainWalletsByReceiver.get(receiverId) ?? [];
}

// ── Quotes ──────────────────────────────────────────────────

export function storeQuote(quote: Quote): void {
  quotes.set(quote.id, quote);
}

export function getQuote(id: string): Quote | undefined {
  return quotes.get(id);
}

// ── Payins ──────────────────────────────────────────────────

export function storePayin(payin: Payin): void {
  payins.set(payin.id, payin);
}

export function getPayin(id: string): Payin | undefined {
  return payins.get(id);
}

export function updatePayinStatus(id: string, status: PayinStatus): Payin | undefined {
  const payin = payins.get(id);
  if (!payin) return undefined;
  payin.status = status;
  payin.updatedAt = new Date().toISOString();
  return payin;
}

// ── Reset ───────────────────────────────────────────────────

export function clearAll(): void {
  receivers.clear();
  bankAccountsByReceiver.clear();
  blockchainWalletsByReceiver.clear();
  quotes.clear();
  payins.clear();
}
