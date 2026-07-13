# Modal jazz · the cool-blue session — Guidelines

You are building UI for **Modal jazz · the cool-blue session**. Color from the modal session: midnight blue, teal shadow, brass gold, smoke grey, and a warm spotlight.

Deliberately refused: Faded sepia. Modal jazz is deep blue and teal warmed by brass — a cool-blue mood, not a brown nostalgia.

## Stack

**React + Tailwind + shadcn ui.** `styles.css` is this brand's compiled token projection —
import it once (see `setup.md`), then build with shadcn's own installed components styled
entirely by the Tailwind classes those tokens map to. Never hand-roll component CSS that
duplicates what an installed shadcn component already provides.

## Reading order

| Question | Read |
|---|---|
| How do I wire this in? | `setup.md` |
| Which color class do I use? | `foundations/color.md` |
| Which type level? | `foundations/typography.md` |
| Which gap, padding, radius? | `foundations/spacing.md` |
| Which component and variant? | `components/overview.md`, then the component file |
| Buttons specifically? | `components/button.md` |

## Hard rules — IMPORTANT

- Do NOT hardcode a color. Every color is a Tailwind class mapped in `styles.css`
  (`foundations/color.md` names them). No exceptions.
- Do NOT put text on a fill in anything other than that fill's own `-foreground` class —
  the pair differs by scheme; both are provided.
- Do NOT stack more than one `variant="default"` action per view.
- Do NOT invent dark-mode values. Every role ships a light value and a `.dark` override
  in `styles.css`; use the pair, never hand-roll a dark variant.
- Do NOT free-type font sizes, gaps, or radii — compose from the scales.
- Do NOT redeclare a shadcn component's own padding, radius, or focus treatment — it
  already reads `--radius`/`--ring` correctly from `styles.css`.

## Workflow

1. Setup first — `styles.css` imported, no `@source` rules added (see `setup.md`).
2. Pick Tailwind classes by role, not by color; both schemes ship in one class.
3. Set type, spacing, and radius from the scales, never free-typed.
4. Use shadcn's own components; map this brand's roles onto their variant props — states
   are Tailwind modifiers (`hover:`, `active:`), not new tokens.
