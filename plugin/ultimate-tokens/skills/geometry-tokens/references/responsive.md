# Responsive geometry — modes, the ramp, what scales

## Breakpoint modes (not media-query hand-tuning)

If the kit was exported with breakpoint modes, `--size-*` is **re-declared inside `@media (min-width:
…)` blocks** — read the actual breakpoints from the `@media` blocks in the export (the kit chooses
its own set; a common default is a mobile-first ladder of five widths). A `.control-{step}` class reads the
variables, so the same control restyles automatically at each breakpoint. Don't hand-write size
`@media` overrides — you'd fight the exported blocks.

**Mode-independent (declared once, auto-track):** the radius ladder (`--radius-*`), the space ladder
(`--space-*`), the container tier (`--inset-*`, `--gap-*`), borders, and the focus ring. Only the
per-size `--size-*` scale with breakpoint. So a card's `--inset-card` is constant across breakpoints
while a control's `--size-md-height` may change — by design (spacing rhythm is stable; control
density adapts).

## The responsive ramp (`rampContrast`)

The kit's control ramp can compress toward small screens: the expressive band (LG·XL·2XL) has a
contrast knob — full at desktop (a wide ramp) and compressed on mobile (the gear change flattens so
large controls shrink toward the small ones). You don't set this — it's baked into each breakpoint's
`--size-*` values by the export. The consequence for you: **don't assume a control's height is
constant across breakpoints** — read the token, which already carries the per-breakpoint value. At
small widths the gap between adjacent steps NARROWS (the expressive band goes from geometric toward a
~4px linear step) — steps stay distinct and strictly increasing, they just sit closer together. Two
steps never collapse to the same height, so a genuine "these two are equal" IS a bug, not the
compression.

## What to reason about

- Base (≤476) is the mobile ramp; larger breakpoints step control heights up.
- If the export has no `@media` blocks, the kit shipped Base-only — geometry is fixed, a valid
  choice.
- Never author fluid `clamp()`/`vw` sizing for controls or spacing — the modes are the mechanism and
  they land on the kit's exact quantized values (no fractional px, so no sub-pixel control edges).

## Composition with type across breakpoints

A control's box (`--size-*`) and its text (typography-tokens' `--type-ui-*`) both re-declare per
breakpoint, and the geometry engine composes the control font FROM the UI type voice at the matching
step. So if you matched the step across the two systems (control `md` ↔ `.type-ui-md`), the box and
its text stay paired at every breakpoint automatically — you don't re-pair them per media query.
