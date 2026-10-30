import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

import { mimirWalletAuth } from "../lib/wallet-auth";
import { renderWalletSignInPage } from "../lib/wallet-sign-in-page";

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  rootAuth: true,
  marketing: false,
  renderSignInPage: renderWalletSignInPage,
  betterAuth: { plugins: [mimirWalletAuth()] },
});
