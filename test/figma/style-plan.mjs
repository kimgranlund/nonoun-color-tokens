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

const RT = JSON.parse(readFileSync(new URL("../../.claude/docs/spec/data/role-table.json", import.meta.url), "utf8"));
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

// ── text naming: lowercase steps, bare core, sibling display-name suffix ──
{
  const core = plans.texts.find((t) => t.voice === "Display" && t.step === "MD" && !t.literal.styleName);
  ok(!core, "the Display core carries its styleName (set in this fixture)");
  const coreNamed = plans.texts.find((t) => t.name === "Display/md");
  ok(!!coreNamed && coreNamed.literal.styleName === "Bold Condensed" && coreNamed.bind.fontStyle === "weight-style/Display", "core style: bare Voice/step, styleName + weight-style binding");
  const sib = plans.texts.find((t) => t.name === "Display/md/Medium");
  ok(!!sib && sib.literal.weight === 500 && sib.bind.fontStyle === "weight-style/Display/medium" && sib.bind.fontWeight === "weight/Display/medium", "sibling style: Voice/step/Name with per-sibling bindings");
  const bodySib = plans.texts.find((t) => t.name === "Body/md/Semi-bold");
  ok(!!bodySib && bodySib.literal.weight === 600, "Body sibling present with its weight");
  ok(plans.texts.every((t) => /^[A-Za-z-]+\/[a-z0-9]+(\/.+)?$/.test(t.name)), "every text style name is Voice/lowerstep[/Name]");
  // volume: 53 steps × (1 core + siblings on 2 voices)
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
  ok(bare.texts.every((t) => !t.bind.fontStyle && !t.bind.fontWeight && !t.literal.styleName), "no styleName/weights config ⇒ no fontStyle/fontWeight bindings (identity)");
  ok(stylePlans({}).paints.length === 0 && stylePlans({}).texts.length === 0, "empty inputs ⇒ empty plan, no throw");
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
