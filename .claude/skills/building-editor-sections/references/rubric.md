# Rubric — editor section

Scores a built or evolved editor section in the `<nonoun-color-tokens>` workbench. `[gate]` = mechanically
checkable (grep / `npm test`); `[review]` = judgment with cited evidence. Score each 1–5.

| # | Dimension | Type | What it checks | 1 (fail) → 3 (adequate) → 5 (excellent) |
|---|---|---|---|---|
| S1 | Routing completeness | [gate] | `renderCenter` + `renderLeftPane` + `renderRightPane` all branch the section; `setSection` adds the tab; `_liveRefreshNow` handles it | 1: a render branch or `setSection` missing (tab dangles / empty pane) · 3: all branch, lifecycle rough · 5: all branch + viewport stash/restore + `fit()` + lazy-init + liveRefresh guarded |
| S2 | Full-dataset center | [review] | The center scene shows the **whole** dataset (every step/size/role), not a curated subset, in a pannable `.canvas-scene` | 1: a subset (modal parity) or not pannable · 3: full but plain · 5: full + a useful header view/mode + brand-real fonts/colors/scheme |
| S3 | Composition visible | [review] | Cross-system links are rendered, not hidden (Geometry `font` ← Type UI; brand colors in Type/Geom) | 1: rendered in placeholder gray/font, link invisible · 3: real fonts/colors · 5: the shared number/source is shown + noted |
| S4 | Analysis purity | [review] | Left cards are read-only pure functions of the engine scale, no inputs; SVG lines set `fill:none` (qualified) | 1: an input in the left rail, or a wedge-fill artifact · 3: pure, fill ok · 5: pure + legible diagnostics that teach the system |
| S5 | Inspector honesty | [gate] | Writable controls bind **only** persisted `doc` fields; derived params shown read-only; no faked control | 1: a control the engine/persist can't round-trip · 3: honest, terse · 5: honest + a clear read-only/out-of-scope note + pinned brand-true example |
| S6 | No dead code (modal retired) | [gate] | Promoting a modal leaves no orphan: `grep` finds no `open/close/_sync/render<X>`, `<x>Open`, dead sample helper, or `dialog.<x>`/stub CSS | 1: orphaned method/state/CSS remains · 3: methods gone, one helper/CSS left · 5: grep-clean; download/export helpers kept |
| S7 | Tests | [gate] | A lettered headless group drives `setSection` + asserts dataset/count + analysis + inspector + toggle + round-trip; smoke leg + screenshot; `npm test` + `npm run smoke` green | 1: no section test or red · 3: green, thin · 5: green + engine/persist/brandKit/composition + a looked-at screenshot |
| S8 | Shell reuse | [review] | Reuses `.an-card`/`.insp-*`/`.tyi-*`/`.seg-*`/`segmented`/`wirePanZoom`; new CSS only for the scene | 1: re-implements shell / parallel grid · 3: mostly reuses · 5: reuses everything but the `.<x>-spec*` scene block |
| S9 | Shim-safe assertions | [gate] | Headless assertions use single-class `querySelector` / `getAttribute` / `txtOf` — no descendant selector, `.id`, or `.textContent` | 1: uses an unsupported selector/property (silent false pass/empty) · 3: safe · 5: safe + scoped precisely |

**Gate to ship:** S1, S5, S6, S7, S9 must each score ≥ 3. A section that dangles a region (S1), fakes a
control (S5), ships dead modal code (S6), has no green section test (S7), or asserts against the shim's
unsupported DOM (S9) is not done regardless of polish.

**Top failure to look for first:** a center that renders only a curated subset (S2 low) — i.e. a modal
moved into a pane rather than a section that earns the canvas (the whole reason to promote it).
