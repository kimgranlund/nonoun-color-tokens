// app.js — the DOM app for the HCT Palette Generator.
//
// One <ultimate-tokens> web component. The `document` (a palette SET) is the single
// source of truth; the whole right side is projectView(document), recomputed on
// every edit — NEVER stored. Palette SETS persist to localStorage; the gallery
// lists them. The six validated capability modules do all the color/token work
// (imported through model.mjs); this file only owns DOM + interaction.

import {
  defaultDocument,
  projectView,
  paletteKeyColors,
  tokenCount,
  slug,
  contrastRatio,
  appThemeCSS,
  hctToRgb,
  STOPS,
  figmaBundle,
  figmaCollectionNames,
  configFromVariables,
  seedFromKeyColor,
  hexToOklch,
  brandKit,
  exportDesignSystemTokens,
  exportDesignSystemSpine,
  exportDesignSystemBundle,
  exportDesignSystemStitchBundle,
  exportDesignSystemMakeBundle,
  SCRIM_BASES,
  SCRIM_STEPS,
} from "./model.mjs";
import { STORAGE_KEY, serialize, hydrate } from "./persist.js";
import { clampProfile, resolveFlags, flagOf as flagFromFlags, resolveTier, entitlementActive } from "../engine/flags.js";
import { FIGMA_PLUGIN } from "./figma-plugin-assets.js";
import { MCP_BRAND_KIT } from "./mcp-assets.js";
import { DESCRIBE_MCP_FILES, DESCRIBE_MCP_README, DESCRIBE_MCP_ENGINE_VERSION } from "./describe-mcp-assets.js";
import { TYPE_FONTS_CSS } from "./type-fonts.js";
import { CATEGORY_INDEX, loadCategory } from "./categories/index.js";
import { deriveNeutral, deriveRelative, RELATIONSHIPS } from "../engine/derive.mjs";
import { typeScale, typeTokensCSS, typeTokensBreakpointCSS, typeTokensDTCG, typeTokensFigmaModes, typeTokensFigmaPrimitives, TYPE_TREATMENTS, DEFAULT_TYPE, BUNDLED_FONTS, genericFor, siblingWeightDefaults, WEIGHT_NAMES, resolvedFontFor } from "../engine/type.mjs";
import { geomScale, geomTokensCSS, geomTokensBreakpointCSS, geomTokensDTCG, geomTokensFigma, geomTokensFigmaModes, GEOMETRY_TREATMENTS, DEFAULT_GEOMETRY } from "../engine/geometry.mjs";
import { zipStore } from "./zip.mjs";
import { modeApplyPlan, validateModeInterchange, mergeModeInterchanges, applyRenameMigrations } from "../../figma/binder/mode-apply-plan.mjs";
import { FIGMA_MIGRATIONS, kebabWaveVarRenames, kebabWaveColorRenames } from "../../figma/binder/migrations.mjs";
import { COLLECTIONS } from "../engine/collections.js";
import { stylePlans, primitivesApplyPlan } from "../../figma/binder/style-plan.mjs";
import { ICON_SYSTEMS, iconSystem, iconSystemById, iconSystemLabel } from "../engine/icon-systems.mjs";
import { icon } from "./icons.js";
import { CANVAS_INSET, MODE_WIDTH_PRESETS, PROJECT_KEY, PRO_EXPORT_FORMATS, SCHEME_ICON, SCHEME_NEXT, ago, btn, chip, defaultLicenseService, ensureAppTheme, ensureTypeFonts, field, fmt, h, hydrateStoredDoc, licenseInstanceName, loadProfile, loadSets, migrateStorageKeys, newSet, saveProfile, saveSets, setColorScheme, swatch } from "./app-helpers.mjs";
import { ColorSection } from "./sections/color.js";
import { TypeSection } from "./sections/typography.js";
import { GeomSection } from "./sections/geometry.js";
import { DrawerMixin } from "./overlays/drawer.js";
import { ApplyGateMixin } from "./overlays/apply-gate.js";
import { SettingsMixin } from "./overlays/settings.js";

class HctApp extends HTMLElement {
  connectedCallback() {
    ensureAppTheme(); // inject the generated --c-* design tokens once, globally
    migrateStorageKeys(); // copy any pre-rename saved sets/config into the new key namespace
    this.sets = loadSets();
    this.profile = loadProfile(); // per-machine { tier, flagOverrides, licenseKey?, instanceId?, entitlement?, checkedAt? } — drives this.flagOf()/this.tier() (item 7)
    // The pluggable license SEAM (item 7, Layer 2) — { activate, validate, deactivate }. Default = an offline
    // dev/QA service (no network). The WEB build reassigns this to a Lemon-Squeezy-backed service AFTER
    // construction; the offline Figma plugin keeps the default (the Account license UI is hidden there anyway).
    this._licenseService = defaultLicenseService;
    this._licenseDraft = ""; // the in-progress license-key text (Account section, web only)
    this._licenseError = null; // last inline license-entry error (a friendly string — never a raw stack)
    // session (UI-only, not persisted with the doc)
    this.view = "gallery"; // gallery | editor
    this.category = null; // open Category category slug within the gallery hub (null = hub). UI-session only.
    this._categoryData = {}; // slug → { VOLUMES, PRESETS } cache for lazily-loaded category modules
    this.inFigma = false; // set true by the Figma bridge (gen-ui.mjs) on figma-init → reveals "Add Variables → Figma"
    this._figmaFonts = null;          // Set of family names Figma can use (asked once, inFigma only)
    this._figmaFontsRequested = false;
    this.sweepResults = null;   // { texts:[{id,name}], paints:[{id,name}] } | null = not scanned yet
    this.sweepSelected = new Set(); // ids the user has checked for deletion
    this.sweepBusy = false;     // true while a scan or delete round-trip is in flight (Figma-only)
    this._faceCache = new Map();      // family → does it actually RENDER here (web probe, cleared on font change)
    this.liveVars = null; // { "{n}/{key}": hex } read from the file (read-only drift reference); null = not read
    this.liveVarsFound = false; // whether the file has a raw-colors collection (gates the gallery import row)
    this.fileConfig = null; // the LOSSLESS parametric config embedded in the Figma file (root pluginData), if any
    this._loadRequested = false; // true while an EXPLICIT load is in flight (so the gallery auto-probe doesn't auto-open)
    this._figmaProbed = false; // one-shot guard: probe the file's config + variables once when the gallery opens in Figma
    this.activeId = null;
    this.doc = null;
    this.savedSnapshot = null; // JSON string of last-saved doc -> dirty detection
    this.sel = { kind: "palette", id: 0 };
    this.segment = "palette"; // right-pane segmented control: palette | global | roles
    this.panesLeft = true; // left analysis rail shown (ui-session state, like segment — never persisted)
    this.panesRight = true; // right inspector shown
    this.canvasTheme = "system"; // canvas preview color-scheme: system (follow OS) | light | dark — INDEPENDENT of app chrome ◐
    this.colorMode = "system"; // Color section value-mode control: system (follow OS, until an explicit pick) | light | dark | both (Compare) — persisted (app prefs)
    this.canvasView = "palettes"; // canvas content: palettes (the ramps) | scrims | mapping (the role→raw table)
    this.section = "color"; // editor section: color | typography | geometry — ui-session, routes the whole editor (never persisted)
    this.typeSpecMode = "specimen"; // typography canvas: specimen (live faces) | tokens (editable token matrix: Base + breakpoints) — type-section sub-state
    this.typeMode = "base"; // active Typography breakpoint mode: "base" | a doc.type.modes[].id | "compare" (Phase 5/5.3) — ui-session
    this._typeModeOverride = null; // a Compare column forces its breakpoint mode ("base"|id) while its scene builds (mirrors _schemeOverride) — transient
    this.stopsMode = "core"; // palette ramp density: core (19 display stops) | extended (25 EXPORT_STOPS)
    this.mapTextMode = false; // Mapping table raw-token editor: false = select menu, true = free text input
    this.viewport = { panX: 0, panY: 0, zoom: 1 };
    this.theme = "system"; // app chrome color scheme: system (follows OS) | light | dark
    this.motion = "system"; // animation preference: system (respect prefers-reduced-motion) | reduced (always minimal) — app pref
    this._loadAppPrefs(); // persisted APP prefs (theme/canvasTheme/motion) — loaded before setColorScheme below
    this.exportOpen = false;
    this.exportTab = "css";
    // which token SYSTEMS the Download-All .zip + the Brand-Kit MCP bundle (export-time opt-in, all on
    // by default). Color = the palettes/roles + every colour format; Type/Geometry = their CSS + DTCG.
    this.exportSystems = { color: true, type: true, geometry: true, styles: true }; // styles = the Figma style swatches (opt-OUT)
    // New-Palette modal (a native <dialog>, like the export drawer). newPalCtx = Set of context
    // palette indices to derive from (initialized on open: all non-system palettes on).
    this.newPalOpen = false;
    this.newPalTab = "relative"; // relative | environmental | custom
    this.newPalRel = "extend"; // selected Relative relationship
    this.newPalCtx = null; // Set<number> of included palette indices
    this.newPalCustom = null; // { hue, chroma } for the Custom tab (seeded on open)
    this.newPalDrag = { x: 0, y: 0 }; // drag offset from the centered position (header-drag)
    // Apply-to-Figma consent gate (back up your variables first). Cookieable for normal apply; the
    // destructive Regroup always re-shows. See requestApplyToFigma / renderApplyGate.
    this.applyGateOpen = false;
    this.applyGateRebuild = false; // the pending action: false = apply, true = regroup
    this.applyGateDontShow = false; // the "don't show again" checkbox (transient, reset on open)
    // TKT-0004: persistent busy state for the SAME apply — true from the moment "apply" is posted
    // until apply-done/apply-error replies (see applyToFigma/onApplyDone/onApplyError). Drives the
    // .apply-busy host class (styles.css — an indeterminate, motion-safe indicator) AND disables the
    // Apply/Regroup trigger (drawer.js) so a slow apply can't be double-fired.
    this._applyBusy = false;
    this.settingsOpen = false; // the Settings page (token-mapping + app prefs)
    this.settingsSection = "mapping"; // which Settings nav item is active (left-nav page layout)
    this.geomSpecMode = "controls"; // geometry canvas: controls (live mock controls on the ramp) | tokens (editable token matrix: Base + breakpoints) — geom-section sub-state
    this.geomMode = "base"; // active Geometry breakpoint mode: "base" | a doc.geometry.modes[].id | "compare" (Phase 5/5.3) — ui-session
    this._geomModeOverride = null; // a Compare column forces its breakpoint mode ("base"|id) while its scene builds (mirrors _schemeOverride) — transient
    this.geomSegment = "ramp"; // right-pane Geometry inspector tab: ramp | radius | space (ui-session)
    this.geomSize = null; // the selected size in the ramp tab (null = none expanded) — drives per-size Height tuning (the geometry analog of typeVoice)
    this.typeSegment = "scale"; // right-pane Typography inspector tab: scale | fonts | specimen (ui-session)
    this.typeVoice = null; // the selected voice in the Scale tab (null = none expanded) — drives per-voice tuning
    this.examplesExpanded = false; // right-pane preview gallery: collapsed to the first artifact until expanded (ui-session)
    this.figmaFile = "light"; // which Figma mode file the Figma tab previews/downloads
    this.hover = null; // hovered swatch info for footers
    this.search = "";
    // ── undo / redo (whole-document snapshots) ───────────────────────────────
    // history/future hold serialized doc snapshots (the SAME bytes persist.js
    // stores). A COMMITTED edit pushes the PRE-edit doc onto history and clears
    // future; undo/redo move snapshots between the two stacks. Pan/zoom/segment/
    // selection/theme are UI-session — they never touch these stacks.
    this.history = []; // past states (most-recent last)
    this.future = []; // redo branch
    this._dragSnap = null; // pending pre-drag snapshot (a slider drag = ONE step)
    this._dragTimer = null; // debounce timer that commits a settled drag
    this.HISTORY_MAX = 100;
    setColorScheme(this.theme); // flip the chrome's light-dark() tokens to the initial theme
    this._installKeyboard(); // editor-scoped keyboard shortcuts (guarded vs text inputs)
    this._bindRangeDrag(); // delegated pointer-capture drag for EVERY range slider (the native drag is broken in Figma's iframe)
    // when the OS scheme flips while we follow it ("system"), re-render so the canvas preview's
    // computed light/dark hex tracks it live (the chrome's light-dark() tokens update on their own).
    if (typeof matchMedia !== "undefined") {
      this._mqlScheme = matchMedia("(prefers-color-scheme: dark)");
      this._onSchemeChange = () => { if (this.theme === "system" || this.canvasTheme === "system" || this.colorMode === "system") this.render(); };
      this._mqlScheme.addEventListener("change", this._onSchemeChange);
    }
    this.render();
  }


  disconnectedCallback() {
    if (this._onKeyDown) document.removeEventListener("keydown", this._onKeyDown);
    if (this._mqlScheme && this._onSchemeChange) this._mqlScheme.removeEventListener("change", this._onSchemeChange);
  }


  // ── doc lifecycle ──────────────────────────────────────────────────────────
  openSet(id) {
    const rec = this.sets.find((s) => s.id === id);
    if (!rec) return;
    this.activeId = id;
    this.doc = hydrateStoredDoc(rec.doc); // legacy stamp: a pre-hueSpace STORED set stays cam16
    this.doc.name = rec.name;
    this.savedSnapshot = JSON.stringify(serialize(this.doc));
    this.sel = { kind: "palette", id: Math.min(this.doc.selected || 0, this.doc.palettes.length - 1) };
    this.segment = "palette";
    this.exportOpen = false;
    this.history = []; // a fresh doc starts with an empty undo stack
    this.future = [];
    this._dragSnap = null;
    if (this._dragTimer) { clearTimeout(this._dragTimer); this._dragTimer = null; }
    this.fit();
    this.view = "editor";
    this.render();
  }


  isDirty() {
    return this.savedSnapshot !== JSON.stringify(serialize(this.doc));
  }


  save() {
    const rec = this.sets.find((s) => s.id === this.activeId);
    if (!rec) return;
    rec.doc = serialize(this.doc);
    rec.name = this.doc.name;
    rec.updated = Date.now();
    this.savedSnapshot = JSON.stringify(rec.doc);
    this.persistSets();
  }


  // mutate the document, autosave, and re-project. NOTE: this is the raw mutate
  // path; it does NOT snapshot history. Discrete edits go through commit() (one
  // undo step each); continuous slider drags go through editDrag() (the whole
  // drag coalesces into one step).
  //
  // opts.live: during a continuous drag we must NOT do a full render() — that
  // replaceChildren() would DESTROY the very <input type=range> the user is
  // dragging (and the palette-name <input> being typed into), killing the native
  // pointer drag / dropping focus mid-word. So a live edit updates ONLY the
  // live-preview surfaces in place (liveRefresh) and leaves the right pane (the
  // active control) untouched. The drag's settle ('change') does a full render().
  edit(fn, opts = {}) {
    fn(this.doc);
    this.doc.selected = this.sel.kind === "palette" ? this.sel.id : this.doc.selected;
    this.save();
    if (opts.live) this.liveRefresh();
    else this.render();
  }


  // liveRefresh — a PARTIAL, in-place update of just the live-preview surfaces,
  // used during a slider drag / name-input typing so the active control's DOM
  // node is never replaced. Re-projects the doc, then surgically updates:
  //   • the canvas SCENE ROWS — replace the children of the EXISTING .canvas-scene
  //     element (keep the element itself so its pan/zoom transform is preserved),
  //   • the LEFT analysis rail's graph cards in place (sliders live in the RIGHT
  //     pane, so rebuilding the left pane's graphs can't disturb the drag),
  //   • the canvas-footer + app-footer readouts.
  // The right pane (and the dragged <input>) is left entirely alone.
  liveRefresh() {
    // Coalesce to ONE rebuild per animation frame. A slider drag fires `oninput` many times
    // per frame; re-projecting the whole doc (CAM16 math for every palette) + rebuilding the
    // canvas scene on EVERY event janks the drag — mildly in a browser, badly in Figma's
    // throttled iframe (the reported "buggy when dragging"). The doc is already mutated
    // synchronously by edit(), and the slider readout updates synchronously in its oninput,
    // so deferring only the heavy VISUAL refresh keeps state + the number live while smoothing.
    if (this._liveRaf != null) return;
    this._liveRaf = requestAnimationFrame(() => {
      this._liveRaf = null;
      this._liveRefreshNow();
    });
  }


  _liveRefreshNow() {
    if (this.section !== "color") return; // type/geom have no live color-drag; their panes refresh on full render()
    if (this.colorMode === "both") { this.render(); return; } // Compare's two scheme columns rebuild on a full render
    const view = projectView(this.doc);
    this._view = view;

    // canvas scene rows — keep the .canvas-scene element (transform lives on it),
    // swap only its children so swatches reflect the new colors live.
    const scene = this.querySelector(".canvas-scene");
    if (scene) scene.replaceChildren(this._canvasScene(view));

    // canvas backdrop — lmin/lmax drive it, so repaint it as those sliders drag.
    const area = this.querySelector(".canvas-area");
    if (area) area.style.setProperty("--canvas-bg", this.canvasBg());

    // right-pane example card — repaint its role colors live (no inputs inside it,
    // so this never touches the dragged slider sitting in .seg-body above it).
    const ex = this.querySelector(".seg-example");
    if (ex) ex.replaceChildren(...this.exampleArtifacts(view));

    // damping-curve graph (Global tab) — redraw m(stop) live as Falloff/Amplify/Bias
    // drag; it's input-free, so refreshing it doesn't disturb the dragged slider.
    const dg = this.querySelector(".damp-graph");
    if (dg) dg.replaceChildren(this.graphDamping(this.doc));

    // left analysis rail — rebuild its graph cards in place (right-pane untouched).
    const leftBody = this.querySelector(".left-pane .an-body");
    if (leftBody) leftBody.replaceChildren(...this.analysisCards(view));
    // keep the "Analysis · <name>" header label in sync with the selection.
    const anSel = this.querySelector(".left-pane .an-sel");
    if (anSel) anSel.textContent = view.palettes[this.selectedIndex()]?.name || "";

    // footers — recompute the counts / warning readout in place.
    this.paintCanvasFooter();
    this.paintAppFooter(view);
  }


  // ── undo / redo ────────────────────────────────────────────────────────────
  // snapshot — the exact bytes persist.js stores (deep, plain, domain-clamped on
  // hydrate). Stacks hold these so undo/redo restore a WHOLE document.
  snapshot() {
    return JSON.stringify(serialize(this.doc));
  }


  // pushHistory — record the CURRENT (pre-mutation) doc as an undo point and
  // truncate the redo branch (editing after undo discards what was undone).
  // Bounded to HISTORY_MAX; the oldest entry is dropped past the cap.
  pushHistory() {
    this.history.push(this.snapshot());
    if (this.history.length > this.HISTORY_MAX) this.history.shift();
    this.future.length = 0; // a new committed edit kills the redo branch
  }


  // commit — a COMMITTED discrete edit = ONE undo step: snapshot the pre-edit
  // doc, then mutate/save/render. (add/delete/rename/enable/global/reorder.)
  commit(fn) {
    this.pushHistory();
    this.edit(fn);
  }


  // editDrag — a continuous control (slider) edit. The FIRST input of a drag
  // captures the pre-drag snapshot once; every input mutates live; a ~250ms
  // settle (release/pause) commits that single snapshot, so one drag = one step.
  editDrag(fn) {
    if (this._dragSnap == null) this._dragSnap = this.snapshot(); // pre-drag state, once
    this.edit(fn, { live: true }); // partial in-place update — never replace the active control
    if (this._dragTimer) clearTimeout(this._dragTimer);
    this._dragTimer = setTimeout(() => this.commitDrag(), 250);
  }


  // commitDrag — flush a settled drag's single pre-drag snapshot onto history.
  // Called by the debounce AND eagerly on slider 'change' (pointer release).
  commitDrag() {
    if (this._dragTimer) { clearTimeout(this._dragTimer); this._dragTimer = null; }
    if (this._dragSnap == null) return;
    this.history.push(this._dragSnap);
    if (this.history.length > this.HISTORY_MAX) this.history.shift();
    this.future.length = 0;
    this._dragSnap = null;
  }


  canUndo() { return this.history.length > 0; }

  canRedo() { return this.future.length > 0; }


  undo() {
    this.commitDrag(); // flush any in-flight drag so it's a distinct step first
    if (!this.history.length) return;
    this.future.push(this.snapshot()); // current state becomes a redo point
    this._restore(this.history.pop());
  }


  redo() {
    this.commitDrag();
    if (!this.future.length) return;
    this.history.push(this.snapshot()); // current state becomes an undo point
    this._restore(this.future.pop());
  }


  // _restore — load a snapshot as the live doc, re-project, re-persist, and keep
  // the selection in range. Goes through hydrate so every field is domain-clamped.
  // hydrate() drops `name` (not a domain field), so carry it from the snapshot.
  _restore(snap) {
    const raw = JSON.parse(snap);
    this.doc = hydrate(raw);
    this.doc.name = typeof raw.name === "string" ? raw.name : this.doc.name;
    const max = this.doc.palettes.length - 1;
    this.sel = { kind: "palette", id: Math.max(0, Math.min(this.sel.id, max)) };
    this.doc.selected = this.sel.id;
    this.save();
    this.render();
  }


  // ── keyboard shortcuts ───────────────────────────────────────────────────────
  // Installed once on the document. Undo/redo work editor-wide; the nav keys
  // (↑↓ 1/2/3 Esc f +/-) fire ONLY when the editor is shown and focus is NOT in a
  // text field (so typing a palette/set name is never hijacked). Pan/zoom/segment/
  // selection are UI-session — none of these keys snapshot history.
  _installKeyboard() {
    this._onKeyDown = (e) => this._handleKey(e);
    document.addEventListener("keydown", this._onKeyDown);
  }


  // _isTextTarget — true when focus is in a text input / textarea / contenteditable,
  // where the bare nav keys must yield to the field (only undo/redo still apply).
  _isTextTarget(t) {
    if (!t) return false;
    if (t.isContentEditable) return true;
    const tag = (t.tagName || "").toLowerCase();
    if (tag === "textarea") return true;
    if (tag === "select") return true;
    if (tag === "input") {
      const ty = (t.type || "text").toLowerCase();
      // range/checkbox/etc. are NOT text — but text/search/number/etc. ARE.
      return !["range", "checkbox", "radio", "button", "color", "submit"].includes(ty);
    }
    return false;
  }


  _handleKey(e) {
    if (this.view !== "editor") return;
    const meta = e.metaKey || e.ctrlKey;

    // Undo / redo — work regardless of focus (standard editor behavior).
    if (meta && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (meta && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      this.redo();
      return;
    }

    // Everything below is bare (no modifier) and must NOT fire while typing.
    if (meta || e.altKey) return;
    if (this._isTextTarget(e.target)) return;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        this._selectRelative(-1);
        return;
      case "ArrowDown":
        e.preventDefault();
        this._selectRelative(1);
        return;
      case "1":
        e.preventDefault();
        this.setSegment("palette");
        return;
      case "2":
        e.preventDefault();
        this.setSegment("global");
        return;
      case "3":
        e.preventDefault();
        this.setSegment("roles");
        return;
      case "[":
        e.preventDefault();
        this.toggleLeftPane();
        return;
      case "]":
        e.preventDefault();
        this.toggleRightPane();
        return;
      case "Escape":
        e.preventDefault();
        if (this.exportOpen) this.toggleDrawer(false);
        else this._deselect();
        return;
      case "f":
      case "F":
        e.preventDefault();
        this.fit();
        this.render();
        return;
      case "+":
      case "=": // unshifted '+' key
        e.preventDefault();
        this.zoomBy(1);
        return;
      case "-":
      case "_":
        e.preventDefault();
        this.zoomBy(-1);
        return;
    }
  }


  // _selectRelative — move the selection by ±1 with WRAP across all palettes.
  _selectRelative(dir) {
    const n = this.doc.palettes.length;
    if (n === 0) return;
    const cur = this.selectedIndex();
    const next = ((cur + dir) % n + n) % n; // wrap both directions
    this.selectPalette(next);
  }


  // _deselect — Esc with no drawer open: clear the right-pane/graph selection.
  // selectedIndex() clamps, so the panes fall back to palette 0; we mark the
  // session as having no explicit pick (kind:"none") so nothing renders 'sel'.
  _deselect() {
    this.sel = { kind: "none", id: this.sel.id };
    this.render();
  }


  fit() {
    // Reset to 100% with the content's TOP-LEFT corner inset (not dead-centered) — see
    // _fitTopLeftInset for the real computation, which needs the just-rendered scene's actual
    // size and so runs a frame later regardless of whether fit() lands before or after this
    // tick's render(). This placeholder keeps synchronous readers (e.g. the zoom readout) sane
    // in the interim.
    this.viewport = { panX: 0, panY: 0, zoom: 1 };
    requestAnimationFrame(() => this._fitTopLeftInset());
  }

  // _fitTopLeftInset — positions .canvas-scene's own top-left corner at a fixed CANVAS_INSET
  // offset from .canvas-area's top-left, replacing the naive dead-center default fit() used to
  // set. Derived from applyTransform's chain (translate(-50%,-50%) translate(pan) scale(zoom),
  // scene CSS-anchored at the area's own center via top/left:50%): at zoom 1 (fit's only zoom),
  // scale doesn't move anything, so panX = INSET - areaWidth/2 + sceneWidth/2 (same for Y) puts
  // the scene's local (0,0) at area's top-left + INSET. A no-op on the Tokens-table canvas
  // (.is-table forces transform:none — nothing to position) and harmless if the DOM isn't ready.
  _fitTopLeftInset() {
    const area = this.querySelector(".canvas-area");
    const scene = this.querySelector(".canvas-scene");
    if (!area || !scene) return;
    this.viewport.panX = CANVAS_INSET - area.clientWidth / 2 + scene.offsetWidth / 2;
    this.viewport.panY = CANVAS_INSET - area.clientHeight / 2 + scene.offsetHeight / 2;
    this.applyTransform();
  }


  // ── render dispatch ──────────────────────────────────────────────────────────
  render() {
    // DURABLE fix for the "replaceChildren nukes the focused control" class of bug
    // (it bit gallery-search, palette names, set name, and sliders). render() still
    // rebuilds the whole subtree, but we snapshot the focused control (by its stable
    // data-fk), its text caret, and every [data-scroll] region's offset BEFORE the
    // swap and put the user exactly back AFTER — so any fk-tagged input survives a
    // full render, not just the few with bespoke liveRefresh patches.
    const focus = this._captureFocus();
    this.replaceChildren(this.view === "gallery" ? this.renderGallery() : this.renderEditor());
    this.dataset.theme = this.theme;
    this.dataset.motion = this.motion; // styles.css gates transitions/animations on [data-motion]
    // TKT-0004: the Apply-to-Figma busy indicator — Figma-plugin-embed only (the web-app preview has
    // no Apply-to-Figma action, so this is never set there even if _applyBusy were somehow true).
    // ALSO stamped on the open export .drawer <dialog>: it's a native top-layer dialog (showModal()),
    // which paints above the host's own fixed-position ring regardless of z-index — the Apply/Regroup
    // triggers live inside it, so the drawer needs its OWN ring to stay visible while it's open
    // (styles.css's dialog.drawer.apply-busy::after). Harmless no-op while the drawer is closed
    // (querySelector finds nothing to mark).
    const applyBusyNow = !!(this.inFigma && this._applyBusy);
    this.classList.toggle("apply-busy", applyBusyNow);
    const drawerEl = this.querySelector(".drawer");
    if (drawerEl) drawerEl.classList.toggle("apply-busy", applyBusyNow);
    // The app-footer renders an empty shell with stable hooks; paint its dynamic
    // readouts now (the same path liveRefresh uses during a drag).
    if (this.view === "editor") this.paintAppFooter(this._view);
    this._restoreFocus(focus);
    this._syncDrawer(); // (re)open/close the native <dialog> to match exportOpen (top layer)
    this._syncNewPal(); // same, for the New-Palette modal
    this._syncApplyGate(); // same, for the Apply-to-Figma consent gate
    this._syncSettings(); // same, for the Settings modal
  }


  // _syncDrawer — reconcile the native export <dialog> with this.exportOpen AFTER each render.
  // render() rebuilds the whole subtree (a fresh, closed <dialog> each time), so an open drawer
  // must be re-promoted to the top layer via showModal(). Guarded so the headless DOM shim (no
  // showModal) and any unsupported host fall back to plain state (exportOpen) with no error.
  _syncDrawer() {
    const d = this.querySelector(".drawer");
    if (!d || typeof d.showModal !== "function") return;
    if (this.exportOpen && !d.open) { try { d.showModal(); } catch { /* not attached yet */ } }
    else if (!this.exportOpen && d.open) { try { d.close(); } catch { /* already closed */ } }
  }


  // _walkFind — first element in this subtree matching pred (works in the browser
  // AND the headless DOM shim; avoids attribute-selector support in querySelector).
  _walkFind(pred) {
    const walk = (n) => {
      for (const c of n.children || []) {
        if (c.dataset && pred(c)) return c;
        const f = walk(c);
        if (f) return f;
      }
      return null;
    };
    return walk(this);
  }


  // _captureFocus — snapshot the focused control (by data-fk), its caret, and the
  // scroll offsets of [data-scroll] regions, BEFORE a render swaps the DOM out.
  _captureFocus() {
    const snap = { fk: null, s: null, e: null, scroll: [] };
    const a = document.activeElement;
    if (a && a.dataset && a.dataset.fk) {
      snap.fk = a.dataset.fk;
      try { snap.s = a.selectionStart; snap.e = a.selectionEnd; } catch { /* range / non-text */ }
    }
    const walk = (n) => {
      for (const c of n.children || []) {
        if (c.dataset && c.dataset.scroll != null) snap.scroll.push([c.dataset.scroll, c.scrollTop || 0, c.scrollLeft || 0]);
        walk(c);
      }
    };
    walk(this);
    return snap;
  }


  // _restoreFocus — after the render, put scroll + focus + caret back where they were.
  _restoreFocus(snap) {
    for (const [key, top, left] of snap.scroll) {
      const el = this._walkFind((c) => c.dataset.scroll === key);
      if (el) { try { el.scrollTop = top; el.scrollLeft = left; } catch { /* detached */ } }
    }
    if (!snap.fk) return;
    const el = this._walkFind((c) => c.dataset.fk === snap.fk);
    if (el && el !== document.activeElement) {
      el.focus && el.focus();
      if (snap.s != null && el.setSelectionRange) {
        try { el.setSelectionRange(snap.s, snap.e); } catch { /* not a text field */ }
      }
    }
  }


  // ═══════════════════════════ GALLERY ═══════════════════════════
  // buildTiles — the filtered tile list for the current search query. Split out
  // so typing can refresh ONLY the grid container, never the <input> (which would
  // drop focus). Returns the array of tile/new-tile nodes.
  buildTiles() {
    const q = this.search.trim().toLowerCase();
    const visible = this.sets.filter((s) => !q || s.name.toLowerCase().includes(q));

    const tiles = visible.map((rec) => {
      // paletteKeyColors, NOT projectView — the tile only ever reads .key/.on below; projectView would
      // additionally compute the 25-stop ramp, the 53-role table, and all 7 export formats per palette,
      // for every saved set, on every render (this list re-renders on each search keystroke).
      const keyColors = paletteKeyColors(hydrateStoredDoc(rec.doc)); // legacy stamp: a pre-hueSpace STORED set renders as cam16
      const enabled = keyColors.filter((p) => p.on);
      const strip = h(
        "div",
        { class: "strip" },
        ...enabled.slice(0, 8).map((p) => h("i", { style: `background:${p.key}` })), // p.key = vivid identity color
      );
      // A card with a PRIMARY action (open) + a SECONDARY action (delete). The tile is a
      // role=button div — NOT a <button> — so the delete can be a real, keyboard-focusable
      // <button> without nesting interactives. Enter/Space on the tile opens it.
      const tile = h(
        "div",
        {
          class: "set-tile",
          role: "button",
          tabindex: "0",
          "aria-label": `Open palette set ${rec.name}`,
          onclick: () => this.openSet(rec.id),
          onkeydown: (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            this.openSet(rec.id);
          },
        },
        // tags ride the preview: count bottom-left, the updated-time bottom-right (the slot a preset
        // tile uses for its "preset" badge), and the delete button top-right (it keeps stopPropagation
        // so it deletes rather than opening the set). The meta row keeps the name.
        h(
          "div",
          { class: "set-thumb" },
          strip,
          h(
            "button",
            {
              type: "button",
              class: "del",
              title: "Delete set",
              "aria-label": `Delete palette set ${rec.name}`,
              onclick: (e) => {
                e.stopPropagation();
                this.deleteSet(rec.id);
              },
            },
            icon("trash", { size: 13 }),
          ),
          h("span", { class: "tile-tag tile-count" }, `${enabled.length} ${enabled.length === 1 ? "palette" : "palettes"}`),
          h("span", { class: "tile-tag tile-preset" }, ago(rec.updated)),
        ),
        h(
          "div",
          { class: "set-meta" },
          h("div", { class: "nm" }, rec.name),
        ),
      );
      return tile;
    });

    const newTile = h(
      "div",
      { class: "new-tile", onclick: () => this.createSet() },
      h("div", { class: "plus" }, icon("plus", { size: 22 })),
      h("div", {}, "New set"),
    );

    if (this.sets.length === 0)
      return [h("div", { class: "empty-note" }, "Create your first palette set")];
    if (tiles.length === 0 && this.search.trim())
      return [newTile, h("div", { class: "empty-note" }, `No sets match “${this.search.trim()}”`)];
    return [newTile, ...tiles];
  }


  // buildPresetTiles — the read-only palette shelf for ONE category category (its lazily-loaded
  // { VOLUMES, PRESETS }). Presets ship in code (generated from docs/reference/colors/categories/), never in
  // localStorage; clicking one OPENS AN EDITABLE COPY into the user's sets (openConfigAsSet hydrates +
  // appends + opens). Grouped by volume; filtered by the search box.
  buildPresetTiles(data) {
    if (!data) return [];
    const { VOLUMES, PRESETS } = data;
    const q = this.search.trim().toLowerCase();
    const visible = PRESETS.filter((p) => !q || p.name.toLowerCase().includes(q));
    // group by VOLUME (each category ships as 12 volumes of 4 palettes), in order.
    const byVol = new Map();
    for (const p of visible) { const v = p.vol || "—"; if (!byVol.has(v)) byVol.set(v, []); byVol.get(v).push(p); }
    if (byVol.size === 0) return [h("div", { class: "empty-note" }, `No palettes match “${this.search.trim()}”`)];
    return [...byVol.entries()].map(([vol, ps]) => {
      const vi = VOLUMES[vol];
      return h(
        "div",
        { class: "preset-vol" },
        h(
          "div",
          { class: "preset-vol-head" },
          h("span", { class: "preset-vol-num" }, "Vol " + vol),
          vi && vi.title ? h("span", { class: "preset-vol-title" }, vi.title) : false,
          vi && vi.intro ? h("p", { class: "preset-vol-intro" }, vi.intro) : false,
        ),
        h("div", { class: "set-grid preset-grid" }, ...ps.map((p) => this.presetTile(p))),
      );
    });
  }


  // presetTile — one read-only preset card. Clicking opens an editable copy into the user's sets.
  // The strip's per-swatch WIDTH tracks the preset's own authored dominant/supporting/accent hierarchy
  // (story.groups[].pct, via each palette's colorRole — TKT-0003) instead of a fixed template, so a
  // strip is evocative of ITS concept rather than generically neutral-heavy. Neutral (no colorRole)
  // keeps a small fixed backdrop share (8%); the groups' pcts are scaled to fill the remaining 92% and
  // split EQUALLY across however many enabled palettes share each colorRole (dominant:1, supporting:3,
  // accent:2 — split even when the strip shows only some of a group, e.g. accent's 2nd swatch is
  // sliced off below). A palette with no matching colorRole/group gets a small fallback share (5%),
  // never the old fixed template. Sets with no `story` (a user's own "Your Palettes" set) fall back to
  // the fixed SAMPLED_W template exactly as before — no regression there.
  presetTile(preset) {
    // paletteKeyColors, NOT projectView — this only ever reads .key/.name/.colorRole/.on below;
    // projectView would additionally compute the 25-stop ramp, the 53-role table, and all 7 export
    // formats per palette, for every one of a category's 48 presets, on every category open. Measured
    // ~200-300ms/preset via projectView vs. ~0.01ms/preset here.
    const enabled = paletteKeyColors(hydrate(preset)).filter((p) => p.on);
    const shown = enabled.slice(0, 6); // same 6 bands as before — neutral + primary/-muted + secondary/-muted + accent
    const SAMPLED_W = [36, 19, 19, 16, 6, 4];
    const groups = preset.story?.groups;
    let widths;
    if (Array.isArray(groups) && groups.length) {
      const NEUTRAL_PCT = 8, FALLBACK_PCT = 5;
      const HIER_OF_ROLE = { dominant: "d", supporting: "s", accent: "a" };
      const scaledByHier = {};
      for (const g of groups) scaledByHier[g.hier] = (g.pct || 0) * ((100 - NEUTRAL_PCT) / 100);
      // how many ENABLED palettes (not just the shown 6) share each colorRole — dominant:1, supporting:3,
      // accent:2 — so the authored share splits evenly across the real cohort even when one sibling
      // (accent-muted) doesn't make the sliced strip.
      const roleCounts = {};
      for (const p of enabled) if (p.colorRole) roleCounts[p.colorRole] = (roleCounts[p.colorRole] || 0) + 1;
      widths = shown.map((p) => {
        if (p.name === "neutral") return NEUTRAL_PCT;
        const hier = HIER_OF_ROLE[p.colorRole];
        const scaled = hier != null ? scaledByHier[hier] : undefined;
        if (scaled == null) return FALLBACK_PCT; // defensive: curated preset missing a colorRole tag
        return scaled / (roleCounts[p.colorRole] || 1);
      });
    } else {
      widths = shown.map((_, i) => SAMPLED_W[i] || 1); // no authored story — the original fixed template
    }
    const strip = h(
      "div",
      { class: "strip" },
      ...shown.map((p, i) => h("i", { style: `background:${p.key};flex:${widths[i]}` })),
    );
    return h(
      "button",
      { class: "set-tile preset", title: `Open a copy of “${preset.name}”`, onclick: () => this.openConfigAsSet(preset, `Opened “${preset.name}”`) },
      h(
        "div",
        { class: "set-thumb" },
        strip,
        h("span", { class: "tile-tag tile-preset" }, preset.story ? "story" : "preset"),
        h("span", { class: "tile-tag tile-count" }, `${enabled.length} palettes`),
      ),
      h("div", { class: "set-meta" }, h("div", { class: "nm" }, preset.name)),
    );
  }


  // refreshTiles — re-render ONLY the grid hosts' children. Used on search input so the <input>
  // element is never replaced and keeps focus + caret. On the hub, search filters Your Palettes; inside
  // a category category it filters that category's palette shelf (only one host exists per view).
  refreshTiles() {
    if (this._gridHost) this._gridHost.replaceChildren(...this.buildTiles());
    if (this._presetGridHost && this.category)
      this._presetGridHost.replaceChildren(...this.buildPresetTiles(this._categoryData[this.category]));
  }


  // openCategory / closeCategory — navigate the gallery hub. Opening a category lazily loads its module
  // (one code-split chunk; cached after first open) and re-renders into the category page; while the
  // chunk is in flight the page shows a "Loading…" note. closeCategory returns to the hub.
  openCategory(slug) {
    this.category = slug;
    this.search = "";
    if (this._categoryData[slug]) { this.render(); return Promise.resolve(this._categoryData[slug]); }
    this.render(); // loading state
    return loadCategory(slug)
      .then((m) => { if (m) this._categoryData[slug] = m; if (this.category === slug) this.render(); return m; })
      .catch(() => { if (this.category === slug) this.render(); return null; });
  }

  closeCategory() { this.category = null; this.search = ""; this.render(); }


  // categoryCard — one category tile on the hub: a color strip sampled from the category + its name,
  // eyebrow, tagline, and palette count. Clicking opens the category page.
  categoryCard(c) {
    return h(
      "button",
      { class: "category-card", title: `Open ${c.category}`, onclick: () => this.openCategory(c.slug) },
      h("div", { class: "category-strip" }, ...c.strip.map((hex) => h("i", { style: `background:${hex}` }))),
      h(
        "div",
        { class: "category-card-body" },
        c.eyebrow ? h("div", { class: "category-card-eyebrow" }, c.eyebrow) : false,
        h("div", { class: "category-card-title" }, c.category),
        c.tagline ? h("p", { class: "category-card-tagline" }, c.tagline) : false,
        h("span", { class: "category-card-count" }, `${c.count} palettes`),
      ),
    );
  }


  // ensureSearchInput — the search <input> is created ONCE and reused across renders so typing never
  // loses focus (the BUG: re-render replaced it). On input we only refresh tiles.
  ensureSearchInput(label) {
    if (!this._searchInput) {
      this._searchInput = h("input", {
        type: "search",
        "data-fk": "search",
        "aria-label": label,
        placeholder: "Search…",
        value: this.search,
        oninput: (e) => {
          this.search = e.target.value;
          this.refreshTiles(); // tiles only — input stays put, focus + caret preserved
        },
      });
    } else if (this._searchInput.value !== this.search) {
      this._searchInput.value = this.search; // reuse: sync value without touching node identity
    }
    this._searchInput.setAttribute("aria-label", label);
    return this._searchInput;
  }


  renderGallery() {
    // In Figma, probe the file ONCE on open: the embedded config (lossless) if present, else the
    // variable structure (lossy fallback). Both reads return async and re-render the gallery here.
    if (this.inFigma && !this._figmaProbed) this.probeFigmaProject();

    return h(
      "div",
      { class: "gallery" },
      this.toastEl || (this.toastEl = h("div", { class: "toast", role: "status", "aria-live": "polite" })),
      h(
        "header",
        { class: "gallery-header" },
        h("div", { class: "brand" }, "Ultimate Tokens"),
        h("div", { class: "spacer" }),
        btn([icon("download"), "Project"], { onclick: () => this.loadFromProject(), title: this.inFigma ? "Load the config saved in this Figma file" : "Load the config saved to the project (Source of Truth)" }),
        btn([icon("upload"), "Import"], { onclick: () => this.importSet(), title: "Import a palette config (.json) exported from Export → Config" }),
        btn("+ New", { onclick: () => this.createSet() }),
        this.themeBtn(),
      ),
      this.category ? this.renderCategoryBody() : this.renderHubBody(),
    );
  }


  // renderHubBody — the gallery home: a STICKY masthead (title + search · description) over the
  // scrolling content — Your Palettes (your saved sets) and the Categories category grid.
  renderHubBody() {
    this._presetGridHost = null;
    this._gridHost = h("div", { class: "set-grid" }, ...this.buildTiles());
    return h(
      "div",
      { class: "gallery-body" },
      // sticky masthead — title + search (row 1), description (row 2).
      h(
        "div",
        { class: "gallery-masthead" },
        h(
          "div",
          { class: "masthead-row" },
          h("h1", { class: "masthead-title" }, "Ultimate Tokens"),
          h("div", { class: "spacer" }),
          this.ensureSearchInput("Search your palette sets"),
        ),
        h("p", { class: "masthead-desc" }, "Generate perceptual color palettes and semantic design tokens. Build your own set, or open a curated color category as a starting point."),
      ),
      h(
        "div",
        { class: "gallery-content" },
        this.renderFigmaImportRow(), // a separate row ABOVE the sets when this Figma file already has palette variables
        h("div", { class: "gallery-title" }, h("h2", {}, "Your Palettes")),
        this._gridHost,
        // Color Categories — read-only curated categories. Opening a palette copies it into Your Palettes.
        h(
          "div",
          { class: "gallery-title categories-head" },
          h("h2", {}, "Color Categories"),
          h("span", { class: "title-count" }, String(CATEGORY_INDEX.length)),
        ),
        h("p", { class: "categories-lede" }, "Palettes sourced from real places, dishes, films, books, scenes, biomes — read for their colour, not their cliché. Open any palette as an editable copy."),
        h("div", { class: "category-grid" }, ...CATEGORY_INDEX.map((c) => this.categoryCard(c))),
      ),
    );
  }


  // renderCategoryBody — one category category page: a STICKY masthead (back-eyebrow + search · title ·
  // description) over the category's 12 volumes × 4 palettes (lazily loaded). The eyebrow row doubles
  // as the back affordance to the hub.
  renderCategoryBody() {
    this._gridHost = null;
    const card = CATEGORY_INDEX.find((c) => c.slug === this.category) || { category: this.category, count: 0 };
    const data = this._categoryData[this.category];
    this._presetGridHost = data
      ? h("div", { class: "preset-shelf" }, ...this.buildPresetTiles(data))
      : h("div", { class: "preset-shelf" }, h("div", { class: "empty-note" }, "Loading…"));
    return h(
      "div",
      { class: "gallery-body" },
      h(
        "div",
        { class: "gallery-masthead category" },
        h(
          "div",
          { class: "masthead-row" },
          // the eyebrow IS the back affordance: ‹ + the category eyebrow → return to the hub.
          h(
            "button",
            { class: "category-back-eyebrow", title: "Back to all color categories", "aria-label": "Back to all color categories", onclick: () => this.closeCategory() },
            icon("caret-left", { size: 13 }),
            h("span", {}, card.eyebrow || "All color categories"),
          ),
          h("div", { class: "spacer" }),
          this.ensureSearchInput(`Search ${card.category} palettes`),
        ),
        h("h1", { class: "masthead-title masthead-serif" }, card.category),
        card.tagline ? h("p", { class: "masthead-desc" }, card.tagline) : false,
      ),
      h(
        "div",
        { class: "gallery-content" },
        h(
          "div",
          { class: "gallery-title" },
          h("h2", {}, "Palettes"),
          h("span", { class: "title-count" }, String(card.count)),
        ),
        this._presetGridHost,
      ),
    );
  }


  // probeFigmaProject — one-shot read of the file on gallery open (Figma only): the embedded config
  // (load-config → config-loaded → applyLoadedConfig records this.fileConfig) AND the raw-colors
  // structure (read-variables → variables-read → receiveLiveVariables). Both replies re-render the
  // gallery, revealing the import row — preferring the lossless config, falling back to the variables.
  probeFigmaProject() {
    if (this._figmaProbed || !this.inFigma) return;
    this._figmaProbed = true;
    try {
      parent.postMessage({ pluginMessage: { type: "load-config" } }, "*");   // the exact saved config (preferred)
      parent.postMessage({ pluginMessage: { type: "read-variables" } }, "*"); // the variable structure (fallback)
      parent.postMessage({ pluginMessage: { type: "load-sets" } }, "*");      // the gallery's saved sets (clientStorage)
    } catch { /* no frame */ }
  }


  // tier() — the EFFECTIVE tier (item 7, Layer 2): "pro" only when the stored tier is pro AND backed by a
  // currently-active entitlement; else "free". resolveTier takes the clock here (the engine stays clockless).
  tier() {
    return resolveTier(this.profile, Date.now());
  }


  // flagOf(key) — the SINGLE gate check for a Pro/feature flag (item 7). Resolves from the EFFECTIVE tier
  // (tier(), entitlement-backed — not the raw stored tier) plus the dev overrides; returns a boolean or a
  // value (e.g. maxSets → 2|Infinity). Gated surfaces MUST read this, never `this.profile.tier === "pro"`.
  // Pre-launch it returns the unlocked values (TIERS_ENFORCED is false), so wiring a guard now is a safe
  // no-op until the product flips enforcement on.
  flagOf(key) {
    // resolveFlags resolves the effective tier from the entitlement itself; pass nowMs to enforce expiry.
    return flagFromFlags(resolveFlags(this.profile, { nowMs: Date.now() }), key);
  }


  // setProfile(patch) — merge + clamp + persist the profile (used by the license entry + the Settings
  // « Account » dev toggles). Re-renders so any flagOf-gated UI updates.
  setProfile(patch) {
    this.profile = clampProfile({ ...this.profile, ...patch });
    saveProfile(this.profile);
    this.render();
  }


  // enterLicense(key) — ACTIVATE a license key through the pluggable SEAM (this._licenseService.activate) and,
  // on a currently-active entitlement, flip the profile to Pro (cached on this machine) AND record the
  // activation instance id — the handle to this device's SEAT, released by clearLicense. The DEFAULT service
  // is offline (a dev/QA manual path); the WEB build assigns a Lemon-Squeezy-backed service that POSTs to the
  // public License API. activate CONSUMES a seat, so a Studio key with N seats rejects the (N+1)th device with
  // a friendly seat-limit message. That fetch is WEB-ONLY and deliberately NOT written into this file — so
  // app.js stays network-free inside the offline Figma plugin bundle (networkAccess:"none"). Any failure
  // becomes a friendly inline message (this._licenseError); the raw detail goes to console only.
  async enterLicense(key) {
    const k = String(key || "").trim();
    this._licenseDraft = k;
    if (this.inFigma) { this._licenseError = "License activation is available in the web app."; this.render(); return false; }
    if (!k) { this._licenseError = "Enter a license key."; this.render(); return false; }
    this._licenseError = null;
    let res;
    try {
      res = await this._licenseService.activate(k, licenseInstanceName());
    } catch (e) {
      if (typeof console !== "undefined" && console.error) console.error("license activation failed:", e);
      this._licenseError = "Couldn't reach the license service — check your connection and try again.";
      this.render();
      return false;
    }
    // activate may already have CONSUMED a seat (res.instanceId is its handle). On any post-activation bail,
    // release that seat — else it's stranded (consumed, never stored, never freeable → leaks on retry).
    const seatId = res && res.instanceId;
    if (!res || !res.ok || !res.entitlement) {
      if (seatId) this._releaseSeat(k, seatId);
      this._licenseError = (res && typeof res.error === "string" && res.error) || "That license key wasn't recognized.";
      this.render();
      return false;
    }
    if (!entitlementActive(res.entitlement, Date.now())) {
      if (seatId) this._releaseSeat(k, seatId);
      this._licenseError = "That license isn't active right now (it may have expired). Manage it from your account.";
      this.render();
      return false;
    }
    this._licenseError = null;
    this._licenseDraft = "";
    this.setProfile({ tier: "pro", licenseKey: k, instanceId: res.instanceId, seats: res.seats, entitlement: res.entitlement, checkedAt: Date.now() }); // re-renders
    this.toast("Pro unlocked");
    return true;
  }


  // _releaseSeat(licenseKey, instanceId) — best-effort, web-only, FIRE-AND-FORGET deactivation that frees the
  // activation seat for a teammate. Never throws, never blocks the UI; a failure (offline / hang) just leaves
  // the seat to lapse server-side. Used by clearLicense AND by enterLicense's bail (don't strand a seat).
  _releaseSeat(licenseKey, instanceId) {
    if (this.inFigma || !licenseKey || !instanceId || !this._licenseService || !this._licenseService.deactivate) return;
    const onErr = (e) => { if (typeof console !== "undefined" && console.error) console.error("license deactivation failed:", e); };
    try { Promise.resolve(this._licenseService.deactivate(licenseKey, instanceId)).catch(onErr); }
    catch (e) { onErr(e); }
  }


  // clearLicense() — drop the license + entitlement and return to Free (keeps any dev flagOverrides). Clears
  // LOCALLY FIRST (instant, never traps the user), THEN fires a best-effort deactivation to free this device's
  // seat for a teammate — fire-and-forget, so an offline/slow server can't block the Remove.
  clearLicense() {
    this._licenseError = null;
    this._licenseDraft = "";
    const licenseKey = this.profile && this.profile.licenseKey;
    const instanceId = this.profile && this.profile.instanceId;
    this.setProfile({ tier: "free", licenseKey: undefined, instanceId: undefined, seats: undefined, entitlement: undefined, checkedAt: undefined });
    this._releaseSeat(licenseKey, instanceId); // best-effort, after the local state is already Free
    this.toast("Switched to Free");
  }


  // revalidateLicense() — WEB-ONLY, best-effort, fired once on boot for an activated license. Re-checks the
  // key+instance against the service to (a) refresh the cached entitlement + live seat count and (b) downgrade
  // to Free if the license/seat was DEFINITIVELY revoked (cancelled subscription, removed seat). A network
  // error (throw) is IGNORED — never downgrade on a transient failure; the cached entitlement keeps gating
  // (main.ts's lsPost throws on 5xx so a server blip can't masquerade as a revocation). No-op in Figma / when
  // there's no pro license / with no validate method.
  async revalidateLicense() {
    if (this.inFigma) return;
    const p = this.profile || {};
    if (p.tier !== "pro" || !p.licenseKey || !this._licenseService || !this._licenseService.validate) return;
    let res;
    try {
      res = await this._licenseService.validate(p.licenseKey, p.instanceId);
    } catch (e) {
      if (typeof console !== "undefined" && console.error) console.error("license revalidation failed (kept cached):", e);
      return; // transient — do NOT downgrade
    }
    if (res && res.ok && res.entitlement && entitlementActive(res.entitlement, Date.now())) {
      this.setProfile({ entitlement: res.entitlement, seats: res.seats }); // refresh entitlement + live seat count
    } else if (res && res.revoked) {
      // ONLY a RECOGNIZED revocation downgrades (cancelled sub / removed seat / disabled key). An ambiguous
      // not-ok (unparseable body, rate-limit page, proxy) keeps the cached license — never strip a payer on a
      // transient blip. Free this device's seat too, so a real revocation doesn't orphan it.
      const licenseKey = this.profile && this.profile.licenseKey;
      const instanceId = this.profile && this.profile.instanceId;
      this.setProfile({ tier: "free", licenseKey: undefined, instanceId: undefined, seats: undefined, entitlement: undefined, checkedAt: undefined });
      this._releaseSeat(licenseKey, instanceId);
    }
    // else: ambiguous / transient not-ok → keep the cached license unchanged
  }


  // setFlagOverride(key, value) — write/clear a single dev flag override (Settings › Account toggles).
  // value === null clears the override (inherit the tier value); a boolean pins it. Persists via setProfile.
  setFlagOverride(key, value) {
    const next = { ...(this.profile.flagOverrides || {}) };
    if (value === null) delete next[key]; else next[key] = value;
    this.setProfile({ flagOverrides: next });
  }


  // persistSets — write the gallery's sets to durable storage. The browser uses localStorage; a Figma
  // plugin iframe can't (opaque origin), so it ALSO posts them to code.js → figma.clientStorage.
  persistSets() {
    saveSets(this.sets); // localStorage — best-effort; a no-op in the sandboxed Figma iframe
    if (this.inFigma) {
      try { parent.postMessage({ pluginMessage: { type: "save-sets", sets: this.sets } }, "*"); } catch { /* no frame */ }
    }
  }


  // receiveStoredSets — the reply to load-sets (Figma): the user's sets from figma.clientStorage.
  // Restore them into the gallery; on first run (none stored) persist the seeded Default so it
  // survives the next open. Ignored once the user has left the gallery (don't clobber a live edit).
  receiveStoredSets(sets) {
    if (this.view !== "gallery") return;
    if (Array.isArray(sets) && sets.length) this.sets = sets;
    else this.persistSets(); // first run for this user — persist the seeded Default to clientStorage
    this.render();
  }


  // renderFigmaImportRow — the "read a project" affordance ABOVE "Your Palettes" (Figma only).
  // Prefers the file's embedded config (an EXACT round-trip); falls back to seeding from the raw-colors
  // variables (APPROXIMATE — only each family's 500 hue+chroma, no skew/lift/curves).
  renderFigmaImportRow() {
    if (!this.inFigma) return false;
    if (this.fileConfig && Array.isArray(this.fileConfig.palettes) && this.fileConfig.palettes.length) {
      const np = this.fileConfig.palettes.length;
      return h(
        "div",
        { class: "figma-import-row" },
        h("span", { class: "fir-icon" }, "◆"),
        h(
          "div",
          { class: "fir-text" },
          h("strong", {}, "This file has a saved palette set"),
          h("span", { class: "fir-sub" }, `${np} ${np === 1 ? "palette" : "palettes"} with full controls — opens exactly as saved.`),
        ),
        h("div", { class: "spacer" }),
        btn("Open saved palette", { variant: "primary", onclick: () => this.openConfigAsSet(this.fileConfig, "Opened the saved palette") }),
      );
    }
    if (this.liveVarsFound) {
      const families = new Set();
      for (const name of Object.keys(this.liveVars || {})) {
        const i = name.indexOf("/");
        if (i > 0) families.add(name.slice(0, i));
      }
      const n = families.size;
      if (!n) return false;
      return h(
        "div",
        { class: "figma-import-row is-approx" },
        h("span", { class: "fir-icon" }, "◆"),
        h(
          "div",
          { class: "fir-text" },
          h("strong", {}, "This file has a color structure (no saved config)"),
          h("span", { class: "fir-sub" }, `${n} ${n === 1 ? "family" : "families"} — approximate read (each family's 500 hue + chroma). For an exact round-trip, re-apply from the editor to embed the full config.`),
        ),
        h("div", { class: "spacer" }),
        btn("Read approx →", { onclick: () => this.readFromFigmaVariables() }),
      );
    }
    return false;
  }


  // readFromFigmaVariables — seed a new set from the file's variables (the APPROXIMATE fallback when no
  // config is embedded). configFromVariables recovers each family's 500 hue+chroma; openConfigAsSet then
  // shape-clamps + opens it. The user refines the controls and re-applies (which embeds an exact config).
  readFromFigmaVariables() {
    const config = configFromVariables(this.liveVars);
    if (!config) { this.toast("No readable color families in this file"); return; }
    this.openConfigAsSet(config, "Read approximate palette from variables");
  }


  // _blockedBySetCap() — true when the plan's maxSets cap is reached; also notifies + routes a web user to
  // the Account upgrade surface. The cap is flagOf("maxSets") — Infinity while TIERS_ENFORCED is off, so this
  // is a NO-OP until go-live. Gates the user-initiated "new brand kit" actions (New / Import); a project or
  // Figma RESTORE (openConfigAsSet) is intentionally NOT capped — reloading your own work must never block.
  _blockedBySetCap() {
    const cap = this.flagOf("maxSets");
    if (!Number.isFinite(cap) || this.sets.length < cap) return false;
    this.toast(`Free is limited to ${cap} brand kit${cap === 1 ? "" : "s"} — upgrade to Pro for unlimited.`);
    if (!this.inFigma) { this.settingsSection = "account"; this.openSettings(); }
    return true;
  }


  // _proExportLocked(id) — true when an export format is Pro-gated AND the plan doesn't unlock it. A NO-OP
  // until go-live (flagOf("proExport") is true while TIERS_ENFORCED is off).
  _proExportLocked(id) {
    return PRO_EXPORT_FORMATS.has(id) && !this.flagOf("proExport");
  }


  // _proUpsell(message) — a small inline Pro upsell block (web routes to Settings « Account »; Figma, where
  // Pro lives in the web app, just notes it). Reused by the gated export preview + the gated treatments.
  _proUpsell(message) {
    return h("div", { class: "pro-upsell" },
      h("p", { class: "pro-upsell-msg" }, message),
      this.inFigma
        ? h("span", { class: "settings-meta" }, "Pro · in the web app")
        : btn("Get Pro →", { variant: "primary", cls: "pro-upsell-cta", onclick: () => { this.settingsSection = "account"; this.openSettings(); } }));
  }


  // _treatmentLocked(id, defaultId) — true when a NON-default treatment is Pro-gated and the plan doesn't
  // unlock it (advancedTreatments). Free keeps the default (Product type / Comfortable geometry). NO-OP until
  // go-live (flagOf("advancedTreatments") is unlocked while TIERS_ENFORCED is off).
  _treatmentLocked(id, defaultId) {
    return id !== defaultId && !this.flagOf("advancedTreatments");
  }


  // _treatmentBlocked(id, defaultId) — if picking `id` is Pro-gated, notify + route to Pro (web) + re-render
  // to REVERT the <select> back to the committed treatment, and return true so the caller skips the commit.
  _treatmentBlocked(id, defaultId) {
    if (!this._treatmentLocked(id, defaultId)) return false;
    this.toast("That treatment is a Pro feature — upgrade for the full set.");
    if (this.inFigma) this.render(); else { this.settingsSection = "account"; this.openSettings(); }
    return true;
  }


  _pickTypeTreatment(id) {
    if (this._treatmentBlocked(id, "product")) return;
    this.commit((d) => { d.type = { ...(d.type || DEFAULT_TYPE), treatment: id }; });
  }


  _pickGeomTreatment(id) {
    if (this._treatmentBlocked(id, "comfortable")) return;
    this.commit((d) => { d.geometry = { ...(d.geometry || DEFAULT_GEOMETRY), treatment: id, baseHeight: (GEOMETRY_TREATMENTS.find((x) => x.id === id) || GEOMETRY_TREATMENTS[0]).baseHeight }; });
  }


  createSet() {
    if (this._blockedBySetCap()) return;
    const name = "Set " + (this.sets.length + 1);
    const rec = newSet(name);
    this.sets.push(rec);
    this.persistSets();
    this.openSet(rec.id);
  }


  // importSet — load a palette config (.json from Export → Config) as a NEW set. The file
  // is UNTRUSTED data: JSON.parse (never eval), require a real palettes[] shape, then
  // hydrate() domain-clamps every field. A junk/empty file is rejected, not opened.
  importSet() {
    if (this._blockedBySetCap()) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let parsed = null;
        try { parsed = JSON.parse(String(reader.result)); } catch { parsed = null; }
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.palettes) || parsed.palettes.length === 0) {
          this.toast("Import failed — not a palette config (.json)");
          return;
        }
        const doc = hydrate(parsed); // clamps every field to its domain; ignores anything off-shape
        const name = (typeof parsed.name === "string" && parsed.name.trim()) || file.name.replace(/\.[^.]+$/, "") || "Imported";
        doc.name = name;
        const id = "set-" + Date.now().toString(36);
        this.sets.push({ id, name, doc: serialize(doc), updated: Date.now() });
        this.persistSets();
        this.openSet(id);
        this.toast("Imported " + name);
      };
      reader.readAsText(file);
    };
    input.click();
  }


  deleteSet(id) {
    this.sets = this.sets.filter((s) => s.id !== id);
    this.persistSets();
    this.render();
  }


  // ═══════════════════════════ EDITOR ═══════════════════════════
  renderEditor() {
    const view = projectView(this.doc);
    this._view = view;

    return h(
      "div",
      { class: "editor" + (this.panesLeft ? "" : " left-collapsed") + (this.panesRight ? "" : " right-collapsed") },
      this.renderAppHeader(),
      this.renderLeftPane(view),
      this.renderCenter(view),
      this.renderRightPane(view),
      this.renderAppFooter(),
      this.renderDrawer(view),
      this.renderNewPalette(view),
      this.renderApplyGate(),
      this.renderSettings(),
      this.toastEl || (this.toastEl = h("div", { class: "toast", role: "status", "aria-live": "polite" })),
    );
  }


  renderAppHeader() {
    return h(
      "header",
      { class: "app-header" },
      h(
        "div",
        {
          class: "brand brand-link",
          role: "button",
          tabindex: "0",
          title: "Back to gallery",
          onclick: () => this.toGallery(),
          onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.toGallery(); } },
        },
        "Ultimate Tokens",
      ),
      h("input", {
        class: "docname",
        "data-fk": "docname",
        type: "text",
        value: this.doc.name,
        title: "Set name",
        // rename coalesces into one undo step. editDrag does a PARTIAL liveRefresh
        // (the app-header is left untouched), so this <input> keeps focus + caret
        // while typing. blur/Enter ('change') settles the undo step and renders.
        oninput: (e) => this.editDrag((d) => (d.name = e.target.value)),
        onchange: () => {
          this.commitDrag();
          this.render();
        },
      }),
      h("div", { class: "spacer" }),
      // the persistent editor-section tablist « Color · Typography · Geometry », centered between
      // the doc name and the trailing action cluster (a .spacer on each side keeps it centered).
      this.sectionSwitcher(),
      h("div", { class: "spacer" }),
      // trailing strip: undo · redo · scheme · settings · new · export.
      btn(icon("arrow-counter-clockwise"), { cls: "undo-btn", title: "Undo (⌘Z)", ariaLabel: "Undo", disabled: !this.canUndo(), onclick: () => this.undo() }),
      btn(icon("arrow-clockwise"), { cls: "redo-btn", title: "Redo (⇧⌘Z)", ariaLabel: "Redo", disabled: !this.canRedo(), onclick: () => this.redo() }),
      this.themeBtn(),
      btn(icon("gear"), { cls: "settings-btn", title: "Settings — token mapping & preferences", ariaLabel: "Settings", onclick: () => this.openSettings() }),
      btn([icon("plus"), "New"], { onclick: () => this.createSet() }),
      btn([icon("export"), "Export"], { variant: "primary", cls: "export-open-btn", title: "Open export drawer", onclick: () => this.toggleDrawer(true) }),
    );
  }


  // sectionSwitcher — the persistent editor-section tablist « Color · Typography · Geometry ».
  // Routes the whole editor (each pane branches on this.section); reuses the one segmented control
  // (roving tabindex + Arrow keys baked in). A tablist matching the existing canvas-view switcher.
  sectionSwitcher() {
    return this.segmented(
      [
        { id: "color", label: "Color", title: "Color — palettes, scrims & semantic roles" },
        { id: "typography", label: "Typography", title: "Typography — type scale, treatments & the full specimen" },
        { id: "geometry", label: "Geometry", title: "Geometry — size ramp & dimensional tokens (preview)" },
      ],
      this.section,
      (id) => this.setSection(id),
      // a tablist (aria-selected), matching the existing canvas-view switcher; no aria-controls (the
      // section panels aren't formal tabpanels — claiming control of a role=group would be a contradiction).
      { cls: "section-seg", ariaLabel: "Editor section", idPrefix: "section" },
    );
  }


  // setSection — switch the active editor section. Color is byte-identical to today; the shared viewport
  // is the one crossover, so we STASH the color pan/zoom on leave and RESTORE it on return (the old modal
  // overlaid color without touching the viewport — this preserves that round-trip). Type/geom scenes
  // start centered (fit).
  setSection(id) {
    if (id === this.section) return;
    if (this.section === "color") this._colorViewport = this.viewport; // preserve the color pan/zoom
    this.section = id;
    if (id !== "color") this.fit(); // type/geom scenes don't pan/zoom — start centered
    else if (this._colorViewport) this.viewport = this._colorViewport; // restore color's transform on return
    if (id === "typography") ensureTypeFonts(); // lazily inject the Google Fonts, as the old modal did
    this.render();
  }


  // toggleLeftPane / toggleRightPane — collapse/expand a side pane (the .editor grid track → 0).
  // Ephemeral ui-session state (like segment); a full render re-applies the modifier class.
  toggleLeftPane() { this.panesLeft = !this.panesLeft; this.render(); }

  toggleRightPane() { this.panesRight = !this.panesRight; this.render(); }


  // paneToggle — the collapse/expand control for one side pane. The SAME button renders
  // in two places by state: while the pane is OPEN it lives in that pane's own header
  // (left → the Analysis label, right → the Inspector tab row); once COLLAPSED it pops to
  // the canvas-header (left → its left edge, right → its right edge) so there's always a
  // visible affordance to bring the pane back. `.on` + aria-pressed track "pane shown".
  paneToggle(side) {
    const left = side === "left";
    const shown = left ? this.panesLeft : this.panesRight;
    return h("button", {
      class: "ghost pane-toggle pane-toggle-" + side + (shown ? " on" : ""),
      "data-fk": "pane-" + side,
      title: (shown ? "Collapse" : "Show") + (left ? " the analysis pane ([)" : " the inspector pane (])"),
      "aria-label": (shown ? "Collapse" : "Show") + (left ? " left analysis pane" : " right inspector pane"),
      "aria-pressed": shown ? "true" : "false",
      onclick: () => (left ? this.toggleLeftPane() : this.toggleRightPane()),
    }, icon("sidebar", { cls: left ? "" : "flip-x" }));
  }


  toGallery() {
    this.view = "gallery";
    this.render();
  }


  // app-chrome color scheme — icon-only (sun/moon/auto), cycles system → light → dark.
  themeBtn() {
    return btn(icon(SCHEME_ICON[this.theme] || "theme"), {
      cls: "scheme-btn",
      title: "App theme: " + this.theme + " (UI only) — click to cycle system / light / dark",
      ariaLabel: "App theme: " + this.theme + " — cycle system / light / dark",
      onclick: () => {
        this.theme = SCHEME_NEXT[this.theme] || "system";
        this.dataset.theme = this.theme;
        // Flip the CHROME too: color-scheme on :root so every generated light-dark() --c-*
        // token resolves to the new mode ("system" → "light dark" → follows the OS).
        setColorScheme(this.theme);
        this._saveAppPrefs(); // the header cycle is the same pref as Settings › Appearance
        this.render();
      },
    });
  }


  // canvas-preview color scheme — icon-only (sun/moon/auto), cycles system → light → dark.
  // "system" follows the OS; INDEPENDENT of the app-chrome theme.
  canvasThemeBtn() {
    return btn(icon(SCHEME_ICON[this.canvasTheme] || "theme"), {
      cls: "scheme-btn",
      title: "Canvas preview scheme: " + this.canvasTheme + " — click to cycle system / light / dark",
      ariaLabel: "Canvas preview scheme: " + this.canvasTheme + " — cycle system / light / dark",
      onclick: () => {
        this.canvasTheme = SCHEME_NEXT[this.canvasTheme] || "system";
        this._saveAppPrefs(); // the header cycle is the same pref as Settings › Appearance
        this.render();
      },
    });
  }


  // resolvedCanvasScheme — the concrete light/dark the canvas paints in: "system" maps to the OS
  // preference (prefers-color-scheme), everything else is itself.
  resolvedCanvasScheme() {
    if (this._schemeOverride) return this._schemeOverride; // a Compare column forces its own scheme while it builds
    const osScheme = () => (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    // the Color section's scheme is driven by its Mode control (system/light/dark); "both" renders Compare, and
    // any non-column use (e.g. the right-pane example) falls back to a concrete scheme below.
    if (this.section === "color" && (this.colorMode === "light" || this.colorMode === "dark")) return this.colorMode;
    if (this.section === "color" && this.colorMode === "system") return osScheme();
    if (this.section === "color" && this.colorMode === "both") return "light"; // a sensible single-scheme fallback off-canvas
    if (this.canvasTheme === "system") return osScheme();
    return this.canvasTheme;
  }


  // ── left pane (ANALYSIS rail) ─────────────────────────────────────────────────
  // Stacked, scrollable analysis graphs for the SELECTED palette + (hue wheel) the
  // whole enabled set. Every datum comes from projectView(doc) — never stored.
  renderLeftPane(view) {
    const idx = this.selectedIndex();
    const vp = view.palettes[idx];
    const name = vp ? vp.name : "";
    // section routing — Color shows palette analysis; Typography its scale diagnostics; Geometry a stub.
    const isColor = this.section === "color";
    const label = isColor ? "Analysis" : this.section === "typography" ? "Type" : "Geometry";
    const body =
      this.section === "color" ? this.analysisCards(view)
      : this.section === "typography" ? this.typeAnalysisCards(view)
      : this.geomAnalysisCards(view);
    return h(
      "aside",
      { class: "left-pane" },
      h("div", { class: "pane-label" }, label, isColor ? h("span", { class: "an-sel" }, name) : false,
        // while OPEN the left toggle hugs this header's inner (canvas-side) edge; once
        // collapsed it is rendered in the canvas-header instead (see renderCanvasHeader).
        this.panesLeft ? this.paneToggle("left") : false),
      // .an-body wraps just the graph cards so liveRefresh can rebuild them in
      // place (replaceChildren) without touching the pane label or the pane shell.
      h("div", { class: "an-body" }, ...body),
    );
  }


  // legend — a small key under a multi-series graph (chips match the SVG strokes:
  // `solid` = applied/accent line, `faint` = a dashed reference line, `fill` = the
  // gamut-ceiling area). Without it the overlaid lines are ambiguous.
  legend(items) {
    return h(
      "div",
      { class: "an-legend" },
      ...items.map((it) =>
        h("span", { class: "an-leg" }, h("span", { class: "an-leg-mark " + it.mark }), it.label),
      ),
    );
  }


  // selectedIndex — the index of the palette driving the right pane + graphs,
  // clamped into range.
  selectedIndex() {
    const n = this.doc.palettes.length;
    let i = this.sel.kind === "palette" ? this.sel.id : this.doc.selected || 0;
    return Math.max(0, Math.min(i, n - 1));
  }


  // segmented — the one segmented control for the whole app: a row of buttons where
  // exactly one is active. Bakes in the APG keyboard model the hand-rolled variants
  // were missing — roving tabindex (only the active button is tab-focusable) + Arrow
  // keys that move selection AND focus. role:"tablist" (tabs that switch a view —
  // buttons get role=tab + aria-selected + aria-controls) or role:"group" (a
  // single-select button group — buttons get aria-pressed). onSelect re-renders; we
  // then re-focus the newly-active button by its stable id, because the fk-restore
  // path (see _restoreFocus) would otherwise return focus to the OLD button.
  segmented(items, value, onSelect, opts = {}) {
    const { baseClass = "segmented", cls = "", ariaLabel, role = "tablist", controls, idPrefix = "seg" } = opts;
    const tabs = role === "tablist";
    const ids = items.map((it) => it.id);
    const bid = (id) => idPrefix + "-" + id;
    const mk = (it) => {
      const on = it.id === value;
      return h(
        "button",
        {
          type: "button",
          class: on ? "on" : "",
          id: bid(it.id),
          "data-fk": idPrefix + ":" + it.id,
          role: tabs ? "tab" : undefined,
          "aria-selected": tabs ? (on ? "true" : "false") : undefined,
          "aria-pressed": tabs ? undefined : on ? "true" : "false",
          "aria-controls": tabs ? controls : undefined,
          tabindex: on ? "0" : "-1",
          title: it.title,
          onclick: () => onSelect(it.id),
          onkeydown: (e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            const cur = ids.indexOf(value);
            const next = ids[(cur + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
            onSelect(next); // re-renders
            const el = this.querySelector("#" + bid(next));
            if (el && el.focus) el.focus();
          },
        },
        it.label,
      );
    };
    return h(
      "div",
      { class: (baseClass + " " + cls).trim(), role, "aria-label": ariaLabel },
      ...items.map(mk),
    );
  }


  // ── center column ────────────────────────────────────────────────────────────
  renderCenter(view) {
    // section routing — each section owns its center (header + canvas); color is unchanged.
    if (this.section === "typography") {
      return h("div", { class: "center" },
        this.renderTypeCanvasHeader(),
        this.renderTypeCanvas(view),
        this.renderCanvasFooter());
    }
    if (this.section === "geometry") {
      return h("div", { class: "center" },
        this.renderGeomCanvasHeader(),
        this.renderGeomCanvas(view),
        this.renderCanvasFooter());
    }
    return h(
      "div",
      { class: "center" },
      this.renderCanvasHeader(),
      this.renderCanvasArea(view),
      this.renderCanvasFooter(),
    );
  }


  // zoomAround — set the zoom to z1, keeping the content point under (cx, cy)
  // FIXED, where (cx, cy) is a pixel offset from the viewport centre. The scene's
  // CSS transform is `translate(-50%,-50%) translate(pan) scale(zoom)`, so a scene
  // point p maps to screen = zoom*p + pan - half-the-(unscaled)-scene. That
  // half-size term (scene.offsetWidth/2, ignored by transforms) is exactly what the
  // old wheel math dropped — so zoom drifted toward the content's centre, not the
  // cursor. Re-including it makes both the wheel (cursor) and the +/- buttons
  // (centre, cx=cy=0) zoom about the right point.
  zoomAround(z1, cx = 0, cy = 0) {
    z1 = Math.min(4, Math.max(0.25, z1));
    const scene = this.querySelector(".canvas-scene");
    const k = z1 / this.viewport.zoom;
    const ax = cx + (scene ? scene.offsetWidth : 0) / 2;
    const ay = cy + (scene ? scene.offsetHeight : 0) / 2;
    this.viewport.panX = ax - (ax - this.viewport.panX) * k;
    this.viewport.panY = ay - (ay - this.viewport.panY) * k;
    this.viewport.zoom = z1;
    this.applyTransform();
  }


  zoomBy(dir) {
    // keyboard / button zoom: about the viewport centre (cx = cy = 0).
    this.zoomAround(this.viewport.zoom * (dir > 0 ? 1.15 : 1 / 1.15));
  }


  // applyTransform — push the live viewport (panX, panY, zoom) onto the inner
  // content layer as a single CSS transform. The scene is CSS-anchored at the
  // viewport center (top/left 50%); we translate by pan + half its own size so
  // origin (0,0) is the viewport center, then scale. Also refreshes the readout.
  applyTransform() {
    const scene = this.querySelector(".canvas-scene");
    if (scene) {
      const { panX, panY, zoom } = this.viewport;
      scene.style.transform = `translate(-50%, -50%) translate(${panX}px, ${panY}px) scale(${zoom})`;
    }
    const r = this.querySelector(".zoom-readout");
    if (r) r.textContent = Math.round(this.viewport.zoom * 100) + "%";
    this.paintCanvasFooter();
  }


  // canvasBg — the canvas backdrop. When a palette is EXPLICITLY selected it's that palette's
  // NEAR-EDGE color: its 125 stop in light preview, its 875 stop in dark (a faintly-hued near-edge
  // tone, so the backdrop carries a touch of the palette's own hue rather than washing to pure
  // white/black). Read from fullRamp — 125/875 are EXPORT-only half-steps, absent from the 19-stop
  // display `ramp`. Follows selection (selectPalette → render) and lmin/lmax. With NO explicit
  // selection (Esc, or a click on empty canvas → _deselect), it reverts to the DEFAULT neutral gray.
  canvasBg() {
    const v = this._view || projectView(this.doc);
    const pal = this.sel.kind === "palette" && v && v.palettes[this.selectedIndex()];
    const ramp = pal && (pal.fullRamp || pal.ramp);
    const stop = ramp && ramp.find((s) => s.stop === (this.resolvedCanvasScheme() === "dark" ? 875 : 125));
    if (stop) return stop.hex;
    const L = this.resolvedCanvasScheme() === "dark" ? (this.doc.lmin ?? 5) : (this.doc.lmax ?? 100);
    const g = hctToRgb(0, 0, L).rgb[0].toString(16).padStart(2, "0").toUpperCase();
    return "#" + g + g + g;
  }


  // containerBg — a palette ROW container is tinted with that palette's OWN faintly-hued tone, so
  // each card carries a wash of its palette. It tracks the CANVAS preview scheme (75 in light, 925
  // in dark — symmetric, mirroring canvasBg's 125/875): the row's name text is var(--ink), which
  // resolves per the canvas-area's color-scheme (= canvasTheme), so a fixed light 75 in dark preview
  // would land light text on a light card. Read from fullRamp — 75/925 are EXPORT-only half-steps,
  // absent from the 19-stop display ramp. Returns "" if absent, so the theme-aware CSS default holds.
  containerBg(vp) {
    const ramp = vp && (vp.fullRamp || vp.ramp);
    if (!ramp) return "";
    const s = ramp.find((x) => x.stop === (this.resolvedCanvasScheme() === "dark" ? 925 : 75));
    return s ? s.hex : "";
  }

  // the Scale-tab editor block: a hint when on Base, or rename + delete for the active breakpoint mode.
  // _modeWidthPresets — the common-breakpoint quick-picks under the min-width field (Phase 2). Each chip
  // sets the active mode's minWidth through the SAME setter as the number field; the matching one is active.
  _modeWidthPresets(active, onpick) {
    const a = Number(active) || 0;
    return h(
      "div",
      { class: "mode-presets", role: "group", "aria-label": "Common breakpoint widths" },
      ...MODE_WIDTH_PRESETS.map((w) =>
        chip(String(w), { mode: "interactive", on: a === w, cls: "mode-preset", title: `Set the breakpoint to ${w}px`, onclick: () => onpick(w) })),
    );
  }


  // _tokensTableArea — the scrolling .is-table canvas shell (no pan/zoom) that hosts a tokens MATRIX,
  // mirroring how renderCanvasArea wraps the Mapping table. One place for both Type + Geom tables.
  _tokensTableArea(label, table) {
    return h(
      "div",
      {
        class: "canvas-area canvas-scheme-" + this.resolvedCanvasScheme() + " is-table",
        role: "group",
        "aria-label": label,
        style: "--canvas-bg:" + this.canvasBg(), // match the Mapping table ground (renderCanvasArea sets the same)
      },
      h("div", { class: "canvas-scene" }, table),
    );
  }


  // ── Tokens-matrix per-cell overrides (Phase 3) — the size (type) / height (geom) lever. CENTRALIZED here
  // so every scale materialization (matrix · specimen/controls · exports) reads the SAME overrides. Storage:
  //   doc.type.tokenOverrides     = { "<voice>|<step>|<modeKey>": <sizePx> }
  //   doc.geometry.tokenOverrides = { "<size>|<modeKey>": <heightPx> }
  // modeKey = "base" or a breakpoint mode's id; "|" never appears in a voice/step/size name. ──

  // _modeTierNudge(modeFactor) — per-cell overrides for the canonical breakpoint tiers, from the ratified
  // magnitude table (2026-07-16, at request — supersedes 2026-07-13's Body Mobile nudge: Body is now FROZEN
  // across Desktop/Tablet/Mobile like the rest of the body class). The general hierarchy-aware law freezes
  // everything at-or-below bodyBase, so it can't step the LABEL family down on the small tiers (or land the
  // Label/Tiny cells on the table's off-ladder values on the large ones) on its own; targeted per-cell
  // overrides (the EXISTING size-override mechanism) carry the table's cells. Keyed on the FACTOR itself
  // (not a mode's name/id), so it applies consistently whether a tier is the synthesized (no-modes) shape
  // or the materialized Standard set (addStandardTypeModes). The SINGLE source for both call sites
  // (_typeScaleFor / _typeModeScales), so they can never independently drift.
  _modeTierNudge(modeFactor) {
    const near = (x) => Math.abs((modeFactor || 1) - x) < 1e-9;
    const fam = (voices, sizes) => Object.fromEntries(voices.flatMap((v) => ["SM", "MD", "LG"].map((s, i) => [`${v}|${s}`, sizes[i]])));
    const fam6 = (voices, sizes) => Object.fromEntries(voices.flatMap((v) => ["XS", "SM", "MD", "LG", "XL", "2XL"].map((s, i) => [`${v}|${s}`, sizes[i]])));
    const LABELS = ["Label", "Label-mono", "Kicker"]; // Label-mono + Kicker peg to Label's sizes by design
    // UI-control/UI-widget (TKT-0008, extended to the full XS..2XL ramp 2026-07-16): every non-Desktop
    // tier carries the ratified tables' full hand columns — the freeze law can't hold XL/2XL (they sit
    // above bodyBase, so Tablet/Mobile would compress them) and the nice-ladder re-rounds the Lg/Xl
    // scaled odd values, so hand cells are the deterministic path for all four tiers.
    if (near(5 / 6)) return { ...fam(LABELS, [11, 12, 13]), ...fam6(["UI-control"], [12, 13, 15, 16, 18, 20]), ...fam6(["UI-widget"], [9, 10, 11, 12, 13, 14]) }; // Tablet (UI voices frozen at Desktop)
    if (near(2 / 3)) return { ...fam(LABELS, [10, 11, 12]), ...fam6(["UI-control"], [12, 13, 15, 16, 18, 20]), ...fam6(["UI-widget"], [9, 10, 11, 12, 13, 14]) }; // Mobile (UI voices frozen at Desktop)
    if (near(0.89)) return { ...fam(LABELS, [13, 14, 15]), ...fam6(["UI-control"], [14, 15, 17, 18, 20, 22]), ...fam6(["UI-widget"], [11, 12, 13, 14, 15, 16]) }; // Desktop Lg
    if (near(0.80)) return { ...fam(LABELS, [16, 17, 18]), ...fam(["Tiny", "Tiny-mono"], [12, 13, 14]), ...fam6(["UI-control"], [16, 17, 18, 20, 22, 24]), ...fam6(["UI-widget"], [13, 14, 15, 16, 17, 18]) }; // Desktop Xl
    return null;
  }



  // wirePanZoom — pointer-based pan/zoom on the canvas inner content layer.
  // origin (0,0) is the CENTER of the viewport (the .canvas-scene is anchored at
  // 50%/50% in CSS); panX/panY translate from there. A movement threshold keeps a
  // pan-drag from registering as a swatch-row click.
  wirePanZoom(area) {
    const st = { down: false, panning: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0, btn: 0 };
    const THRESH = 4; // px before a press becomes a pan (not a click)

    area.addEventListener("pointerdown", (e) => {
      // pan on shift-drag OR middle-button drag; plain primary press is a click.
      const wantsPan = e.shiftKey || e.button === 1;
      st.down = true;
      st.moved = false;
      st.panning = wantsPan;
      st.btn = e.button;
      st.sx = e.clientX;
      st.sy = e.clientY;
      st.ox = this.viewport.panX;
      st.oy = this.viewport.panY;
      if (wantsPan) {
        area.classList.add("panning");
        area.setPointerCapture && area.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    });

    area.addEventListener("pointermove", (e) => {
      // footer x/y readout (relative to viewport center).
      const r = area.getBoundingClientRect();
      this._xy = {
        x: Math.round(e.clientX - r.left - r.width / 2),
        y: Math.round(e.clientY - r.top - r.height / 2),
      };
      if (st.down) {
        const dx = e.clientX - st.sx;
        const dy = e.clientY - st.sy;
        if (!st.moved && Math.hypot(dx, dy) > THRESH) {
          st.moved = true;
          // a primary-button drag with no modifier becomes a pan once it crosses
          // the threshold, so dragging the canvas always pans.
          if (!st.panning) {
            st.panning = true;
            area.classList.add("panning");
            area.setPointerCapture && area.setPointerCapture(e.pointerId);
          }
        }
        if (st.panning) {
          this.viewport.panX = st.ox + dx;
          this.viewport.panY = st.oy + dy;
          this.applyTransform();
          e.preventDefault();
        }
      }
      this.paintCanvasFooter();
    });

    const end = (e) => {
      if (st.panning) {
        area.classList.remove("panning");
        area.releasePointerCapture && e && e.pointerId != null && area.releasePointerCapture(e.pointerId);
      }
      // expose for the swatch-row click guard: did this gesture move?
      this._didDrag = st.moved && st.panning;
      st.down = false;
      st.panning = false;
    };
    area.addEventListener("pointerup", end);
    area.addEventListener("pointercancel", end);

    area.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        // zoom about the cursor: keep the content point under the pointer fixed.
        const r = area.getBoundingClientRect();
        const px = e.clientX - r.left - r.width / 2; // cursor relative to centre
        const py = e.clientY - r.top - r.height / 2;
        this.zoomAround(this.viewport.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), px, py);
      },
      { passive: false },
    );

    // double-click anywhere on the canvas = reset the view to origin @ 100%.
    area.addEventListener("dblclick", (e) => {
      e.preventDefault();
      this.fit();
      this.applyTransform();
    });

    // a plain click on EMPTY canvas clears the selection → canvasBg reverts to the default
    // neutral backdrop. A click inside a ramp-row is a SELECT (handled by the row's own onclick,
    // which runs first); a pan-drag is not a click. We walk parentNode (not .closest) so this
    // also holds under the headless DOM shim.
    area.addEventListener("click", (e) => {
      if (this._didDrag) { this._didDrag = false; return; } // a pan, not a click
      for (let n = e.target; n && n !== area; n = n.parentNode)
        if (n.classList && n.classList.contains("ramp-row")) return; // a row handled the selection
      if (this.sel.kind === "palette") this._deselect();
    });
  }


  renderCanvasFooter() {
    return h("div", { class: "canvas-footer" }, h("span", { class: "cf-body" }, "drag to pan · wheel to zoom · double-click to reset"));
  }


  paintCanvasFooter() {
    const el = this.querySelector(".canvas-footer .cf-body");
    if (!el) return;
    const xy = this._xy || { x: 0, y: 0 };
    const z = Math.round(this.viewport.zoom * 100);
    if (this.hover && this.hover.kind === "scrim") {
      el.replaceChildren(
        document.createTextNode(`x:${xy.x} y:${xy.y} · ${z}% · `),
        h("span", { class: "sw", style: `background:${this.hover.hex}` }),
        document.createTextNode(`${this.hover.name} · ${this.hover.label} · 750 @ ${this.hover.alpha}% · ${this.hover.hex}`),
      );
    } else if (this.hover) {
      el.replaceChildren(
        document.createTextNode(`x:${xy.x} y:${xy.y} · ${z}% · `),
        h("span", { class: "sw", style: `background:${this.hover.hex}` }),
        document.createTextNode(`${this.hover.hex} · tone ${fmt(this.hover.tone)} · `),
        icon(this.hover.inGamut ? "check" : "x", { size: 12 }),
        document.createTextNode(this.hover.inGamut ? " in-gamut" : " out-of-gamut"),
      );
    } else {
      el.textContent = `x:${xy.x} y:${xy.y} · ${z}% · drag pan · wheel zoom · dbl-click reset`;
    }
  }


  // ── right pane (segmented inspector) ──────────────────────────────────────────
  // [ Palette | Global | Roles ] — three panels over the SELECTED palette. The
  // selection lives in ui-session state (this.segment); default is Palette.
  renderRightPane(view) {
    // section routing — Typography/Geometry each return their OWN whole .right-pane inspector; Color's
    // body (below) is unchanged.
    if (this.section === "typography") return this.renderTypeInspector(view);
    if (this.section === "geometry") return this.renderGeomInspector(view);
    const hasStory = !!view.story;
    const seg = this.segment === "story" && !hasStory ? "palette" : this.segment; // story tab only when there is one
    let body;
    if (seg === "story") body = this.renderStoryInspector(view);
    else if (seg === "global") body = this.renderGlobalInspector();
    else if (seg === "roles") body = this.renderRolesInspector(view);
    else body = this.renderPaletteInspector(view);
    const tabs = [{ id: "palette", label: "Palette" }, { id: "global", label: "Global" }, { id: "roles", label: "Roles" }];
    if (hasStory) tabs.push({ id: "story", label: "Story" });
    return h(
      "aside",
      { class: "right-pane" },
      // header row: while OPEN the right toggle hugs the inner (canvas-side) edge, left of
      // the Inspector tabs; once collapsed it is rendered in the canvas-header instead.
      h("div", { class: "pane-head" },
        this.panesRight ? this.paneToggle("right") : false,
        this.segmented(tabs, seg, (id) => this.setSegment(id), { ariaLabel: "Inspector", idPrefix: "tab", controls: "seg-panel" })),
      h("div", { class: "seg-body", "data-scroll": "seg-body", role: "tabpanel", id: "seg-panel", "aria-labelledby": "tab-" + seg }, body),
      // Pinned below the panel on EVERY tab: a live component preview wired to the
      // selected palette's roles (surface / onSurface / onSurfaceVariant + primary).
      h("div", { class: "seg-example" }, ...this.exampleArtifacts(view)),
    );
  }


  // exampleCard — a tiny real component (a surface with text + a primary button)
  // painted from the SELECTED palette's semantic roles, in the canvas light/dark
  // ref. It demonstrates the roles in situ; it has no inputs, so liveRefresh can
  // re-render it as controls drag without disturbing the panel above.
  // _exampleRoles — resolve the SELECTED palette's roles for the pinned artifacts (in the canvas
  // light/dark ref). Shared by exampleCard / exampleSlider / exampleForm so they paint identically.
  _exampleRoles(view) {
    const p = view.palettes[this.selectedIndex()];
    const roles = p?.roles || [];
    const dark = this.resolvedCanvasScheme() === "dark";
    const sl = slug(p?.name || "");
    const byKey = {};
    for (const r of roles) byKey[r.key] = r;
    const pick = (role) => (role ? (dark ? role.darkHex : role.lightHex) : "transparent");
    return { byKey, pick, sl, main: roles.find((r) => r.suffix === ""), onMain: roles.find((r) => r.suffix === "-on-" + sl) };
  }


  exampleCard(view) {
    const { byKey, pick, main, onMain } = this._exampleRoles(view);
    return h(
      "div",
      { class: "example-card", style: "background:" + pick(byKey.surface) },
      h("div", { class: "ex-title", style: "color:" + pick(byKey.onSurface) }, "surface · onSurface"),
      h(
        "div",
        { class: "ex-sub", style: "color:" + pick(byKey.onSurfaceVariant) },
        "onSurfaceVariant",
      ),
      h(
        "button",
        {
          class: "ex-btn",
          tabindex: "-1",
          style: "background:" + pick(main) + ";color:" + pick(onMain),
        },
        "primary",
      ),
    );
  }


  // exampleSlider — a native <input type=range> themed by the tokens via CSS accent-color (the prime
  // accent fills the track + thumb). A static demo (tabindex -1, aria-hidden) so liveRefresh can repaint it.
  exampleSlider(view) {
    const { byKey, pick, main } = this._exampleRoles(view);
    return h(
      "div",
      { class: "example-card ex-artifact", style: "background:" + pick(byKey.surface) },
      h("div", { class: "ex-title ex-artifact-title", style: "color:" + pick(byKey.onSurface) }, "Slider"),
      h("input", {
        type: "range", min: "0", max: "100", value: "65", tabindex: "-1", "aria-hidden": "true",
        class: "ex-range", style: "accent-color:" + pick(main),
      }),
    );
  }


  // exampleForm — native form controls themed by the tokens: a text field (surface/onSurface/outline) +
  // checkbox · radio · select with accent-color = the prime accent. Static demos (tabindex -1, aria-hidden).
  exampleForm(view) {
    const { byKey, pick, main } = this._exampleRoles(view);
    const accent = pick(main);
    const fieldStyle = "background:" + pick(byKey.surfaceLow || byKey.surface) + ";color:" + pick(byKey.onSurface) + ";border-color:" + pick(byKey.outline);
    return h(
      "div",
      { class: "example-card ex-artifact", style: "background:" + pick(byKey.surface) },
      h("div", { class: "ex-title ex-artifact-title", style: "color:" + pick(byKey.onSurface) }, "Form controls"),
      h("input", { type: "text", value: "Text field", tabindex: "-1", "aria-hidden": "true", class: "ex-input", style: fieldStyle }),
      h(
        "div",
        { class: "ex-form-row", style: "color:" + pick(byKey.onSurfaceVariant) },
        h("label", {}, h("input", { type: "checkbox", checked: "checked", tabindex: "-1", "aria-hidden": "true", style: "accent-color:" + accent }), "Checkbox"),
        h("label", {}, h("input", { type: "radio", checked: "checked", tabindex: "-1", "aria-hidden": "true", style: "accent-color:" + accent }), "Radio"),
        h("select", { tabindex: "-1", "aria-hidden": "true", class: "ex-input ex-select", style: fieldStyle }, h("option", {}, "Select")),
      ),
    );
  }


  // exampleArtifacts — the pinned preview gallery: the role card + the native slider + the native form set,
  // each painted from the selected palette's roles. All input-free demos, so liveRefresh can replaceChildren.
  // Collapsed to the FIRST artifact (the role card) until expanded — the slider + form are revealed by the
  // toggle. examplesExpanded is ui-session view state (not doc-bound), so the toggle just flips it + refreshes.
  exampleArtifacts(view) {
    const rest = [this.exampleSlider(view), this.exampleForm(view)];
    const toggle = h(
      "button",
      {
        class: "ex-collapse-toggle",
        type: "button",
        "aria-expanded": this.examplesExpanded ? "true" : "false",
        onclick: () => { this.examplesExpanded = !this.examplesExpanded; this.liveRefresh(); },
      },
      this.examplesExpanded ? "Show less" : `Show ${rest.length} more example${rest.length === 1 ? "" : "s"}`,
    );
    return [this.exampleCard(view), ...(this.examplesExpanded ? rest : []), toggle];
  }


  // slider — a range control. `onInput(v)` mutates live (through editDrag, which
  // does a PARTIAL liveRefresh — it never replaces this <input>, so the native
  // pointer drag survives). The whole drag coalesces into ONE undo step (editDrag
  // debounce). On 'oninput' we also update the sibling <b> readout DIRECTLY from
  // the event so it tracks the thumb (it lives in the right pane, which liveRefresh
  // deliberately leaves untouched). 'change' fires on pointer release: flush the
  // drag's single snapshot (eager commit) AND do a full render() so the right
  // pane's labels, the analysis rail, and the footers all reconcile post-drag.
  slider(label, value, min, max, step, fmtFn, onInput) {
    const readout = h("b", {}, fmtFn(value));
    return h(
      "div",
      { class: "field" },
      h("label", {}, label, readout),
      h("input", {
        type: "range",
        "data-fk": "slider:" + label,
        "aria-label": label, // the <label> sibling isn't associated; name the control for SR
        min,
        max,
        step,
        value,
        oninput: (e) => {
          const v = parseFloat(e.target.value);
          readout.textContent = fmtFn(v); // live readout — don't rebuild the label
          onInput(v);
        },
        onchange: () => {
          this.commitDrag(); // pointer release / keyboard step = settle the undo step
          this.render(); // full render: reconcile the right pane + rails once
        },
      }),
    );
  }


  // _snapRange(frac, min, max, step) — map a 0..1 track fraction to a stepped, clamped slider value. PURE
  // (testable) — the sensitivity fix: value is a linear function of the MEASURED track position, nothing else.
  _snapRange(frac, min, max, step) {
    frac = Math.min(1, Math.max(0, frac));
    let v = min + frac * (max - min);
    if (step > 0) v = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, v));
  }

  // _bindRangeDrag — a DELEGATED pointer-capture drag for every <input type=range>. Figma's plugin iframe
  // breaks the native range drag two ways: it loses the implicit pointer capture (the drag dies the instant
  // the pointer leaves the thumb) and mis-maps pointer→value (over-sensitive). We drive it ourselves — capture
  // the pointer on the input, map clientX across the input's OWN measured rect (_snapRange), and DISPATCH the
  // native input/change events so every existing slider handler (readout · editDrag · commit) runs unchanged.
  // Bound ONCE on the app root; it survives re-renders (they replace children, not `this`). Keyboard is native.
  _bindRangeDrag() {
    if (this._rangeDragBound || typeof this.addEventListener !== "function") return;
    this._rangeDragBound = true;
    const fire = (el, type) => { if (typeof el.dispatchEvent === "function" && typeof Event === "function") el.dispatchEvent(new Event(type, { bubbles: true })); else if (typeof el.dispatch === "function") el.dispatch(type, { target: el }); };
    this.addEventListener("pointerdown", (e) => {
      const input = e.target;
      if (!input || input.tagName !== "INPUT" || input.type !== "range" || input.disabled) return;
      if (e.button != null && e.button !== 0) return; // primary button only
      if (e.preventDefault) e.preventDefault(); // suppress the native drag so ours is the only one
      if (input.focus) input.focus();
      if (input.setPointerCapture && e.pointerId != null) { try { input.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } }
      const lo = Number.isFinite(parseFloat(input.min)) ? parseFloat(input.min) : 0;
      const hi = Number.isFinite(parseFloat(input.max)) ? parseFloat(input.max) : 100;
      const step = parseFloat(input.step) || 1;
      const apply = (clientX) => {
        const r = input.getBoundingClientRect();
        if (!r || !(r.width > 0)) return;
        const v = this._snapRange((clientX - r.left) / r.width, lo, hi, step);
        const sv = String(v);
        if (input.value !== sv) { input.value = sv; fire(input, "input"); } // → the input's oninput (readout + editDrag)
      };
      apply(e.clientX);
      // Drive the drag off the WINDOW, not the input. Figma's iframe drops the INPUT's own pointer events
      // (and setPointerCapture doesn't hold) once the cursor moves far from the thumb — so an input-scoped
      // listener cuts the drag off on a fast/far move. Window-level move/up fire wherever the pointer goes.
      const dragTarget = typeof window !== "undefined" && window.addEventListener ? window : typeof document !== "undefined" && document.addEventListener ? document : this;
      const move = (ev) => apply(ev.clientX);
      const end = () => {
        dragTarget.removeEventListener("pointermove", move);
        dragTarget.removeEventListener("pointerup", end);
        dragTarget.removeEventListener("pointercancel", end);
        if (input.releasePointerCapture && e.pointerId != null) { try { input.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ } }
        fire(input, "change"); // → the input's onchange (commitDrag + full render), the same settle a native release does
      };
      dragTarget.addEventListener("pointermove", move);
      dragTarget.addEventListener("pointerup", end);
      dragTarget.addEventListener("pointercancel", end);
    });
  }


  // ── app footer ────────────────────────────────────────────────────────────────
  // Static structure (the · separators, theme, spacer) is built once; the dynamic
  // readouts carry stable class hooks (.af-pals / .af-tokens / .af-save / .af-warn)
  // so paintAppFooter can reconcile them in place during a live drag — preserving
  // the flex-gap rhythm of the original multi-span footer (no full re-render).
  renderAppFooter() {
    return h(
      "footer",
      { class: "app-footer" },
      h("span", { class: "af-pals" }),
      h("span", {}, "·"),
      h("span", { class: "af-tokens" }),
      h("span", {}, "·"),
      h("span", {}, this.theme),
      h("span", {}, "·"),
      h("span", { class: "af-save" }),
      h("div", { class: "spacer" }),
      h("span", { class: "af-warn" }),
    );
  }


  // paintAppFooter — fill / reconcile the app-footer's dynamic readouts in place.
  // Called by the full render (after renderAppFooter builds the shell) and by
  // liveRefresh during a drag, so swatch edits update the counts without a render.
  paintAppFooter(view) {
    view = view || this._view;
    if (!view) return;
    const enabled = view.palettes.filter((p) => p.on).length;
    const warns = view.contrast.filter((c) => c.onFill < 4.5); // on-color (50/550) < 4.5

    const pals = this.querySelector(".app-footer .af-pals");
    if (pals) pals.textContent = `${enabled} palettes`;
    const tokens = this.querySelector(".app-footer .af-tokens");
    if (tokens) tokens.textContent = `${tokenCount(this.doc)} tokens`;

    const save = this.querySelector(".app-footer .af-save");
    if (save) {
      const dirty = this.isDirty();
      save.className = dirty ? "af-save dirty" : "af-save saved";
      save.replaceChildren(icon(dirty ? "dot" : "check", { size: 12 }), dirty ? " unsaved" : " saved");
    }

    const warn = this.querySelector(".app-footer .af-warn");
    if (warn) {
      warn.className = warns.length ? "af-warn warn" : "af-warn";
      warn.textContent = warns.length ? `⚠ ${warns.length} on-color < 4.5:1` : "contrast ok";
    }
  }


  // _saveBlob — save a Blob to disk. PREFERS the File System Access API (showSaveFilePicker): an
  // explicit save dialog that writes the file directly, so it works in embedded/sandboxed webviews
  // that ignore <a download> and would otherwise NAVIGATE to (preview) the blob. Falls back to the
  // universal <a download> anchor when the picker is unsupported or blocked. Cancelling the dialog
  // is a no-op (never force a fallback download the user just dismissed).
  async _saveBlob(blob, filename) {
    if (typeof window !== "undefined" && typeof window.showSaveFilePicker === "function") {
      try {
        const ext = (String(filename).match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
        const opts = { suggestedName: filename };
        if (ext) opts.types = [{ description: ext.toUpperCase() + " file", accept: { [blob.type || "application/octet-stream"]: ["." + ext] } }];
        const handle = await window.showSaveFilePicker(opts);
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        this.toast("Downloaded " + filename);
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // user dismissed the save dialog — don't fall through
        // any other error (unsupported option, SecurityError, blocked in a sandbox) → anchor fallback
      }
    }
    // Fallback: <a download> + a blob URL — the universal path (works in any top-level browser tab).
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;            // property form is the most reliably-honored "save, don't navigate"
      a.setAttribute("download", filename);
      a.rel = "noopener";
      a.style.display = "none";
      document.body.append(a);
      a.click();
      // Defer cleanup: removing the anchor / revoking the URL synchronously after click() races the
      // (async, for a binary blob) download, so the browser navigates to/previews the blob instead of
      // saving it. Give the download a beat to start before tearing down.
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
      this.toast("Downloaded " + filename);
    } catch {
      this.toast("Download failed");
    }
  }


  // downloadBytes — save raw bytes (the binary sibling of download()); e.g. the Download-All .zip.
  downloadBytes(bytes, filename, type) {
    this._saveBlob(new Blob([bytes], { type: type || "application/octet-stream" }), filename);
  }


  // figmaBundle — public accessor: the DTCG (raw + Light/Dark, aliased) for the
  // CURRENT doc, the payload the Figma-plugin bridge posts to its code.js sandbox.
  figmaBundle() {
    return figmaBundle(this.doc);
  }


  // setInFigma — the Figma bridge (gen-ui.mjs) calls this on figma-init so the app knows
  // it runs inside Figma and can reveal the "Add Variables → Figma" action in the drawer.
  setInFigma(on) {
    this.inFigma = !!on;
    // Re-render in ANY view, not just the editor: figma-init arrives ASYNC (after the app has
    // already rendered the startup GALLERY), so the gallery must re-render here to run its one-shot
    // probeFigmaProject() — otherwise the file's saved config never surfaces as the import row.
    // (Bug: editor-only re-render → gallery never probed → "saved config doesn't show in gallery".)
    this.render();
  }

  // ── persisted APP prefs (theme · canvas preview · motion) — per-USER, not doc-bound → localStorage,
  // versioned like the apply consent. Absent/invalid keys keep the constructor defaults, so a fresh
  // profile (or Figma's session-scoped iframe storage) boots identically to pre-prefs builds.
  _appPrefsKey() { return "ultimate-tokens-app-prefs-v1"; }

  _loadAppPrefs() {
    try {
      const raw = localStorage.getItem(this._appPrefsKey());
      if (!raw) return;
      const p = JSON.parse(raw);
      const scheme = (v) => (v === "light" || v === "dark" || v === "system" ? v : null);
      if (scheme(p.theme)) this.theme = p.theme;
      if (scheme(p.canvasTheme)) this.canvasTheme = p.canvasTheme;
      if (scheme(p.colorMode) || p.colorMode === "both") this.colorMode = p.colorMode;
      if (p.motion === "reduced" || p.motion === "system") this.motion = p.motion;
    } catch { /* storage unavailable / corrupt record → defaults */ }
  }

  _saveAppPrefs() {
    try { localStorage.setItem(this._appPrefsKey(), JSON.stringify({ theme: this.theme, canvasTheme: this.canvasTheme, colorMode: this.colorMode, motion: this.motion })); } catch { /* storage unavailable */ }
  }

  _resetAppPrefs() {
    this.theme = "system";
    this.canvasTheme = "system";
    this.colorMode = "system";
    this.motion = "system";
    try { localStorage.removeItem(this._appPrefsKey()); } catch { /* storage unavailable */ }
    this.dataset.theme = this.theme;
    setColorScheme(this.theme);
    this.render();
  }


  // ── project source of truth (config round-trip I/O) ───────────────────────────────────
  // The "config" is the PARAMETRIC doc (serialize) — palettes' hue/chroma/skew/lift, the global
  // controls, AND roleOverrides — never resolved colors (colors are always re-derived). So a
  // round-trip restores the generator's exact state. Figma → the document's root pluginData (embedded
  // IN the .fig, travels with the file); browser → localStorage. (A read-only diff against the live
  // Figma variables, and the approximate variable-derived seed, are separate fallback paths.)
  saveToProject() {
    const config = serialize(this.doc);
    if (this.inFigma) {
      try { parent.postMessage({ pluginMessage: { type: "save-config", config } }, "*"); this.toast("Saved to the Figma file"); } catch { /* no frame */ }
      return;
    }
    try { localStorage.setItem(PROJECT_KEY, JSON.stringify(config)); this.toast("Saved to project"); }
    catch { this.toast("Save failed — no storage available"); }
  }


  // loadFromProject — restore the config. Figma posts {load-config} and the answer arrives async
  // as {config-loaded} (relayed to applyLoadedConfig by the bridge); browser reads localStorage now.
  loadFromProject() {
    this._loadRequested = true; // an EXPLICIT load → applyLoadedConfig should OPEN it (not just record)
    if (this.inFigma) {
      try { parent.postMessage({ pluginMessage: { type: "load-config" } }, "*"); } catch { this._loadRequested = false; }
      return;
    }
    let raw = null;
    try { raw = localStorage.getItem(PROJECT_KEY); } catch { raw = null; }
    if (!raw) { this._loadRequested = false; this.toast("No saved project config"); return; }
    try { this.applyLoadedConfig(JSON.parse(raw)); } catch { this._loadRequested = false; this.toast("Project config is corrupt"); }
  }


  // applyLoadedConfig — the answer to a load-config request: UNTRUSTED config in (a stored slot or a
  // Figma {config-loaded} message). On the gallery AUTO-PROBE (no explicit load in flight) it only
  // RECORDS whether the file has an embedded config (this.fileConfig → reveals the import row); it does
  // NOT auto-open. An EXPLICIT load (⬇ Project / Open-saved set _loadRequested) opens it as a set.
  applyLoadedConfig(config) {
    const valid = !!(config && typeof config === "object" && Array.isArray(config.palettes) && config.palettes.length);
    if (this.view !== "editor" && !this._loadRequested) {
      this.fileConfig = valid ? config : null; // gallery probe: record availability, render the row
      this.render();
      return;
    }
    this._loadRequested = false;
    if (!valid) { this.toast("No saved project config"); return; }
    this.openConfigAsSet(config, "Loaded from project");
  }


  // openConfigAsSet — shape-clamp an (untrusted) config and open it as a new set. hydrateStoredDoc()
  // domain-clamps every field AND applies the legacy stamp (a config lacking hueSpace was authored under
  // cam16 — keep it cam16, consistent with openSet), so a junk/partial config is sanitized + preserved.
  openConfigAsSet(config, toastMsg) {
    const doc = hydrateStoredDoc(config);
    const name = (typeof config.name === "string" && config.name.trim()) || "Project";
    doc.name = name;
    const id = "set-" + Date.now().toString(36);
    this.sets.push({ id, name, doc: serialize(doc), updated: Date.now() });
    this.persistSets();
    this.openSet(id);
    if (toastMsg) this.toast(toastMsg);
  }


  // ── read-only Figma-variables reference + drift diff (#3) ──────────────────────────────
  // Read the live raw-colors variables from the FILE and compare to what the generator would emit
  // now → per-token drift in the Mapping table (✓ match / ✗ drifted / — absent). Read-only: it never
  // reconstructs params (you cannot reverse-derive hue/chroma from a color), it only diffs colors.
  readLiveVariables() {
    if (!this.inFigma) { this.toast("Reading live variables is a Figma-plugin feature"); return; }
    try { parent.postMessage({ pluginMessage: { type: "read-variables" } }, "*"); } catch { /* no frame */ }
  }


  receiveLiveVariables(payload) {
    this.liveVars = (payload && payload.raw) || {};
    this.liveVarsFound = !!(payload && payload.found);
    this.render();
    // On the gallery the read is a silent structure PROBE (the import row reflects the result);
    // the per-token drift summary only makes sense against an open document, so toast only there.
    if (this.view !== "editor") return;
    if (!this.liveVarsFound) { this.toast("No raw-colors collection in this file yet"); return; }
    const d = this.driftSummary();
    this.toast(d.drifted ? `${d.drifted} of ${d.total} tokens drifted from the file` : `In sync — all ${d.total} match the file`);
  }


  // driftStatus — generated raw var "{n}/{key}" + its generated hex vs the live read.
  // null = no read yet; "absent" = not in the file; "match" / "drift".
  driftStatus(varName, genHex) {
    if (!this.liveVars) return null;
    const live = this.liveVars[varName];
    if (live == null) return "absent";
    return live.toUpperCase() === String(genHex).toUpperCase() ? "match" : "drift";
  }


  driftSummary() {
    const rawTree = this.figmaBundle()["palette.tokens.json"] || {};
    let total = 0, drifted = 0, absent = 0;
    for (const n of Object.keys(rawTree)) {
      if (n[0] === "$") continue; // skip DTCG group metadata ($type/$extensions)
      for (const key of Object.keys(rawTree[n])) {
        if (key[0] === "$") continue;
        const st = this.driftStatus(n + "/" + key, (rawTree[n][key].$value || {}).hex);
        if (st === null) continue;
        total++;
        if (st === "drift") drifted++;
        if (st === "absent") absent++;
      }
    }
    return { total, drifted, absent };
  }


  // downloadFigmaPlugin — the Color Tokens Semantic Binder plugin's two files (manifest.json +
  // code.js). Drop both into one folder, then Figma → Plugins → Development → Import
  // plugin from manifest. It creates the raw→semantic alias cascade native import can't — AND bakes
  // this project's Type/Geometry breakpoint apply plans (_figmaFloatPlans, already validated + ordered)
  // into the downloaded code.js by replacing its injection anchor, so the standalone binder (no
  // postMessage channel to this UI) can still create the Typography/Geometry breakpoint-moded
  // collections the live "Apply to Figma" path gets for free. JSON-string-parse pattern: the plans are
  // JSON.stringify'd TWICE so the result is a bulletproof-escaped JS string literal the binder
  // JSON.parses at runtime (no JS-literal injection hazard).
  downloadFigmaPlugin() {
    const anchor = 'JSON.parse("[]"); /* __ULTIMATE_TOKENS_FLOAT_PLANS__ */';
    const plans = this._figmaFloatPlans(); // [] when type+geometry both off / no breakpoints
    const injected = FIGMA_PLUGIN.code.includes(anchor)
      ? FIGMA_PLUGIN.code.replace(anchor, "JSON.parse(" + JSON.stringify(JSON.stringify(plans)) + "); /* injected */")
      : FIGMA_PLUGIN.code; // defensive: anchor not found — ship the plugin unchanged rather than fail the download
    this.download(FIGMA_PLUGIN.manifest, "manifest.json");
    setTimeout(() => this.download(injected, "code.js"), 150);
  }


  // downloadBrandKitMcp — hand the user a ready-to-run Brand-Kit MCP package as one .zip: the zero-dep
  // server (inlined from mcp/), THEIR resolved tokens (brandKit), a setup README, and a package.json.
  // `node brand-kit-server.mjs` (or `claude mcp add`) and an agent can query the brand's exact tokens.
  downloadBrandKitMcp() {
    const kit = brandKit(this.doc, this.exportSystems);
    const base = slug(kit.name) || "brand-kit";
    const pkg = JSON.stringify(
      { name: "ultimate-tokens-brand-kit", version: "0.1.0", type: "module", description: `MCP server for the "${kit.name}" brand kit (Ultimate Tokens)`, bin: { "brand-kit-mcp": "brand-kit-server.mjs" }, private: true },
      null, 2,
    );
    const files = [
      { name: "brand-kit-server.mjs", data: MCP_BRAND_KIT.server },
      { name: "brand-kit-core.mjs", data: MCP_BRAND_KIT.core }, // the server imports this sibling
      { name: "brand-kit.json", data: JSON.stringify(kit, null, 2) },
      { name: "README.md", data: MCP_BRAND_KIT.readme },
      { name: "package.json", data: pkg },
    ];
    this.downloadBytes(zipStore(files), `${base}-mcp.zip`, "application/zip");
    this.toast("Brand-Kit MCP downloaded — `node brand-kit-server.mjs`");
  }


  // downloadDescribePaletteMcp — the Pro sibling of downloadBrandKitMcp: the MERGED read+generate server
  // (mcp/brand-kit-merged-server.mjs, #374) as one ready-to-run .zip, ships BESIDE the free brand-kit
  // download rather than replacing it (spec §12 item 3). generate_kit needs the real engine, not just a
  // resolved kit.json, so DESCRIBE_MCP_FILES ships the whole self-sufficient source tree at its exact
  // repo-relative paths (mcp/ + src/ui/ + src/engine/ + docs/reference/data/role-table.json) — Node
  // resolves the same relative imports unmodified, no bundler needed. Gated by flagOf("describePalette")
  // AT DOWNLOAD TIME (spec §9): once downloaded, a zero-dep offline stdio server has no live entitlement
  // check left to call, so the gate that matters is here, not inside the shipped code.
  downloadDescribePaletteMcp() {
    if (!this.flagOf("describePalette")) {
      this.toast("Describe-Palette MCP is a Pro feature — upgrade to download it.");
      if (!this.inFigma) { this.settingsSection = "account"; this.openSettings(); }
      return;
    }
    const kit = brandKit(this.doc, this.exportSystems);
    const base = slug(kit.name) || "brand-kit";
    // version is the REAL engine version, not a placeholder — describe-kit-core.mjs reads its own
    // shipped package.json for every generated kit's meta.engineVersion (spec §6.4's reproducibility stamp).
    const pkg = JSON.stringify(
      { name: "ultimate-tokens-describe-palette-mcp", version: DESCRIBE_MCP_ENGINE_VERSION, type: "module", description: `Describe-Palette MCP (read "${kit.name}" + generate new kits from text)`, bin: { "describe-palette-mcp": "mcp/brand-kit-merged-server.mjs" }, private: true },
      null, 2,
    );
    const files = [
      ...DESCRIBE_MCP_FILES.map(({ path, data }) => ({ name: path, data })),
      // the server's own HERE resolves to its own directory (mcp/, since it lives at mcp/brand-kit-merged-
      // server.mjs here, unlike the flat single-file brand-kit-server.mjs) — the sibling kit sits beside it.
      { name: "mcp/brand-kit.json", data: JSON.stringify(kit, null, 2) }, // the seeded read surface — additive, not required to call generate_kit
      { name: "README.md", data: DESCRIBE_MCP_README },
      { name: "package.json", data: pkg },
    ];
    this.downloadBytes(zipStore(files), `${base}-describe-mcp.zip`, "application/zip");
    this.toast("Describe-Palette MCP downloaded — `node mcp/brand-kit-merged-server.mjs`");
  }


  copy(text, msg) {
    const done = () => this.toast(msg || "Copied to clipboard");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => this.fallbackCopy(text, done));
    } else {
      this.fallbackCopy(text, done);
    }
  }

  fallbackCopy(text, done) {
    const ta = h("textarea", { style: "position:fixed;opacity:0" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch {
      this.toast("Copy failed");
    }
    ta.remove();
  }


  // download — save text (CSS/JSON/etc.). Routes through _saveBlob, so it benefits from the same
  // File System Access save dialog (and anchor fallback) the .zip uses.
  download(text, filename) {
    this._saveBlob(new Blob([text], { type: "text/plain" }), filename);
  }


  toast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove("show"), 1800);
  }

}

// mixinInto — copy every own prototype method/getter/setter from each mixin class onto Target's
// prototype (skipping "constructor"). Plain data-preserving prototype composition — no framework,
// no subclassing chain, no Proxy: the section/overlay classes above exist ONLY as a comma-free
// syntax carrier for their methods and are never instantiated. Property descriptors (not bare
// assignment) so any getter/setter method survives the copy unchanged.
function mixinInto(Target, ...Sources) {
  for (const Source of Sources) {
    for (const name of Object.getOwnPropertyNames(Source.prototype)) {
      if (name === "constructor") continue;
      Object.defineProperty(Target.prototype, name, Object.getOwnPropertyDescriptor(Source.prototype, name));
    }
  }
}
// The section seam (this.section: color|typography|geometry) is a real module boundary: each
// section's render tree lives in its own prototype-mixin file (src/ui/sections/*.js), plus three
// cross-section overlay mixins (the export drawer, the Figma apply-consent gate, Settings) under
// src/ui/overlays/*.js (TKT-0023: app.js is now a bootstrap + shared core; sections/overlays live
// in per-file mixins, flattened onto ONE prototype — every call site still just reads 'this.<name>()').
mixinInto(HctApp, ColorSection, TypeSection, GeomSection, DrawerMixin, ApplyGateMixin, SettingsMixin);

// The one tag. The pre-rename alias was retired with the maker brand (ADR-015): an embed on the old tag
// now renders nothing, which is the intended, visible failure — a silently-styled ghost element would be
// worse. The localStorage prefix chain in migrateStorageKeys() is a SEPARATE concern and stays: it carries
// real saved palettes across the rename, and dropping it would delete a user's work.
customElements.define("ultimate-tokens", HctApp);

// expose a couple of pure helpers for any console poking / future tests.
export { HctApp, contrastRatio };
