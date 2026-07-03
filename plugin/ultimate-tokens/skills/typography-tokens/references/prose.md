# Prose — body copy, captions, lists, links, code-in-text

Running text you *read* (as opposed to interface chrome you *operate*) is the **body** voice on
`--font-body`. Interface text is `ui` — see interface.md; the split matters.

## The body ramp

| Text | Class |
|---|---|
| lead / intro paragraph | `.type-body-lg` |
| default body copy, paragraphs | `.type-body-md` |
| dense or secondary prose | `.type-body-sm` |
| fine print, legal, footnotes | `.type-body-xs` |
| a big pull-quote / standfirst | `.type-body-xl` |

## Paragraph rhythm

Space between paragraphs = the step's `--type-body-{step}-para` (paragraph spacing, derived at
~0.75× the size for prose) applied as `margin-block-end`. Line-height is `--type-body-{step}-line`
(multi-line leading, ~1.5×) — it's already on the `.type-body-*` class; don't override it. Never set
your own `line-height` or paragraph `margin` — the rhythm is derived so it stays proportional across
breakpoints.

**Measure:** keep body line length ~60–75 characters for readability (a `max-inline-size` on the
prose container, e.g. `65ch`) — a layout concern the type tokens don't set, but the reason the body
sizes are tuned the way they are.

## Lists, blockquotes, captions

- List items: the same `.type-body-{step}` as the surrounding prose; the marker inherits it.
- Blockquote: `.type-body-lg` (or the body step one up from the surrounding copy) — emphasis by size,
  the color/border by color-tokens.
- Caption / figure label: `.type-body-xs` or, if it's interface metadata rather than prose,
  `.type-ui-xs` (interface.md).

## Links in prose

Links keep the surrounding body voice/step — only the COLOR changes (color-tokens: bare accent +
underline). Don't bump the weight or size for a link; that's the color layer's job.

## Inline code & code blocks

- Inline code: `.type-code-sm` (or match the surrounding step) — mono family, tabular.
- Code block: `.type-code-sm` / `-md` with `--type-code-{step}-line` for comfortable multi-line
  leading. The surface/color come from color-tokens; the type here is only the mono voice + step.

## Don't

- Don't use `ui` for paragraphs or `body` for buttons — prose is `body`, chrome is `ui`.
- Don't set prose `line-height`/`margin` by hand — `-line` and `-para` are derived.
- Don't scale prose with `vw`/`clamp()` — breakpoint modes (responsive.md) handle size changes.
