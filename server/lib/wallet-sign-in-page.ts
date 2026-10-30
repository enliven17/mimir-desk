/**
 * Adds "Connect wallet" above the framework's sign-in card.
 *
 * The sign-in shell hydrates `renderSignInPage` markup with the Toolkit
 * AuthPage, so anything extra inside that root would break hydration. The
 * wallet panel ships as a <template>; a tiny inline script runs during parse,
 * moves the panel in front of the root, removes itself and the template (so
 * hydration sees exactly the AuthPage markup), then loads
 * /wallet-sign-in.js, which owns the panel's behavior.
 */
import { renderAuthPage } from "@agent-native/toolkit/app/auth/server";
import type { AuthPageProps } from "@agent-native/core/shared/auth-page-types";

const PANEL = `
<style>
  /* Stack with the auth card instead of each taking a full viewport. */
  .mimir-wallet ~ #agent-native-auth-root .auth-page { min-height: 0; }
  .mimir-wallet { position: relative; z-index: 1; width: 100%; max-width: 400px; margin: 0 auto 1rem; padding: 1.5rem 2rem; background: #141414; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; font-family: inherit; }
  .mimir-wallet h2 { font-size: 1rem; font-weight: 600; color: #fff; margin-bottom: 0.25rem; }
  .mimir-wallet p { font-size: 0.8125rem; color: #888; margin-bottom: 1rem; line-height: 1.4; }
  .mimir-wallet .mw-buttons { display: grid; gap: 0.5rem; }
  .mimir-wallet button { width: 100%; padding: 0.625rem 0.75rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500; cursor: pointer; border: 1px solid rgba(255,255,255,0.12); background: transparent; color: #e5e5e5; }
  .mimir-wallet button.mw-primary { background: #fff; color: #000; border-color: #fff; }
  .mimir-wallet button:hover:not(:disabled) { opacity: 0.88; }
  .mimir-wallet button:disabled { opacity: 0.5; cursor: progress; }
  .mimir-wallet .mw-msg { min-height: 1rem; margin: 0.75rem 0 0; font-size: 0.8125rem; color: #888; }
  .mimir-wallet .mw-msg.mw-error { color: #f87171; }
  .mimir-wallet .mw-msg:empty { display: none; }
  .mimir-wallet .mw-or { margin: 1rem 0 0; text-align: center; font-size: 0.75rem; color: #666; }
</style>
<section class="mimir-wallet" aria-labelledby="mimir-wallet-title" data-auth-base="__BA__" data-next="__NEXT__">
  <h2 id="mimir-wallet-title">Sign in with your wallet</h2>
  <p>Sign one message to prove you hold the wallet. It moves no funds.</p>
  <div class="mw-buttons">
    <button type="button" class="mw-primary" data-mimir-wallet="solana">Connect wallet</button>
    <button type="button" data-mimir-wallet="evm" hidden>Connect EVM wallet</button>
  </div>
  <p class="mw-msg" role="status" aria-live="polite"></p>
  <p class="mw-or">or use email below</p>
</section>`;

function mountScript(scriptSrc: string): string {
  // Runs synchronously while the root is still being parsed.
  return `<script>(function(){var s=document.currentScript,t=document.getElementById("mimir-wallet-tpl"),r=document.getElementById("agent-native-auth-root");if(t&&r){r.parentNode.insertBefore(t.content.cloneNode(true),r);}if(t)t.remove();s.remove();var m=document.createElement("script");m.type="module";m.src=${JSON.stringify(scriptSrc)};document.head.appendChild(m);})();</script>`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Only same-origin app paths, never a full URL. */
function nextPath(props: AuthPageProps): string {
  const candidate = props.initialResumeHref || props.homePath || "/";
  return /^\/(?![/\\])/.test(candidate) ? candidate : "/";
}

export function renderWalletSignInPage(props: AuthPageProps): string {
  const base = props.appBasePath ?? "";
  const panel = PANEL.replace("__BA__", escapeAttr(`${base}/_agent-native/auth/ba`)).replace(
    "__NEXT__",
    escapeAttr(nextPath(props)),
  );
  return `${renderAuthPage(props)}<template id="mimir-wallet-tpl">${panel}</template>${mountScript(`${base}/wallet-sign-in.js`)}`;
}
