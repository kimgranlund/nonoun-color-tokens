// mode-apply-plan.mjs — the PURE, testable planner for APPLYING a breakpoint-moded variable collection
// into a Figma file. The companion to bind-plan.mjs (which plans the COLOR cascade): where bind-plan
// aliases semantic→raw across Light/Dark, this plans the Type/Geometry token write across the "Base" +
// per-breakpoint MODES that `typeTokensFigmaModes` / `geomTokensFigmaModes` already emit — BOTH into the
// single "Geometry" collection since TKT-0009 (type/ + box-geometry halves), merged into one interchange
// via mergeModeInterchanges below before planning.
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
//     variables:  [{ name, type, values: [{ mode, value }, …] }],  // name-sorted; one value PER mode, in modes order
//     renameFrom?: ["<oldCollectionName>", …],   // TKT-0012: registry keys this collection supersedes —
//                                                //   the executor adopts the tracked collection BY ID,
//                                                //   renames it in place, and re-keys the registry
//     renames?:    { "<oldVarName>": "<newVarName>" },  // TKT-0012: id-preserving variable renames, run
//                                                //   FIRST so reconcile-by-name never prunes a renamed var
//     retire?:     ["<collectionName>", …]       // TKT-0009: registry-tracked collections to remove
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

// mergeModeInterchanges(...interchanges) → ONE interchange whose same-named collections are merged
// (modes: first-writer order + any new names appended; variables: combined, later writer wins a key
// collision). THE reason this exists (TKT-0009): typeTokensFigmaModes + geomTokensFigmaModes both emit
// the "Geometry" collection (type/ + box-geometry halves), and the executor's applyFloatPlans prunes
// variables per-collection against ITS plan — two sequential plans on one collection would each delete
// the other's variables, so the halves MUST merge into one plan before modeApplyPlan.
//
// MISMATCHED MODE LISTS (a configured type breakpoint beside geometry's intrinsic set, or vice versa)
// union — and each half BACK-FILLS the modes it doesn't define with its OWN default-mode (modes[0])
// value: one collection can only carry one mode set, and "this system doesn't vary at that breakpoint"
// honestly means "its base values there" (exactly what the two-collection era showed: the other
// collection simply had no such mode, so consumers resolved its default). Pure and non-validating
// otherwise; values objects are cloned (emitter output is never mutated). Falsy inputs are skipped;
// zero mergeable inputs ⇒ null.
export function mergeModeInterchanges(...interchanges) {
  const collections = {};
  const defOf = new Map(); // merged variable entry → its source half's default mode (for the back-fill)
  let schema = null;
  for (const ix of interchanges) {
    if (!ix || typeof ix !== "object" || !ix.collections || typeof ix.collections !== "object") continue;
    schema = schema || ix.$schema;
    for (const [name, c] of Object.entries(ix.collections)) {
      if (!c || typeof c !== "object") continue;
      const tgt = collections[name] || (collections[name] = { modes: [], variables: {} });
      const modes = Array.isArray(c.modes) ? c.modes : [];
      for (const m of modes) if (!tgt.modes.includes(m)) tgt.modes.push(m);
      for (const [k, v] of Object.entries(c.variables || {})) {
        const entry = { ...v, ...(v && v.values ? { values: { ...v.values } } : {}) };
        tgt.variables[k] = entry;
        defOf.set(entry, modes[0]);
      }
    }
  }
  if (!Object.keys(collections).length) return null;
  for (const c of Object.values(collections)) {
    for (const v of Object.values(c.variables)) {
      if (!v.values) continue;
      const dv = v.values[defOf.get(v)];
      if (dv === undefined) continue;
      for (const m of c.modes) if (!(m in v.values)) v.values[m] = dv;
    }
  }
  return { ...(schema ? { $schema: schema } : {}), collections };
}

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

// applyRenameMigrations(plans, migrations) — stamp the TKT-0012 rename fields onto apply plans, PURE.
// `migrations.collections` is keyed by the CURRENT (post-migration) collection name:
//   { "<collection>": { renameFrom?: ["<old collection name>", …], vars?: { "<old>": "<new>" } } }
// Only plans whose collection matches get stamped; unknown keys are ignored (a migration for a
// collection this apply doesn't carry is a no-op, never an error). Returns the SAME array for
// chaining; entries are shallow-copied before stamping so cached planner output is never mutated.
// THE POINT (collections-arch review, CRITICAL-1): every executor reconciles by name — without a
// rename-first pass, any rename is a prune+recreate that orphans every consumer binding. This is
// the one sanctioned channel for renames; every renaming ticket ships its map here.
export function applyRenameMigrations(plans, migrations) {
  const cols = migrations && typeof migrations === "object" && migrations.collections;
  if (!cols || !Array.isArray(plans)) return plans;
  return plans.map((plan) => {
    const m = plan && cols[plan.collection];
    if (!m) return plan;
    const out = { ...plan };
    if (Array.isArray(m.renameFrom) && m.renameFrom.length) out.renameFrom = m.renameFrom.slice();
    if (m.vars && typeof m.vars === "object" && Object.keys(m.vars).length) out.renames = { ...m.vars };
    return out;
  });
}

// retirementsFor(plans, migrations) — stamp registry-tracked collection RETIREMENTS onto apply plans,
// PURE (TKT-0018: lifted out of the UI's `_figmaFloatPlans`, which used to inline this as a post-hoc
// mutation with no unit coverage of its own). `migrations.retire` is a list of declarative rules:
//   [{ collection: "<target plan's collection>", ifVariablePrefix: "<prefix>", retire: ["<name>", …] }]
// A rule fires only once its target collection's plan carries at least one variable whose name starts
// with `ifVariablePrefix` — e.g. TKT-0009's rule: the merged "Breakpoints" collection supersedes the old
// two-collection era's "Typography" only once it actually lands type/ variables (retiring it before the
// merge is stable would drop a user's Typography collection while the apply itself could still fail).
// Retirement here is REGISTRY-TRACKED-ONLY (code.js's applyFloatPlans matches `retire` names against ITS
// own provenance registry, never a live file's collection by name) — a user's own same-named collection
// is never touched. Returns the SAME array when no rule fires (chaining, e.g. after applyRenameMigrations);
// entries a rule matches are shallow-copied first, so cached planner output is never mutated.
export function retirementsFor(plans, migrations) {
  const rules = migrations && typeof migrations === "object" && Array.isArray(migrations.retire) ? migrations.retire : [];
  if (!rules.length || !Array.isArray(plans)) return plans;
  let changed = false;
  const out = plans.map((plan) => {
    if (!plan || !Array.isArray(plan.variables)) return plan;
    const names = rules
      .filter((r) => r && r.collection === plan.collection && typeof r.ifVariablePrefix === "string" && Array.isArray(r.retire) && r.retire.length)
      .filter((r) => plan.variables.some((v) => typeof v.name === "string" && v.name.startsWith(r.ifVariablePrefix)))
      .flatMap((r) => r.retire);
    if (!names.length) return plan;
    changed = true;
    const existing = Array.isArray(plan.retire) ? plan.retire : [];
    return { ...plan, retire: [...new Set([...existing, ...names])] };
  });
  return changed ? out : plans;
}
