# Spacing & Radii

## Spacing scale

Compose every gap, padding, and margin from these steps — an off-scale gap does not exist
in this system.

| Step | px | Typical use |
|---|---|---|
| `none` | 0 | — |
| `xs` | 4 | — |
| `sm` | 8 | — |
| `md` | 12 | — |
| `lg` | 16 | — |
| `xl` | 24 | — |
| `2xl` | 32 | — |
| `3xl` | 48 | — |
| `4xl` | 64 | — |
| `5xl` | 96 | — |

## Radius ladder

One radius language per view — do NOT mix rounded and sharp corners.

| Token | px | Use for |
|---|---|---|
| `none` | 0 | — |
| `xs` | 4 | — |
| `sm` | 8 | — |
| `md` | 12 | — |
| `lg` | 16 | — |
| `xl` | 28 | — |
| `full` | 9999 | — |

## Layout rules

- Keep reading measure ~60–75ch; let whitespace separate, not borders.
- Mobile-first; columns stack below ~640px; touch targets ≥ 44px.
- Elevation is a surface-ladder step (`background` → `card` → `popover`), never a heavy shadow.
