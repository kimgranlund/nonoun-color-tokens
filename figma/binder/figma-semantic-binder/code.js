// figma-semantic-binder/code.js — the Color Tokens cascade binder runtime.
//
// Runs inside Figma (uses the `figma` global). It gives the live raw->semantic cascade that
// native JSON import cannot (knowledge-05 §1): each semantic role is aliased to the REAL raw
// Variable object via figma.variables.createVariableAlias, so editing a raw color propagates
// to every semantic role that aliases it.
//
// OFFLINE (ADR-010 / AC-P3): no network I/O. No fetch / XMLHttpRequest / WebSocket / dynamic
// import() of a remote URL / figma.showUI to a remote origin. manifest.networkAccess === "none".
//
// PARITY: the binding loop below MIRRORS ../bind-plan.mjs (bindingPlan / bindingTargets) — the
// same role table, the same refKey normaliser, the same "{n}/{refKey(ref)}" target grammar.
// bind-plan.mjs is the pure, harness-tested source of truth; this file replicates it verbatim
// because Figma plugin code runs in a non-module sandbox and cannot import the .mjs at run time.
// Both derive from the validated capability.system.semantic-mapping role table. Because every
// target is refKey() of a ref from that table (solid stop -> pad3 "050"; scrim base 250/500/750
// with alpha% = step/10 -> "{base}-{step}" verbatim), every emitted "{n}/{refKey}" is a member of
// the canonical raw-colors name set — no unpadded "{n}/50", no out-of-range "{n}/500-999".
//
// GENERATED SECTIONS (TKT-0019, +COLOR_EXECUTOR at TKT-0024): the three "// === GENERATED:... ==="
// blocks below (the five float-executor functions + the three color-provenance functions + roleTable())
// are SPLICED from their canonical sources at build time by scripts/gen-figma-binder-code.mjs (npm test /
// npm run build run it as gen:figma-binder-code) — not hand-copied. Regenerate:
// `node scripts/gen-figma-binder-code.mjs`. Never hand-edit inside a marker pair; edit the canonical
// source (figma/plugin/code.js or src/engine/semantic.js) and regenerate.

const RAW_COLLECTION = "Color Primitives";
const SEMANTIC_COLLECTION = "Color Semantic"; // ADR-016 (was "Color Modes")

// The 8 default palettes (knowledge-05 §3; defaults[].name in data/role-table.json).
const PALETTES = [
  "neutral",
  "primary",
  "secondary",
  "tertiary",
  "info",
  "success",
  "danger",
  "warning",
];

// ── breakpoint-moded Type/Geometry (baked at download time) ──────────────────────────────
// Color modes are ALIASES to already-imported raw primitives (the cascade above), so they can only be
// bound live. Type/Geometry breakpoint modes are pure LITERAL float values — nothing to alias — so they
// can be carried as DATA: app.js's downloadFigmaPlugin() string-replaces this anchor with the current
// project's _figmaFloatPlans() at download time. Default [] = the generic/asset form (no breakpoints
// baked in) — a no-op, so the checked-in binder stays palette-agnostic.
const FLOAT_PLANS = JSON.parse("[]"); /* __ULTIMATE_TOKENS_FLOAT_PLANS__ */

// FLOAT_REGISTRY_KEY — the PROVENANCE registry for the breakpoint-moded Type/Geometry collections, a
// name→collectionId map stored in root pluginData (travels with the .fig, like the palette set). Kept
// as the SAME key string as figma/plugin/code.js so the flagship plugin and this binder converge on the
// SAME collections idempotently if a user runs both against one file.
const FLOAT_REGISTRY_KEY = "ultimate-tokens-float-collections";

// COLOR_REGISTRY_KEY — TKT-0024: the SAME provenance discipline, back-ported to the Color Semantic
// collection this binder creates/finds (the raw "Color Primitives" collection is only ever READ here,
// never created — see main() below — so it needs no registry entry of its own). Kept as the SAME key
// string as figma/plugin/code.js so the flagship plugin and this binder converge on the SAME collection
// if a user runs both against one file. Before this, main() adopted ANY same-named "Color Semantic"
// collection by NAME alone — a user's own collection with that exact name got silently adopted and
// populated with aliases on the next bind.
const COLOR_REGISTRY_KEY = "ultimate-tokens-color-collections";

// MIRRORS figma/plugin/code.js's float executor: readFloatRegistry/writeFloatRegistry/
// ensureFloatCollection/varsByName/applyFloatPlans — a pure DATA executor (no planner to spec-gate
// against), using only figma.variables.* + figma.root.get/setPluginData, both available to any plugin
// (no color-specific state). GENERATED (see the file-header note) — the `floatparity` gate in
// test/figma/binder.mjs is now a TRIPWIRE proving the splice landed byte-identical, not the mechanism
// keeping the two copies in lockstep.
// === GENERATED:FLOAT_EXECUTOR START ===
function readFloatRegistry() {
  const raw = figma.root.getPluginData(FLOAT_REGISTRY_KEY);
  if (!raw) return {};
  try { const r = JSON.parse(raw); return r && typeof r === "object" ? r : {}; } catch (e) { return {}; }
}

function writeFloatRegistry(reg) { figma.root.setPluginData(FLOAT_REGISTRY_KEY, JSON.stringify(reg)); }

async function ensureFloatCollection(name, reg, renameFrom) {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const known = reg[name] && cols.find((c) => c.id === reg[name]);
  if (known) return known;
  for (const old of (Array.isArray(renameFrom) ? renameFrom : [])) {
    const prev = reg[old] && cols.find((c) => c.id === reg[old]);
    if (prev) {
      prev.name = name;
      reg[name] = prev.id;
      delete reg[old];
      return prev;
    }
  }
  const made = figma.variables.createVariableCollection(name);
  reg[name] = made.id;
  return made;
}

async function varsByName(collectionId) {
  const all = await figma.variables.getLocalVariablesAsync();
  const m = {};
  for (const v of all) if (v.variableCollectionId === collectionId) m[v.name] = v;
  return m;
}

async function applyFloatPlans(plans) {
  let collections = 0, variables = 0;
  const reg = readFloatRegistry(); // provenance: only ever touch a collection this plugin created (see ensureFloatCollection)
  for (const plan of (Array.isArray(plans) ? plans : [])) {
    if (!plan || !plan.collection || !Array.isArray(plan.modes) || !plan.modes.length) continue;
    const coll = await ensureFloatCollection(plan.collection, reg, plan.renameFrom);
    // The collection's DEFAULT mode (Figma rejects removing it) — rename it to the plan's first mode ("Base");
    // the rest are added (or reused) by NAME. Anchor on `defaultModeId`, not modes[0]: for a plugin-created
    // collection they coincide, but a foreign same-named collection's default may not be the first mode, and
    // pruning it would throw. (The headless mock has no defaultModeId → falls back to modes[0].)
    const defaultId = coll.defaultModeId || coll.modes[0].modeId;
    coll.renameMode(defaultId, plan.defaultMode);
    const findMode = (nm) => coll.modes.find((m) => m.name.toLowerCase() === String(nm).toLowerCase());
    const modeId = {};
    modeId[plan.defaultMode] = defaultId;
    for (const nm of plan.addModes) { const ex = findMode(nm); modeId[nm] = ex ? ex.modeId : coll.addMode(nm); }
    // prune stale modes (a breakpoint the user removed) — never the default, never the last remaining mode.
    const wanted = new Set(plan.modes.map((m) => String(m).toLowerCase()));
    for (const m of coll.modes.slice()) {
      if (m.modeId === defaultId) continue;
      if (!wanted.has(m.name.toLowerCase()) && coll.modes.length > 1) coll.removeMode(m.modeId);
    }
    // variables: create-or-reuse by name; write every mode's value; prune orphans scoped to THIS collection.
    const byName = await varsByName(coll.id);
    for (const [oldName, newName] of Object.entries(plan.renames || {})) {
      if (byName[oldName] && !byName[newName]) {
        byName[oldName].name = newName;
        byName[newName] = byName[oldName];
        delete byName[oldName];
      }
    }
    const current = new Set();
    for (const v of plan.variables) {
      const vr = byName[v.name] || figma.variables.createVariable(v.name, coll, v.type || "FLOAT");
      for (const pair of v.values) {
        const mid = modeId[pair.mode];
        if (mid != null && Number.isFinite(Number(pair.value))) vr.setValueForMode(mid, Number(pair.value));
      }
      byName[v.name] = vr; current.add(v.name); variables++;
    }
    for (const name of Object.keys(byName)) if (!current.has(name)) byName[name].remove();
    // retire — collections THIS plan supersedes (plan.retire; TKT-0009: the pre-merge "Typography"
    // moded collection, now folded into "Geometry" as the type/ group): registry-tracked ONLY
    // (provenance — never a user's own same-named collection), removed with their variables. Styles
    // re-bind to the merged targets in the SAME apply run (applyStylePlans executes after this).
    for (const nm of (Array.isArray(plan.retire) ? plan.retire : [])) {
      if (!reg[nm]) continue;
      const cols = await figma.variables.getLocalVariableCollectionsAsync();
      const stale = cols.find((c) => c.id === reg[nm]);
      if (stale) stale.remove();
      delete reg[nm];
    }
    collections++;
  }
  writeFloatRegistry(reg); // persist the name→id provenance map (any newly-created collections)
  return { collections: collections, variables: variables };
}
// === GENERATED:FLOAT_EXECUTOR END ===

// MIRRORS figma/plugin/code.js's color executor: readColorRegistry/writeColorRegistry/ensureCollection —
// a pure PROVENANCE executor (no planner to spec-gate against), using only figma.variables.* +
// figma.root.get/setPluginData, same as the float functions above. GENERATED (see the file-header note,
// TKT-0024) — the `colorparity` gate in test/figma/binder.mjs is now a TRIPWIRE proving the splice landed
// byte-identical, not the mechanism keeping the two copies in lockstep.
// === GENERATED:COLOR_EXECUTOR START ===
function readColorRegistry() {
  const raw = figma.root.getPluginData(COLOR_REGISTRY_KEY);
  if (!raw) return {};
  try { const r = JSON.parse(raw); return r && typeof r === "object" ? r : {}; } catch (e) { return {}; }
}

function writeColorRegistry(reg) { figma.root.setPluginData(COLOR_REGISTRY_KEY, JSON.stringify(reg)); }

async function ensureCollection(name, reg, renameFrom) {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const known = reg[name] && cols.find((c) => c.id === reg[name]);
  if (known) return known;
  for (const old of (Array.isArray(renameFrom) ? renameFrom : [])) {
    const prev = reg[old] && cols.find((c) => c.id === reg[old]);
    if (prev) {
      prev.name = name;
      reg[name] = prev.id;
      delete reg[old];
      return prev;
    }
  }
  const made = figma.variables.createVariableCollection(name);
  reg[name] = made.id;
  return made;
}
// === GENERATED:COLOR_EXECUTOR END ===

// refKey: mirror of semantic.js refPath / bind-plan.mjs targetName (ADR-016). Solid stops zero-pad
// to 3 digits ("50" -> "050"); scrim refs NEST — "500-200" -> "scrim/200" (the canonical 500 base is
// omitted; a non-500 base would emit "scrim/{base}/{step}").
function refKey(ref) {
  const s = String(ref);
  const dash = s.indexOf("-");
  if (dash === -1) return s.padStart(3, "0");
  const base = s.slice(0, dash);
  const step = s.slice(dash + 1).padStart(3, "0");
  return (base === "500" ? "scrim/" : "scrim/" + base.padStart(3, "0") + "/") + step;
}

// roleTable(paletteName) — the 53 roles for a palette, name-substituted exactly as semantic.js /
// bind-plan.mjs produce them: accent + on-accent keys carry the palette name; shared roles do not.
// GENERATED (see the file-header note): this is src/engine/semantic.js's semanticRoles() function BODY,
// spliced verbatim by scripts/gen-figma-binder-code.mjs and re-wrapped under this name — the row shape
// ({key,suffix,light,dark}) is identical, so there is nothing to reimplement, only re-wrap.
// === GENERATED:ROLE_TABLE START ===
const SCRIM_STRENGTH_STEPS = [50, 100, 200, 300, 400, 500, 600];
const SCRIM_SUFFIXES = [
  '-scrim-weakest',
  '-scrim-weaker',
  '-scrim-weak',
  '-scrim',
  '-scrim-strong',
  '-scrim-stronger',
  '-scrim-strongest',
];
const SCRIM_KEYS = [
  'scrimWeakest',
  'scrimWeaker',
  'scrimWeak',
  'scrim',
  'scrimStrong',
  'scrimStronger',
  'scrimStrongest',
];

function roleTable(paletteName) {
  const n = paletteName;
  const N = paletteName.charAt(0).toUpperCase() + paletteName.slice(1);

  const roles = [];
  const role = (key, suffix, light, dark) =>
    roles.push({ key, suffix, light, dark });

  // 1. ACCENT — name-prefixed keys; suffix builds --c-{n}{suffix}.
  //    Prime role has empty suffix => --c-{n}. Refs are raw solid stops.
  role(`${n}`, '', '550', '450'); // prime: 550 light / 450 dark
  role(`${n}Dim`, '-dim', '650', '700');
  role(`${n}Bright`, '-bright', '350', '400');
  role(`${n}Low`, '-low', '350', '700');
  role(`${n}High`, '-high', '650', '400');

  // 1b. ACCENT INTERACTION STATES — tonal offsets along the palette's own ramp, so they stay in-gamut
  //     and consistent across every palette for free. Emphasis grows by DARKENING on light surfaces and
  //     LIGHTENING on dark (mode-mirrored): hover = prime ±1 step, active = prime ±2 (same direction, so
  //     pressed reads "more" than hover). DISABLED is NOT a tonal sibling — there is no neutral/desaturate
  //     primitive in the per-palette ref model, so it is a translucent wash of the palette's own 500 at 60%
  //     (a mid-alpha scrim reads clearly inert without vanishing on any surface; light === dark, like outline/container).
  role(`${n}Hover`, '-hover', '650', '350'); // prime +1 step toward emphasis (darker light / lighter dark)
  role(`${n}Active`, '-active', '750', '250'); // prime +2 steps — pressed is "more" than hover
  role(`${n}Disabled`, '-disabled', '500-600', '500-600'); // 60% wash — inert but legible, mode-independent

  // 2. ON-ACCENT — name-prefixed; fixed to the light end in BOTH modes (OD-001).
  role(`on${N}`, `-on-${n}`, '50', '50');
  role(`on${N}Variant`, `-on-${n}-variant`, '200', '200');

  // 2b. ON-ACCENT INTERACTION STATES — the label color on each state fill. Hover/Active TRACK the base
  //     on-color (the same fixed light end by default; applyOnColorContrast re-points them against their
  //     OWN state fill — 650/350 hover, 750/250 active — in "contrast" mode). DISABLED deliberately opts
  //     OUT of the contrast guarantee: a translucent label over the faint fill, intentionally sub-4.5:1
  //     so the control reads inert.
  role(`on${N}Hover`, `-on-${n}-hover`, '50', '50');
  role(`on${N}Active`, `-on-${n}-active`, '50', '50');
  role(`on${N}Disabled`, `-on-${n}-disabled`, '500-400', '500-400'); // translucent inert label

  // 3. ON-SURFACE — shared keys (NOT name-prefixed).
  role('onSurface', '-on-surface', '950', '50');
  role('onSurfaceVariant', '-on-surface-variant', '750', '250');

  // 3b. ON-SURFACE INTERACTION STATES — shared. onSurface sits at the contrast CEILING at rest (950/50),
  //     so hover/active HOLD there (no stronger solid stop exists; the emphasis is carried by the surface/
  //     container behind the text, like on-accent hover/active). DISABLED is a translucent inert label on
  //     the 500 ramp (opts out of the contrast guarantee). onSurfaceVariant (the secondary-text tier)
  //     carries NO interaction states — a per-state secondary-text role earns little, so its emphasis is a
  //     `hover:`/`active:` opacity modifier on the base role, not a distinct token.
  role('onSurfaceHover', '-on-surface-hover', '950', '50');
  role('onSurfaceActive', '-on-surface-active', '950', '50');
  role('onSurfaceDisabled', '-on-surface-disabled', '500-400', '500-400'); // translucent inert label

  // placeholder — input/field placeholder text: one mirrored step MORE muted than onSurfaceVariant
  // (650/350 vs 750/250), so it reads as a secondary hint yet still clears a legibility floor against the
  // field surface. A SOLID stop, NOT a translucent wash — translucent placeholder text is the classic a11y
  // failure. Like the other on-surface text it is fixed per mode (it is not contrast-repointed).
  role('placeholder', '-placeholder', '650', '350');

  // 4. OUTLINE — shared; on the 500 scrim ramp (light === dark).
  role('outline', '-outline', '500-600', '500-600');
  role('outlineVariant', '-outline-variant', '500-300', '500-300'); // the weaker divider — NO interaction states (see 4b)

  // 4b. OUTLINE INTERACTION STATES — shared; one strength stronger per state (hover +1, active +2 on the
  //     500 ramp), disabled a faint border. Mode-independent like the base outline. outlineVariant (the
  //     weaker divider) carries NONE — a divider rarely needs per-state role tokens; when it does, a
  //     `hover:`/`active:` opacity modifier on the base outlineVariant covers it.
  role('outlineHover', '-outline-hover', '500-700', '500-700');
  role('outlineActive', '-outline-active', '500-800', '500-800');
  role('outlineDisabled', '-outline-disabled', '500-400', '500-400'); // 40% — the disabled content tier (matches on-surface/label), still receding below the 60% resting outline

  // 5. CONTAINER — shared; on the 500 scrim ramp (light === dark).
  role('container', '-container', '500-200', '500-200');
  role('containerLow', '-container-low', '500-100', '500-100');
  role('containerHigh', '-container-high', '500-300', '500-300');

  // 5b. CONTAINER INTERACTION STATES — shared; one strength stronger per state (hover +1, active +2),
  //     disabled the faintest. Mode-independent like the base container.
  role('containerHover', '-container-hover', '500-300', '500-300');
  role('containerActive', '-container-active', '500-400', '500-400');
  role('containerDisabled', '-container-disabled', '500-100', '500-100');

  // 6. INVERSE — shared.
  role('inverseSurface', '-inverse-surface', '900', '100');
  role('inverseOnSurface', '-inverse-on-surface', '50', '950');

  // 7. SURFACE — shared base surfaces.
  role('background', '-background', '100', '900');
  role('surface', '-surface', '125', '875');

  // 8. SURFACE DIM/BRIGHT — shared; non-mirror (light+dark do NOT sum to 1000).
  //    Same direction in both modes: a "dim" surface is a darker stop in both.
  role('surfaceDimmest', '-surface-dimmest', '200', '950');
  role('surfaceDimmer', '-surface-dimmer', '175', '925');
  role('surfaceDim', '-surface-dim', '150', '900');
  role('surfaceBright', '-surface-bright', '100', '850');
  role('surfaceBrighter', '-surface-brighter', '75', '825');
  role('surfaceBrightest', '-surface-brightest', '50', '800');

  // 9. SURFACE LOW/HIGH — shared; mirror (light+dark sum toward 1000) so
  //     "lower" reads recessed and "higher" raised regardless of mode.
  role('surfaceLowest', '-surface-lowest', '50', '950');
  role('surfaceLower', '-surface-lower', '75', '925');
  role('surfaceLow', '-surface-low', '100', '900');
  role('surfaceHigh', '-surface-high', '150', '850');
  role('surfaceHigher', '-surface-higher', '175', '825');
  role('surfaceHighest', '-surface-highest', '200', '800');

  // 10. SCRIM — shared; 7 strengths, all on the 500 ramp at alpha% = step/10. Mode-independent
  //     (light === dark === `500-${pad3(step)}`, e.g. `500-050`). Listed LAST so the emitted token order
  //     groups as regular colors → containers → surfaces → scrims — a cleaner Figma variable / CSS list.
  for (let i = 0; i < SCRIM_STRENGTH_STEPS.length; i++) {
    const ref = `500-${String(SCRIM_STRENGTH_STEPS[i]).padStart(3, '0')}`; // ADR-006 3-digit alpha: 50 -> "050"
    role(SCRIM_KEYS[i], SCRIM_SUFFIXES[i], ref, ref);
  }

  return roles;
}
// === GENERATED:ROLE_TABLE END ===

// The raw-colors target a ref resolves to: "{n}/{refKey(ref)}" — the load-bearing grammar.
// Identical to bind-plan.mjs targetName; guarantees membership in the canonical raw name set.
function targetName(paletteName, ref) {
  return paletteName + "/" + refKey(ref);
}

async function main() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const rawColl = collections.find((c) => c.name === RAW_COLLECTION);

  // Color and Type/Geometry breakpoints are INDEPENDENT — neither aborts the other. Color needs a live
  // "Color Primitives" collection to alias against (skipped, not fatal, when absent); the breakpoint
  // collections are baked data (FLOAT_PLANS) that need nothing from the file.
  let bound = 0;
  const missing = [];
  if (rawColl) {
    // 1. Index the Color Primitives variables by name.
    const allVars = await figma.variables.getLocalVariablesAsync();
    const rawVars = {};
    for (const v of allVars) {
      if (v.variableCollectionId === rawColl.id) rawVars[v.name] = v;
    }

    // 2. Create/find the Color Semantic collection with Light + Dark modes — by PROVENANCE (registry id),
    //    never by name, so a user's own "Color Semantic" collection is never adopted (TKT-0024).
    const colorReg = readColorRegistry();
    const sem = await ensureCollection(SEMANTIC_COLLECTION, colorReg);
    writeColorRegistry(colorReg);
    const lightMode = sem.modes[0].modeId;
    const darkMode = (sem.modes[1] && sem.modes[1].modeId) || sem.addMode("Dark");

    // 3. For each palette and role, resolve lt/dt = rawVars["{n}/{refKey(...)}"] and alias both
    //    modes by reference (the cascade). Mirrors bind-plan.mjs.bindingPlan.
    for (const n of PALETTES) {
      for (const r of roleTable(n)) {
        const ltName = targetName(n, r.light);
        const dtName = targetName(n, r.dark);
        const lt = rawVars[ltName];
        const dt = rawVars[dtName];
        if (!lt) { missing.push(ltName); continue; }
        if (!dt) { missing.push(dtName); continue; }

        const semName = n + "/" + (r.suffix ? r.suffix.slice(1) : n); // ADR-016 kebab leaf
        const refreshed = await figma.variables.getLocalVariablesAsync();
        const semVar =
          refreshed.find((v) => v.variableCollectionId === sem.id && v.name === semName) ||
          figma.variables.createVariable(semName, sem, "COLOR");

        semVar.setValueForMode(lightMode, figma.variables.createVariableAlias(lt));
        semVar.setValueForMode(darkMode, figma.variables.createVariableAlias(dt));
        bound++;
      }
    }
  }

  // 4. Type/Geometry breakpoint-moded FLOAT collections — baked at download time (see FLOAT_PLANS above).
  //    A no-op (fp stays null) for the generic/asset checked-in binder, whose FLOAT_PLANS is [].
  let fp = null;
  if (FLOAT_PLANS.length) fp = await applyFloatPlans(FLOAT_PLANS);

  if (!rawColl && !fp) {
    figma.notify('No "Color Primitives" collection found — apply your palette in Ultimate Tokens first, then run the Binder.', { error: true });
    figma.closePlugin();
    return;
  }

  const parts = [];
  parts.push(
    rawColl
      ? "Bound " + bound + " colour role" + (bound === 1 ? "" : "s") + (missing.length ? (", " + missing.length + " skipped (raw colour missing)") : "")
      : 'Colour skipped — no "Color Primitives" collection',
  );
  if (fp) parts.push(fp.collections + " breakpoint collection" + (fp.collections === 1 ? "" : "s") + ", " + fp.variables + " sized var" + (fp.variables === 1 ? "" : "s"));
  figma.notify(parts.join(" · "));
  figma.closePlugin();
}

// Never surface a raw error / stack to the user (Figma policy): log the technical detail to the console,
// show a friendly message, and close cleanly.
main().catch((e) => {
  console.error("[Color Tokens Semantic Binder] bind failed:", e);
  figma.notify("Couldn't bind the semantic variables. Please try again — if it keeps happening, open an issue at github.com/kimgranlund/ultimate-tokens.", { error: true });
  figma.closePlugin();
});
