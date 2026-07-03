---
name: color-tokens
description: >
  Use when building or styling ANY UI in a project that carries an Ultimate Tokens export — picking
  the color for a button, control, text, card, modal, nav, toast, or state ("which color/token should
  this use", "style this with our design tokens", "wire the theme", "add hover/disabled states",
  "make this work in dark mode"). The consumption guide for the 59-role semantic layer: how to find
  and bind the project's exported palettes, the pairing laws that keep every foreground on a legal
  background, the state families, and per-surface role maps for interactive elements, text,
  containers, feedback, and navigation. Never guess a hex and never use a raw stop — this skill
  names the semantic role for every job.
---

# Using Ultimate Tokens color roles

An Ultimate Tokens export gives every palette the same **59 semantic roles** as CSS custom
properties. Your job is never to invent a color — it is to pick the right **role** from the right
**palette**. Raw stops exist only as the substrate the roles reference.

## Bind to the project first (always step 1)

1. **Find the export.** A CSS file whose `:root` sets `color-scheme: light dark` and defines
   `--c-*` variables via `light-dark(...)` (often `palette.css` / `tokens.css`; a DTCG
   `*.tokens.json` may sit beside it). If none exists, stop and ask — do not fabricate tokens.
2. **Enumerate the palettes.** Every `--c-<slug>-050` line marks a palette. The default kit ships
   eight: `neutral · primary · secondary · tertiary · info · success · warning · danger` — but kits
   vary; read what's actually there.
3. **Classify them.** The **chrome palette** (usually `neutral`, the lowest-chroma one) drives
   backgrounds, surfaces, text, and outlines app-wide. The **brand accent** (usually `primary`)
   drives CTAs, links, focus, selection. **Intent palettes** (`info/success/warning/danger`) are
   reserved for meaning — never decoration. Remaining palettes are supporting accents.
4. **Know the grammar.** Semantic = `--c-{p}{suffix}` (the accent itself is bare `--c-{p}`; e.g.
   `--c-neutral-on-surface`, `--c-primary-hover`). Raw = `--c-{p}-050…950` solids and
   `--c-{p}-500-{step}` translucents — **never use raws in UI code**.

## The laws (violating any of these is a defect)

1. **Roles, not raws, not hexes.** If a color isn't a semantic role, it doesn't go in UI code.
2. **The pairing law.** A foreground sits only on its own base family: `-on-primary` only on
   `--c-{p}` fills (and their hover/active); the `-on-surface` family only on that same palette's
   background/surface/container tiers. Never cross palettes mid-pair (text `--c-neutral-on-surface`
   on a `--c-success-container` fill is a violation — use `--c-success-on-surface`).
3. **States ship as families.** `-hover · -active · -disabled` exist for the accent, both `on-*`
   sets, both outlines, and containers. Use them verbatim — never synthesize a state with
   `opacity`, `color-mix()`, or a raw stop. If a state role exists, hand-rolling it is a defect.
4. **The scheme is baked in.** Every role flips via `light-dark()` — write each color ONCE, no
   `@media (prefers-color-scheme)` per-color overrides, no `.dark` class swaps. To force a subtree
   into one scheme (a preview pane, an always-dark hero), set `color-scheme: light` / `dark` on it —
   the roles follow.
5. **Elevation is a surface ladder, not a shadow.** Raise/recess with `-surface-low/-high` (…`est`)
   and `-surface-dim/-bright`; shadows are optional garnish on top. See containers.md for the
   mirror/non-mirror distinction — it's exact and easy to get wrong.
6. **On-colors are fixed light BY DESIGN (do not "fix" this).** `-on-primary` / `-on-primary-variant`
   resolve to the palette's light end in BOTH modes, for all palettes — a deliberate brand decision
   (the product's ADR-003/OD-001) that intentionally overrides per-pair contrast math (e.g. white on
   a warning-yellow fill). Do not swap in black text, auto-contrast logic, or your own dark variant.
   If a client insists on WCAG-floor text on fills, raise it as a kit-level decision — never patch it
   locally.

## Surface map — where to look things up

| Building… | Reference |
|---|---|
| Buttons (all variants + states), inputs, selects, checkboxes/radios/switches, sliders, placeholder/focus/selection | [`references/interactive.md`](references/interactive.md) |
| Text hierarchy, headings, links-in-prose, code, disabled text, the accent `-dim/-bright/-low/-high` variants | [`references/text.md`](references/text.md) |
| Cards, panes, sheets, modals, canvas, page background, elevation tiers, dividers/borders | [`references/containers.md`](references/containers.md) |
| Status/intent UI (info·success·warning·danger), toasts/snackbars, banners, overlays & scrims, skeletons/loading, badges | [`references/feedback.md`](references/feedback.md) |
| Navs, tabs, menus, selection/highlight, links-as-chrome, icons, focus rings, data-viz series | [`references/navigation.md`](references/navigation.md) |

## Verify before you ship

- Every color in the diff is a `--c-*{role}` semantic var (grep the diff for `#`, `rgb(`, `oklch(`,
  and `--c-.*-\d` raws — all four should come up empty in UI code).
- Every fg/bg pair obeys the pairing law (same palette, matching family).
- Interactive elements use the full state family (hover, active, disabled — not just base).
- Skill maintainers: `node scripts/role-parity.mjs` gates every role named in these files against
  the product's canonical role table (runs in the product repo's `npm test`; outside it, it no-ops).
