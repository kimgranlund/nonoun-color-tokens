# Interactive elements — buttons, controls, form fields

`{p}` = the palette slug. Buttons/CTAs usually ride the brand accent (`primary`); fields and
controls ride the chrome palette (`neutral`) until they carry meaning (then an intent palette —
same roles, different `{p}`). Every recipe below is a complete state family — ship all rows.

## Buttons

**Filled (primary CTA)** — the accent as a fill:

| State | background | text/icon |
|---|---|---|
| rest | `--c-{p}` | `--c-{p}-on-primary` |
| hover | `--c-{p}-hover` | `--c-{p}-on-primary-hover` |
| active/pressed | `--c-{p}-active` | `--c-{p}-on-primary-active` |
| disabled | `--c-{p}-disabled` | `--c-{p}-on-primary-disabled` |

**Tonal / soft (secondary emphasis)** — the translucent container tier:

| State | background | text/icon |
|---|---|---|
| rest | `--c-{p}-container` | `--c-{p}-on-surface` |
| hover | `--c-{p}-container-hover` | `--c-{p}-on-surface-hover` |
| active | `--c-{p}-container-active` | `--c-{p}-on-surface-active` |
| disabled | `--c-{p}-container-disabled` | `--c-{p}-on-surface-disabled` |

Containers are 500-based translucents — they tint whatever surface they sit on, so a tonal button
composes correctly on any elevation tier.

**Outlined** — transparent fill, stroked:

| State | border | text/icon | background |
|---|---|---|---|
| rest | `--c-{p}-outline` | `--c-{p}` | transparent |
| hover | `--c-{p}-outline-hover` | `--c-{p}-hover` | `--c-{p}-container-low` |
| active | `--c-{p}-outline-active` | `--c-{p}-active` | `--c-{p}-container` |
| disabled | `--c-{p}-outline-disabled` | `--c-{p}-disabled` | transparent |

**Ghost / text button** — text-only: text `--c-{p}` (states `-hover/-active/-disabled` on the
accent), hover background `--c-{p}-container-low`, active `--c-{p}-container`.

**Destructive** — the same four recipes with `{p} = danger`. Never restyle a neutral button red by
hand; switch the palette.

## Form fields (text inputs, textareas, selects)

Fields live on the chrome palette (`neutral` below):

| Part | Role |
|---|---|
| field background | `--c-neutral-surface-low` (recessed) or `--c-neutral-surface` (flush) |
| border, rest | `--c-neutral-outline-variant` |
| border, hover | `--c-neutral-outline-variant-hover` |
| border, focus | `--c-neutral-outline-active` — plus the focus ring (navigation.md) |
| value text | `--c-neutral-on-surface` |
| **placeholder** | `--c-neutral-placeholder` — the dedicated role; never fake it with opacity |
| label | `--c-neutral-on-surface-variant`; floated/active label may take `--c-primary` |
| helper text | `--c-neutral-on-surface-variant` |
| error state | swap the border+helper to the intent palette: `--c-danger-outline`, helper `--c-danger` |
| disabled | bg `--c-neutral-container-disabled` · border `--c-neutral-outline-disabled` · text `--c-neutral-on-surface-disabled` |

## Toggles — checkboxes, radios, switches

| Part | Role |
|---|---|
| unchecked box/track border | `--c-neutral-outline` |
| unchecked track fill (switch) | `--c-neutral-container` |
| **checked/selected fill** | `--c-{p}` (accent) — mark/thumb `--c-{p}-on-primary` |
| checked hover/active | `--c-{p}-hover` / `--c-{p}-active` |
| disabled unchecked | border `--c-neutral-outline-disabled` |
| disabled checked | fill `--c-{p}-disabled` · mark `--c-{p}-on-primary-disabled` |

## Sliders & progress

Track: `--c-neutral-container` (unfilled) · filled portion + thumb: `--c-{p}` · thumb border on
light fills: `--c-{p}-on-primary` · disabled: the `-disabled` pair.

## Text selection & focus (all interactive elements)

`::selection` background `--c-{p}-container-high`, text `--c-{p}-on-surface`. The focus ring is one
recipe app-wide: `outline-color: --c-{p}` (see navigation.md; width/offset come from the geometry
tokens' `--focus-ring-*`).
