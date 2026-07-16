#!/usr/bin/env node
// verify.mjs — figma-plugin validation adapter (CRITIC side; deny-on-write to the advancer).
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as P from "../../figma/binder/bind-plan.mjs";
import * as MAP from "../../figma/binder/mode-apply-plan.mjs";
import * as TYPE from "../../src/engine/type.mjs";
import * as GEOM from "../../src/engine/geometry.mjs";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "figma", "binder"); // the binder lives in figma/binder/
const RT = JSON.parse(readFileSync(new URL("../../docs/reference/data/role-table.json", import.meta.url), "utf8"));
const { EXPORT_STOPS, SCRIM_BASES, SCRIM_STEPS } = RT.constants;
const NAMES = RT.defaults.map((p) => p.name.toLowerCase());
const fails = [];
const FAIL = (g, m) => { if (!fails.some((f) => f.startsWith(g + ":"))) fails.push(`${g}: ${m}`); };

// canonical raw-colors variable name set (the answer key): {n}/{pad3(stop)} ∪ {n}/{pad3(base)}-{pad3(step)}
const pad3 = (s) => String(s).padStart(3, "0");
const CANON = new Set();
for (const n of NAMES) {
  for (const s of EXPORT_STOPS) CANON.add(`${n}/${pad3(s)}`);
  for (const b of SCRIM_BASES) for (const step of SCRIM_STEPS) CANON.add(`${n}/${pad3(b)}-${pad3(step)}`);
}

// ── hpg-plugin-bindings: every emitted target exists in the canonical raw-colors name set ─
const targets = P.bindingTargets(NAMES);
if (!Array.isArray(targets) || targets.length === 0) FAIL("bindings", "bindingTargets returned nothing");
const dangling = (targets || []).filter((t) => !CANON.has(t));
if (dangling.length) FAIL("bindings", `${dangling.length} dangling target(s), e.g. ${dangling.slice(0, 3).join(", ")}`);
// non-vacuity: a full plan covers every role's light+dark across all palettes
const plan = P.bindingPlan(NAMES);
if (!Array.isArray(plan) || plan.length !== 53 * NAMES.length) FAIL("bindings", `bindingPlan length ${plan && plan.length}, want ${53 * NAMES.length}`);

// ── hpg-plugin-offline: manifest parses + declares NO network access (current Figma manifest format:
//    networkAccess.allowedDomains = ["none"]); code.js syntactically valid ─
try {
  const man = JSON.parse(readFileSync(join(HERE, "figma-semantic-binder/manifest.json"), "utf8"));
  const na = man.networkAccess;
  const offline = na && typeof na === "object" && Array.isArray(na.allowedDomains) && na.allowedDomains.length === 1 && na.allowedDomains[0] === "none";
  if (!offline) FAIL("offline", `manifest.networkAccess = ${JSON.stringify(na)}, want { allowedDomains: ["none"] }`);
  if (man.main !== "code.js") FAIL("offline", `manifest.main = ${man.main}`);
} catch (e) { FAIL("offline", `manifest.json: ${e.message}`); }
try {
  execSync(`node --check "${join(HERE, "figma-semantic-binder/code.js")}"`, { stdio: "pipe" });
} catch (e) { FAIL("offline", `code.js failed node --check: ${String(e.stderr || e).slice(0, 120)}`); }

// ── compliance: the binder surfaces no raw error, carries no stale "HCT" branding, and top-level
//    bind errors are handled (main().catch) so the user never sees an unhandled plugin crash ─
try {
  const bcode = readFileSync(join(HERE, "figma-semantic-binder/code.js"), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/figma\.notify\([^;]*\b(?:e\.message|String\(e\)|\.stack)\b/.test(bcode)) FAIL("compliance", "binder surfaces a raw error in figma.notify");
  if (/figma\.notify\([^;]*HCT/.test(bcode)) FAIL("compliance", "binder has a user-facing 'HCT' notify (stale branding)");
  if (!/main\(\)\s*\.catch\s*\(/.test(bcode)) FAIL("compliance", "binder's main() is not wrapped in .catch — an unhandled error would crash with a raw message");
  const bman = JSON.parse(readFileSync(join(HERE, "figma-semantic-binder/manifest.json"), "utf8"));
  if (/HCT/.test(bman.name || "")) FAIL("compliance", `binder manifest name still says HCT: ${bman.name}`);
} catch (e) { FAIL("compliance", `binder compliance scan: ${e.message}`); }

const BINDER_PATH = join(HERE, "figma-semantic-binder/code.js");
const FLOAT_ANCHOR = 'JSON.parse("[]"); /* __ULTIMATE_TOKENS_FLOAT_PLANS__ */';

// loadBinder — compile the binder's source, EXPOSING roleTable/refKey/main/applyFloatPlans/FLOAT_PLANS
// via an appended return (they're all top-level function/const declarations, which hoist within the
// generated function body — no export mechanism needed). The file's own trailing `main().catch(...)`
// auto-invoke is stripped first: left in place it fires the moment the source loads (this file's `main`
// is not message-driven like the flagship plugin — it just runs), which would EITHER race an explicit
// call made afterward on the same mock figma (double-creating collections) OR — when no figma is passed
// at all (the roleTable/refKey-only PARITY GUARD below) — throw an orphaned, unhandled rejection that
// prints console noise once a later `await` in this script gives the microtask queue a chance to flush it.
function loadBinder(src, figma) {
  const controlled = src.replace(/\nmain\(\)\.catch\([\s\S]*$/, "");
  if (controlled === src) throw new Error("loadBinder: could not find the trailing main().catch(...) to strip");
  const fn = new Function("figma", "__html__", "module", controlled + "\nreturn { roleTable, refKey, main, applyFloatPlans, FLOAT_PLANS };");
  return fn(figma, "<html>", undefined);
}

// ── PARITY GUARD: the runtime code.js HARDCODES roleTable() (the Figma sandbox can't import the
//    .mjs), so it's a second copy of the validated role table that node --check can't catch drifting.
//    Load it (without running main()) and assert its derived targets EQUAL bind-plan's canonical set,
//    so a ref can't go stale silently. (Real incident 2026-06-18: the scrim refs drifted here.) ──
try {
  const src = readFileSync(BINDER_PATH, "utf8");
  const { roleTable, refKey: rk } = loadBinder(src, undefined);
  const runtime = new Set();
  for (const n of NAMES) for (const r of roleTable(n)) { runtime.add(`${n}/${rk(r.light)}`); runtime.add(`${n}/${rk(r.dark)}`); }
  const canon = new Set(P.bindingTargets(NAMES));
  const drift = [...runtime].filter((t) => !canon.has(t)).concat([...canon].filter((t) => !runtime.has(t)));
  if (drift.length) FAIL("parity", `runtime code.js roleTable drifted from canonical (e.g. ${drift.slice(0, 3).join(", ")})`);
} catch (e) { FAIL("parity", `could not load/compare runtime roleTable: ${e.message}`); }

// ── a mock figma: in-memory collections + variables (a trimmed copy of test/figma/plugin.mjs's mock —
//    duplicated rather than imported, since plugin.mjs is a self-running verifier that process.exit()s
//    at end of file; importing it would execute AND exit this file too) ──
function mockFigma() {
  const collections = [], variables = [];
  let id = 0;
  const figma = {
    notify() {}, closePlugin() {},
    root: { _pd: {}, setPluginData(k, v) { this._pd[k] = String(v); }, getPluginData(k) { return this._pd[k] || ""; } },
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
        const vm = {};
        const v = { id: "v" + id++, name, variableCollectionId: coll.id, type, values: vm, valuesByMode: vm,
          setValueForMode(mid, val) { vm[mid] = val; },
          remove() { const i = variables.indexOf(this); if (i >= 0) variables.splice(i, 1); } };
        variables.push(v); return v;
      },
      createVariableAlias(v) { return { type: "VARIABLE_ALIAS", id: v.id }; },
    },
  };
  return { figma, collections, variables };
}

// ── floatanchor: the injection anchor app.js.downloadFigmaPlugin() string-replaces, and the SAME
//    FLOAT_REGISTRY_KEY as the flagship (figma/plugin/code.js) so both converge on one collection set ──
const binderSrc = readFileSync(BINDER_PATH, "utf8");
if (!binderSrc.includes(FLOAT_ANCHOR)) FAIL("floatanchor", "code.js is missing the FLOAT_PLANS injection anchor");
if (!/FLOAT_REGISTRY_KEY\s*=\s*"ultimate-tokens-float-collections"/.test(binderSrc)) FAIL("floatanchor", "code.js FLOAT_REGISTRY_KEY does not match the flagship plugin's key string");
if (!/applyFloatPlans/.test(binderSrc)) FAIL("floatanchor", "code.js has no applyFloatPlans executor");

// ── floatcreate: applyFloatPlans creates the MERGED "Geometry" collection (type/ + box-geometry halves,
//    TKT-0009; Base + a breakpoint mode), the sized vars carry a DIFFERENT value per mode, re-apply is
//    idempotent (no doubling), and removing a breakpoint prunes its mode (mirrors test/figma/plugin.mjs) ──
{
  const F = mockFigma();
  try {
    const { applyFloatPlans } = loadBinder(binderSrc, F.figma);
    if (typeof applyFloatPlans !== "function") { FAIL("floatcreate", "code.js exported no applyFloatPlans"); }
    else {
      const typeIx = TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product", bodyBase: 16 }), [{ name: "Desktop", scale: TYPE.typeScale({ treatment: "product", bodyBase: 19 }) }]);
      const geomIx = GEOM.geomTokensFigmaModes(GEOM.geomScale({ treatment: "comfortable", baseHeight: 28 }), [{ name: "Desktop", scale: GEOM.geomScale({ treatment: "comfortable", baseHeight: 40 }) }]);
      const plans = MAP.modeApplyPlan(MAP.mergeModeInterchanges(typeIx, geomIx));
      const fr = await applyFloatPlans(plans);
      const geo = F.collections.find((c) => c.name === "Geometry");
      if (F.collections.some((c) => c.name === "Typography")) FAIL("floatcreate", "the merged apply minted a Typography collection (the pre-TKT-0009 shape)");
      if (!geo) FAIL("floatcreate", "no Geometry collection created");
      if (geo && geo.modes.map((m) => m.name).join() !== "Base,Desktop") FAIL("floatcreate", `Geometry modes = ${geo && geo.modes.map((m) => m.name)}, want Base,Desktop`);
      if (fr.collections !== 1) FAIL("floatcreate", `applyFloatPlans reported ${fr.collections} collections, want 1 (merged)`);
      if (geo) {
        const gVars = F.variables.filter((v) => v.variableCollectionId === geo.id);
        if (!gVars.some((v) => v.name.startsWith("type/"))) FAIL("floatcreate", "the type/ half is missing from the merged collection");
        if (!gVars.some((v) => v.name.startsWith("size/"))) FAIL("floatcreate", "the box-geometry half is missing from the merged collection");
        const baseId = geo.modes[0].modeId, bpId = geo.modes[1].modeId;
        const bodyMd = gVars.find((v) => v.name === "type/Body/MD/size");
        if (!bodyMd) FAIL("floatcreate", "type/Body/MD/size variable missing");
        else if (!Number.isFinite(bodyMd.valuesByMode[baseId]) || !Number.isFinite(bodyMd.valuesByMode[bpId])) FAIL("floatcreate", "type/Body/MD/size not value-complete across modes");
        else if (bodyMd.valuesByMode[baseId] === bodyMd.valuesByMode[bpId]) FAIL("floatcreate", "type/Body/MD/size Base == Desktop (per-mode values should differ)");
      }
      // idempotency: re-apply → no doubled collection/modes/vars
      await applyFloatPlans(plans);
      if (F.collections.filter((c) => c.name === "Geometry").length !== 1) FAIL("floatcreate", "re-apply duplicated the Geometry collection");
      if (geo && geo.modes.length !== 2) FAIL("floatcreate", `re-apply left ${geo && geo.modes.length} Geometry modes, want 2 (no duplicate mode)`);
      // drop the breakpoint → its mode is pruned on re-apply (Base survives, is never removable)
      const baseOnly = MAP.mergeModeInterchanges(
        TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product", bodyBase: 16 }), []),
        GEOM.geomTokensFigmaModes(GEOM.geomScale({ treatment: "comfortable", baseHeight: 28 }), []),
      );
      await applyFloatPlans(MAP.modeApplyPlan(baseOnly));
      if (geo && geo.modes.map((m) => m.name).join() !== "Base") FAIL("floatcreate", `after removing the breakpoint, Geometry modes = ${geo && geo.modes.map((m) => m.name)}, want Base`);
    }
  } catch (e) { FAIL("floatcreate", "applyFloatPlans threw: " + e.message); }
}

// ── floatindep: with NO "Color Primitives" collection and a non-empty (injected) FLOAT_PLANS, main()
//    still creates the breakpoint collections and does not throw — the color-abort no longer blocks
//    Type/Geometry (the bug this LLD fixes) ──
{
  const F = mockFigma(); // no Color Primitives
  const typeIx = TYPE.typeTokensFigmaModes(TYPE.typeScale({ treatment: "product", bodyBase: 16 }), [{ name: "Mobile", scale: TYPE.typeScale({ treatment: "product", bodyBase: 13 }) }]);
  const plans = MAP.modeApplyPlan(typeIx);
  const injected = binderSrc.replace(FLOAT_ANCHOR, `JSON.parse(${JSON.stringify(JSON.stringify(plans))}); /* injected */`);
  try {
    const { main } = loadBinder(injected, F.figma);
    await main();
    if (F.collections.some((c) => c.name === "Color Modes" || c.name === "Color Primitives")) FAIL("floatindep", "main() created a Color collection with no Color Primitives present");
    if (!F.collections.some((c) => c.name === "Geometry")) FAIL("floatindep", "main() skipped the merged Geometry breakpoint collection when Color Primitives was absent (color-abort still blocking breakpoints)");
  } catch (e) { FAIL("floatindep", "main() threw with no Color Primitives + a non-empty FLOAT_PLANS: " + e.message); }
}

// ── floatnoop: the CHECKED-IN binder (FLOAT_PLANS baked as []) creates NO breakpoint collections — the
//    generic/asset download stays a color-only, palette-agnostic no-op for Type/Geometry ──
{
  const F = mockFigma();
  try {
    const { main } = loadBinder(binderSrc, F.figma);
    await main();
    if (F.collections.some((c) => c.name === "Typography" || c.name === "Geometry")) FAIL("floatnoop", "the checked-in binder (FLOAT_PLANS []) created a breakpoint collection");
  } catch (e) { FAIL("floatnoop", "main() threw on the generic (FLOAT_PLANS []) binder: " + e.message); }
}

// ── floatparity: the binder ports 5 float-executor functions VERBATIM from the flagship
//    (figma/plugin/code.js). They're a pure DATA executor with no planner to spec-gate against, so — per
//    the repo's culture (see the roleTable PARITY GUARD above; scrim-drift incident 2026-06-18) — the two
//    copies are gated against silent drift. Extract each function from BOTH files and compare their
//    comment-stripped, whitespace-normalized bodies: the two carry intentionally different surrounding
//    comments, but the executable code MUST stay byte-identical so a user who runs the flagship AND the
//    binder against one file converges on the SAME collection set (they share FLOAT_REGISTRY_KEY) ──
{
  const FLAGSHIP_PATH = join(HERE, "..", "plugin", "code.js");
  const FLOAT_FNS = ["readFloatRegistry", "writeFloatRegistry", "ensureFloatCollection", "varsByName", "applyFloatPlans"];
  const extractFn = (src, name) => {
    const m = new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{").exec(src);
    if (!m) return null;
    let depth = 0, i = src.indexOf("{", m.index);
    for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) { i++; break; } }
    return src.slice(m.index, i);
  };
  const norm = (code) => code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  const keyLit = (src) => (/FLOAT_REGISTRY_KEY\s*=\s*("[^"]*")/.exec(src) || [])[1];
  try {
    const flagSrc = readFileSync(FLAGSHIP_PATH, "utf8");
    for (const fn of FLOAT_FNS) {
      const a = extractFn(binderSrc, fn), b = extractFn(flagSrc, fn);
      if (!a) { FAIL("floatparity", `binder is missing ${fn}()`); continue; }
      if (!b) { FAIL("floatparity", `flagship is missing ${fn}()`); continue; }
      if (norm(a) !== norm(b)) FAIL("floatparity", `${fn}() body drifted between the binder and the flagship (executor copies must stay byte-identical)`);
    }
    if (!keyLit(binderSrc) || keyLit(binderSrc) !== keyLit(flagSrc)) FAIL("floatparity", `FLOAT_REGISTRY_KEY literal differs (binder ${keyLit(binderSrc)} vs flagship ${keyLit(flagSrc)}) — the two would not converge on one collection set`);
  } catch (e) { FAIL("floatparity", "could not load/compare the flagship executor: " + e.message); }
}

// ── REPORT ───────────────────────────────────────────────────────────────────────────────
for (const g of ["bindings", "offline", "parity", "floatanchor", "floatcreate", "floatindep", "floatnoop", "floatparity"]) {
  const f = fails.find((x) => x.startsWith(g + ":"));
  console.log(`  ${f ? "FAIL" : "pass"}  ${g}${f ? "  — " + f.slice(g.length + 2) : ""}`);
}
console.log(`  (checked ${targets ? targets.length : 0} binding targets vs ${CANON.size} canonical raw-colors names)`);
console.log("  defer  hpg-parity-roletable — role-table parity is verified by semantic-mapping");
if (fails.length) { console.error(`\nFAIL: ${fails.length} gate failure(s)`); process.exit(1); }
console.log("\nPASS: figma-plugin clears its checkable [gate] predicates");
process.exit(0);
