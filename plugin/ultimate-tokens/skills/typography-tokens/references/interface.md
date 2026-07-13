# Interface text — the `label` voice (and `code`, `kicker`)

Everything you *operate* rather than *read* is the **label** voice on `--font-ui`: buttons, inputs,
labels, menus, tabs, table cells, badges, tooltips. It's a 3-step ramp (**sm/md/lg**) — like the other
box-text voices (`code` and `kicker`, the `mono`-role voices, pegged to the same sizes as `body` and
`label` respectively) — it has a **single-line height** (`-line-single`, leading 1.0) for text that
sits locked in a box.

## Control & component text

| Element | Class | Line |
|---|---|---|
| default button / input value / menu item | `.type-label-md` | `-line-single` (single-line control) |
| large / prominent button | `.type-label-lg` | `-line-single` |
| small / dense button, compact control, field label | `.type-label-sm` | `-line-single` |
| helper / error text under a field | `.type-label-sm` | `-line` (may wrap) |
| table cell | `.type-label-sm` | `-line-single` |
| table column header | `.type-label-sm` (often with `sub-heading` for caps labels) | `-line-single` |
| caption / metadata / timestamp | `.type-tiny-md` | `-line` (prose — `tiny` rides `ui`'s font but wraps) |
| badge / chip / tag | `.type-label-sm` | `-line-single` |
| tooltip | `.type-label-sm` | `-line` |

**Single-line vs multi-line:** a control whose text never wraps (a button, an input value, a cell)
uses `--type-label-{step}-line-single` so the box height is exact; text that may wrap (helper text, a
multi-line tooltip) uses `--type-label-{step}-line`. The `.type-label-*` class ships the multi-line
`-line`; switch to `-line-single` explicitly on single-line controls (or the box grows on wrap).

## Composing with control geometry

Control TEXT is the `label` voice; the control's BOX (height, padding, radius) is geometry-tokens'
`--size-*`. They compose: a `.control-md` box (geometry) pairs with `.type-label-md` text, and the
geometry engine derives each control size's font from the Label voice at the matching step — SM ↔
SM, MD ↔ MD, LG ↔ LG. Geometry's other steps (XS, and the expressive band XL/2XL) have no Label
counterpart (Label is SM/MD/LG-only) and fall back to geometry's own standalone size law instead —
match the step across the two systems where both exist and the box fits the text.

## Code in the interface

`code` voice (mono, pegged to `body`'s own sizes) for keyboard shortcuts (`.type-code-sm`), technical
values, tabular figures in a table (`.type-code-md` for alignment), inline tokens in settings.

## Don't

- Don't use `body` for buttons/labels — interface chrome is `label` (body's leading and rhythm are
  tuned for reading paragraphs, not fitting a control).
- Don't set control `line-height` by hand — use `-line-single`; that IS the fit.
- Don't invent sizes between steps — every voice is a fixed sm/md/lg ramp now; there's a step for it.
