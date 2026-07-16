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
//                     "Display/lg/heavier •" (core, siblings exist — dot-SUFFIXED, lowercase; the
//                     NORMALIZED relative label — see relativeWeightLabel — never the literal custom
//                     style name or ladder name: a long custom face name ("Condensed Black Italic")
//                     truncates illegibly in Figma's narrow Styles panel, with multiple siblings
//                     collapsing to the same visible "condensed …" prefix; a short relative word never
//                     does, and reads consistently regardless of what real font/weight sits underneath.
//                     The "•" trails the label — 2026-07-14, at request — rather than leading it, so it
//                     never gets clipped by Figma's own truncation of a long label) |
//                     "Display/lg/heavy" (sibling, lowercase — the SAME relative-label vocabulary, by
//                     its own rank among the voice's resolved weights) (2026-07-13 — normalized
//                     Lighter/Light/Heavy/Heavier labels, superseding TKT-0001's literal-name templating) |
//                     "UI-control/lg/regular-single •" (UI-control/UI-widget only — a "-single"
//                     SUFFIX on the leaf itself, flat inside the SAME step folder as the multi-line
//                     styles, never a NEW "/"-segment: a trailing "/single" segment made the plain leaf a
//                     PATH PREFIX of its own single variant, and Figma's Styles panel folder-izes any name
//                     that is a prefix of another — the plain leaf and the implied folder rendered as two
//                     rows sharing the same visible label; the "•" trails "-single" too, always the LAST
//                     token, so it consistently means "the default in this list" regardless of what
//                     precedes it),
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
//                                                                // PIXELS, not a % — a Figma-bound percent
//                                                                //   FLOAT displays as a bare, unit-less
//                                                                //   number in Figma's own Properties panel
//                         paragraphSpacing?, textCase } }]       // resolved values: loadFontAsync + per-field
//                                                                // fallback when a binding target is absent
// Deterministic: paints in families×roles order, texts in the scale's voice/step order, siblings after
// their core in list order. Same inputs ⇒ byte-identical plan (the executor's idempotency rides on it).

import { semanticRoles } from "../../src/engine/semantic.js";
import { weightNameFor, resolvedFontFor, siblingStyleName, coreWeightKey, relativeWeightLabel, BODY_CLASS_VOICES, BODY_WEIGHT_LABELS } from "../../src/engine/type.mjs";

// SINGLE_LINE_VOICES — voices that additionally get a "-single"-suffixed text-style sibling (1.0
// leading — line-height = size), flat alongside their normal multi-line style in the SAME step folder,
// per step and per configured weight. 2026-07-16 (TKT-0008 follow-up, at request): the Body*/Label*
// -single variants are RETIRED — single-line/box behavior belongs to the interactive voices,
// UI-control + UI-widget, which carry singleLineHeight as engine data (BOX voices).
const SINGLE_LINE_VOICES = new Set(["UI-control", "UI-widget"]);

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
      // relative Figma-label RANKS for this voice — computed ONCE (weight is constant across LG/MD/SM),
      // over the ascending-sorted, deduplicated set of every resolved weight (core + each sibling). See
      // relativeWeightLabel (src/engine/type.mjs) for why: a literal name (a custom face's own style
      // string, or a generic ladder name) reads illegibly once Figma truncates a long one in its narrow
      // Styles panel; a short relative word never does, and stays consistent regardless of what real
      // font/weight sits underneath.
      const coreWeightForRank = (steps.MD || steps.LG || steps.SM).weight;
      const rankedWeights = [...new Set([coreWeightForRank, ...sibs.map((wv) => wv.weight)])].sort((a, b) => a - b);
      // BODY_CLASS_VOICES (Lead/Body*/Label*/Tiny*) use the simpler Regular/Bolder/Boldest vocabulary
      // instead of the full Lighter/Light/Heavy/Heavier scale (2026-07-13, at request) — they're capped
      // at 3 total (core + 2, both heavier) by bodyClassSiblingDefaults, so the 3-word list always maps
      // 1:1 with no collision risk; relativeWeightLabel falls back to the 4-word scale automatically if
      // an explicit override ever configures more than 3 total for one of these voices anyway.
      const labelWords = BODY_CLASS_VOICES.has(voice) ? BODY_WEIGHT_LABELS : undefined;
      const labelFor = (weight) => relativeWeightLabel(rankedWeights.indexOf(weight), rankedWeights.length, labelWords);
      // text styles list LARGEST → smallest in the Figma Styles panel — the reverse of the engine's own
      // insertion order (Figma preserves the plan's own order rather than re-sorting, so this array IS
      // the panel order). Filtered per voice: most ride SM/MD/LG; the interactive voices (UI-control/
      // UI-widget) carry the full XS..2XL ramp (2026-07-16).
      for (const step of ["2XL", "XL", "LG", "MD", "SM", "XS"].filter((k) => k in steps)) {
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
          // lineHeight/letterSpacing ride as PIXELS here (not the CSS/DTCG ratio/em) — a Figma-bound
          // percent FLOAT displays as a bare number in Figma's own Properties panel, indistinguishable
          // from a pixel value at a glance; an absolute pixel is legible on its own there.
          lineHeight: s.lineHeight,
          letterSpacing: s.letterSpacing,
          ...(hasPara ? { paragraphSpacing: s.paragraphSpacing } : {}),
          textCase: s.textTransform || "none",
        };
        // the CORE style — `Voice/step` when the voice/step has NO configured siblings (nothing to
        // disambiguate — a voice explicitly opted out via `weights:[]`); `Voice/step/name •` when it
        // DOES (every voice by default, since 2026-07-13's auto-populated siblings). The ` •` (dot)
        // SUFFIX marks the default pick among its named siblings — not a plain label segment, so it can
        // never collide with a sibling's own name; it trails the label (2026-07-14, at request) rather
        // than leading it, so it's never clipped by Figma's own truncation of a long label. `name` is
        // the NORMALIZED relative label (Lighter/
        // Light/Heavy/Heavier, lowercased) by the core's own rank among `rankedWeights` — never the
        // literal custom style name or ladder name (2026-07-13, superseding TKT-0001's literal-name
        // templating): a long custom face name ("Condensed Black Italic") truncates illegibly in Figma's
        // narrow Styles panel, multiple siblings collapsing to the same visible "condensed …" prefix.
        // Computed UNCONDITIONALLY (not gated by sibs.length like coreLabel below) because the BIND
        // TARGET (coreWeightKey) always nests the same way, even for a voice with zero siblings — one
        // lone primitive in its own "Voice" folder, not confusing the way a split group would be.
        const coreWeightName = weightNameFor(s.weight);
        // labelFor is null only when rankedWeights collapsed to 1 distinct weight (a misconfigured
        // sibling weight identical to the core's) — fall back to the ladder name rather than throw.
        const coreLabel = sibs.length ? (labelFor(coreWeightForRank) || coreWeightName.name).toLowerCase() : null;
        const coreKey = coreWeightKey(voice, coreWeightName, sibs);
        // fontWeight and fontStyle are NEVER both bound: real Figma resolves a bound fontWeight to
        // "the closest valid weight for the font" independently of fontStyle, which silently overrides
        // a custom named cut ("Condensed Black Italic") back to whatever plain face is nearest by
        // weight number alone — found live via BZZR's Display core not rendering its bound style. A
        // custom styleName is strictly more specific than a numeric weight, so it alone drives the bind.
        texts.push({
          name: coreLabel ? `${voice}/${stepSlug}/${coreLabel} •` : `${voice}/${stepSlug}`,
          voice, step,
          bind: { ...bindBase, ...(coreStyleName ? { fontStyle: `weight-style/${coreKey}` } : { fontWeight: `weight/${coreKey}` }) },
          literal: { ...litBase, ...(coreStyleName ? { styleName: coreStyleName } : {}) },
        });
        // the SIBLING weight variants. The DISPLAY name is the SAME normalized relative-label
        // vocabulary as the core, by this sibling's own rank among `rankedWeights` — never the literal
        // templated face name or a bare weight slug (2026-07-13). The literal `styleName` (used for
        // actual font loading, via siblingStyleName) is UNCHANGED — only the visible Styles-panel label
        // moves to the relative word. The BINDING target keys (`weight-style/<voice>/<slug>`,
        // `weight/<voice>/<slug>`) stay on the plain kebab slug regardless — internal primitive naming,
        // not the user-facing style name.
        for (const wv of sibs) {
          const wvStyleName = siblingStyleName(coreStyleName, coreWeightName, wv.name);
          const wvLabel = (labelFor(wv.weight) || wv.name).toLowerCase();
          texts.push({
            name: `${voice}/${stepSlug}/${wvLabel}`,
            voice, step,
            bind: { ...bindBase, ...(coreStyleName ? { fontStyle: `weight-style/${voice}/${wv.slug}` } : { fontWeight: `weight/${voice}/${wv.slug}` }) },
            literal: { ...litBase, styleName: wvStyleName, weight: wv.weight },
          });
        }
        // SINGLE-LINE variants (UI-control/UI-widget only, 2026-07-16) — a sibling of every style above
        // (core + each configured weight), same font/size/tracking, but 1.0 leading (line-height = size,
        // no multi-line reading rhythm). Named with a "-single" SUFFIX on the leaf itself, flat inside the
        // SAME "{step}" folder as the multi-line styles (e.g. "Voice/step/label-single •",
        // "Voice/step/medium-single") — never a NEW "/"-segment. Two earlier shapes both broke: a
        // trailing "/single" segment ("Voice/step/• label/single") made "Voice/step/• label" a PATH
        // PREFIX of it, and Figma's "/"-grouped Styles panel folder-izes any name that is a prefix of
        // another (the plain leaf and the single-variant's implied parent folder rendered as two rows
        // sharing one visible label); a separate "{step}-single" FOLDER avoided that but hid the
        // single-line siblings in their own group instead of sitting next to their multi-line counterpart.
        // A hyphen suffix on the leaf is neither: it's a distinct LEAF NAME with no extra path segment, so
        // it can never become — or collide with — a folder. `singleLineHeight` exists as engine DATA on
        // the BOX voices (Kicker/UI-control/UI-widget) — both UI voices bind live to that Figma variable;
        // the literal fallback below survives for any prose voice a future config might opt in.
        if (SINGLE_LINE_VOICES.has(voice)) {
          const singleLineHeight = s.singleLineHeight ?? s.size;
          const singleBindBase = { ...bindBase, ...(s.singleLineHeight != null ? { lineHeight: `${voice}/${step}/singleLineHeight` } : {}) };
          if (s.singleLineHeight == null) delete singleBindBase.lineHeight; // no live variable for Body — literal only
          const singleLitBase = { ...litBase, lineHeight: singleLineHeight };
          texts.push({
            name: coreLabel ? `${voice}/${stepSlug}/${coreLabel}-single •` : `${voice}/${stepSlug}-single`,
            voice, step,
            bind: { ...singleBindBase, ...(coreStyleName ? { fontStyle: `weight-style/${coreKey}` } : { fontWeight: `weight/${coreKey}` }) },
            literal: { ...singleLitBase, ...(coreStyleName ? { styleName: coreStyleName } : {}) },
          });
          for (const wv of sibs) {
            const wvStyleName = siblingStyleName(coreStyleName, coreWeightName, wv.name);
            const wvLabel = (labelFor(wv.weight) || wv.name).toLowerCase();
            texts.push({
              name: `${voice}/${stepSlug}/${wvLabel}-single`,
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
