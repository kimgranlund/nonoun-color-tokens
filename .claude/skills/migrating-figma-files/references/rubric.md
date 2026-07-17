## Rubric — a live Figma-file migration

Scores one migration run through the Figma MCP against a real file. `[gate]` = a same-call
assertion the script itself should have made and reported (a mechanical check, even without a
named test file); `[review]` = judgment against the scenario playbook. Score each 1–5.

| # | Dimension | Type | What it checks | 1 (fail) → 3 (adequate) → 5 (excellent) |
|---|---|---|---|---|
| M1 | Rename coverage | [gate] | Every rename ran via `.name =` in place (never delete+recreate); the map's claimed old-name domain was diffed against the live file's actual pre-migration names, both directions empty | 1: any delete+recreate rename, or no domain diff run · 3: in-place renames, domain diff run and clean · 5: + the map is frozen in `figma/binder/migrations.mjs`, not inline in the script |
| M2 | Mode-payload completeness | [gate] | (if a mode/breakpoint was added or restructured) `unset === 0` asserted both directions (payload keys vs. full collection variable list) | 1: `addMode` called with no full-payload assertion · 3: payload built from the full variable list, `unset===0` checked · 5: + mode-independent constants explicitly written, not assumed inherited |
| M3 | Segment/node binding integrity | [gate] | Every touched text node's `getStyledTextSegments` was checked before using node-level `setBoundVariable`; segmented fields went through `setRangeBoundVariable`; `paragraphSpacing` was NEVER passed to a range setter | 1: node-level rebind applied blindly to segmented text (silent no-op) or `paragraphSpacing` thrown on · 3: segments checked, both layers handled · 5: + a post-recovery re-scan proves every segment resolved to the new target |
| M4 | Zero-consumer sweep freshness | [review] | Any delete/retire was preceded by a sweep run in the SAME session, after all rename/rebind steps — not a sweep from earlier in the investigation | 1: delete based on a stale or earlier sweep · 3: fresh sweep immediately before delete · 5: + a registry-tracked retire used instead of a blind delete where the executor supports it |
| M5 | Same-call readback | [gate] | Every write batch was followed by a re-read of the SAME objects (by id) in the same script, with an explicit pass/fail tally (counts, not "it didn't throw") | 1: success inferred from setter return values alone · 3: readback present, tally reported · 5: + values verified cell-for-cell (or formula-for-formula) against the ratified source, not just presence |
| M6 | Mode-mismatch resolution (merges only) | [review] | A collection merge with differing mode sets explicitly unioned + back-filled, rather than silently dropping a mode's values | 1: a merge silently drops or misaligns a mode · 3: mismatch identified and back-filled · 5: + the back-fill rule itself is stated in the migration's finding for reuse |
| M7 | Finding capture | [review] | A newly-discovered trap (an incomplete map, a field with inverse binding behavior) is written into a ticket Finding or the frozen map's own comments, not left implicit in the executed script | 1: no record, the trap will be rediscovered next time · 3: recorded in a Finding · 5: + a gate added (like `test/figma/migrations.mjs`) so the SAME map can't drift silently again |

**Gate to ship:** M1, M2, M3, M5 must each score ≥ 3. These four are the ones that pass a "the
script ran without error" check while leaving the live file WRONG — a rename with silent
coverage gaps, a mode column nobody populated, a segmented text binding that never moved, or a
report that never actually re-read what it wrote. M4/M6/M7 are judgment calls but should not be
skipped for anything destructive (a delete/retire) or anything spanning two collections (a merge).

**Top failure to look for first:** any of M1/M2/M3/M5 substituting "the call didn't throw" for
"I verified the new state." Figma's variable/binding API is unusually forgiving about no-ops —
several of the traps in `scenario-playbook.md` are exactly this shape (constraints §6/§7 in
`figma-styles-hard-constraints.md`). A migration script that reports success without a same-call
readback has not actually proven anything.
