# Typography

**Display & headings** — Trade Gothic Bold Condensed No. 20 ·
**Body & UI** — New Caledonia · **Mono** — Courier Prime.
Fallbacks: `system-ui` / `ui-monospace`; the hierarchy must survive the fallback.

## Working scale

Each level is a set-together unit: size, line-height, and weight travel together. Leading is
a unitless factor of size; tracking is em/% — **never absolute px** (standing rule). Do NOT
free-type a size or pair a level with a different line-height.

| Level | Family | Size / Leading× | Weight | Use for |
|---|---|---|---|---|
| `display-sm` | Trade Gothic Bold Condensed No. 20 | 44 / 0.977 | 700 | hero statements |
| `heading-lg` | News Gothic | 32 / 1.156 | 600 | page titles, 0.039em tracking |
| `heading-md` | News Gothic | 24 / 1.167 | 600 | section headings, 0.042em tracking |
| `heading-sm` | News Gothic | 20 / 1.15 | 600 | card titles, 0.04em tracking |
| `kicker-md` | Courier Prime | 12 / 1.417 | 520 | uppercase eyebrow, 0.16em tracking |
| `lead-md` | New Caledonia | 18 / 1.444 | 400 | intro paragraphs, -0.005em tracking |
| `body-md` | New Caledonia | 16 / 1.625 | 400 | primary reading text — the floor for content |
| `body-sm` | New Caledonia | 13 / 1.615 | 400 | dense secondary text |
| `ui-md` | Helvetica Neue | 12 / 1.583 | 460 | buttons, inputs, menus, 0.01em tracking |
| `ui-sm` | Helvetica Neue | 11 / 1.545 | 460 | dense controls, table chrome, 0.01em tracking |
| `caption-md` | Helvetica Neue | 12 / 1.5 | 440 | captions, help text |
| `code-md` | Courier Prime | 12 / 1.5 | 460 | code, technical metadata |

## Text rendering — ALWAYS include

Always include the **text-rendering baseline** in the app's global CSS — it is part of this design
system, not an option:

```css
html {
  -webkit-font-smoothing: antialiased;  /* macOS pair: consistent weight in light AND dark */
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;   /* kerning + ligatures engaged */
  font-optical-sizing: auto;            /* variable fonts use their optical axes */
  font-synthesis: none;                 /* no faux bold/italic — weights resolve from the font */
  font-kerning: normal;
  font-variant-ligatures: common-ligatures;
}
code, pre, kbd { font-variant-ligatures: none; } /* code-like units never ligate */
```

## Rules — IMPORTANT

- Do NOT use a level smaller than `body-md` for primary reading text; the smaller steps are
  for dense, secondary UI only.
- Do NOT use more than two heading levels in one view.
- Do NOT free-type a size, gap, or line-height — compose from the scales.
