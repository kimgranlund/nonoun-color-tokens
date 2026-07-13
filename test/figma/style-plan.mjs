#!/usr/bin/env node
// style-plan.mjs — verifier for the pure styles planner (figma/binder/style-plan.mjs).
// The parity discipline mirrors binder.mjs: the planner's binding targets are diffed BOTH
// DIRECTIONS against the variable name sets a DIFFERENT code path emits (exportUI3 for the
// semantic color vars; typeTokensFigmaModes/Primitives for the type vars) — so a drift in
// either the planner or the emitters turns the gate red, whichever moved.
import { readFileSync } from "node:fs";
import { stylePlans, styleGroupOf, primitivesApplyPlan } from "../../figma/binder/style-plan.mjs";
import { exportUI3 } from "../../src/engine/exports.js";
import { typeScale, typeTokensFigmaModes, typeTokensFigmaPrimitives, siblingWeightDefaults } from "../../src/engine/type.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const RT = JSON.parse(readFileSync(new URL("../../docs/reference/data/role-table.json", import.meta.url), "utf8"));
const state = { palettes: RT.defaults, curve: "logistic", tension: 0, lmin: 5, lmax: 100, damp: 80, hueSpace: "cam16", theme: "auto" };

// ── ground truth: the semantic variable name set, from exportUI3 (a different code path) ──
const semVars = exportUI3(state).collections["Color / Semantic"].variables;
const varNames = new Set(Object.keys(semVars)); // "{n}/{key}"
const families = [...new Set(Object.keys(semVars).map((k) => k.split("/")[0]))]
  .map((n) => ({ n, name: n.charAt(0).toUpperCase() + n.slice(1) }));

// a scale WITH siblings + a core style name, so every text-plan shape is exercised
const scale = typeScale({
  treatment: "product",
  voices: { Display: { weights: siblingWeightDefaults(700), styleName: "Bold Condensed" }, Body: { weights: [{ name: "Semi-bold", weight: 600 }] } },
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

// ── text naming: lowercase steps, SYMMETRIC weight-slug naming when siblings exist (TKT-0001) ──
{
  const core = plans.texts.find((t) => t.voice === "Display" && t.step === "MD" && !t.literal.styleName);
  ok(!core, "the Display core carries its styleName (set in this fixture)");
  // Display's core weight (the product treatment's dWeight, 700) snaps to "Bold" — the core carries its
  // OWN weight-slug segment because Display has siblings configured (symmetric with them, not bare).
  const coreNamed = plans.texts.find((t) => t.name === "Display/md/bold");
  ok(!!coreNamed && coreNamed.literal.styleName === "Bold Condensed" && coreNamed.bind.fontStyle === "weight-style/Display" && coreNamed.bind.fontWeight === "weight/Display", "core style (WITH siblings): Voice/step/{own-weight-slug}, styleName + weight-style/weight binding still on the UN-suffixed primitive");
  const sib = plans.texts.find((t) => t.name === "Display/md/medium");
  ok(!!sib && sib.literal.weight === 500 && sib.bind.fontStyle === "weight-style/Display/medium" && sib.bind.fontWeight === "weight/Display/medium", "sibling style: Voice/step/{slug} (lowercase-kebab via wv.slug) with per-sibling bindings");
  // Body's core weight (440, unstyled — make11's default) snaps to "Regular"; Body also has 1 sibling
  // configured, so its core is symmetric-named too.
  const bodyCore = plans.texts.find((t) => t.name === "Body/md/regular");
  ok(!!bodyCore, "Body core (WITH a sibling) also carries its own weight-slug segment");
  const bodySib = plans.texts.find((t) => t.name === "Body/md/semi-bold");
  ok(!!bodySib && bodySib.literal.weight === 600, "Body sibling present with its weight, kebab-named");
  // a voice with NO configured siblings (only Display + Body have `weights` in this fixture) stays bare.
  const bareCore = plans.texts.find((t) => t.voice === "Headline" && t.step === "MD");
  ok(!!bareCore && bareCore.name === "Headline/md", "a voice with no siblings keeps the bare Voice/step name");
  ok(plans.texts.every((t) => /^[A-Za-z-]+\/[a-z0-9]+(\/[a-z0-9-]+)?$/.test(t.name)), "every text style name is Voice/lowerstep[/lower-kebab-slug]");
  // volume: 33 steps (11 voices × 3, since the 2026-07-13 fixed-size rewrite) × (1 core + siblings on 2
  // voices) — renaming the core doesn't change the COUNT.
  const stepCount = Object.values(scale.categories).reduce((a, s) => a + Object.keys(s).length, 0);
  const expected = stepCount + (scale.weights.Display.length * Object.keys(scale.categories.Display).length) + (scale.weights.Body.length * Object.keys(scale.categories.Body).length);
  ok(plans.texts.length === expected, `text style count ${plans.texts.length} != expected ${expected}`);
}

// ── include gates + determinism + identity ──
{
  ok(stylePlans({ families, scale, include: { color: false } }).paints.length === 0, "include.color:false ⇒ no paints");
  ok(stylePlans({ families, scale, include: { type: false } }).texts.length === 0, "include.type:false ⇒ no texts");
  ok(JSON.stringify(stylePlans({ families, scale })) === JSON.stringify(stylePlans({ families, scale })), "same inputs ⇒ byte-identical plan (determinism)");
  const bare = stylePlans({ families, scale: typeScale({ treatment: "product" }) });
  ok(bare.texts.every((t) => !t.bind.fontStyle && !t.literal.styleName), "no styleName config ⇒ no fontStyle bindings (identity)");
  ok(bare.texts.every((t) => t.bind.fontWeight === `weight/${t.voice}`), "every CORE style binds fontWeight to the voice's core weight primitive (always emitted)");
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
