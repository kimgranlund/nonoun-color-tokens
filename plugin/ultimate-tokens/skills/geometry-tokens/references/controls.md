# Controls — heights, the centering law, paddings, radius

A control is ONE size step; everything inside it derives from the height. Use the `.control-{step}`
class for the box, or compose the `--size-{step}-*` vars when you need the parts.

## The size ramp — pick a step by density

| Step | Typical use |
|---|---|
| `xs` | dense toolbars, table-row controls, compact chips |
| `sm` | secondary buttons, filter bars, inline controls |
| `md` | the default button / input / select (start here) |
| `lg` | primary CTAs, prominent form fields |
| `xl` · `2xl` | hero actions, touch-first / marketing controls |

The step is a density choice; the same control is `md` in a dense admin and `lg` in a touch app.
Pick per context, then everything inside follows.

## What derives from the height (the centering law)

For a chosen `{step}`:

| Field | Var | What it is |
|---|---|---|
| height | `--size-{step}-height` | the control's block-size |
| icon | `--size-{step}-icon` | leading content-icon / slot glyph size |
| caret | `--size-{step}-caret` | the affordance mark (dropdown ▾) = text size |
| font | `--size-{step}-font` | the control's text size (composed from the UI type voice) |
| gap | `--size-{step}-gap` | icon↔label gap INSIDE the control |
| pad | `--size-{step}-pad` | inline edge padding for a control WITH a leading slot/icon |
| pad-edge | `--size-{step}-pad-edge` | inline edge padding for a SLOTLESS (bare text) control |
| radius | `--size-{step}-radius` | the control's own corner (its height-linked pill radius) |
| min | `--size-{step}-min` | the 1:1 floor — an icon-only control is at least square |

**The law:** padding = (height − icon)/2, so a glyph sits optically centered in the height² cell. If
you set a control's padding independently of its height, you break centering — always use the paired
`--size-{step}-pad` / `-pad-edge`.

## Recipes

**Button (text + optional icon)** — box: `.control-md`, OR by hand: `block-size:
var(--size-md-height); padding-inline: var(--size-md-pad-edge); padding-block: 0; gap:
var(--size-md-gap); border-radius: var(--size-md-radius); min-inline-size: var(--size-md-min);`. Text
= the UI-control voice at the matching step (typography-tokens: `.type-ui-control-md`, `-line-single`).

- **With a leading icon:** icon `--size-md-icon`, and use `--size-md-pad` (slot edge) instead of
  `-pad-edge`.
- **Icon-only:** `inline-size: var(--size-md-min)` (square), padding `--size-md-pad`.
- **Dropdown/select:** append a caret at `--size-md-caret`.

**Input / select field** — `block-size: var(--size-md-height)`, `padding-inline:
var(--size-md-pad-edge)`, border `--border-thin` (color from color-tokens), radius
`--size-md-radius`. The value text is `.type-ui-md`.

**Toggle / checkbox / radio** — the box tracks a small step (`--size-sm-*` or `-xs-*`); the control's
`min` keeps it square.

## Don't

- Don't hardcode a control height (`height: 40px`) — pick a step.
- Don't set padding that isn't `--size-{step}-pad`/`-pad-edge` — you'll un-center the glyph.
- Don't put `--radius-md` on a control that should scale — use `--size-{step}-radius` (or
  `--radius-full` for a pill).
- Don't mix steps within one control — height, icon, font, and pad must all be the same `{step}`.
