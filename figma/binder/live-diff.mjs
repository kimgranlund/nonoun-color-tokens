// live-diff.mjs — PURE comparison between a live Figma read-back (figma/plugin/code.js's
// readFloatVariables, the Geometry/Type counterpart to readRawColors) and the apply plans the UI is
// about to write, so the apply gate can show "N values will be overwritten" before the user commits
// (TKT-0020 / docs/reference/reviews/2026-07-17-collections-arch.md C2). Zero figma calls; consumed by
// src/ui/overlays/apply-gate.js and this module's own unit test (test/figma/live-diff.mjs).
//
// SHAPES:
//   a modeApplyPlan entry (mode-apply-plan.mjs):     { collection, variables: [{ name, values: [{mode,value}] }] }
//   a primitivesApplyPlan entry (style-plan.mjs):    { collection: "Font Primitives", mode, variables: [{ name, type, value|target }] }
//   a live read-back collection (readFloatVariables): { found, modes, values: { "<name>": { "<mode>": <value> } } }

// flattenModePlanValues(plan) → [{name, mode, value}] — every (variable, mode) pair a modeApplyPlan
// entry is about to write.
export function flattenModePlanValues(plan) {
  const out = [];
  if (!plan || !Array.isArray(plan.variables)) return out;
  for (const v of plan.variables) {
    if (!v || typeof v.name !== "string" || !Array.isArray(v.values)) continue;
    for (const pair of v.values) if (pair && pair.mode !== undefined) out.push({ name: v.name, mode: pair.mode, value: pair.value });
  }
  return out;
}

// flattenPrimitivesPlanValues(plan) → [{name, mode, value}] — the LITERAL (non-ALIAS) Font Primitives
// variables a primitivesApplyPlan entry is about to write. Aliases are skipped: an alias has no
// independently-set value (Figma resolves it from its target), so diffing its literal target already
// covers drift — counting the alias too would double-count the same change.
export function flattenPrimitivesPlanValues(plan) {
  const out = [];
  if (!plan || !Array.isArray(plan.variables)) return out;
  const mode = plan.mode || "Value";
  for (const v of plan.variables) {
    if (!v || typeof v.name !== "string" || v.type === "ALIAS") continue;
    out.push({ name: v.name, mode, value: v.value });
  }
  return out;
}

// valuesDiffer(a, b) — numeric values compare with a small epsilon (a round-trip through Figma's FLOAT
// storage can shift the last bit); strings/booleans/others compare strictly.
function valuesDiffer(a, b) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) > 1e-6;
  return a !== b;
}

// countChangedValues(pairs, live) → how many of `pairs` (flattened plan values) have a LIVE
// counterpart that DIFFERS. `live` is one collection's read-back `values` map. A pair with no live
// counterpart (a new variable, a new mode, or the collection wasn't found at all) is NOT counted —
// only a value that's actually THERE and about to be silently overwritten counts as "changed"; a
// first-ever apply into an empty/absent collection always reports 0.
export function countChangedValues(pairs, live) {
  const byName = live && typeof live === "object" ? live : {};
  let n = 0;
  for (const p of Array.isArray(pairs) ? pairs : []) {
    if (!p || typeof p.name !== "string") continue;
    const modes = byName[p.name];
    if (!modes || typeof modes !== "object" || !(p.mode in modes)) continue;
    if (valuesDiffer(modes[p.mode], p.value)) n++;
  }
  return n;
}
