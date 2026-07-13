#!/usr/bin/env node
// style-plan.mjs — verifier for the pure styles planner (figma/binder/style-plan.mjs).
// The parity discipline mirrors binder.mjs: the planner's binding targets are diffed BOTH
// DIRECTIONS against the variable name sets a DIFFERENT code path emits (exportUI3 for the
// semantic color vars; typeTokensFigmaModes/Primitives for the type vars) — so a drift in
// either the planner or the emitters turns the gate red, whichever moved.
import { readFileSync } from "node:fs";
import { stylePlans, styleGroupOf, primitivesApplyPlan } from "../../figma/binder/style-plan.mjs";
import { exportUI3 } from "../../src/engine/exports.js";
import { typeScale, typeTokensFigmaModes, typeTokensFigmaPrimitives, siblingWeightDefaults, weightNameFor, coreWeightKey } from "../../src/engine/type.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const RT = JSON.parse(readFileSync(new URL("../../docs/reference/data/role-table.json", import.meta.url), "utf8"));
const state = { palettes: RT.defaults, curve: "logistic", tension: 0, lmin: 5, lmax: 100, damp: 80, hueSpace: "cam16", theme: "auto" };

// ── ground truth: the semantic variable name set, from exportUI3 (a different code path) ──
const semVars = exportUI3(state).collections["Color / Semantic"].variables;
const varNames = new Set(Object.keys(semVars)); // "{n}/{key}"
const families = [...new Set(Object.keys(semVars).map((k) => k.split("/")[0]))]
  .map((n) => ({ n, name: n.charAt(0).toUpperCase() + n.slice(1) }));

// a scale with a CUSTOM sibling set + a core style name + one EXPLICIT opt-out (Kicker), so every
// text-plan shape is exercised — every OTHER voice auto-populates its siblings (2026-07-13).
const scale = typeScale({
  treatment: "product",
  voices: { Display: { weights: siblingWeightDefaults(700), styleName: "Bold Condensed" }, Body: { weights: [{ name: "Semi-bold", weight: 600 }] }, Kicker: { weights: [] } },
});
const plans = stylePlans({ families, scale });

// ── paint parity: every varName resolves; every semantic var has exactly one paint style ──
{
  const planned = plans.paints.map((p) => p.varName);
  const missing = planned.filter((v) => !varNames.has(v));
  ok(missing.length === 0, `paint plan targets missing from the semantic var set: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? " …" : ""}`);
  const plannedSet = new Set(planned);
  const uncovered = [...varNames].filter((v) => !plannedSet.has(v));
  ok(uncovered.length === 0, `semantic vars with NO paint style: ${uncovered.slice(0, 5).join(", ")}${uncovered.length > 5 ? " …" : ""}`);
  ok(planned.length === plannedSet.size, "duplicate paint style targets (a var must have exactly one style)");
}

// ── ratified grouping: scrims/ + surfaces/ sub-folders, everything else flat ──
{
  ok(styleGroupOf("scrimWeakest") === "scrims/" && styleGroupOf("scrim") === "scrims/", "scrim* roles group under scrims/");
  ok(styleGroupOf("surface") === "surfaces/" && styleGroupOf("surfaceBright") === "surfaces/" && styleGroupOf("containerHover") === "surfaces/", "surface*/container* roles group under surfaces/");
  ok(styleGroupOf("onPrimary") === "" && styleGroupOf("outline") === "" && styleGroupOf("onSurface") === "", "on-colors/outlines/on-surface stay flat (onSurface is an on-color, not a surface)");
  const p = plans.paints.find((x) => x.varName === "primary/scrim");
  ok(p && p.name === "Primary/scrims/scrim", `scrim style name: ${p && p.name}`);
  const s = plans.paints.find((x) => x.varName === "primary/surfaceBright");
  ok(s && s.name === "Primary/surfaces/surfaceBright", `surface style name: ${s && s.name}`);
  const o = plans.paints.find((x) => x.varName === "primary/onPrimary");
  ok(o && o.name === "Primary/onPrimary", `flat style name: ${o && o.name}`);
}

// ── text parity: every bind target exists in the Typography or Font Primitives collections ──
{
  const typo = new Set(Object.keys(typeTokensFigmaModes(scale).collections["Typography"].variables));
  const prim = new Set(Object.keys(typeTokensFigmaPrimitives(scale).collections["Font Primitives"].variables));
  const bad = [];
  for (const t of plans.texts) for (const [field, target] of Object.entries(t.bind)) {
    const home = field === "fontFamily" || field === "fontStyle" || field === "fontWeight" ? prim : typo;
    if (!home.has(target)) bad.push(`${t.name}.${field} → ${target}`);
  }
  ok(bad.length === 0, `text bind targets missing from the emitted collections: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? " …" : ""}`);
}

// ── text naming: lowercase steps, DOT-PREFIXED core naming now that every voice auto-populates
// siblings by default (TKT-0001, updated 2026-07-13) ──
{
  const core = plans.texts.find((t) => t.voice === "Display" && t.step === "MD" && !t.literal.styleName);
  ok(!core, "the Display core carries its styleName (set in this fixture)");
  // Display's core weight (the product treatment's dWeight, 700) snaps to "Bold", but this fixture
  // ALSO configures a custom Figma style name ("Bold Condensed") — the core's dot-prefixed label
  // prefers that specific name over the generic ladder snap (never lose resolution — "Bold" would
  // be a strictly less specific name than the actual configured face cut), lowercased for the
  // DISPLAY name (the literal.styleName used for real font loading keeps its real casing).
  const coreNamed = plans.texts.find((t) => t.name === "Display/md/• bold condensed");
  ok(!!coreNamed && coreNamed.literal.styleName === "Bold Condensed" && coreNamed.bind.fontStyle === "weight-style/Display/bold" && coreNamed.bind.fontWeight === undefined, "core style (WITH siblings + a custom style name): Voice/step/• {lowercase custom style name}, literal.styleName keeps real casing, ONLY fontStyle binds (nested under the core's own weight-name slug) — fontWeight stays unbound so real Figma's closest-valid-weight snap can never override the named cut");
  // a sibling's DISPLAY name follows the SAME custom-face naming convention as the core (lowercase,
  // full templated name) — not a bare generic slug — so the Styles panel never drops the
  // "condensed" adjective that only lived in the literal before this fix.
  const sib = plans.texts.find((t) => t.name === "Display/md/medium condensed");
  ok(!!sib && sib.literal.weight === 500 && sib.bind.fontStyle === "weight-style/Display/medium" && sib.bind.fontWeight === undefined, "sibling style: Voice/step/{templated lowercase name} with fontStyle keyed on the plain slug — fontWeight stays unbound (same reasoning as the core) — no dot prefix, only the core gets one");
  // a sibling's literal.styleName must follow the SAME custom-face naming convention as the core, not
  // a bare generic name — resolveFace (figma/plugin/code.js) exact-matches styleName against the
  // family's real installed style list, so "Medium" alone would miss "Medium Condensed" entirely and
  // silently fall back to a nearest-weight guess. Core here is "Bold Condensed" (weight 700 → "Bold");
  // the sibling (Medium, 500) must read "Medium Condensed", substituting just the weight word.
  ok(sib && sib.literal.styleName === "Medium Condensed", `sibling styleName follows the core's custom naming convention, not a bare generic name (got ${sib && sib.literal.styleName})`);
  // Body's core weight (440, unstyled — makeVoices's default) snaps to "Regular"; Body also has 1
  // EXPLICITLY configured sibling, so its core is dot-prefixed too (no custom styleName on Body ⇒
  // lowercased generic ladder name, "regular").
  const bodyCore = plans.texts.find((t) => t.name === "Body/md/• regular");
  ok(!!bodyCore, "Body core (WITH a sibling) also carries its own dot-prefixed weight-name segment, lowercase");
  const bodySib = plans.texts.find((t) => t.name === "Body/md/semi-bold");
  ok(!!bodySib && bodySib.literal.weight === 600, "Body sibling present with its weight, kebab-named");
  // AUTO-POPULATE (2026-07-13): a voice with NO explicit weights config (Headline, here) still gets 3
  // siblings from siblingWeightDefaults on its own resolved core weight — dot-prefixed core included.
  const headlineSibs = plans.texts.filter((t) => t.voice === "Headline" && t.step === "MD" && t.name.split("/")[1] === "md");
  ok(headlineSibs.length === 4, `an un-configured voice (Headline) still auto-populates 1 core + 3 siblings (got ${headlineSibs.length})`);
  ok(headlineSibs.some((t) => t.name.includes("• ")), "the auto-populated core is ALSO dot-prefixed, same as an explicitly-configured one");
  // the ONE remaining bare path: a voice that explicitly opts OUT via weights:[] (Kicker, here).
  const bareCore = plans.texts.find((t) => t.voice === "Kicker" && t.step === "MD");
  ok(!!bareCore && bareCore.name === "Kicker/md", "a voice that explicitly opts OUT (weights:[]) keeps the bare Voice/step name — the only way to still get one");
  // fallback: a custom style name that DOESN'T literally contain the core's own weight-name word
  // (e.g. a face named after a brand, not a weight) can't be safely templated — a sibling falls back
  // to its own bare name rather than risk a wrong substitution.
  {
    const noTemplateScale = typeScale({ treatment: "product", voices: { Headline: { styleName: "Brand Grotesk", weights: [{ name: "Medium", weight: 500 }] } } });
    const noTemplatePlans = stylePlans({ families, scale: noTemplateScale });
    const fallbackSib = noTemplatePlans.texts.find((t) => t.voice === "Headline" && t.step === "MD" && t.name.endsWith("/medium"));
    ok(!!fallbackSib && fallbackSib.literal.styleName === "Medium", `no matchable weight word in the custom name ⇒ sibling falls back to its own bare name (got ${fallbackSib && fallbackSib.literal.styleName})`);
  }
  ok(plans.texts.every((t) => /^[A-Za-z-]+\/[a-z0-9]+(-single)?(\/(?:[a-z0-9 -]+|• [^/]+))?$/.test(t.name)), "every text style name is Voice/lowerstep[-single][/lower-kebab-slug OR templated-lowercase-name OR /• lowercase name]");
  // volume: every voice×step gets 1 core + its siblings.length (auto-populated by default, 0 only for
  // an explicit opt-out) — plus a "{step}-single" mirror GROUP for every Body/Label style. Derived from
  // the resolved scale itself (not hand-counted) so this doesn't rot as voice defaults change.
  let expected = 0;
  for (const [v, steps] of Object.entries(scale.categories)) {
    const perStep = 1 + ((scale.weights && scale.weights[v]) || []).length;
    const n = perStep * Object.keys(steps).length;
    expected += n;
    if (v === "Body" || v === "Label") expected += n; // the {step}-single mirror
  }
  ok(plans.texts.length === expected, `text style count ${plans.texts.length} != expected ${expected}`);
  // every Body/Label style gets exactly one {step}-single sibling; no other voice does. A trailing
  // "/single" SUFFIX used to carry this (made the plain leaf a PREFIX of its own single variant's path,
  // which Figma's Styles panel folder-izes — the plain leaf and the implied folder then rendered as two
  // rows sharing the same visible label) — the "{step}-single" SIBLING FOLDER fixes that at the root.
  const singles = plans.texts.filter((t) => /-single(\/|$)/.test(t.name));
  ok(singles.every((t) => t.voice === "Body" || t.voice === "Label"), `only Body/Label carry a {step}-single variant (voices: ${[...new Set(singles.map((t) => t.voice))].join(",")})`);
  ok(!plans.texts.some((t) => t.name.endsWith("/single") || t.name.includes("/single/")), "no text style name uses the old \"/single\" SUFFIX shape (it collided with the plain leaf as a Figma folder prefix)");
  const bodySingle = plans.texts.find((t) => t.name === "Body/md-single/• regular");
  ok(!!bodySingle && bodySingle.literal.lineHeight === bodySingle.literal.size && !bodySingle.bind.lineHeight, "Body's {step}-single style: literal lineHeight = size, UNBOUND (Body has no singleLineHeight variable — it's prose)");
  const labelScale = typeScale({ treatment: "product" });
  const labelCoreName = weightNameFor(labelScale.categories.Label.MD.weight).name.toLowerCase();
  const labelSingle = stylePlans({ families, scale: labelScale }).texts.find((t) => t.name === `Label/md-single/• ${labelCoreName}`);
  ok(!!labelSingle && labelSingle.bind.lineHeight === "Label/MD/singleLineHeight", "Label's {step}-single style BINDS live to its real singleLineHeight variable (Label is a box voice)");
}

// ── include gates + determinism + identity ──
{
  ok(stylePlans({ families, scale, include: { color: false } }).paints.length === 0, "include.color:false ⇒ no paints");
  ok(stylePlans({ families, scale, include: { type: false } }).texts.length === 0, "include.type:false ⇒ no texts");
  ok(JSON.stringify(stylePlans({ families, scale })) === JSON.stringify(stylePlans({ families, scale })), "same inputs ⇒ byte-identical plan (determinism)");
  const bareScale = typeScale({ treatment: "product" });
  const bare = stylePlans({ families, scale: bareScale });
  const bareCores = bare.texts.filter((t) => t.name.includes("• "));
  ok(bareCores.length > 0 && bareCores.every((t) => !t.bind.fontStyle && !t.literal.styleName), "no styleName config ⇒ CORE styles carry no fontStyle binding (siblings still carry their own weight NAME regardless — that's the weight-style channel, not styleName)");
  ok(bareCores.every((t) => t.bind.fontWeight === `weight/${coreWeightKey(t.voice, weightNameFor(bareScale.categories[t.voice].MD.weight), bareScale.weights && bareScale.weights[t.voice])}`), "every CORE style binds fontWeight to the voice's core weight primitive, nested under its own weight-name slug (same group as its siblings)");
  ok(stylePlans({}).paints.length === 0 && stylePlans({}).texts.length === 0, "empty inputs ⇒ empty plan, no throw");
}

// ── per-voice FONT override (TKT-0002): the literal fallback family resolves the voice's OWN font, not
// always its shared role's — while the BINDING target shape (font/<voice>) is unchanged (already per-voice) ──
{
  const ovScale = typeScale({ treatment: "product", voices: { "Sub-heading": { font: "Custom Voice Font" } } });
  const ovPlans = stylePlans({ families, scale: ovScale });
  const subMd = ovPlans.texts.find((t) => t.voice === "Sub-heading" && t.step === "MD");
  ok(!!subMd && subMd.literal.family === "Custom Voice Font", `an overridden voice's literal fallback family resolves its OWN font (got ${subMd && subMd.literal.family})`);
  ok(subMd.bind.fontFamily === "font/Sub-heading", "the BINDING target is unchanged — already per-voice (font/<voice>)");
  // an un-overridden voice sharing the SAME role (Headline rides `heading`, like Sub-heading) still gets the
  // role's shared family — the override doesn't leak to its role-mates.
  const headMd = ovPlans.texts.find((t) => t.voice === "Headline" && t.step === "MD");
  ok(!!headMd && headMd.literal.family === ovScale.fonts[ovScale.roleOf.Headline], "an un-overridden voice sharing the same role still gets the role's shared family, untouched");
  // no override anywhere ⇒ literal.family matches the role's family exactly as before (identity).
  const bareSubMd = plans.texts.find((t) => t.voice === "Sub-heading" && t.step === "MD");
  ok(bareSubMd.literal.family === scale.fonts[scale.roleOf["Sub-heading"]], "no override ⇒ literal.family is the role's shared family (unchanged behavior)");
}

// ── primitivesApplyPlan: ordered flatten of the Font Primitives interchange ──
{
  const plan = primitivesApplyPlan(typeTokensFigmaPrimitives(scale));
  ok(!!plan && plan.collection === "Font Primitives" && plan.mode === "Value", "primitives plan targets the Font Primitives collection, single Value mode");
  const names = plan.variables.map((v) => v.name);
  const idx = (n) => names.indexOf(n);
  ok(plan.variables.every((v) => v.type !== "ALIAS" || idx(v.target) > -1 && idx(v.target) < idx(v.name)), "every alias follows its target (literals first)");
  ok(names.includes("weight/Display/medium") && names.includes("weight-style/Display/medium"), "sibling primitives ride the plan");
  const fontAlias = plan.variables.find((v) => v.name === "font/Display");
  ok(!!fontAlias && fontAlias.type === "ALIAS" && typeof fontAlias.target === "string", "font/<voice> aliases survive the flatten");
  const dangling = primitivesApplyPlan({ collections: { "Font Primitives": { modes: ["Value"], variables: { "font/X": { type: "ALIAS", target: "family/missing" } } } } });
  ok(dangling === null, "an alias with no target is dropped planner-side (nothing left ⇒ null)");
  ok(primitivesApplyPlan(null) === null && primitivesApplyPlan({}) === null, "empty interchange ⇒ null, no throw");
}

if (fails.length) { console.error(`style-plan FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log(`style-plan PASS — ${plans.paints.length} paints ↔ semantic vars both-directions, ${plans.texts.length} text styles bind-target-complete, ratified grouping/naming, determinism`);
process.exit(0);
