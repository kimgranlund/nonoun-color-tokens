// code.js — Ultimate Tokens by NONOUN, Figma plugin SANDBOX (the `main`).
//
// Runs in Figma's plugin VM: the `figma` global is available, but there is NO DOM, no
// fetch/XMLHttpRequest/WebSocket, no localStorage (ADR-010 / AC-P3 — offline by design;
// manifest networkAccess is "none"). The generator UI runs in the iframe (ui.html); this
// file only (a) opens that UI and (b) on an "apply" message turns the posted DTCG bundle
// into two Figma variable COLLECTIONS:
//
//   Color Primitives  (mode "Value")        — one COLOR var per stop/scrim, the concrete colors
//   Color Modes        (modes "Light","Dark")— one COLOR var per role, each mode ALIASED to the
//                                        raw var named by the leaf's com.figma.aliasData
//                                        (the live raw→semantic cascade native import can't do)
//
// The bundle comes from the UI's figmaBundle() = exportDTCG(state, { rawColl:"Color Primitives" }),
// so this file is palette-agnostic: it walks the tree, it does NOT hard-code the role table.

const RAW_COLLECTION = "Color Primitives";   // the raw color primitives (one "Value" mode)
const SEMANTIC_COLLECTION = "Color Modes";   // the semantic Light/Dark tokens

figma.showUI(__html__, { width: 1440, height: 900, themeColors: true });
// Tell the UI it is running inside Figma so it reveals its "Apply to Figma" button.
figma.ui.postMessage({ type: "figma-init" });

// CONFIG_KEY — the generator's parametric config, persisted IN this file on the DOCUMENT ROOT via
// setPluginData. This is the "source of truth" round-trip: the exact hue/chroma/skew/lift, global
// controls, AND role overrides — NOT the resolved colors (those are the variables, written by "apply",
// and cannot reverse-derive the params). Root pluginData is saved inside the .fig and TRAVELS WITH THE
// FILE (shared with everyone who opens it), unlike clientStorage which is per-user-machine. So a read
// reproduces the generator's state LOSSLESSLY instead of approximating it from the 500 colors.
const CONFIG_KEY = "ultimate-tokens-config"; // (matches SETS_KEY's `ultimate-tokens-*` naming)
// NOTE — there is no legacy pluginData fallback, and there cannot be one. Figma namespaces
// `root.setPluginData` BY PLUGIN ID, and this plugin's id changed (nonoun-color-tokens ->
// ultimate-tokens) with the product rename: data written under the old id is unreadable by this
// plugin, at any key. Files applied before the rename lose their embedded config (re-import the
// config JSON, or re-apply) and their provenance registries (the first apply re-adopts collections
// and styles BY NAME, then re-registers them — nothing is duplicated, nothing stale is pruned once).
                                        // rename still load; the next writeConfig migrates them forward.

// SETS_KEY — the gallery's "Your Palettes" sets, persisted in figma.clientStorage (PER-USER, survives
// across plugin sessions). The plugin UI iframe has an opaque origin, so its localStorage is blocked /
// non-persistent; clientStorage is the sanctioned per-user store. (Mirrors the browser's localStorage
// key `ultimate-tokens-sets`, so the same gallery data model round-trips in both environments.)
const SETS_KEY = "ultimate-tokens-sets";

// FLOAT_REGISTRY_KEY — the PROVENANCE registry for the breakpoint-moded Type/Geometry collections, a
// name→collectionId map stored in root pluginData (travels with the .fig, like CONFIG_KEY). applyFloatPlans
// reconciles/prunes ONLY a collection we created (matched by id), so a user's OWN pre-existing collection
// named "Typography"/"Geometry" is never canonicalized or pruned — we make a separate one instead.
const FLOAT_REGISTRY_KEY = "ultimate-tokens-float-collections";

// writeConfig / readConfig — the file-embedded parametric config (root pluginData is a string store;
// getPluginData returns "" when unset). JSON-encoded; a corrupt value reads back as null, never throws.
function writeConfig(config) { figma.root.setPluginData(CONFIG_KEY, JSON.stringify(config)); }
function readConfig() {
  const raw = figma.root.getPluginData(CONFIG_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; } // NB: param required — Figma's plugin VM rejects optional catch binding (ES2019)
}
// readFloatRegistry / writeFloatRegistry — the {name: collectionId} provenance map (see FLOAT_REGISTRY_KEY).
function readFloatRegistry() {
  const raw = figma.root.getPluginData(FLOAT_REGISTRY_KEY);
  if (!raw) return {};
  try { const r = JSON.parse(raw); return r && typeof r === "object" ? r : {}; } catch (e) { return {}; }
}
function writeFloatRegistry(reg) { figma.root.setPluginData(FLOAT_REGISTRY_KEY, JSON.stringify(reg)); }

// ACTIONS — each request mapped to a human action, so a failure reads as "couldn't <do X>" instead of a
// raw developer error (Figma policy: never surface raw error text / stack traces to users).
const ACTIONS = {
  apply: "apply the variables",
  "save-config": "save the palette set",
  "load-config": "load the palette set",
  "read-variables": "read this file's variables",
  "list-fonts": "read Figma's font list",
  "load-sets": "load your palettes",
  "save-sets": "save your palettes",
};

figma.ui.onmessage = async (msg) => {
  if (!msg) return;
  try {
    if (msg.type === "apply") {
      // `dtcg` is OMITTED when the Color system is toggled off in the UI — skip the color collections
      // entirely (the existing ones are left untouched, not pruned). Type/Geometry filtering happens UI-side.
      const r = msg.dtcg ? await applyBundle(msg.dtcg, { rebuildSemantic: !!msg.rebuildSemantic }) : null;
      // Embed the exact params in the file ALONGSIDE the variables, so a later read round-trips
      // losslessly (the variables alone can only seed an approximate hue/chroma).
      if (msg.config) writeConfig(msg.config);
      // Type + Geometry breakpoint-moded FLOAT collections (UI-computed, pre-validated apply plans). Isolated
      // in its OWN try so a float-apply failure can't mask the color apply that already succeeded above — the
      // user still gets the color result (+ a console error), and a re-apply (idempotent) converges the rest.
      let fr = null;
      if (Array.isArray(msg.floatPlans) && msg.floatPlans.length) {
        try { fr = await applyFloatPlans(msg.floatPlans); }
        catch (e) { console.error("[Ultimate Tokens] type/geometry apply failed:", e); }
      }
      // STYLES (opt-out): paint + text styles bound to the variables just applied. Own try — a styles
      // failure never masks the variable apply that already succeeded.
      let sr = null;
      if (msg.stylePlans && ((msg.stylePlans.paints || []).length || (msg.stylePlans.texts || []).length)) {
        try {
          if (msg.fontPrimitives) await applyFontPrimitives(msg.fontPrimitives);
          sr = await applyStylePlans(msg.stylePlans);
        } catch (e) { console.error("[Ultimate Tokens] styles apply failed:", e); }
      }
      const parts = [];
      if (r) parts.push(`${r.raw} primitives + ${r.semantic} semantic variables (Light / Dark)` + (r.rebuilt ? ", regrouped" : "") + (r.pruned ? `, ${r.pruned} stale pruned` : ""));
      if (fr && fr.collections) parts.push(`${fr.variables} type/geometry variable${fr.variables === 1 ? "" : "s"} across ${fr.collections} collection${fr.collections === 1 ? "" : "s"}`);
      if (sr && (sr.paints || sr.texts)) parts.push(`${sr.paints + sr.texts} style${sr.paints + sr.texts === 1 ? "" : "s"} (${sr.paints} color · ${sr.texts} text)` + (sr.pruned ? `, ${sr.pruned} stale pruned` : ""));
      if (sr && sr.substitutedFonts && sr.substitutedFonts.length) figma.notify(`${sr.substituted} text style(s) use a placeholder face — install to see them as designed: ${sr.substitutedFonts.slice(0, 3).join(", ")}${sr.substitutedFonts.length > 3 ? "…" : ""}`, { timeout: 6000 });
      if (sr && sr.missingFonts && sr.missingFonts.length) figma.notify(`Some text styles were skipped — no usable font: ${sr.missingFonts.slice(0, 3).join(", ")}${sr.missingFonts.length > 3 ? "…" : ""}`, { timeout: 6000 });
      figma.notify(parts.length ? "Applied " + parts.join(" · ") : "Nothing to apply — every system is toggled off.");
      // Signal the iframe UI that the async write actually COMPLETED (its optimistic "Applying…" toast alone
      // can't know when the sandbox finishes) → onApplyDone shows a real "Applied N…" toast + closes the gate.
      figma.ui.postMessage({ type: "apply-done", raw: r ? r.raw : 0, semantic: r ? r.semantic : 0, floatVars: fr ? fr.variables : 0, floatCollections: fr ? fr.collections : 0, paintStyles: sr ? sr.paints : 0, textStyles: sr ? sr.texts : 0, missingFonts: sr && sr.missingFonts ? sr.missingFonts : [], substitutedFonts: sr && sr.substitutedFonts ? sr.substitutedFonts : [], substituted: sr ? sr.substituted : 0 });
    } else if (msg.type === "save-config") {
      writeConfig(msg.config);
      figma.notify("Palette set saved into this file");
    } else if (msg.type === "load-config") {
      const config = readConfig();
      figma.ui.postMessage({ type: "config-loaded", config });
      if (!config) figma.notify("No saved palette set in this file");
    } else if (msg.type === "list-fonts") {
      // the UI asks which font FAMILIES this Figma can actually use, so the Fonts panel can mark a
      // family that will be substituted (see applyStylePlans' scaffold path). Families only — the
      // face list is large and the panel needs presence, not weights.
      var fams = {};
      for (const f of await figma.listAvailableFontsAsync()) { const fn = f.fontName || f; fams[fn.family] = 1; }
      figma.ui.postMessage({ type: "fonts-listed", families: Object.keys(fams) });
    } else if (msg.type === "read-variables") {
      const live = await readRawColors(); // read-only reference for the drift diff
      figma.ui.postMessage({ type: "variables-read", found: live.found, raw: live.raw });
      if (!live.found) figma.notify('No "Color Primitives" collection in this file yet');
    } else if (msg.type === "load-sets") {
      // the gallery's saved sets, from this user's clientStorage (null on first run).
      const sets = await figma.clientStorage.getAsync(SETS_KEY);
      figma.ui.postMessage({ type: "sets-loaded", sets: sets || null });
    } else if (msg.type === "save-sets") {
      // persist the gallery's sets for this user (the localStorage the iframe can't use).
      await figma.clientStorage.setAsync(SETS_KEY, Array.isArray(msg.sets) ? msg.sets : []);
    }
  } catch (e) {
    // Log the technical detail to the console for debugging; show the user a friendly, actionable
    // message naming what was attempted (never the raw error / stack).
    console.error("[Color Tokens] '" + (msg && msg.type) + "' failed:", e);
    // Tell the iframe an apply FAILED so it can clear its optimistic "Applying…" toast (→ onApplyError).
    if (msg && msg.type === "apply") { try { figma.ui.postMessage({ type: "apply-error" }); } catch (e2) { /* UI gone */ } }
    const what = (msg && ACTIONS[msg.type]) || "complete that action";
    figma.notify("Color Tokens couldn't " + what + ". Please try again — if it keeps happening, email support@nonoun.io.", { error: true });
  }
};

// ── helpers ───────────────────────────────────────────────────────────────────
// rgbaOf — a DTCG color leaf's $value → Figma's {r,g,b,a} (components are already 0..1).
function rgbaOf(leaf) {
  const c = (leaf && leaf.$value) || leaf;
  const k = c.components;
  return { r: k[0], g: k[1], b: k[2], a: typeof c.alpha === "number" ? c.alpha : 1 };
}
// childKeys — a DTCG group's token children (skip $type/$value/$extensions).
const childKeys = (tree) => Object.keys(tree).filter((k) => k[0] !== "$");
// aliasTarget — the raw var name a semantic leaf points at (set when rawColl was on).
function aliasTarget(leaf) {
  const ad = leaf && leaf.$extensions && leaf.$extensions["com.figma.aliasData"];
  return ad ? ad.targetVariableName : null;
}
async function ensureCollection(name) {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  return cols.find((c) => c.name === name) || figma.variables.createVariableCollection(name);
}
// ensureFloatCollection — OUR managed Type/Geometry collection for `name`, by PROVENANCE (the registry's
// stored id), creating + registering it if absent. Unlike ensureCollection (color), it NEVER adopts a
// same-named collection it didn't create — so applyFloatPlans' rename/prune can't ever hit a user's own
// "Typography"/"Geometry". A user manual-rename survives (we track id, not name); a user-deleted one is
// re-created. `reg` is mutated in place; the caller persists it once via writeFloatRegistry.
async function ensureFloatCollection(name, reg) {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const known = reg[name] && cols.find((c) => c.id === reg[name]);
  if (known) return known;
  const made = figma.variables.createVariableCollection(name);
  reg[name] = made.id;
  return made;
}
// rgbaToHex — a Figma color value {r,g,b,a} (0..1) -> "#RRGGBB" (or "#RRGGBBAA" when a < 1),
// matching the generator's emitted hex form so a live value can be diffed against generated.
function rgbaToHex(c) {
  const h = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0").toUpperCase();
  const base = "#" + h(c.r) + h(c.g) + h(c.b);
  return typeof c.a === "number" && c.a < 1 ? base + h(c.a) : base;
}

// readRawColors — the live Color Primitives variable values, as { "{n}/{key}": "#RRGGBB(AA)" }. Read-only
// reference for the drift diff (NO reverse-derive of params — colors only). Returns {} if absent.
async function readRawColors() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const raw = cols.find((c) => c.name === RAW_COLLECTION);
  if (!raw) return { found: false, raw: {} };
  const mode = raw.modes[0].modeId;
  const all = await figma.variables.getLocalVariablesAsync();
  const out = {};
  for (const v of all) {
    if (v.variableCollectionId !== raw.id) continue;
    const val = v.valuesByMode ? v.valuesByMode[mode] : undefined;
    if (val && typeof val.r === "number") out[v.name] = rgbaToHex(val); // skip aliases (no .r)
  }
  return { found: true, raw: out };
}

async function varsByName(collectionId) {
  const all = await figma.variables.getLocalVariablesAsync();
  const m = {};
  for (const v of all) if (v.variableCollectionId === collectionId) m[v.name] = v;
  return m;
}

// ── STYLES: Font Primitives + paint/text styles bound to the variables ─────────────────────────
// The UI computes the plans (figma/binder/style-plan.mjs — pure, parity-gated); this executor runs
// them verbatim. Provenance: STYLE_REGISTRY_KEY records the style ids WE created (name → id), so
// pruning can never touch a user's own styles — the float-registry discipline, applied to styles.
const STYLE_REGISTRY_KEY = "ultimate-tokens-styles";
function readStyleRegistry() {
  try {
    const raw = figma.root.getPluginData(STYLE_REGISTRY_KEY);
    const reg = raw ? JSON.parse(raw) : null;
    return reg && typeof reg === "object" ? { paints: reg.paints || {}, texts: reg.texts || {} } : { paints: {}, texts: {} };
  } catch (e) { return { paints: {}, texts: {} }; }
}
function writeStyleRegistry(reg) { figma.root.setPluginData(STYLE_REGISTRY_KEY, JSON.stringify(reg)); }

// applyFontPrimitives — ensure the single-mode "Font Primitives" collection (family STRINGs, weight
// FLOATs, font/<voice> aliases) the text styles bind into. The plan (primitivesApplyPlan) is ordered
// literals-first, so every alias target already exists when the alias is written.
async function applyFontPrimitives(plan) {
  if (!plan || !plan.collection || !Array.isArray(plan.variables) || !plan.variables.length) return null;
  const reg = readFloatRegistry(); // same provenance store as Typography/Geometry (name → collection id)
  const coll = await ensureFloatCollection(plan.collection, reg);
  const defaultId = coll.defaultModeId || coll.modes[0].modeId;
  coll.renameMode(defaultId, plan.mode || "Value");
  const byName = await varsByName(coll.id);
  const current = new Set();
  let count = 0;
  for (const v of plan.variables) {
    if (!v || !v.name) continue;
    if (v.type === "ALIAS") {
      const target = byName[v.target];
      if (!target) continue; // planner guarantees order; a missing target is a malformed plan — skip, never throw
      const vr = byName[v.name] || figma.variables.createVariable(v.name, coll, target.type || "STRING");
      vr.setValueForMode(defaultId, figma.variables.createVariableAlias(target));
      byName[v.name] = vr; current.add(v.name); count++;
    } else {
      const vr = byName[v.name] || figma.variables.createVariable(v.name, coll, v.type || "STRING");
      vr.setValueForMode(defaultId, v.type === "FLOAT" ? Number(v.value) : String(v.value));
      byName[v.name] = vr; current.add(v.name); count++;
    }
  }
  for (const name of Object.keys(byName)) if (!current.has(name)) byName[name].remove();
  writeFloatRegistry(reg);
  return { variables: count };
}

// resolveFace — pick a REAL face for {family, weight, styleName?} from Figma's actual font list
// (listAvailableFontsAsync), never guess-and-catch: the kit's styleName wins when it exists; else the
// style whose NAME-implied weight is nearest the requested weight (upright faces preferred over
// italics; "Regular" wins ties at equal distance via the name table's order). Returns the style
// string, or null when the family is not available in this Figma at all (the caller reports it).
const STYLE_NAME_WEIGHTS = [
  ["thin", 100], ["hairline", 100], ["extralight", 200], ["extra light", 200], ["ultralight", 200], ["ultra light", 200],
  ["light", 300], ["regular", 400], ["normal", 400], ["book", 400], ["medium", 500],
  ["semibold", 600], ["semi bold", 600], ["demibold", 600], ["demi bold", 600],
  ["extrabold", 800], ["extra bold", 800], ["ultrabold", 800], ["ultra bold", 800],
  ["bold", 700], ["black", 900], ["heavy", 900],
];
function styleNameWeight(style) {
  const s = String(style).toLowerCase();
  for (const pair of STYLE_NAME_WEIGHTS) if (s.indexOf(pair[0]) >= 0) return pair[1];
  return 400; // an unnamed cut reads as the family's regular
}
// pickFallbackFamily — when the kit's family is absent from this Figma, the style still gets BUILT:
// a loadable placeholder face carries the metrics while `fontFamily`/`fontStyle` stay BOUND to the
// Font Primitives variables that carry the TRUE family. Figma resolves a text style's family from the
// bound variable, so the style self-heals the moment the real font is installed. Prefer Figma's own
// default (Inter), then Roboto, then any family — a substitution is reported, never silent.
function pickFallbackFamily(fontsByFamily) {
  for (const pref of ["Inter", "Roboto"]) if (fontsByFamily[pref] && fontsByFamily[pref].length) return pref;
  for (const fam of Object.keys(fontsByFamily)) if (fontsByFamily[fam] && fontsByFamily[fam].length) return fam;
  return null;
}

function resolveFace(stylesOfFamily, literal) {
  if (!stylesOfFamily || !stylesOfFamily.length) return null;
  const wanted = literal && typeof literal.styleName === "string" ? literal.styleName : "";
  if (wanted && stylesOfFamily.indexOf(wanted) >= 0) return wanted;
  const w = literal && Number.isFinite(literal.weight) ? literal.weight : 400;
  const upright = stylesOfFamily.filter(function (st) { return !/italic|oblique/i.test(st); });
  const pool = upright.length ? upright : stylesOfFamily;
  let best = pool[0], bestD = Infinity;
  for (const st of pool) {
    const d = Math.abs(styleNameWeight(st) - w);
    if (d < bestD) { best = st; bestD = d; }
  }
  return best;
}

// applyStylePlans — paint styles bound to the Color Modes variables; text styles set from the plan's
// literals then BOUND per field to the Typography / Font Primitives variables where the target exists
// (per-field graceful fallback: an absent variable or an unsupported binding leaves the literal value).
// lineHeight/letterSpacing stay LITERAL PERCENT in v1 — the Typography vars carry them as % of size,
// and a FLOAT binding on those fields reads as px, which would mis-set them.
async function applyStylePlans(sp) {
  const out = { paints: 0, texts: 0, pruned: 0, missingVars: 0 };
  const reg = readStyleRegistry();

  // ── paint styles → Color Modes variables ──
  const paints = Array.isArray(sp.paints) ? sp.paints : [];
  if (paints.length) {
    const cols = await figma.variables.getLocalVariableCollectionsAsync();
    const sem = cols.find(function (c) { return c.name === SEMANTIC_COLLECTION; });
    const semVars = sem ? await varsByName(sem.id) : {};
    const local = await figma.getLocalPaintStylesAsync();
    const byName = {};
    for (const st of local) byName[st.name] = st;
    const current = {};
    for (const p of paints) {
      const variable = semVars[p.varName];
      if (!variable) { out.missingVars++; continue; }
      let st = byName[p.name];
      if (!st && reg.paints[p.name]) { try { st = await figma.getStyleByIdAsync(reg.paints[p.name]); } catch (e) { st = null; } }
      if (!st) st = figma.createPaintStyle();
      st.name = p.name;
      st.paints = [figma.variables.setBoundVariableForPaint({ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 }, "color", variable)];
      current[p.name] = st.id; out.paints++;
    }
    for (const name of Object.keys(reg.paints)) {
      if (current[name]) continue;
      try { const st = await figma.getStyleByIdAsync(reg.paints[name]); if (st) { st.remove(); out.pruned++; } } catch (e) { /* already gone */ }
    }
    reg.paints = current;
  }

  // ── text styles → Typography + Font Primitives variables ──
  const texts = Array.isArray(sp.texts) ? sp.texts : [];
  if (texts.length) {
    const cols = await figma.variables.getLocalVariableCollectionsAsync();
    // PROVENANCE FIRST: resolve OUR collections by the float-registry id (name → id map written by
    // ensureFloatCollection), falling back to name. A name-only find can hit a foreign same-named
    // collection (or miss after a user rename) — then every typo binding silently degrades to the
    // literal, which reads as "the props are hardcoded".
    const floatReg = readFloatRegistry();
    const byRegistry = function (name) {
      const id = floatReg[name];
      return (id && cols.find(function (c) { return c.id === id; })) || cols.find(function (c) { return c.name === name; });
    };
    const typoColl = byRegistry("Typography");
    const primColl = byRegistry("Font Primitives");
    const typoVars = typoColl ? await varsByName(typoColl.id) : {};
    const primVars = primColl ? await varsByName(primColl.id) : {};
    const local = await figma.getLocalTextStylesAsync();
    const byName = {};
    for (const st of local) byName[st.name] = st;
    // the REAL font list, once: family → its available style strings. Faces are resolved from this
    // (nearest name-implied weight), never guessed-and-caught — a wrong guess used to abandon a
    // freshly-created style at Figma's defaults (Inter Regular 12).
    const fontsByFamily = {};
    try {
      for (const f of await figma.listAvailableFontsAsync()) {
        const fn = f.fontName || f;
        if (!fontsByFamily[fn.family]) fontsByFamily[fn.family] = [];
        fontsByFamily[fn.family].push(fn.style);
      }
    } catch (e) { console.error("[Ultimate Tokens] couldn't list fonts:", e); }
    out.missingFonts = [];      // families with NO usable face at all (style skipped)
    out.substitutedFonts = [];  // families absent from this Figma (style BUILT on a placeholder face)
    out.substituted = 0;
    const fallbackFamily = pickFallbackFamily(fontsByFamily);
    const current = {};
    for (const t of texts) {
      const lit = t.literal || {};
      if (!lit.family || !Number.isFinite(lit.size)) continue;
      // resolve the kit's OWN face first; fall back to a loadable placeholder (the bound fontFamily
      // variable still carries the true family, so intent survives and self-heals on install).
      let useFamily = lit.family;
      let face = resolveFace(fontsByFamily[lit.family], lit);
      let didSubstitute = false;
      if (!face && fallbackFamily) {
        useFamily = fallbackFamily;
        face = resolveFace(fontsByFamily[fallbackFamily], lit);
        didSubstitute = true;
      }
      if (!face) { if (out.missingFonts.indexOf(lit.family) < 0) out.missingFonts.push(lit.family); continue; }
      try { await figma.loadFontAsync({ family: useFamily, style: face }); }
      catch (e) { if (out.missingFonts.indexOf(lit.family) < 0) out.missingFonts.push(lit.family); continue; }
      if (didSubstitute) {
        if (out.substitutedFonts.indexOf(lit.family) < 0) out.substitutedFonts.push(lit.family);
        out.substituted++;
      }
      // ONLY after the face is loaded: find-or-create + name + mutate (a load failure must never
      // create or reset a style).
      let st = byName[t.name];
      if (!st && reg.texts[t.name]) { try { st = await figma.getStyleByIdAsync(reg.texts[t.name]); } catch (e) { st = null; } }
      if (!st) st = figma.createTextStyle();
      st.name = t.name;
      st.fontName = { family: useFamily, style: face };
      st.fontSize = lit.size;
      if (Number.isFinite(lit.lineHeight) && lit.size > 0) st.lineHeight = { unit: "PERCENT", value: (lit.lineHeight / lit.size) * 100 };
      if (Number.isFinite(lit.letterSpacing) && lit.size > 0) st.letterSpacing = { unit: "PERCENT", value: (lit.letterSpacing / lit.size) * 100 };
      if (Number.isFinite(lit.paragraphSpacing)) st.paragraphSpacing = lit.paragraphSpacing;
      try { st.textCase = lit.textCase === "uppercase" ? "UPPER" : "ORIGINAL"; } catch (e) { /* older API */ }
      // per-field bindings — only where the target variable exists; an unsupported field falls back to
      // the literal already set above.
      const bind = t.bind || {};
      const bindField = function (field, pool) {
        const target = bind[field] && pool[bind[field]];
        if (!target) return;
        try { st.setBoundVariable(field, target); } catch (e) { /* field not bindable in this API — literal stands */ }
      };
      bindField("fontSize", typoVars);
      // leading/tracking: the PERCENT literals above set the unit context; the bound FLOAT carries the
      // same percent number. Verify rendering after a real apply — if Figma reads the bound value as px,
      // unbind these two fields and fall back to the literals.
      bindField("lineHeight", typoVars);
      bindField("letterSpacing", typoVars);
      bindField("paragraphSpacing", typoVars);
      bindField("fontFamily", primVars);
      bindField("fontStyle", primVars);
      bindField("fontWeight", primVars);
      current[t.name] = st.id; out.texts++;
    }
    for (const name of Object.keys(reg.texts)) {
      if (current[name]) continue;
      try { const st = await figma.getStyleByIdAsync(reg.texts[name]); if (st) { st.remove(); out.pruned++; } } catch (e) { /* already gone */ }
    }
    reg.texts = current;
    // diagnostics — the console is the debugging surface (figma.notify races and truncates):
    if (out.substitutedFonts.length) console.warn("[Ultimate Tokens]", out.substituted, "text style(s) built on a placeholder face — these families are not in this Figma:", out.substitutedFonts.join(", "), "· their fontFamily stays BOUND to the Font Primitives variable, so installing the font adopts it.");
    if (out.missingFonts.length) console.warn("[Ultimate Tokens] text styles skipped — no usable face at all:", out.missingFonts.join(", "), "(font list size:", Object.keys(fontsByFamily).length, "families)");
    if (!Object.keys(typoVars).length) console.warn("[Ultimate Tokens] Typography collection empty/missing at styles time — fontSize/leading/tracking bindings degraded to literals");
    if (!Object.keys(primVars).length) console.warn("[Ultimate Tokens] Font Primitives collection empty/missing at styles time — family/weight bindings degraded to literals");
  }

  writeStyleRegistry(reg);
  return out;
}

// ── the apply ───────────────────────────────────────────────────────────────────
// opts.rebuildSemantic — the opt-in "Regroup": delete the existing Color Modes collection so it is
// re-created fresh and adopts the bundle's (canonical, grouped) variable order. Figma keeps an
// existing variable's position on update, so a normal apply never reorders; only a fresh collection
// does. Color Primitives are untouched; bindings to the dropped Color Modes variables detach.
async function applyBundle(dtcg, opts) {
  opts = opts || {};
  const rawTree = dtcg && dtcg["palette.tokens.json"];
  const semLight = dtcg && dtcg["Light_tokens.json"];
  const semDark = dtcg && dtcg["Dark_tokens.json"];
  if (!rawTree || !semLight || !semDark) throw new Error("bundle missing palette/Light/Dark files");

  // 1) RAW collection — single "Value" mode, one COLOR var per stop/scrim.
  const raw = await ensureCollection(RAW_COLLECTION);
  raw.renameMode(raw.modes[0].modeId, "Value");
  const rawMode = raw.modes[0].modeId;
  const rawByName = await varsByName(raw.id);
  const currentRaw = new Set(); // names this bundle WANTS in Color Primitives — everything else is stale
  let rawCount = 0;
  for (const n of childKeys(rawTree)) {
    for (const key of childKeys(rawTree[n])) {
      const name = n + "/" + key;
      const v = rawByName[name] || figma.variables.createVariable(name, raw, "COLOR");
      v.setValueForMode(rawMode, rgbaOf(rawTree[n][key]));
      rawByName[name] = v;
      currentRaw.add(name);
      rawCount++;
    }
  }

  // 2) SEMANTIC collection — "Light" + "Dark" modes, each role ALIASED to its raw var.
  // Regroup: drop the existing Color Modes collection first so the rebuild creates every variable
  // fresh, in the bundle's canonical order (regular · containers · surfaces · scrims).
  let rebuilt = false;
  if (opts.rebuildSemantic) {
    const cols0 = await figma.variables.getLocalVariableCollectionsAsync();
    const old = cols0.find((c) => c.name === SEMANTIC_COLLECTION);
    if (old) { old.remove(); rebuilt = true; }
  }
  const sem = await ensureCollection(SEMANTIC_COLLECTION);
  const lightMode = sem.modes[0].modeId;
  sem.renameMode(lightMode, "Light");
  const darkMode = (sem.modes[1] && sem.modes[1].modeId) || sem.addMode("Dark");
  if (sem.modes[1]) sem.renameMode(darkMode, "Dark");
  const semByName = await varsByName(sem.id);
  const currentSem = new Set(); // names this bundle WANTS in Color Modes — everything else is stale
  let semCount = 0;
  for (const n of childKeys(semLight)) {
    for (const key of childKeys(semLight[n])) {
      const name = n + "/" + key;
      const v = semByName[name] || figma.variables.createVariable(name, sem, "COLOR");
      const lt = rawByName[aliasTarget(semLight[n][key])];
      const dt = rawByName[aliasTarget(semDark[n][key])];
      // Alias to the raw var (the cascade). Fall back to the resolved color if the raw
      // target is somehow absent, so a role is never left unset.
      v.setValueForMode(lightMode, lt ? figma.variables.createVariableAlias(lt) : rgbaOf(semLight[n][key]));
      v.setValueForMode(darkMode, dt ? figma.variables.createVariableAlias(dt) : rgbaOf(semDark[n][key]));
      semByName[name] = v;
      currentSem.add(name);
      semCount++;
    }
  }

  // 3) PRUNE orphans — make each GENERATED collection mirror the current bundle exactly, so a
  // scrim-model/format change or a removed/renamed/disabled palette can't leave stale variables
  // behind (e.g. the old base-index scrims 250-*/500-0..6/750-*). Scoped to these two generated
  // collections ONLY: rawByName/semByName are filtered by collection id (varsByName), so no other
  // collection is ever touched. Delete SEMANTIC orphans first — a stale semantic var may alias a
  // stale raw var we then remove, whereas every CURRENT semantic var aliases a CURRENT (kept) raw
  // var, so no live alias is broken.
  let pruned = 0;
  for (const name of Object.keys(semByName)) {
    if (!currentSem.has(name)) { semByName[name].remove(); pruned++; }
  }
  for (const name of Object.keys(rawByName)) {
    if (!currentRaw.has(name)) { rawByName[name].remove(); pruned++; }
  }

  return { raw: rawCount, semantic: semCount, pruned: pruned, rebuilt: rebuilt };
}

// ── the breakpoint-moded FLOAT apply (Type / Geometry) ────────────────────────────
// applyFloatPlans — execute the UI-computed apply PLANS that figma/binder/mode-apply-plan.mjs produces
// (one entry per collection: { collection, modes, defaultMode:"Base", addModes, variables:[{name,type,
// values:[{mode,value}]}] }). The plan is pure DATA the UI already ran validateModeInterchange + ordering
// over, so this file stays a thin EXECUTOR — there is no planner to inline or parity-gate (unlike the color
// cascade, which mirrors a role table). It mirrors the operation sequence documented in that module's header.
// Idempotent: collections, modes, and variables are reconciled BY NAME and stale ones pruned, so re-applying
// after a breakpoint/voice change converges the file to exactly the current plan (never doubling, never
// leaving a removed breakpoint's mode behind). Value-complete plans mean no mode is ever left unset.
async function applyFloatPlans(plans) {
  let collections = 0, variables = 0;
  const reg = readFloatRegistry(); // provenance: only ever touch a collection NONOUN created (see ensureFloatCollection)
  for (const plan of (Array.isArray(plans) ? plans : [])) {
    if (!plan || !plan.collection || !Array.isArray(plan.modes) || !plan.modes.length) continue;
    const coll = await ensureFloatCollection(plan.collection, reg);
    // The collection's DEFAULT mode (Figma rejects removing it) — rename it to the plan's first mode ("Base");
    // the rest are added (or reused) by NAME. Anchor on `defaultModeId`, not modes[0]: for a NONOUN-created
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
    collections++;
  }
  writeFloatRegistry(reg); // persist the name→id provenance map (any newly-created collections)
  return { collections: collections, variables: variables };
}

// Exposed for the headless verifier (a no-op inside Figma's VM).
if (typeof module !== "undefined") module.exports = { applyBundle, applyFloatPlans, applyFontPrimitives, applyStylePlans, resolveFace, pickFallbackFamily, styleNameWeight, rgbaOf, aliasTarget, childKeys };
