---
name: geometry-tokens
description: >
  Use when sizing or spacing any UI in a project that carries an Ultimate Tokens export — the
  height/padding/radius of a control, the inset of a card, the gap between elements, the icon size, a
  focus ring, a border ("what size/spacing token for this", "how tall should this control be", "what
  padding/gap/radius", "space these out", "why is this the wrong size", "make the layout denser").
  The consumption guide for the dimensional system: how to find and bind the exported `--size-*` /
  `--space-*` / `--inset-*` / `--gap-*` / `--radius-*` / `--border-*` / `--focus-*` variables, the
  control-geometry centering law, and the container tier. Never hardcode a px height/padding/radius —
  this names the semantic dimension token for every job. Scope is SIZE & SPACE only (colour is
  color-tokens; font/size/weight is typography-tokens).
---

# Using Ultimate Tokens geometry roles

An Ultimate Tokens export gives a **dimensional system** as CSS custom properties, in two tiers:
**control geometry** (`--size-*` — everything inside one control, derived from its height by a
centering law) and **container geometry** (`--inset-* / --gap-* / --space-*` — the spacing between
and around components). Your job is never to type a px value — it's to pick the semantic dimension.

## Bind to the project first (always step 1)

1. **Find the export.** A CSS file defining `--size-*`, `--space-*`, `--radius-*` variables (often
   `geometry.css` / `tokens.css`; a DTCG `*.tokens.json` and `.control-*` utility classes may sit
   beside it). This guide is for the `--*` CSS export; the Figma number variables carry the same
   values. If none exists, stop and ask — do not hardcode dimensions.
2. **Know the two tiers.** *Control* geometry is per-size (`--size-{step}-*`, steps XS–2XL) and
   scales with the control height. *Container* geometry (`--inset-*`, `--gap-*`, and the raw
   `--space-*` ladder) is treatment-derived and mode-independent. Don't cross them — a control's
   inner padding is `--size-{step}-pad`, a card's inner padding is `--inset-card`.
3. **Know the grammar.** Control: `--size-{step}-{field}` where field ∈
   `height · icon · caret · font · gap · pad · pad-edge · radius · min`. Ladders: `--radius-{none|xs|
   sm|md|lg|xl|full}` (the **Material 3 shape-corner scale** — 0/4/8/12/16/28/pill — plus
   `--radius-default`, aliased to the treatment's favoured corner), `--space-{0…9}`. Container tier:
   `--inset-{control-group|card|panel|dialog|page}`,
   `--gap-{cluster|stack-tight|stack|stack-loose|grid|section}`, `--border-{thin|thick}`,
   `--focus-{ring-width|ring-offset}`. The `.control-{step}` class wires a control's box in one.

## The laws (violating any of these is a defect)

1. **Tokens, not px.** If a height, padding, radius, gap, or border isn't a `--size-*`/`--space-*`/
   `--inset-*`/`--gap-*`/`--radius-*`/`--border-*`/`--focus-*` var (or a `.control-*` class), it
   doesn't belong in UI code.
2. **A control is one size step; everything inside derives from it.** Pick the control's step
   (XS–2XL); its height, icon, font, and paddings all come from `--size-{step}-*` — the centering law
   guarantees the glyph sits optically centered. Don't set a control's padding independently of its
   height (that breaks the centering); use the paired `--size-{step}-pad` / `-pad-edge`. See
   [`references/controls.md`](references/controls.md).
3. **Two paddings, by anatomy.** `--size-{step}-pad` is the SLOT edge (a control WITH a leading
   icon); `--size-{step}-pad-edge` is the SLOTLESS edge (a bare text button/label). Use the one that
   matches the control's anatomy — mixing them mis-centers the content.
4. **Container spacing is the container tier, not raw `--space-N`.** Reach for a semantic
   `--inset-*` / `--gap-*` first (they ARE named `--space-*` rungs, so you get the rhythm without
   guessing a number). Drop to a raw `--space-{0…9}` only for a one-off the tier doesn't name. See
   [`references/containers.md`](references/containers.md).
5. **Radius: the M3 corner scale for containers, the height-linked corner for controls.** Containers
   pick a level off the Material-3 scale `--radius-{xs|sm|md|lg|xl}` (or `--radius-default`, which
   the treatment sets); a control's own corner is `--size-{step}-radius` (= height/2 — already a
   full pill, so a "rounded" control needs nothing extra). `--radius-full` (9999) is for round
   NON-control elements — avatars, standalone pills, dots. Don't put a fixed `--radius-*` on a
   control that should scale with its height.
6. **Focus ring is one recipe.** `outline-width: var(--focus-ring-width)` +
   `outline-offset: var(--focus-ring-offset)` on every focusable element (the COLOR is color-tokens'
   accent). Borders are `--border-thin` / `--border-thick` — never a hardcoded `1px`.
7. **Responsive is per-breakpoint modes.** If the kit exports modes, `--size-*` is re-declared in
   `@media (min-width: …)` blocks and `.control-*` restyles automatically. Container-tier vars and
   radii are mode-independent (they auto-track). Don't hand-write size `@media` overrides. See
   [`references/responsive.md`](references/responsive.md).

## Surface map — where to look things up

| Sizing… | Reference |
|---|---|
| Buttons, inputs, selects, toggles, chips — heights, the icon/caret/padding derivation, control radius | [`references/controls.md`](references/controls.md) |
| Cards, panels, dialogs, page layout — insets, the gap scale, section rhythm, dividers/borders, elevation spacing | [`references/containers.md`](references/containers.md) |
| Icon sizes, the min-width/hit-target floor, focus rings, the density knob | [`references/detail.md`](references/detail.md) |
| Breakpoint modes, the responsive ramp (`rampContrast`), what scales vs what's fixed | [`references/responsive.md`](references/responsive.md) |

## Verify before you ship

- Every dimension in the diff is a `--size-*`/`--space-*`/`--inset-*`/`--gap-*`/`--radius-*`/
  `--border-*`/`--focus-*` var or a `.control-*` class — grep the diff for `px`/`rem`/`em` literals
  on height, padding, margin, gap, border, border-radius, outline in UI code (should be var-backed).
- A control's inner spacing uses the paired `--size-{step}-*` (not an independent padding).
- Container spacing uses the `--inset-*`/`--gap-*` tier before any raw `--space-N`.
- Skill maintainers: `node scripts/dimension-parity.mjs` gates every dimension token named here
  against the engine (runs in the product repo's `npm test`; no-ops outside it).
