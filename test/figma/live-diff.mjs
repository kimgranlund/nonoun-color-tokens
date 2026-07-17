#!/usr/bin/env node
// live-diff.mjs — verifier for the PURE apply-vs-live comparison (figma/binder/live-diff.mjs), the
// Geometry/Type counterpart to Color's ad-hoc drift diff (TKT-0020 / collections-arch review C2). No
// figma calls; the read-back SHAPE this diffs against is proven separately over a mock in
// test/figma/plugin.mjs's "readfloat" gate.
import * as D from "../../figma/binder/live-diff.mjs";
import * as A from "../../figma/binder/mode-apply-plan.mjs";
import * as T from "../../src/engine/type.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const J = (x) => JSON.stringify(x);

// ── flattenModePlanValues: every (variable, mode) pair a modeApplyPlan entry writes ──
const typeIx = T.typeTokensFigmaModes(T.typeScale({ treatment: "product", bodyBase: 16 }), [{ name: "Mobile", scale: T.typeScale({ treatment: "product", bodyBase: 13 }) }]);
const plan = A.modeApplyPlan(typeIx)[0];
const flat = D.flattenModePlanValues(plan);
ok(flat.length === plan.variables.length * plan.modes.length, `flattenModePlanValues: ${flat.length} pairs, want ${plan.variables.length * plan.modes.length} (one per variable×mode)`);
ok(flat.every((p) => typeof p.name === "string" && typeof p.mode === "string"), "flattenModePlanValues: every pair carries a name + mode");
ok(D.flattenModePlanValues(null).length === 0 && D.flattenModePlanValues({}).length === 0, "flattenModePlanValues: malformed input ⇒ []");

// ── flattenPrimitivesPlanValues: literals only, aliases dropped ──
const primPlan = {
  collection: "Font Primitives", mode: "Value",
  variables: [
    { name: "family/inter", type: "STRING", value: "Inter" },
    { name: "weight/display", type: "FLOAT", value: 700 },
    { name: "font/display", type: "ALIAS", target: "family/inter" },
  ],
};
const primFlat = D.flattenPrimitivesPlanValues(primPlan);
ok(primFlat.length === 2, `flattenPrimitivesPlanValues: ${primFlat.length} entries, want 2 (aliases dropped)`);
ok(!primFlat.some((p) => p.name === "font/display"), "flattenPrimitivesPlanValues: the ALIAS entry is dropped");
ok(primFlat.every((p) => p.mode === "Value"), "flattenPrimitivesPlanValues: every entry carries the plan's mode");
ok(D.flattenPrimitivesPlanValues(null).length === 0, "flattenPrimitivesPlanValues: malformed input ⇒ []");

// ── countChangedValues: the core diff — only a value that's THERE and DIFFERENT counts ──
const pairs = [{ name: "a", mode: "Base", value: 10 }, { name: "b", mode: "Base", value: 20 }];
ok(D.countChangedValues(pairs, { a: { Base: 10 }, b: { Base: 20 } }) === 0, "countChangedValues: identical live values ⇒ 0");
ok(D.countChangedValues(pairs, { a: { Base: 99 }, b: { Base: 20 } }) === 1, "countChangedValues: one drifted value ⇒ 1");
ok(D.countChangedValues(pairs, { a: { Base: 1 }, b: { Base: 2 } }) === 2, "countChangedValues: both drifted ⇒ 2");
// a NEW variable/mode (absent from the live read) is NOT a change — nothing to overwrite yet
ok(D.countChangedValues(pairs, {}) === 0, "countChangedValues: nothing live yet (first apply) ⇒ 0, not counted as changed");
ok(D.countChangedValues(pairs, { a: { Base: 10 } }) === 0, "countChangedValues: 'b' absent from live ⇒ not counted");
ok(D.countChangedValues([{ name: "a", mode: "Mobile", value: 5 }], { a: { Base: 5 } }) === 0, "countChangedValues: a mode absent from live ⇒ not counted");
// a floating-point epsilon must not false-positive
ok(D.countChangedValues([{ name: "a", mode: "Base", value: 16.000000001 }], { a: { Base: 16 } }) === 0, "countChangedValues: sub-epsilon float drift ⇒ not counted");
ok(D.countChangedValues([{ name: "a", mode: "Base", value: 16.01 }], { a: { Base: 16 } }) === 1, "countChangedValues: a real float drift ⇒ counted");
// strings compare strictly (Font Primitives family literals)
ok(D.countChangedValues([{ name: "family/inter", mode: "Value", value: "Inter" }], { "family/inter": { Value: "Inter" } }) === 0, "countChangedValues: identical string ⇒ 0");
ok(D.countChangedValues([{ name: "family/inter", mode: "Value", value: "Inter" }], { "family/inter": { Value: "Roboto" } }) === 1, "countChangedValues: drifted string ⇒ 1");
ok(D.countChangedValues(null, { a: { Base: 1 } }) === 0, "countChangedValues: malformed pairs ⇒ 0, never throws");
ok(D.countChangedValues(pairs, null) === 0, "countChangedValues: null live (collection not found) ⇒ 0, never throws");

// ── an end-to-end shape: a real plan diffed against a synthetic 'live' read that drifted one value ──
{
  const bodyMd = plan.variables.find((v) => v.name === "type/body/md/size");
  const liveBase = bodyMd.values.find((v) => v.mode === "Base").value;
  const live = { "type/body/md/size": { Base: liveBase + 3, Mobile: bodyMd.values.find((v) => v.mode === "Mobile").value } };
  const n = D.countChangedValues(D.flattenModePlanValues(plan), live);
  ok(n === 1, `end-to-end: exactly the one hand-tweaked (Base) value counts, got ${n}`);
}

if (fails.length) { console.error(`live-diff FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("live-diff PASS — flattenModePlanValues/flattenPrimitivesPlanValues (alias-dropping) · countChangedValues (present+differs only, float epsilon, string-strict)");
process.exit(0);
