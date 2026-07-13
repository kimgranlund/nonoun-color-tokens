# Responsive type, single-line vs multi-line, fonts

## Breakpoint modes (not `clamp()`, not `vw`)

Every kit carries breakpoint modes — the `--type-*` variables are **re-declared inside
`@media (min-width: …)` blocks**. The standard set (synthesized automatically when the designer
configured none) is **Mobile ≤476 → Tablet (992) → Desktop (1280)**; a hand-configured kit may carry
its own ladder — read the actual widths from the blocks. Because a `.type-{voice}-{step}` class reads
the *variables*, the same class restyles automatically at each breakpoint: you write `.type-body-md`
once and it grows with the viewport.

The stepping is **hierarchy-aware**, not uniform: body-class text (body · label · tiny · code) is
**frozen** across breakpoints, headings compress partially on smaller screens, and display-class type
compresses fully (a 90px Desktop display lands near 75 on Tablet, 60 on Mobile). So don't "fix" a
heading that shrinks on mobile while body text doesn't — that asymmetry IS the system.

- **Do not** author fluid `clamp()` type or `vw`-based font sizes — the modes are the responsive
  mechanism, and they land on the kit's exact quantized sizes at each breakpoint (no fractional px).
- **Do not** hand-write `@media` font-size overrides — you'd fight the exported blocks.
- The `:root` block (no media query) is the mobile scale; each `@media` block steps up. An export
  with no `@media` blocks is from an old kit (pre-2026-07) — regenerating it adds the standard set.

## Single-line vs multi-line height

The `mono`/`ui`-role BOX voices — **Label, Code, and Kicker** — carry TWO leadings per step:

- `--type-{voice}-{step}-line` — multi-line leading (text that wraps: helper text, tooltips, prose).
- `--type-{voice}-{step}-line-single` — single-line leading = the size (leading 1.0), for text
  locked in a box (buttons, inputs, cells, a kicker overline) so the box height is exact and
  doesn't grow.

The reading voices (display, headline, sub-heading, title, sub-title, lead, body, tiny) have only
`-line` (they're read as multi-line runs) — this includes `sub-title` and `tiny`, which ride the
`mono`/`ui` FONT roles like the box voices do, but are prose flow (box:false), not control text.
Reach for `-line-single` on a Label/Code/Kicker element whose text must not wrap.

## Paragraph spacing

`--type-{voice}-{step}-para` is the derived paragraph rhythm, by FLOW (not just by role): **0.7×
size for the display + heading-family roles (headline · sub-heading · title), 0.75× for prose
voices on the body/ui/mono roles (body · lead · sub-title · tiny), 1.0× for the box (control-text)
voices — Label, Code, and Kicker**. Use it as `margin-block-end` between blocks of
that voice; it scales with the size across breakpoints, so vertical rhythm stays proportional. Don't
set paragraph margins by hand.

## Fonts & fallbacks

`--font-{display,heading,body,ui,mono}` name the five shared families every voice resolves to (see
SKILL.md's role table); a voice that escaped its shared role font also gets its own dedicated
custom property, one per voice. When a family name contains a digit or space (`'Source Serif 4'`,
`'Inter Tight'`) the export QUOTES it — keep the quotes if you ever write a family literally (an
unquoted digit-bearing family is dropped by strict parsers, notably WebKit). If the project
self-hosts the kit's fonts, the `@font-face` set ships alongside; otherwise a licensed or system
family renders where installed and a generic fallback covers the rest — either way you reference the
`--font-*` var, never the literal name.
