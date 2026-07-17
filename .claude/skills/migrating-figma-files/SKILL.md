---
name: migrating-figma-files
description: >
  Migrate a LIVE Figma file's variables, styles, and bindings through the Figma MCP (`use_figma`)
  — a rename, a breakpoint/mode add, a collection merge, a bulk grammar-wide rename wave, or a
  recovery of bindings a normal apply pass can't reach. Use whenever a change to the token engine
  or a ratified rename must be carried into an already-applied real file (e.g. BZZR Tokens)
  without breaking existing bindings, or someone says "migrate the Figma file", "rename this
  variable/collection in Figma without breaking bindings", "add a breakpoint/mode to Figma", "some
  text isn't picking up the new binding", "sweep for consumers before deleting this
  collection/style/variable", "merge these two Figma collections". NOT for the PLUGIN CODE shipped
  to every user — code.js/manifest, apply/prune/rebuild (maintaining-figma-plugins) — this skill is
  hands-on-the-live-file work: driving that same capability by hand, or reaching bindings the
  apply loop can't (segment-level text runs, a file-only mode).
disable-model-invocation: false
user-invocable: true
---

# Migrating a live Figma file (MCP)

A **migration** here is a script run through `use_figma` against an already-applied, real Figma
file — not a change to the plugin code that ships to every user (that's
[[maintaining-figma-plugins]]) and not a fresh apply from scratch. The file already has bindings
— node fills, text-style properties, layer positions — riding the IDs of today's variables and
styles. The whole discipline below exists because Figma's apply loops reconcile by **name**
(create-or-reuse, prune the rest — `maintaining-figma-plugins` `references/foundations.md` §5),
but every *binding* in the file points at an **id**. A migration's job is to move the graph to its
new shape while keeping those ids alive wherever possible, and to prove — inside the same script,
not by trusting a setter's return value — that every binding still resolves.

**Prerequisite, no exceptions:** load `figma-use` (or its `skill://figma/figma-use/SKILL.md`
fallback) before every `use_figma` call in a migration. Skipping it is a documented cause of
hard-to-debug tool failures, independent of anything below.

**Prerequisite, no exceptions (constraints):** read
[`figma-styles-hard-constraints.md`](../maintaining-figma-plugins/references/figma-styles-hard-constraints.md)
before touching styles or metric fields. This skill CITES that catalog rather than restating it —
scenarios below name the constraint number they ride, they don't re-derive it.

## The six scenarios

Each is a real, load-bearing procedure proven live against BZZR Tokens (findings in
`docs/tickets/tkt-0009.md`, `tkt-0010.md`, `tkt-0012.md`, `tkt-0013.md`). Full steps + traps in
[`references/scenario-playbook.md`](references/scenario-playbook.md); this table is the index.

| # | Scenario | One-line rule | Trap if skipped |
|---|---|---|---|
| 1 | Id-preserving rename-in-place | `variable.name = newName` mutates in place and keeps the id — never delete-and-recreate a renamed variable/collection/style | Silent partial coverage: an incomplete rename map leaves stragglers with NO error (TKT-0013's `SCRIM_STEPS_FROZEN` bug — 32 stale scrim color variables, 4 missed steps × 8 palettes) |
| 2 | Full-payload mode/breakpoint add | `addMode()` only mints the column; EVERY variable needs an explicit `setValueForMode` or it silently reads as a copy of the default | A column that looks populated but is actually the default mode's values, undetected until someone switches to it (hard-constraints §7) |
| 3 | Segment-level binding recovery | Mixed-styled text nodes bind per-segment; `node.setBoundVariable` no-ops silently on them | The migration reports success while the specimen text keeps its old binding (hard-constraints §6) |
| 4 | Zero-consumer sweep before deletion | Re-enumerate every node/style for a live reference to the target, in the SAME session, immediately before delete | A sweep run before an intervening rename/rebind step is stale — it can green-light a delete that orphans a binding created since |
| 5 | Same-call readback verification | Re-read what you just wrote, in the same script, before reporting done | A setter's success return proves nothing — Figma's API can no-op without erroring (constraints §6, §7) |
| 6 | Collection merge with alias/style re-pointing | Copy values cell-for-cell into the destination, re-point every consumer, THEN retire the source | Deleting the source before every style/node consumer is re-pointed orphans whatever wasn't re-scanned |

## The migration loop (order matters)

1. **Freeze the map first.** Every rename a migration performs belongs in
   `figma/binder/migrations.mjs` (`FIGMA_MIGRATIONS`) in the SAME engine change, per the
   `shipping-changes` convention ("every renaming ticket ships its map", TKT-0012). A live-file
   script should be *driving that frozen map*, not inventing ad hoc names — the map is what makes
   the next engine-side apply-loop run agree with what the live file now looks like.
2. **Rename-first, always** (scenario 1) — before any create/delete/reconcile step. Renaming after
   a prune has already run is too late; the old-named thing is already gone.
3. **Populate every mode column in full** (scenario 2) if the migration adds or restructures modes.
4. **Recover segment-level and other node-level-invisible bindings** (scenario 3) before touching
   the nodes' owning styles — a style rebind can mask a node whose segments never got the new var.
5. **Sweep for zero consumers** (scenario 4) immediately before any delete/retire step — never
   reuse an earlier sweep's result.
6. **Read back in the same call** (scenario 5) at the end of every step above, not just at the end
   of the whole migration — catching a no-op three steps late means re-deriving what state the
   intervening steps left.
7. **Merge collections last**, once their contents are individually correct (scenario 6) — a merge
   inherits scenario 1–5's discipline for everything it moves.
8. **Record the finding.** A migration that found a new trap (an incomplete map, a field that
   behaves like paragraphSpacing's inverse) is worth exactly as much as the ticket Finding that
   captures it for the next migration — write it, don't let it live only in the executed script.

## Validate (a migration is not done until)

- Every rename map used is frozen in `figma/binder/migrations.mjs`, not invented inline in the MCP
  script (unless the migration is intentionally file-specific and will never recur — say so).
- A same-call readback shows: the expected id survived every rename (no orphaned binding), every
  mode column has zero unset variables, every segment-level and node-level binding resolves to the
  NEW target, and the zero-consumer sweep for anything deleted ran in the same session as the
  delete.
- The values themselves are verified against the ratified source (cell-for-cell for a bulk value
  change, formula-for-formula for a recalculated one) — not just "the write didn't throw."
- `npm test` (+ `npm run build` if the engine's emitters changed) still green — a migration mirrors
  an engine change; it doesn't replace testing that change.
- See [`references/rubric.md`](references/rubric.md) for the scored version of this checklist.

## If a step fails mid-migration

- **A readback tally comes back non-zero** (a rename miss, an `unset` mode value, a segment that
  didn't take): stop advancing to the next scenario in the loop — a later step (a sweep, a merge)
  reasoning over a still-wrong graph produces a false-clean result. Fix the failing step in place,
  re-run its own readback until it tallies zero, THEN continue.
- **The MCP session drops or disconnects mid-wave** (it happened during TKT-0013's BZZR leg): treat
  whatever the last GREEN readback tally proved as the true state, not whatever the script intended
  to have finished — re-open the session and re-run scenario 5's readback for every step before
  resuming, since a partial write with no readback is indistinguishable from no write at all.
- Either way, record the finding (what failed, what the partial-state readback showed) per step 8
  of the loop above — a rediscovered version of a trap already in `scenario-playbook.md` is a
  routing miss, not a new trap; a genuinely new one earns its own entry there.

## References

| Path | Use when |
|---|---|
| `references/scenario-playbook.md` | executing any of the six scenarios — the full steps + trap detail this file only indexes |
| `references/rubric.md` | scoring a migration before calling it done |
| `../maintaining-figma-plugins/references/figma-styles-hard-constraints.md` | before touching styles or metric-field bindings — the underlying API constraints this playbook cites (fontStyle/fontWeight XOR, NUMBER-only metric fields, path-prefix folder-ization, no variable-font axis metadata, name/weight matching, segment-level bindings, full-payload mode adds) |
| `../maintaining-figma-plugins/SKILL.md` | changing the PLUGIN CODE (code.js/manifest) that performs an apply for every user, as opposed to a one-off live-file migration |
| `docs/tickets/tkt-0009.md`, `tkt-0010.md`, `tkt-0012.md`, `tkt-0013.md` | the worked narratives these scenarios were extracted from — read for the full BZZR numbers (270/362/1,197 variables, 141 styles, 464 bindings) |

Peers: [[maintaining-figma-plugins]] (the plugin code these migrations carry a rename INTO) ·
[[adding-semantic-roles]] (a role-table change that also needs a rename map) ·
[[shipping-changes]] (the "every rename ships its map" convention this skill's step 1 rides).
