# Headings, display, and kickers

Three heading voices do different jobs — pick by role, then size by step. Use the `.type-{voice}-{step}`
utility class; the raw vars are listed where you need to compose.

## The heading voices

| Voice | Job | Case |
|---|---|---|
| **display** | the single hero statement on a landing/marketing view — not a document heading | as-set (mixed) |
| **heading** | real document headings: page title, section headings, card/dialog titles | as-set |
| **kicker** | a kicker / section label sitting ABOVE a heading (e.g. "PRICING") | uppercase (treatment) |
| **eyebrow** | the smallest overline / metadata tag — mono, tracked | uppercase (treatment) |

## Mapping to an HTML heading ladder

There is no fixed voice-per-`<h1>`; map by size and importance. A common app mapping:

| Element | Class |
|---|---|
| hero / splash headline | `.type-display-lg` (or `-xl` for the biggest) |
| page title (h1) | `.type-heading-xl` |
| major section (h2) | `.type-heading-lg` |
| subsection (h3) | `.type-heading-md` |
| card / group title (h4) | `.type-heading-sm` |
| minor label (h5/h6) | `.type-heading-xs` |
| kicker above any of the above | `.type-kicker-sm` (or `-xs`) |
| eyebrow / metadata tag | `.type-eyebrow-xs` — a single-line overline: use `--type-eyebrow-{step}-line-single` (it rides the `mono` role, so it has one; leading 1.0) |

Keep the ladder monotonic — don't skip so far that h2 and h3 look identical, and don't jump the
display voice into a document where an editorial heading belongs.

## The heading↔body pairing

Headings use `--font-heading`; body prose uses `--font-body` — the treatment pairs them
deliberately (e.g. a serif display over a sans body). Never swap a heading onto the body font or
vice versa; use the voice and its family follows.

Vertical rhythm between a heading and the paragraph under it comes from the heading step's
`--type-{voice}-{step}-para` (paragraph spacing) — set it as `margin-block-end`; don't invent a
gap. Headings are hierarchy by **size + weight** (the voice/step), never by color — a heading is the
same ink as body (see color-tokens); don't dim it unless it's genuinely secondary.

## Don't

- Don't use `display` for long text — it's tuned for one short line (tight leading, negative
  tracking). Multi-line big text is `heading`.
- Don't `text-transform: uppercase` a heading — `kicker`/`eyebrow` are already
  uppercase by treatment; the others are intentionally not.
- Don't hand-set `letter-spacing`/`line-height` on a heading — `-tracking` and `-line` are tuned per
  step.
