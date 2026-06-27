# Foundations — the workbench model the section pattern assumes

These are the load-bearing ideas. If a section feels hard to place, one of these is being fought.

## 1. A set is ONE document; the three systems compose

A brand kit's `doc` already carries `palettes[]` + `type` + `geometry`. They are **not three tools** —
they are three **sections of one document**, and they **compose**: Geometry's per-step text size (`font`)
comes from the Typography **UI** scale, joined in `model.mjs#geometryScale(doc)` (which calls
`geomScale(doc.geometry, { typeScale: typeScale(doc.type) })`). So a control's box (geometry) and the text
in it (typography) share one number. **Rendering a section in the brand's real color + font + mode is the
whole point** — it makes the composition visible, which a per-system modal hid. Home stays the **set/brand
gallery**; do not fragment into per-system hubs (Type/Geom have ~5 treatments each vs 336 color palettes).

## 2. The five regions (what goes where)

> **App Header** = *which* system + global actions. **Canvas Header** = *how to view* the active section.
> **Left pane** = understand (read-only analysis). **Center** = the full dataset (the shippable artifact).
> **Right pane** = control (the generative knobs + a live, brand-true example).

Misplacement is the most common defect: a writable knob in the left pane, a read-only stat in the right,
or a curated subset in the center. The center is the artifact a user ships — show **all** of it.

## 3. The data flow (doc → view → render)

`doc` is the parametric source of truth (serialized to localStorage / Figma pluginData via `persist.js`).
It is never the resolved colors — those are always re-derived:

- **Color**: `projectView(doc)` → `view.palettes[].ramp/roles/...`. The left analysis + the canvas read
  `view`; the section is **view-driven**.
- **Type / Geometry**: `typeScale(doc.type)` / `geometryScale(doc)` → the resolved scale. These sections are
  **doc-driven** (they take `view` for dispatch parity but mostly ignore it).

Editing: `this.commit(fn)` mutates `doc` + full `render()` (one undo step); `this.editDrag(fn)` coalesces a
slider drag into one undo step; `this.slider(...)` settles on release with a full render. A full `render()`
rebuilds the whole editor subtree from scratch every time — so there is no diffing to reason about; you
re-derive and re-emit. `_liveRefreshNow()` is the **color-only** fast path that swaps just the canvas
scene's children during a drag (it early-returns for Type/Geom, which refresh on the full render).

## 4. Rendering primitives

- `h(tag, attrs, ...kids)` — hyperscript; `attrs` may carry `class`, `style`, `onclick`, `html` (raw
  innerHTML for SVG strings), `data-fk` (a stable focus key so focus survives a re-render). Light DOM, no
  shadow root. There is no JSX and no template engine.
- Native `<dialog>` + `showModal()` for overlays. Because `render()` rebuilds a fresh, closed dialog each
  turn, an open dialog is re-promoted to the top layer by a `_sync<X>()` method called after every render
  (`_syncDrawer`, `_syncSettings`, …). A **section has no dialog** — that is the point of promoting a modal
  to a section; you delete the `_sync<X>`/`open`/`close` lifecycle entirely.
- `this.segmented(items, value, onSelect, opts)` — the tablist/group control used for every header
  segment and inspector tab. `opts.idPrefix` sets each button's id + `data-fk` (`<prefix>:<id>`).

## 5. The CSS shell

The editor is a CSS grid `.editor` with rows/areas: app-header · left-pane · center · right-pane ·
app-footer (collapsing a side pane sets its track to 0 via `left-collapsed`/`right-collapsed`). The center
is `.center` = canvas-header + `.canvas-area` (the viewport, `overflow:hidden` + `contain:paint`) +
canvas-footer. Inside the area, `.canvas-scene` is the absolutely-positioned, pan/zoomed layer
(`applyTransform` writes its `transform`). Sections reuse this shell verbatim — a new section adds render
methods, not new grid structure.

## 6. Scheme and mode

Sections paint in a **canvas preview scheme** (`canvas-scheme-light`/`-dark` sets `color-scheme`, so
`light-dark()` tokens + `var(--ink*)` resolve per the preview, independent of the app chrome). Color's
scheme is driven by its **Mode control** (`this.colorMode ∈ {light, dark, both}`); `both` is the Compare
view (two scheme-forced columns in one pannable scene). Typography/Geometry use `canvasThemeBtn`
(`this.canvasTheme`) until breakpoints give them real modes. `resolvedCanvasScheme()` is the single
resolver — it honors a transient `_schemeOverride` (a Compare column forces its own scheme while it builds).
