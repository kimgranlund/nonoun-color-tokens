# Containers — insets, gaps, the space scale, borders

Container geometry is the space BETWEEN and AROUND components — a different tier from control-internal
geometry (controls.md). It's treatment-derived (scales with the kit's density) and mode-independent.
Reach for a SEMANTIC token (`--inset-*`, `--gap-*`) before a raw `--space-N`.

## Insets — padding INSIDE a container

`--inset-{name}` — each is a named rung of the space ladder, sized to the container's scale:

| Token | Use for |
|---|---|
| `--inset-control-group` | padding inside a toolbar / button group / segmented control |
| `--inset-card` | a card's inner padding |
| `--inset-panel` | a sidebar / panel / section body |
| `--inset-dialog` | a modal / dialog / sheet body |
| `--inset-page` | the page gutter / outermost content padding |

Pick by the container, not by eyeballing a number — a card is `--inset-card` whether it's small or
large; the token already carries the right rhythm.

## Gaps — space BETWEEN siblings

`--gap-{name}` — for `gap` on a flex/grid, or margins between stacked elements:

| Token | Use for |
|---|---|
| `--gap-cluster` | inline siblings (a row of buttons, chips, inline meta) |
| `--gap-stack-tight` | tightly stacked items (a label + its field, list rows) |
| `--gap-stack` | the default vertical stack gap (form fields, list of cards) |
| `--gap-stack-loose` | loosely stacked groups (form sections) |
| `--gap-grid` | the gutter of a card/tile grid |
| `--gap-section` | rhythm between major page sections |

## The raw space ladder (escape hatch)

`--space-{0…9}` is the underlying geometric ladder (roughly-geometric multiples of the treatment's
base spacing — read the actual values from the export). The `--inset-*`/`--gap-*` tier is named rungs
OF this ladder — use the semantic name first; drop to a raw `--space-N` only for a one-off the tier
doesn't cover (an unusual offset, a bespoke grid).

## Recipes

- **Card:** `padding: var(--inset-card)`; radius `--radius-md` (or `-lg`); border `--border-thin`
  (color from color-tokens); a grid of cards uses `gap: var(--gap-grid)`.
- **Form:** field-to-field `gap: var(--gap-stack)`; label-to-field `--gap-stack-tight`;
  section-to-section `--gap-stack-loose`.
- **Dialog:** body `padding: var(--inset-dialog)`; actions row `gap: var(--gap-cluster)`.
- **Page:** outer `padding-inline: var(--inset-page)`; sections separated by `--gap-section`.
- **Toolbar:** `padding: var(--inset-control-group)`; items `gap: var(--gap-cluster)`.

## Radius & borders

- Container corners (the Material 3 shape scale — `xs 4 · sm 8 · md 12 · lg 16 · xl 28`):
  `--radius-xs`/`-sm` (subtle), `--radius-md` (default card), `--radius-lg`/`-xl` (prominent
  surface). `--radius-none` = square; `--radius-full` = pill/circle.
- Borders/dividers: WIDTH is `--border-thin` (hairlines, default) or `--border-thick` (emphasis);
  the COLOR is color-tokens' outline roles. Never a hardcoded `1px solid`.

## Don't

- Don't reach for `--space-N` when a `--inset-*`/`--gap-*` names the job — the semantic tier is why
  you don't guess rungs.
- Don't pad a card with a control's `--size-*-pad` — that's control-internal; a container uses
  `--inset-*`.
- Don't hardcode `border-radius`/`padding`/`gap` in px.
