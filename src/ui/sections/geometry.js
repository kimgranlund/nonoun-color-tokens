import { slug } from "../model.mjs";
import { hydrate, serialize } from "../persist.js";
import { DEFAULT_TYPE, typeScale } from "../../engine/type.mjs";
import { DEFAULT_GEOMETRY, GEOMETRY_TREATMENTS, geomScale, geomTokensBreakpointCSS, geomTokensCSS, geomTokensDTCG } from "../../engine/geometry.mjs";
import { icon } from "../icons.js";
import { btn, chip, ensureTypeFonts, field, fmt, h, swatch } from "../app-helpers.mjs";

// STANDARD_GEOM_RUNGS — the ratified desktop-anchored Standard set: Tablet/Mobile derive DOWN via a
// fixed height DROP from the doc's current baseHeight (floor 20). STABLE ids (not seeded/random) so a
// token override written against a not-yet-materialized rung (see _geomEffectiveModes /
// setGeomTokenOverride) keeps resolving once it IS materialized.
const STANDARD_GEOM_RUNGS = [
  { id: "std-tablet", name: "Tablet", w: 992, drop: 2 },
  { id: "std-mobile", name: "Mobile", w: 476, drop: 4 },
];

// Prototype mixin (TKT-0023): a class body used ONLY as a verbatim, comma-free carrier for these
// methods — copied onto HctApp.prototype (see app.js's mixin() call), never instantiated directly.
export class GeomSectionImpl {
  // _geomOverridesFor(modeKey) — the flat { "<size>": height } slice for one mode (the suffix stripped).
  _geomOverridesFor(modeKey) {
    const all = (this.doc.geometry && this.doc.geometry.tokenOverrides) || null;
    if (!all) return undefined;
    const out = {};
    const suffix = "|" + modeKey;
    for (const k of Object.keys(all)) {
      if (!k.endsWith(suffix)) continue;
      out[k.slice(0, k.length - suffix.length)] = all[k]; // "<size>"
    }
    return Object.keys(out).length ? out : undefined;
  }

  // _geomEffectiveModes — doc.geometry.modes if any have been materialized, else the Standard set
  // rendered LIVE (STANDARD_GEOM_RUNGS, height derived from the doc's CURRENT baseHeight) so
  // Tablet/Mobile are visible/selectable/previewable without an explicit materialize step. Shaped
  // identically to a real mode entry so every consumer treats them the same way; only an actual EDIT
  // materializes them for real (setGeomTokenOverride), using these SAME ids so the edit keeps resolving
  // afterward.
  _geomEffectiveModes() {
    const g = this.doc.geometry || DEFAULT_GEOMETRY;
    if ((g.modes || []).length) return g.modes;
    const bh = Number(g.baseHeight) || DEFAULT_GEOMETRY.baseHeight || 28;
    return STANDARD_GEOM_RUNGS.map((r) => ({ id: r.id, name: r.name, baseHeight: Math.max(20, bh - r.drop), minWidth: r.w }));
  }

  // _ensureGeomModesMaterialized(d) — if d.geometry has no real modes yet AND modeKey is one of the
  // Standard-set rungs, materialize BOTH rungs (same stable ids _geomEffectiveModes already previewed)
  // so a write against modeKey has a real entry to land in. Mutates d.geometry in place; call inside a
  // commit/editDrag closure BEFORE writing the actual per-mode value. A no-op for "base", a real custom
  // mode id, or when modes already exist.
  _ensureGeomModesMaterialized(d, modeKey) {
    if ((d.geometry.modes || []).length || !STANDARD_GEOM_RUNGS.some((r) => r.id === modeKey)) return;
    const bh = Number(d.geometry.baseHeight) || DEFAULT_GEOMETRY.baseHeight || 28;
    d.geometry.baseName = d.geometry.baseName || "Desktop";
    d.geometry.modes = STANDARD_GEOM_RUNGS.map((r) => ({ id: r.id, name: r.name, baseHeight: Math.max(20, bh - r.drop), minWidth: r.w }));
  }

  // _geomScaleFor(modeKey) — the resolved geometry scale for a mode WITH that mode's per-cell HEIGHT
  // overrides applied, COMPOSED with the type scale at the SAME mode — a control's text size (SM/MD/LG
  // `font`) is the UI-CONTROL voice at that mode (TKT-0008; XS/XL/2XL fall back to the engine's fixed
  // control-text ramp / the tier columns below).
  _geomScaleFor(modeKey) {
    const g = this.doc.geometry || DEFAULT_GEOMETRY;
    // a mode's rampContrast: mode-explicit wins; otherwise it INHERITS the doc's (the desktop-anchored
    // shape — base isn't compressed, so inheritance is natural). Legacy #251 committed sets always carry
    // explicit per-mode values, so they resolve identically; a legacy compressed base (contrast 0) with a
    // silent mode keeps the old full-ramp default via the ?? 1 tail.
    const cfg = modeKey === "base" ? g : (() => { const m = this._geomEffectiveModes().find((x) => x.id === modeKey); return m ? { ...g, baseHeight: m.baseHeight, rampContrast: m.rampContrast ?? ((g.baseName || "Base") === "Desktop" ? g.rampContrast : undefined) ?? 1 } : g; })();
    return geomScale(cfg, { typeScale: this._typeScaleFor(modeKey), overrides: this._geomOverridesFor(modeKey) });
  }

  // A first edit against a not-yet-materialized Standard-set rung (std-tablet/std-mobile) materializes
  // BOTH rungs in the SAME commit — one undo step, matching addStandardGeomModes' existing contract —
  // using the SAME stable ids so this write keeps resolving once real.
  setGeomTokenOverride(size, modeKey, height) {
    let n = Math.round(Number(height));
    if (!Number.isFinite(n) || n <= 0) return;
    n = Math.max(8, Math.min(256, n)); // clamp to the input min/max + persist's clampTokenOverrides range, so live === persist (and a sub-floor height can't yield negative padding)
    const key = size + "|" + modeKey;
    this.commit((d) => {
      d.geometry = { ...(d.geometry || DEFAULT_GEOMETRY) };
      this._ensureGeomModesMaterialized(d, modeKey);
      d.geometry.tokenOverrides = { ...(d.geometry.tokenOverrides || {}), [key]: n };
    });
  }

  clearGeomTokenOverride(size, modeKey) {
    const key = size + "|" + modeKey;
    this.commit((d) => {
      if (!d.geometry || !d.geometry.tokenOverrides || !(key in d.geometry.tokenOverrides)) return;
      d.geometry = { ...d.geometry, tokenOverrides: { ...d.geometry.tokenOverrides } };
      delete d.geometry.tokenOverrides[key];
      if (Object.keys(d.geometry.tokenOverrides).length === 0) delete d.geometry.tokenOverrides;
    });
  }

  // _geomActiveModeKey — the tokenOverride mode key for the ramp tab's active breakpoint (Compare shows Base).
  _geomActiveModeKey() { return this.geomMode === "base" || this.geomMode === "compare" ? "base" : this.geomMode; }

  // _setGeomSize(size, height) — the LIVE (editDrag) per-size Height override for the active mode. Height is
  // geometry's ONE authored lever (icon/font/pad/radius derive from it by the centering law), so this is the
  // geometry analog of _setTypeVoice — and it writes the SAME tokenOverrides store the token matrix uses.
  _setGeomSize(size, height) {
    let n = Math.round(Number(height));
    if (!Number.isFinite(n)) return;
    n = Math.max(8, Math.min(256, n)); // same clamp as setGeomTokenOverride (live === persist range)
    const key = size + "|" + this._geomActiveModeKey();
    this.editDrag((d) => {
      d.geometry = { ...(d.geometry || DEFAULT_GEOMETRY) };
      d.geometry.tokenOverrides = { ...(d.geometry.tokenOverrides || {}), [key]: n };
    });
  }


  // _geomTokenColumns — the ordered column set for the Geometry token matrix: Base first, then one column
  // per breakpoint MODE sorted ascending by minWidth. Mirrors _typeTokenColumns / _geomModeScales but
  // prepends Base = the DOCUMENT base composed geometry scale (mode-independent — NOT _activeGeomScale).
  _geomTokenColumns() {
    const { baseName: bn, baseLast } = this._geomBaseOpts();
    const baseCol = { id: "base", modeKey: "base", name: bn, minWidth: null, scale: this._geomScaleFor("base") };
    const modes = this._geomEffectiveModes()
      .map((m) => ({ id: m.id, modeKey: m.id, name: m.name || "Mode", minWidth: Number(m.minWidth) || 0, scale: this._geomScaleFor(m.id) }))
      // a named base reads desktop-first (widest first); the legacy "Base" shape stays ascending.
      .sort((a, b) => (bn === "Base" ? a.minWidth - b.minWidth : b.minWidth - a.minWidth));
    return baseLast ? [...modes, baseCol] : [baseCol, ...modes];
  }


  // renderGeomTokensTable — the EDITABLE Geometry token MATRIX (Phase 3). Rows = the six control sizes
  // (XS..2XL, largest→smallest) with a group-header row; the first (sticky) column is the token NAME
  // (--size-{step}). Columns = Base + each breakpoint mode (≥{minWidth}px). Each value cell is a HEIGHT
  // number input (the lever): editing it writes doc.geometry.tokenOverrides[<size>|<mode>] and
  // icon/font/pad/radius ALL re-derive via the laws beneath; an overridden cell gets `.ov` + a ↺ reset.
  renderGeomTokensTable() {
    const cols = this._geomTokenColumns();
    const base = cols[0].scale;
    const ov = (this.doc.geometry && this.doc.geometry.tokenOverrides) || {};
    const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const SIZE_NAMES = ["2XL", "XL", "LG", "MD", "SM", "XS"]; // largest → smallest
    const present = SIZE_NAMES.filter((n) => base.sizes[n]);
    const cell = (col, name) => {
      const s = col.scale.sizes[name];
      if (!s) return h("td", { class: "tok-cell" }, h("span", { class: "tok-na" }, "—"));
      const overridden = (name + "|" + col.modeKey) in ov;
      return h(
        "td",
        { class: "tok-cell" + (overridden ? " tok-cell-ov" : "") },
        h(
          "div",
          { class: "tok-edit" },
          h("input", {
            class: "tok-input" + (overridden ? " ov" : ""),
            type: "number", min: "8", max: "256", step: "1",
            value: String(s.height),
            "data-fk": "geotok:" + name + ":" + col.modeKey,
            "aria-label": `${name} control height · ${col.name} (px)`,
            onchange: (e) => this.setGeomTokenOverride(name, col.modeKey, e.target.value),
          }),
          overridden ? btn(icon("arrow-counter-clockwise", { size: 12 }), { variant: "bare", cls: "tok-reset", title: "Reset to derived height", ariaLabel: `Reset ${name} · ${col.name} to the derived height`, onclick: () => this.clearGeomTokenOverride(name, col.modeKey) }) : false,
        ),
        h("span", { class: "tok-sub" }, `i${s.icon} · f${s.font} · p${s.paddingNarrow} · r${s.radiusPill}`),
      );
    };
    const headCells = cols.map((c) =>
      h("th", { class: "tok-col" + (c.id === "base" ? " tok-col-base" : ""), scope: "col" },
        h("span", { class: "tok-col-name" }, c.name),
        c.minWidth ? h("small", { class: "tok-col-bp" }, `≥${Math.round(c.minWidth)}px`) : false));
    const rows = [];
    rows.push(h("tr", { class: "tok-group" },
      h("th", { class: "tok-grouphead", colspan: String(cols.length + 1), scope: "colgroup" },
        h("b", {}, "Controls"), h("small", {}, "height · icon · font · pad · radius"), h("span", { class: "tok-group-count" }, `${present.length} sizes`))));
    for (const name of present) {
      rows.push(h("tr", { class: "tok-row" },
        h("th", { class: "tok-name", scope: "row" }, h("code", {}, `--size-${kebab(name)}`)),
        ...cols.map((c) => cell(c, name))));
    }
    return h(
      "div",
      { class: "tok-wrap" },
      h("div", { class: "tok-head" },
        h("b", {}, "Geometry tokens"),
        h("small", {}, `${base.baseHeight}px base · ${present.length} sizes · ${cols.length} column${cols.length === 1 ? "" : "s"} (Base${cols.length > 1 ? " + " + (cols.length - 1) + " breakpoint" + (cols.length === 2 ? "" : "s") : ""})`),
        h("small", { class: "tok-hint" }, "Each edit is per-cell and mode-local — Base does not cascade into breakpoint columns; icon, font, padding + radius re-derive from the height.")),
      h(
        "table",
        { class: "map-table tok-table" },
        h("thead", {}, h("tr", {}, h("th", { class: "tok-name tok-name-head", scope: "col" }, "Token"), ...headCells)),
        h("tbody", {}, ...rows),
      ),
    );
  }

  // ── Geometry section — the dimensional system as a full editor section (canvas + analysis rail +
  // inspector), the spatial analog of the Color and Typography sections. Phase 3 retired the Geometry
  // modal: all geometry comes from geometryScale(doc), COMPOSED with the type UI scale (a control's text
  // `font` per step is the brand's Typography UI size). Binds to doc.geometry = { treatment, baseHeight };
  // density / radius style / spacing come from the treatment (shown read-only). ──────────────────
  setGeomSpecMode(v) { this.geomSpecMode = v; this.render(); }


  // ── Geometry breakpoint modes (Phase 5) — named baseHeight variants over doc.geometry. Mirrors the
  // Typography mode helpers; the ACTIVE mode drives the canvas preview + the inspector. Export stays on Base.
  // _effGeomMode — the mode the ACTIVE resolvers paint in: a Compare column's _geomModeOverride wins (so its
  // scene + scale build at THAT breakpoint while it renders, like _schemeOverride), else this.geomMode.
  _effGeomMode() { return this._geomModeOverride != null ? this._geomModeOverride : this.geomMode; }

  _activeGeometry() {
    const g = this.doc.geometry || DEFAULT_GEOMETRY;
    const mode = this._effGeomMode();
    if (mode === "base") return g;
    const m = (g.modes || []).find((x) => x.id === mode);
    return m ? { ...g, baseHeight: m.baseHeight } : g;
  }

  // the resolved scale at the active mode — composes geometry with the type scale at the SAME mode AND
  // applies that mode's per-cell height overrides (so the canvas/inspector reflect the matrix). Routed
  // through _geomScaleFor so overrides are consistent with the matrix + every export.
  _activeGeomScale() {
    const mode = this._effGeomMode();
    const key = mode === "base" || !this._geomEffectiveModes().some((m) => m.id === mode) ? "base" : mode;
    return this._geomScaleFor(key);
  }

  _geomModeScales() {
    const g = this.doc.geometry || DEFAULT_GEOMETRY;
    if ((g.modes || []).length) return g.modes.map((m) => ({ name: m.name, minWidth: m.minWidth, scale: this._geomScaleFor(m.id) }));
    // synthesized, Desktop-anchored: the doc ramp IS Desktop; the other tiers carry the ratified magnitude
    // table's height ramps (2026-07-16, at request) as per-size overrides scaled by bh/28, so they hold
    // their shape at any baseHeight. Tablet needs none — the lawful −2 derivation already lands the
    // table's exact heights. Control text is the geometry engine's OWN ramp now (the type composition is
    // retired); each tier passes its `controls` column as fontOverrides below.
    const t = this.doc.type || DEFAULT_TYPE;
    const bb = Number(t.bodyBase) || DEFAULT_TYPE.bodyBase;
    const bh = g.baseHeight ?? 28;
    const ramp = (arr) => { const f = bh / 28; const out = {}; ["XS", "SM", "MD", "LG", "XL", "2XL"].forEach((k, i) => { if (arr[i] != null) out[k] = arr[i] * f; }); return out; };
    // control text composes from the tier's own UI-control voice at EVERY step (the voice rides the
    // full XS..2XL ramp since 2026-07-16, with its _modeTierNudge hand columns) — no per-step
    // fontOverrides needed anymore; one source of truth.
    const tierType = (mult, mf) => typeScale({ ...t, bodyBase: bb * mult, modeFactor: mf, overrides: { ...(t.overrides || {}), ...this._modeTierNudge(mf) } });
    // per-tier GAP hand columns (the ratified gap-unit matrix, TKT-0010) — final values at the canonical
    // baseHeight, scaled by bh/28 like the height ramps. Tablet is FROZEN at the Desktop column (the
    // GAP_UNIT law at Tablet's smaller baseHeight would under-shoot its 2XL); Desktop itself IS the law.
    const synth = (delta, mult, mf, overrides, gaps) => geomScale({ ...g, baseHeight: Math.max(20, bh + delta) }, { typeScale: tierType(mult, mf), overrides, gapOverrides: gaps });
    return [
      { name: "Desktop Lg", minWidth: 1728, scale: synth(4, 1.125, 0.89, ramp([24, 28, 32, 40, 56, 72]), ramp([4, 4, 5, 7, 7, 9])) },
      { name: "Desktop Xl", minWidth: 2560, scale: synth(28, 1.375, 0.80, ramp([40, 48, 56, 64, 72, 80]), ramp([4, 5, 6, 8, 8, 10])) },
      { name: "Tablet", minWidth: 992, scale: synth(-2, 1, 5 / 6, undefined, ramp([3, 3, 4, 6, 6, 8])) },
      { name: "Mobile", minWidth: 476, scale: synth(-4, 1, 2 / 3, ramp([16, 20, 24, 32, 40, 56]), ramp([3, 3, 4, 5, 5, 6])) },
    ];
  }

  _geomBaseOpts() {
    const g = this.doc.geometry || DEFAULT_GEOMETRY;
    const synthesized = !(g.modes || []).length;
    const n = (g.baseName || (synthesized ? "Desktop" : "Base")).trim() || "Base";
    return { baseName: n, baseLast: n.toLowerCase() === "mobile" };
  }

  _geomModeDTCGFiles(prefix = "geometry", opts = {}) {
    return this._geomModeScales().filter((m) => Number(m.minWidth) > 0)
      .map((m) => ({ name: `${prefix}.${Math.round(m.minWidth)}.tokens.json`, data: JSON.stringify(geomTokensDTCG(m.scale, opts), null, 2) }));
  }

  // Mirrors typeModeControl: a NAMED base (doc.geometry.baseName, e.g. "Mobile") renders LAST — the
  // canonical desktop-first order (Desktop · Tablet · Mobile), matching the Figma mode-column order.
  geomModeControl() {
    const g = this.doc.geometry || DEFAULT_GEOMETRY;
    const modes = this._geomEffectiveModes();
    const { baseName: bn, baseLast } = this._geomBaseOpts();
    // reset an unknown/deleted mode to base — but "compare" (Phase 5.3) is a valid pseudo-mode, allow it.
    if (this.geomMode !== "base" && this.geomMode !== "compare" && !modes.some((m) => m.id === this.geomMode)) this.geomMode = "base";
    const baseItem = { id: "base", label: bn, title: `${bn} size ramp · ${g.baseHeight ?? 28}px` };
    const modeItems = modes.map((m) => ({ id: m.id, label: m.name || "Mode", title: `${m.name || "Mode"} · ${m.baseHeight}px base height` }));
    const items = [
      ...(baseLast ? [...modeItems, baseItem] : [baseItem, ...modeItems]),
      // Compare = all breakpoints side by side (Phase 5.3). Meaningless with only the base, so only when ≥1 mode.
      ...(modes.length ? [{ id: "compare", label: "All", title: "All breakpoints side by side" }] : []),
    ];
    return h(
      "div",
      { class: "mode-control" },
      this.segmented(items, this.geomMode, (id) => { this.geomMode = id; this.render(); },
        { cls: "canvas-seg", ariaLabel: "Geometry breakpoint mode", role: "group", idPrefix: "gmode" }),
      btn(icon("plus"), { cls: "mode-add", ariaLabel: "Add a breakpoint mode", title: "Add a breakpoint — a named ramp with its own base control height", onclick: () => this.addGeomMode() }),
    );
  }

  // addStandardGeomModes — materialize the intrinsic standard set as editable doc modes (the ratified
  // desktop-anchored law): the designed ramp IS Desktop (the base, first, Figma's default mode —
  // baseName "Desktop", nothing about it changes); Tablet (992, heights −2) and Mobile (≤476, marker
  // minWidth 476, heights −4, floor 20) derive DOWN — the same values the synthesized (no-modes) shape
  // exports; committing just makes them matrix-editable. The split CSS export (geomTokensCSS for the
  // unconditional Desktop base + geomTokensBreakpointCSS per mode) reads these directly, no re-anchor.
  // One commit = one undo step.
  addStandardGeomModes() {
    const bh = (this.doc.geometry && this.doc.geometry.baseHeight) ?? 28;
    this.geomMode = "base"; // stay on Desktop (the designed ramp — nothing about it changed)
    this.commit((d) => {
      d.geometry = { ...(d.geometry || DEFAULT_GEOMETRY), baseName: "Desktop" };
      const modes = d.geometry.modes ? [...d.geometry.modes] : [];
      STANDARD_GEOM_RUNGS.forEach((r) => modes.push({ id: r.id, name: r.name, baseHeight: Math.max(20, bh - r.drop), minWidth: r.w }));
      d.geometry.modes = modes;
    });
  }

  addGeomMode() {
    const id = "gm-" + Date.now().toString(36);
    this.geomMode = id;
    this.commit((d) => {
      d.geometry = { ...(d.geometry || DEFAULT_GEOMETRY) };
      const modes = d.geometry.modes ? [...d.geometry.modes] : [];
      modes.push({ id, name: "Mode " + (modes.length + 1), baseHeight: d.geometry.baseHeight ?? 28 });
      d.geometry.modes = modes;
    });
  }

  deleteGeomMode(id) {
    const remaining = (this.doc.geometry && this.doc.geometry.modes || []).filter((m) => m.id !== id).length;
    if (this.geomMode === id || (this.geomMode === "compare" && remaining === 0)) this.geomMode = "base";
    this.commit((d) => {
      if (!d.geometry || !Array.isArray(d.geometry.modes)) return;
      d.geometry = { ...d.geometry, modes: d.geometry.modes.filter((m) => m.id !== id) };
      if (d.geometry.modes.length === 0) delete d.geometry.modes;
      // strip this mode's per-cell overrides too — orphaned "...|<id>" keys would otherwise survive
      // serialize→hydrate forever (a stale-override leak with no UI to reach them).
      if (d.geometry.tokenOverrides) {
        d.geometry = { ...d.geometry, tokenOverrides: { ...d.geometry.tokenOverrides } };
        for (const k of Object.keys(d.geometry.tokenOverrides)) if (k.endsWith("|" + id)) delete d.geometry.tokenOverrides[k];
        if (!Object.keys(d.geometry.tokenOverrides).length) delete d.geometry.tokenOverrides;
      }
    });
  }

  renameGeomMode(id, name) {
    this.commit((d) => {
      if (!d.geometry || !Array.isArray(d.geometry.modes)) return;
      d.geometry = { ...d.geometry, modes: d.geometry.modes.map((m) => (m.id === id ? { ...m, name: name || m.name } : m)) };
    });
  }

  _setActiveGeomBaseHeight(v) {
    const bh = Math.round(v);
    this.editDrag((d) => {
      d.geometry = { ...(d.geometry || DEFAULT_GEOMETRY) };
      // Compare shows the Base scale in the inspector, so its slider edits Base (not a per-mode no-op).
      if (this.geomMode === "base" || this.geomMode === "compare") d.geometry.baseHeight = bh;
      else {
        this._ensureGeomModesMaterialized(d, this.geomMode); // a not-yet-materialized std-tablet/std-mobile needs a real entry to land in
        d.geometry.modes = (d.geometry.modes || []).map((m) => (m.id === this.geomMode ? { ...m, baseHeight: bh } : m));
      }
    });
  }

  // the Ramp-contrast slider edits the ACTIVE mode, exactly like the base-height slider above.
  _setActiveGeomRampContrast(v) {
    const c = Math.max(0, Math.min(1, Math.round(Number(v) * 20) / 20)); // 5% steps
    this.editDrag((d) => {
      d.geometry = { ...(d.geometry || DEFAULT_GEOMETRY) };
      if (this.geomMode === "base" || this.geomMode === "compare") d.geometry.rampContrast = c;
      else {
        this._ensureGeomModesMaterialized(d, this.geomMode);
        d.geometry.modes = (d.geometry.modes || []).map((m) => (m.id === this.geomMode ? { ...m, rampContrast: c } : m));
      }
    });
  }

  _geomModeEditor() {
    const g = this.doc.geometry || DEFAULT_GEOMETRY;
    if (this.geomMode === "base") {
      const n = (g.modes || []).length;
      return h("p", { class: "insp-sub tyi-future" }, n
        ? `${n} breakpoint mode${n > 1 ? "s" : ""} — switch them from the canvas header; each carries its own base control height (per-mode export is coming).`
        : "Add a breakpoint (the + in the canvas header) to give this ramp a second base height for another screen — e.g. taller touch targets on mobile.");
    }
    const m = (g.modes || []).find((x) => x.id === this.geomMode);
    if (!m) return false;
    return h(
      "div",
      { class: "mode-editor" },
      h("label", { class: "mode-editor-label", for: "fld-gmode-name" }, "Breakpoint name"),
      h(
        "div",
        { class: "mode-editor-row" },
        h("input", { id: "fld-gmode-name", type: "text", value: m.name, "data-fk": "gmode-name", "aria-label": "Breakpoint mode name",
          onchange: (e) => this.renameGeomMode(m.id, e.target.value.trim()) }),
        btn(icon("trash"), { ariaLabel: "Delete this breakpoint", title: "Delete this breakpoint mode", onclick: () => this.deleteGeomMode(m.id) }),
      ),
      h("label", { class: "mode-editor-label", for: "fld-gmode-mw" }, "Breakpoint width — @media min-width"),
      h(
        "div",
        { class: "mode-editor-row" },
        h("input", { id: "fld-gmode-mw", type: "number", min: 0, max: 3840, step: 1, value: m.minWidth || "", placeholder: "e.g. 768", "data-fk": "gmode-mw", "aria-label": "Breakpoint min-width in px",
          onchange: (e) => this.setGeomModeMinWidth(m.id, e.target.value) }),
        h("span", { class: "mode-editor-unit" }, "px"),
      ),
      this._modeWidthPresets(m.minWidth, (w) => this.setGeomModeMinWidth(m.id, w)),
      h("p", { class: "insp-sub tyi-future" }, m.minWidth
        ? `Exports as @media (min-width: ${m.minWidth}px) — the size vars re-declare at this base height above ${m.minWidth}px.`
        : "Set a width to emit a CSS @media breakpoint in the export; blank = preview-only."),
    );
  }

  setGeomModeMinWidth(id, v) {
    const n = Math.round(Number(v));
    this.commit((d) => {
      if (!d.geometry || !Array.isArray(d.geometry.modes)) return;
      d.geometry = { ...d.geometry, modes: d.geometry.modes.map((m) => {
        if (m.id !== id) return m;
        const mm = { ...m };
        if (Number.isFinite(n) && n > 0) mm.minWidth = Math.max(1, Math.min(3840, n)); else delete mm.minWidth;
        return mm;
      }) };
    });
  }

  // renderGeomCanvasHeader — the Geometry section's canvas header: pane toggles + the Controls·Tokens mode
  // segment + the reused fit/scheme/zoom controls (mirrors renderTypeCanvasHeader).
  renderGeomCanvasHeader() {
    return h(
      "div",
      { class: "canvas-header" },
      !this.panesLeft ? this.paneToggle("left") : false,
      this.geomMode === "compare" ? false : this.segmented(
        [
          { id: "controls", label: "Controls", title: "Live mock controls — render each ramp step as a real box" },
          { id: "tokens", label: "Tokens", title: "Editable token matrix — every size × Base + each breakpoint" },
        ],
        this.geomSpecMode,
        (id) => this.setGeomSpecMode(id),
        { cls: "canvas-seg", ariaLabel: "Geometry specimen mode", role: "group", idPrefix: "gspec" },
      ),
      this.geomModeControl(),
      h("div", { class: "spacer" }),
      btn(icon("crosshair"), {
        title: "Fit — reset the canvas view to centre at 100%",
        ariaLabel: "Fit — reset the canvas view to centre at 100%",
        onclick: () => { this.fit(); this.render(); },
      }),
      this.canvasThemeBtn(),
      btn(icon("minus"), { ariaLabel: "Zoom out", onclick: () => this.zoomBy(-1) }),
      h("span", { class: "zoom-readout", role: "status", "aria-live": "polite", "aria-label": "Zoom level" }, Math.round(this.viewport.zoom * 100) + "%"),
      btn(icon("plus"), { ariaLabel: "Zoom in", onclick: () => this.zoomBy(1) }),
      !this.panesRight ? this.paneToggle("right") : false,
    );
  }


  // renderGeomCanvas — the Geometry center. Controls mode renders the full dimensional dataset (the 6-size
  // control ramp + radius + space) in the pannable/zoomable .canvas-area + .canvas-scene shell. Tokens mode
  // renders an EDITABLE token MATRIX (Phase 3 — per-cell size/height overrides + ↺) (rows = sizes, cols = Base + each breakpoint) in the scrolling
  // .is-table shell instead — mirrors renderTypeCanvas / Color's Mapping flip.
  renderGeomCanvas(view) {
    // Compare (Phase 5.3) — all breakpoints side by side. A Controls view, so it wins over the tokens table.
    if (this.geomMode === "compare") return this.renderGeomCompareArea(view);
    if (this.geomSpecMode === "tokens") return this._tokensTableArea("Geometry tokens — Base + breakpoints", this.renderGeomTokensTable());
    const area = h(
      "div",
      {
        class: "canvas-area geom-canvas canvas-scheme-" + this.resolvedCanvasScheme(),
        role: "group",
        "aria-label": "Geometry specimen — drag to pan, wheel to zoom, double-click to reset",
      },
      h("div", { class: "canvas-scene" }, this.renderGeometryScene(view)),
    );
    this.wirePanZoom(area);
    requestAnimationFrame(() => this.applyTransform());
    return area;
  }


  // renderGeomCompareArea — the Geometry "Compare" mode: the control ramp rendered at Base AND each breakpoint
  // mode, side by side, in ONE pannable .canvas-scene. Mirrors renderTypeCompareArea / Color's renderCompareArea;
  // each column forces its breakpoint via _geomModeOverride while it builds.
  renderGeomCompareArea(view) {
    const modes = this._geomEffectiveModes();
    const area = h(
      "div",
      { class: "canvas-area canvas-compare geom-canvas canvas-scheme-" + this.resolvedCanvasScheme(),
        role: "group", "aria-label": "Compare — every geometry breakpoint side by side · drag to pan, wheel to zoom" },
      h("div", { class: "canvas-scene compare" },
        this._geomCompareColumn(view, "base", "Base"),
        ...modes.map((m) => this._geomCompareColumn(view, m.id, m.name || "Mode"))),
    );
    this.wirePanZoom(area);
    requestAnimationFrame(() => this.applyTransform());
    return area;
  }

  _geomCompareColumn(view, modeId, label) {
    this._geomModeOverride = modeId; // force _activeGeometry()/_activeGeomScale() while this column's scene builds
    const scene = this.renderGeometryScene(view);
    this._geomModeOverride = null;
    return h(
      "div",
      { class: "compare-col canvas-scheme-" + this.resolvedCanvasScheme(), style: "--canvas-bg:" + this.canvasBg() },
      h("div", { class: "compare-col-label" }, label),
      scene,
    );
  }


  // renderGeometryScene — the canvas "Geometry" view: the FULL dataset. (1) the 6-size CONTROL ramp, each
  // step a live mock control (leading glyph · label · caret) at its real height/icon/font/pad/radius with a
  // metrics readout; (2) the RADIUS ladder; (3) the SPACE scale. Tokens mode drops the live boxes for
  // metrics only. The control text size (font) comes from the type UI scale (the composition), so
  // ensureTypeFonts() makes that font real; paints in the canvas preview scheme (var(--ink*) flips).
  renderGeometryScene(view) {
    ensureTypeFonts();
    const cfg = this.doc.geometry || DEFAULT_GEOMETRY;
    const scale = this._activeGeomScale(); // composed with the type scale — per-step `font` is the brand UI size
    const t = GEOMETRY_TREATMENTS.find((x) => x.id === cfg.treatment) || GEOMETRY_TREATMENTS[0];
    const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    // painted in the SELECTED palette's own prime/on-prime — same resolution geomExampleCard uses, so
    // the canvas ramp isn't a generic-accent mock while the pinned inspector card is palette-real.
    const { pick, main, onMain } = this._geomPaletteColors(view);
    // the control ramp renders LARGEST → smallest (biggest example first); heights are monotonic by step.
    const SIZE_NAMES = ["2XL", "XL", "LG", "MD", "SM", "XS"];
    const ctlLine = (name) => {
      const s = scale.sizes[name];
      if (!s) return false;
      const box = h(
        "div",
        {
          class: "geom-ctl",
          style: `background:${pick(main)};color:${pick(onMain)};height:${s.height}px;font-size:${s.font}px;gap:${s.gap}px;padding-inline-start:${s.paddingNarrow}px;padding-inline-end:${s.paddingNarrow}px;border-radius:${s.radiusPill}px`,
          title: `height ${s.height} · icon ${s.icon} · font ${s.font} · pad ${s.paddingNarrow} · gap ${s.gap} · radius ${s.radiusPill}`,
        },
        h("span", { class: "geom-glyph", style: `width:${s.icon}px;height:${s.icon}px` }, icon("calendar-blank", { size: s.icon })),
        h("span", { class: "geom-ctl-label" }, "Button"),
        h("span", { class: "geom-caret", style: `width:${s.caret}px;height:${s.caret}px` }, icon("caret-left")),
      );
      return h(
        "div",
        { class: "geom-spec-line" },
        h(
          "div",
          { class: "geom-spec-meta" },
          h("code", { class: "geom-spec-token" }, `--size-${kebab(name)}`),
          h("span", { class: "geom-spec-dims" }, `${s.height}h`),
          h("span", { class: "geom-spec-dims" }, `icon ${s.icon}`),
          h("span", { class: "geom-spec-dims" }, `font ${s.font}`),
          h("span", { class: "geom-spec-dims" }, `pad ${s.paddingNarrow}`),
          h("span", { class: "geom-spec-dims" }, `r ${s.radiusPill}`),
        ),
        h("div", { class: "geom-spec-render" }, box),
      );
    };
    const ladderRow = (entries, swatch) =>
      h("div", { class: "geom-scale-row" }, ...entries.map(swatch));
    return h(
      "div",
      { class: "geom-spec" },
      h("div", { class: "geom-spec-head" }, h("b", {}, t.label), h("small", {}, `${scale.baseHeight}px base · 6 sizes · ${scale.density}× density`)),
      h("p", { class: "geom-spec-note" }, t.note + " — every glyph centers in a square cell of side = the control height, so edge padding = (height − glyph)/2. The ramp + paddings are computed, not authored."),
      h("p", { class: "geom-shared-note" }, icon("type"), h("span", {}, "Text size (", h("b", {}, "font"), ") per step is the control-text ramp — its own fixed table (12·13·15·16·18·20 at base 28), deliberately decoupled from the Label voice; it surfaces in Figma as the Typography collection's UI-widget/UI-control size variables.")),
      h(
        "div",
        { class: "geom-spec-group" },
        h("div", { class: "geom-spec-grouphead" }, h("b", {}, "Controls"), h("small", {}, "height · icon · font · pad · radius"), h("span", { class: "geom-spec-count" }, "6 sizes")),
        ...SIZE_NAMES.map(ctlLine),
      ),
      h(
        "div",
        { class: "geom-spec-group" },
        h("div", { class: "geom-spec-grouphead" }, h("b", {}, "Radius"), h("small", {}, t.radiusStyle), h("span", { class: "geom-spec-count" }, `${Object.keys(scale.radii).length} steps`)),
        ladderRow(Object.entries(scale.radii), ([k, v]) =>
          h("span", { class: "geom-chip" }, h("span", { class: "geom-radius-swatch", style: `border-radius:${Math.min(v, 24)}px` }), `${k} ${v === 9999 ? "pill" : v}`)),
      ),
      h(
        "div",
        { class: "geom-spec-group" },
        h("div", { class: "geom-spec-grouphead" }, h("b", {}, "Space"), h("small", {}, `${t.spaceBase}px base`), h("span", { class: "geom-spec-count" }, `${Object.keys(scale.space).length} steps`)),
        ladderRow(Object.entries(scale.space), ([k, v]) =>
          h("span", { class: "geom-chip", title: `--space-${k}: ${v}px` }, h("span", { class: "geom-space-bar", style: `width:${Math.max(1, v)}px` }), `${v}`)),
      ),
    );
  }


  // ── Geometry analysis (left rail, READ-ONLY) ──────────────────────────────────────────
  // The geometry analog of analysisCards(): diagrams of the resolved dimensional system — pure functions
  // of geometryScale(doc), no inputs. Reuses .an-card / .an-svg / legend(). `view` is accepted for dispatch
  // parity but unused (geometry is doc-driven, not palette-view-driven).
  geomAnalysisCards(view) {
    const scale = this._activeGeomScale();
    const card = (label, body) => h("div", { class: "an-card" }, h("div", { class: "an-label" }, label), body);
    return [
      card("Centering law — pad = ½(height − glyph)", this.graphGeomCentering(scale)),
      card("Power-law ramp — icon & font vs height", this.graphGeomPower(scale)),
      card("Two-band ramp — height per step", this.graphGeomBands(scale)),
      card("Font ← Typography UI — shared text size", this.graphGeomComposition(scale)),
    ];
  }


  // the centering law, drawn: a square CELL (side = control height) with the glyph centred in it; the equal
  // gaps either side ARE the derived edge padding ½(height − glyph). Numbers are the LG size's real px.
  graphGeomCentering(scale) {
    const s = scale.sizes.LG || Object.values(scale.sizes)[0];
    if (!s) return h("div", { class: "an-empty" }, "—");
    const W = 244, H = 116, side = 80;
    const x0 = (W - side) / 2, y0 = (H - side) / 2;
    const g = side * (s.icon / s.height); // glyph drawn proportional to icon/height
    const gx = x0 + (side - g) / 2, gy = y0 + (side - g) / 2;
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect class="gc-cell" x="${x0}" y="${y0}" width="${side}" height="${side}" rx="2"/>
        <rect class="gc-glyph" x="${gx.toFixed(1)}" y="${gy.toFixed(1)}" width="${g.toFixed(1)}" height="${g.toFixed(1)}" rx="2"/>
        <line class="gc-pad" x1="${x0}" y1="${gy.toFixed(1)}" x2="${gx.toFixed(1)}" y2="${gy.toFixed(1)}"/>
        <line class="gc-pad" x1="${(gx + g).toFixed(1)}" y1="${(gy + g).toFixed(1)}" x2="${(x0 + side).toFixed(1)}" y2="${(gy + g).toFixed(1)}"/>
      </svg>`;
    return h(
      "div",
      {},
      h("div", { class: "an-svg", html: svg }),
      h("div", { class: "geom-an-cap" }, `LG · cell ${s.height} · glyph ${s.icon} · pad ½(${s.height}−${s.icon}) = ${(s.height - s.icon) / 2}`),
    );
  }


  // icon & font vs control height across the six sizes — both glyphs scale SUBLINEARLY (a power law of
  // height, exponent < 1), so the curves bend below the faint height diagonal. fill:none on the lines.
  graphGeomPower(scale) {
    const rows = ["XS", "SM", "MD", "LG", "XL", "2XL"].map((n) => scale.sizes[n]).filter(Boolean);
    if (!rows.length) return h("div", { class: "an-empty" }, "—");
    const W = 244, H = 132, pad = 26;
    const maxH = Math.max(...rows.map((s) => s.height)) * 1.05;
    const maxV = Math.max(...rows.map((s) => Math.max(s.icon, s.font, s.height))) * 1.05;
    const X = (hh) => pad + (hh / maxH) * (W - pad - 8);
    const Y = (v) => (H - pad + 8) - (v / maxV) * (H - pad - 8);
    const path = (key) => "M" + rows.map((s) => `${X(s.height).toFixed(1)},${Y(s[key]).toFixed(1)}`).join(" L");
    const dots = (key, cls) => rows.map((s) => `<circle class="${cls}" cx="${X(s.height).toFixed(1)}" cy="${Y(s[key]).toFixed(1)}" r="1.8"/>`).join("");
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <path class="gp-ref" d="${path("height")}"/>
        <path class="gp-icon" d="${path("icon")}"/>${dots("icon", "gp-dot gp-dot-icon")}
        <path class="gp-font" d="${path("font")}"/>${dots("font", "gp-dot gp-dot-font")}
        <text x="2" y="14">px</text>
        <text x="${W - 44}" y="${H - pad + 18}">height→</text>
      </svg>`;
    return h(
      "div",
      {},
      h("div", { class: "an-svg", html: svg }),
      this.legend([{ mark: "gp ref", label: "height" }, { mark: "gp icon", label: "icon 2.49·h^.58" }, { mark: "gp font", label: "font ≈ √h" }]),
    );
  }


  // control height per step index — the two-band ramp (compact +4 linear below MD, expressive ×4/3
  // geometric above LG), with a marker at the MD|LG seam where the ramp changes gear.
  graphGeomBands(scale) {
    const rows = ["XS", "SM", "MD", "LG", "XL", "2XL"].map((n) => ({ n, hh: scale.sizes[n] && scale.sizes[n].height })).filter((r) => r.hh);
    if (rows.length < 2) return h("div", { class: "an-empty" }, "—");
    const W = 244, H = 124, pad = 26;
    const maxH = Math.max(...rows.map((r) => r.hh)) * 1.05;
    const X = (i) => pad + (i / (rows.length - 1)) * (W - pad - 8);
    const Y = (hh) => (H - pad + 8) - (hh / maxH) * (H - pad - 8);
    const d = "M" + rows.map((r, i) => `${X(i).toFixed(1)},${Y(r.hh).toFixed(1)}`).join(" L");
    const dots = rows.map((r, i) => `<circle class="gp-dot gp-dot-font" cx="${X(i).toFixed(1)}" cy="${Y(r.hh).toFixed(1)}" r="1.9"/>`).join("");
    const seamX = ((X(2) + X(3)) / 2).toFixed(1);
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <line class="dg-unity" x1="${seamX}" y1="8" x2="${seamX}" y2="${H - pad + 8}"/>
        <text x="${(+seamX + 3).toFixed(1)}" y="15">MD|LG seam</text>
        <path class="gp-font" d="${d}"/>${dots}
        <text x="2" y="14">px</text>
        <text x="${W - 48}" y="${H - pad + 18}">XS→2XL</text>
      </svg>`;
    return h("div", { class: "an-svg", html: svg });
  }


  // the composition link — when the geometry is composed with a type scale, each control's text size
  // (font) IS the Typography UI voice at the matching step. Lists the six steps + their derived rhythm.
  graphGeomComposition(scale) {
    return h(
      "div",
      { class: "geom-comp" },
      h("p", { class: "geom-comp-note" }, "Each control's text size is the fixed control-text ramp (its own hand-ratified table, decoupled from the Label voice); gap = font/2, caret has its own power law."),
      h(
        "div",
        { class: "geom-comp-rows" },
        ...["XS", "SM", "MD", "LG", "XL", "2XL"].map((n) => {
          const s = scale.sizes[n];
          return s ? h("div", { class: "geom-comp-row" }, h("span", { class: "geom-comp-k" }, n), h("span", { class: "geom-comp-v" }, `font ${s.font}`), h("span", { class: "geom-comp-v dim" }, `caret ${s.caret} · gap ${s.gap}`)) : false;
        }),
      ),
    );
  }


  // ── Geometry inspector (right pane) ───────────────────────────────────────────
  // The geometry analog of renderTypeInspector: a .pane-head segmented tablist + a scrollable .seg-body + a
  // pinned .seg-example live control. Binds ONLY to doc.geometry = { treatment, baseHeight } (the two fields
  // the engine + persist carry). Density / radius style / spacing come from the treatment, shown READ-ONLY,
  // exactly as the Typography inspector shows per-voice params read-only.
  renderGeomInspector(view) {
    const seg = this.geomSegment === "radius" || this.geomSegment === "space" ? this.geomSegment : "ramp";
    const body = seg === "radius" ? this.geomRadiusTab() : seg === "space" ? this.geomSpaceTab() : this.geomRampTab();
    const tabs = [{ id: "ramp", label: "Ramp" }, { id: "radius", label: "Radius" }, { id: "space", label: "Space" }];
    return h(
      "aside",
      { class: "right-pane" },
      h("div", { class: "pane-head" },
        this.panesRight ? this.paneToggle("right") : false,
        this.segmented(tabs, seg, (id) => { this.geomSegment = id; this.render(); }, { ariaLabel: "Geometry inspector", idPrefix: "gtab", controls: "gi-panel" })),
      h("div", { class: "seg-body", role: "tabpanel", id: "gi-panel", "aria-labelledby": "gtab-" + seg }, body),
      h("div", { class: "seg-example" }, this.geomExampleCard(view)),
    );
  }


  // geomRampTab — the WRITABLE controls (treatment + base height), then a READ-ONLY per-size summary of
  // what the centering law yields (icon · font · pad · gap · radius), + the composition note + download.
  geomRampTab() {
    const cfg = this.doc.geometry || DEFAULT_GEOMETRY;
    const t = GEOMETRY_TREATMENTS.find((x) => x.id === cfg.treatment) || GEOMETRY_TREATMENTS[0];
    const scale = this._activeGeomScale();
    return h(
      "div",
      { class: "insp-body" },
      h("h3", { class: "insp-title" }, icon("ruler"), "Size ramp"),
      h("div", { class: "insp-sub" }, "Choose a treatment + base height — icon, font, padding, gap & radius follow by the centering law."),
      field(
        "Treatment",
        h(
          "select",
          { "data-fk": "gi:treatment", onchange: (e) => this._pickGeomTreatment(e.target.value) },
          ...GEOMETRY_TREATMENTS.map((x) => h("option", { value: x.id, selected: cfg.treatment === x.id ? true : undefined }, this._treatmentLocked(x.id, "comfortable") ? x.label + " · Pro" : x.label)),
        ),
      ),
      this.slider(this.geomMode === "base" || this.geomMode === "compare" ? "Base height" : "Base height · this breakpoint", scale.baseHeight, 20, 48, 2, (v) => fmt(v) + "px", (v) => this._setActiveGeomBaseHeight(v)),
      // the responsive-ramp knob: 100% = the full ×4/3 expressive gear; 0% = the band goes linear
      // (+4 past MD) — the compressed ramp small screens want. Per-mode, like the height slider.
      this.slider(this.geomMode === "base" || this.geomMode === "compare" ? "Ramp contrast" : "Ramp contrast · this breakpoint", scale.rampContrast ?? 1, 0, 1, 0.05, (v) => Math.round(v * 100) + "%", (v) => this._setActiveGeomRampContrast(v)),
      this._geomModeEditor(),
      h("p", { class: "insp-sub tyi-note" }, t.note),
      h(
        "div",
        { class: "tyi-voices" },
        h("div", { class: "tyi-voices-head" }, h("b", {}, "Per-size"), h("small", {}, "select a size to tune its height")),
        ...["XS", "SM", "MD", "LG", "XL", "2XL"].map((n) => {
          const s = scale.sizes[n];
          if (!s) return false;
          const sel = this.geomSize === n;
          const tuned = Number.isFinite((cfg.tokenOverrides || {})[n + "|" + this._geomActiveModeKey()]);
          const stats = h(
            "dl",
            { class: "tyi-voice-stats" },
            h("div", {}, h("dt", {}, "Icon"), h("dd", {}, `${s.icon}`)),
            h("div", {}, h("dt", {}, "Font"), h("dd", {}, `${s.font}`)),
            h("div", {}, h("dt", {}, "Pad"), h("dd", {}, `${s.paddingNarrow}`)),
            h("div", {}, h("dt", {}, "Gap"), h("dd", {}, `${s.gap}`)),
            h("div", {}, h("dt", {}, "Radius"), h("dd", {}, `${s.radiusPill}`)),
          );
          return h(
            "div",
            { class: "tyi-voice" + (sel ? " is-sel" : "") + (tuned ? " is-tuned" : "") },
            h(
              "button",
              { type: "button", class: "tyi-voice-name", "data-fk": "gsize:" + n, "aria-expanded": sel ? "true" : "false",
                onclick: () => { this.geomSize = sel ? null : n; this.render(); } },
              h("span", { class: "tyi-voice-label" }, n, tuned ? h("span", { class: "tyi-voice-dot", title: "Height tuned off the ramp" }, " ●") : false),
              h("span", { class: "tyi-voice-font" }, `${s.height}px`),
            ),
            sel
              ? h(
                  "div",
                  { class: "tyi-voice-edit" },
                  this.slider("Height", s.height, 16, 96, 1, (v) => fmt(v) + "px", (v) => this._setGeomSize(n, v)),
                  stats,
                  tuned ? btn("Reset size", { variant: "ghost", cls: "tyi-voice-reset", onclick: () => this.clearGeomTokenOverride(n, this._geomActiveModeKey()) }) : false,
                )
              : stats,
          );
        }),
      ),
      h("p", { class: "insp-sub tyi-future" }, "Text size (font) per step is the control-text ramp — decoupled from the type scale; in Figma it lives in the Typography collection as UI-widget/UI-control sizes."),    );
  }


  // geomRadiusTab — the corner ladder the treatment resolves to (none·sm·md·lg·full). The radius STYLE is
  // set by the treatment (read-only here, like the type fonts).
  geomRadiusTab() {
    const cfg = this.doc.geometry || DEFAULT_GEOMETRY;
    const t = GEOMETRY_TREATMENTS.find((x) => x.id === cfg.treatment) || GEOMETRY_TREATMENTS[0];
    const scale = this._activeGeomScale();
    return h(
      "div",
      { class: "insp-body" },
      h("h3", { class: "insp-title" }, icon("ruler"), "Radius ladder"),
      h("div", { class: "insp-sub" }, `The ${t.radiusStyle} corner ladder for the ${t.label} treatment. A fully-round control is a pill (radius = height/2).`),
      h(
        "div",
        { class: "geom-lad" },
        ...Object.entries(scale.radii).map(([k, v]) =>
          h(
            "div",
            { class: "geom-lad-row" },
            h("span", { class: "geom-radius-swatch", style: `border-radius:${v === 9999 ? 18 : Math.min(v, 18)}px` }),
            h("span", { class: "geom-lad-k" }, k),
            h("span", { class: "geom-lad-v" }, v === 9999 ? "pill" : `${v}px`),
          ),
        ),
      ),
      h("p", { class: "insp-sub tyi-future" }, "The radius style is set by the treatment. Per-token radius overrides are a future step."),    );
  }


  // geomSpaceTab — the layout-spacing scale (--space-*): the rhythm BETWEEN components (gutters, gaps,
  // section rhythm), a separate concern from the in-control padding the centering law governs.
  geomSpaceTab() {
    const cfg = this.doc.geometry || DEFAULT_GEOMETRY;
    const t = GEOMETRY_TREATMENTS.find((x) => x.id === cfg.treatment) || GEOMETRY_TREATMENTS[0];
    const scale = this._activeGeomScale();
    const maxV = Math.max(1, ...Object.values(scale.space));
    return h(
      "div",
      { class: "insp-body" },
      h("h3", { class: "insp-title" }, icon("ruler"), "Space scale"),
      h("div", { class: "insp-sub" }, `Layout rhythm in ${t.spaceBase}px multiples — the space between components, not the padding inside one.`),
      h(
        "div",
        { class: "geom-lad" },
        ...Object.entries(scale.space).map(([k, v]) =>
          h(
            "div",
            { class: "geom-lad-row" },
            h("span", { class: "geom-lad-k" }, `--space-${k}`),
            h("span", { class: "geom-space-track" }, h("span", { class: "geom-space-fill", style: `width:${Math.round((v / maxV) * 100)}%` })),
            h("span", { class: "geom-lad-v" }, `${v}px`),
          ),
        ),
      ),    );
  }


  // _geomPaletteColors(view) — the SELECTED palette's resolved roles, ready to paint a mock control:
  // surface/onSurface (the card ground) + the palette's own prime/on-prime (a "primary button" look).
  // Shared by geomExampleCard and the canvas ramp's ctlLine so every mock control — canvas or inspector
  // — reflects the actual palette being designed, not a generic fallback accent.
  _geomPaletteColors(view) {
    const p = view.palettes[this.selectedIndex()];
    const roles = (p && p.roles) || [];
    const dark = this.resolvedCanvasScheme() === "dark";
    const sl = slug((p && p.name) || "");
    const byKey = {};
    for (const r of roles) byKey[r.key] = r;
    const pick = (role) => (role ? (dark ? role.darkHex : role.lightHex) : "transparent");
    const main = roles.find((r) => r.suffix === "");
    const onMain = roles.find((r) => r.suffix === "-on-" + sl);
    return { pick, byKey, main, onMain };
  }

  // geomExampleCard — the pinned live card: a few real controls (Button · Chip · Input) built from the
  // resolved geometry AND painted in the SELECTED palette's roles. Mirrors typeExampleCard's resolution.
  geomExampleCard(view) {
    const scale = this._activeGeomScale();
    const s = scale.sizes.MD || Object.values(scale.sizes)[0];
    if (!s) return h("div", { class: "example-card" });
    const { pick, byKey, main, onMain } = this._geomPaletteColors(view);
    return h(
      "div",
      { class: "example-card geom-example", style: "background:" + pick(byKey.surface) },
      h("div", { class: "geom-ex-title", style: "color:" + pick(byKey.onSurface) }, `MD · ${s.height}px control`),
      h(
        "div",
        { class: "geom-ex-row" },
        h(
          "button",
          {
            class: "geom-ex-ctl",
            tabindex: "-1",
            style: `background:${pick(main)};color:${pick(onMain)};height:${s.height}px;font-size:${s.font}px;gap:${s.gap}px;padding-inline:${s.paddingNarrow}px;border-radius:${s.radiusPill}px`,
          },
          h("span", { class: "geom-ex-glyph", style: `width:${s.icon}px;height:${s.icon}px` }),
          "Button",
          h("span", { class: "geom-ex-caret", style: `width:${s.caret}px;height:${s.caret}px` }, icon("caret-left")),
        ),
        // Chip — a smaller, pill-only affordance (no caret): containerHigh, a visible-but-quieter tint
        // of the palette's own hue rather than its full-strength prime, since a chip is lower-emphasis.
        h(
          "span",
          {
            class: "geom-ex-chip",
            style: `background:${pick(byKey.containerHigh)};color:${pick(byKey.onSurface)};height:${s.height}px;font-size:${s.font}px;gap:${s.gap}px;padding-inline:${s.paddingNarrow}px;border-radius:${s.radiusPill}px`,
          },
          "Chip",
          h("span", { class: "geom-ex-chip-x", style: `width:${s.icon}px;height:${s.icon}px` }, icon("x", { size: s.icon })),
        ),
        // Input — an outlined field (never filled with the prime color; a field's own ground is surface).
        // outlineVariant matches how this app's own shadcn export maps an input border (exports.js);
        // placeholder is the role built specifically for this exact text archetype (semantic.js).
        h(
          "span",
          {
            class: "geom-ex-input",
            style: `border-color:${pick(byKey.outlineVariant)};color:${pick(byKey.placeholder)};height:${s.height}px;font-size:${s.font}px;padding-inline:${s.paddingNarrow}px;border-radius:${Math.min(s.radiusPill, 10)}px`,
          },
          "Search…",
        ),
      ),
    );
  }
}
export const GeomSection = GeomSectionImpl;
