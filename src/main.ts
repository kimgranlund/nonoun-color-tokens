// Entry point: mount the HCT Palette Generator.
//
// The web component + its stylesheet live under `src/ui/` (app.js customElements.define's
// <ultimate-tokens> and pulls in the `./model.mjs` → `../engine/…` ES-module graph). We import them
// here and drop <ultimate-tokens> into the page; Vite resolves and bundles the graph.
import "./ui/styles.css";
import "./ui/app.js";
// flags.js is an intentionally-untyped pure engine module (the project keeps its JS engines vanilla, no
// .d.ts); import its pure mappers across the JS→TS seam. tsc has no declaration for it → implicit any here,
// which is exactly what we want (the engine owns the contract; it's unit-tested in test/engine/flags.mjs).
// @ts-expect-error -- no declaration file for the JS engine module, by design (self-clears if it ever gets one)
import { lemonActivation, lemonEntitlement, lemonDeactivation } from "./engine/flags.js";

// ── Pro licensing (WEB ONLY) ────────────────────────────────────────────────────────────────────────
// app.js exposes a pluggable license SEAM (el._licenseService) with an OFFLINE default, so the file stays
// network-free inside the offline Figma plugin bundle (manifest networkAccess:"none" — the bundle is rooted
// at app.js by scripts/bundle.mjs and NEVER includes this entry). Here in the WEB entry we assign the REAL
// service that talks to Lemon Squeezy's public License API: activate (consumes a SEAT, returns an instance
// id), validate (re-check), deactivate (frees the seat). No API key is needed — the license key itself is
// the credential, and these endpoints are designed for client-side use. The pure response→result mapping
// lives in the engine (lemonActivation/lemonEntitlement/lemonDeactivation — unit-tested); this is the fetch.
type LicenseResult = { ok: boolean; entitlement?: { status: string; expiresAt?: number }; instanceId?: string; error?: string };
type LicenseService = {
  activate: (key: string, instanceName: string) => Promise<LicenseResult>;
  validate: (key: string, instanceId?: string) => Promise<LicenseResult>;
  deactivate: (key: string, instanceId: string) => Promise<{ ok: boolean }>;
};
type LicensedElement = HTMLElement & { _licenseService?: LicenseService; revalidateLicense?: () => void };

// PIN activation to the Ultimate Tokens Lemon Squeezy store (id 420293) — the mappers are FAIL-CLOSED on this, so a
// valid key issued by any OTHER store is rejected. null would accept any active key from any store.
const LEMON_STORE_ID: number | null = 420293;
// PIN to OUR products too (Pro 1182548 · Studio 1182535) — layered on the store pin, so even a key for a
// DIFFERENT product in the same store is rejected (FAIL-CLOSED). null/[] would accept any product's key.
const LEMON_PRODUCT_IDS: number[] | null = [1182548, 1182535];
const LEMON_LICENSE_API = "https://api.lemonsqueezy.com/v1/licenses";

async function lsPost(path: string, params: Record<string, string>): Promise<unknown> {
  const resp = await fetch(`${LEMON_LICENSE_API}/${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(10000), // bound the round-trip so activate/validate can't hang the UI
  });
  // 5xx is a transient server error — throw so callers treat it as a network failure (no false downgrade on
  // revalidate). A 4xx still carries a meaningful JSON body (e.g. an invalid/expired key) — parse it.
  if (resp.status >= 500) throw new Error(`license service responded ${resp.status}`);
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

const lemonSqueezyLicenseService: LicenseService = {
  async activate(key, instanceName) {
    return lemonActivation(await lsPost("activate", { license_key: key, instance_name: instanceName }), { storeId: LEMON_STORE_ID, productIds: LEMON_PRODUCT_IDS });
  },
  async validate(key, instanceId) {
    const params: Record<string, string> = { license_key: key };
    if (instanceId) params.instance_id = instanceId;
    return lemonEntitlement(await lsPost("validate", params), { storeId: LEMON_STORE_ID, productIds: LEMON_PRODUCT_IDS });
  },
  async deactivate(key, instanceId) {
    return lemonDeactivation(await lsPost("deactivate", { license_key: key, instance_id: instanceId }));
  },
};

const root = document.querySelector<HTMLElement>("#app");
if (root) {
  root.innerHTML = "<ultimate-tokens></ultimate-tokens>";
  // The element upgrades synchronously on innerHTML (app.js already ran customElements.define), so it's
  // present here; swap its offline default seam for the real Lemon-Squeezy service before any user action.
  const el = root.querySelector("ultimate-tokens") as LicensedElement | null;
  if (el) {
    el._licenseService = lemonSqueezyLicenseService;
    // boot re-check of an activated license against LS (refresh entitlement + live seat count; downgrade if
    // the seat/subscription was revoked). Runs only here in the web entry → never in the offline plugin.
    el.revalidateLicense?.();
  }
}
