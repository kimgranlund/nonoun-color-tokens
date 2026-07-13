# Setup

This design system targets **React + Tailwind + shadcn ui** — Figma Make's own preferred
stack. `styles.css` is the compiled projection of this design system; wiring it in is one
import, no translation.

## IMPORTANT

- Import `styles.css` directly into the app's global CSS entry point.
- Do NOT add `@source` rules for this package in the consumer's Tailwind config — the
  tokens arrive pre-mapped through `@theme inline` in `styles.css` itself.
- No ThemeProvider is required. Dark mode is a `.dark` class on `<html>` or `<body>`;
  toggle it however the app already does (`next-themes` or equivalent) — this bundle
  supplies the values, not the toggle mechanism.
- Use shadcn ui's own installed components (`<Button>`, `<Card>`, `<Badge>`, `<Input>`, …)
  styled by these tokens. Do NOT hand-roll component CSS that duplicates what an installed
  shadcn component already provides — see `components/*.md` for the variant mapping.

## Full token layers

Below the shadcn projection, `styles.css` also carries the FULL token layers as custom
properties: the complete semantic color roles (every role of every palette; light in `:root`,
dark under `.dark`), the full geometry system (control size ramp, insets, gaps, borders,
focus ring), and the full typescale. The shadcn mapping stays the default consumption path;
reach for the full layers when a design needs a role or dimension the projection omits.

## Fonts

`styles.css`'s `@theme inline` block sets `--font-sans` (New Caledonia), `--font-serif`
(Trade Gothic Bold Condensed No. 20, used for display/headings), and `--font-mono` (Courier Prime). Load them however
the app already loads fonts (e.g. `next/font`, a `<link>` to Google Fonts) — `styles.css`
only names the family stack, it does not fetch anything.
