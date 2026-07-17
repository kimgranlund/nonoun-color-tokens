#!/usr/bin/env node
// verify.mjs — the figma-plugin-app validation adapter (CRITIC side).
// Gates the generator-as-Figma-plugin without Figma: manifest shape + offline, code.js
// parses + uses no network APIs, ui.html carries the generator + the bridge, AND the
// load-bearing contract — model.figmaBundle() fed to code.applyBundle() (on a MOCK figma)
// builds a Color Primitives collection + a Color Modes (Light/Dark) collection in which EVERY
// semantic var, in BOTH modes, is aliased to a raw var that was actually created.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { figmaBundle, defaultDocument } from "../../src/ui/model.mjs";
import * as TYPE from "../../src/engine/type.mjs";
import * as GEOM from "../../src/engine/geometry.mjs";
import { modeApplyPlan, mergeModeInterchanges } from "../../figma/binder/mode-apply-plan.mjs";
import { stylePlans, primitivesApplyPlan } from "../../figma/binder/style-plan.mjs";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "figma", "plugin"); // the generator-as-plugin lives in figma/plugin/
const fails = [];
const FAIL = (g, m) => { if (!fails.some((f) => f.startsWith(g + ":"))) fails.push(`${g}: ${m}`); };

// ── manifest: the plugin shape + offline (AC-P3) ────────────────────────────────
const mani = JSON.parse(readFileSync(`${HERE}/manifest.json`, "utf8"));
if (mani.main !== "code.js") FAIL("manifest", `main=${mani.main}, want code.js`);
if (mani.ui !== "ui.html") FAIL("manifest", `ui=${mani.ui}, want ui.html`);
if (!Array.isArray(mani.editorType) || !mani.editorType.includes("figma")) FAIL("manifest", "editorType must include 'figma'");
const na = mani.networkAccess;
const offline = na === "none" || (na && Array.isArray(na.allowedDomains) && na.allowedDomains.length === 1 && na.allowedDomains[0] === "none");
if (!offline) FAIL("manifest", "networkAccess must be 'none' — the plugin is offline by design (AC-P3)");

// ── code.js: parses + uses no network / dynamic-import APIs ──────────────────────
const code = readFileSync(`${HERE}/code.js`, "utf8");
const codeNoComments = code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""); // ignore the comment that NAMES these
if (/\bfetch\s*\(|new\s+(XMLHttpRequest|WebSocket)|\bimport\s*\(/.test(codeNoComments)) FAIL("offline", "code.js calls a network or dynamic-import API");

// Figma's plugin VM (jsvm-cpp) is NOT modern V8: optional catch binding (ES2019 — `catch {`
// with no param) PARSE-fails there, yet loads fine in Node — so this verifier's own
// new Function() load below can't catch it (real incident 2026-06-17: the whole plugin failed
// to run with "Syntax error: Unexpected token {"). Guard it statically. Write `catch (e) {`.
if (/\bcatch\s*\{/.test(codeNoComments)) FAIL("vmsyntax", "code.js uses optional catch binding (`catch {`) — Figma's plugin VM rejects it; use `catch (e) {`");

// ── compliance: no RAW developer error surfaced to users, no stale product branding ─────────────
// Figma policy rejects plugins that show raw error text / stack traces. The catch must notify a
// friendly, handled message (technical detail goes to console.error, not figma.notify).
if (/figma\.notify\([^;]*\b(?:e\.message|String\(e\)|err\.message|\.stack)\b/.test(codeNoComments))
  FAIL("compliance", "code.js surfaces a raw error in figma.notify — show a friendly message; log the detail to console only");
if (/figma\.notify\([^;]*HCT/.test(codeNoComments))
  FAIL("compliance", "a user-facing figma.notify still says 'HCT' (stale branding) — the product is 'Ultimate Tokens'");

// ── ui.html: the generator + the Figma bridge ───────────────────────────────────
if (!existsSync(`${HERE}/ui.html`)) FAIL("ui", "ui.html not generated — run gen-ui.mjs");
else {
  const ui = readFileSync(`${HERE}/ui.html`, "utf8");
  if (!ui.includes("<ultimate-tokens>")) FAIL("ui", "ui.html does not embed the generator (<ultimate-tokens>)");
  if (!/figma-init/.test(ui) || !/pluginMessage/.test(ui) || !/figmaBundle/.test(ui))
    FAIL("ui", "ui.html missing the bridge (figma-init listener / pluginMessage / figmaBundle())");
  if (!/config-loaded/.test(ui) || !/applyLoadedConfig/.test(ui))
    FAIL("ui", "ui.html missing the config round-trip bridge (config-loaded → applyLoadedConfig)");
  if (!/variables-read/.test(ui) || !/receiveLiveVariables/.test(ui))
    FAIL("ui", "ui.html missing the drift-diff bridge (variables-read → receiveLiveVariables)");
}

// ── a mock figma: in-memory collections + variables ─────────────────────────────
function mockFigma() {
  const collections = [], variables = [];
  let id = 0;
  const figma = {
    showUI() {},
    notify() {},
    closePlugin() {},
    // the document root carries the embedded config (setPluginData is a synchronous string store).
    root: { _pd: {}, setPluginData(k, v) { this._pd[k] = String(v); }, getPluginData(k) { return this._pd[k] || ""; } },
    ui: { _h: null, _posted: [], postMessage(m) { this._posted.push(m); }, set onmessage(fn) { this._h = fn; }, get onmessage() { return this._h; } },
    clientStorage: { _s: {}, async setAsync(k, v) { this._s[k] = v; }, async getAsync(k) { return this._s[k]; } },
    // ── styles (paint + text) — the styles executor's surface ──
    _styles: [],
    async getLocalPaintStylesAsync() { return this._styles.filter((s) => s._kind === "PAINT"); },
    async getLocalTextStylesAsync() { return this._styles.filter((s) => s._kind === "TEXT"); },
    async getStyleByIdAsync(sid) { return this._styles.find((s) => s.id === sid) || null; },
    createPaintStyle() { const st = { _kind: "PAINT", id: "s" + id++, name: "", paints: [], remove: function () { const i = figma._styles.indexOf(this); if (i >= 0) figma._styles.splice(i, 1); } }; this._styles.push(st); return st; },
    createTextStyle() {
      const st = { _kind: "TEXT", id: "s" + id++, name: "", fontName: null, fontSize: 0, lineHeight: null, letterSpacing: null, paragraphSpacing: 0, textCase: "ORIGINAL", _bound: {},
        setBoundVariable: function (field, v) { if (v == null) delete this._bound[field]; else this._bound[field] = v.id; },
        remove: function () { const i = figma._styles.indexOf(this); if (i >= 0) figma._styles.splice(i, 1); } };
      this._styles.push(st); return st;
    },
    // the "installed" font universe: a few families with REALISTIC face lists (note: no exact
    // "SemiBold" on Inter Tight — nearest-weight resolution must cope) and italics to be skipped.
    _fonts: { "Inter": ["Thin", "Light", "Regular", "Medium", "SemiBold", "Bold", "Black", "Italic", "Bold Italic"],
              "Inter Tight": ["Light", "Regular", "Medium", "Bold", "Black"],
              "Source Serif 4": ["Regular", "SemiBold", "Bold"],
              "JetBrains Mono": ["Regular", "Medium", "Bold"] },
    async listAvailableFontsAsync() {
      const out = [];
      for (const fam of Object.keys(this._fonts)) for (const st of this._fonts[fam]) out.push({ fontName: { family: fam, style: st } });
      return out;
    },
    async loadFontAsync(f) {
      if (!f || !f.family || !this._fonts[f.family] || this._fonts[f.family].indexOf(f.style) < 0) throw new Error("no face");
    },
    variables: {
      async getLocalVariableCollectionsAsync() { return collections.slice(); },
      createVariableCollection(name) {
        const c = {
          id: "c" + id++, name, modes: [{ modeId: "m" + id++, name: "Mode 1" }],
          renameMode(mid, nm) { const m = this.modes.find((x) => x.modeId === mid); if (m) m.name = nm; },
          addMode(nm) { const m = { modeId: "m" + id++, name: nm }; this.modes.push(m); return m.modeId; },
          removeMode(mid) { const i = this.modes.findIndex((x) => x.modeId === mid); if (i > 0) this.modes.splice(i, 1); }, // i>0: never the default
          remove() { // real Figma drops the collection AND its variables
            const i = collections.indexOf(this); if (i >= 0) collections.splice(i, 1);
            for (let j = variables.length - 1; j >= 0; j--) if (variables[j].variableCollectionId === this.id) variables.splice(j, 1);
          },
        };
        collections.push(c); return c;
      },
      async getLocalVariablesAsync() { return variables.slice(); },
      createVariable(name, coll, type) {
        const vm = {}; // shared: real Figma exposes valuesByMode; the cascade test reads .values
        const v = { id: "v" + id++, name, variableCollectionId: coll.id, type, values: vm, valuesByMode: vm,
          setValueForMode(mid, val) { vm[mid] = val; },
          remove() { const i = variables.indexOf(this); if (i >= 0) variables.splice(i, 1); } };
        variables.push(v); return v;
      },
      createVariableAlias(v) { return { type: "VARIABLE_ALIAS", id: v.id }; },
      setBoundVariableForPaint(paint, field, v) { return Object.assign({}, paint, { boundVariables: { [field]: { type: "VARIABLE_ALIAS", id: v.id } } }); },
    },
  };
  return { figma, collections, variables };
}

// ── END-TO-END contract: figmaBundle() -> applyBundle() on the mock ──────────────
let applyBundle, applyFloatPlans, applyFontPrimitives, applyStylePlans, setCollectionNames, resolveFace, sweepCandidates, styleNameWeight;
const F = mockFigma();
try {
  const load = new Function("figma", "__html__", "module", code + "\nreturn { applyBundle, applyFloatPlans, applyFontPrimitives, applyStylePlans, setCollectionNames, resolveFace, sweepCandidates, styleNameWeight };");
  const loaded = load(F.figma, "<html>", undefined); // closes over the MOCK figma
  applyBundle = loaded.applyBundle; applyFloatPlans = loaded.applyFloatPlans;
  applyFontPrimitives = loaded.applyFontPrimitives; applyStylePlans = loaded.applyStylePlans;
  setCollectionNames = loaded.setCollectionNames; resolveFace = loaded.resolveFace;
  sweepCandidates = loaded.sweepCandidates; styleNameWeight = loaded.styleNameWeight;
} catch (e) { FAIL("parse", "code.js failed to load: " + e.message); }

if (applyBundle) {
  const bundle = figmaBundle(defaultDocument());
  // recursive: ADR-016 nested the raw scrims ({n}/scrim/{step}), so leaves are counted by $value.
  const expect = (tree) => {
    const walk = (node) => Object.keys(node).filter((k) => k[0] !== "$").reduce((a, k) => {
      const c = node[k];
      return a + (c && typeof c === "object" && ("$value" in c) ? 1 : (c && typeof c === "object" ? walk(c) : 0));
    }, 0);
    return walk(tree);
  };
  const rawExpect = expect(bundle["palette.tokens.json"]);
  const semExpect = expect(bundle["Light_tokens.json"]);

  try {
    const res = await applyBundle(bundle);
    const raw = F.collections.find((c) => c.name === "Color Primitives");
    const sem = F.collections.find((c) => c.name === "Color Semantic");
    if (!raw) FAIL("apply", "no Color Primitives collection created");
    if (!sem) FAIL("apply", "no Color Modes collection created");
    if (sem && sem.modes.map((m) => m.name).join() !== "Light,Dark") FAIL("apply", `Color Modes modes = ${sem && sem.modes.map((m) => m.name)}, want Light,Dark`);
    if (res.raw !== rawExpect) FAIL("apply", `created ${res.raw} raw vars, expected ${rawExpect}`);
    if (res.semantic !== semExpect) FAIL("apply", `created ${res.semantic} semantic vars, expected ${semExpect}`);

    if (raw && sem) {
      const rawIds = new Set(F.variables.filter((v) => v.variableCollectionId === raw.id).map((v) => v.id));
      const lightId = sem.modes[0].modeId, darkId = sem.modes[1].modeId;
      let aliased = 0, bad = 0;
      for (const v of F.variables.filter((v) => v.variableCollectionId === sem.id)) {
        for (const mid of [lightId, darkId]) {
          const val = v.values[mid];
          if (!val || val.type !== "VARIABLE_ALIAS" || !rawIds.has(val.id)) { bad++; continue; }
          aliased++;
        }
      }
      if (bad > 0) FAIL("cascade", `${bad} semantic mode-values are not aliased to a created raw var`);
      if (aliased !== semExpect * 2) FAIL("cascade", `${aliased} aliased mode-values, expected ${semExpect * 2} (53 roles × palettes × 2 modes)`);
    }

    // ── IDEMPOTENT re-apply: a 2nd run finds-or-creates → updates in place, never doubles ──
    // (the user re-runs the plugin on the same file repeatedly; duplicate collections/vars/
    //  modes would corrupt the variable panel). Proven, not assumed.
    const res2 = await applyBundle(bundle);
    const rawColls = F.collections.filter((c) => c.name === "Color Primitives").length;
    const semColls = F.collections.filter((c) => c.name === "Color Semantic").length;
    if (rawColls !== 1) FAIL("idempotent", `re-apply made ${rawColls} Color Primitives collections, want 1`);
    if (semColls !== 1) FAIL("idempotent", `re-apply made ${semColls} Color Modes collections, want 1`);
    const rawVars2 = F.variables.filter((v) => raw && v.variableCollectionId === raw.id).length;
    const semVars2 = F.variables.filter((v) => sem && v.variableCollectionId === sem.id).length;
    if (rawVars2 !== rawExpect) FAIL("idempotent", `re-apply left ${rawVars2} raw vars, want ${rawExpect} (no duplicates)`);
    if (semVars2 !== semExpect) FAIL("idempotent", `re-apply left ${semVars2} semantic vars, want ${semExpect} (no duplicates)`);
    if (sem && sem.modes.map((m) => m.name).join() !== "Light,Dark") FAIL("idempotent", `re-apply left Color Modes modes = ${sem && sem.modes.map((m) => m.name)}, want Light,Dark (no duplicate mode)`);
    if (res2.raw !== rawExpect || res2.semantic !== semExpect) FAIL("idempotent", `re-apply reported ${res2.raw}/${res2.semantic} vars, want ${rawExpect}/${semExpect}`);

    // ── ORPHAN PRUNE: re-apply removes any var NOT in the current bundle, in BOTH generated
    //    collections — old-format scrims (250-*/500-0..6/750-*) and removed/renamed/disabled
    //    palettes — so the file mirrors the generator exactly (full-mirror pruning). ──
    F.figma.variables.createVariable("neutral/500-0", raw, "COLOR"); // old base-index scrim
    F.figma.variables.createVariable("neutral/750-3", raw, "COLOR"); // old 750-base scrim
    F.figma.variables.createVariable("ghost/050", raw, "COLOR");     // removed-palette raw solid
    F.figma.variables.createVariable("ghost/primary", sem, "COLOR"); // removed-palette semantic var
    const res3 = await applyBundle(bundle);
    const inColl = (cid) => F.variables.filter((v) => v.variableCollectionId === cid).map((v) => v.name);
    const rawNames3 = inColl(raw.id), semNames3 = inColl(sem.id);
    for (const dead of ["neutral/500-0", "neutral/750-3", "ghost/050"]) if (rawNames3.includes(dead)) FAIL("prune", `orphan raw var '${dead}' not pruned`);
    if (semNames3.includes("ghost/primary")) FAIL("prune", "orphan semantic var 'ghost/primary' not pruned");
    if (rawNames3.length !== rawExpect) FAIL("prune", `Color Primitives has ${rawNames3.length} vars after prune, want ${rawExpect}`);
    if (semNames3.length !== semExpect) FAIL("prune", `Color Modes has ${semNames3.length} vars after prune, want ${semExpect}`);
    if (res3.pruned !== 4) FAIL("prune", `apply reported pruned=${res3.pruned}, expected 4`);

    // ── REGROUP: apply with {rebuildSemantic} DELETES + re-creates the Color Modes collection (so it
    //    adopts the bundle's canonical order), leaving Color Primitives + the var counts intact and
    //    NOT duplicating the collection. The fresh semantic vars created in the bundle's role order. ──
    const semColl0 = F.collections.find((c) => c.name === "Color Semantic");
    const res4 = await applyBundle(bundle, { rebuildSemantic: true });
    if (!res4.rebuilt) FAIL("regroup", "applyBundle({rebuildSemantic:true}) did not report rebuilt");
    const semColls4 = F.collections.filter((c) => c.name === "Color Semantic");
    if (semColls4.length !== 1) FAIL("regroup", `after regroup there are ${semColls4.length} Color Modes collections, want 1`);
    if (semColls4[0] === semColl0) FAIL("regroup", "regroup reused the old Color Modes collection (should be a fresh one)");
    if (res4.semantic !== semExpect) FAIL("regroup", `regroup created ${res4.semantic} semantic vars, want ${semExpect}`);
    const semNames4 = inColl(semColls4[0].id);
    if (semNames4.length !== semExpect) FAIL("regroup", `Color Modes has ${semNames4.length} vars after regroup, want ${semExpect}`);
    // order check: the fresh collection's variable order matches the bundle's (regular → … → scrims)
    const wantOrder = Object.keys(bundle["Light_tokens.json"]).filter((n) => n[0] !== "$")
      .flatMap((n) => Object.keys(bundle["Light_tokens.json"][n]).filter((k) => k[0] !== "$").map((k) => n + "/" + k));
    if (semNames4.join(",") !== wantOrder.join(",")) FAIL("regroup", "regrouped Color Modes order != bundle (canonical) order");
    const lastSeven = semNames4.slice(-7);
    if (!lastSeven.every((nm) => /\/scrim/.test(nm))) FAIL("regroup", `last 7 regrouped vars are not scrims: ${lastSeven}`);

    // ── COLLECTION-NAME OVERRIDES: setCollectionNames (the apply message's `collections`) routes the
    //    SAME bundle into custom-named collections; the default constants are the empty/absent fallback. ──
    if (typeof setCollectionNames !== "function") FAIL("collnames", "code.js does not export setCollectionNames");
    else {
      setCollectionNames({ raw: "Brand Primitives", semantic: "Brand Modes" });
      const res5 = await applyBundle(bundle);
      const braw = F.collections.find((c) => c.name === "Brand Primitives");
      const bsem = F.collections.find((c) => c.name === "Brand Modes");
      if (!braw || !bsem) FAIL("collnames", "override apply did not create the custom-named collections");
      if (res5.raw !== rawExpect || res5.semantic !== semExpect) FAIL("collnames", `override apply created ${res5.raw}/${res5.semantic} vars, want ${rawExpect}/${semExpect}`);
      // the default-named collections from the earlier legs are left untouched (no rename, no prune)
      if (!F.collections.some((c) => c.name === "Color Primitives")) FAIL("collnames", "override apply disturbed the existing default-named Color Primitives");
      setCollectionNames(null); // empty/absent → the defaults (the fallback contract)
      const res6 = await applyBundle(bundle);
      if (res6.raw !== rawExpect) FAIL("collnames", "setCollectionNames(null) did not fall back to the default names");
    }
  } catch (e) { FAIL("apply", "applyBundle threw: " + e.message); }

  // ── CONFIG round-trip via the file's root pluginData (the project source of truth, travels with the
  //    .fig): save → stored IN the file → load → posted back; AND "apply" embeds the config alongside the vars. ──
  if (F.figma.ui._h) {
    const cfg = { name: "T", palettes: [{ name: "P", hue: 7, chroma: 50, skew: 0, lift: 0, on: true }], roleOverrides: { onSurface: { light: "900" } } };
    await F.figma.ui._h({ type: "save-config", config: cfg });
    if (JSON.stringify(JSON.parse(F.figma.root.getPluginData("ultimate-tokens-config") || "null")) !== JSON.stringify(cfg)) FAIL("config", "save-config did not store the config in the file's root pluginData (must travel with the file, not clientStorage)");
    F.figma.ui._posted.length = 0;
    await F.figma.ui._h({ type: "load-config" });
    const loaded = F.figma.ui._posted.find((m) => m && m.type === "config-loaded");
    if (!loaded) FAIL("config", "load-config posted no {type:'config-loaded'} message");
    else if (JSON.stringify(loaded.config) !== JSON.stringify(cfg)) FAIL("config", "load-config did not round-trip the saved config");

    // "apply" must ALSO embed the params in the file, so a read reproduces them losslessly (not from colors).
    F.figma.root._pd = {}; // clear, then apply with an embedded config
    const cfg2 = { name: "Embedded", palettes: [{ name: "Q", hue: 200, chroma: 60, skew: 0, lift: 0, on: true }] };
    await F.figma.ui._h({ type: "apply", dtcg: figmaBundle(defaultDocument()), config: cfg2 });
    if (JSON.stringify(JSON.parse(F.figma.root.getPluginData("ultimate-tokens-config") || "null")) !== JSON.stringify(cfg2)) FAIL("config", "apply did not embed the config in the file (read-back would be lossy)");

    // ORPHANED legacy keys: figma.root.setPluginData is namespaced PER PLUGIN ID, so the id rename to
    // "ultimate-tokens" makes every pre-rename key unreachable from this plugin -- no forward-migration is
    // possible (that is the accepted cost of the rename). What IS gated: load-config must degrade to a clean
    // empty start, never read a stale key and never throw.
    F.figma.root._pd = {};
    const orphaned = { name: "Legacy", palettes: [{ name: "L", hue: 33, chroma: 44, skew: 0, lift: 0, on: true }] };
    for (const k of ["hct-config", "nonoun-color-tokens-config"]) F.figma.root.setPluginData(k, JSON.stringify(orphaned));
    F.figma.ui._posted.length = 0;
    await F.figma.ui._h({ type: "load-config" });
    const orphanLoaded = F.figma.ui._posted.find((m) => m && m.type === "config-loaded");
    if (!orphanLoaded) FAIL("config", "load-config did not answer at all when only pre-rename keys are present (must post config-loaded with an empty config)");
    if (orphanLoaded && orphanLoaded.config) FAIL("config", "load-config read a pre-rename pluginData key -- setPluginData is namespaced per plugin id, so a legacy key must be invisible, not silently adopted");

    // ── READ-VARIABLES (drift reference): the live Color Primitives values come back as #RRGGBB(AA) hexes ──
    F.figma.ui._posted.length = 0;
    await F.figma.ui._h({ type: "read-variables" });
    const read = F.figma.ui._posted.find((m) => m && m.type === "variables-read");
    if (!read) FAIL("read", "read-variables posted no {type:'variables-read'} message");
    else if (!read.found) FAIL("read", "read-variables did not find the Color Primitives collection");
    else {
      const names = Object.keys(read.raw);
      if (names.length !== rawExpect) FAIL("read", `read ${names.length} raw values, expected ${rawExpect}`);
      if (!names.every((k) => /^#[0-9A-F]{6}([0-9A-F]{2})?$/.test(read.raw[k]))) FAIL("read", "a read raw value is not a #RRGGBB(AA) hex");
    }
  } else {
    FAIL("config", "code.js registered no figma.ui.onmessage handler");
  }
}

// ── breakpoint-moded FLOAT apply (Type + Geometry) — the NATIVE side of #125's interchange export ──
// applyFloatPlans executes the UI-computed plans (figma/binder/mode-apply-plan.mjs.modeApplyPlan) against
// the figma API: since TKT-0009 the type + geometry halves land as ONE merged "Geometry" collection
// (type/ + box-geometry variables), mode[0]="Base" + one mode per breakpoint, value-complete FLOAT vars.
// Proven (not assumed): idempotent re-apply, stale-mode prune on breakpoint removal, orphan-var prune,
// and retirement of a registry-tracked two-collection-era "Typography".
if (applyFloatPlans) {
  try {
    const typeIx = TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product", bodyBase: 16 }), [{ name: "Mobile", scale: TYPE.typeScale({ treatment: "product", bodyBase: 13 }) }]);
    const geomIx = GEOM.geomTokensFigmaModes(GEOM.geomScale({ treatment: "comfortable", baseHeight: 28 }), [{ name: "Mobile", scale: GEOM.geomScale({ treatment: "comfortable", baseHeight: 24 }) }]);
    const mergedPlans = modeApplyPlan(mergeModeInterchanges(typeIx, geomIx));
    if (mergedPlans.length !== 1) FAIL("floatapply", `merged plan count = ${mergedPlans.length}, want 1 (one collection)`);
    const fr = await applyFloatPlans(mergedPlans);

    const geo = F.collections.find((c) => c.name === "Breakpoints");
    if (F.collections.some((c) => c.name === "Typography")) FAIL("floatapply", "the merged apply minted a Typography collection (the pre-TKT-0009 shape)");
    if (!geo) FAIL("floatapply", "no Breakpoints collection created");
    if (geo && geo.modes.map((m) => m.name).join() !== "Base,Mobile") FAIL("floatapply", `Breakpoints modes = ${geo && geo.modes.map((m) => m.name)}, want Base,Mobile`);
    if (fr.collections !== 1) FAIL("floatapply", `applyFloatPlans reported ${fr.collections} collections, want 1 (merged)`);

    // every var is FLOAT + value-complete across both modes; per-mode TYPE values DIFFER (16 vs 13); both halves present.
    if (geo) {
      const gVars = F.variables.filter((v) => v.variableCollectionId === geo.id);
      const planLen = mergedPlans[0].variables.length;
      if (gVars.length !== planLen) FAIL("floatapply", `Breakpoints has ${gVars.length} vars, want ${planLen}`);
      if (!gVars.every((v) => v.type === "FLOAT")) FAIL("floatapply", "a Breakpoints variable is not FLOAT");
      if (!gVars.some((v) => v.name.startsWith("type/"))) FAIL("floatapply", "the type/ half is missing from the merged collection");
      if (!gVars.some((v) => v.name.startsWith("size/"))) FAIL("floatapply", "the box-geometry half is missing from the merged collection");
      const baseId = geo.modes[0].modeId, mobId = geo.modes[1].modeId;
      const bodyMd = gVars.find((v) => v.name === "type/body/md/size");
      if (!bodyMd) FAIL("floatapply", "type/body/md/size variable missing");
      else if (!Number.isFinite(bodyMd.valuesByMode[baseId]) || !Number.isFinite(bodyMd.valuesByMode[mobId])) FAIL("floatapply", "type/Body/MD/size not value-complete across modes");
      else if (bodyMd.valuesByMode[baseId] === bodyMd.valuesByMode[mobId]) FAIL("floatapply", "type/body/md/size Base == Mobile (per-mode values should differ at bodyBase 16 vs 13)");
    }

    // IDEMPOTENT re-apply — no duplicate collection / modes / variables.
    await applyFloatPlans(modeApplyPlan(mergeModeInterchanges(typeIx, geomIx)));
    if (F.collections.filter((c) => c.name === "Breakpoints").length !== 1) FAIL("floatidem", "re-apply duplicated the Breakpoints collection");
    if (geo && geo.modes.length !== 2) FAIL("floatidem", `re-apply left ${geo && geo.modes.length} Breakpoints modes, want 2`);
    const gVars2 = geo ? F.variables.filter((v) => v.variableCollectionId === geo.id).length : 0;
    if (gVars2 !== mergedPlans[0].variables.length) FAIL("floatidem", `re-apply left ${gVars2} Breakpoints vars (duplicates)`);

    // BREAKPOINT REMOVED ⇒ the stale mode is pruned (re-apply the merged no-breakpoints plan ⇒ Base only).
    await applyFloatPlans(modeApplyPlan(mergeModeInterchanges(
      TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product", bodyBase: 16 }), []),
      GEOM.geomTokensFigmaModes(GEOM.geomScale({ treatment: "comfortable", baseHeight: 28 }), []),
    )));
    if (geo && geo.modes.map((m) => m.name).join() !== "Base") FAIL("floatprune", `after removing the breakpoint, Breakpoints modes = ${geo && geo.modes.map((m) => m.name)}, want Base`);

    // ORPHAN VAR pruned — a synthetic collection: apply {a,b} then {a} ⇒ b removed, a updated to 9.
    const synthVar = (name, value) => ({ name, type: "FLOAT", values: [{ mode: "Base", value }] });
    await applyFloatPlans([{ collection: "Synth", modes: ["Base"], defaultMode: "Base", addModes: [], variables: [synthVar("a", 1), synthVar("b", 2)] }]);
    await applyFloatPlans([{ collection: "Synth", modes: ["Base"], defaultMode: "Base", addModes: [], variables: [synthVar("a", 9)] }]);
    const synth = F.collections.find((c) => c.name === "Synth");
    const sVars = synth ? F.variables.filter((v) => v.variableCollectionId === synth.id) : [];
    if (sVars.some((v) => v.name === "b")) FAIL("floatprune", "orphan variable 'b' not pruned on re-apply");
    const aVar = sVars.find((v) => v.name === "a");
    if (!aVar) FAIL("floatprune", "variable 'a' missing after re-apply");
    else if (aVar.valuesByMode[synth.modes[0].modeId] !== 9) FAIL("floatprune", "variable 'a' not updated to 9 on re-apply");

    // PROVENANCE: apply must NEVER canonicalize a USER's own pre-existing same-named collection — it tracks
    // the collections IT created by id in root pluginData and makes a SEPARATE one. Fresh mock so the user's
    // "Geometry" is the only one until apply runs.
    const F2 = mockFigma();
    const a2 = new Function("figma", "__html__", "module", code + "\nreturn { applyFloatPlans };")(F2.figma, "<html>", undefined).applyFloatPlans;
    const userColl = F2.figma.variables.createVariableCollection("Breakpoints"); // the user's own, pre-existing
    F2.figma.variables.createVariable("user/keepme", userColl, "FLOAT").setValueForMode(userColl.modes[0].modeId, 123);
    await a2(modeApplyPlan(TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product" }), [])));
    if (F2.collections.filter((c) => c.name === "Breakpoints").length !== 2) FAIL("floatprov", `expected the user's Breakpoints + a separate plugin-created one (2), got ${F2.collections.filter((c) => c.name === "Breakpoints").length}`);
    if (!F2.variables.some((v) => v.variableCollectionId === userColl.id && v.name === "user/keepme")) FAIL("floatprov", "apply pruned a variable from the user's OWN Breakpoints collection");
    if (userColl.modes[0].name !== "Mode 1") FAIL("floatprov", "apply renamed the default mode of the user's OWN Breakpoints collection");
    await a2(modeApplyPlan(TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product" }), []))); // re-apply: reconcile OURS by id, not the user's
    if (F2.collections.filter((c) => c.name === "Breakpoints").length !== 2) FAIL("floatprov", "re-apply made a 3rd Breakpoints (provenance registry not persisted to root pluginData)");

    // RETIREMENT (TKT-0009 migration): a registry-tracked two-collection-era "Typography" is removed by a
    // merged plan carrying retire:["Typography"] (what _figmaFloatPlans attaches) — while a user's OWN
    // same-named collection survives (provenance: retire matches by registry id, never by name).
    const F8 = mockFigma();
    const a8 = new Function("figma", "__html__", "module", code + "\nreturn { applyFloatPlans };")(F8.figma, "<html>", undefined).applyFloatPlans;
    await a8([{ collection: "Typography", modes: ["Base"], defaultMode: "Base", addModes: [], variables: [synthVar("Body/MD/size", 16)] }]); // the old era: OURS, registry-tracked
    const userTypo = F8.figma.variables.createVariableCollection("Typography"); // the user's own beside ours
    F8.figma.variables.createVariable("user/keepme", userTypo, "FLOAT").setValueForMode(userTypo.modes[0].modeId, 5);
    if (F8.collections.filter((c) => c.name === "Typography").length !== 2) FAIL("floatretire", "fixture: expected ours + the user's Typography before the merged apply");
    const retirePlans = modeApplyPlan(mergeModeInterchanges(typeIx, geomIx));
    retirePlans[0].retire = ["Typography"];
    await a8(retirePlans);
    const typosLeft = F8.collections.filter((c) => c.name === "Typography");
    if (typosLeft.length !== 1) FAIL("floatretire", `expected ONLY the user's own Typography to survive retirement, got ${typosLeft.length}`);
    if (!F8.variables.some((v) => v.variableCollectionId === userTypo.id && v.name === "user/keepme")) FAIL("floatretire", "retirement removed the user's OWN Typography collection (provenance violated)");
    if (!F8.variables.some((v) => v.name === "type/body/md/size")) FAIL("floatretire", "the merged Breakpoints collection missing after retirement");
    await a8(retirePlans); // idempotent: a retire with no registry entry left is a no-op
    if (F8.collections.filter((c) => c.name === "Typography").length !== 1) FAIL("floatretire", "re-applying a retire-carrying plan touched the user's own Typography");
  } catch (e) { FAIL("floatapply", "applyFloatPlans threw: " + e.message); }
} else {
  FAIL("floatapply", "code.js exported no applyFloatPlans");
}

// ── TKT-0012: the id-preserving RENAME capability — the migration channel every renaming ticket uses.
//    Proven on the mock: (a) a plan.renames var rename keeps the SAME variable id (no prune+recreate),
//    (b) a plan.renameFrom collection rename adopts the registry-tracked collection by id, renames it
//    in place, and re-keys the registry, (c) empty maps are byte-identical no-ops. ──
if (applyFloatPlans) {
  try {
    const F9 = mockFigma();
    const a9 = new Function("figma", "__html__", "module", code + "\nreturn { applyFloatPlans };")(F9.figma, "<html>", undefined).applyFloatPlans;
    // era 1: a synthetic OLD-shape interchange ("Geometry" collection, camel var names) — hand-built,
    // since the live emitters now speak the ADR-016 grammar.
    const oldIx = JSON.parse(JSON.stringify(TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product", bodyBase: 16 }), [])).replaceAll("Breakpoints", "Geometry").replaceAll("type/body/md/", "type/Body/MD/").replaceAll("line-height", "lineHeight").replaceAll("letter-spacing", "letterSpacing").replaceAll("paragraph-spacing", "paragraphSpacing").replaceAll("single-lineHeight", "singleLineHeight"));
    await a9(modeApplyPlan(oldIx)); // era 1: the old-shape collection ("Geometry", camel var names)
    const geoOld = F9.collections.find((c) => c.name === "Geometry");
    const oldVar = F9.variables.find((v) => v.variableCollectionId === geoOld.id && v.name === "type/Body/MD/size");
    const keepCollId = geoOld.id, keepVarId = oldVar.id, varCountBefore = F9.variables.filter((v) => v.variableCollectionId === geoOld.id).length;
    // era 2: the renamed shape — collection "Breakpoints-Test", var "type/body/md/size" — via the capability
    const renamedIx = JSON.parse(JSON.stringify(oldIx).replaceAll("type/Body/MD/", "type/body/md/"));
    const plans9 = modeApplyPlan({ collections: { "Breakpoints-Test": renamedIx.collections.Geometry } });
    plans9[0].renameFrom = ["Geometry"];
    plans9[0].renames = { "type/Body/MD/size": "type/body/md/size", "type/Body/MD/lineHeight": "type/body/md/lineHeight" };
    await a9(plans9);
    const bp = F9.collections.find((c) => c.name === "Breakpoints-Test");
    if (!bp) FAIL("renamecap", "renameFrom did not produce the renamed collection");
    else {
      if (bp.id !== keepCollId) FAIL("renamecap", "collection rename minted a NEW collection (id changed — bindings would orphan)");
      if (F9.collections.filter((c) => c.name === "Breakpoints").length !== 0) FAIL("renamecap", "the old-name collection lingers after renameFrom");
      const nv = F9.variables.find((v) => v.variableCollectionId === bp.id && v.name === "type/body/md/size");
      if (!nv) FAIL("renamecap", "renamed variable missing");
      else if (nv.id !== keepVarId) FAIL("renamecap", "variable rename minted a NEW variable (id changed — bindings would orphan)");
      // NOTE: the plan renames only 2 vars; the rest of the old camel names differ from the new plan's
      // names WITHOUT a map entry → reconcile prunes and recreates them (fresh ids) — exactly why every
      // renaming ticket MUST ship its full map. The two mapped ones prove the channel.
    }
    // registry re-keyed: a THIRD apply under the new name must reuse the same collection, not mint another
    await a9(plans9);
    if (F9.collections.filter((c) => c.name === "Breakpoints-Test").length !== 1) FAIL("renamecap", "re-apply after renameFrom duplicated the collection (registry not re-keyed)");
  } catch (e) { FAIL("renamecap", "rename capability threw: " + e.message); }
}

// ── apply RESPECTS the export-system toggles: a message with NO dtcg (Color toggled off) skips the color
//    collections entirely while still applying the Type/Geometry float plans. Driven through the real handler. ──
{
  const F3 = mockFigma();
  new Function("figma", "__html__", "module", code)(F3.figma, "<html>", undefined); // run code.js → registers onmessage on F3
  if (typeof F3.figma.ui._h !== "function") FAIL("applysys", "code.js registered no onmessage handler on the fresh mock");
  else {
    const typePlan = modeApplyPlan(TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product" }), []));
    await F3.figma.ui._h({ type: "apply", floatPlans: typePlan, config: { name: "x" } }); // Color OFF → no dtcg
    if (F3.collections.some((c) => c.name === "Color Primitives" || c.name === "Color Semantic")) FAIL("applysys", "apply with no dtcg still created a Color collection (the Color toggle was ignored)");
    if (!F3.collections.some((c) => c.name === "Breakpoints")) FAIL("applysys", "apply with no dtcg did not apply the merged Breakpoints float plan");
    // COMPLETION FEEDBACK: a finished apply posts {apply-done} back to the UI (its counts drive the "Applied N…" toast).
    const done = F3.figma.ui._posted.find((m) => m && m.type === "apply-done");
    if (!done) FAIL("applydone", "a completed apply posted no {apply-done} message to the UI (no done-feedback)");
    else if (!(done.floatVars > 0)) FAIL("applydone", `apply-done floatVars=${done.floatVars}, expected the applied float variables`);
  }
}

// ── TKT-0012: color-pool + style-registry renames (the same channel for the color cascade + styles) ──
if (applyBundle && applyStylePlans) {
  try {
    const FA = mockFigma();
    const la = new Function("figma", "__html__", "module", code + "\nreturn { applyBundle, applyStylePlans };")(FA.figma, "<html>", undefined);
    const bundleB = figmaBundle(defaultDocument()); // the CURRENT (kebab) grammar
    // era 1: a synthetic OLD-grammar bundle (camel role leaves) — hand-built, the live export is kebab now.
    const bundleOld = JSON.parse(JSON.stringify(bundleB).replaceAll('"on-surface"', '"onSurface"'));
    await la.applyBundle(bundleOld, {});
    const semA = FA.collections.find((c) => c.name === "Color Semantic");
    const oldSem = FA.variables.find((v) => v.variableCollectionId === semA.id && v.name === "neutral/onSurface");
    if (!oldSem) { FAIL("renamecap", "fixture: neutral/onSurface missing from the era-1 color apply"); }
    else {
      const keepId = oldSem.id;
      await la.applyBundle(bundleB, { renames: { semantic: { "neutral/onSurface": "neutral/on-surface" } } });
      const nv = FA.variables.find((v) => v.variableCollectionId === semA.id && v.name === "neutral/on-surface");
      if (!nv) FAIL("renamecap", "color semantic rename missing");
      else if (nv.id !== keepId) FAIL("renamecap", "color semantic rename minted a NEW variable (id changed)");
    }
  } catch (e) { FAIL("renamecap", "color rename capability threw: " + e.message); }
}

// ── list-fonts: the UI asks which families Figma can use; the sandbox answers with families only ──
{
  const F5 = mockFigma();
  new Function("figma", "__html__", "module", code)(F5.figma, "<html>", undefined);
  await F5.figma.ui._h({ type: "list-fonts" });
  const msg = F5.figma.ui._posted.find((m) => m && m.type === "fonts-listed");
  if (!msg) FAIL("fonts", "list-fonts posted no {fonts-listed} message");
  else {
    if (!Array.isArray(msg.families) || msg.families.indexOf("Inter") < 0) FAIL("fonts", "fonts-listed carries no family list");
    if (new Set(msg.families).size !== msg.families.length) FAIL("fonts", "fonts-listed families are not deduped (one entry per family, not per face)");
    if (msg.families.some((f) => typeof f !== "string")) FAIL("fonts", "fonts-listed must carry family NAMES only");
  }
}

// ── apply FAILURE posts {apply-error} so the UI can clear its optimistic "Applying…" toast ──
{
  const F4 = mockFigma();
  new Function("figma", "__html__", "module", code)(F4.figma, "<html>", undefined);
  await F4.figma.ui._h({ type: "apply", dtcg: { "palette.tokens.json": null } }); // missing Light/Dark → applyBundle throws
  if (!F4.figma.ui._posted.some((m) => m && m.type === "apply-error")) FAIL("applydone", "a FAILED apply posted no {apply-error} message to the UI");
}

// ── resolveFace: separator/case-insensitive fuzzy match — a REAL font's style catalog doesn't agree
// on hyphen vs. space for compound weight names (this kit's own WEIGHT_NAMES: "Extra-bold",
// "Semi-bold"), and an exact-string-only match silently missed the real face, falling back to the
// nearest-weight guess (which doesn't even preserve italic) — found live via BZZR's real GT America
// styles ("Condensed Extra Bold Italic", space, vs. the templated "Condensed Extra-bold Italic",
// hyphen) resolving to plain "Bold". ──
if (resolveFace) {
  const styles = ["Regular", "Condensed Bold Italic", "Condensed Extra Bold Italic", "Condensed Black Italic"];
  const exact = resolveFace(styles, { styleName: "Condensed Bold Italic", weight: 700 });
  if (exact !== "Condensed Bold Italic") FAIL("resolveface", `an exact match still wins outright (got ${exact})`);
  const fuzzy = resolveFace(styles, { styleName: "Condensed Extra-bold Italic", weight: 800 });
  if (fuzzy !== "Condensed Extra Bold Italic") FAIL("resolveface", `hyphen vs. space must fuzzy-match to the real face (got ${fuzzy}, want "Condensed Extra Bold Italic")`);
  const caseInsensitive = resolveFace(styles, { styleName: "condensed extra-bold italic", weight: 800 });
  if (caseInsensitive !== "Condensed Extra Bold Italic") FAIL("resolveface", `the fuzzy match must be case-insensitive too (got ${caseInsensitive})`);
  const noMatch = resolveFace(styles, { styleName: "Totally Unrelated Name", weight: 800 });
  if (noMatch === "Totally Unrelated Name") FAIL("resolveface", "a genuinely absent style name must still fall back to the nearest-weight guess, not itself");
  if (!styles.includes(noMatch)) FAIL("resolveface", `the nearest-weight fallback must return a REAL style from the list (got ${noMatch})`);
  // CONCATENATED compound names — found live researching New Caledonia's real catalog ("SemiBold", no
  // separator at all) while auditing preset font/weight configs: collapsing hyphen/space to ONE space
  // (the previous fix) matched "Extra Bold" but not a foundry that runs the words together entirely.
  const concatStyles = ["Regular", "SemiBold", "Bold", "Black"];
  const concatFuzzy = resolveFace(concatStyles, { styleName: "Semi-bold", weight: 600 });
  if (concatFuzzy !== "SemiBold") FAIL("resolveface", `a hyphenated name must fuzzy-match a real font's fully-concatenated style ("SemiBold", no separator) (got ${concatFuzzy})`);
  const concatFuzzySpace = resolveFace(concatStyles, { styleName: "Semi Bold", weight: 600 });
  if (concatFuzzySpace !== "SemiBold") FAIL("resolveface", `a space-separated name must ALSO fuzzy-match a fully-concatenated real style (got ${concatFuzzySpace})`);
  // DETERMINISTIC tie-break — found live via GT America's real ladder (Ultra Light/Thin/Light/Regular/
  // Medium/Bold/Black — no Extra-bold cut at all), where a wanted 800 sits EXACTLY between the real
  // Bold (700) and Black (900): must always prefer the heavier one, never whichever style happened to
  // come first in Figma's own listAvailableFontsAsync() array order (unpredictable, install-dependent).
  const tieStyles = ["Regular", "Bold", "Black"];
  const tieHeavy = resolveFace(tieStyles, { weight: 800 });
  if (tieHeavy !== "Black") FAIL("resolveface", `an exact tie between two real weights must prefer the HEAVIER one, deterministically (got ${tieHeavy})`);
  const tieHeavyReversed = resolveFace(["Black", "Bold", "Regular"], { weight: 800 });
  if (tieHeavyReversed !== "Black") FAIL("resolveface", `the tie-break must NOT depend on array order (reversed list, got ${tieHeavyReversed})`);
}

// ── styleNameWeight / resolveFace: NUMERIC instance names — Figma exposes NO variable-font axis
// metadata at all (listAvailableFontsAsync returns only {family, style} strings), so a variable font
// whose named instances are numeric ("350", "Text 550") can only be read from the style STRING itself.
// Before parsing numbers, every numerically-named style fell back to the SAME default (400) and the
// nearest-weight pick silently returned whichever one happened to be first in the array. ──
if (styleNameWeight) {
  if (styleNameWeight("350") !== 350) FAIL("resolveface", `a bare numeric style name is its own weight (got ${styleNameWeight("350")})`);
  if (styleNameWeight("Text 550") !== 550) FAIL("resolveface", `an embedded number in a style name is parsed as weight (got ${styleNameWeight("Text 550")})`);
  if (styleNameWeight("Display 800 Italic") !== 800) FAIL("resolveface", `a numeric weight survives a trailing style modifier (got ${styleNameWeight("Display 800 Italic")})`);
  if (styleNameWeight("Bold") !== 700) FAIL("resolveface", "a real word match still wins over any numeric fallback path");
}
if (resolveFace) {
  const numericStyles = ["100", "350", "550", "800 Italic"];
  const midWeight = resolveFace(numericStyles, { weight: 500 });
  if (midWeight !== "550") FAIL("resolveface", `a numerically-instanced variable font resolves to its NEAREST real weight, not the first style in the list (got ${midWeight}, want "550")`);
  const lowWeight = resolveFace(numericStyles, { weight: 120 });
  if (lowWeight !== "100") FAIL("resolveface", `nearest-weight still works at the low end of a numeric instance set (got ${lowWeight})`);
}

// ── sweepCandidates: find real styles that LOOK like ours (top "/" segment matches a namespace the
// current plan still uses) but aren't anything the current plan would produce — leftovers from an older
// naming generation that predate this plugin's own registry, so no ordinary apply/prune can reach them.
// Pure + read-only: never touches a user's own unrelated style (a different namespace entirely). ──
if (sweepCandidates) {
  const knownTexts = ["Body/lg/• regular", "Body/lg/medium", "Headline/lg/• black"];
  const knownPaints = ["Primary/onPrimary"];
  const localTexts = [
    { id: "t1", name: "Body/lg/• regular" },          // current — not a candidate
    { id: "t2", name: "Body/lg/regular" },             // legacy (no dot-prefix) — candidate
    { id: "t3", name: "Body/lg/regular-single" },      // legacy (old hyphen-suffix era) — candidate
    { id: "t4", name: "MyOwnCustomStyle/heading" },    // a namespace we don't use at all — NEVER a candidate
  ];
  const localPaints = [
    { id: "p1", name: "Primary/onPrimary" },           // current — not a candidate
    { id: "p2", name: "Primary/onPrimaryOld" },         // legacy — candidate
  ];
  const cand = sweepCandidates(knownTexts, knownPaints, localTexts, localPaints);
  const candTextIds = cand.texts.map((x) => x.id).sort();
  if (candTextIds.join(",") !== "t2,t3") FAIL("sweep", `sweepCandidates must flag exactly the legacy Body/lg text styles, not the current one or the unrelated namespace (got ${candTextIds.join(",")})`);
  if (cand.paints.map((x) => x.id).join(",") !== "p2") FAIL("sweep", `sweepCandidates must flag exactly the legacy paint style (got ${cand.paints.map((x) => x.id).join(",")})`);
  if (cand.texts.some((x) => x.id === "t4") || cand.paints.some((x) => x.name.startsWith("MyOwnCustomStyle"))) FAIL("sweep", "a namespace this plan never uses at all must NEVER be flagged — only prefixes we currently own");

  // end-to-end via the real message handlers: sweep-scan never mutates; sweep-delete removes ONLY the
  // confirmed ids and reports how many.
  const F6 = mockFigma();
  new Function("figma", "__html__", "module", code)(F6.figma, "<html>", undefined);
  const legacyStyle = F6.figma.createTextStyle(); legacyStyle.name = "Body/lg/regular";
  const currentStyle = F6.figma.createTextStyle(); currentStyle.name = "Body/lg/• regular";
  const foreignStyle = F6.figma.createTextStyle(); foreignStyle.name = "MyOwnCustomStyle/heading";
  await F6.figma.ui._h({ type: "sweep-scan", textNames: ["Body/lg/• regular"], paintNames: [] });
  const scanMsg = F6.figma.ui._posted.find((m) => m && m.type === "sweep-scanned");
  if (!scanMsg) FAIL("sweep", "sweep-scan posted no {sweep-scanned} message");
  else {
    if (!scanMsg.texts.some((x) => x.id === legacyStyle.id)) FAIL("sweep", "sweep-scanned must include the legacy style");
    if (scanMsg.texts.some((x) => x.id === currentStyle.id)) FAIL("sweep", "sweep-scanned must NOT include a style the current plan already names");
    if (scanMsg.texts.some((x) => x.id === foreignStyle.id)) FAIL("sweep", "sweep-scanned must NEVER include a style outside any namespace the plan uses");
  }
  await F6.figma.ui._h({ type: "sweep-delete", ids: [legacyStyle.id] });
  const doneMsg = F6.figma.ui._posted.find((m) => m && m.type === "sweep-done");
  if (!doneMsg || doneMsg.removed !== 1) FAIL("sweep", `sweep-delete must report removing exactly 1 (got ${doneMsg && doneMsg.removed})`);
  if (F6.figma._styles.some((s) => s.id === legacyStyle.id)) FAIL("sweep", "sweep-delete must actually remove the confirmed style");
  if (!F6.figma._styles.some((s) => s.id === currentStyle.id) || !F6.figma._styles.some((s) => s.id === foreignStyle.id)) FAIL("sweep", "sweep-delete must touch ONLY the confirmed ids — nothing else");
}

// ── REPORT ───────────────────────────────────────────────────────────────────────
for (const g of ["manifest", "offline", "vmsyntax", "ui", "parse", "apply", "cascade", "idempotent", "prune", "collnames", "floatapply", "floatidem", "floatprune", "floatprov", "floatretire", "renamecap", "applysys", "applydone", "config", "read", "fonts", "resolveface", "sweep"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
// ── STYLES apply: paint styles bound to Color Modes vars; text styles set + bound; registry prune ──
// Runs on the SAME mock F: applyBundle already created Color Modes, the float e2e already created the
// merged Geometry collection with its type/ half (base "product/16" scale) — exactly the state a real
// apply leaves behind.
if (applyStylePlans && applyFontPrimitives) {
  try {
    const scale = TYPE.typeScale({ treatment: "product", bodyBase: 16, voices: { Display: { weights: [{ name: "Medium", weight: 500 }] } } });
    const bundle = figmaBundle(defaultDocument());
    const fams = Object.keys(bundle["Light_tokens.json"]).filter((n) => n[0] !== "$");
    const families = fams.map((n) => ({ n, name: n.charAt(0).toUpperCase() + n.slice(1) }));
    const plans = stylePlans({ families, scale });

    const pr = await applyFontPrimitives(primitivesApplyPlan(TYPE.typeTokensFigmaPrimitives(scale)));
    if (!pr || !pr.variables) FAIL("styles", "applyFontPrimitives created nothing");
    const prim = F.collections.find((c) => c.name === "Font Primitives");
    if (!prim) FAIL("styles", "no Font Primitives collection created");
    else {
      const fontAlias = F.variables.find((v) => v.variableCollectionId === prim.id && v.name === "font/display");
      const target = fontAlias && Object.values(fontAlias.values)[0];
      if (!fontAlias || !target || target.type !== "VARIABLE_ALIAS") FAIL("styles", "font/display is not aliased to its family primitive");
    }

    const sr = await applyStylePlans(plans);
    const sem = F.collections.find((c) => c.name === "Color Semantic");
    const semIds = new Set(F.variables.filter((v) => v.variableCollectionId === sem.id).map((v) => v.id));
    const paintStyles = F.figma._styles.filter((x) => x._kind === "PAINT");
    if (sr.paints !== plans.paints.length || paintStyles.length !== plans.paints.length) FAIL("styles", `paint styles ${paintStyles.length}/${sr.paints}, expected ${plans.paints.length}`);
    const unbound = paintStyles.filter((x) => !(x.paints[0] && x.paints[0].boundVariables && x.paints[0].boundVariables.color && semIds.has(x.paints[0].boundVariables.color.id)));
    if (unbound.length) FAIL("styles", `${unbound.length} paint styles not bound to a Color Modes variable (e.g. ${unbound[0] && unbound[0].name})`);
    if (!paintStyles.some((x) => /^[A-Z][a-z]+\/scrims\/scrim$/.test(x.name))) FAIL("styles", "no Family/scrims/scrim grouped paint style");
    if (!paintStyles.some((x) => /^[A-Z][a-z]+\/surfaces\/surface$/.test(x.name))) FAIL("styles", "no Family/surfaces/surface grouped paint style");

    const textStyles = F.figma._styles.filter((x) => x._kind === "TEXT");
    if (sr.texts !== plans.texts.length || textStyles.length !== plans.texts.length) FAIL("styles", `text styles ${textStyles.length}/${sr.texts}, expected ${plans.texts.length}`);
    // Display's core weight (the product treatment's 700) + its 1 sibling (Medium/500) — 2 distinct
    // weights; the core (700, heavier of the two) gets the NORMALIZED relative label "heavier"
    // (2026-07-13 — supersedes the literal ladder-name "bold"); the sibling (500) ranks "lighter".
    const core = textStyles.find((x) => x.name === "Display/md/heavier •");
    const sib = textStyles.find((x) => x.name === "Display/md/lighter");
    if (!core || !sib) FAIL("styles", "Display/md/heavier • core or Display/md/lighter sibling text style missing");
    if (core && (!core.fontName || core.fontName.style !== "Bold")) FAIL("styles", `Display core face = ${core && core.fontName && core.fontName.style}, want Bold (700 candidates)`);
    if (sib && (!sib.fontName || sib.fontName.style !== "Medium")) FAIL("styles", `Display sibling face = ${sib && sib.fontName && sib.fontName.style}, want Medium`);
    if (core && (!core.lineHeight || core.lineHeight.unit !== "PIXELS")) FAIL("styles", "text style lineHeight is not PIXELS-united");
    if (core && !core._bound.fontSize) FAIL("styles", "core fontSize not bound to the type/ variable in the Geometry collection");
    if (core && !core._bound.lineHeight) FAIL("styles", "core lineHeight not bound (percent FLOAT after unit set)");
    if (core && !core._bound.letterSpacing) FAIL("styles", "core letterSpacing not bound (percent FLOAT after unit set)");
    if (core && !core._bound.fontFamily) FAIL("styles", "core fontFamily not bound to the Font Primitives alias");
    if (core && !core._bound.fontWeight) FAIL("styles", "core fontWeight not bound to weight/<voice>");
    if (sib && !sib._bound.fontWeight) FAIL("styles", "sibling fontWeight not bound to weight/<voice>/<slug>");

    // a voice WITH a custom styleName (a named cut like "Condensed Black Italic", not derivable from a
    // bare weight number) must bind fontStyle ONLY, never fontWeight alongside it — real Figma resolves
    // a bound fontWeight to "the closest valid weight for the font" independently of fontStyle, which
    // silently overrode the named cut back to the nearest plain face (found live via BZZR's Display core
    // not rendering its bound "Condensed Black Italic" style at all — this mock's own setBoundVariable
    // is too permissive to catch that on its own, so the plan itself must never emit both).
    {
      const namedScale = TYPE.typeScale({ treatment: "statement", voices: { Display: { weight: 900, styleName: "Condensed Black Italic", weights: [{ name: "Bold", weight: 700 }] } } });
      const namedPlans = stylePlans({ families, scale: namedScale });
      const namedCore = namedPlans.texts.find((t) => t.voice === "Display" && t.name.startsWith("Display/lg/") && t.name.endsWith(" •"));
      // core (900) + 1 sibling (Bold/700) — the sibling ranks "lighter" of the 2; the literal styleName
      // still carries the full templated cut ("Condensed Bold Italic"), only the LABEL is relative now.
      const namedSib = namedPlans.texts.find((t) => t.voice === "Display" && t.name === "Display/lg/lighter");
      if (!namedCore || !namedSib) FAIL("styles", "named-style-cut fixture: Display core or sibling plan entry missing");
      if (namedCore && (namedCore.bind.fontWeight || !namedCore.bind.fontStyle)) FAIL("styles", `named-style-cut core must bind fontStyle only (got fontStyle=${namedCore.bind.fontStyle}, fontWeight=${namedCore.bind.fontWeight})`);
      if (namedSib && (namedSib.bind.fontWeight || !namedSib.bind.fontStyle)) FAIL("styles", `named-style-cut sibling must bind fontStyle only (got fontStyle=${namedSib.bind.fontStyle}, fontWeight=${namedSib.bind.fontWeight})`);

      const namedPr = await applyFontPrimitives(primitivesApplyPlan(TYPE.typeTokensFigmaPrimitives(namedScale)));
      if (!namedPr || !namedPr.variables) FAIL("styles", "named-style-cut fixture: applyFontPrimitives created nothing");
      const namedSr = await applyStylePlans(namedPlans);
      const namedCoreStyle = F.figma._styles.find((x) => x._kind === "TEXT" && x.name === namedCore.name);
      if (!namedCoreStyle || namedCoreStyle._bound.fontWeight) FAIL("styles", "named-style-cut core text style must not carry a bound fontWeight field");
      if (!namedCoreStyle || !namedCoreStyle._bound.fontStyle) FAIL("styles", "named-style-cut core text style must carry a bound fontStyle field");
    }

    // STALE fontWeight/fontStyle binding clears across a re-apply — an EXPLICIT, isolated repro (found
    // live via a naming coincidence between two OTHER fixtures in this file: relative labels are RANKS,
    // not literal weight/style names, so the SAME Figma style name can legitimately carry a
    // fontWeight-bound style in one apply and a fontStyle-bound one in the next, e.g. a voice gaining a
    // custom styleName later while its rank-based label happens to stay the same). bindField only ever
    // ADDS a binding, never clears one the CURRENT plan omits — so a style reused by name must have its
    // NOW-unused half of the pair explicitly unbound, or Figma's own "closest valid weight" snap on the
    // stale fontWeight could silently override a freshly-bound fontStyle's precise named cut.
    {
      const F7 = mockFigma();
      const loaded7 = new Function("figma", "__html__", "module", code + "\nreturn { applyFontPrimitives, applyStylePlans };")(F7.figma, "<html>", undefined);
      const genericScale = TYPE.typeScale({ treatment: "product", voices: { Kicker: { weight: 700, weights: [{ name: "Medium", weight: 500 }] } } });
      const genericPlans = stylePlans({ families: [], scale: genericScale });
      await loaded7.applyFontPrimitives(primitivesApplyPlan(TYPE.typeTokensFigmaPrimitives(genericScale)));
      await loaded7.applyStylePlans(genericPlans);
      const reusedName = genericPlans.texts.find((t) => t.voice === "Kicker" && t.name.startsWith("Kicker/lg/") && t.name.endsWith(" •")).name;
      const afterGeneric = F7.figma._styles.find((x) => x._kind === "TEXT" && x.name === reusedName);
      if (!afterGeneric || !afterGeneric._bound.fontWeight) FAIL("styles", "stale-bind repro setup: the generic (no styleName) core must bind fontWeight first");
      // SAME Figma style name, SAME rank shape, but NOW with a custom styleName — fontStyle binds
      // instead. Re-applying under the reused name must not leave the OLD fontWeight bind behind.
      const namedScale2 = TYPE.typeScale({ treatment: "product", voices: { Kicker: { weight: 700, styleName: "Custom Bold Cut", weights: [{ name: "Medium", weight: 500 }] } } });
      const namedPlans2 = stylePlans({ families: [], scale: namedScale2 });
      await loaded7.applyFontPrimitives(primitivesApplyPlan(TYPE.typeTokensFigmaPrimitives(namedScale2)));
      await loaded7.applyStylePlans(namedPlans2);
      const afterNamed = F7.figma._styles.find((x) => x._kind === "TEXT" && x.name === reusedName);
      if (!afterNamed || afterNamed._bound.fontWeight) FAIL("styles", "a stale fontWeight bind from an earlier apply survived once the SAME-named style switched to fontStyle binding");
      if (!afterNamed || !afterNamed._bound.fontStyle) FAIL("styles", "the reused style must carry the NEW fontStyle bind");
    }

    // Figma's lineHeight/letterSpacing bind as ABSOLUTE PIXELS, not a % — a Figma-bound percent FLOAT
    // displays as a bare, unit-less number in Figma's own Properties panel, indistinguishable from a
    // pixel value at a glance; an absolute pixel reads unambiguously there instead (CSS/DTCG keep the
    // ratio/em relative units, unaffected — see test/engine/type.mjs). Each step legitimately gets its
    // OWN pixel value (unlike percent, a differing per-step pixel number is expected, not drift).
    {
      const driftScale = TYPE.typeScale({ treatment: "statement", voices: { "Sub-heading": { leading: 1.125, weights: [] } } });
      const driftPlans = stylePlans({ families, scale: driftScale });
      await applyFontPrimitives(primitivesApplyPlan(TYPE.typeTokensFigmaPrimitives(driftScale)));
      await applyStylePlans(driftPlans);
      for (const step of ["LG", "MD", "SM"]) {
        const st = F.figma._styles.find((x) => x._kind === "TEXT" && x.name === `Sub-heading/${step.toLowerCase()}`);
        const expected = driftScale.categories["Sub-heading"][step].lineHeight;
        if (!st || !st.lineHeight || st.lineHeight.unit !== "PIXELS" || st.lineHeight.value !== expected) FAIL("styles", `Sub-heading/${step} lineHeight must be PIXELS ${expected} (got ${st && st.lineHeight && `${st.lineHeight.unit} ${st.lineHeight.value}`})`);
      }
    }

    // a family Figma does not have: the style is BUILT on a placeholder face (Inter), reported as
    // SUBSTITUTED (not skipped), and its fontFamily stays BOUND to the true-family variable — so the
    // style self-heals once the font is installed. The ghost rides the FULL plan (a partial plan
    // would legitimately prune the rest).
    {
      const ghostBind = { ...plans.texts[0].bind };
      const ghost = await applyStylePlans({ paints: plans.paints, texts: plans.texts.concat([{ name: "Ghost/md", voice: "Ghost", step: "MD", bind: ghostBind, literal: { family: "Nonexistent Face", weight: 700, size: 20, lineHeight: 24, letterSpacing: 0, textCase: "none" } }]) });
      if (!ghost.substitutedFonts || ghost.substitutedFonts.indexOf("Nonexistent Face") < 0) FAIL("styles", "an unavailable family is not reported in substitutedFonts");
      if (ghost.substituted !== 1) FAIL("styles", `substituted count ${ghost.substituted}, want 1`);
      if (ghost.missingFonts.length) FAIL("styles", "a substitutable family must NOT be reported as missing");
      const g = F.figma._styles.find((x) => x.name === "Ghost/md");
      if (!g) FAIL("styles", "an unavailable family produced NO style (scaffold-with-fallback regressed)");
      else {
        if (!g.fontName || g.fontName.family !== "Inter") FAIL("styles", `the placeholder face is not Figma's default Inter: ${g.fontName && g.fontName.family}`);
        if (g.fontSize !== 20) FAIL("styles", "the substituted style lost its metrics");
        if (!g._bound.fontFamily) FAIL("styles", "the substituted style did not keep fontFamily BOUND to the true-family variable (the whole point)");
      }
      // a Figma with NO fonts at all cannot scaffold — then, and only then, we skip honestly.
      const saved = F.figma._fonts; F.figma._fonts = {};
      const none = await applyStylePlans({ paints: [], texts: [{ name: "Nofont/md", voice: "N", step: "MD", bind: {}, literal: { family: "Anything", weight: 400, size: 12, lineHeight: 16, letterSpacing: 0, textCase: "none" } }] });
      F.figma._fonts = saved;
      if (!none.missingFonts.length || F.figma._styles.some((x) => x.name === "Nofont/md")) FAIL("styles", "with no loadable font at all the style must be SKIPPED and reported missing");
      // the two experiments above mutated the style registry (Ghost added; the empty-font run pruned
      // every text style). Re-apply the canonical plan so the registry/idempotency/prune assertions
      // below measure the real contract, not the experiments' residue.
      await applyStylePlans(plans);
      if (F.figma._styles.some((x) => x.name === "Ghost/md")) FAIL("styles", "Ghost/md survived the canonical re-apply (prune regressed)");
    }

    // registry + idempotency + provenance-scoped prune
    const reg = JSON.parse(F.figma.root.getPluginData("ultimate-tokens-styles"));
    if (Object.keys(reg.paints).length !== plans.paints.length || Object.keys(reg.texts).length !== plans.texts.length) FAIL("styles", "style registry does not record every created style");
    const userStyle = F.figma.createPaintStyle(); userStyle.name = "My Own/keep-me";
    const before = F.figma._styles.length;
    await applyStylePlans(plans);
    if (F.figma._styles.length !== before) FAIL("styles", "re-apply is not idempotent (style count moved)");
    // siblings dropped via an EXPLICIT weights:[] opt-out (2026-07-13: omitting voices config no longer
    // means "no siblings" — every voice auto-populates by default — so an explicit opt-out is the only
    // way left to get a bare, undisambiguated core).
    const reduced = stylePlans({ families, scale: TYPE.typeScale({ treatment: "product", bodyBase: 16, voices: { Display: { weights: [] } } }) });
    const sr2 = await applyStylePlans(reduced);
    if (F.figma._styles.some((x) => x.name === "Display/md/lighter")) FAIL("styles", "prune did not remove the dropped sibling style");
    // the core RENAMES too when its siblings disappear (Display/md/heavier • → bare Display/md, nothing
    // left to disambiguate) — the old suffixed name must prune, and the bare name must exist fresh.
    if (F.figma._styles.some((x) => x.name === "Display/md/heavier •")) FAIL("styles", "prune did not remove the core's old suffixed name after its siblings were dropped");
    if (!F.figma._styles.some((x) => x.name === "Display/md")) FAIL("styles", "the core did not revert to its bare name once siblings were dropped");
    if (!F.figma._styles.some((x) => x.name === "My Own/keep-me")) FAIL("styles", "prune touched a USER style (provenance violated)");
    if (!sr2.pruned) FAIL("styles", "prune count not reported");
  } catch (e) { FAIL("styles", "styles apply threw: " + e.message); }
}

{
  const f = fails.find((x) => x.startsWith("styles:"));
  console.log(`  ${f ? "FAIL" : "pass"}  styles${f ? "  — " + f.slice(8) : ""}`);
}
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("\nPASS: figma-plugin-app — manifest + offline code.js + bridged ui.html + the figmaBundle→variables cascade + the Type/Geometry breakpoint-mode apply + the styles apply (bound paints/texts, registry prune)");
process.exit(0);
