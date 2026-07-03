# Text — hierarchy, emphasis, and the accent variants

Prose and labels live on the chrome palette (`neutral` here). The whole hierarchy is TWO ink roles
plus their states — resist inventing intermediate grays.

## The hierarchy

| Text | Role |
|---|---|
| default body, headings, values — **the default is full ink** | `--c-neutral-on-surface` |
| secondary: captions, meta, timestamps, helper text, inactive labels | `--c-neutral-on-surface-variant` |
| placeholder (form fields only) | `--c-neutral-placeholder` |
| disabled text anywhere | `--c-neutral-on-surface-disabled` (secondary: `-on-surface-variant-disabled`) |
| interactive text hover/pressed (a text row, a link-like label) | `-on-surface-hover` / `-on-surface-active` (variant: `-on-surface-variant-hover` / `-active`) |
| text on the inverse surface (tooltips, toasts) | `--c-neutral-inverse-on-surface` |

Headings are hierarchy-by-typography (size/weight from the typography tokens), not by color — a
heading is `-on-surface` like body. Don't dim headings to `-variant` unless they're genuinely
secondary.

## Accent-colored text

Links, emphasized numbers, active labels: `--c-{p}` (the bare accent) — it doubles as a text color
on surface tiers. States: `-hover`/`-active`. In prose, underline links; color alone is not an
affordance.

## The `-dim / -bright / -low / -high` accent variants

Four **tonal variants of the accent itself** (not text-hierarchy roles — that's `-on-surface*`):

- **`--c-{p}-dim` / `--c-{p}-bright`** — *mode-consistent*: dim is literally darker, bright
  literally lighter, in both schemes. Use for literal shading: a gradient's two ends, a pressed
  large-surface tint, a decorative duotone.
- **`--c-{p}-low` / `--c-{p}-high`** — *mode-mirrored*: low reads as LESS emphasis and high as MORE
  emphasis in both schemes (they flip stops across modes so the relationship holds). Use for
  emphasis ladders: a data-viz series' muted vs highlighted state, a secondary vs primary accent
  line, an active tick vs inactive ticks.

Rule of thumb: reaching for a *feeling* (more/less emphasis) → `-low/-high`; reaching for a
*direction* (darker/lighter) → `-dim/-bright`.

## Code & pre

Inline code and code blocks sit on a recessed tier: bg `--c-neutral-surface-low` (block) or
`--c-neutral-container-low` (inline chip), text `--c-neutral-on-surface`; syntax accents may borrow
supporting palettes' bare accents (`--c-secondary`, `--c-tertiary`) — never intent palettes.

## Never

- No `opacity` on text for hierarchy (breaks on tinted surfaces; the variant/disabled roles exist).
- No raw stops (`--c-neutral-700`) as "custom gray" — if `-on-surface-variant` feels wrong, the kit
  needs tuning, not a bypass.
- No hand-flipped dark-mode text colors — `light-dark()` already did it.
