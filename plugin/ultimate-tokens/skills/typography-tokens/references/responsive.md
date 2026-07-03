# Responsive type, single-line vs multi-line, fonts

## Breakpoint modes (not `clamp()`, not `vw`)

If the kit was exported with breakpoint modes, the `--type-*` variables are **re-declared inside
`@media (min-width: …)` blocks** — one block per breakpoint (the standard web set is 476/768/992/
1280/1540). Because a `.type-{voice}-{step}` class reads the *variables*, the same class restyles
automatically at each breakpoint: you write `.type-body-md` once and it grows with the viewport.

- **Do not** author fluid `clamp()` type or `vw`-based font sizes — the modes are the responsive
  mechanism, and they land on the kit's exact quantized sizes at each breakpoint (no fractional px).
- **Do not** hand-write `@media` font-size overrides — you'd fight the exported blocks.
- Base (the smallest, ≤476) is the mobile scale; each larger breakpoint steps up. If the export has
  no `@media` blocks, the kit shipped Base-only — the type is fixed, which is a valid choice.

## Single-line vs multi-line height

The `mono`/`ui`-role voices — **UI, Code, and Heading-Eyebrow** — carry TWO leadings per step:

- `--type-{voice}-{step}-line` — multi-line leading (text that wraps: helper text, tooltips, prose).
- `--type-{voice}-{step}-line-single` — single-line leading = the size (leading 1.0), for text
  locked in a box (buttons, inputs, cells, an eyebrow overline) so the box height is exact and
  doesn't grow.

The reading voices (display, Heading-Editorial, Heading-Context, body) have only `-line` (they're
read as multi-line runs). Reach for `-line-single` on a UI/Code/Eyebrow element whose text must not
wrap.

## Paragraph spacing

`--type-{voice}-{step}-para` is the derived paragraph rhythm, by ROLE (not by the display-vs-heading
grouping): **0.7× size for the display + editorial/context heading roles, 0.75× for body, 1.0× for
the ui/mono roles — UI, Code, and Heading-Eyebrow**. Use it as `margin-block-end` between blocks of
that voice; it scales with the size across breakpoints, so vertical rhythm stays proportional. Don't
set paragraph margins by hand.

## Fonts & fallbacks

`--font-{display,heading,body,ui,mono}` name the families. When a family name contains a digit or
space (`'Source Serif 4'`, `'Inter Tight'`) the export QUOTES it — keep the quotes if you ever write
a family literally (an unquoted digit-bearing family is dropped by strict parsers, notably WebKit).
If the project self-hosts the kit's fonts, the `@font-face` set ships alongside; otherwise a licensed
or system family renders where installed and a generic fallback covers the rest — either way you
reference the `--font-*` var, never the literal name.
