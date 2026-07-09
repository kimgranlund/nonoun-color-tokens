// style-plan.mjs — the PURE, testable planner for the Figma STYLES swatches (paint styles bound to the
// Color Modes variables; text styles bound to the Typography + Font Primitives variables). The third
// planner sibling: bind-plan.mjs plans the color alias cascade, mode-apply-plan.mjs plans the moded
// float collections, THIS plans the styles layer that sits on top of both. No `figma` calls here —
// `figma/plugin/code.js#applyStylePlans` executes the plan verbatim (the executor is dumb by design).
//
// INPUTS (all resolved UI-side; the planner never re-derives state):
//   families — [{ n, name }] the enabled palettes: `n` the slug the variables use ("primary"),
//              `name` the display segment the style names use ("Primary").
//   scale    — the resolved typeScale (categories/roleOf/fonts, optional styleNames/weights).
//   include  — { color, type } booleans (the export-system opt-ins; styles obey them compositionally).
//
// OUTPUT — stylePlans({ families, scale, include }) → { paints, texts }:
//   paints: [{ name: "Primary/onPrimary" | "Primary/scrims/scrim" | "Primary/surfaces/surface",
//              varName: "primary/onPrimary" }]                   // → Color Modes variable, ratified grouping:
//                                                                //   scrim* → scrims/ · surface*|container* → surfaces/
//   texts:  [{ name: "Display/xl" (core) | "Display/xl/Bold" (sibling),
//              voice, step,
//              bind:    { fontSize, lineHeight, letterSpacing,   // → Typography collection keys
//                         paragraphSpacing?,                     //   (prose voices only)
//                         fontFamily,                            // → Font Primitives font/<voice> (STRING alias)
//                         fontStyle? },                          // → weight-style/<voice>[/<slug>] when named
//              literal: { family, styleName?, weight, size, lineHeight, letterSpacing,
//                         paragraphSpacing?, textCase } }]       // resolved values: loadFontAsync + per-field
//                                                                // fallback when a binding target is absent
// Deterministic: paints in families×roles order, texts in the scale's voice/step order, siblings after
// their core in list order. Same inputs ⇒ byte-identical plan (the executor's idempotency rides on it).

import { semanticRoles } from "../../src/engine/semantic.js";

// styleGroupOf — the ratified paint-style sub-folder for a role key: the 7 scrim roles under scrims/,
// the surface + container ladders under surfaces/, everything else flat under the family.
export function styleGroupOf(key) {
  if (/^scrim/.test(key)) return "scrims/";
  if (/^(surface|container)/.test(key)) return "surfaces/";
  return "";
}

export function stylePlans({ families = [], scale = null, include = {} } = {}) {
  const inc = { color: include.color !== false, type: include.type !== false };
  const paints = [];
  if (inc.color) {
    for (const f of families) {
      if (!f || typeof f.n !== "string" || !f.n || typeof f.name !== "string" || !f.name) continue;
      for (const r of semanticRoles(f.n)) {
        paints.push({ name: `${f.name}/${styleGroupOf(r.key)}${r.key}`, varName: `${f.n}/${r.key}` });
      }
    }
  }

  const texts = [];
  if (inc.type && scale && scale.categories && typeof scale.categories === "object") {
    for (const [voice, steps] of Object.entries(scale.categories)) {
      const role = (scale.roleOf || {})[voice] || "body";
      const family = (scale.fonts || {})[role] || "";
      const coreStyleName = (scale.styleNames && scale.styleNames[voice]) || null;
      const sibs = (scale.weights && scale.weights[voice]) || [];
      for (const [step, s] of Object.entries(steps)) {
        if (!s || !Number.isFinite(s.size)) continue;
        const stepSlug = String(step).toLowerCase();
        // paragraphSpacing rides only where the engine emits it (prose voices); a 0 is still a value.
        const hasPara = Number.isFinite(s.paragraphSpacing);
        const bindBase = {
          fontSize: `${voice}/${step}/size`,
          lineHeight: `${voice}/${step}/lineHeight`,
          letterSpacing: `${voice}/${step}/letterSpacing`,
          ...(hasPara ? { paragraphSpacing: `${voice}/${step}/paragraphSpacing` } : {}),
          fontFamily: `font/${voice}`,
        };
        const litBase = {
          family,
          weight: s.weight,
          size: s.size,
          lineHeight: s.lineHeight,
          letterSpacing: s.letterSpacing,
          ...(hasPara ? { paragraphSpacing: s.paragraphSpacing } : {}),
          textCase: s.textTransform || "none",
        };
        // the CORE style — bare `Voice/step` (ratified: no weight suffix on the core).
        texts.push({
          name: `${voice}/${stepSlug}`,
          voice, step,
          bind: { ...bindBase, ...(coreStyleName ? { fontStyle: `weight-style/${voice}` } : {}) },
          literal: { ...litBase, ...(coreStyleName ? { styleName: coreStyleName } : {}) },
        });
        // the SIBLING weight variants — `Voice/step/Name`, weight + style-name swapped per sibling.
        for (const wv of sibs) {
          texts.push({
            name: `${voice}/${stepSlug}/${wv.name}`,
            voice, step,
            bind: { ...bindBase, fontStyle: `weight-style/${voice}/${wv.slug}`, fontWeight: `weight/${voice}/${wv.slug}` },
            literal: { ...litBase, styleName: wv.name, weight: wv.weight },
          });
        }
      }
    }
  }

  return { paints, texts };
}

// primitivesApplyPlan — flatten the Font Primitives interchange (typeTokensFigmaPrimitives) into the
// ordered, single-mode apply plan the plugin executor consumes: LITERALS FIRST (STRING/FLOAT with their
// "Value"), then aliases — each alias guaranteed to follow its target (an alias whose target is absent
// is dropped HERE, planner-side, so the executor can never dangle). Null when there is nothing to apply.
export function primitivesApplyPlan(interchange) {
  const coll = interchange && interchange.collections && interchange.collections["Font Primitives"];
  const vars = coll && coll.variables && typeof coll.variables === "object" ? coll.variables : null;
  if (!vars) return null;
  const literals = [], aliases = [];
  for (const name of Object.keys(vars).sort()) {
    const v = vars[name];
    if (!v) continue;
    if (v.type === "ALIAS" && typeof v.target === "string") aliases.push({ name, type: "ALIAS", target: v.target });
    else if ((v.type === "STRING" || v.type === "FLOAT") && v.values && v.values.Value !== undefined) literals.push({ name, type: v.type, value: v.values.Value });
  }
  const litNames = new Set(literals.map((l) => l.name));
  const variables = [...literals, ...aliases.filter((a) => litNames.has(a.target))];
  return variables.length ? { collection: "Font Primitives", mode: "Value", variables } : null;
}
