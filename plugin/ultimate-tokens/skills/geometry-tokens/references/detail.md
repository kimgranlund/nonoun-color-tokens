# Icons, hit targets, focus rings, density

## Icon sizes

An icon INSIDE a control uses that control's `--size-{step}-icon` (controls.md) — never an
independent size, or it won't center. A standalone/decorative icon picks the `--size-{step}-icon` of
the step whose scale it visually matches (an icon beside `md` text → `--size-md-icon`). Icon color is
color-tokens (icons inherit their text partner's role).

## Hit targets & minimum size

`--size-{step}-min` is the 1:1 floor — an icon-only control is at least square (height × height). For
touch surfaces, choose a step whose height clears the platform hit-target floor (≈44px): `xl`/`2xl`
heights are the touch-first steps; don't shrink an interactive control below `sm` on touch. The token
gives you the square; the STEP choice gives you the target size.

## Focus rings (every focusable element)

One recipe app-wide: `outline: var(--focus-ring-width) solid <accent>; outline-offset:
var(--focus-ring-offset);` — the WIDTH and OFFSET are geometry tokens; the COLOR is color-tokens'
accent (`--c-{p}`). The offset keeps the ring clear of the control edge so it survives any radius
(including the pill). Never remove a focus ring without replacing it, and never hardcode its width.

## Borders

`--border-thin` (1px hairlines, field borders, dividers — the default) and `--border-thick` (2px
emphasis). These are constants, NOT part of the space rhythm — a hairline is a hairline at every
density. Color comes from color-tokens' outline roles.

## Density

`--density` (a multiplier, e.g. 1 · 0.75 · 1.25) is the treatment's rhythm knob — it already rides
inside the derived `--size-{step}-gap`, so you don't apply it yourself. Read it only if you need to
scale a bespoke spacing to match the kit's feel; the standard tokens already carry it.

## The radius ladder vs the control pill

- `--radius-{none|sm|md|lg}` — the flat ladder for CONTAINER corners.
- `--radius-full` (9999) — a pill/circle: fully-rounded containers and pill buttons.
- `--size-{step}-radius` — a CONTROL's own height-linked corner (= height/2 pill radius by law), so a
  control's roundness scales with its size. Use this on controls, the ladder on containers.

## Don't

- Don't size an in-control icon independently of `--size-{step}-icon` (breaks centering).
- Don't shrink interactive controls below the hit-target floor on touch.
- Don't hardcode focus-ring width/offset or border width.
