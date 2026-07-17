// bind-plan.mjs — the PURE, testable binding planner for the Figma cascade binder.
//
// This is the harness-importable core of capability.system.figma-plugin. It carries NO
// Figma runtime and NO I/O: it is a deterministic transform of the validated semantic
// role table (capability.system.semantic-mapping) into the raw-colors variable names a
// binder aliases. code.js replicates this same logic against the live `figma` global; this
// module is what the harness imports and tests in isolation.
//
// CONTRACT (the load-bearing checks):
//   bindingTargets(paletteNames) -> de-duped, sorted string[] of every raw-colors target
//     the binder aliases. For each palette n, for each of its 53 semantic roles, BOTH the
//     light and the dark ref become a target "{n}/{refKey(ref)}". Because every target is
//     refKey(ref) of a ref drawn from the validated role table (solid stops in EXPORT_STOPS
//     -> pad3; scrims on base 500 / 250 / 500 with alpha% = step/10 -> "{base}-{step}" verbatim),
//     every emitted name is GUARANTEED to be a member of the canonical raw-colors name set
//     (data/role-table.json: "{n}/{pad3(stop)}" UNION "{n}/{base}-{step}"). No string is hand-
//     built — refKey is the single normaliser shared with the semantic layer, so padding and
//     scrim grammar cannot drift ("50"->"050", never the dangling "50"; a scrim is
//     "500-{step}" with step an EXPORT_STOP, e.g. "500-200").
//
//   bindingPlan(paletteNames, themes) -> [{ semanticVar, targets: [{mode, target}, ...] }, ...]
//     One entry per (palette, role) in role order, no de-dup: the explicit per-theme alias plan
//     a binder executes (createVariableAlias on the ref for THAT theme's `side` into the mode
//     named `theme.name` — TKT-0021, genericized from the historical fixed Light/Dark pair).
//     `themes` defaults to semantic.js's DEFAULT_THEMES ([Light/light, Dark/dark]), so an absent
//     argument reproduces the pre-TKT-0021 two-target shape (now spelled as a 2-entry `targets`
//     array instead of the old `lightTarget`/`darkTarget` fields — no consumer read those field
//     names directly; test/figma/binder.mjs only asserts the plan's LENGTH). semanticVar is
//     "{n}{suffix}" (the palette name followed by the role's suffix, e.g. "primary" for the prime
//     role, "primary-dim", "neutral-scrim").

import { semanticRoles, refPath, roleLeaf, DEFAULT_THEMES } from "../../src/engine/semantic.js";

/**
 * The raw-colors target a single ref resolves to for a palette: "{n}/{refPath(ref)}".
 * Centralised so light and dark targets are normalised identically.
 * @param {string} paletteName lowercase palette name (e.g. "primary")
 * @param {string} ref a role ref: a solid stop ("550") or a scrim ("500-200")
 * @returns {string}
 */
function targetName(paletteName, ref) {
  return `${paletteName}/${refPath(ref)}`;  // ADR-016: scrims nest ("neutral/scrim/200")
}

/**
 * Every raw-colors variable name the binder aliases across the given palettes.
 * For each palette, each of its 53 roles contributes ONE target per theme (its `side`'s ref) —
 * with the default 2-theme (Light/Dark) axis that's still both the light AND the dark target,
 * exactly as before; a longer `themes` list contributes no NEW target names (every theme's side
 * is still "light" or "dark" — see semantic.js's DEFAULT_THEMES note), only more theme entries in
 * bindingPlan below.
 * @param {string[]} paletteNames lowercase palette names
 * @param {{name:string,side:'light'|'dark'}[]} [themes] the theme axis (TKT-0021); default DEFAULT_THEMES
 * @returns {string[]} de-duped, lexicographically sorted target names
 */
export function bindingTargets(paletteNames, themes = DEFAULT_THEMES) {
  const targets = new Set();
  for (const n of paletteNames) {
    for (const r of semanticRoles(n)) {
      for (const t of themes) targets.add(targetName(n, r[t.side]));
    }
  }
  return [...targets].sort();
}

/**
 * The explicit per-theme alias plan: one entry per (palette, role), in role order, each carrying
 * one target per theme (TKT-0021 — genericized from the fixed lightTarget/darkTarget pair).
 * @param {string[]} paletteNames lowercase palette names
 * @param {{name:string,side:'light'|'dark'}[]} [themes] the theme axis (TKT-0021); default DEFAULT_THEMES
 * @returns {{ semanticVar: string, targets: { mode: string, target: string }[] }[]}
 */
export function bindingPlan(paletteNames, themes = DEFAULT_THEMES) {
  const plan = [];
  for (const n of paletteNames) {
    for (const r of semanticRoles(n)) {
      plan.push({
        semanticVar: `${n}${r.suffix}`,
        targets: themes.map((t) => ({ mode: t.name, target: targetName(n, r[t.side]) })),
      });
    }
  }
  return plan;
}
