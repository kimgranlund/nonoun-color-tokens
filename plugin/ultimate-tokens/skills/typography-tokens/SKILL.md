---
name: typography-tokens
description: >
  Use when setting the TYPE of any UI in a project that carries an Ultimate Tokens export — the
  font/size/weight/leading/tracking for a heading, body copy, label, button, caption, code, or
  kicker ("what type token for this", "which voice/step should this text use", "size this heading",
  "make the type responsive", "why is this text the wrong size/weight", "wire the fonts"). The
  consumption guide for the eleven-role type scale (role=function × level=hierarchy-depth, size
  derived): how to find and bind the exported `--type-*` /
  `--font-*` variables, choose the right VOICE for a text's job and the right STEP for its size, and
  apply the paragraph/single-line rhythm. Never hardcode a px font-size or a font family — this names
  the semantic type token for every job. Scope is TYPE only (colour is color-tokens; radius/spacing/
  density is geometry-tokens).
disable-model-invocation: false
user-invocable: false
---

# Using Ultimate Tokens type roles

An Ultimate Tokens export gives eleven named **voices**, each a ramp of **steps**, as CSS custom
properties. Your job is never to pick a px size or a font stack — it is to pick the right **voice**
(the text's role) and **step** (its size within that role).

## Bind to the project first (always step 1)

1. **Find the export.** A CSS file defining `--font-*` families and the type-scale variables (often
   `type.css` / `tokens.css`; a DTCG `*.tokens.json` and utility classes may sit beside it). **The
   scale prefix is configurable:** the default is `--type-*` (class `.type-*`), but a Material scheme
   exports `--md-sys-typescale-*` or a custom `--{brand}-type-*` — **read the actual prefix from the
   file**; the grammar after it (`-{voice}-{step}-{prop}`) is identical, and font families stay
   `--font-*` regardless. If none exists, stop and ask — do not hardcode sizes.
2. **Read the fonts.** Five family roles: `--font-display`, `--font-heading`, `--font-body`,
   `--font-ui`, `--font-mono`. Every voice resolves to one of these — you never name a family
   directly, you use the voice's `--font-*` var (the utility classes already do this).
3. **Know the grammar.** `--type-{voice}-{step}-{prop}` where prop ∈
   `size · line · tracking · weight · para` (+ `line-single` on UI/Code only). Prefer the ready-made
   utility class `.type-{voice}-{step}` (it wires family+size+line+tracking+weight in one) over
   composing the vars by hand.

## Two axes — role (function) × level (hierarchy depth)

A **voice is a ROLE** — the text's *function*, carrying its character (weight, tracking, leading,
case, font) across every size. A **step is a LEVEL** — the element's rank in the hierarchy, from
which the size is *derived*. They're independent: the same role appears at many levels, and the same
level hosts different roles. **You pick the role by function and the level by hierarchy depth — never
a role to hit a size, never a step to hit a px.** Choosing `display` because you want big text, or a
larger step because you want line-height 26, is the mistake this split exists to prevent.

## The eleven roles — pick by the text's FUNCTION

| Voice (role) | Font role | Use for | Steps (levels) |
|---|---|---|---|
| **display** | display | hero/marketing headlines, the one big statement on a view | XS–XL |
| **heading** | heading | section & content headings (h1–h4), card titles, dialog titles | XS–XL |
| **sub-heading** | heading | sub-headings / section labels above a heading — wide-tracked, usually uppercase | XS–XL |
| **kicker** | mono | the smallest overline / metadata label — mono, uppercase, tracked | XS–XL |
| **lead** | body | the standfirst / intro paragraph opening an article or section — larger than body | SM–LG |
| **body** | body | running prose, paragraphs, descriptions, long-form reading | XS–XL |
| **quote** | heading | block quotes & pull quotes — takes the display face (a serif pull-quote in serif treatments) | SM–LG |
| **caption** | ui (prose) | figure/image/media captions, table captions, chart annotations | SM–LG |
| **ui** | ui | interface text: buttons, labels, inputs, menus, table cells, badges | 3XS–2XL |
| **code** | mono | code, tabular figures, keyboard shortcuts, technical values | 3XS–2XL |
| **legal** | ui (prose) | fine-print, disclaimers, legal, footnotes — the smallest reading text | SM–LG |

Note the split: **body** is for *prose you read*; **ui** is for *interface chrome you operate*. A
button label is `ui`, not `body`. A paragraph is `body`, not `ui`. The **editorial** voices are prose
too — **lead**, **quote**, **caption**, **legal** — even though caption/legal render in the *ui font*;
they wrap (use `-line`, not `-line-single`). Reach for `caption` on a figure caption, not `ui`.

## The laws (violating any of these is a defect)

1. **Role+level, not px, not a font stack.** If a size or family isn't a `--type-*` var (or a
   `.type-*` class), it doesn't belong in UI code. No `font-size: 14px`, no `font-family: Inter`.
2. **Role = function, level = hierarchy depth; size is derived.** Choose the voice from what the text
   *is* (a heading, a sub-heading, a label), then the step from its rank in the hierarchy — the size falls
   out of the level. Never reach for `display` just to get big text, a larger step just to get a
   target line-height, or `ui` just to get small headings. If two elements share a role, the more
   prominent one takes the higher level; if a size feels wrong, it's the wrong *level*, not a reason
   to switch roles.
3. **`line` and `para` come with the size.** Line-height (`-line`) and paragraph spacing (`-para`)
   are derived per step — use them; don't set your own `line-height: 1.5` or `margin-bottom`. For
   single-line control text (a button, an input value, an overline) use `-line-single` (leading
   1.0), which exists on the box-text voices — **UI, Code, and Heading-Kicker** (the `ui`/`mono`
   roles); for multi-line text use `-line`.
4. **Tracking is baked and optical.** `-tracking` is tuned per step (tight on display, open on
   kicker) — apply it; never add your own `letter-spacing`.
5. **Weight is the voice's, and case is the treatment's.** Use `-weight`; don't bold a voice by
   hand. `sub-heading` and `kicker` are uppercase by treatment — don't `text-transform`
   them yourself, and don't uppercase a voice that isn't.
6. **Responsive is per-breakpoint modes, not `clamp()` or `vw`.** If the kit exports breakpoint
   modes, the `--type-*` vars are re-declared inside `@media (min-width: …)` blocks — the same class
   restyles automatically. Don't write fluid `clamp()` type or manual `@media` font-size overrides;
   the modes already did it (see [`references/responsive.md`](references/responsive.md)).
7. **The text-rendering baseline is always on.** Include it once in the app's global CSS — it is part
   of the system, not an option:
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
   `font-synthesis: none` means a weight the font can't resolve renders at the nearest REAL weight —
   if something looks un-bold, fix the loaded font (or the `-weight` var), never fake it.

## Surface map — where to look things up

| Setting type on… | Reference |
|---|---|
| Headings h1–h6, sub-headings, kickers, display, the heading↔body pairing | [`references/headings.md`](references/headings.md) |
| Body prose, lead/standfirst, quotes & pull-quotes, captions, legal fine-print, lists, links, inline code | [`references/prose.md`](references/prose.md) |
| Buttons, inputs, labels, menus, tabs, table cells, badges, tooltips, code | [`references/interface.md`](references/interface.md) |
| Breakpoint modes, single-line vs multi-line, fluid-type anti-pattern, fallback fonts | [`references/responsive.md`](references/responsive.md) |

## Verify before you ship

- Every type declaration is a `--type-*` var or a `.type-*` class — grep the diff for `font-size:`,
  `font-family:`, `line-height:`, `letter-spacing:`, `font-weight:` in UI code (all should be
  var-backed or absent).
- The voice matches the text's job (prose → `body`, chrome → `ui`, headings → a `heading-*` voice).
- No hand-set line-height, letter-spacing, or `clamp()`/`vw` font sizing.
- Skill maintainers: `node scripts/voice-parity.mjs` gates every voice/step/prop named here against
  the engine (runs in the product repo's `npm test`; no-ops outside it).
