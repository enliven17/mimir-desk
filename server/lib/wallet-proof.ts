/**
 * Wallet sign-in proof, the same statement Mimir uses (mimirmarkets.xyz
 * lib/wallet-proof.ts) plus a server-issued, single-use nonce so a captured
 * signature cannot be replayed for a login:
 *
 *   Mimir wallet proof
 *   wallet: <base58 pubkey | 0x address>
 *   signedAt: <ms>
 *   nonce: <nonce>
 *   This only proves you control this wallet. It moves no funds.
 *
 * Solana signs ed25519 (wallet `signMessage`, signature base58). EVM signs
 * EIP-191 personal_sign (0x hex, 65 bytes). Plain EOAs only: no ERC-1271.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { base58 } from "@scure/base";

export const WALLET_NONCE_TTL_MS = 5 * 60 * 1000;
/** Allowed clock skew for `signedAt` ahead of the server. */
export const WALLET_CLOCK_SKEW_MS = 60 * 1000;
export const WALLET_EMAIL_DOMAIN = "wallet.mimirmarkets.xyz";

export type WalletKind = "solana" | "evm";
export interface Wallet {
  kind: WalletKind;
  /** Canonical form: base58 as given (case matters), EVM lowercased. */
  address: string;
}

const NONCE_RE = /^[A-Za-z0-9]{24,64}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const EVM_SIG_RE = /^0x[0-9a-fA-F]{130}$/;

export function walletSignInMessage(
  wallet: string,
  signedAt: number,
  nonce: string,
): string {
  return [
    "Mimir wallet proof",
    `wallet: ${wallet}`,
    `signedAt: ${signedAt}`,
    `nonce: ${nonce}`,
    "This only proves you control this wallet. It moves no funds.",
  ].join("\n");
}

/** A Solana public key (32 bytes, base58) or an EVM address, else null. */
export function parseWallet(raw: unknown): Wallet | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (EVM_RE.test(value)) return { kind: "evm", address: value.toLowerCase() };
  if (!BASE58_RE.test(value)) return null;
  try {
    if (base58.decode(value).length !== 32) return null;
  } catch {
    return null;
  }
  return { kind: "solana", address: value };
}

export function isWalletNonce(raw: unknown): raw is string {
  return typeof raw === "string" && NONCE_RE.test(raw);
}

export function newWalletNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/** Synthetic account email: a label only, the wallet account row is the identity. */
export function walletEmail(wallet: Wallet): string {
  return `${wallet.address.toLowerCase()}@${WALLET_EMAIL_DOMAIN}`;
}

export function shortWallet(wallet: Wallet): string {
  const a = wallet.address;
  return `${a.slice(0, wallet.kind === "evm" ? 6 : 4)}…${a.slice(-4)}`;
}

export function isWalletEmail(email: unknown): boolean {
  return (
    typeof email === "string" &&
    email.trim().toLowerCase().endsWith(`@${WALLET_EMAIL_DOMAIN}`)
  );
}

/** True when `signature` is the wallet's signature of `message`. Never throws. */
export function verifyWalletSignature(
  wallet: Wallet,
  message: string,
  signature: unknown,
): boolean {
  if (typeof signature !== "string") return false;
  try {
    return wallet.kind === "solana"
      ? verifySolana(wallet.address, message, signature)
      : verifyEvm(wallet.address, message, signature);
  } catch {
    return false;
  }
}

function verifySolana(address: string, message: string, signature: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) return false;
  const sig = base58.decode(signature);
  if (sig.length !== 64) return false;
  return ed25519.verify(sig, utf8ToBytes(message), base58.decode(address));
}

function verifyEvm(address: string, message: string, signature: string) {
  if (!EVM_SIG_RE.test(signature)) return false;
  const raw = hexToBytes(signature.slice(2));
  const v = raw[64] ?? -1;
  const recovery = v >= 27 ? v - 27 : v;
  if (recovery !== 0 && recovery !== 1) return false;
  const msg = utf8ToBytes(message);
  const digest = keccak_256(
    new Uint8Array([
      ...utf8ToBytes(`\x19Ethereum Signed Message:\n${msg.length}`),
      ...msg,
    ]),
  );
  const recovered = new Uint8Array([recovery, ...raw.subarray(0, 64)]);
  const pub = secp256k1.recoverPublicKey(recovered, digest, { prehash: false });
  const uncompressed = secp256k1.Point.fromBytes(pub).toBytes(false);
  const signer = `0x${bytesToHex(keccak_256(uncompressed.subarray(1)).subarray(-20))}`;
  return signer === address.toLowerCase();
}

/** Single-use nonce storage, bound to the wallet it was issued for. */
export interface WalletNonceStore {
  issue(nonce: string, wallet: string, expiresAt: Date): Promise<void>;
  /** Atomically removes and returns the nonce row, or null when absent. */
  consume(nonce: string): Promise<{ wallet: string; expiresAt: Date } | null>;
}

export type WalletSignInError =
  | "invalid_wallet"
  | "invalid_request"
  | "invalid_nonce"
  | "expired"
  | "invalid_signature";

export interface WalletSignInInput {
  wallet: unknown;
  signedAt: unknown;
  nonce: unknown;
  signature: unknown;
}

export async function issueWalletNonce(
  store: WalletNonceStore,
  rawWallet: unknown,
  now = Date.now(),
): Promise<
  { ok: true; nonce: string; expiresAt: number } | { ok: false; error: "invalid_wallet" }
> {
  const wallet = parseWallet(rawWallet);
  if (!wallet) return { ok: false, error: "invalid_wallet" };
  const nonce = newWalletNonce();
  const expiresAt = now + WALLET_NONCE_TTL_MS;
  await store.issue(nonce, wallet.address, new Date(expiresAt));
  return { ok: true, nonce, expiresAt };
}

/**
 * Checks a sign-in attempt at the trust boundary: address format, nonce
 * (consumed whatever the outcome, so it is single-use), expiry, signature.
 */
export async function verifyWalletSignIn(
  store: WalletNonceStore,
  input: WalletSignInInput,
  now = Date.now(),
): Promise<{ ok: true; wallet: Wallet } | { ok: false; error: WalletSignInError }> {
  const wallet = parseWallet(input.wallet);
  if (!wallet) return { ok: false, error: "invalid_wallet" };
  if (!isWalletNonce(input.nonce)) return { ok: false, error: "invalid_nonce" };
  const signedAt = input.signedAt;
  if (typeof signedAt !== "number" || !Number.isSafeInteger(signedAt)) {
    return { ok: false, error: "invalid_request" };
  }
  const issued = await store.consume(input.nonce);
  if (!issued || issued.wallet !== wallet.address) {
    return { ok: false, error: "invalid_nonce" };
  }
  if (
    issued.expiresAt.getTime() <= now ||
    signedAt > now + WALLET_CLOCK_SKEW_MS ||
    now - signedAt > WALLET_NONCE_TTL_MS
  ) {
    return { ok: false, error: "expired" };
  }
  // Sign over the address exactly as the wallet reported it (EVM checksum case).
  const signedWallet = (input.wallet as string).trim();
  const message = walletSignInMessage(signedWallet, signedAt, input.nonce);
  if (!verifyWalletSignature(wallet, message, input.signature)) {
    return { ok: false, error: "invalid_signature" };
  }
  return { ok: true, wallet };
}
