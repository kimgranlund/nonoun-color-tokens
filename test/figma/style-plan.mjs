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
const semVars = exportUI3(state).collections["Color Semantic"].variables;
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
  const s = plans.paints.find((x) => x.varName === "primary/surface-bright");
  ok(s && s.name === "Primary/surfaces/surfaceBright", `surface style name: ${s && s.name}`);
  const o = plans.paints.find((x) => x.varName === "primary/on-primary");
  ok(o && o.name === "Primary/onPrimary", `flat style name: ${o && o.name}`);
}

// ── text parity: every bind target exists in the merged Geometry (type/ half) or Font Primitives collections ──
{
  const typo = new Set(Object.keys(typeTokensFigmaModes(scale).collections.Breakpoints.variables));
  const prim = new Set(Object.keys(typeTokensFigmaPrimitives(scale).collections["Font Primitives"].variables));
  const bad = [];
  for (const t of plans.texts) for (const [field, target] of Object.entries(t.bind)) {
    const home = field === "fontFamily" || field === "fontStyle" || field === "fontWeight" ? prim : typo;
    if (!home.has(target)) bad.push(`${t.name}.${field} → ${target}`);
  }
  ok(bad.length === 0, `text bind targets missing from the emitted collections: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? " …" : ""}`);
}

// ── text naming: lowercase steps, DOT-PREFIXED core naming, NORMALIZED relative labels (Lighter/
// Light/Heavy/Heavier, by rank among the voice's resolved weights — 2026-07-13, superseding the
// literal-name/templated-name labels: a long custom face name truncates illegibly in Figma's narrow
// Styles panel, multiple siblings collapsing to the same visible prefix; a short relative word never
// does). The literal.styleName (used for actual font loading) still carries the full templated name —
// only the visible label moves. ──
{
  const core = plans.texts.find((t) => t.voice === "Display" && t.step === "MD" && !t.literal.styleName);
  ok(!core, "the Display core carries its styleName (set in this fixture)");
  // Display's siblings (siblingWeightDefaults(700) around a custom-named 700 core): 500/600/700/800 —
  // 4 distinct weights, rank 0..3 map 1:1 onto Lighter/Light/Heavy/Heavier. Core (700) ranks 3rd → "heavy".
  const coreNamed = plans.texts.find((t) => t.name === "Display/md/heavy •");
  ok(!!coreNamed && coreNamed.literal.styleName === "Bold Condensed" && coreNamed.bind.fontStyle === "weight-style/display/bold" && coreNamed.bind.fontWeight === undefined, "core style (WITH siblings + a custom style name): Voice/step/• {relative label, by rank}, literal.styleName keeps the real templated name + casing, ONLY fontStyle binds (nested under the core's own weight-name slug) — fontWeight stays unbound so real Figma's closest-valid-weight snap can never override the named cut");
  // siblings: 800 ranks heaviest (4th) → "heavier"; 600 ranks 2nd → "light"; 500 ranks lightest → "lighter".
  const sib800 = plans.texts.find((t) => t.name === "Display/md/heavier");
  const sib600 = plans.texts.find((t) => t.name === "Display/md/light");
  const sib500 = plans.texts.find((t) => t.name === "Display/md/lighter");
  ok(!!sib800 && sib800.literal.weight === 800 && sib800.literal.styleName === "Extra-bold Condensed" && sib800.bind.fontStyle === "weight-style/display/extra-bold" && sib800.bind.fontWeight === undefined, `sibling style: Voice/step/{relative label} with fontStyle keyed on the plain slug — fontWeight stays unbound (same reasoning as the core) — no dot prefix, only the core gets one (got weight ${sib800 && sib800.literal.weight}, styleName ${sib800 && sib800.literal.styleName})`);
  ok(!!sib600 && sib600.literal.weight === 600 && sib600.literal.styleName === "Semi-bold Condensed", `a MIDDLE-rank sibling gets "light", not "heavy" (got weight ${sib600 && sib600.literal.weight}, styleName ${sib600 && sib600.literal.styleName})`);
  // the literal.styleName must still follow the core's custom naming convention (full templated name,
  // real casing) — resolveFace (figma/plugin/code.js) exact-matches styleName against the family's real
  // installed style list, so a bare "Medium" would miss "Medium Condensed" entirely and silently fall
  // back to a nearest-weight guess. Only the DISPLAY LABEL (the relative word) changed; the literal is
  // exactly as templated before.
  ok(!!sib500 && sib500.literal.styleName === "Medium Condensed", `sibling styleName still follows the core's custom naming convention (the literal, not the label) — got ${sib500 && sib500.literal.styleName}`);
  // Body's core (unstyled, weight 440) + its 1 EXPLICIT sibling (Semi-bold/600) — 2 distinct weights.
  // Body is a BODY_CLASS_VOICE (2026-07-13, at request): its vocabulary is Regular/Bolder/Boldest, not
  // Lighter/Light/Heavy/Heavier — core (440, lighter of the two) ranks "regular"; the sibling (600)
  // ranks "boldest" (2 total ⇒ the two extremes of the 3-word scale, skipping "Bolder").
  const bodyCore = plans.texts.find((t) => t.name === "Body/md/regular •");
  ok(!!bodyCore, "Body core (WITH a sibling) also carries its own dot-prefixed relative label, lowercase");
  const bodySib = plans.texts.find((t) => t.name === "Body/md/boldest");
  ok(!!bodySib && bodySib.literal.weight === 600, "Body sibling present with its weight, relative-labeled");
  // AUTO-POPULATE (2026-07-13): a voice with NO explicit weights config (Headline, here) still gets 3
  // siblings from siblingWeightDefaults on its own resolved core weight — dot-prefixed core included.
  const headlineSibs = plans.texts.filter((t) => t.voice === "Headline" && t.step === "MD" && t.name.split("/")[1] === "md");
  ok(headlineSibs.length === 4, `an un-configured voice (Headline) still auto-populates 1 core + 3 siblings (got ${headlineSibs.length})`);
  ok(headlineSibs.some((t) => t.name.includes(" •")), "the auto-populated core is ALSO dot-prefixed, same as an explicitly-configured one");
  // the ONE remaining bare path: a voice that explicitly opts OUT via weights:[] (Kicker, here).
  const bareCore = plans.texts.find((t) => t.voice === "Kicker" && t.step === "MD");
  ok(!!bareCore && bareCore.name === "Kicker/md", "a voice that explicitly opts OUT (weights:[]) keeps the bare Voice/step name — the only way to still get one");
  // the relative label is INDEPENDENT of styleName templating entirely now — even when a custom name
  // shares NO matchable weight word with the core (siblingStyleName's own fallback path, still exercised
  // for the LITERAL), the sibling's DISPLAY LABEL still resolves cleanly by rank (no "fallback to a bare
  // name" special case needed at the label layer anymore).
  {
    const noTemplateScale = typeScale({ treatment: "product", voices: { Headline: { styleName: "Brand Grotesk", weights: [{ name: "Medium", weight: 500 }] } } });
    const noTemplatePlans = stylePlans({ families, scale: noTemplateScale });
    // 2 distinct weights (core + 1 sibling): sibling (500) is the lighter of the two → "lighter".
    const fallbackSib = noTemplatePlans.texts.find((t) => t.name === "Headline/md/lighter");
    ok(!!fallbackSib && fallbackSib.literal.styleName === "Medium", `no matchable weight word in the custom name ⇒ literal.styleName still falls back to the sibling's own bare name, but the LABEL resolves by rank regardless (got ${fallbackSib && fallbackSib.literal.styleName})`);
  }
  ok(plans.texts.every((t) => /^[A-Za-z-]+\/[a-z0-9]+(\/[a-z0-9 -]+)?(-single)?( •)?$/.test(t.name)), "every text style name is Voice/lowerstep[/lower-kebab-slug OR relative-label OR /• relative-label][-single suffix on the leaf]");
  // volume: every voice×step gets 1 core + its siblings.length (auto-populated by default, 0 only for
  // an explicit opt-out) — plus a "-single"-suffixed mirror of every UI-control/UI-widget style
  // (2026-07-16: the Body*/Label* -single variants are RETIRED — single-line behavior belongs to the
  // interactive voices). Derived from the resolved scale itself (not hand-counted) so this doesn't rot
  // as voice defaults change.
  const SINGLE_VOICES = new Set(["UI-control", "UI-widget"]);
  let expected = 0;
  for (const [v, steps] of Object.entries(scale.categories)) {
    const perStep = 1 + ((scale.weights && scale.weights[v]) || []).length;
    const n = perStep * Object.keys(steps).length;
    expected += n;
    if (SINGLE_VOICES.has(v)) expected += n; // the -single mirror
  }
  ok(plans.texts.length === expected, `text style count ${plans.texts.length} != expected ${expected}`);
  // every UI-control/UI-widget style gets exactly one -single sibling; no other voice does.
  // Two earlier shapes both broke: a trailing "/single" SEGMENT made the plain leaf a PATH PREFIX of its
  // own single variant (Figma's Styles panel folder-izes any name that is a prefix of another — the
  // plain leaf and the implied folder rendered as two rows sharing one visible label); a separate
  // "{step}-single" FOLDER avoided that but hid the single-line siblings away from their multi-line
  // counterpart instead of sitting flat next to it. A "-single" SUFFIX on the leaf itself is neither —
  // no new path segment, so it can never become or collide with a folder, and it stays right beside its
  // multi-line sibling in the SAME step folder.
  const singles = plans.texts.filter((t) => /-single$/.test(t.name));
  ok(singles.every((t) => SINGLE_VOICES.has(t.voice)), `only UI-control/UI-widget carry a -single variant (voices: ${[...new Set(singles.map((t) => t.voice))].join(",")})`);
  ok(!plans.texts.some((t) => t.name.endsWith("/single") || t.name.includes("/single/") || /-single\//.test(t.name)), "no text style name uses the old \"/single\" segment or \"{step}-single\" folder shape (both collided/hid siblings away)");
  // a FRESH, fully-default scale — the UI voices auto-populate via bodyClassSiblingDefaults (2
  // siblings, BOTH heavier), so each core is the LIGHTEST of its own 3-total set → "regular",
  // matching the Regular/Bolder/Boldest scale. Both bind live to their singleLineHeight variables
  // (they're BOX voices); the retired Body*/Label* voices emit NO -single style at all.
  const labelScale = typeScale({ treatment: "product" });
  const labelPlans = stylePlans({ families, scale: labelScale });
  const ucSingle = labelPlans.texts.find((t) => t.name === "UI-control/md/regular-single •");
  ok(!!ucSingle && ucSingle.bind.lineHeight === "type/ui-control/md/single-line-height", "UI-control's -single style BINDS live to its real singleLineHeight variable (a box voice)");
  const uwSingle = labelPlans.texts.find((t) => t.name === "UI-widget/md/regular-single •");
  ok(!!uwSingle && uwSingle.bind.lineHeight === "type/ui-widget/md/single-line-height", "UI-widget's -single style BINDS live to its real singleLineHeight variable");
  ok(!labelPlans.texts.some((t) => /-single/.test(t.name) && ["Body", "Body-mono", "Label", "Label-mono"].includes(t.voice)), "the Body*/Label* -single variants are RETIRED (2026-07-16) — none emitted");
  // sibling weights get the SAME -single suffix, flat next to their own multi-line style (the exact ask:
  // every configured sibling gets its own "-single" variant, not just the core).
  const ucBolderSingle = labelPlans.texts.find((t) => t.name === "UI-control/md/bolder-single");
  ok(!!ucBolderSingle, "UI-control's sibling weight carries its own -single variant, not just the core");
  // BODY_CLASS_VOICES auto-populate ONLY 2 siblings (never 3) — both heavier than the core, never
  // lighter, matching the Regular/Bolder/Boldest progression's one-directional meaning.
  const labelBolder = labelPlans.texts.find((t) => t.name === "Label/md/bolder");
  const labelBoldest = labelPlans.texts.find((t) => t.name === "Label/md/boldest");
  ok(!!labelBolder && !!labelBoldest && labelBolder.literal.weight > labelScale.categories.Label.MD.weight && labelBoldest.literal.weight > labelBolder.literal.weight, `Label auto-populates exactly 2 siblings, BOTH heavier than the core (core ${labelScale.categories.Label.MD.weight}, got ${labelBolder && labelBolder.literal.weight}/${labelBoldest && labelBoldest.literal.weight})`);
  ok(!labelPlans.texts.some((t) => t.voice === "Label" && t.step === "MD" && /^Label\/md\/(lighter|light|heavy|heavier)(-single)?$/.test(t.name)), "Label (a BODY_CLASS_VOICE) never uses the Lighter/Light/Heavy/Heavier vocabulary");
}

// ── include gates + determinism + identity ──
{
  ok(stylePlans({ families, scale, include: { color: false } }).paints.length === 0, "include.color:false ⇒ no paints");
  ok(stylePlans({ families, scale, include: { type: false } }).texts.length === 0, "include.type:false ⇒ no texts");
  ok(JSON.stringify(stylePlans({ families, scale })) === JSON.stringify(stylePlans({ families, scale })), "same inputs ⇒ byte-identical plan (determinism)");
  const bareScale = typeScale({ treatment: "product" });
  const bare = stylePlans({ families, scale: bareScale });
  const bareCores = bare.texts.filter((t) => t.name.includes(" •"));
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
  ok(subMd.bind.fontFamily === "font/sub-heading", "the BINDING target is per-voice (font/<kebab-voice>, ADR-016)");
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
  ok(names.includes("weight/display/medium") && names.includes("weight-style/display/medium"), "sibling primitives ride the plan");
  const fontAlias = plan.variables.find((v) => v.name === "font/display");
  ok(!!fontAlias && fontAlias.type === "ALIAS" && typeof fontAlias.target === "string", "font/<voice> aliases survive the flatten");
  const dangling = primitivesApplyPlan({ collections: { "Font Primitives": { modes: ["Value"], variables: { "font/X": { type: "ALIAS", target: "family/missing" } } } } });
  ok(dangling === null, "an alias with no target is dropped planner-side (nothing left ⇒ null)");
  ok(primitivesApplyPlan(null) === null && primitivesApplyPlan({}) === null, "empty interchange ⇒ null, no throw");
}

if (fails.length) { console.error(`style-plan FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log(`style-plan PASS — ${plans.paints.length} paints ↔ semantic vars both-directions, ${plans.texts.length} text styles bind-target-complete, ratified grouping/naming, determinism`);
process.exit(0);
