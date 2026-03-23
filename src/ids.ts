import { randomBytes } from "crypto";

const prefixes = {
  quote: "qu",
  payin: "pi",
  receiver: "rc",
  bankAccount: "ba",
  blockchainWallet: "bw",
  virtualAccount: "va",
} as const;

type IdKind = keyof typeof prefixes;

export function genId(kind: IdKind): string {
  const prefix = prefixes[kind];
  const hex = randomBytes(12).toString("hex");
  return `${prefix}_${hex}`;
}
