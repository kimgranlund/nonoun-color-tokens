# Interface text — the `UI-control` + `UI-widget` voices (and `label`, `kicker`, the monos)

Everything you *operate* is one of the two INTERACTIVE voices (TKT-0008, 2026-07-16): **UI-control**
(buttons, inputs, selects, menu items — control-box text) and **UI-widget** (tags, badges, switches,
checks — compact widget text), both on `--font-ui`, both 3-step sm/md/lg ramps, both with a
**single-line height** (`-line-single`, leading 1.0) for text locked in a box. **Label** is the
STATIC label voice now — field labels, table cells, captions-adjacent chrome — prose flow (it may
wrap; it has `-line` only, no `-line-single` since 2026-07-16).

## Control & component text

| Element | Class | Line |
|---|---|---|
| default button / input value / menu item | `.type-ui-control-md` | `-line-single` (single-line control) |
| large / prominent button | `.type-ui-control-lg` | `-line-single` |
| small / dense button, compact control | `.type-ui-control-sm` | `-line-single` |
| badge / chip / tag / switch label | `.type-ui-widget-md` (dense: `-sm`) | `-line-single` |
| field label, table cell, column header | `.type-label-sm` / `-md` | `-line` (static text — may wrap) |
| helper / error text under a field | `.type-label-sm` | `-line` |
| caption / metadata / timestamp | `.type-tiny-md` | `-line` (prose — `tiny` rides `ui`'s font but wraps) |
| tooltip | `.type-label-sm` | `-line` |

**Single-line vs multi-line:** interactive text that never wraps (a button, an input value, a badge)
uses `--type-ui-control-{step}-line-single` / `--type-ui-widget-{step}-line-single` so the box height
is exact; anything that may wrap (labels, helper text, tooltips) is `label`/`tiny` with `-line`. The
`.type-ui-control-*` classes ship the multi-line `-line`; switch to `-line-single` explicitly on
single-line controls (or the box grows on wrap).

## Composing with control geometry

Control TEXT is the `UI-control` voice; the control's BOX (height, padding, radius) is
geometry-tokens' `--size-*`. They compose: a `.control-md` box (geometry) pairs with
`.type-ui-control-md` text, and the geometry engine derives each control size's font from the
UI-control voice at the matching step — SM ↔ SM, MD ↔ MD, LG ↔ LG. Geometry's other steps (XS, and
the expressive band XL/2XL) have no voice counterpart (every voice is sm/md/lg-only) and ride the
engine's own ratified control-text rows instead — match the step across the two systems where both
exist and the box fits the text.

## Monospace in the interface

`body-mono` (pegged to `body`'s own sizes) for keyboard shortcuts (`.type-body-mono-sm`), technical
values, tabular figures in a table (`.type-body-mono-md` for alignment), inline tokens in settings.
`label-mono` (pegged to `label`'s own sizes) is the same idea at label scale — an ID, a version tag,
a status readout (`.type-label-mono-sm`) where `label` itself would be the right size but the wrong
(proportional) face. Both are prose-flow now (2026-07-16) — `-line` only; single-line box text is
the UI voices' job.

## Don't

- Don't use `body` for buttons — interactive chrome is `UI-control`/`UI-widget` (body's leading and
  rhythm are tuned for reading paragraphs, not fitting a control).
- Don't use `label` for a button or badge — `label` is static text since 2026-07-16; it has no
  `-line-single` and its rhythm is prose.
- Don't set control `line-height` by hand — use `-line-single`; that IS the fit.
- Don't invent sizes between steps — every voice is a fixed sm/md/lg ramp; there's a step for it.
