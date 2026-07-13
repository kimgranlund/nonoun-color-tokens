# Headings, display, and sub-headings

Display plus three heading-family voices (headline · sub-heading · title) do different jobs, plus
kicker for the smallest overline — pick by role, then size by step. Use the `.type-{voice}-{step}`
utility class; the raw vars are listed where you need to compose. Every voice is a 3-step ramp —
`sm`/`md`/`lg` only.

## The heading voices

| Voice | Job | Case |
|---|---|---|
| **display** | the single hero statement on a landing/marketing view — not a document heading | as-set (mixed) |
| **headline** | real document headings: page title, top-level section headings | as-set |
| **sub-heading** | a bold, all-caps CONTEXT heading sitting ABOVE a list/grid (e.g. "LATEST STORIES") — not a subordinate h2 | uppercase (treatment) |
| **title** | a smaller headline — card/dialog titles, lower-level section headings | as-set |
| **kicker** | the smallest overline / metadata tag — mono, tracked, pegged to the same size as `label` | uppercase (treatment) |

## Mapping to an HTML heading ladder

There is no fixed voice-per-`<h1>`; map by size and importance. A common app mapping:

| Element | Class |
|---|---|
| hero / splash headline | `.type-display-lg` |
| page title (h1) | `.type-headline-lg` |
| major section (h2) | `.type-headline-md` |
| subsection (h3) | `.type-headline-sm` or `.type-title-lg` |
| card / group title (h4) | `.type-title-md` |
| minor label (h5/h6) | `.type-title-sm` |
| context heading above a list/grid | `.type-sub-heading-md` |
| kicker / metadata tag | `.type-kicker-md` — a single-line overline: use `--type-kicker-{step}-line-single` (it rides the `mono` role, so it has one; leading 1.0) |

Keep the ladder monotonic — don't skip so far that h2 and h3 look identical, and don't jump the
display voice into a document where an editorial heading belongs.

## The heading↔body pairing

Headline/title use `--font-heading`; body prose uses `--font-body` — the treatment pairs them
deliberately (e.g. a serif display over a sans body). Never swap a heading onto the body font or
vice versa; use the voice and its family follows.

Vertical rhythm between a heading and the paragraph under it comes from the heading step's
`--type-{voice}-{step}-para` (paragraph spacing) — set it as `margin-block-end`; don't invent a
gap. Headings are hierarchy by **size + weight** (the voice/step), never by color — a heading is the
same ink as body (see color-tokens); don't dim it unless it's genuinely secondary.

## Don't

- Don't use `display` for long text — it's tuned for one short line (tight leading, negative
  tracking). Multi-line big text is `headline` or `title`.
- Don't `text-transform: uppercase` a heading — `sub-heading`/`kicker` are already
  uppercase by treatment; the others are intentionally not.
- Don't hand-set `letter-spacing`/`line-height` on a heading — `-tracking` and `-line` are tuned per
  step.
