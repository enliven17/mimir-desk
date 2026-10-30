import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { base58 } from "@scure/base";
import { describe, expect, it } from "vitest";

import {
  issueWalletNonce,
  parseWallet,
  verifyWalletSignIn,
  walletSignInMessage,
  WALLET_NONCE_TTL_MS,
  type WalletNonceStore,
} from "./wallet-proof";

function memoryStore(): WalletNonceStore {
  const rows = new Map<string, { wallet: string; expiresAt: Date }>();
  return {
    async issue(nonce, wallet, expiresAt) {
      rows.set(nonce, { wallet, expiresAt });
    },
    async consume(nonce) {
      const row = rows.get(nonce) ?? null;
      rows.delete(nonce);
      return row;
    },
  };
}

function solanaWallet() {
  const secret = ed25519.utils.randomSecretKey();
  const address = base58.encode(ed25519.getPublicKey(secret));
  const sign = (message: string) =>
    base58.encode(ed25519.sign(utf8ToBytes(message), secret));
  return { address, sign };
}

function evmWallet() {
  const secret = secp256k1.utils.randomSecretKey();
  const pub = secp256k1.getPublicKey(secret, false);
  const address = `0x${bytesToHex(keccak_256(pub.subarray(1)).subarray(-20))}`;
  const sign = (message: string) => {
    const msg = utf8ToBytes(message);
    const digest = keccak_256(
      new Uint8Array([
        ...utf8ToBytes(`\x19Ethereum Signed Message:\n${msg.length}`),
        ...msg,
      ]),
    );
    const sig = secp256k1.sign(digest, secret, {
      prehash: false,
      format: "recovered",
    });
    // noble puts the recovery byte first; Ethereum wants r || s || v (27/28).
    return `0x${bytesToHex(sig.subarray(1))}${(sig[0]! + 27).toString(16)}`;
  };
  return { address, sign };
}

async function signIn(
  wallet: { address: string; sign: (m: string) => string },
  store = memoryStore(),
  now = Date.now(),
) {
  const issued = await issueWalletNonce(store, wallet.address, now);
  if (!issued.ok) throw new Error(issued.error);
  const signedAt = now;
  const signature = wallet.sign(
    walletSignInMessage(wallet.address, signedAt, issued.nonce),
  );
  return { store, input: { wallet: wallet.address, signedAt, nonce: issued.nonce, signature } };
}

describe("wallet sign-in proof", () => {
  it("accepts a valid Solana signature", async () => {
    const { store, input } = await signIn(solanaWallet());
    const result = await verifyWalletSignIn(store, input);
    expect(result).toMatchObject({ ok: true, wallet: { kind: "solana" } });
  });

  it("accepts a valid EVM personal_sign signature", async () => {
    const { store, input } = await signIn(evmWallet());
    const result = await verifyWalletSignIn(store, input);
    expect(result).toMatchObject({ ok: true, wallet: { kind: "evm" } });
  });

  it("rejects a signature from another wallet", async () => {
    const victim = solanaWallet();
    const attacker = solanaWallet();
    const { store, input } = await signIn({ address: victim.address, sign: attacker.sign });
    expect(await verifyWalletSignIn(store, input)).toEqual({
      ok: false,
      error: "invalid_signature",
    });
  });

  it("rejects a signature over a different message", async () => {
    const wallet = solanaWallet();
    const { store, input } = await signIn(wallet);
    const tampered = { ...input, signedAt: input.signedAt - 1 };
    expect(await verifyWalletSignIn(store, tampered)).toEqual({
      ok: false,
      error: "invalid_signature",
    });
  });

  it("rejects an expired nonce", async () => {
    const issuedAt = Date.now() - WALLET_NONCE_TTL_MS - 1000;
    const { store, input } = await signIn(solanaWallet(), memoryStore(), issuedAt);
    expect(await verifyWalletSignIn(store, input)).toEqual({ ok: false, error: "expired" });
  });

  it("rejects a reused nonce", async () => {
    const { store, input } = await signIn(solanaWallet());
    expect((await verifyWalletSignIn(store, input)).ok).toBe(true);
    expect(await verifyWalletSignIn(store, input)).toEqual({
      ok: false,
      error: "invalid_nonce",
    });
  });

  it("burns the nonce even when the signature is wrong", async () => {
    const wallet = solanaWallet();
    const { store, input } = await signIn(wallet);
    const bad = { ...input, signature: solanaWallet().sign("x") };
    expect((await verifyWalletSignIn(store, bad)).ok).toBe(false);
    expect(await verifyWalletSignIn(store, input)).toEqual({
      ok: false,
      error: "invalid_nonce",
    });
  });

  it("rejects a nonce issued for another wallet", async () => {
    const store = memoryStore();
    const other = await signIn(solanaWallet(), store);
    const wallet = solanaWallet();
    const signature = wallet.sign(
      walletSignInMessage(wallet.address, other.input.signedAt, other.input.nonce),
    );
    const input = { ...other.input, wallet: wallet.address, signature };
    expect(await verifyWalletSignIn(store, input)).toEqual({
      ok: false,
      error: "invalid_nonce",
    });
  });

  it("rejects bad addresses", async () => {
    for (const bad of [
      "",
      "not-a-wallet",
      "0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl",
      "1111111111111111111111111111111",
      "0x1234",
      "0xZZ34567890123456789012345678901234567890",
      42,
      null,
    ]) {
      expect(parseWallet(bad)).toBeNull();
    }
    expect(await issueWalletNonce(memoryStore(), "nope")).toEqual({
      ok: false,
      error: "invalid_wallet",
    });
    const { store, input } = await signIn(solanaWallet());
    expect(await verifyWalletSignIn(store, { ...input, wallet: "nope" })).toEqual({
      ok: false,
      error: "invalid_wallet",
    });
  });
});
