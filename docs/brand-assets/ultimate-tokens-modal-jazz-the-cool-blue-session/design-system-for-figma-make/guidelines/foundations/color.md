# Color

Colors are **roles**, imported ready-to-use from `../styles.css` — bind to the Tailwind
utility class or the shadcn component prop, never to a hex. Every role ships a light value
and a `.dark` override; the values are already wired, don't derive or re-declare them.

## Surfaces & text

| Class | Role | Use for |
|---|---|---|
| `bg-background` / `text-foreground` | app canvas | the lowest, calmest surface |
| `bg-card` / `text-card-foreground` | cards, panels | one step up from background |
| `bg-popover` / `text-popover-foreground` | popovers, menus, sticky bars | the top surface |
| `text-muted-foreground` (on `bg-background`/`bg-card`) | secondary text, captions | — |
| `border-border` | hairlines, dividers, input outlines | translucent, same value both schemes |

## Actions & brand

| Class | Use for |
|---|---|
| `bg-primary text-primary-foreground` | THE action per view — CTA, link, selection |
| `bg-secondary text-secondary-foreground` | supporting actions, quieter emphasis |
| `bg-accent text-accent-foreground` | highlights, tags |
| `ring-ring` | focus ring — every interactive element |

## Intents (status only)

| Class | Role |
|---|---|
| `bg-destructive text-destructive-foreground` | destructive/error — delete, failure, critical |

## Rules — IMPORTANT

- Do NOT cross a foreground pair (e.g. `text-foreground` on `bg-accent`) — each fill's own
  `-foreground` class is the contract; crossing it fails contrast in one scheme.
- Do NOT use `destructive` decoratively — status only, never an ordinary button.
- States are Tailwind modifiers on the base class, not separate roles:
  `hover:bg-primary/90`, `active:bg-primary/80`.

## Grammar token reference (light + dark, the kit's resolved values)

The Ultimate Tokens grammar (`--{prefix}-{family}[-slot]`) is the canonical source behind the
classes above — the kit's resolved role values under its `onColorMode` setting. Families mapped
to a utility class above (the surfaces · `primary`/`secondary`/`accent`/`destructive`) are bound by
that class; a family below with NO utility class (e.g. the muted signature families, `success`/
`warning`) is a **reference hue** — bind it via `var(--{prefix}-{family})` or add a shadcn role to
`styles.css`, never by hardcoding the hex:

| Token | Fill (Light) | Fill (Dark) | On (Light) | On (Dark) | Use |
|---|---|---|---|---|---|
| `--md-sys-color-neutral` | oklch(0.5586 0.0155 93.1) | oklch(0.6469 0.0167 90.3) | oklch(1 0 89.88) | oklch(1 0 89.88) | chrome action fill |
| `--md-sys-color-primary` | oklch(0.5596 0.0962 255.73) | oklch(0.6486 0.095 255.5) | oklch(1 0 89.88) | oklch(1 0 89.88) | family fill |
| `--md-sys-color-primary-muted` | oklch(0.5595 0.053 211.01) | oklch(0.6468 0.0572 210.97) | oklch(1 0 89.88) | oklch(1 0 89.88) | family fill |
| `--md-sys-color-secondary` | oklch(0.5591 0.0675 80.26) | oklch(0.6479 0.0744 80.83) | oklch(1 0 89.88) | oklch(1 0 89.88) | family fill |
| `--md-sys-color-secondary-muted` | oklch(0.5582 0.018 233.27) | oklch(0.6477 0.0193 229.17) | oklch(1 0 89.88) | oklch(1 0 89.88) | family fill |
| `--md-sys-color-accent` | oklch(0.5591 0.0605 77.85) | oklch(0.6481 0.0663 78.21) | oklch(1 0 89.88) | oklch(1 0 89.88) | family fill |
| `--md-sys-color-accent-muted` | oklch(0.5578 0.0475 56.14) | oklch(0.6478 0.0496 54.93) | oklch(1 0 89.88) | oklch(1 0 89.88) | family fill |
| `--md-sys-color-danger` | oklch(0.5588 0.2277 26.92) | oklch(0.6481 0.2377 27.04) | oklch(1 0 89.88) | oklch(1 0 89.88) | family fill |
| `--md-sys-color-success` | oklch(0.5595 0.0931 152.27) | oklch(0.648 0.1057 151.89) | oklch(1 0 89.88) | oklch(1 0 89.88) | family fill |
| `--md-sys-color-warning` | oklch(0.559 0.0967 71.98) | oklch(0.648 0.109 72.47) | oklch(1 0 89.88) | oklch(1 0 89.88) | family fill |
| `--md-sys-color-info` | oklch(0.5596 0.1362 255.02) | oklch(0.6472 0.1357 255.05) | oklch(1 0 89.88) | oklch(1 0 89.88) | family fill |

## Runtime alternative — `light-dark()` (illustrative)

Do NOT paste this into the app in place of `styles.css` — Figma Make's own dark-mode toggle
is the `.dark` class shadcn already reads. This block re-expresses the SAME `:root`/`.dark`
values above as one `light-dark()` declaration per role (the runtime idiom this design
system uses on other platforms), offered for tooling that prefers it.

```css
:root {
  color-scheme: light dark;
  --overlay: light-dark(oklch(0 0 0 / 80%), oklch(0 0 0 / 80%));
  --background: light-dark(oklch(0.9559 0.0011 17.18), oklch(0.2343 0.0038 106.69));
  --foreground: light-dark(oklch(0.1772 0.002 106.6), oklch(1 0 89.88));
  --card: light-dark(oklch(0.9345 0.0017 67.8), oklch(0.2606 0.004 84.58));
  --card-foreground: light-dark(oklch(0.1772 0.002 106.6), oklch(1 0 89.88));
  --popover: light-dark(oklch(0.9345 0.0017 67.8), oklch(0.2606 0.004 84.58));
  --popover-foreground: light-dark(oklch(0.1772 0.002 106.6), oklch(1 0 89.88));
  --primary: light-dark(oklch(0.5596 0.0962 255.73), oklch(0.6486 0.095 255.5));
  --primary-foreground: light-dark(oklch(1 0 89.88), oklch(1 0 89.88));
  --secondary: light-dark(oklch(0.5591 0.0675 80.26), oklch(0.6479 0.0744 80.83));
  --secondary-foreground: light-dark(oklch(1 0 89.88), oklch(1 0 89.88));
  --muted: light-dark(oklch(0.9559 0.0011 17.18), oklch(0.2343 0.0038 106.69));
  --muted-foreground: light-dark(oklch(0.3794 0.0088 88.73), oklch(0.8236 0.0073 88.65));
  --accent: light-dark(oklch(0.913 0.0029 84.56), oklch(0.2853 0.0039 84.58));
  --accent-foreground: light-dark(oklch(0.1772 0.002 106.6), oklch(1 0 89.88));
  --destructive: light-dark(oklch(0.5588 0.2277 26.92), oklch(0.6481 0.2377 27.04));
  --destructive-foreground: light-dark(oklch(1 0 89.88), oklch(1 0 89.88));
  --border: light-dark(oklch(0.6035 0.017 90.31 / 30%), oklch(0.6035 0.017 90.31 / 30%));
  --input: light-dark(oklch(0.6035 0.017 90.31 / 30%), oklch(0.6035 0.017 90.31 / 30%));
  --ring: light-dark(oklch(0.5596 0.0962 255.73), oklch(0.6486 0.095 255.5));
  --chart-1: light-dark(oklch(0.5596 0.0962 255.73), oklch(0.6486 0.095 255.5));
  --chart-2: light-dark(oklch(0.5595 0.0931 152.27), oklch(0.648 0.1057 151.89));
  --chart-3: light-dark(oklch(0.559 0.0967 71.98), oklch(0.648 0.109 72.47));
  --chart-4: light-dark(oklch(0.5588 0.2277 26.92), oklch(0.6481 0.2377 27.04));
  --chart-5: light-dark(oklch(0.5591 0.0675 80.26), oklch(0.6479 0.0744 80.83));
  --sidebar: light-dark(oklch(0.9345 0.0017 67.8), oklch(0.2606 0.004 84.58));
  --sidebar-foreground: light-dark(oklch(0.1772 0.002 106.6), oklch(1 0 89.88));
  --sidebar-primary: light-dark(oklch(0.5596 0.0962 255.73), oklch(0.6486 0.095 255.5));
  --sidebar-primary-foreground: light-dark(oklch(1 0 89.88), oklch(1 0 89.88));
  --sidebar-accent: light-dark(oklch(0.913 0.0029 84.56), oklch(0.2853 0.0039 84.58));
  --sidebar-accent-foreground: light-dark(oklch(0.1772 0.002 106.6), oklch(1 0 89.88));
  --sidebar-border: light-dark(oklch(0.6035 0.017 90.31 / 30%), oklch(0.6035 0.017 90.31 / 30%));
  --sidebar-ring: light-dark(oklch(0.5596 0.0962 255.73), oklch(0.6486 0.095 255.5));
}
```
