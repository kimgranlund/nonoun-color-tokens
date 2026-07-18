#!/usr/bin/env node
// describe-kit-core.mjs — verifier for the PURE, deterministic describe-palette core (mcp/describe-kit-core.mjs,
// #369). Contract: docs/site/describe-palette-spec.md.
import { DOMAINS, hydrate } from "../../src/ui/persist.js";
import { brandKit, hexToOklch, seedFromKeyColor } from "../../src/ui/model.mjs";
import { PALETTE_BRIEF_SCHEMA, FAMILY_NAMES, SECONDARY_HARMONY_OFFSET, TERTIARY_ANALOGOUS_OFFSET, generateKit } from "../../mcp/describe-kit-core.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const paletteByName = (kit, name) => kit.palettes.find((p) => p.name === name);
const wrapHue = (h) => ((h % 360) + 360) % 360;

// ── the schema: shape + parity with persist's own DOMAINS (§4.4's "gate-verified" contract) ──
ok(PALETTE_BRIEF_SCHEMA.$id === "ultimate-tokens-palette-brief/1", "schema carries its $id");
ok(PALETTE_BRIEF_SCHEMA.required.includes("families") && PALETTE_BRIEF_SCHEMA.properties.families.required.join() === "Primary", "top-level requires families; families requires only Primary");
ok(FAMILY_NAMES.length === 8 && FAMILY_NAMES.join() === "Neutral,Primary,Secondary,Tertiary,Info,Success,Warning,Danger", `FAMILY_NAMES is the canonical 8, role-table order (got ${FAMILY_NAMES.join()})`);
ok(Object.keys(PALETTE_BRIEF_SCHEMA.properties.families.properties).join() === FAMILY_NAMES.join(), "the families schema has exactly the 8 canonical keys, no more");
ok(PALETTE_BRIEF_SCHEMA.properties.families.additionalProperties === false, "no 9th family can be created (§3.1 — structural, not just documented)");
{
  const fs = PALETTE_BRIEF_SCHEMA.$defs.familySeed.properties;
  ok(fs.hue.minimum === DOMAINS.palette.hue.min && fs.hue.maximum === DOMAINS.palette.hue.max, "schema hue bounds match persist DOMAINS.palette.hue exactly");
  ok(fs.chroma.minimum === DOMAINS.palette.chroma.min && fs.chroma.maximum === DOMAINS.palette.chroma.max, "schema chroma bounds match persist DOMAINS.palette.chroma exactly");
  ok(fs.skew.minimum === DOMAINS.palette.skew.min && fs.skew.maximum === DOMAINS.palette.skew.max, "schema skew bounds match persist DOMAINS.palette.skew exactly");
  ok(fs.lift.minimum === DOMAINS.palette.lift.min && fs.lift.maximum === DOMAINS.palette.lift.max, "schema lift bounds match persist DOMAINS.palette.lift exactly");
  ok(fs.keyColor.pattern === "^#[0-9a-fA-F]{6}$" && fs.supportColor.pattern === fs.keyColor.pattern, "keyColor/supportColor are 6-digit hex patterns");
}
ok(PALETTE_BRIEF_SCHEMA.properties.global.properties.vibrancy.minimum === DOMAINS.vibrancy.min && PALETTE_BRIEF_SCHEMA.properties.global.properties.vibrancy.maximum === DOMAINS.vibrancy.max, "schema global.vibrancy bounds match persist DOMAINS.vibrancy");

// ── generateKit: the basic shape, non-object / empty briefs still generate (§4.4 — never reject) ──
{
  const { kit, doc, lint, meta } = generateKit({ families: { Primary: { hue: 30, chroma: 80 } } });
  ok(kit.$schema === "ultimate-tokens-brand-kit/1" && kit.palettes.length === 8, "a minimal brief (Primary only) generates a full 8-palette kit");
  ok(Array.isArray(lint) && Array.isArray(FAMILY_NAMES), "lint is an array");
  ok(meta.generator === "Ultimate Tokens" && meta.kitSchema === "ultimate-tokens-brand-kit/1" && meta.briefSchema === "ultimate-tokens-palette-brief/1", "meta carries the generator + both schema ids");
  ok(JSON.stringify(meta.brief) === JSON.stringify({ families: { Primary: { hue: 30, chroma: 80 } } }), "meta.brief echoes the originating brief verbatim (the replay handle)");
  ok(typeof doc === "string" || typeof doc === "object", "doc is present"); // serialize() returns a plain object, not a string — just presence-checking the field here
}
ok(generateKit({}).kit.palettes.length === 8, "an empty brief ({} — no families at all) still generates a full kit, never rejects");
ok(generateKit(null).kit.palettes.length === 8, "a null brief still generates (non-object degrades to {})");
ok(generateKit(undefined).kit.palettes.length === 8, "an undefined brief still generates");

// ── determinism: the SAME brief twice → deep-equal kit + doc (§6.4 reproducibility) ──
{
  const brief = { name: "Bel Air", families: { Primary: { hue: 210, chroma: 60, skew: 10 }, Secondary: { keyColor: "#3a7bd5" } } };
  const a = generateKit(brief);
  const b = generateKit(brief);
  ok(JSON.stringify(a.kit) === JSON.stringify(b.kit), "the same brief generates a byte-identical kit both times");
  ok(JSON.stringify(a.doc) === JSON.stringify(b.doc), "the same brief generates a byte-identical doc both times");
}

// ── core↔app parity (G1, #369's stated acceptance): the emitted doc, hydrated, brandKit's to the SAME kit ──
// hydrate() itself drops `name` (not a domain field, per app.js's own _restore — "carry it from the
// snapshot") — so the real app round-trip is hydrate() + reattaching raw.name, exactly like _restore does.
{
  const brief = { name: "Parity Check", families: { Primary: { hue: 300, chroma: 70, skew: -10, lift: 5 }, Danger: { hue: 10, chroma: 90 } } };
  const { kit, doc } = generateKit(brief);
  const restored = hydrate(doc);
  restored.name = typeof doc.name === "string" ? doc.name : restored.name;
  const rehydrated = brandKit(restored);
  ok(JSON.stringify(kit) === JSON.stringify(rehydrated), "kit deep-equals brandKit(hydrate(doc) + reattached name) for the same brief — the emitted doc genuinely round-trips through the app's own restore path");
}

// ── §4.1 absent-family defaulting ──
{
  const primaryHue = 40, primaryChroma = 88;
  const { kit } = generateKit({ families: { Primary: { hue: primaryHue, chroma: primaryChroma } } });
  const neutral = paletteByName(kit, "Neutral");
  const secondary = paletteByName(kit, "Secondary");
  const tertiary = paletteByName(kit, "Tertiary");
  // Neutral/Secondary/Tertiary hues aren't in the kit directly (only ramp hexes are) — re-derive via the doc.
  const { doc: rawDoc } = generateKit({ families: { Primary: { hue: primaryHue, chroma: primaryChroma } } });
  const docPalettes = hydrate(rawDoc).palettes;
  const byName = (n) => docPalettes.find((p) => p.name === n);
  ok(byName("Neutral").hue === primaryHue, `Neutral absent → Primary's own hue (got ${byName("Neutral").hue}, want ${primaryHue})`);
  ok(byName("Secondary").hue === wrapHue(primaryHue + SECONDARY_HARMONY_OFFSET), `Secondary absent → Primary + ${SECONDARY_HARMONY_OFFSET}° (got ${byName("Secondary").hue})`);
  ok(byName("Tertiary").hue === wrapHue(byName("Secondary").hue + TERTIARY_ANALOGOUS_OFFSET), `Tertiary absent → Secondary + ${TERTIARY_ANALOGOUS_OFFSET}° (got ${byName("Tertiary").hue})`);
  ok(!!neutral && !!secondary && !!tertiary, "Neutral/Secondary/Tertiary all present in the kit");
}
{
  // status families: absent → role-table's own hue (CAM16→OKLCH converted, not the raw CAM16 number) + chroma.
  const { doc: rawDoc } = generateKit({ families: { Primary: { hue: 267, chroma: 95 } } });
  const info = hydrate(rawDoc).palettes.find((p) => p.name === "Info");
  ok(info.hue !== 235, `Info's OKLCH hue must be the CONVERTED role-table hue, not the raw CAM16 number 235 (got ${info.hue})`);
  ok(info.chroma === 40, `Info absent → role-table's own chroma 40 (got ${info.chroma})`);
  ok(info.skew === -20 && info.lift === 0, `Info absent → role-table's own skew/lift (got skew=${info.skew} lift=${info.lift})`);
}
{
  // an EXPLICITLY given status seed is taken as-is (no nudge exists yet in #369 — #372's job), only clamped.
  const { doc: rawDoc } = generateKit({ families: { Primary: { hue: 40, chroma: 90 }, Danger: { hue: 40, chroma: 90 } } });
  const danger = hydrate(rawDoc).palettes.find((p) => p.name === "Danger");
  ok(danger.hue === 40 && danger.chroma === 90, `an explicit Danger seed passes through untouched even when it collides with Primary (got hue=${danger.hue} chroma=${danger.chroma}) — the distinctness gate is #372's, not built here`);
}

// ── keyColor precedence + supportColor (§3.2) ──
{
  const { doc: rawDoc, lint } = generateKit({ families: { Primary: { hue: 999, chroma: 999, keyColor: "#3a7bd5", supportColor: "#00d2ff" } } });
  const primary = hydrate(rawDoc).palettes.find((p) => p.name === "Primary");
  // Discriminating check: derive the EXPECTED hue/chroma independently (the same conversion generateKit
  // uses internally) rather than just asserting "not what a clamped 999/999 would be" — hue 999 clamps to
  // 360 and chroma 999 clamps to 100, and #3a7bd5's own derived chroma could in principle also land near
  // 100, so a loose inequality could pass even if keyColor were silently ignored. Pin to the exact expected
  // values instead.
  const expected = seedFromKeyColor(hexToOklch("#3a7bd5"), "oklch");
  ok(primary.hue === expected.hue && primary.chroma === expected.chroma, `keyColor wins over sibling hue/chroma even when both are given (got hue=${primary.hue} chroma=${primary.chroma}, want hue=${expected.hue} chroma=${expected.chroma} — NOT the clamped-999 values 360/100)`);
  ok(primary.keyColors && primary.keyColors.find((k) => k.role === "dominant") && primary.keyColors.find((k) => k.role === "supportive"), "keyColor → dominant keyColors entry; supportColor → supportive keyColors entry");
  ok(lint.some((l) => l.code === "key-color-precedence" && l.family === "Primary"), "a key-color-precedence lint entry is emitted when hue/chroma were also given");
}
{
  const { lint } = generateKit({ families: { Primary: { hue: 40, chroma: 80, keyColor: "#3a7bd5" } } });
  ok(lint.some((l) => l.code === "key-color-precedence"), "key-color-precedence fires whenever keyColor + hue/chroma are BOTH given");
}
{
  const { lint } = generateKit({ families: { Primary: { keyColor: "#3a7bd5" } } });
  ok(!lint.some((l) => l.code === "key-color-precedence"), "keyColor ALONE (no sibling hue/chroma) never fires the precedence lint — nothing was overridden");
}

// ── clamping: out-of-domain fields clamp to the nearest bound, per-field isolation, lint entries (§4.4) ──
{
  const { doc: rawDoc, lint } = generateKit({ families: { Primary: { hue: 999, chroma: -50, skew: 500, lift: 40 } } });
  const primary = hydrate(rawDoc).palettes.find((p) => p.name === "Primary");
  ok(primary.hue === DOMAINS.palette.hue.max, `hue 999 clamps to the domain max ${DOMAINS.palette.hue.max} (got ${primary.hue})`);
  ok(primary.chroma === DOMAINS.palette.chroma.min, `chroma -50 clamps to the domain min ${DOMAINS.palette.chroma.min} (got ${primary.chroma})`);
  ok(primary.skew === DOMAINS.palette.skew.max, `skew 500 clamps to the domain max ${DOMAINS.palette.skew.max} (got ${primary.skew})`);
  ok(primary.lift === 40, "an ALREADY in-domain lift (40, the max) is preserved exactly — per-field isolation");
  ok(lint.filter((l) => l.code === "clamped" && l.family === "Primary").length === 3, `exactly 3 clamped-lint entries for Primary's 3 out-of-domain fields (got ${lint.filter((l) => l.code === "clamped" && l.family === "Primary").length})`);
}
{
  // per-field isolation ACROSS families too: Danger's out-of-domain hue never perturbs Primary's in-domain seed.
  const { doc: rawDoc } = generateKit({ families: { Primary: { hue: 40, chroma: 80 }, Danger: { hue: 720 } } });
  const p = hydrate(rawDoc).palettes;
  ok(p.find((x) => x.name === "Primary").hue === 40 && p.find((x) => x.name === "Primary").chroma === 80, "Danger's out-of-domain field never perturbs Primary's own in-domain seed");
}
{
  const { lint } = generateKit({ families: { Primary: { hue: 40, chroma: 80 }, Secondary: { chroma: 400 } } });
  ok(lint.some((l) => l.code === "clamped" && l.family === "Secondary"), "an out-of-domain field anywhere in the brief emits its own clamped-lint entry");
}

// ── global.vibrancy ──
{
  const { doc: rawDoc, lint } = generateKit({ families: { Primary: { hue: 40, chroma: 80 } }, global: { vibrancy: 70 } });
  ok(hydrate(rawDoc).vibrancy === 70, "global.vibrancy sets the doc's vibrancy control");
  ok(lint.every((l) => l.message !== "vibrancy"), "an in-domain vibrancy emits no clamp lint");
}
{
  const { doc: rawDoc, lint } = generateKit({ families: { Primary: { hue: 40, chroma: 80 } }, global: { vibrancy: 500 } });
  ok(hydrate(rawDoc).vibrancy === DOMAINS.vibrancy.max, "an out-of-domain global.vibrancy clamps to the domain max");
  ok(lint.some((l) => l.message.includes("vibrancy")), "an out-of-domain global.vibrancy emits a clamped-lint entry");
}

// ── name / story (§3.4) ──
{
  const { kit } = generateKit({ name: "1980s Bel Air Pool Party", families: { Primary: { hue: 200, chroma: 60 } } });
  ok(kit.name === "1980s Bel Air Pool Party", "brief.name flows through to kit.name");
}
{
  const { kit, doc: rawDoc } = generateKit({ families: { Primary: { hue: 200, chroma: 60 } }, story: { title: "Poolside" } });
  ok(kit.name === "Poolside", "an absent brief.name falls back to story.title (brandKit's own existing fallback)");
  ok(hydrate(rawDoc).story && hydrate(rawDoc).story.title === "Poolside", "story round-trips into the doc");
}
ok(generateKit({ families: { Primary: { hue: 200, chroma: 60 } } }).kit.name === "Brand Kit", "no name and no story → brandKit's own final fallback \"Brand Kit\"");

if (fails.length) { console.error(`describe-kit-core FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("describe-kit-core PASS — PaletteBrief schema (persist-domain parity) · generateKit (defaulting, harmony recipes, keyColor precedence, clamping, determinism, core↔app parity)");
process.exit(0);
