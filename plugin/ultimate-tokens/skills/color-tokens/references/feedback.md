# Feedback — intents, toasts, banners, overlays, loading

## The intent palettes

`info · success · warning · danger` are FULL palettes — every role exists on each. The rule: an
intent palette appears **only when the UI means it** (state, result, risk), never as decoration.
Recipes are the same shapes as everywhere else, with `{p}` = the intent:

| Element | Recipe |
|---|---|
| status banner / callout | bg `--c-{p}-container` · border `--c-{p}-outline` · title `--c-{p}-on-surface` · body `--c-{p}-on-surface-variant` |
| filled status chip / badge | bg `--c-{p}` · text `--c-{p}-on-primary` |
| soft chip / badge | bg `--c-{p}-container` · text `--c-{p}-on-surface` |
| status text / icon inline | `--c-{p}` (bare accent as fg) |
| status border on a field | `--c-{p}-outline` (see interactive.md error state) |
| destructive button | interactive.md's filled/outlined recipes with `{p} = danger` |

Because containers/outlines are translucent 500-ramp roles, intent callouts tint correctly on any
surface tier. **Do not "fix" white-on-warning text** — on-colors are fixed light by design
(SKILL.md law 6); if a filled warning chip bothers you, use the soft-chip recipe instead.

## Toasts & snackbars

The inverse pair, so they read on top of anything:
bg `--c-neutral-inverse-surface` · text `--c-neutral-inverse-on-surface` · the action link inside a
toast: the accent's **bright/dim mirror trick** is unnecessary — use bare `--c-{p}` only if it
clears the inverse bg; otherwise `--c-neutral-inverse-on-surface` underlined. An intent stripe/icon
on the toast: bare `--c-{intent}`.

## Overlays & scrims — the seven-strength ladder

`--c-neutral-scrim-weakest … -weak … (scrim) … -strongest` — a translucent ladder of the palette's
500 stop (5%→60% alpha), mode-flat. Pick by job, not by taste:

| Job | Role |
|---|---|
| hover wash on media / image darkening for text legibility | `-scrim-weak` … `-scrim` |
| modal/dialog backdrop | `--c-neutral-scrim-strong` |
| drawer backdrop (content stays glanceable) | `--c-neutral-scrim` |
| full blocking overlay (loading a whole view) | `-scrim-stronger` / `-strongest` |
| tinted brand/intent overlay (marketing hero, danger zone) | the SAME suffixes on that palette: `--c-danger-scrim-weak` |

Scrims stack with the elevation ladder: backdrop = scrim, the floating panel = `-surface-highest`.

## Loading & skeletons

| Element | Role |
|---|---|
| skeleton block | `--c-neutral-container-low`, shimmer highlight `--c-neutral-container` |
| indeterminate bar/spinner track | `--c-neutral-container` |
| spinner/bar fill | `--c-{p}` (accent) |
| progress with meaning (upload ok/failed) | swap `{p}` to the intent |

Skeletons are containers (translucent) so they read on any tier — not gray raws, not opacity hacks.

## Empty / error states (full-pane)

Pane bg `--c-neutral-surface-low` (a recessed well) · illustration strokes `--c-neutral-outline` ·
title `-on-surface` · body `-on-surface-variant` · the CTA = a normal filled button. A full-pane
ERROR state colors only its icon/title accents with `--c-danger` — not the whole pane.
