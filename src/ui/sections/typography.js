import { slug } from "../model.mjs";
import { hydrate, serialize } from "../persist.js";
import { BUNDLED_FONTS, DEFAULT_TYPE, TYPE_TREATMENTS, WEIGHT_NAMES, genericFor, resolvedFontFor, siblingWeightDefaults, typeScale, typeTokensBreakpointCSS, typeTokensCSS, typeTokensDTCG } from "../../engine/type.mjs";
import { icon } from "../icons.js";
import { GENERIC_FONTS, SELF_HOSTED_FONTS, TYPE_PARA, TYPE_SAMPLE, btn, ensureTypeFonts, ensureWebFonts, field, fmt, h } from "../app-helpers.mjs";

// Prototype mixin (TKT-0023): a class body used ONLY as a verbatim, comma-free carrier for these
// methods — copied onto HctApp.prototype (see app.js's mixin() call), never instantiated directly.
export class TypeSectionImpl {

  // ── Typography analysis (left rail, READ-ONLY) ────────────────────────────────────────
  // The type analog of analysisCards(): cards computed from typeScale(doc.type). No inputs — pure
  // diagnostics of the resolved scale. `view` is accepted for dispatch parity but unused (typography
  // is doc-driven, not palette-view-driven). Reuses .an-card / .an-svg / legend().
  typeAnalysisCards(view) {
    const scale = this._activeTypeScale();
    const card = (label, body) => h("div", { class: "an-card" }, h("div", { class: "an-label" }, label), body);
    const SHORT = { "Display": "Disp", "Headline": "Head", "Sub-heading": "Sub", "Title": "Title", "Sub-title": "Subt", "Lead": "Lead", "Body": "Body", "Body-mono": "BodyM", "Label": "Label", "Label-mono": "LabelM", "Kicker": "Kick", "Tiny": "Tiny", "Tiny-mono": "TinyM", "UI-control": "UICtl", "UI-widget": "UIWdg" };
    const series = Object.keys(scale.categories)
      .map((c) => ({ cat: c, short: SHORT[c] || c, steps: Object.entries(scale.categories[c] || {}).map(([name, s]) => ({ name, ...s })) }))
      .filter((x) => x.steps.length);
    return [
      card("Modular scale — size (px) per step", this.graphTypeScale(series)),
      card("Optical tracking — letter-spacing vs size", this.graphTypeTracking(series)),
      card("Leading — line-height ÷ size per step", this.graphTypeLeading(series)),
      card("Font roles — family per voice", this.graphTypeRoles(scale)),
    ];
  }


  // four-voice size series, X = step index within the voice (normalized so the geometric growth is
  // comparable across voices of different length), Y = size px.
  graphTypeScale(series) {
    if (!series.length) return h("div", { class: "an-empty" }, "—");
    const W = 244, H = 132, pad = 24;
    const maxSize = Math.max(8, ...series.flatMap((g) => g.steps.map((s) => s.size))) * 1.05;
    const X = (i, n) => pad + (n <= 1 ? 0 : i / (n - 1)) * (W - pad - 8);
    const Y = (px) => (H - pad + 8) - (px / maxSize) * (H - pad - 8);
    const paths = series.map((g, gi) => {
      const n = g.steps.length;
      const d = "M" + g.steps.map((s, i) => `${X(i, n).toFixed(1)},${Y(s.size).toFixed(1)}`).join(" L");
      const dots = g.steps.map((s, i) => `<circle class="ty-dot ty-s${gi}" cx="${X(i, n).toFixed(1)}" cy="${Y(s.size).toFixed(1)}" r="1.6"/>`).join("");
      return `<path class="ty-line ty-s${gi}" d="${d}"/>${dots}`;
    }).join("");
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <text x="2" y="14">px</text>
        <text x="${W - 40}" y="${H - pad + 18}">SM→LG</text>
        ${paths}
      </svg>`;
    return h("div", {}, h("div", { class: "an-svg", html: svg }), this.legend(series.map((g, gi) => ({ mark: "ty s" + gi, label: g.short || g.cat }))));
  }


  // letter-spacing (px) vs size (px); a dashed unity line marks tracking = 0.
  graphTypeTracking(series) {
    if (!series.length) return h("div", { class: "an-empty" }, "—");
    const W = 244, H = 124, pad = 26;
    const all = series.flatMap((g) => g.steps);
    const maxSize = Math.max(8, ...all.map((s) => s.size)) * 1.05;
    const tr = all.map((s) => s.letterSpacing);
    const tMax = Math.max(0.5, ...tr), tMin = Math.min(-0.5, ...tr), tSpan = (tMax - tMin) || 1;
    const X = (px) => pad + (px / maxSize) * (W - pad - 8);
    const Y = (t) => 8 + ((tMax - t) / tSpan) * (H - pad - 8);
    const zeroY = Y(0).toFixed(1);
    const paths = series.map((g, gi) => {
      const sorted = [...g.steps].sort((a, b) => a.size - b.size);
      const d = "M" + sorted.map((s) => `${X(s.size).toFixed(1)},${Y(s.letterSpacing).toFixed(1)}`).join(" L");
      const dots = sorted.map((s) => `<circle class="ty-dot ty-s${gi}" cx="${X(s.size).toFixed(1)}" cy="${Y(s.letterSpacing).toFixed(1)}" r="1.6"/>`).join("");
      return `<path class="ty-line ty-s${gi}" d="${d}"/>${dots}`;
    }).join("");
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <line class="dg-unity" x1="${pad}" y1="${zeroY}" x2="${W - 6}" y2="${zeroY}"/>
        <text x="2" y="${(+zeroY - 3).toFixed(1)}">0</text>
        <text x="2" y="14">px</text>
        <text x="${W - 30}" y="${H - pad + 18}">size→</text>
        ${paths}
      </svg>`;
    return h("div", {}, h("div", { class: "an-svg", html: svg }), this.legend(series.map((g, gi) => ({ mark: "ty s" + gi, label: g.short || g.cat }))));
  }


  // leading ratio = lineHeight ÷ size per step (tight at display, loose at body). X = step index per voice.
  graphTypeLeading(series) {
    if (!series.length) return h("div", { class: "an-empty" }, "—");
    const W = 244, H = 124, pad = 26;
    const ratios = series.flatMap((g) => g.steps.map((s) => s.lineHeight / s.size));
    const rMax = Math.max(1.7, ...ratios) * 1.02, rMin = Math.min(0.95, ...ratios), rSpan = (rMax - rMin) || 1;
    const X = (i, n) => pad + (n <= 1 ? 0 : i / (n - 1)) * (W - pad - 8);
    const Y = (r) => 8 + ((rMax - r) / rSpan) * (H - pad - 8);
    const paths = series.map((g, gi) => {
      const n = g.steps.length;
      const d = "M" + g.steps.map((s, i) => `${X(i, n).toFixed(1)},${Y(s.lineHeight / s.size).toFixed(1)}`).join(" L");
      const dots = g.steps.map((s, i) => `<circle class="ty-dot ty-s${gi}" cx="${X(i, n).toFixed(1)}" cy="${Y(s.lineHeight / s.size).toFixed(1)}" r="1.6"/>`).join("");
      return `<path class="ty-line ty-s${gi}" d="${d}"/>${dots}`;
    }).join("");
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <text x="2" y="14">×</text>
        <text x="${W - 40}" y="${H - pad + 18}">SM→LG</text>
        ${paths}
      </svg>`;
    return h("div", {}, h("div", { class: "an-svg", html: svg }), this.legend(series.map((g, gi) => ({ mark: "ty s" + gi, label: g.short || g.cat }))));
  }


  // font-role pairings — the 5 role→family assignments (no SVG; a small key, like the contrast bars).
  graphTypeRoles(scale) {
    const ROLES = [["display", "Display"], ["heading", "Heading"], ["body", "Body"], ["ui", "UI"], ["mono", "Mono"]];
    return h(
      "div",
      { class: "ty-roles" },
      ...ROLES.map(([role, label]) => {
        const fam = scale.fonts[role] || "—";
        const generic = genericFor(fam, role);
        return h("div", { class: "ty-role" }, h("span", { class: "ty-role-k" }, label), h("span", { class: "ty-role-fam", style: `font-family:'${fam}', ${generic}` }, fam));
      }),
    );
  }


  setTypeSpecMode(v) { this.typeSpecMode = v; this.render(); }


  // ── Typography breakpoint modes (Phase 5) — named bodyBase variants layered over doc.type. The ACTIVE
  // mode drives the canvas preview + the inspector; "base" is doc.type itself. (Per-mode Compare + export
  // are the follow-up slices.) Modes persist on doc.type.modes = [{ id, name, bodyBase }].
  // _effTypeMode — the mode the ACTIVE resolvers paint in: a Compare column's _typeModeOverride wins (so its
  // scene + scale build at THAT breakpoint while it renders, exactly like _schemeOverride), else this.typeMode.
  // "compare" is not a real mode id, so off-override it falls through _typeScaleFor's unknown-mode → base.
  _effTypeMode() { return this._typeModeOverride != null ? this._typeModeOverride : this.typeMode; }

  _activeType() {
    const t = this.doc.type || DEFAULT_TYPE;
    const mode = this._effTypeMode();
    if (mode === "base") return t;
    const m = (t.modes || []).find((x) => x.id === mode);
    // a factor mode (the Standard set) keeps the doc bodyBase — the compression lives in the scale, not here.
    return m ? { ...t, bodyBase: m.bodyBase ?? t.bodyBase } : t; // a deleted/unknown mode (incl. "compare") falls back to base
  }

  // the resolved type scale at the ACTIVE mode, WITH that mode's per-cell overrides (so the specimen +
  // inspector reflect the matrix edits). A deleted/unknown mode resolves through "base" in _typeScaleFor.
  _activeTypeScale() {
    const t = this.doc.type || DEFAULT_TYPE;
    const mode = this._effTypeMode();
    const key = mode === "base" || !(t.modes || []).some((m) => m.id === mode) ? "base" : mode;
    return this._typeScaleFor(key);
  }

  // the Mode control in the Typography canvas header: the base layer + each breakpoint, plus "+" to add one.
  // A NAMED base (doc.type.baseName, e.g. "Mobile" — the standard set) renders LAST: the canonical order is
  // desktop-first (Desktop · Tablet · Mobile), matching the Figma mode-column order the emitters produce.
  typeModeControl() {
    const t = this.doc.type || DEFAULT_TYPE;
    const modes = t.modes || [];
    const { baseName: bn, baseLast } = this._typeBaseOpts();
    // reset an unknown/deleted mode to base — but "compare" (Phase 5.3) is a valid pseudo-mode, allow it.
    if (this.typeMode !== "base" && this.typeMode !== "compare" && !modes.some((m) => m.id === this.typeMode)) this.typeMode = "base";
    const baseItem = { id: "base", label: bn, title: `${bn} type scale · ${t.bodyBase ?? DEFAULT_TYPE.bodyBase}px` };
    const modeItems = modes.map((m) => ({ id: m.id, label: m.name || "Mode", title: m.factor ? `${m.name || "Mode"} · display ×${Math.round(m.factor * 100)}% (body frozen)` : `${m.name || "Mode"} · ${m.bodyBase}px body` }));
    const items = [
      ...(baseLast ? [...modeItems, baseItem] : [baseItem, ...modeItems]),
      // Compare = all breakpoints side by side (Phase 5.3). Meaningless with only the base, so only when ≥1 mode.
      ...(modes.length ? [{ id: "compare", label: "Compare", title: "All breakpoints side by side" }] : []),
    ];
    return h(
      "div",
      { class: "mode-control" },
      this.segmented(items, this.typeMode, (id) => { this.typeMode = id; this.render(); },
        { cls: "canvas-seg", ariaLabel: "Typography breakpoint mode", role: "group", idPrefix: "tmode" }),
      btn(icon("plus"), { cls: "mode-add", ariaLabel: "Add a breakpoint mode", title: "Add a breakpoint — a named scale with its own body size", onclick: () => this.addTypeMode() }),
      // one-click standard set — only while no modes exist (it would duplicate names otherwise). It
      // MATERIALIZES the intrinsic synthesized modes as editable doc modes (same values, same law).
      ...(modes.length === 0 ? [btn("Standard set", { cls: "mode-add", ariaLabel: "Add the standard breakpoint set", title: "Materialize the standard breakpoints for editing — your scale IS Desktop (1280, Figma's default mode); Tablet 992 and Mobile ≤476 derive down with body frozen and display compressed (×83% / ×67% at the top of the ramp).", onclick: () => this.addStandardTypeModes() })] : []),
    );
  }

  // addStandardTypeModes — materialize the intrinsic standard set as editable doc modes (Kim's ratified
  // desktop-anchored law, 2026-07-10): the designed scale IS Desktop (the base, first, Figma's default
  // mode — baseName "Desktop"); Tablet (992) and Mobile (≤476, marker minWidth 476) derive DOWN via the
  // hierarchy-aware `factor` (body frozen, display ×5/6 / ×2/3). Same values the synthesized (no-modes)
  // shape exports — committing just makes them matrix-editable. The split CSS export (typeTokensCSS for
  // the unconditional Desktop base + typeTokensBreakpointCSS per mode) reads these directly, no re-anchor.
  addStandardTypeModes() {
    const seed = Date.now().toString(36);
    const rungs = [{ name: "Tablet", w: 992, factor: 5 / 6 }, { name: "Mobile", w: 476, factor: 2 / 3 }];
    this.typeMode = "base"; // stay on Desktop (the designed scale — nothing about it changed)
    this.commit((d) => {
      d.type = { ...(d.type || DEFAULT_TYPE), baseName: "Desktop" };
      const modes = d.type.modes ? [...d.type.modes] : [];
      rungs.forEach((r, i) => modes.push({ id: `tm-${seed}-${i}`, name: r.name, factor: r.factor, minWidth: r.w }));
      d.type.modes = modes;
    });
  }

  addTypeMode() {
    const id = "tm-" + Date.now().toString(36);
    this.typeMode = id; // point at the new mode (resolves to base until the commit lands)
    this.commit((d) => {
      d.type = { ...(d.type || DEFAULT_TYPE) };
      const modes = d.type.modes ? [...d.type.modes] : [];
      modes.push({ id, name: "Mode " + (modes.length + 1), bodyBase: d.type.bodyBase ?? DEFAULT_TYPE.bodyBase });
      d.type.modes = modes;
    });
  }

  deleteTypeMode(id) {
    // fall back to Base if we're deleting the active mode, OR if Compare would be left with no modes.
    const remaining = (this.doc.type && this.doc.type.modes || []).filter((m) => m.id !== id).length;
    if (this.typeMode === id || (this.typeMode === "compare" && remaining === 0)) this.typeMode = "base";
    this.commit((d) => {
      if (!d.type || !Array.isArray(d.type.modes)) return;
      d.type = { ...d.type, modes: d.type.modes.filter((m) => m.id !== id) };
      if (d.type.modes.length === 0) delete d.type.modes;
      // strip this mode's per-cell overrides too — orphaned "...|<id>" keys would otherwise survive
      // serialize→hydrate forever (a stale-override leak with no UI to reach them).
      if (d.type.tokenOverrides) {
        d.type = { ...d.type, tokenOverrides: { ...d.type.tokenOverrides } };
        for (const k of Object.keys(d.type.tokenOverrides)) if (k.endsWith("|" + id)) delete d.type.tokenOverrides[k];
        if (!Object.keys(d.type.tokenOverrides).length) delete d.type.tokenOverrides;
      }
    });
  }

  renameTypeMode(id, name) {
    this.commit((d) => {
      if (!d.type || !Array.isArray(d.type.modes)) return;
      d.type = { ...d.type, modes: d.type.modes.map((m) => (m.id === id ? { ...m, name: name || m.name } : m)) };
    });
  }

  // the Scale-tab body-size slider edits the ACTIVE mode (base → doc.type.bodyBase; a mode → its bodyBase).
  _setActiveTypeBodyBase(v) {
    const bb = Math.round(v);
    this.editDrag((d) => {
      d.type = { ...(d.type || DEFAULT_TYPE) };
      // Compare shows the Base scale in the inspector, so its slider edits Base (not a per-mode no-op).
      if (this.typeMode === "base" || this.typeMode === "compare") d.type.bodyBase = bb;
      else d.type.modes = (d.type.modes || []).map((m) => (m.id === this.typeMode ? { ...m, bodyBase: bb } : m));
    });
  }


  _typeModeEditor() {
    const t = this.doc.type || DEFAULT_TYPE;
    if (this.typeMode === "base") {
      const n = (t.modes || []).length;
      return h("p", { class: "insp-sub tyi-future" }, n
        ? `${n} breakpoint mode${n > 1 ? "s" : ""} — switch them from the canvas header; each carries its own body size (per-mode export is coming).`
        : "Add a breakpoint (the + in the canvas header) to give this scale a second body size for another screen — e.g. a smaller mobile body.");
    }
    const m = (t.modes || []).find((x) => x.id === this.typeMode);
    if (!m) return false;
    return h(
      "div",
      { class: "mode-editor" },
      h("label", { class: "mode-editor-label", for: "fld-mode-name" }, "Breakpoint name"),
      h(
        "div",
        { class: "mode-editor-row" },
        h("input", { id: "fld-mode-name", type: "text", value: m.name, "data-fk": "tmode-name", "aria-label": "Breakpoint mode name",
          onchange: (e) => this.renameTypeMode(m.id, e.target.value.trim()) }),
        btn(icon("trash"), { ariaLabel: "Delete this breakpoint", title: "Delete this breakpoint mode", onclick: () => this.deleteTypeMode(m.id) }),
      ),
      h("label", { class: "mode-editor-label", for: "fld-mode-mw" }, "Breakpoint width — @media min-width"),
      h(
        "div",
        { class: "mode-editor-row" },
        h("input", { id: "fld-mode-mw", type: "number", min: 0, max: 3840, step: 1, value: m.minWidth || "", placeholder: "e.g. 768", "data-fk": "tmode-mw", "aria-label": "Breakpoint min-width in px",
          onchange: (e) => this.setTypeModeMinWidth(m.id, e.target.value) }),
        h("span", { class: "mode-editor-unit" }, "px"),
      ),
      this._modeWidthPresets(m.minWidth, (w) => this.setTypeModeMinWidth(m.id, w)),
      h("p", { class: "insp-sub tyi-future" }, m.minWidth
        ? `Exports as @media (min-width: ${m.minWidth}px) — the size vars re-declare at this body size above ${m.minWidth}px.`
        : "Set a width to emit a CSS @media breakpoint in the export; blank = preview-only."),
    );
  }

  setTypeModeMinWidth(id, v) {
    const n = Math.round(Number(v));
    this.commit((d) => {
      if (!d.type || !Array.isArray(d.type.modes)) return;
      d.type = { ...d.type, modes: d.type.modes.map((m) => {
        if (m.id !== id) return m;
        const mm = { ...m };
        if (Number.isFinite(n) && n > 0) mm.minWidth = Math.max(1, Math.min(3840, n)); else delete mm.minWidth;
        return mm;
      }) };
    });
  }


  // renderTypeCanvasHeader — the Typography section's own canvas header: pane toggles + the
  // Specimen·Tokens mode segment + the reused fit/scheme/zoom controls. It deliberately omits the
  // color-only Palettes/Scrims/Mapping + stops segments and the "+ Palette" button.
  renderTypeCanvasHeader() {
    return h(
      "div",
      { class: "canvas-header" },
      !this.panesLeft ? this.paneToggle("left") : false,
      this.typeMode === "compare" ? false : this.segmented(
        [
          { id: "specimen", label: "Specimen", title: "Live faces — render each step in the real font" },
          { id: "tokens", label: "Tokens", title: "Editable token matrix — every step × Base + each breakpoint" },
        ],
        this.typeSpecMode,
        (id) => this.setTypeSpecMode(id),
        { cls: "canvas-seg", ariaLabel: "Type specimen mode", role: "group", idPrefix: "tspec" },
      ),
      this.typeModeControl(),
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


  // renderTypeCanvas — the Typography center. Specimen mode renders the full live specimen in the same
  // pannable/zoomable .canvas-area + .canvas-scene shell the color ramps use (wirePanZoom + applyTransform).
  // Tokens mode renders an EDITABLE token MATRIX (Phase 3 — per-cell size/height overrides + ↺) (rows = steps, cols = Base + each breakpoint) in the
  // scrolling .is-table shell instead — exactly how Color's Mapping view flips (see renderCanvasArea).
  renderTypeCanvas(view) {
    // Compare (Phase 5.3) — all breakpoints side by side. A Specimen/Controls view, so it wins over the tokens
    // table (mirrors how Color's "Both" wins over a non-table view in renderCanvasArea).
    if (this.typeMode === "compare") return this.renderTypeCompareArea(view);
    if (this.typeSpecMode === "tokens") return this._tokensTableArea("Typography tokens — Base + breakpoints", this.renderTypeTokensTable());
    const area = h(
      "div",
      {
        class: "canvas-area type-canvas canvas-scheme-" + this.resolvedCanvasScheme(),
        role: "group",
        "aria-label": "Typography specimen — drag to pan, wheel to zoom, double-click to reset",
      },
      h("div", { class: "canvas-scene" }, this.renderTypographyScene(view)),
    );
    this.wirePanZoom(area);
    requestAnimationFrame(() => this.applyTransform());
    return area;
  }


  // renderTypeCompareArea — the Typography "Compare" mode: the specimen rendered at Base AND each breakpoint
  // mode, side by side, inside ONE pannable .canvas-scene (so pan/zoom/fit move all columns together).
  // Mirrors Color's renderCompareArea; each column forces its breakpoint via _typeModeOverride while it builds.
  renderTypeCompareArea(view) {
    const t = this.doc.type || DEFAULT_TYPE;
    const modes = t.modes || [];
    const area = h(
      "div",
      { class: "canvas-area canvas-compare type-canvas canvas-scheme-" + this.resolvedCanvasScheme(),
        role: "group", "aria-label": "Compare — every typography breakpoint side by side · drag to pan, wheel to zoom" },
      h("div", { class: "canvas-scene compare" },
        this._typeCompareColumn(view, "base", "Base"),
        ...modes.map((m) => this._typeCompareColumn(view, m.id, m.name || "Mode"))),
    );
    this.wirePanZoom(area);
    requestAnimationFrame(() => this.applyTransform());
    return area;
  }

  _typeCompareColumn(view, modeId, label) {
    this._typeModeOverride = modeId; // force _activeType()/_activeTypeScale() while this column's scene builds
    const scene = this.renderTypographyScene(view);
    this._typeModeOverride = null;
    return h(
      "div",
      { class: "compare-col canvas-scheme-" + this.resolvedCanvasScheme(), style: "--canvas-bg:" + this.canvasBg() },
      h("div", { class: "compare-col-label" }, label),
      scene,
    );
  }

  // _typeOverridesFor(modeKey) — the flat { "<voice>|<step>": size } slice for one mode (the suffix stripped).
  _typeOverridesFor(modeKey) {
    const all = (this.doc.type && this.doc.type.tokenOverrides) || null;
    if (!all) return undefined;
    const out = {};
    const suffix = "|" + modeKey;
    for (const k of Object.keys(all)) {
      if (!k.endsWith(suffix)) continue;
      out[k.slice(0, k.length - suffix.length)] = all[k]; // "<voice>|<step>"
    }
    return Object.keys(out).length ? out : undefined;
  }

  // _typeScaleFor(modeKey) — the resolved typeScale for a mode WITH that mode's per-cell overrides applied.
  // "base" → doc.type; a mode id → the mode's own levers layered on doc.type: EITHER a bodyBase override
  // (legacy custom modes) or a hierarchy-aware compression `factor` (the Standard set: Tablet 5/6 ·
  // Mobile 2/3 — body frozen, display compressed). The single place a type scale is built so overrides
  // reach the matrix, the specimen, and every export consistently.
  _typeScaleFor(modeKey) {
    const t = this.doc.type || DEFAULT_TYPE;
    const base = modeKey === "base" ? t : (() => { const m = (t.modes || []).find((x) => x.id === modeKey); return m ? { ...t, bodyBase: m.bodyBase ?? t.bodyBase, modeFactor: m.factor ?? 1 } : t; })();
    const overrides = { ...this._modeTierNudge(base.modeFactor), ...this._typeOverridesFor(modeKey) };
    return typeScale({ ...base, overrides });
  }


  // setTypeTokenOverride / clearTypeTokenOverride — write/reset one per-cell SIZE override (one undo step;
  // persisted). Mirrors setRoleOverride/clearRoleOverride. A non-positive/NaN size is ignored (use ↺ to reset).
  setTypeTokenOverride(voice, step, modeKey, size) {
    let n = Math.round(Number(size));
    if (!Number.isFinite(n) || n <= 0) return;
    n = Math.max(1, Math.min(512, n)); // clamp to the input min/max + persist's clampTokenOverrides range, so live === persist
    const key = voice + "|" + step + "|" + modeKey;
    this.commit((d) => {
      d.type = { ...(d.type || DEFAULT_TYPE) };
      d.type.tokenOverrides = { ...(d.type.tokenOverrides || {}), [key]: n };
    });
  }

  clearTypeTokenOverride(voice, step, modeKey) {
    const key = voice + "|" + step + "|" + modeKey;
    this.commit((d) => {
      if (!d.type || !d.type.tokenOverrides || !(key in d.type.tokenOverrides)) return;
      d.type = { ...d.type, tokenOverrides: { ...d.type.tokenOverrides } };
      delete d.type.tokenOverrides[key];
      if (Object.keys(d.type.tokenOverrides).length === 0) delete d.type.tokenOverrides;
    });
  }


  // _typeTokenColumns — the ordered column set for the Typography token matrix: Base first, then one
  // column per breakpoint MODE sorted ascending by minWidth (the responsive cascade). Each entry carries
  // the resolved (override-aware) typeScale + its real modeKey so a cell can build its override key and read
  // the value at that step × that mode. Built via _typeScaleFor so overrides match the specimen + exports.
  _typeTokenColumns() {
    const t = this.doc.type || DEFAULT_TYPE; // the DOCUMENT base — mode-independent (NOT _activeType, which tracks the header Mode selector)
    const { baseName: bn, baseLast } = this._typeBaseOpts();
    const baseCol = { id: "base", modeKey: "base", name: bn, minWidth: null, scale: this._typeScaleFor("base") };
    const modes = (t.modes || [])
      .map((m) => ({ id: m.id, modeKey: m.id, name: m.name || "Mode", minWidth: Number(m.minWidth) || 0, scale: this._typeScaleFor(m.id) }))
      // a named base reads desktop-first (widest first); the legacy "Base" shape stays ascending.
      .sort((a, b) => (bn === "Base" ? a.minWidth - b.minWidth : b.minWidth - a.minWidth));
    return baseLast ? [...modes, baseCol] : [baseCol, ...modes];
  }


  // renderTypeTokensTable — the EDITABLE Typography token MATRIX (Phase 3). Rows = type steps GROUPED by
  // voice (Display · Headline/Sub-heading/Title · Body/Body-mono/Lead · Label/Label-mono/Kicker ·
  // Sub-title/Tiny/Tiny-mono) with a group-header row; the first (sticky) column is
  // the token NAME (--type-{voice}-{step}). Columns = Base + each breakpoint mode (≥{minWidth}px). Each value
  // cell is a SIZE number input (the lever): editing it writes doc.type.tokenOverrides[<voice>|<step>|<mode>]
  // and the line/weight/tracking re-derive beneath; an overridden cell gets `.ov` + a ↺ reset. The override
  // flows to the specimen + every export automatically (the CSS @media + per-mode DTCG build from this scale).
  renderTypeTokensTable() {
    const cols = this._typeTokenColumns();
    const base = cols[0].scale;
    const ov = (this.doc.type && this.doc.type.tokenOverrides) || {};
    const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const cats = Object.keys(base.categories); // the eleven named voices, engine order
    const total = cats.reduce((a, c) => a + Object.keys(base.categories[c]).length, 0);
    // a single value cell: an editable SIZE input (px), w{weight} · {tracking} · line beneath, ↺ when overridden.
    const cell = (col, cat, step) => {
      const s = col.scale.categories[cat] && col.scale.categories[cat][step];
      if (!s) return h("td", { class: "tok-cell" }, h("span", { class: "tok-na" }, "—"));
      const tr = `${s.letterSpacing >= 0 ? "+" : ""}${s.letterSpacing}`;
      const overridden = (cat + "|" + step + "|" + col.modeKey) in ov;
      return h(
        "td",
        { class: "tok-cell" + (overridden ? " tok-cell-ov" : "") },
        h(
          "div",
          { class: "tok-edit" },
          h("input", {
            class: "tok-input" + (overridden ? " ov" : ""),
            type: "number", min: "1", max: "512", step: "1",
            value: String(s.size),
            "data-fk": "tytok:" + cat + ":" + step + ":" + col.modeKey,
            "aria-label": `${cat} ${step} size · ${col.name} (px)`,
            onchange: (e) => this.setTypeTokenOverride(cat, step, col.modeKey, e.target.value),
          }),
          overridden ? btn(icon("arrow-counter-clockwise", { size: 12 }), { variant: "bare", cls: "tok-reset", title: "Reset to derived size", ariaLabel: `Reset ${cat} ${step} · ${col.name} to the derived size`, onclick: () => this.clearTypeTokenOverride(cat, step, col.modeKey) }) : false,
        ),
        h("span", { class: "tok-sub" }, `${s.lineHeight} · w${s.weight} · ${tr}`),
      );
    };
    const headCells = cols.map((c) =>
      h("th", { class: "tok-col" + (c.id === "base" ? " tok-col-base" : ""), scope: "col" },
        h("span", { class: "tok-col-name" }, c.name),
        c.minWidth ? h("small", { class: "tok-col-bp" }, `≥${Math.round(c.minWidth)}px`) : false));
    const rows = [];
    for (const cat of cats) {
      const role = base.roleOf[cat] || "body";
      const steps = Object.keys(base.categories[cat]);
      // largest → smallest within a group (mirror the specimen order)
      const ordered = [...steps].sort((a, b) => (base.categories[cat][b]?.size || 0) - (base.categories[cat][a]?.size || 0));
      rows.push(h("tr", { class: "tok-group" },
        h("th", { class: "tok-grouphead", colspan: String(cols.length + 1), scope: "colgroup" },
          h("b", {}, cat), h("small", {}, base.fonts[role]), h("span", { class: "tok-group-count" }, `${steps.length} steps`))));
      for (const step of ordered) {
        rows.push(h("tr", { class: "tok-row" },
          h("th", { class: "tok-name", scope: "row" }, h("code", {}, `--type-${kebab(cat)}-${kebab(step)}`)),
          ...cols.map((c) => cell(c, cat, step))));
      }
    }
    return h(
      "div",
      { class: "tok-wrap" },
      h("div", { class: "tok-head" },
        h("b", {}, "Type tokens"),
        h("small", {}, `${cats.length} groups · ${total} steps · ${cols.length} column${cols.length === 1 ? "" : "s"} (Base${cols.length > 1 ? " + " + (cols.length - 1) + " breakpoint" + (cols.length === 2 ? "" : "s") : ""})`),
        h("small", { class: "tok-hint" }, "Each edit is per-cell and mode-local — Base does not cascade into breakpoint columns; line-height re-derives, tracking + weight stay.")),
      h(
        "table",
        { class: "map-table tok-table" },
        h("thead", {}, h("tr", {}, h("th", { class: "tok-name tok-name-head", scope: "col" }, "Token"), ...headCells)),
        h("tbody", {}, ...rows),
      ),
    );
  }


  // renderTypographyScene — the canvas "Typography" view: the FULL specimen (all 33 steps — 11 named
  // voices × 3 steps each, SM/MD/LG, since the 2026-07-13 fixed-size-table rewrite), grouped by voice,
  // each step a live line in the treatment's real face at its size/lineHeight/letterSpacing/weight + a
  // compact metrics readout. Lives in the same pannable .canvas-scene as the ramps; paints in the canvas
  // preview scheme (var(--ink*) flips with the area's color-scheme) and the treatment's fonts (ensureTypeFonts).
  renderTypographyScene(view) {
    ensureTypeFonts();
    const cfg = this._activeType();
    const scale = this._activeTypeScale();
    ensureWebFonts({ ...scale.fonts, ...(scale.voiceFonts || {}) }, this.inFigma); // TIER 2: lazy-load this palette's non-bundled faces, incl. per-voice overrides (web app only)
    const t = TYPE_TREATMENTS.find((x) => x.id === cfg.treatment) || TYPE_TREATMENTS[0];
    const PARA = TYPE_PARA(scale.treatment);
    const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const line = (cat, step) => {
      const s = scale.categories[cat] && scale.categories[cat][step];
      if (!s) return false;
      const role = scale.roleOf[cat] || "body";
      const fam = resolvedFontFor(scale, cat) || "Inter";
      const generic = genericFor(fam, role);
      const token = `type-${kebab(cat)}-${kebab(step)}`;
      const tt = s.textTransform && s.textTransform !== "none" ? `text-transform:${s.textTransform};` : "";
      const faceStyle =
        `font-family:'${fam}', ${generic};font-size:${s.size}px;line-height:${s.lineHeight}px;` +
        `letter-spacing:${s.letterSpacing}px;font-weight:${s.weight};${tt}`;
      const isPara = cat === "Body" && step === "LG"; // Body's largest step (2026-07-13: every voice is now a 3-step SM/MD/LG ramp, no more XL)
      return h(
        "div",
        { class: "type-spec-line" },
        h(
          "div",
          { class: "type-spec-meta" },
          h("code", { class: "type-spec-token" }, token),
          h("span", { class: "type-spec-dims" }, `${s.size}/${s.lineHeight}`),
          h("span", { class: "type-spec-dims" }, `w${s.weight}`),
          h("span", { class: "type-spec-dims" }, `${s.letterSpacing >= 0 ? "+" : ""}${s.letterSpacing} tr`),
        ),
        h("div", { class: "type-spec-render" + (isPara ? " para" : ""), style: faceStyle }, isPara ? PARA : TYPE_SAMPLE(cat, scale.treatment)),
      );
    };
    const cats = Object.keys(scale.categories); // the eleven named voices, in engine order
    const total = cats.reduce((a, c) => a + Object.keys(scale.categories[c]).length, 0);
    const groups = cats.map((cat) => {
      const steps = Object.keys(scale.categories[cat]);
      // render the specimen LARGEST → smallest (biggest example first) — sort by resolved size descending,
      // robust to the engine's step-key order. (The `steps.length` count is order-independent.)
      const ordered = [...steps].sort((a, b) => (scale.categories[cat][b]?.size || 0) - (scale.categories[cat][a]?.size || 0));
      return h(
        "div",
        { class: "type-spec-group" },
        h("div", { class: "type-spec-grouphead" }, h("b", {}, cat), h("small", {}, resolvedFontFor(scale, cat)), h("span", { class: "type-spec-count" }, `${steps.length} steps`)),
        ...ordered.map((step) => line(cat, step)),
      );
    });
    return h(
      "div",
      { class: "type-spec" },
      h("div", { class: "type-spec-head" }, h("b", {}, t.label), h("small", {}, `${cfg.bodyBase}px base · ${cats.length} groups · ${total} steps`)),
      h("p", { class: "type-spec-note" }, t.note + " — fonts are swappable; the size scale, optical tracking, weight, leading, and case are the system."),
      ...groups,
    );
  }


  // ── Typography inspector (right pane) ─────────────────────────────────────────
  // The type analog of renderRightPane: a .pane-head segmented tablist + a scrollable .seg-body + a
  // pinned .seg-example live specimen. Binds ONLY to doc.type = {treatment, bodyBase} (the only type
  // fields the engine + persist carry today). Per-voice tuning (ratio/leading/weight/tracking) is shown
  // READ-ONLY from the treatment — editing it needs new doc.type fields in the engine AND the persist
  // fuzz generator, so it is FLAGGED out-of-scope, not faked.
  renderTypeInspector(view) {
    ensureTypeFonts();
    { const s = this._activeTypeScale(); ensureWebFonts({ ...s.fonts, ...(s.voiceFonts || {}) }, this.inFigma); } // TIER 2: the inspector specimen + examples render the real faces, incl. per-voice overrides
    const seg = this.typeSegment === "fonts" || this.typeSegment === "specimen" ? this.typeSegment : "scale";
    const body = seg === "fonts" ? this.typeFontsTab() : seg === "specimen" ? this.typeSpecimenTab(view) : this.typeScaleTab();
    const tabs = [{ id: "scale", label: "Scale" }, { id: "fonts", label: "Fonts" }, { id: "specimen", label: "Specimen" }];
    return h(
      "aside",
      { class: "right-pane" },
      h("div", { class: "pane-head" },
        this.panesRight ? this.paneToggle("right") : false,
        this.segmented(tabs, seg, (id) => { this.typeSegment = id; this.render(); }, { ariaLabel: "Typography inspector", idPrefix: "tytab", controls: "tyi-panel" })),
      h("div", { class: "seg-body", role: "tabpanel", id: "tyi-panel", "aria-labelledby": "tytab-" + seg }, body),
      h("div", { class: "seg-example" }, this.typeExampleCard(view)),
    );
  }


  // typeScaleTab — the only WRITABLE controls (treatment + body-base), then a READ-ONLY per-voice
  // summary of what the treatment yields (ratio · leading · weight · tracking).
  typeScaleTab() {
    const cfg = this._activeType();
    const t = TYPE_TREATMENTS.find((x) => x.id === cfg.treatment) || TYPE_TREATMENTS[0];
    const scale = this._activeTypeScale();
    return h(
      "div",
      { class: "insp-body" },
      h("h3", { class: "insp-title" }, icon("type"), "Type scale"),
      h("div", { class: "insp-sub" }, "Choose a treatment + body size — fonts, tracking, weight & leading follow."),
      field(
        "Treatment",
        h(
          "select",
          { "data-fk": "tyi:treatment", onchange: (e) => this._pickTypeTreatment(e.target.value) },
          ...TYPE_TREATMENTS.map((x) => h("option", { value: x.id, selected: cfg.treatment === x.id ? true : undefined }, this._treatmentLocked(x.id, "product") ? x.label + " · Pro" : x.label)),
        ),
      ),
      this.slider(this.typeMode === "base" || this.typeMode === "compare" ? "Body base" : "Body base · this breakpoint", cfg.bodyBase, 12, 22, 1, (v) => fmt(v) + "px", (v) => this._setActiveTypeBodyBase(v)),
      this._typeModeEditor(),
      h("p", { class: "insp-sub tyi-note" }, t.note),
      h(
        "div",
        { class: "tyi-voices" },
        h("div", { class: "tyi-voices-head" }, h("b", {}, "Per-voice"), h("small", {}, "select a voice to tune")),
        ...Object.keys(scale.categories).map((cName) => {
          const p = t.categories[cName];
          const md = scale.categories[cName] && scale.categories[cName].MD;
          const sel = this.typeVoice === cName;
          const vp = (cfg.voices && cfg.voices[cName]) || {};
          const tuned = Object.keys(vp).length > 0;
          const val = (param, def) => (Number.isFinite(vp[param]) ? vp[param] : def);
          return h(
            "div",
            { class: "tyi-voice" + (sel ? " is-sel" : "") + (tuned ? " is-tuned" : "") },
            h(
              "button",
              { type: "button", class: "tyi-voice-name", "data-fk": "tyvoice:" + cName, "aria-expanded": sel ? "true" : "false",
                onclick: () => { this.typeVoice = sel ? null : cName; this.render(); } },
              h("span", { class: "tyi-voice-label" }, cName, tuned ? h("span", { class: "tyi-voice-dot", title: "Tuned off the treatment" }, " ●") : false),
              h("span", { class: "tyi-voice-font" }, resolvedFontFor(scale, cName)),
            ),
            sel
              ? h(
                  "div",
                  { class: "tyi-voice-edit" },
                  this.slider("Weight", val("weight", p.weight), 100, 900, 10, (v) => String(v), (v) => this._setTypeVoice(cName, "weight", v)),
                  this.slider("Tracking", val("tracking", p.trackingEm), -0.05, 0.3, 0.001, (v) => (v >= 0 ? "+" : "") + fmt(v, 3) + "em", (v) => this._setTypeVoice(cName, "tracking", v)),
                  this.slider("Leading", val("leading", p.leading), 0.9, 2, 0.01, (v) => fmt(v, 2), (v) => this._setTypeVoice(cName, "leading", v)),
                  // no Ratio control — size is a fixed table since 2026-07-13, not base×ratio^n; a
                  // per-cell override (Global tab) is now the lever for moving an individual step's size.
                  // the per-voice font override (TKT-0002) is set on the Fonts tab (all 11 voices live
                  // there, one editing surface) — this panel shows the resolved family read-only, in the
                  // collapsed row's tyi-voice-font span, so it's not duplicated/editable in two places.
                  // the Figma weight-STYLE name — only meaningful for non-variable families (GT America
                  // "Condensed Black Italic"), where a numeric weight can't name the face. Exported into
                  // the Font Primitives collection as weight-style/<voice>; empty = none.
                  h("label", { class: "mode-editor-label", for: "fld-voice-style-" + cName.toLowerCase().replace(/[^a-z0-9]+/g, "-") }, "Figma style name"),
                  h("input", { id: "fld-voice-style-" + cName.toLowerCase().replace(/[^a-z0-9]+/g, "-"), type: "text", value: vp.styleName || "", placeholder: "e.g. Condensed Bold (non-variable fonts)", "data-fk": "tyvoice-style:" + cName,
                    "aria-label": "Figma weight style name for " + cName, onchange: (e) => this._setTypeVoiceStyleName(cName, e.target.value) }),
                  // SIBLING WEIGHTS — named weight variants around the core. Each becomes a Figma text
                  // style (`Voice/step/Name`), a Font Primitives pair, a CSS custom prop, and a DTCG
                  // fontWeight token. Suggest seeds the ratified defaults from the CORE weight; the
                  // list is user-owned after (add/remove/rename — never silently regenerated).
                  h("label", { class: "mode-editor-label" }, "Weight siblings", h("small", { class: "tyi-weights-core" }, ` core ${val("weight", p.weight)}`)),
                  h(
                    "div",
                    { class: "tyi-weights" },
                    ...(vp.weights || []).map((wv, i) =>
                      h(
                        "div",
                        { class: "tyi-weight-row" },
                        h("input", { type: "text", class: "tyi-weight-name", value: wv.name, "aria-label": `Sibling ${i + 1} name for ${cName}`, "data-fk": `tyweight-name:${cName}:${i}`,
                          onchange: (e) => { const list = (vp.weights || []).slice(); list[i] = { ...list[i], name: e.target.value }; this._setVoiceWeights(cName, list); } }),
                        h("input", { type: "number", class: "tyi-weight-num", value: String(wv.weight), min: "100", max: "1000", step: "100", "aria-label": `Sibling ${i + 1} weight for ${cName}`, "data-fk": `tyweight-num:${cName}:${i}`,
                          onchange: (e) => { const list = (vp.weights || []).slice(); list[i] = { ...list[i], weight: Number(e.target.value) }; this._setVoiceWeights(cName, list); } }),
                        btn(icon("x"), { variant: "bare", cls: "tyi-weight-del", ariaLabel: `Remove sibling ${wv.name}`, title: "Remove this weight",
                          onclick: () => { const list = (vp.weights || []).slice(); list.splice(i, 1); this._setVoiceWeights(cName, list); } }),
                      ),
                    ),
                    h(
                      "div",
                      { class: "tyi-weights-actions" },
                      !(vp.weights || []).length
                        ? btn("Suggest", { variant: "ghost", cls: "tyi-weights-suggest", title: "Seed the standard siblings around the core weight", "data-fk": "tyweights-suggest:" + cName,
                            onclick: () => this._setVoiceWeights(cName, siblingWeightDefaults(val("weight", p.weight))) })
                        : false,
                      btn("+ Weight", { variant: "ghost", cls: "tyi-weights-add", title: "Add a named weight variant", "data-fk": "tyweights-add:" + cName,
                        onclick: () => {
                          const list = (vp.weights || []).slice();
                          const used = new Set(list.map((x) => x.weight).concat([val("weight", p.weight)]));
                          const free = [500, 700, 300, 600, 400, 800, 200, 900, 100].find((w) => !used.has(w));
                          if (free == null) { this.toast("All ladder weights are in use"); return; }
                          list.push({ name: WEIGHT_NAMES[free] || String(free), weight: free });
                          this._setVoiceWeights(cName, list);
                        } }),
                    ),
                  ),
                  tuned ? btn("Reset voice", { variant: "ghost", cls: "tyi-voice-reset", onclick: () => this._resetTypeVoice(cName) }) : false,
                )
              : h(
                  "dl",
                  { class: "tyi-voice-stats" },
                  h("div", {}, h("dt", {}, "Leading"), h("dd", {}, fmt(val("leading", p.leading), 2))),
                  h("div", {}, h("dt", {}, "Weight"), h("dd", {}, String(val("weight", p.weight)))),
                  h("div", {}, h("dt", {}, "Tracking"), h("dd", {}, (val("tracking", p.trackingEm) > 0 ? "+" : "") + fmt(val("tracking", p.trackingEm), 3) + "em")),
                  md ? h("div", {}, h("dt", {}, "MD"), h("dd", {}, `${md.size}/${md.lineHeight}`)) : false,
                ),
          );
        }),
      ),
    );
  }


  // typeFontsTab — an editable combobox per VOICE, all 11, matching 1:1 what every export actually emits
  // (font/<voice> in Figma Primitives, --font-voice-<kebab> in CSS, fontFamily in DTCG) — so what's
  // editable here never diverges from what ships. A voice with no override shows its role's shared
  // default (from the treatment) as its live value; editing always writes a per-voice override
  // (_setTypeVoiceFont, TKT-0002) — there is no separate role-level row, and no second place to edit a
  // voice's font (the Scale tab's per-voice panel shows the resolved family read-only, not editable).
  typeFontsTab() {
    const cfg = this._activeType();
    const scale = this._activeTypeScale();
    const treatment = TYPE_TREATMENTS.find((t) => t.id === cfg.treatment) || TYPE_TREATMENTS[0];
    const opts = [...BUNDLED_FONTS, "system-ui", "Georgia", "Arial"]; // bundled families + a few common system ones
    // seenStates feeds the legend below — a dot's title tooltip carries the full explanation per row, so
    // the legend only needs to spell out the states actually present this render (an all-"ok" scale, the
    // common case for a bundled treatment, shows no legend at all).
    const seenStates = new Map();
    const rows = Object.keys(scale.categories).map((cName) => {
      const role = scale.roleOf[cName];
      const family = resolvedFontFor(scale, cName);
      const generic = genericFor(family, role);
      const custom = !!(cfg.voices && cfg.voices[cName] && cfg.voices[cName].font);
      const id = "tyfont-" + cName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const st = this._fontStatus(family);
      if (st.state !== "ok" && !seenStates.has(st.state)) seenStates.set(st.state, st);
      return h(
        "div",
        { class: "tyi-font-row" },
        h("label", { class: "tyi-font-role", for: id }, cName),
        h("input", {
          id,
          class: "tyi-font-input",
          type: "text",
          list: id + "-list",
          value: family,
          placeholder: treatment.fonts[role],
          "aria-label": cName + " font family",
          "data-fk": "tyfont:" + cName,
          title: custom ? "Custom family — exports as-is; the web-app specimen loads it from Google Fonts (falls back if it isn't a Google font)" : "From the " + treatment.label + " treatment",
          style: `font-family:'${family}', ${generic}`,
          onchange: (e) => this._setTypeVoiceFont(cName, e.target.value),
        }),
        h("datalist", { id: id + "-list" }, ...opts.map((f) => h("option", { value: f }))),
        h("i", { class: "tyi-font-dot is-" + st.state, title: st.title, "aria-label": st.label, "data-fk": "tyfontbadge:" + cName }),
      );
    });
    return h(
      "div",
      { class: "insp-body" },
      h("h3", { class: "insp-title" }, icon("type"), "Fonts"),
      h("div", { class: "insp-sub" }, "Pick a bundled font or type any family for each voice."),
      this._fontsPanelSideEffects(),
      h("div", { class: "tyi-fonts" }, ...rows),
      seenStates.size
        ? h(
            "div",
            { class: "tyi-font-legend" },
            ...[...seenStates.values()].map((st) => h("span", { class: "tyi-font-legend-item", title: st.title }, h("i", { class: "tyi-font-dot is-" + st.state }), st.label)),
          )
        : false,
      h("p", { class: "insp-sub tyi-future" }, "Custom families export in the CSS / DTCG / Figma tokens. In the web app the specimen loads each face from Google Fonts on demand; a face that isn't a Google font (or the Figma plugin, which stays offline) falls back to the closest generic."),
    );
  }


  // ── font availability ────────────────────────────────────────────────────────────────────────
  // TWO different truths, never conflated:
  //   inFigma → can Figma USE this family? (its own font list; a miss means text styles get a
  //             placeholder face, family still variable-bound — see applyStylePlans' scaffold path)
  //   web     → does the face actually RENDER here? (bundled offline, or loaded from Google Fonts)
  // Ask Figma once; the sandbox answers with `fonts-listed`.
  _requestFigmaFonts() {
    if (!this.inFigma || this._figmaFontsRequested) return;
    this._figmaFontsRequested = true;
    try { parent.postMessage({ pluginMessage: { type: "list-fonts" } }, "*"); } catch (e) { /* not in a frame */ }
  }

  receiveFigmaFonts(families) {
    this._figmaFonts = new Set(Array.isArray(families) ? families : []);
    this.render();
  }


  // _faceRenders(fam) — does this family actually paint, or is the browser silently substituting a
  // generic? `document.fonts.check` FALSE-NEGATIVES on variable fonts, so measure DOM width instead:
  // a family that is applied renders at a different width than the bare generic it falls back to.
  // Unmeasurable (no DOM / headless shim) ⇒ assume it renders — never cry wolf.
  _faceRenders(fam) {
    if (!fam) return true;
    if (SELF_HOSTED_FONTS.has(fam) || GENERIC_FONTS.has(fam.toLowerCase())) return true;
    if (this._faceCache.has(fam)) return this._faceCache.get(fam);
    let out = true;
    if (typeof document !== "undefined" && document.body && document.createElement) {
      try {
        const width = (stack) => {
          const el = document.createElement("span");
          el.textContent = "mmmmmmmmmmlliWWWW0O";
          el.style.cssText = "position:absolute;left:-9999px;top:-9999px;white-space:nowrap;font-size:72px;font-family:" + stack;
          document.body.appendChild(el);
          const w = el.offsetWidth;
          el.remove();
          return w;
        };
        // quote the family — an unquoted name with a digit/space is invalid in a strict parser (Safari)
        const gens = ["monospace", "serif", "sans-serif"];
        const pairs = gens.map((gen) => [width(gen), width(`'${fam}', ${gen}`)]);
        // NOT measurable (headless shim / display:none / layout not yet flushed → every width 0)?
        // Assume it renders. A "falls back" badge must be EARNED by a real measurement, never by a
        // silent zero — the false negative this guard exists to prevent.
        out = pairs.every(([base]) => !(base > 0))
          ? true
          : pairs.some(([base, test]) => base > 0 && test > 0 && Math.abs(test - base) > 0.5);
      } catch (e) { out = true; }
    }
    this._faceCache.set(fam, out);
    return out;
  }


  // _fontsPanelSideEffects — ask Figma for its font list (once), and in the web app re-render once the
  // lazily-injected Google faces settle, so a badge flips "falls back" → "loaded" rather than lying.
  _fontsPanelSideEffects() {
    this._requestFigmaFonts();
    if (!this.inFigma && !this._fontsReadyHooked && typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      this._fontsReadyHooked = true;
      document.fonts.ready.then(() => { this._faceCache.clear(); this.render(); }).catch(() => {});
    }
    return false; // renders nothing
  }


  // _fontStatus(family) → the badge for one role: { state, label, title }.
  _fontStatus(family) {
    if (this.inFigma) {
      if (!this._figmaFonts) return { state: "unknown", label: "checking…", title: "Asking Figma which font families it can use." };
      if (this._figmaFonts.has(family)) return { state: "ok", label: "in Figma", title: "Figma has this family — its text styles render in the real face." };
      return { state: "sub", label: "not in Figma", title: "Figma doesn't have this family. Its text styles are built on a placeholder face, but the family stays bound to the font variable — install the font and they adopt it, no re-apply." };
    }
    if (SELF_HOSTED_FONTS.has(family)) return { state: "ok", label: "bundled", title: "Embedded in the app — renders offline, and inside the Figma plugin." };
    if (GENERIC_FONTS.has(String(family).toLowerCase())) return { state: "ok", label: "generic", title: "A CSS generic family." };
    return this._faceRenders(family)
      ? { state: "ok", label: "loaded", title: "Loaded from Google Fonts — the specimen renders the real face." }
      : { state: "fallback", label: "falls back", title: "Not loaded (not a Google font, or still loading) — the specimen renders the closest generic. Exports still carry the exact family name." };
  }


  // _setTypeFont(role, value) — set/clear a per-role custom font on doc.type.fonts. Empty OR the treatment
  // default clears the override (so a default round-trips clean). Fonts are mode-independent → always the base.
  _setTypeFont(role, value) {
    this._faceCache.clear(); this._fontsReadyHooked = false; // a new family must be re-probed
    this.commit((doc) => {
      const t = doc.type || { ...DEFAULT_TYPE };
      const treatment = TYPE_TREATMENTS.find((x) => x.id === t.treatment) || TYPE_TREATMENTS[0];
      const v = String(value || "").trim();
      const fonts = { ...(t.fonts || {}) };
      if (!v || v === treatment.fonts[role]) delete fonts[role]; else fonts[role] = v;
      const next = { ...t };
      if (Object.keys(fonts).length) next.fonts = fonts; else delete next.fonts;
      doc.type = next;
    });
  }


  // _setTypeVoice(voice, param, value) — per-VOICE shaping override on doc.type.voices (weight·tracking·
  // leading·ratio). Live via editDrag (coalesces a slider drag into one undo step). A value equal to the
  // treatment default clears that param; an emptied voice / voices map is removed (so a default round-trips).
  // Voices are mode-independent → always written to the base doc.type.
  _setTypeVoice(voice, param, value) {
    this.editDrag((doc) => {
      const t = { ...(doc.type || DEFAULT_TYPE) };
      const treatment = TYPE_TREATMENTS.find((x) => x.id === t.treatment) || TYPE_TREATMENTS[0];
      const pCat = treatment.categories[voice];
      if (!pCat) return;
      const defaults = { weight: pCat.weight, tracking: pCat.trackingEm, leading: pCat.leading };
      const num = param === "weight" ? Math.round(value) : value;
      const voices = { ...(t.voices || {}) };
      const v = { ...(voices[voice] || {}) };
      if (!Number.isFinite(num) || num === defaults[param]) delete v[param]; else v[param] = num;
      if (Object.keys(v).length) voices[voice] = v; else delete voices[voice];
      if (Object.keys(voices).length) t.voices = voices; else delete t.voices;
      doc.type = t;
    });
  }


  // _setTypeVoiceStyleName(voice, value) — the STRING sibling of _setTypeVoice: the Figma weight-style
  // name for non-variable families. Empty/whitespace clears (so a default round-trips); one undo step.
  _setTypeVoiceStyleName(voice, value) {
    const sn = String(value || "").trim().slice(0, 60);
    this.commit((doc) => {
      const t = { ...(doc.type || DEFAULT_TYPE) };
      const voices = { ...(t.voices || {}) };
      const v = { ...(voices[voice] || {}) };
      if (sn) v.styleName = sn; else delete v.styleName;
      if (Object.keys(v).length) voices[voice] = v; else delete voices[voice];
      if (Object.keys(voices).length) t.voices = voices; else delete t.voices;
      doc.type = t;
    });
  }


  // _setTypeVoiceFont(voice, value) — the FONT sibling of _setTypeVoiceStyleName (TKT-0002): a per-voice
  // family override, instead of sharing the voice's role default. Empty/whitespace clears (falls back to
  // scale.fonts[roleOf[voice]] via resolvedFontFor); one undo step. A new family must be re-probed (the
  // fonts-availability cache + web-font loader), same as _setTypeFont.
  _setTypeVoiceFont(voice, value) {
    this._faceCache.clear(); this._fontsReadyHooked = false;
    const fam = String(value || "").trim().slice(0, 60);
    this.commit((doc) => {
      const t = { ...(doc.type || DEFAULT_TYPE) };
      const voices = { ...(t.voices || {}) };
      const v = { ...(voices[voice] || {}) };
      if (fam) v.font = fam; else delete v.font;
      if (Object.keys(v).length) voices[voice] = v; else delete voices[voice];
      if (Object.keys(voices).length) t.voices = voices; else delete t.voices;
      doc.type = t;
    });
  }


  // _setVoiceWeights(voice, list) — write a voice's SIBLING weight variants ([{name, weight}]) onto
  // doc.type.voices, normalized (name trimmed/capped, weight clamped 100..1000, invalid dropped); an
  // empty list clears the key so a sibling-free voice round-trips identically. One undo step.
  _setVoiceWeights(voice, list) {
    const norm = (Array.isArray(list) ? list : [])
      .map((e) => ({ name: String((e && e.name) || "").trim().slice(0, 40), weight: Math.round(Number(e && e.weight)) }))
      .filter((e) => e.name && Number.isFinite(e.weight) && e.weight >= 100 && e.weight <= 1000)
      .slice(0, 8);
    this.commit((doc) => {
      const t = { ...(doc.type || DEFAULT_TYPE) };
      const voices = { ...(t.voices || {}) };
      const v = { ...(voices[voice] || {}) };
      if (norm.length) v.weights = norm; else delete v.weights;
      if (Object.keys(v).length) voices[voice] = v; else delete voices[voice];
      if (Object.keys(voices).length) t.voices = voices; else delete t.voices;
      doc.type = t;
    });
  }


  // _resetTypeVoice(voice) — drop all per-voice overrides for one voice (back to the treatment).
  _resetTypeVoice(voice) {
    this.commit((doc) => {
      const t = { ...(doc.type || DEFAULT_TYPE) };
      if (!t.voices || !t.voices[voice]) return;
      const voices = { ...t.voices };
      delete voices[voice];
      if (Object.keys(voices).length) t.voices = voices; else delete t.voices;
      doc.type = t;
    });
  }


  // typeSpecimenTab — a compact in-pane specimen: each of the eleven voices at its MD step. The full
  // scale (all 53 steps across the 11 voices) lives on the canvas.
  typeSpecimenTab(view) {
    const scale = this._activeTypeScale();
    const cats = Object.keys(scale.categories);
    const repStep = (cat) => { const ks = Object.keys(scale.categories[cat]); return ks.includes("MD") ? "MD" : ks[Math.floor(ks.length / 2)]; };
    return h(
      "div",
      { class: "insp-body" },
      h("h3", { class: "insp-title" }, icon("type"), "Specimen"),
      h("div", { class: "insp-sub" }, "Each of the eleven voices at MD. The full scale is on the canvas."),
      h(
        "div",
        { class: "tyi-specimen" },
        ...cats.map((cat) =>
          h(
            "div",
            { class: "typo-cat" },
            h("div", { class: "typo-cat-head" }, h("b", {}, cat), h("small", {}, resolvedFontFor(scale, cat))),
            this._typeSample(scale, cat, repStep(cat), TYPE_SAMPLE(cat, scale.treatment)),
          ),
        ),
      ),
    );
  }


  // typeExampleCard — the pinned live card: a heading + paragraph in the brand fonts AND the selected
  // palette's canvas colors (surface / onSurface / primary). Mirrors exampleCard's color resolution.
  typeExampleCard(view) {
    const scale = this._activeTypeScale();
    const p = view.palettes[this.selectedIndex()];
    const roles = (p && p.roles) || [];
    const dark = this.resolvedCanvasScheme() === "dark";
    const sl = slug((p && p.name) || "");
    const byKey = {};
    for (const r of roles) byKey[r.key] = r;
    const pick = (role) => (role ? (dark ? role.darkHex : role.lightHex) : "transparent");
    const main = roles.find((r) => r.suffix === "");
    const onMain = roles.find((r) => r.suffix === "-on-" + sl);
    const hStep = scale.categories["Headline"].MD, bStep = scale.categories.Body.MD;
    const fam = (cat) => { const role = scale.roleOf[cat]; const fm = resolvedFontFor(scale, cat) || "Inter"; return `'${fm}', ${genericFor(fm, role)}`; };
    return h(
      "div",
      { class: "example-card tyi-example", style: "background:" + pick(byKey.surface) },
      h("div", { class: "tyi-ex-head", style: `color:${pick(byKey.onSurface)};font-family:${fam("Headline")};font-size:${hStep.size}px;line-height:${hStep.lineHeight}px;letter-spacing:${hStep.letterSpacing}px;font-weight:${hStep.weight}` }, TYPE_SAMPLE("Headline", scale.treatment)),
      h("p", { class: "tyi-ex-body", style: `color:${pick(byKey.onSurfaceVariant)};font-family:${fam("Body")};font-size:${bStep.size}px;line-height:${bStep.lineHeight}px;letter-spacing:${bStep.letterSpacing}px;font-weight:${bStep.weight}` }, TYPE_SAMPLE("Body", scale.treatment)),
      h("button", { class: "ex-btn", tabindex: "-1", style: "background:" + pick(main) + ";color:" + pick(onMain) }, "Read more"),
    );
  }


  // ── Typography token helpers (the section lives in renderTypeInspector / renderTypographyScene) ──
  // a sample line rendered in the resolved style for one category/step (font falls back gracefully).
  _typeSample(scale, cat, step, text) {
    const s = scale.categories[cat] && scale.categories[cat][step];
    if (!s) return false;
    const role = scale.roleOf[cat] || "body";
    const fam = resolvedFontFor(scale, cat) || "Inter";
    const generic = genericFor(fam, role);
    const tt = s.textTransform && s.textTransform !== "none" ? `text-transform:${s.textTransform};` : "";
    return h(
      "div",
      { class: "typo-line" },
      h("span", { class: "typo-step" }, `${step} · ${s.size}/${s.lineHeight}`),
      h("div", { class: "typo-sample", style: `font-family:'${fam}', ${generic};font-size:${s.size}px;line-height:${s.lineHeight}px;letter-spacing:${s.letterSpacing}px;font-weight:${s.weight};${tt}` }, text),
    );
  }

  // the breakpoint-mode scales for the Figma exports — [{ name, minWidth, scale }]. Size modes are
  // INTRINSIC, the same technique as Color's Light/Dark — and DESKTOP-ANCHORED (Kim's ratified law,
  // 2026-07-10): the scale you design IS Desktop; Tablet/Mobile derive DOWN via the hierarchy-aware
  // modeFactor curve (body frozen, Display fully compressed — 5/6 at Tablet, 2/3 at Mobile). When the
  // doc carries configured modes they resolve override-aware (via _typeScaleFor, incl. factor modes);
  // when it carries NONE the pair is synthesized — so every export/apply carries the full intrinsic set
  // with zero setup. Configuring your own modes (＋) takes full manual control.
  //
  // Desktop Lg/Xl (2026-07-15, retuned to the ratified magnitude table 2026-07-16 — Xl is the TV tier,
  // at request: "Desktop XL will be used for TV") — the INVERSE curve, same `modeFactor` knob: `bodyBase`
  // scales UP (×1.125/×1.375 of the doc's own bodyBase → body 16→18→22 at the default) while `modeFactor`
  // (0.89/0.80) pulls the ceiling back down toward its ORIGINAL Desktop value instead of letting it scale
  // proportionally — body grows, Display barely moves. The ratio-based recipe (not an absolute px target)
  // means it generalizes to any doc bodyBase, not just the 16 default. Ordered BEFORE Tablet/Mobile so
  // the Figma mode order reads Desktop · Desktop Lg · Desktop Xl · Tablet · Mobile (`_typeBaseOpts`
  // prepends "Desktop" itself).
  //
  // The per-tier Label/Tiny cells that the frozen-body law can't produce ride `_modeTierNudge` (the
  // magnitude table's ladders — Label steps DOWN on Tablet/Mobile and lands off-ladder values on Lg/Xl;
  // 2026-07-16 removed 2026-07-13's Body Mobile nudge: Body is frozen across Desktop/Tablet/Mobile).
  _typeModeScales() {
    const t = this.doc.type || DEFAULT_TYPE;
    if ((t.modes || []).length) return t.modes.map((m) => ({ name: m.name, minWidth: m.minWidth, scale: this._typeScaleFor(m.id) }));
    const bb = Number(t.bodyBase) || DEFAULT_TYPE.bodyBase;
    // each tier layers its _modeTierNudge cells (the ratified magnitude table's Label/Tiny ladders) over
    // the doc's own per-cell overrides. Desktop Xl is ×1.375 (not ×1.25): the table's Body 20/22/24 IS
    // bodyBase 22 at the default 16 — the ratio keeps it true at any doc bodyBase.
    const tier = (mult, mf) => typeScale({ ...t, bodyBase: bb * mult, modeFactor: mf, overrides: { ...(t.overrides || {}), ...this._modeTierNudge(mf) } });
    return [
      { name: "Desktop Lg", minWidth: 1728, scale: tier(1.125, 0.89) },
      { name: "Desktop Xl", minWidth: 2560, scale: tier(1.375, 0.80) },
      { name: "Tablet", minWidth: 992, scale: tier(1, 5 / 6) },
      { name: "Mobile", minWidth: 476, scale: tier(1, 2 / 3) },
    ];
  }

  // _typeBaseOpts/_geomBaseOpts — the base-layer identity for the Figma emitters + the mode UI. The
  // desktop-first canon: Figma's default mode is the FIRST mode, so the DESIGNED scale leads as
  // "Desktop" (synthesized shape and the factor-committed Standard set both), and only a base named
  // "Mobile" (the legacy #251 committed-geometry shape) rides LAST. A doc with its OWN configured
  // modes and no baseName keeps the legacy "Base"-first shape (full manual control).
  _typeBaseOpts() {
    const t = this.doc.type || DEFAULT_TYPE;
    const synthesized = !(t.modes || []).length; // the intrinsic set ⇒ the designed scale IS Desktop
    const n = (t.baseName || (synthesized ? "Desktop" : "Base")).trim() || "Base";
    return { baseName: n, baseLast: n.toLowerCase() === "mobile" };
  }

  // per-breakpoint DTCG files — one valid standalone DTCG per mode that has a minWidth, keyed by the width
  // (self-documenting + collision-free). No-width modes are preview-only, so they don't export (mirrors CSS).
  _typeModeDTCGFiles(prefix = "type", opts = {}) {
    return this._typeModeScales().filter((m) => Number(m.minWidth) > 0)
      .map((m) => ({ name: `${prefix}.${Math.round(m.minWidth)}.tokens.json`, data: JSON.stringify(typeTokensDTCG(m.scale, opts), null, 2) }));
  }
}
export const TypeSection = TypeSectionImpl;
