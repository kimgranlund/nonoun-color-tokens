# Button

## When to use

The view's actions. Exactly one `variant="default"` button per view; everything else is
`variant="secondary"`, `variant="outline"`/`"ghost"`, or a link. `variant="destructive"`
only for destructive actions.

## Variants — shadcn's own `<Button>`, mapped

Use the installed shadcn `<Button>` component. Do NOT hand-roll button CSS — its padding,
radius, and focus ring are already correct from `styles.css`'s `--radius` and `--ring`.

| `variant` | Use for |
|---|---|
| `"default"` | THE one decisive action per view |
| `"secondary"` | supporting actions |
| `"destructive"` | destructive actions only |
| `"outline"` / `"ghost"` | a second, non-competing action |
| `"link"` | inline text actions |

## States — Tailwind modifiers, not separate tokens

There are NO separate hover/active tokens: a state is a `hover:`/`active:` **opacity modifier** on
the base class (`styles.css` ships no `-hover`/`-active` variable — the alpha does the work):

| Variant | State | Modifier | Resolves to |
|---|---|---|---|
| default | rest | `bg-primary` | `var(--primary)` |
| default | hover | `hover:bg-primary/90` | `--primary` at 90% opacity |
| default | active | `active:bg-primary/80` | `--primary` at 80% opacity |

- **Focus**: shadcn's `<Button>` ships `focus-visible:ring-ring` already — do not override it.
- **Disabled**: shadcn's `<Button disabled>` already applies the correct opacity.

## Rules — IMPORTANT

- One `variant="default"` per view. Do NOT stack two.
- Do NOT redeclare padding, radius, or focus treatment — the installed component already
  has them correct from `styles.css`.
