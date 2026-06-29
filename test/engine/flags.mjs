#!/usr/bin/env node
// flags.mjs — verifier for the feature-flag substrate (src/engine/flags.js). Pure, no DOM.
import * as F from "../../src/engine/flags.js";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// ── the tier tables: every key has a free + pro value; maxSets is valued, the rest boolean ──
ok(F.FLAG_KEYS.length >= 1 && F.FLAG_KEYS.every((k) => k in F.TIER_FLAGS.free && k in F.TIER_FLAGS.pro), "every FLAG_KEY has a free + pro value");
ok(F.TIER_FLAGS.free.maxSets === 2 && F.TIER_FLAGS.pro.maxSets === Infinity, `free caps brand kits at 2; pro unlimited (got ${F.TIER_FLAGS.free.maxSets}/${F.TIER_FLAGS.pro.maxSets})`);
ok(F.TIER_FLAGS.free.proExport === false && F.TIER_FLAGS.pro.proExport === true, "proExport is a pro capability");

// ── resolveFlags ENFORCED: the tier drives the values ──
{
  const free = F.resolveFlags({ tier: "free" }, { enforced: true });
  const pro = F.resolveFlags({ tier: "pro" }, { enforced: true });
  ok(free.maxSets === 2 && free.proExport === false && free.hostedMcp === false, "enforced free → the free values");
  ok(pro.maxSets === Infinity && pro.proExport === true && pro.advancedTreatments === true, "enforced pro → the pro values");
  ok(F.resolveFlags({ tier: "nope" }, { enforced: true }).proExport === false, "an unknown tier resolves as free");
}

// ── resolveFlags UNENFORCED (pre-launch): everyone unlocked regardless of tier ──
{
  const f = F.resolveFlags({ tier: "free" }, { enforced: false });
  ok(f.maxSets === Infinity && f.proExport === true, "unenforced → unlocked (pro values) even for a free tier");
}

// ── the shipped switch is OFF — no feature gated before a purchase path exists (no regression today) ──
ok(F.TIERS_ENFORCED === false, "TIERS_ENFORCED ships false (pre-launch)");
ok(F.resolveFlags({ tier: "free" }).proExport === true && F.resolveFlags({ tier: "free" }).maxSets === Infinity, "with the default switch, a free user is fully unlocked (current behavior preserved)");

// ── overrides (dev / QA / early-access) win over the tier values ──
{
  const f = F.resolveFlags({ tier: "free", flagOverrides: { proExport: true, maxSets: 5 } }, { enforced: true });
  ok(f.proExport === true && f.maxSets === 5, "flagOverrides win over the tier values");
}

// ── flagOf: boolean + valued + the restrictive safe default ──
ok(F.flagOf({ proExport: true }, "proExport") === true, "flagOf returns a boolean flag");
ok(F.flagOf({ maxSets: 7 }, "maxSets") === 7, "flagOf returns a valued flag");
ok(F.flagOf({}, "proExport") === false && F.flagOf({}, "maxSets") === 2, "flagOf safe default = the restrictive (free) value");
ok(F.flagOf(null, "nope") === false, "flagOf unknown key / null flags → false");

// ── clampProfile: sanitize, default free, keep only known+typed overrides, no empty {} ──
ok(F.clampProfile(null).tier === "free" && !("flagOverrides" in F.clampProfile(null)), "clampProfile(null) → {tier:free} (no empty overrides object)");
ok(F.clampProfile({ tier: "pro" }).tier === "pro", "clampProfile keeps a valid pro tier");
ok(F.clampProfile({ tier: "garbage" }).tier === "free", "clampProfile drops an invalid tier → free");
{
  const c = F.clampProfile({ tier: "free", flagOverrides: { proExport: true, maxSets: 9.7, hostedMcp: "yes", maxSets2: 3, advancedTreatments: false } });
  ok(c.flagOverrides.proExport === true && c.flagOverrides.maxSets === 9 && c.flagOverrides.advancedTreatments === false, "clampProfile keeps valid overrides (maxSets floored to int)");
  ok(!("hostedMcp" in c.flagOverrides) && !("maxSets2" in c.flagOverrides), "clampProfile drops wrong-typed + unknown override keys");
  // round-trip: a clamped profile is idempotent through JSON
  ok(JSON.stringify(F.clampProfile(JSON.parse(JSON.stringify(c)))) === JSON.stringify(c), "a clamped profile round-trips through JSON unchanged");
}

if (fails.length) { console.error(`flags FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("flags PASS — tier tables · resolveFlags (enforced/unenforced) · flagOf (bool+valued+default) · clampProfile");
process.exit(0);
