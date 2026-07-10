// mode-apply-plan.mjs — the PURE, testable planner for APPLYING a breakpoint-moded variable collection
// (Typography / Geometry) into a Figma file. The companion to bind-plan.mjs (which plans the COLOR cascade):
// where bind-plan aliases semantic→raw across Light/Dark, this plans the Type/Geometry token write across
// the "Base" + per-breakpoint MODES that `typeTokensFigmaModes` / `geomTokensFigmaModes` already emit.
//
// INPUT — the UI3 float interchange those producers return:
//   { collections: { "<Name>": { modes: ["Base", <bp>…], variables: { "<key>": { type, values: { <mode>: n } } } } } }
//
// OUTPUT — modeApplyPlan(interchange) → one entry per collection, a DETERMINISTIC, ordered description of the
// Figma operations the plugin will run (no `figma` calls here — that lives in code.js, which MIRRORS this and
// is parity-gated, exactly as figma-semantic-binder/code.js mirrors bind-plan.mjs):
//   [{
//     collection: "<Name>",
//     modes:      ["Base", <bp>…],     // every mode, in order
//     defaultMode:"Base",              // the collection's first mode == Figma's default mode (renamed to this)
//     addModes:   [<bp>…],             // the rest, created with collection.addMode(name)
//     variables:  [{ name, type, values: [{ mode, value }, …] }]   // name-sorted; one value PER mode, in modes order
//   }]
//
// The code.js apply-path (paired-session work) mirrors this verbatim:
//   coll = createVariableCollection(collection); coll.renameMode(coll.modes[0].modeId, defaultMode);
//   const modeId = { [defaultMode]: coll.modes[0].modeId, ...addModes.map(n => coll.addMode(n)) };
//   for (v of variables) { vr = createVariable(v.name, coll, v.type);
//                          for ({mode,value} of v.values) vr.setValueForMode(modeId[mode], value); }
// Because the plan is value-COMPLETE (validateModeInterchange guarantees every variable has a value for every
// mode), the apply never leaves a mode unset — the failure that makes a Figma import look half-bound.

const FIGMA_VAR_TYPES = new Set(["FLOAT", "STRING", "BOOLEAN", "COLOR"]);

// modeApplyPlan(interchange) → the ordered per-collection apply plan (see header). Pure; deterministic
// (variables name-sorted, values in `modes` order). Does NOT validate — call validateModeInterchange first.
export function modeApplyPlan(interchange) {
  const collections = (interchange && typeof interchange === "object" && interchange.collections) || {};
  return Object.keys(collections).map((name) => {
    const c = collections[name] || {};
    const modes = Array.isArray(c.modes) ? c.modes.slice() : [];
    const vars = c.variables && typeof c.variables === "object" ? c.variables : {};
    const variables = Object.keys(vars)
      .sort()
      .map((varName) => {
        const v = vars[varName] || {};
        const values = v.values && typeof v.values === "object" ? v.values : {};
        return {
          name: varName,
          type: v.type,
          values: modes.map((m) => ({ mode: m, value: values[m] })),
        };
      });
    return { collection: name, modes, defaultMode: modes[0], addModes: modes.slice(1), variables };
  });
}

// validateModeInterchange(interchange) → string[] of problems ([] when sound). The invariants the Figma
// apply-path depends on — a malformed interchange is caught HERE (pure, tested) rather than half-applied to a
// user's file. Checks: ≥1 collection; modes is a non-empty list of DISTINCT, non-empty names
// (case-insensitive; Figma rejects duplicates) whose FIRST entry becomes the collection's default mode —
// any name, not just "Base": the emitters may name the base layer (e.g. "Mobile") and order it last, making
// a breakpoint (e.g. "Desktop") the default; every variable has a known type, a value for EVERY mode, and
// FLOAT values that are finite numbers.
export function validateModeInterchange(interchange) {
  const out = [];
  const collections = interchange && typeof interchange === "object" ? interchange.collections : null;
  if (!collections || typeof collections !== "object" || Object.keys(collections).length === 0) {
    return ["interchange has no collections"];
  }
  for (const name of Object.keys(collections)) {
    const c = collections[name] || {};
    const modes = Array.isArray(c.modes) ? c.modes : [];
    if (modes.length === 0) { out.push(`${name}: no modes`); continue; }
    if (!String(modes[0] ?? "").trim()) out.push(`${name}: first mode (the default) must be a non-empty name`);
    const seen = new Set();
    for (const m of modes) {
      const key = String(m).toLowerCase();
      if (seen.has(key)) out.push(`${name}: duplicate mode name "${m}" (Figma requires distinct modes)`);
      seen.add(key);
    }
    const vars = c.variables && typeof c.variables === "object" ? c.variables : {};
    if (Object.keys(vars).length === 0) out.push(`${name}: no variables`);
    for (const varName of Object.keys(vars)) {
      const v = vars[varName] || {};
      if (!FIGMA_VAR_TYPES.has(v.type)) out.push(`${name}/${varName}: unknown variable type "${v.type}"`);
      const values = v.values && typeof v.values === "object" ? v.values : {};
      for (const m of modes) {
        if (!(m in values)) { out.push(`${name}/${varName}: missing value for mode "${m}"`); continue; }
        if (v.type === "FLOAT" && !Number.isFinite(Number(values[m]))) out.push(`${name}/${varName}: non-finite FLOAT for mode "${m}" (${values[m]})`);
      }
    }
  }
  return out;
}
