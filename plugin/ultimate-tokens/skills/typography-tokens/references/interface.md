# Interface text — the `ui` voice (and `code`)

Everything you *operate* rather than *read* is the **ui** voice on `--font-ui`: buttons, inputs,
labels, menus, tabs, table cells, badges, tooltips. It carries the widest ramp (**3XS–2XL**, eight
steps) because interface density varies far more than prose does, and — like the other box-text
voices (`code` and `eyebrow`, the `mono`-role voices) — it has a **single-line height**
(`-line-single`, leading 1.0) for text that sits locked in a box.

## Control & component text

| Element | Class | Line |
|---|---|---|
| default button / input value / menu item | `.type-ui-md` | `-line-single` (single-line control) |
| large / prominent button | `.type-ui-lg` | `-line-single` |
| small / dense button, compact control | `.type-ui-sm` | `-line-single` |
| field label | `.type-ui-sm` (or `-xs`) | `-line-single` |
| helper / error text under a field | `.type-ui-xs` | `-line` (may wrap) |
| table cell | `.type-ui-sm` | `-line-single` |
| table column header | `.type-ui-xs` (often with `kicker` for caps labels) | `-line-single` |
| caption / metadata / timestamp | `.type-ui-xs` | `-line` |
| badge / chip / tag | `.type-ui-2xs` or `-xs` | `-line-single` |
| tooltip | `.type-ui-xs` | `-line` |
| the tiniest legal/dense affordance | `.type-ui-3xs` | `-line` |

**Single-line vs multi-line:** a control whose text never wraps (a button, an input value, a cell)
uses `--type-ui-{step}-line-single` so the box height is exact; text that may wrap (helper text, a
multi-line tooltip) uses `--type-ui-{step}-line`. The `.type-ui-*` class ships the multi-line
`-line`; switch to `-line-single` explicitly on single-line controls (or the box grows on wrap).

## Composing with control geometry

Control TEXT is the `ui` voice; the control's BOX (height, padding, radius) is geometry-tokens'
`--size-*`. They compose: a `.control-md` box (geometry) pairs with `.type-ui-md` text, and the
geometry engine already derives each control size's font from the UI voice at the matching step — so
XS control ↔ UI XS, MD ↔ MD, 2XL ↔ 2XL. Match the step across the two systems and the box fits the
text.

## Code in the interface

`code` voice (mono) for keyboard shortcuts (`.type-code-xs`), technical values, tabular figures in a
table (`.type-code-sm` for alignment), inline tokens in settings. Same ramp as `ui`.

## Don't

- Don't use `body` for buttons/labels — interface chrome is `ui` (body's leading and rhythm are
  tuned for reading paragraphs, not fitting a control).
- Don't set control `line-height` by hand — use `-line-single`; that IS the fit.
- Don't invent sizes between steps — the eight-step `ui` ramp is deliberately fine-grained; there's
  a step for it.
