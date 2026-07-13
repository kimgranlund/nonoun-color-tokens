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
//   texts:  [{ name: "Display/lg" (voice explicitly opted OUT of siblings via weights:[] — bare) |
//                     "Display/lg/• condensed black italic" (core, siblings exist — dot-prefixed,
//                     lowercase; prefers a custom Figma style name over the generic weight name) |
//                     "Display/lg/condensed extra-bold italic" (sibling, lowercase — the SAME
//                     templated name as the core when one's configured, else a bare weight slug)
//                     (TKT-0001 — symmetric core+sibling naming, 2026-07-13's dot-prefix + templating) |
//                     "Label/lg-single/• medium" (Body/Label only — a SIBLING STEP folder, "{step}-single",
//                     never a "/single" suffix on the plain name: a suffix made the plain leaf a PREFIX of
//                     its own single variant's path, and Figma's Styles panel folder-izes any name that is
//                     a prefix of another — the plain leaf and the implied folder rendered as two rows
//                     sharing the same visible label),
//              voice, step,
//              bind:    { fontSize, lineHeight, letterSpacing,   // → Typography collection keys
//                         paragraphSpacing?,                     //   (prose voices only)
//                         fontFamily,                            // → Font Primitives font/<voice> (STRING alias)
//                         fontStyle? | fontWeight? },            // → weight-style/<voice>/<slug> OR
//                                                                //   weight/<voice>/<slug> — MUTUALLY
//                                                                //   EXCLUSIVE, never both: real Figma
//                                                                //   resolves a bound fontWeight to "the
//                                                                //   closest valid weight for the font",
//                                                                //   silently overriding a bound fontStyle's
//                                                                //   named cut back to the nearest plain
//                                                                //   face. A custom styleName wins (fontStyle
//                                                                //   only); otherwise fontWeight binds alone.
//              literal: { family, styleName?, weight, size, lineHeight, letterSpacing,
//                         lineHeightPct, letterSpacingPct,       // the EXACT ratio as a Figma percent —
//                                                                //   the literal-fallback path reads THESE,
//                                                                //   never (lineHeight/size)*100 (that
//                                                                //   re-derivation drifts per step)
//                         paragraphSpacing?, textCase } }]       // resolved values: loadFontAsync + per-field
//                                                                // fallback when a binding target is absent
// Deterministic: paints in families×roles order, texts in the scale's voice/step order, siblings after
// their core in list order. Same inputs ⇒ byte-identical plan (the executor's idempotency rides on it).

import { semanticRoles } from "../../src/engine/semantic.js";
import { weightNameFor, resolvedFontFor, siblingStyleName, coreWeightKey } from "../../src/engine/type.mjs";

// SINGLE_LINE_VOICES — voices that additionally get a "{step}-single" text-style sibling FOLDER
// (1.0 leading — line-height = size) alongside their normal "{step}" multi-line group, per step and
// per configured weight.
const SINGLE_LINE_VOICES = new Set(["Body", "Label"]);

// siblingStyleName lives in the engine (src/engine/type.mjs) — it's the ONE source of truth shared
// with typeTokensFigmaPrimitives's own weight-style/<voice>/<slug> primitive, so the two can never
// independently go stale again (exactly how this bug shipped once already).

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
      // the LITERAL fallback family (used when the binding target can't resolve) is the voice's RESOLVED
      // font — its own override if set, else its role's shared default (TKT-0002). The BINDING target
      // (`font/${voice}` below) was already per-voice; it needs no change — typeTokensFigmaPrimitives
      // already aliases an overridden voice's primitive to the override family.
      const family = resolvedFontFor(scale, voice) || "";
      const coreStyleName = (scale.styleNames && scale.styleNames[voice]) || null;
      const sibs = (scale.weights && scale.weights[voice]) || [];
      // text styles list LARGEST → smallest (LG, MD, SM) in the Figma Styles panel — the reverse of the
      // engine's own SM/MD/LG insertion order (steps is a plain {SM,MD,LG} object; Figma preserves the
      // plan's own order rather than re-sorting, so this array IS the panel order).
      for (const step of ["LG", "MD", "SM"]) {
        const s = steps[step];
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
          // the EXACT leading/tracking ratio as a Figma percent — constant per voice, never re-derived
          // from the rounded absolute lineHeight/letterSpacing above (that re-derivation drifted per step:
          // round(size·leading)/size ≠ leading at most sizes). The plugin's literal-fallback path
          // (figma/plugin/code.js) reads these directly instead of computing (lineHeight/size)*100 itself.
          lineHeightPct: Math.round(s.leadingRatio * 100 * 100) / 100,
          letterSpacingPct: Math.round(s.trackingRatio * 100 * 100) / 100,
          ...(hasPara ? { paragraphSpacing: s.paragraphSpacing } : {}),
          textCase: s.textTransform || "none",
        };
        // the CORE style — `Voice/step` when the voice/step has NO configured siblings (nothing to
        // disambiguate — a voice explicitly opted out via `weights:[]`); `Voice/step/• name` when it
        // DOES (TKT-0001 — every voice by default, since 2026-07-13's auto-populated siblings). The
        // `• ` (dot) prefix marks the default pick among its named siblings — not a plain weight-slug
        // segment, so it can never collide with a sibling's own name. Lowercase throughout (matching
        // the siblings' own lowercase-kebab convention, e.g. `bold`) — the label itself prefers the
        // voice's own custom Figma style name (`coreStyleName` — e.g. BZZR's "Condensed Black Italic")
        // over the generic ladder-snap name ("Black"): a non-variable face's real cut is strictly more
        // specific and must never be flattened down to the ladder's generic vocabulary. Computed
        // UNCONDITIONALLY (not gated by sibs.length like coreLabel below) because the BIND TARGET
        // (coreWeightKey) always nests the same way, even for a voice with zero siblings — one lone
        // primitive in its own "Voice" folder, not confusing the way a split group would be.
        const coreWeightName = weightNameFor(s.weight);
        const coreLabel = sibs.length ? (coreStyleName || coreWeightName.name).toLowerCase() : null;
        const coreKey = coreWeightKey(voice, coreWeightName, sibs);
        // fontWeight and fontStyle are NEVER both bound: real Figma resolves a bound fontWeight to
        // "the closest valid weight for the font" independently of fontStyle, which silently overrides
        // a custom named cut ("Condensed Black Italic") back to whatever plain face is nearest by
        // weight number alone — found live via BZZR's Display core not rendering its bound style. A
        // custom styleName is strictly more specific than a numeric weight, so it alone drives the bind.
        texts.push({
          name: coreLabel ? `${voice}/${stepSlug}/• ${coreLabel}` : `${voice}/${stepSlug}`,
          voice, step,
          bind: { ...bindBase, ...(coreStyleName ? { fontStyle: `weight-style/${coreKey}` } : { fontWeight: `weight/${coreKey}` }) },
          literal: { ...litBase, ...(coreStyleName ? { styleName: coreStyleName } : {}) },
        });
        // the SIBLING weight variants. The DISPLAY name mirrors whatever the core shows: a plain
        // lowercase-kebab weight slug (`bold`) for the common no-custom-name case, or — when the voice
        // has a custom style name — the SAME full templated name the literal uses (lowercase, space-
        // separated, e.g. `condensed bold italic`), so the visible Styles panel never drops the
        // "condensed"/"italic" adjectives that only lived in the literal before. The BINDING target
        // keys (`weight-style/<voice>/<slug>`, `weight/<voice>/<slug>`) stay on the plain kebab slug
        // regardless — internal primitive naming, not the user-facing style name.
        for (const wv of sibs) {
          const wvStyleName = siblingStyleName(coreStyleName, coreWeightName, wv.name);
          const wvLabel = coreStyleName ? wvStyleName.toLowerCase() : wv.slug;
          texts.push({
            name: `${voice}/${stepSlug}/${wvLabel}`,
            voice, step,
            bind: { ...bindBase, ...(coreStyleName ? { fontStyle: `weight-style/${voice}/${wv.slug}` } : { fontWeight: `weight/${voice}/${wv.slug}` }) },
            literal: { ...litBase, styleName: wvStyleName, weight: wv.weight },
          });
        }
        // SINGLE-LINE variants (Body/Label only) — a sibling of every style above (core + each
        // configured weight), same font/size/tracking, but 1.0 leading (line-height = size, no multi-line
        // reading rhythm). Grouped under its OWN "{step}-single" folder (a sibling of "{step}", never a
        // "/single" SUFFIX on the plain style's own name) — a trailing "/single" made "Voice/step/• label"
        // a PREFIX of "Voice/step/• label/single", and Figma's "/"-grouped Styles panel folder-izes any
        // name that is a prefix of another: the plain leaf and the single-variant's implied parent folder
        // then rendered as two separate rows sharing the same visible label (found live: Body/Label's own
        // weight names duplicated between a flat row and an identically-named folder). `singleLineHeight`
        // only exists as engine DATA on the BOX voices (Label/Body-mono/Label-mono/Kicker) — Label binds
        // live to that Figma variable; Body has no such variable (it's prose), so its single-line
        // lineHeight is a LITERAL (size, unbound) — the plan's own bind-or-literal-fallback pattern.
        if (SINGLE_LINE_VOICES.has(voice)) {
          const singleLineHeight = s.singleLineHeight ?? s.size;
          const singleBindBase = { ...bindBase, ...(s.singleLineHeight != null ? { lineHeight: `${voice}/${step}/singleLineHeight` } : {}) };
          if (s.singleLineHeight == null) delete singleBindBase.lineHeight; // no live variable for Body — literal only
          // singleLineHeight is ALWAYS exactly size (1.0 leading, 100%) — never the voice's own leadingRatio.
          const singleLitBase = { ...litBase, lineHeight: singleLineHeight, lineHeightPct: 100 };
          const singleStepSlug = `${stepSlug}-single`;
          texts.push({
            name: coreLabel ? `${voice}/${singleStepSlug}/• ${coreLabel}` : `${voice}/${singleStepSlug}`,
            voice, step,
            bind: { ...singleBindBase, ...(coreStyleName ? { fontStyle: `weight-style/${coreKey}` } : { fontWeight: `weight/${coreKey}` }) },
            literal: { ...singleLitBase, ...(coreStyleName ? { styleName: coreStyleName } : {}) },
          });
          for (const wv of sibs) {
            const wvStyleName = siblingStyleName(coreStyleName, coreWeightName, wv.name);
            const wvLabel = coreStyleName ? wvStyleName.toLowerCase() : wv.slug;
            texts.push({
              name: `${voice}/${singleStepSlug}/${wvLabel}`,
              voice, step,
              bind: { ...singleBindBase, ...(coreStyleName ? { fontStyle: `weight-style/${voice}/${wv.slug}` } : { fontWeight: `weight/${voice}/${wv.slug}` }) },
              literal: { ...singleLitBase, styleName: wvStyleName, weight: wv.weight },
            });
          }
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
