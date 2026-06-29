// flags.js — the feature-flag + entitlement SUBSTRATE (item 7, Layer 1). Pure, no DOM, no storage, no
// network. Resolves what a user is entitled to from their per-machine `profile` ({ tier, flagOverrides }).
// The SINGLE place a gate is decided — every gated surface reads `flagOf(flags, key)`, never a raw
// `tier === "pro"` check, so the line moves in one place. Flags are BOOLEAN or VALUED (a numeric cap).
//
// Layers (build order): (1) THIS substrate — engine + persisted profile + the resolver (tier hardcoded
// free, zero payment code); (2) entitlement — a Lemon-Squeezy license key, validated client-side in the
// WEB APP, flips tier→pro; (3) the Settings « Account » home. The offline Figma plugin stays free.

// The flag keys + their per-tier values (the product's Pro line, from the item-7 Ratified Design).
// `maxSets` is VALUED (the free brand-kit cap); the rest are boolean capability gates.
export const FLAG_KEYS = ["maxSets", "proExport", "advancedTreatments", "hostedMcp"];

export const TIER_FLAGS = {
  free: { maxSets: 2, proExport: false, advancedTreatments: false, hostedMcp: false },
  pro: { maxSets: Infinity, proExport: true, advancedTreatments: true, hostedMcp: true },
};

// Master enforcement switch. Ships FALSE pre-launch: with NO purchase path yet, gating a feature OFF would
// just remove it from current users — so everyone resolves to the UNLOCKED (pro) values until Layer 2 wires
// payment and the product flips this to true. (The free/pro split below is defined + tested now, ready.)
export const TIERS_ENFORCED = false;

// resolveFlags(profile, opts?) → the resolved flag map. base = the tier's values when enforced, else the
// unlocked (pro) values; then any explicit flagOverrides (dev / QA / early-access) win.
export function resolveFlags(profile = {}, { enforced = TIERS_ENFORCED } = {}) {
  const tier = profile && profile.tier === "pro" ? "pro" : "free";
  const base = enforced ? TIER_FLAGS[tier] || TIER_FLAGS.free : TIER_FLAGS.pro;
  const overrides = profile && profile.flagOverrides && typeof profile.flagOverrides === "object" ? profile.flagOverrides : {};
  const out = { ...base };
  for (const k of FLAG_KEYS) if (k in overrides) out[k] = overrides[k];
  return out;
}

// flagOf(flags, key) → the flag's value (boolean or number). A missing key falls back to the most
// RESTRICTIVE (free) value, so a malformed flags map can never accidentally unlock a gate.
export function flagOf(flags, key) {
  if (flags && key in flags) return flags[key];
  return key in TIER_FLAGS.free ? TIER_FLAGS.free[key] : false;
}

// clampProfile(raw) → a sanitized profile { tier, flagOverrides? }. Unknown/invalid drops; default free;
// flagOverrides keeps only known keys with the right TYPE (maxSets = a finite int ≥ 0; the rest boolean).
// No payment fields here — licenseKey/entitlement/checkedAt arrive in Layer 2.
export function clampProfile(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const tier = p.tier === "pro" ? "pro" : "free";
  const fo = {};
  if (p.flagOverrides && typeof p.flagOverrides === "object") {
    for (const k of FLAG_KEYS) {
      if (!(k in p.flagOverrides)) continue;
      const v = p.flagOverrides[k];
      if (k === "maxSets") {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) fo[k] = Math.floor(n);
      } else if (typeof v === "boolean") fo[k] = v;
    }
  }
  return Object.keys(fo).length ? { tier, flagOverrides: fo } : { tier };
}
