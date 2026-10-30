/**
 * Better Auth plugin: sign in with a Mimir wallet proof.
 *
 *   POST {ba}/wallet/nonce   { wallet }                              -> { nonce, expiresAt }
 *   POST {ba}/sign-in/wallet { wallet, signedAt, nonce, signature }  -> session cookie
 *
 * `{ba}` is the framework's Better Auth base path (/_agent-native/auth/ba).
 * The wallet is the identity: an `account` row (providerId "wallet",
 * accountId = canonical address). The user's email is a synthetic label,
 * <address>@wallet.mimirmarkets.xyz, which email sign-up may not claim.
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import {
  isWalletEmail,
  issueWalletNonce,
  shortWallet,
  verifyWalletSignIn,
  walletEmail,
  type WalletNonceStore,
  type WalletSignInError,
} from "./wallet-proof";

const PROVIDER_ID = "wallet";
const NONCE_PREFIX = "mimir-wallet-nonce:";

const ERROR_MESSAGES: Record<WalletSignInError, string> = {
  invalid_wallet: "That is not a Solana or EVM wallet address.",
  invalid_request: "The sign-in request is malformed.",
  invalid_nonce: "This sign-in request was already used or is unknown. Try again.",
  expired: "This sign-in request expired. Try again.",
  invalid_signature: "The wallet signature does not match.",
};

// Paths where an email address is claimed without a wallet.
const EMAIL_CLAIM_PATHS = new Set([
  "/sign-up/email",
  "/sign-in/magic-link",
  "/change-email",
]);

type InternalAdapter = {
  createVerificationValue(data: {
    identifier: string;
    value: string;
    expiresAt: Date;
  }): Promise<unknown>;
  consumeVerificationValue(
    identifier: string,
  ): Promise<{ value: string; expiresAt: Date | string } | null>;
};

function nonceStore(adapter: InternalAdapter): WalletNonceStore {
  return {
    async issue(nonce, wallet, expiresAt) {
      await adapter.createVerificationValue({
        identifier: `${NONCE_PREFIX}${nonce}`,
        value: wallet,
        expiresAt,
      });
    },
    async consume(nonce) {
      const row = await adapter.consumeVerificationValue(`${NONCE_PREFIX}${nonce}`);
      return row ? { wallet: row.value, expiresAt: new Date(row.expiresAt) } : null;
    },
  };
}

export function mimirWalletAuth() {
  return {
    id: "mimir-wallet",
    endpoints: {
      walletNonce: createAuthEndpoint(
        "/wallet/nonce",
        {
          method: "POST",
          body: z.object({ wallet: z.string().max(64) }).strict(),
        },
        async (ctx) => {
          const store = nonceStore(ctx.context.internalAdapter as InternalAdapter);
          const issued = await issueWalletNonce(store, ctx.body.wallet);
          if (!issued.ok) {
            throw APIError.from("BAD_REQUEST", {
              code: "INVALID_WALLET",
              message: ERROR_MESSAGES.invalid_wallet,
            });
          }
          return ctx.json({ nonce: issued.nonce, expiresAt: issued.expiresAt });
        },
      ),
      signInWallet: createAuthEndpoint(
        "/sign-in/wallet",
        {
          method: "POST",
          body: z
            .object({
              wallet: z.string().max(64),
              signedAt: z.number().int(),
              nonce: z.string().max(64),
              signature: z.string().max(200),
            })
            .strict(),
          requireRequest: true,
        },
        async (ctx) => {
          const { internalAdapter } = ctx.context;
          const result = await verifyWalletSignIn(
            nonceStore(internalAdapter as InternalAdapter),
            ctx.body,
          );
          if (!result.ok) {
            throw APIError.from(
              result.error === "invalid_wallet" || result.error === "invalid_request"
                ? "BAD_REQUEST"
                : "UNAUTHORIZED",
              {
                code: result.error.toUpperCase(),
                message: ERROR_MESSAGES[result.error],
              },
            );
          }
          const { wallet } = result;

          let user;
          const owner = await internalAdapter.findAccountOwnerByKey({
            providerId: PROVIDER_ID,
            accountId: wallet.address,
          });
          if (owner) {
            user = owner.kind === "owned" ? owner.user : null;
          } else {
            const email = walletEmail(wallet);
            // A user holding the wallet email without the wallet account was
            // not created here; never hand it to whoever signs.
            if (await internalAdapter.findUserByEmail(email)) {
              throw APIError.from("FORBIDDEN", {
                code: "WALLET_EMAIL_TAKEN",
                message: "This wallet's account cannot be used for wallet sign-in.",
              });
            }
            user = await internalAdapter.createUser(
              { email, name: shortWallet(wallet), emailVerified: true },
              { method: "mimir-wallet" },
            );
            await internalAdapter.createAccount({
              userId: user.id,
              providerId: PROVIDER_ID,
              accountId: wallet.address,
            });
          }
          if (!user) {
            throw APIError.from("UNAUTHORIZED", {
              code: "WALLET_USER_MISSING",
              message: "The account for this wallet no longer exists.",
            });
          }

          const session = await internalAdapter.createSession(user.id);
          if (!session) {
            throw APIError.from("INTERNAL_SERVER_ERROR", {
              code: "SESSION_FAILED",
              message: "Could not start a session.",
            });
          }
          await setSessionCookie(ctx, { session, user });
          return ctx.json({
            success: true,
            user: { id: user.id, name: user.name, wallet: wallet.address, kind: wallet.kind },
          });
        },
      ),
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => EMAIL_CLAIM_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as { email?: unknown; newEmail?: unknown } | undefined;
            if (isWalletEmail(body?.email) || isWalletEmail(body?.newEmail)) {
              throw APIError.from("BAD_REQUEST", {
                code: "WALLET_EMAIL_RESERVED",
                message: "Wallet addresses sign in with their wallet.",
              });
            }
          }),
        },
      ],
    },
    rateLimit: [
      {
        pathMatcher: (path) => path === "/wallet/nonce" || path === "/sign-in/wallet",
        window: 60,
        max: 20,
      },
    ],
  } satisfies BetterAuthPlugin;
}
