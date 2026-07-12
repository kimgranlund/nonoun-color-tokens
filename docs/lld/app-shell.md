# LLD — The App Shell (`HctApp`)

> **Status:** as-built (descriptive LLD for the shipped shell — the *how* below is read from the
> current source, not proposed).
> **Governing spec:** `docs/reference/references/ui-plan.md` — the front-end plan. There is no
> separate numbered SPEC for the shell, so §0.1 assigns stable **`SPEC-R#`** handles to ui-plan's own
> clauses (its **tasks T1–T9** and **Revision A** arrangement) — the IDs are new, the requirements are
> not. Every component traces to a `SPEC-R#`. Engine/role contracts live in `knowledge-01…06` +
> `data/role-table.json`.
> **Source of record:** `src/ui/app.js` (the `HctApp` custom element, ~all UI) · `src/ui/styles.css`
> (the grid) · `src/ui/model.mjs` (`projectView` — the read-model each render consumes).
> **Scope:** the shell — the frame, its regions, the render pipeline, and the state that routes them.
> The *contents* of a region (the L\*×C graph, the 53-role table, the type specimen) are out of scope;
> they are named where they mount and owned by their own sections.

---

## 0. What "the shell" is

`HctApp` is a single vanilla custom element (no framework), built with the `h(tag, attrs, ...kids)`
hyperscript into **light DOM**. It has exactly two top-level views and forks between them on every
render (`app.js:944`):

```
render() ─┬─ this.view === "gallery" → renderGallery()   (the home / set browser — UI:T9)
          └─ this.view === "editor"  → renderEditor()    (the creative-editor shell — UI:T1–T8)
```

The **editor shell** is the subject of this LLD. Its posture is *creating / configuring / analyzing*
(UI §1), so it is the canonical creative-editor frame — **header + dual rail + canvas + footers** —
never a dashboard.

One more axis crosses the whole editor: **`this.section` ∈ {color, typography, geometry}**. It is a
single ui-session field that re-routes all three panes; the frame is invariant, the region *bodies*
branch on it. A brand kit is one document with three composing systems surfaced as sections of one
editor — the shell is what makes them one editor.

### 0.1 Shell requirements (`SPEC-R#`)

Stable handles for the ui-plan clauses the shell realizes. These are the *what*; §2 adds the *how*.

| Req | Requirement (from `ui-plan.md`) | ui-plan origin |
|-----|----------------------------------|----------------|
| **SPEC-R1** | Manage the document: name, save/dirty state, settings | T1 |
| **SPEC-R2** | Manage palettes: add / remove / rename / enable | T2 |
| **SPEC-R3** | Tune the selected palette (hue/chroma/skew/lift) | T3 |
| **SPEC-R4** | Tune global parameters (curve/tension/lmin/lmax/damp/hueSpace) | T4 |
| **SPEC-R5** | Inspect quality: the L\*×C plot + tone/chroma diagnostics | T5 |
| **SPEC-R6** | Check contrast: on-colors vs fills, flag `< 4.5:1` | T6 |
| **SPEC-R7** | Preview theme light↔dark, independent of app chrome | T7 |
| **SPEC-R8** | Export (5 formats) via a right-side drawer | T8 |
| **SPEC-R9** | Browse saved sets (the home gallery) | T9 |
| **SPEC-R10** | Creative-editor frame: header + dual rail + canvas + footers | §1 posture + RevA |
| **SPEC-R11** | Dual rail = Analysis left / segmented `[Palette│Global│Roles]` right; ramps as the pannable navigator | RevA |
| **SPEC-R12** | One editor, three composing sections (Color · Typography · Geometry) | brand-kit charter |

---

## 1. The frame — CSS grid (`app.js:1644` `renderEditor` · `styles.css:296`)

`renderEditor()` returns a `.editor` grid plus its overlay siblings (drawer, dialogs, toast). The grid
is a fixed 3×3:

```css
.editor{
  display:grid; height:100%;
  grid-template-columns: 290px 1fr 300px;      /* left · center · right          */
  grid-template-rows: var(--hh) 1fr var(--fh); /* header · body · footer         */
  grid-template-areas:
    "header header header"
    "left   center right"
    "footer footer footer";
  transition: grid-template-columns .18s ease; /* pane collapse animates the track */
}
.editor.left-collapsed  { grid-template-columns: 0 1fr 300px; }
.editor.right-collapsed { grid-template-columns: 290px 1fr 0; }
.editor.left-collapsed.right-collapsed { grid-template-columns: 0 1fr 0; }
```

Collapsing a pane is a **class on `.editor`** that zeroes one column track (`toggleLeftPane` /
`toggleRightPane`, `app.js:1745`); the `.18s` transition on `grid-template-columns` animates it. The
pane element stays in the DOM (its padding/border zero out, `styles.css:431`) — collapse is layout,
not teardown.

### 1.1 Editor shell wireframe

```
┌───────────────────────────────────────────────────────────────────────────┐
│ APP-HEADER                                              (grid area: header) │
│ ◈ Color Tokens  [ doc name… ]  «Color·Typography·Geometry»  ↺ ↻ ◐ ⚙ +New [⇪]│
├───────────────┬─────────────────────────────────────────┬───────────────────┤
│ LEFT-PANE     │ CENTER                                  │ RIGHT-PANE        │
│ (aside 290px) │ ┌─────────────────────────────────────┐ │ (aside 300px)     │
│ .pane-label   │ │ CANVAS-HEADER                       │ │ .pane-head        │
│  Analysis   ‹ │ │  view · stops · fit · mode · zoom   │ │ ‹ [Palette│Glob│Roles]│
│ ┌───────────┐ │ ├─────────────────────────────────────┤ │ ┌───────────────┐ │
│ │ L*×C      │ │ │ .canvas-area                        │ │ │ .seg-body     │ │
│ │ tone      │ │ │  └ .canvas-scene                    │ │ │ (active panel)│ │
│ │ chroma    │ │ │    pan/zoom · the FULL dataset      │ │ ├───────────────┤ │
│ │ contrast  │ │ ├─────────────────────────────────────┤ │ │ .seg-example  │ │
│ │ hue wheel │ │ │ CANVAS-FOOTER  hover · pan/zoom cues │ │ │ (live preview)│ │
│ └───────────┘ │ └─────────────────────────────────────┘ │ └───────────────┘ │
│ (.an-body)    │                                         │                   │
├───────────────┴─────────────────────────────────────────┴───────────────────┤
│ APP-FOOTER                                              (grid area: footer) │
│ N palettes · M tokens · theme · ✓ saved             ⚠ k on-color < 4.5:1     │
└───────────────────────────────────────────────────────────────────────────┘
   overlays (siblings, outside the grid): Export drawer · New-palette · Apply-gate · Settings · Toast
```

---

## 2. Component map

Each shell component below carries a local ID (`LLD-C*`), the requirement it serves, and its source
anchor. "Interface" is the method's contract, not its body.

| ID | Component | Method (`app.js`) | Traces to |
|----|-----------|-------------------|-----------|
| **LLD-C1** | Root element / view fork | `render` :936, `:944` | SPEC-R9 (gallery) + SPEC-R10 (editor) |
| **LLD-C2** | Editor frame (grid + overlays) | `renderEditor` :1644 | SPEC-R10 |
| **LLD-C3** | App-header | `renderAppHeader` :1664 | SPEC-R1, SPEC-R8, SPEC-R7 |
| **LLD-C4** | Section switcher | `sectionSwitcher` :1714 / `setSection` :1733 | SPEC-R12 |
| **LLD-C5** | Left pane (Analysis rail) | `renderLeftPane` :1819 | SPEC-R11, SPEC-R5, SPEC-R6 |
| **LLD-C6** | Center (canvas) | `renderCenter` :2778 | SPEC-R11, SPEC-R2, SPEC-R3 |
| **LLD-C6a** | Canvas header | `renderCanvasHeader` :2801 | SPEC-R11, SPEC-R7 |
| **LLD-C6b** | Canvas area / scene | `renderCanvasArea` :2926 | SPEC-R10 (pannable canvas), SPEC-R2 |
| **LLD-C6c** | Canvas footer | `renderCanvasFooter` :4242 / `paintCanvasFooter` :4246 | SPEC-R5 |
| **LLD-C7** | Right pane (segmented inspector) | `renderRightPane` :4273 | SPEC-R11, SPEC-R3, SPEC-R4 |
| **LLD-C8** | App-footer | `renderAppFooter` :5145 / `paintAppFooter` :5164 | SPEC-R6, SPEC-R1 |
| **LLD-C9** | Pane-collapse toggles | `toggleLeftPane`/`toggleRightPane` :1745 / `paneToggle` :1753 | SPEC-R10 (density) |
| **LLD-C10** | Overlays (drawer, dialogs, toast) | `renderDrawer` / `renderSettings` / `renderNewPalette` / `renderApplyGate` :1656–1660 | SPEC-R8, SPEC-R2, SPEC-R1 |

### 2.1 Region responsibilities (the non-obvious contracts)

- **LLD-C3 App-header** — brand (→ `toGallery`, keyboard-operable), the doc-name `<input>` (rename
  coalesces into one undo step via `editDrag`, settles on `change`), the centered **section switcher**
  (a `.spacer` on each side keeps it centered), then the trailing cluster: undo · redo · theme · settings
  · New · **Export** (primary). The header is the one region a color drag deliberately does **not**
  touch (see §4.2) so the doc-name caret survives typing.

- **LLD-C4 Section switcher** — the single `segmented()` tablist that writes `this.section`. `setSection`
  (`:1733`) is the crossover point: on leaving `color` it **stashes** the pan/zoom viewport
  (`this._colorViewport`) and on return **restores** it; typography/geometry scenes are static, so it
  `fit()`s them; entering typography lazily injects the base type fonts (`ensureTypeFonts`). Every pane
  method (`renderLeftPane`, `renderCenter`, `renderRightPane`) branches on `this.section` first.

- **LLD-C5 Left pane** — `<aside class=left-pane>` = a `.pane-label` (section label + selected-palette name
  + the open-state left toggle) over a **`.an-body`** wrapper. `.an-body` exists so `liveRefresh` can
  `replaceChildren` the analysis cards in place without disturbing the label or shell. Body branches:
  color → `analysisCards` (5 graphs), typography → `typeAnalysisCards` (4), geometry → `geomAnalysisCards`.

- **LLD-C6 Center** — `.center` = `[canvas-header] + [canvas-area] + [canvas-footer]`, one triple per
  section. **LLD-C6b canvas-area** wraps the pannable **`.canvas-scene`**, which holds the *entire* dataset
  (all ramps / the full specimen / the full size ramp) transformed as one unit. Table-shaped views
  (color "Mapping", and any "Both"/Compare mode) swap the pannable scene for a scrolling `.is-table`
  shell instead of pan/zoom.

- **LLD-C7 Right pane** — `<aside class=right-pane>` = `.pane-head` (open-state right toggle + the inspector
  `segmented()` tabs) + **`.seg-body`** (`role=tabpanel`, the active panel) + **`.seg-example`** (a live
  component preview wired to the selected palette's roles, pinned below **every** tab). Color tabs:
  `[Palette │ Global │ Roles]`, plus `Story` only when `view.story` exists (the tab is dropped and the
  selection falls back to `palette` when absent). Typography/geometry return their own whole inspector
  (`renderTypeInspector` / `renderGeomInspector`).

- **LLD-C8 App-footer** — a static shell of empty `<span>`s that `paintAppFooter` fills in place: enabled-
  palette count · token count · theme · save state (`✓ saved` / `● unsaved`) · a right-aligned contrast
  warning (`⚠ k on-color < 4.5:1`). Painted by the full render **and** by `liveRefresh`, so counts track
  a drag without a re-render.

- **LLD-C6a canvas-header (color)** — the collapsed-left toggle (when applicable) · the view segmented
  `[Palettes · Scrims · Mapping]` · a stops-density `[Core · All]` segmented (hidden in Mapping) · a
  spacer · **Fit** · the unified **Mode** control `[Light · Dark · Both]` (Both = side-by-side Compare)
  · zoom −/readout/+.

---

## 3. State & data model

State lives on the element instance. Two tiers, and the split is load-bearing:

### 3.1 Persisted (the document — survives reload, undoable)
- **`this.doc`** — the palette SET: `{ name, palettes[], type, geometry, … }`. Mutated only through
  `editDrag`/`commitDrag` (undo/redo history). `projectView(this.doc)` (`model.mjs`) derives the
  per-render read-model **`view`** (`{ palettes[], contrast[], story, … }`) — the shell never reads raw
  doc geometry, only `view`.

### 3.2 Ephemeral ui-session (routes the shell; **never persisted**)
| Field | Values | Routes |
|-------|--------|--------|
| `this.view` | `gallery` \| `editor` | LLD-C1 top-level fork |
| `this.section` | `color` \| `typography` \| `geometry` | LLD-C4 — all three panes |
| `this.canvasView` | `palettes` \| `scrims` \| `mapping` | LLD-C6b color scene shape |
| `this.stopsMode` | `core` \| `extended` | LLD-C6b ramp density |
| `this.colorMode` | `light` \| `dark` \| `both` | LLD-C6 preview scheme / Compare |
| `this.segment` | `palette` \| `global` \| `roles` \| `story` | LLD-C7 inspector panel |
| `this.panesLeft` / `this.panesRight` | bool | LLD-C9 grid-track collapse |
| `this.viewport` | `{x,y,zoom}` | LLD-C6b pan/zoom transform |
| `this._colorViewport` | saved `{x,y,zoom}` | LLD-C4 viewport round-trip |
| `this.theme` / `this.canvasTheme` | `system`\|`light`\|`dark` | app chrome vs canvas preview (two `◐`) |
| `this.inFigma` | bool | env gate (disables web-only paths) |

Rule of thumb: **anything that changes what you see but not what you'd export is ephemeral** and is set
directly then `render()`ed — no undo entry, no persistence.

---

## 4. The render pipeline (control flow)

### 4.1 Full render (`render` :936)
```
render():
  guard: skip if a text field is mid-edit that a rebuild would disrupt   (focus-preservation)
  this.replaceChildren( view==="gallery" ? renderGallery() : renderEditor() )
  if editor: paintAppFooter(view) ; paintCanvasFooter() ; re-show drawer if it was open
```
A full render **rebuilds the whole subtree** and mounts a *fresh, closed* `<dialog>` for each overlay;
an open export drawer is re-`showModal()`'d after mount so a render mid-drawer doesn't dismiss it
(`app.js:957`).

### 4.2 Live refresh (partial — during a continuous drag, `app.js:664`)
A slider/swatch drag must not full-render (it would blow away the active control's focus/caret). Instead
`liveRefresh` surgically updates only what the drag changed, leaving the header, panes shell, and the
active control untouched:
```
liveRefresh():
  if section !== "color": return         (type/geom have no live color-drag)
  if colorMode === "both": full render() (Compare's two columns rebuild wholesale)
  else:
    • replace the CHILDREN of the existing .canvas-scene (keep the element — the transform lives on it)
    • replaceChildren the left rail's .an-body cards
    • paintCanvasFooter() + paintAppFooter()
  the drag's settle ('change') does one full render() to commit the undo step.
```
This is why LLD-C5 wraps cards in `.an-body` and LLD-C8/LLD-C6c are paint-in-place: they are the live-refresh
targets.

### 4.3 Pan / zoom (LLD-C6b)
`this.viewport = {x,y,zoom}` applied as an origin-**centered** transform on `.canvas-scene` (origin
(0,0) = viewport center). Pointer-capture drag translates; a **4px drag threshold** distinguishes a pan
from a row-select/click; wheel zooms about the cursor; `fit()` recenters to 100%. Only the color scene
pans — its viewport is preserved across section switches (§2.1 LLD-C4); type/geom scenes are static and
start fit.

### 4.4 Section switch (LLD-C4) & pane collapse (LLD-C9)
Section switch = set `this.section` (+ viewport stash/restore + optional font inject) → `render()`.
Pane collapse = flip `panesLeft/Right` → `render()`; the `.editor` modifier class animates the track and
the toggle relocates (see §6).

---

## 5. Failure modes, edge & empty cases (per component)

| Case | Where | Handling |
|------|-------|----------|
| **No palette enabled / empty set** | LLD-C6, LLD-C8 | `projectView` yields an empty `view.palettes`; footer paints `0 palettes`; canvas renders an empty scene (no throw). Export of an all-disabled set yields tokens-only JSON with a `$note` (engine-side). |
| **Selected index out of range** | LLD-C5, LLD-C7 | `selectedIndex()` + `view.palettes[idx]` guarded; name falls back to `""`, cards render `—` empties (`an-empty`). |
| **`Story` tab absent** | LLD-C7 | `hasStory=false` → the tab is not pushed and a `segment==="story"` selection falls back to `palette` (`app.js:4279`). |
| **Both/Compare + live drag** | LLD-C6b, §4.2 | `liveRefresh` bails to a full `render()` — the two scheme columns can't be patched in place. |
| **Render mid-open-drawer** | LLD-C10, §4.1 | Fresh closed `<dialog>` each render; the open drawer is re-`showModal()`'d post-mount so it survives. |
| **Focus/caret during a drag** | LLD-C3, §4.2 | Partial `liveRefresh` never rebuilds the header or the active control; the doc-name `<input>` keeps focus + caret while typing (rename settles on `change`). |
| **Collapsed pane has no in-pane toggle** | LLD-C9 | The toggle is the *same* button rendered in two places by state: in the pane header while open, and popped to the canvas-header's edge once collapsed — so there is always an affordance to reopen. |
| **In Figma (no web-only APIs)** | LLD-C1, LLD-C3 | `this.inFigma` gates: gallery probes the Figma file once (`probeFigmaProject`); license activation is refused with a message ("available in the web app"); runtime Google-Fonts loading is disabled (base faces only). |
| **Typography font not bundled** | LLD-C4, LLD-C6b | Only 4 base faces are self-hosted; entering typography injects the rest from Google Fonts in the web app (`ensureTypeFonts`); if a face never loads the specimen falls back to a generic (`genericFor`), exports are unaffected. |
| **System scheme changes while `system` selected** | LLD-C1 | A `prefers-color-scheme` listener re-`render()`s when `theme` or `canvasTheme` is `system` (`app.js:614`). |

---

## 6. Wireframes — key states

**Section = Typography** (same frame; the three region *bodies* swap):
```
│ « Color ·[Typography]· Geometry »                                           │
├──────────────┬───────────────────────────────────────────┬────────────────┤
│ Type         │ TYPE CANVAS-HEADER                          │ Type Inspector │
│  scale card  │   .canvas-scene = the FULL specimen         │  (renderType-  │
│  tracking    │   (11 voices × steps, painted in the        │   Inspector)   │
│  leading     │    canvas preview scheme)                   │  + .seg-example│
│  font-roles  │                                             │                │
```

**Right pane collapsed** (`.editor.right-collapsed`, track → 0; the toggle pops to the canvas edge):
```
├──────────────┬──────────────────────────────────────────────────────────┬─┤
│ LEFT-PANE    │ CANVAS-HEADER … … … … … … … … … … … … … … … … … … …   ›│ │  ← reopen ›
│              │ canvas-area / scene                                       │0│
```

**Gallery** (`this.view==="gallery"`, `renderGallery` :1213 — the other top-level fork):
```
┌──────────────────────────────────────────────────────────────────────────┐
│ Ultimate Tokens                        [⤓ Project] [⤒ Import] [+ New]  ◐   │
├──────────────────────────────────────────────────────────────────────────┤
│  Your Palettes                         (search)                            │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐    .set-grid of saved-set tiles              │
│  └────┘ └────┘ └────┘ └────┘                                              │
│  Categories                                                                │
│  ┌────┐ ┌────┐ ┌────┐ …          category grid → renderCategoryBody()     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Build / extension order (as-built dependency sequence)

The shell mounts center-out; to extend it, follow the same order so each step is independently
verifiable against `npm test` (the headless-DOM shim, lettered groups):

1. **Frame** (LLD-C2) — the `.editor` grid + overlay siblings. Verify: grid areas resolve; overlays are
   closed `<dialog>`s.
2. **State axes** (§3.2) — add the ui-session field + its default in the constructor; it must be
   ephemeral (never written to `doc`).
3. **Header + switcher** (LLD-C3/LLD-C4) — if adding a *section*, extend `sectionSwitcher`'s list and
   `setSection`'s viewport/font handling.
4. **Panes** (LLD-C5/LLD-C6/LLD-C7) — add the `this.section` branch in each of `renderLeftPane`, `renderCenter`,
   `renderRightPane`; a new section needs all three or it renders a stale sibling.
5. **Paint-in-place hooks** (LLD-C6c/LLD-C8) — if the region shows live counts, wire it into `paintAppFooter` /
   `paintCanvasFooter` **and** the `liveRefresh` path, not just the full render.
6. **Shim assertions** — bump the lettered-group count literals in `test/ui/headless-boot.mjs` when a
   region/tab/step count changes; `querySelector` there takes a **single class only** and elements
   expose no `id`/`textContent` (match via `getAttribute`/`txtOf`).

**Anti-gold-plating:** every region above traces to a `SPEC-R#` (§0.1); a region with no such trace
does not belong in the shell.

---

## 8. Traceability

| Requirement (§0.1) | Shell component(s) |
|---------------------|--------------------|
| SPEC-R1 T1 manage-document (name/save) | LLD-C3 (doc-name), LLD-C8 (save state), LLD-C10 (settings) |
| SPEC-R2 T2 manage-palettes (add/enable) | LLD-C6b (ramp rows = navigator), LLD-C10 (New-palette) |
| SPEC-R3 T3 tune-palette | LLD-C7 Palette tab, LLD-C6b (live drag → §4.2) |
| SPEC-R4 T4 tune-global | LLD-C7 Global tab |
| SPEC-R5 T5 inspect-quality (L\*×C) | LLD-C5 analysis cards, LLD-C6c hover readout |
| SPEC-R6 T6 check-contrast | LLD-C5 contrast card, LLD-C8 contrast warning |
| SPEC-R7 T7 preview-theme (light↔dark) | LLD-C3 app `◐`, LLD-C6a canvas Mode (two toggles) |
| SPEC-R8 T8 export (5 formats) | LLD-C3 Export (primary) → LLD-C10 drawer |
| SPEC-R9 T9 browse-sets | LLD-C1 fork → gallery (`renderGallery`) |
| SPEC-R11/R10 RevA analysis rail | LLD-C5 |
| SPEC-R11/R10 RevA ramps-as-navigator | LLD-C6b |
| SPEC-R11/R10 RevA `[Palette│Global│Roles]` | LLD-C7 |
| brand-kit = 3 sections/one editor | LLD-C4 + the `this.section` branch in LLD-C5/LLD-C6/LLD-C7 |

---

*Kept in sync with `src/ui/app.js`: a change to the grid, a region's mount point, the render/liveRefresh
split, or a section/tab count invalidates this LLD and must update it in the same change (per the
context-is-memory rule). If a `UI:T*` requirement proves wrong, fix `ui-plan.md` first, then re-derive
here.*
