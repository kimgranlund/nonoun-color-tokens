#!/usr/bin/env node
// mode-apply.mjs — verifier for the PURE breakpoint-mode apply planner (figma/binder/mode-apply-plan.mjs):
// modeApplyPlan + validateModeInterchange over REAL Type/Geometry interchanges. The plan is what the Figma
// apply-path (code.js, paired-session work) will MIRROR; this gates its invariants with zero figma calls.
import * as A from "../../figma/binder/mode-apply-plan.mjs";
import * as T from "../../src/engine/type.mjs";
import * as G from "../../src/engine/geometry.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const J = (x) => JSON.stringify(x);

// ── a real TYPE interchange (Base + Mobile) → plan ──
const typeIx = T.typeTokensFigmaModes(T.typeScale({ treatment: "product", bodyBase: 16 }), [{ name: "Mobile", scale: T.typeScale({ treatment: "product", bodyBase: 13 }) }]);
ok(A.validateModeInterchange(typeIx).length === 0, "validate: a real Typography interchange is sound (" + A.validateModeInterchange(typeIx).join("; ") + ")");
const tp = A.modeApplyPlan(typeIx);
ok(tp.length === 1 && tp[0].collection === "Breakpoints", "plan: one entry, the merged Geometry collection (the type half emits there since TKT-0009)");
ok(J(tp[0].modes) === J(["Base", "Mobile"]) && tp[0].defaultMode === "Base" && J(tp[0].addModes) === J(["Mobile"]), "plan: modes [Base,Mobile], default Base, addModes [Mobile]");
const names = tp[0].variables.map((v) => v.name);
ok(J(names) === J(names.slice().sort()), "plan: variables are name-sorted (deterministic apply order)");
ok(tp[0].variables.every((v) => v.type === "FLOAT" && J(v.values.map((x) => x.mode)) === J(["Base", "Mobile"]) && v.values.every((x) => Number.isFinite(x.value))), "plan: every variable is FLOAT, value-complete, one value per mode IN modes order");
const bodySize = tp[0].variables.find((v) => v.name === "type/body/md/size");
ok(bodySize && bodySize.values[0].value !== bodySize.values[1].value, "plan: per-mode values differ (Base bodyBase 16 vs Mobile 13)");

// ── a real GEOMETRY interchange (Base + Desktop) → plan ──
const geomIx = G.geomTokensFigmaModes(G.geomScale({ treatment: "comfortable", baseHeight: 28 }), [{ name: "Desktop", scale: G.geomScale({ treatment: "comfortable", baseHeight: 40 }) }]);
ok(A.validateModeInterchange(geomIx).length === 0, "validate: a real Geometry interchange is sound");
const gp = A.modeApplyPlan(geomIx);
ok(gp.length === 1 && gp[0].collection === "Breakpoints" && J(gp[0].modes) === J(["Base", "Desktop"]), "plan: the Breakpoints collection, modes [Base,Desktop]");
ok(gp[0].variables.every((v) => v.values.length === 2 && v.values.every((x) => Number.isFinite(x.value))), "plan: every Geometry variable is value-complete across both modes");

// ── identity: no breakpoints ⇒ a single Base mode, addModes empty ──
const idn = A.modeApplyPlan(T.typeTokensFigmaModes(T.typeScale({ treatment: "product" }), []));
ok(J(idn[0].modes) === J(["Base"]) && idn[0].addModes.length === 0, "plan: no breakpoints ⇒ [Base], no addModes");

// ── the DESKTOP-FIRST standard-set shape: a NAMED base ("Mobile"), placed LAST — Desktop becomes the
// default mode (Figma's default = the first mode; the plugin renames the existing default to it) ──
const dtm = T.typeTokensFigmaModes(
  T.typeScale({ treatment: "product", bodyBase: 16 }),
  [{ name: "Desktop", scale: T.typeScale({ treatment: "product", bodyBase: 18 }) }, { name: "Tablet", scale: T.typeScale({ treatment: "product", bodyBase: 17 }) }],
  { baseName: "Mobile", baseLast: true },
);
ok(A.validateModeInterchange(dtm).length === 0, "validate: the desktop-first (named-base) interchange is sound (" + A.validateModeInterchange(dtm).join("; ") + ")");
const dp = A.modeApplyPlan(dtm);
ok(J(dp[0].modes) === J(["Desktop", "Tablet", "Mobile"]) && dp[0].defaultMode === "Desktop" && J(dp[0].addModes) === J(["Tablet", "Mobile"]), `plan: desktop-first modes [Desktop,Tablet,Mobile], default Desktop (got ${J(dp[0].modes)}, default ${dp[0].defaultMode})`);
ok(dp[0].variables.every((v) => J(v.values.map((x) => x.mode)) === J(["Desktop", "Tablet", "Mobile"]) && v.values.every((x) => Number.isFinite(x.value))), "plan: desktop-first variables are value-complete in modes order");
const dSize = dp[0].variables.find((v) => v.name === "type/body/md/size");
ok(dSize && dSize.values[2].value < dSize.values[0].value, "plan: the Mobile (base) value is the smallest — base scale rides under the breakpoint bumps");
// a breakpoint colliding with the named base is disambiguated, not dropped/shadowed
const collide = T.typeTokensFigmaModes(T.typeScale({ treatment: "product" }), [{ name: "Mobile", scale: T.typeScale({ treatment: "product", bodyBase: 13 }) }], { baseName: "Mobile", baseLast: true });
ok(J(collide.collections.Breakpoints.modes) === J(["Mobile 2", "Mobile"]), `emit: a breakpoint named like the base disambiguates ("Mobile 2") — got ${J(collide.collections.Breakpoints.modes)}`);
// geometry mirrors the same opts
const gdtm = G.geomTokensFigmaModes(G.geomScale({ treatment: "comfortable", baseHeight: 24 }), [{ name: "Desktop", scale: G.geomScale({ treatment: "comfortable", baseHeight: 28 }) }], { baseName: "Mobile", baseLast: true });
ok(J(gdtm.collections.Breakpoints.modes) === J(["Desktop", "Mobile"]) && A.validateModeInterchange(gdtm).length === 0, "emit: Geometry honors baseName/baseLast and stays plan-sound");

// ── mergeModeInterchanges: the two halves land as ONE "Geometry" collection (TKT-0009 — the executor
// prunes variables per collection, so two plans on one collection would delete each other's halves) ──
const geomIx2 = G.geomTokensFigmaModes(G.geomScale({ treatment: "comfortable", baseHeight: 28 }), [{ name: "Mobile", scale: G.geomScale({ treatment: "comfortable", baseHeight: 24 }) }]);
const merged = A.mergeModeInterchanges(typeIx, geomIx2);
ok(merged && Object.keys(merged.collections).length === 1 && !!merged.collections.Breakpoints, "merge: type + geometry halves yield ONE Breakpoints collection");
ok(A.validateModeInterchange(merged).length === 0, "merge: the merged interchange is sound (" + A.validateModeInterchange(merged).join("; ") + ")");
const mVars = Object.keys(merged.collections.Breakpoints.variables);
ok(mVars.some((k) => k.startsWith("type/")) && mVars.some((k) => k.startsWith("size/")), "merge: carries both the type/ half and the box-geometry half");
const mp = A.modeApplyPlan(merged);
ok(mp.length === 1 && mp[0].variables.length === mVars.length, "merge: plans as ONE entry carrying every variable of both halves");
ok(A.mergeModeInterchanges(null, undefined) === null, "merge: zero mergeable inputs ⇒ null");
ok(Object.keys(A.mergeModeInterchanges(typeIx).collections.Breakpoints.variables).every((k) => k.startsWith("type/")), "merge: a single half passes through (type-only export still lands in Breakpoints)");
// MISMATCHED mode lists (type [Base,Mobile] beside geometry [Base,Tablet]) union — and each half
// BACK-FILLS the modes it doesn't define with its OWN default-mode value (a system that doesn't vary
// at a breakpoint = its base values there), so the merged interchange stays plan-sound.
const gTab = G.geomTokensFigmaModes(G.geomScale({ treatment: "comfortable", baseHeight: 28 }), [{ name: "Tablet", scale: G.geomScale({ treatment: "comfortable", baseHeight: 26 }) }]);
const mismatch = A.mergeModeInterchanges(typeIx, gTab);
ok(J(mismatch.collections.Breakpoints.modes) === J(["Base", "Mobile", "Tablet"]), `merge: mismatched mode lists union in first-writer order (got ${J(mismatch.collections.Breakpoints.modes)})`);
ok(A.validateModeInterchange(mismatch).length === 0, "merge: the back-filled mismatch interchange is plan-sound (never half-applied)");
const mmType = mismatch.collections.Breakpoints.variables["type/body/md/size"];
const mmGeom = mismatch.collections.Breakpoints.variables["size/md/height"];
ok(mmType.values.Tablet === mmType.values.Base && mmType.values.Mobile !== mmType.values.Base, "merge: the type half back-fills Tablet (its undefined mode) from Base, keeps its own Mobile value");
ok(mmGeom.values.Mobile === mmGeom.values.Base && mmGeom.values.Tablet !== mmGeom.values.Base, "merge: the geometry half back-fills Mobile from Base, keeps its own Tablet value");
ok(gTab.collections.Breakpoints.variables["size/md/height"].values.Mobile === undefined, "merge: back-fill CLONES values — the emitter's own interchange is never mutated");

// ── applyRenameMigrations (TKT-0012): pure stamping of the id-preserving rename fields ──
{
  const plans = A.modeApplyPlan(A.mergeModeInterchanges(typeIx, geomIx2));
  const stamped = A.applyRenameMigrations(plans, { collections: { "Breakpoints": { renameFrom: ["Geometry"], vars: { "type/Body/MD/size": "type/body/md/size" } } } });
  ok(JSON.stringify(stamped[0].renameFrom) === JSON.stringify(["Geometry"]) && stamped[0].renames["type/Body/MD/size"] === "type/body/md/size", "stamps renameFrom + renames onto the matching collection's plan");
  ok(!("renames" in plans[0]) && !("renameFrom" in plans[0]), "planner output is never mutated (shallow-copy before stamping)");
  ok(A.applyRenameMigrations(plans, { collections: { "Nope": { vars: { a: "b" } } } })[0].renames === undefined, "a migration for an absent collection is a no-op, not an error");
  ok(A.applyRenameMigrations(plans, {}) === plans && A.applyRenameMigrations(plans, null) === plans, "empty/null migrations pass the SAME array through (identity)");
}

// ── validateModeInterchange CATCHES the malformed shapes (the half-bound-import failures) ──
ok(A.validateModeInterchange(null).length > 0 && A.validateModeInterchange({}).length > 0, "validate: null / empty interchange → problems");
ok(/no collections/.test(A.validateModeInterchange({ collections: {} })[0]), "validate: no collections → reported");
ok(A.validateModeInterchange({ collections: { C: { modes: ["Base", "Mobile"], variables: { "a/x": { type: "FLOAT", values: { Base: 1 } } } } } }).some((s) => /missing value for mode "Mobile"/.test(s)), "validate: a variable missing a per-mode value → reported (would leave a mode unset)");
ok(A.validateModeInterchange({ collections: { C: { modes: ["Base", "Base"], variables: { "a/x": { type: "FLOAT", values: { Base: 1 } } } } } }).some((s) => /duplicate mode/.test(s)), "validate: duplicate mode name → reported (Figma rejects on import)");
ok(A.validateModeInterchange({ collections: { C: { modes: ["Mobile"], variables: { "a/x": { type: "FLOAT", values: { Mobile: 1 } } } } } }).length === 0, "validate: a non-'Base' first mode is SOUND (the base layer may be renamed; the first mode is the default, whatever its name)");
ok(A.validateModeInterchange({ collections: { C: { modes: ["", "Mobile"], variables: { "a/x": { type: "FLOAT", values: { "": 1, Mobile: 1 } } } } } }).some((s) => /non-empty name/.test(s)), "validate: an EMPTY first mode (the default) → reported");
ok(A.validateModeInterchange({ collections: { C: { modes: ["Base"], variables: { "a/x": { type: "FLOAT", values: { Base: "big" } } } } } }).some((s) => /non-finite FLOAT/.test(s)), "validate: non-finite FLOAT value → reported");
ok(A.validateModeInterchange({ collections: { C: { modes: ["Base"], variables: { "a/x": { type: "NUMBER", values: { Base: 1 } } } } } }).some((s) => /unknown variable type/.test(s)), "validate: unknown variable type → reported");

if (fails.length) { console.error(`mode-apply FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("mode-apply PASS — modeApplyPlan (ordered · value-complete · name-sorted) · validateModeInterchange (modes/values/types) over real Type+Geometry interchanges");
process.exit(0);
