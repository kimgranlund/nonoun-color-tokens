# Navigation — navs, tabs, menus, selection, icons, focus, data-viz

Chrome rides `neutral`; the CURRENT/selected signal rides the accent. The pattern everywhere:
rest = quiet neutral, hover = a container wash, current = accent-marked.

## Nav items (sidebar, top nav, menus, command palettes)

| State | background | text/icon |
|---|---|---|
| rest | transparent | `--c-neutral-on-surface-variant` |
| hover | `--c-neutral-container-low` | `--c-neutral-on-surface-hover` |
| pressed | `--c-neutral-container` | `--c-neutral-on-surface-active` |
| **current/selected** | `--c-{p}-container` | `--c-{p}-on-surface` (+ an optional bare `--c-{p}` indicator bar) |
| disabled | transparent | `--c-neutral-on-surface-disabled` |

Menus/popovers float on `--c-neutral-surface-higher` with an `-outline-variant` border
(containers.md); destructive menu items use `--c-danger` text.

## Tabs

Inactive label `--c-neutral-on-surface-variant` (hover `-hover`) · active label
`--c-neutral-on-surface` · the active indicator (underline/pill) bare `--c-{p}` · a pill-style
active tab: bg `--c-{p}-container`, label `--c-{p}-on-surface`.

## Links (as chrome: breadcrumbs, footers, "view all")

`--c-{p}` with `-hover`/`-active`; visited state is not modeled — don't invent one. Breadcrumb
separators and inactive crumbs: `--c-neutral-on-surface-variant`.

## Selection & highlight

- Selected list rows / cells: bg `--c-neutral-container` (meaning-laden selection: `--c-{p}-container`).
- Multi-select checkmarks: interactive.md's toggle recipe.
- Search-hit highlight: `--c-{p}-container-high` behind `-on-surface` text.
- Drag-over / drop target: border `--c-{p}-outline-active`, wash `--c-{p}-container-low`.

## Icons

Icons inherit their text partner's role — an icon beside `-on-surface-variant` text is
`-on-surface-variant`. Standalone icon buttons follow interactive.md's ghost recipe. Decorative
icons may take supporting accents' bare roles; meaningful icons take intent accents.

## Focus rings (every focusable element, one recipe app-wide)

`outline-color: --c-{p}` (the brand accent) — width/offset come from the geometry tokens
(`--focus-ring-width/-offset`). On accent-filled elements where the ring would vanish, ring with
`--c-{p}-on-primary` instead, or rely on the offset gap. Never remove the ring without replacing it.

## Data-viz series

Series colors: the bare accents of the non-intent palettes in kit order (`--c-primary`,
`--c-secondary`, `--c-tertiary`, then supporting palettes) — skip `neutral` and reserve intents for
meaning-bearing series (a "failures" line may be `--c-danger`). Emphasis within one series:
`-high` (highlighted) vs `-low` (muted context) — the mode-mirrored pair (text.md). Gridlines
`--c-neutral-outline-variant`; axis labels `-on-surface-variant`.
