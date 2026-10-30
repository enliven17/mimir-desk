// Wallet sign-in panel on the sign-in page (server/lib/wallet-sign-in-page.ts).
// Connect → server nonce → sign the Mimir wallet proof → session cookie.
// No dependencies: Phantom-style `window.solana` and injected `window.ethereum`.

const panel = document.querySelector(".mimir-wallet");
if (panel) init(panel);

function init(panel) {
  const authBase = panel.dataset.authBase || "/_agent-native/auth/ba";
  const next = /^\/(?![/\\])/.test(panel.dataset.next || "") ? panel.dataset.next : "/";
  const msg = panel.querySelector(".mw-msg");
  const buttons = [...panel.querySelectorAll("[data-mimir-wallet]")];
  const evmButton = panel.querySelector('[data-mimir-wallet="evm"]');
  if (window.ethereum) evmButton.hidden = false;

  const say = (text, isError = false) => {
    msg.textContent = text;
    msg.classList.toggle("mw-error", isError);
  };

  for (const button of buttons) {
    button.addEventListener("click", async () => {
      const kind = button.dataset.mimirWallet;
      buttons.forEach((b) => (b.disabled = true));
      try {
        say("Waiting for your wallet…");
        const signer = kind === "evm" ? await connectEvm() : await connectSolana();
        const { nonce } = await post("/wallet/nonce", { wallet: signer.address });
        const signedAt = Date.now();
        say("Sign the message in your wallet…");
        const signature = await signer.sign(proofMessage(signer.address, signedAt, nonce));
        say("Signing you in…");
        await post("/sign-in/wallet", { wallet: signer.address, signedAt, nonce, signature });
        window.location.assign(next);
      } catch (error) {
        say(friendly(error), true);
        buttons.forEach((b) => (b.disabled = false));
      }
    });
  }

  async function post(path, body) {
    const res = await fetch(`${authBase}${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    // The framework replaces auth error text with a generic message; map by status.
    if (res.status === 401) throw new Error("The wallet signature could not be verified. Try again.");
    if (res.status === 429) throw new Error("Too many attempts. Wait a minute, then try again.");
    if (res.status === 400) throw new Error("That wallet address is not supported.");
    throw new Error(data.message || `Sign-in failed (${res.status}).`);
  }
}

function proofMessage(wallet, signedAt, nonce) {
  return [
    "Mimir wallet proof",
    `wallet: ${wallet}`,
    `signedAt: ${signedAt}`,
    `nonce: ${nonce}`,
    "This only proves you control this wallet. It moves no funds.",
  ].join("\n");
}

async function connectSolana() {
  const provider = window.phantom?.solana ?? window.solflare ?? window.solana;
  if (!provider?.connect || !provider.signMessage) {
    window.open("https://phantom.com/download", "_blank", "noopener");
    throw new Error("No Solana wallet found. Install Phantom, then try again.");
  }
  const connected = await provider.connect();
  const publicKey = connected?.publicKey ?? provider.publicKey;
  if (!publicKey) throw new Error("The wallet did not share an address.");
  const address = publicKey.toString();
  return {
    address,
    async sign(message) {
      const result = await provider.signMessage(new TextEncoder().encode(message), "utf8");
      const signature = result?.signature ?? result;
      return base58(new Uint8Array(signature));
    },
  };
}

async function connectEvm() {
  const provider = window.ethereum;
  if (!provider?.request) throw new Error("No EVM wallet found.");
  const [address] = await provider.request({ method: "eth_requestAccounts" });
  if (!address) throw new Error("The wallet did not share an address.");
  return {
    address,
    sign(message) {
      const hex = [...new TextEncoder().encode(message)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return provider.request({ method: "personal_sign", params: [`0x${hex}`, address] });
    },
  };
}

function friendly(error) {
  const text = String(error?.message || error || "");
  if (error?.code === 4001 || /reject|denied|cancel/i.test(text)) return "Request cancelled in the wallet.";
  return text || "Wallet sign-in failed. Try again.";
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    out += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}
