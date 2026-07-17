import { SCRIM_BASES, SCRIM_STEPS, STOPS, hexToOklch, projectView, seedFromKeyColor, slug } from "../model.mjs";
import { RELATIONSHIPS, deriveNeutral, deriveRelative } from "../../engine/derive.mjs";
import { icon } from "../icons.js";
import { CURVES, DAMP_PRESETS, btn, chip, field, fmt, h, swatch, switchControl } from "../app-helpers.mjs";

// Prototype mixin (TKT-0023): a class body used ONLY as a verbatim, comma-free carrier for these
// methods — copied onto HctApp.prototype (see app.js's mixin() call), never instantiated directly.
export class ColorSectionImpl {

  // analysisCards — the left rail's graph cards for the current view. Shared by
  // the full render (renderLeftPane) and the in-place liveRefresh, so a drag
  // updates these graphs without a full re-render.
  analysisCards(view) {
    const idx = this.selectedIndex();
    const card = (label, body) =>
      h(
        "div",
        { class: "an-card" },
        h("div", { class: "an-label" }, label),
        body,
      );
    return [
      card("L*×C — applied chroma vs gamut ceiling", this.graphLC(view, idx)),
      card("Tone curve — L* per stop", this.graphTone(view, idx)),
      card("Chroma curve — applied vs ceiling", this.graphChroma(view, idx)),
      card("Contrast — on-colors vs fills (≥4.5:1)", this.graphContrast(view, idx)),
      card("Hue wheel — all enabled palettes", this.graphHueWheel(view)),
    ];
  }


  // L*×C plot (moved OUT of the canvas) — applied chroma vs gamut ceiling + tone line.
  graphLC(view, idx) {
    const target = view.plot[idx] || view.plot[0];
    if (!target) return h("div", { class: "an-empty" }, "—");
    const W = 244, H = 168, pad = 26;
    const pts = target.points;
    const maxC = Math.max(8, ...pts.map((p) => Math.max(p.ceiling, p.applied))) * 1.05;
    const X = (c) => pad + (c / maxC) * (W - pad - 8);
    const Y = (l) => 8 + ((100 - l) / 100) * (H - pad - 8);
    const ceilPath =
      "M" + pts.map((p) => `${X(p.ceiling).toFixed(1)},${Y(p.tone).toFixed(1)}`).join(" L") +
      ` L${X(0)},${Y(pts[pts.length - 1].tone).toFixed(1)} L${X(0)},${Y(pts[0].tone).toFixed(1)} Z`;
    const appliedPath = "M" + pts.map((p) => `${X(p.applied).toFixed(1)},${Y(p.tone).toFixed(1)}`).join(" L");
    const tonePath = "M" + pts.map((p) => `${X(0).toFixed(1)},${Y(p.tone).toFixed(1)}`).join(" L");
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <text x="2" y="${Y(100) + 3}">100</text>
        <text x="6" y="${Y(0)}">0</text>
        <text x="${W - 14}" y="${H - pad + 20}">C→</text>
        <path class="lc-ceiling" d="${ceilPath}"/>
        <path class="lc-toneline" d="${tonePath}"/>
        <path class="lc-applied" d="${appliedPath}"/>
        ${pts.map((p) => `<circle class="lc-dot" cx="${X(p.applied).toFixed(1)}" cy="${Y(p.tone).toFixed(1)}" r="2"/>`).join("")}
      </svg>`;
    return h(
      "div",
      {},
      h("div", { class: "an-svg", html: svg }),
      this.legend([
        { mark: "solid", label: "applied C" },
        { mark: "fill", label: "gamut ceiling" },
        { mark: "faint", label: "tone L*" },
      ]),
    );
  }


  // Tone curve — L* (tone) per stop across the ramp.
  graphTone(view, idx) {
    const vp = view.palettes[idx];
    if (!vp) return h("div", { class: "an-empty" }, "—");
    const W = 244, H = 120, pad = 22;
    const pts = vp.ramp;
    const X = (i) => pad + (i / (pts.length - 1)) * (W - pad - 8);
    const Y = (t) => 8 + ((100 - t) / 100) * (H - pad - 8);
    const line = "M" + pts.map((s, i) => `${X(i).toFixed(1)},${Y(s.tone).toFixed(1)}`).join(" L");
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <text x="2" y="${Y(100) + 3}">L*</text>
        <text x="${W - 26}" y="${H - pad + 18}">stops</text>
        <path class="lc-applied" d="${line}"/>
        ${pts.map((s, i) => `<circle class="lc-dot" cx="${X(i).toFixed(1)}" cy="${Y(s.tone).toFixed(1)}" r="1.8"/>`).join("")}
      </svg>`;
    return h("div", { class: "an-svg", html: svg });
  }


  // Chroma curve — applied chroma per stop vs the gamut ceiling (edge damping).
  graphChroma(view, idx) {
    const vp = view.palettes[idx];
    if (!vp) return h("div", { class: "an-empty" }, "—");
    const W = 244, H = 120, pad = 22;
    const pts = vp.ramp;
    const maxC = Math.max(8, ...pts.map((s) => Math.max(s.maxc, s.chroma))) * 1.05;
    const X = (i) => pad + (i / (pts.length - 1)) * (W - pad - 8);
    const Y = (c) => (H - pad + 8) - (c / maxC) * (H - pad - 8);
    const ceil = "M" + pts.map((s, i) => `${X(i).toFixed(1)},${Y(s.maxc).toFixed(1)}`).join(" L");
    const applied = "M" + pts.map((s, i) => `${X(i).toFixed(1)},${Y(s.chroma).toFixed(1)}`).join(" L");
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <text x="2" y="14">C</text>
        <text x="${W - 26}" y="${H - pad + 18}">stops</text>
        <path class="lc-toneline" d="${ceil}"/>
        <path class="lc-applied" d="${applied}"/>
        ${pts.map((s, i) => `<circle class="lc-dot" cx="${X(i).toFixed(1)}" cy="${Y(s.chroma).toFixed(1)}" r="1.6"/>`).join("")}
      </svg>`;
    return h(
      "div",
      {},
      h("div", { class: "an-svg", html: svg }),
      this.legend([
        { mark: "solid", label: "applied C" },
        { mark: "faint", label: "gamut ceiling" },
      ]),
    );
  }


  // Contrast — the selected palette's on-color vs fill ratios; flag <4.5:1.
  graphContrast(view, idx) {
    const vp = view.palettes[idx];
    const cr = vp ? view.contrast.find((c) => c.palette === vp.name) : null;
    if (!cr) return h("div", { class: "an-empty" }, "—");
    const bar = (label, ratio) => {
      const pass = ratio >= 4.5;
      const pct = Math.min(100, (ratio / 7) * 100);
      return h(
        "div",
        { class: "an-bar" },
        h("span", { class: "an-bk" }, label),
        h(
          "span",
          { class: "an-track" },
          // the WCAG 4.5:1 pass line (track spans 0–7:1, so 4.5/7 ≈ 64.3%).
          h("span", { class: "an-thresh", title: "4.5:1 minimum" }),
          h("span", { class: "an-fill" + (pass ? "" : " bad"), style: `width:${pct.toFixed(0)}%` }),
        ),
        h("b", { class: pass ? "pass" : "fail" }, ratio.toFixed(2) + " ", icon(pass ? "check" : "warning", { size: 12 })),
      );
    };
    return h(
      "div",
      { class: "an-contrast" },
      bar("on/fill", cr.onFill),
      bar("vs #fff", cr.onWhite),
      bar("vs #000", cr.onBlack),
    );
  }


  // dampPresets — a row of one-click chips that set all four damping knobs together.
  // The chip matching the current values is highlighted; each is a single undo step.
  dampPresets() {
    const d = this.doc;
    const active = (p) =>
      d.damp === p.damp && d.dampCurve === p.dampCurve && d.dampAmp === p.dampAmp && d.dampBias === p.dampBias;
    return h(
      "div",
      { class: "damp-presets" },
      ...DAMP_PRESETS.map((p) =>
        chip(p.name, {
          mode: "interactive",
          on: active(p),
          title: `damp ${p.damp} · falloff ${p.dampCurve} · amplify ${p.dampAmp} · bias ${p.dampBias}`,
          onclick: () =>
            this.commit((doc) => {
              doc.damp = p.damp;
              doc.dampCurve = p.dampCurve;
              doc.dampAmp = p.dampAmp;
              doc.dampBias = p.dampBias;
            }),
        }),
      ),
    );
  }


  // Damping curve — the global chroma multiplier m(stop) the differential damping
  // produces across the ramp. Crosses the 1× line (unity); dips at the ends (damp),
  // can bulge in the mids (amplify), and tilts with bias. Palette-independent.
  graphDamping(doc) {
    const W = 244, H = 116, pad = 22;
    const damp = (doc.damp ?? 80) / 100;
    const gamma = doc.dampCurve ?? 1.5;
    const amp = (doc.dampAmp ?? 0) / 100;
    const bias = (doc.dampBias ?? 0) / 100;
    const M = (stop) => {
      const s = (stop - 500) / 450;
      const uG = Math.abs(s) ** gamma;
      const sideW = Math.max(0, 1 + bias * Math.sign(s));
      return Math.max(0, 1 + amp * (1 - uG) - damp * sideW * uG);
    };
    const ymax = Math.max(1.15, 1 + amp) * 1.05;
    const X = (i) => pad + (i / (STOPS.length - 1)) * (W - pad - 8);
    const Y = (m) => H - pad + 8 - (m / ymax) * (H - pad - 8);
    const line = "M" + STOPS.map((st, i) => `${X(i).toFixed(1)},${Y(M(st)).toFixed(1)}`).join(" L");
    const y1 = Y(1).toFixed(1);
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line class="lc-axis" x1="${pad}" y1="8" x2="${pad}" y2="${H - pad + 8}"/>
        <line class="lc-axis" x1="${pad}" y1="${H - pad + 8}" x2="${W - 6}" y2="${H - pad + 8}"/>
        <line class="dg-unity" x1="${pad}" y1="${y1}" x2="${W - 6}" y2="${y1}"/>
        <text x="2" y="${(+y1 - 3).toFixed(1)}">1×</text>
        <text x="${pad}" y="${H - pad + 18}">light</text>
        <text x="${W - 24}" y="${H - pad + 18}">dark</text>
        <path class="lc-applied" d="${line}"/>
        ${STOPS.map((st, i) => `<circle class="lc-dot" cx="${X(i).toFixed(1)}" cy="${Y(M(st)).toFixed(1)}" r="1.6"/>`).join("")}
      </svg>`;
    return h("div", { class: "an-svg", html: svg });
  }


  // Hue wheel — every ENABLED palette's hue plotted around a circle (whole set).
  graphHueWheel(view) {
    const W = 200, H = 200, cx = W / 2, cy = H / 2, R = 78;
    const sel = this.selectedIndex();
    const dots = this.doc.palettes
      .map((p, i) => ({ p, i, on: view.palettes[i] && view.palettes[i].on }))
      .filter((x) => x.on)
      .map(({ p, i }) => {
        const vp = view.palettes[i];
        const mid = vp.ramp.find((s) => s.stop === 550) || vp.ramp[Math.floor(vp.ramp.length / 2)];
        const a = ((p.hue - 90) * Math.PI) / 180; // 0° at top, clockwise
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        const r = i === sel ? 7 : 5;
        const ring = i === sel ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r + 3}" class="hw-ring"/>` : "";
        return ring + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${mid.hex}" class="hw-dot"/>`;
      })
      .join("");
    const ticks = [0, 90, 180, 270]
      .map((d) => {
        const a = ((d - 90) * Math.PI) / 180;
        return `<text x="${(cx + Math.cos(a) * (R + 14)).toFixed(1)}" y="${(cy + Math.sin(a) * (R + 14) + 3).toFixed(1)}" text-anchor="middle">${d}°</text>`;
      })
      .join("");
    const svg = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${cx}" cy="${cy}" r="${R}" class="hw-circle"/>
        ${ticks}
        ${dots}
      </svg>`;
    return h("div", { class: "an-svg hw", html: svg });
  }


  // selectPalette — pick the palette that drives the right pane + selected graphs.
  selectPalette(id) {
    const max = this.doc.palettes.length - 1;
    this.sel = { kind: "palette", id: Math.max(0, Math.min(id, max)) };
    this.doc.selected = this.sel.id;
    this.render();
  }


  // setSegment — switch the right-pane segmented control (kept in ui-session state).
  setSegment(seg) {
    this.segment = seg;
    this.render();
  }


  // setCanvasView — switch the canvas between the palette ramps, the scrim overlays, and the
  // semantic-mapping table (ui-session state, like canvasTheme — never persisted with the doc).
  setCanvasView(v) {
    this.canvasView = v;
    this.render();
  }


  // setStopsMode — core (19 display stops) vs extended (25 EXPORT_STOPS) for the palette ramps.
  setStopsMode(v) {
    this.stopsMode = v;
    this.render();
  }


  // _canvasScene — the canvas content for the current view (one place, two call sites).
  _canvasScene(view) {
    if (this.canvasView === "scrims") return this.renderScrimsScene(view);
    if (this.canvasView === "mapping") return this.renderMappingScene(view);
    return this.renderRampsScene(view);
  }


  setMapTextMode(v) {
    this.mapTextMode = v;
    this.render();
  }


  // setRoleOverride — re-point a role's raw ref for one mode. Stored as a per-doc override on
  // top of the canonical role table (doc.roleOverrides); applied in projectView + the exporters.
  // One undo step; persisted. An empty/whitespace ref is ignored (use the reset ↺ to revert).
  setRoleOverride(key, mode, ref) {
    ref = String(ref || "").trim();
    if (!ref) return;
    this.commit((d) => {
      d.roleOverrides = d.roleOverrides || {};
      d.roleOverrides[key] = { ...(d.roleOverrides[key] || {}), [mode]: ref };
    });
  }


  // commitMapRaw — free-text editor: the user typed a full token name ("neutral-600"); strip the
  // palette prefix to the ref and store it (unknown refs degrade gracefully in resolveRoleHex).
  commitMapRaw(key, mode, tokenName, n) {
    const s = String(tokenName || "").trim();
    const ref = s.startsWith(n + "-") ? s.slice(n.length + 1) : s;
    this.setRoleOverride(key, mode, ref);
  }


  // clearRoleOverride — revert one mode of one role to canonical (drop the entry if now empty).
  clearRoleOverride(key, mode) {
    this.commit((d) => {
      const e = d.roleOverrides && d.roleOverrides[key];
      if (!e) return;
      delete e[mode];
      if (Object.keys(e).length === 0) delete d.roleOverrides[key];
    });
  }


  clearAllOverrides() {
    this.commit((d) => (d.roleOverrides = {}));
  }


  addPalette() {
    this.commit((d) => {
      // A new palette starts from clean defaults: every shaping control reset to neutral (skew/lift 0,
      // edge-hue 0, same-dir off) so it never inherits the previous palette's tweaks — only the
      // hue/chroma seed defines it. (Global controls are doc-level and shared, so they're untouched.)
      d.palettes.push({ name: "Palette " + (d.palettes.length + 1), hue: 200, chroma: 60, skew: 0, lift: 0, hueShift: 0, hueSameDir: false, on: true });
    });
    this.selectPalette(this.doc.palettes.length - 1);
  }


  // ── New-Palette modal ──────────────────────────────────────────────────────────
  // "+ Palette" opens a native <dialog> (top layer, like the export drawer) that DERIVES a
  // new palette instead of dropping a default. Three modes (segmented tabs):
  //   • Relative — a color-theory relationship (extend/complete/contrast/bridge/anchor/
  //     recontextualize) computed from the included palettes' identity colors.
  //   • Environmental — a neutral/environment tone (chroma-weighted-mean hue + a clamped low
  //     chroma) per docs/reference/color-neutral-derivation.md.
  //   • Custom — pick Hue + Chroma directly (parametric, the classic seed).
  // A/B derive a TARGET OKLCH (engine/derive.mjs), seed hue+chroma from it (seedFromKeyColor),
  // and retain it as the dominant key color; C sets hue+chroma straight. The "Derive from"
  // strip toggles which existing palettes feed A/B — system/status palettes start excluded.

  // status palettes (success/warning/error/…) carry meaning, not character — off by default.
  _isSystemPalette(name) {
    return /\b(success|positive|warning|error|danger|critical|negative|info)\b/.test(String(name || "").toLowerCase());
  }


  openNewPalette() {
    const ps = this.doc.palettes || [];
    this.newPalCtx = new Set(ps.map((_, i) => i).filter((i) => ps[i].on !== false && !this._isSystemPalette(ps[i].name)));
    if (!this.newPalCustom) this.newPalCustom = { hue: 210, chroma: 55 };
    this.newPalDrag = { x: 0, y: 0 }; // reset to centered each open (offset from margin:auto centre)
    this.newPalOpen = true;
    this.render();
  }

  closeNewPalette() { this.newPalOpen = false; this.render(); }


  _toggleCtx(i) {
    const ctx = this.newPalCtx || (this.newPalCtx = new Set());
    if (ctx.has(i)) ctx.delete(i); else ctx.add(i);
    this.render();
  }


  // _beginNewPalDrag — drag the modal by its header. The dialog is centered via `inset:0;
  // margin:auto`, so we offset from centre with a live `transform: translate()` (set in place,
  // no re-render → smooth) and remember the offset in newPalDrag so the next render re-applies it.
  // A drag that starts on a header control (the close button) is ignored.
  _beginNewPalDrag(e) {
    if (e.target && e.target.closest && e.target.closest("button")) return;
    const d = this.querySelector(".newpal");
    if (!d) return;
    const sx = e.clientX, sy = e.clientY;
    const base = { ...(this.newPalDrag || { x: 0, y: 0 }) };
    const move = (ev) => {
      this.newPalDrag = { x: base.x + (ev.clientX - sx), y: base.y + (ev.clientY - sy) };
      d.style.transform = `translate(${this.newPalDrag.x}px, ${this.newPalDrag.y}px)`;
    };
    const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    if (e.preventDefault) e.preventDefault();
  }


  // _syncNewPal — mirror _syncDrawer for the New-Palette <dialog>: re-promote to the top layer
  // after each render (render rebuilds a fresh, closed dialog). Guarded for the headless shim.
  _syncNewPal() {
    const d = this.querySelector(".newpal");
    if (!d || typeof d.showModal !== "function") return;
    if (this.newPalOpen && !d.open) { try { d.showModal(); } catch { /* not attached yet */ } }
    else if (!this.newPalOpen && d.open) { try { d.close(); } catch { /* already closed */ } }
  }


  // a context palette is "neutral" (deprioritized as a derivation primary) if it's named neutral/grey
  // or its identity is near-grey — so a derived/leading neutral never becomes the Relative primary.
  _isNeutralPalette(p, vp) {
    if (/\b(neutral|grey|gray)\b/i.test(String((p && p.name) || ""))) return true;
    return !!(vp && vp.keyOklch && vp.keyOklch[1] < 0.02);
  }


  // the included context palette indices in PRIORITY ORDER: non-neutral palettes first (in palette
  // order — so the first non-neutral is the "primary"), neutrals last. Drives samples[0] = primary.
  _orderedContext(view) {
    const ctx = this.newPalCtx || new Set();
    return [...ctx]
      .filter((i) => view.palettes[i] && view.palettes[i].key)
      .sort((a, b) => {
        const na = this._isNeutralPalette(this.doc.palettes[a], view.palettes[a]) ? 1 : 0;
        const nb = this._isNeutralPalette(this.doc.palettes[b], view.palettes[b]) ? 1 : 0;
        return (na - nb) || (a - b); // neutrals last; otherwise palette index order
      });
  }


  // samples for A/B = each included palette's vivid identity color as OKLCH [L,C,H], PRIORITY-ORDERED
  // (samples[0] = the primary, so deriveRelative pivots on it — see derive.mjs).
  newPalSamples(view) {
    return this._orderedContext(view).map((i) => view.palettes[i].keyOklch);
  }


  // the primary context color (the highest-priority, first non-neutral included palette) — the hex
  // the Relative relationships pivot on, shown as the preview's reference swatch.
  _primaryContextHex(view) {
    const o = this._orderedContext(view);
    return o.length ? view.palettes[o[0]].key : null;
  }


  // the current tab's target: { oklch } for relative/environmental (null if no context), or
  // { custom:true } for the parametric tab.
  newPalTarget(view) {
    if (this.newPalTab === "custom") return { custom: true };
    const samples = this.newPalSamples(view);
    if (!samples.length) return null;
    return { oklch: this.newPalTab === "environmental" ? deriveNeutral(samples) : deriveRelative(this.newPalRel, samples) };
  }


  createNewPalette(view) {
    // the preview IS the source of truth — commit the same palette _newPalProposed projected.
    const proposed = this._newPalProposed(view);
    if (!proposed) { this.toast("Pick at least one palette to derive from"); return; }
    const tab = this.newPalTab;
    const name = "Palette " + (this.doc.palettes.length + 1);
    const pal = { name, hue: proposed.pal.hue, chroma: proposed.pal.chroma, skew: 0, lift: 0, hueShift: 0, hueSameDir: false, on: true };
    if (proposed.pal.keyColors) pal.keyColors = proposed.pal.keyColors; // A/B retain the derived dominant
    this.newPalOpen = false; // close on the commit's render (newPalOpen drives _syncNewPal)
    this.commit((d) => d.palettes.push(pal));
    this.selectPalette(this.doc.palettes.length - 1);
    this.toast(tab === "environmental" ? "Neutral palette derived" : tab === "custom" ? "Palette created" : "Palette derived");
  }


  renderNewPalette(view) {
    const ps = this.doc.palettes || [];
    const ctx = this.newPalCtx || new Set();
    const samples = this.newPalSamples(view);
    const needsCtx = this.newPalTab !== "custom";
    const blocked = needsCtx && samples.length === 0;
    const proposed = blocked ? null : this._newPalProposed(view); // the would-be palette (projected, uncommitted)
    const previewCss = proposed ? proposed.hex : null;
    const TABS = [
      { id: "relative", label: "Relative" },
      { id: "environmental", label: "Environmental" },
      { id: "custom", label: "Custom" },
    ];
    const drag = this.newPalDrag || { x: 0, y: 0 };
    return h(
      "dialog",
      {
        class: "newpal",
        "aria-label": "New palette",
        style: `transform: translate(${drag.x}px, ${drag.y}px)`,
        onclick: (e) => { if (e.target === e.currentTarget) this.closeNewPalette(); },
        oncancel: (e) => { e.preventDefault(); this.closeNewPalette(); },
      },
      // header doubles as the drag handle (move the whole modal); the close button is excluded.
      h(
        "div",
        { class: "drawer-head newpal-head", onpointerdown: (e) => this._beginNewPalDrag(e) },
        h("h3", {}, icon("plus"), "New palette"),
        h("div", { class: "spacer" }),
        btn(icon("x"), { ariaLabel: "Close", onclick: () => this.closeNewPalette() }),
      ),
      // "Derive from" strip — swatch-only chips (name on hover); tap to include/exclude (A/B only).
      h(
        "div",
        { class: "newpal-ctx" + (needsCtx ? "" : " muted") },
        h("div", { class: "newpal-ctx-head" }, h("b", {}, "Derive from"), h("small", {}, needsCtx ? (samples.length ? samples.length + " selected" : "select at least one") : "not used in Custom")),
        h(
          "div",
          { class: "newpal-chips" },
          ...ps.map((p, i) => {
            const vp = view.palettes[i];
            const on = ctx.has(i);
            return h("button", {
              type: "button",
              class: "newpal-chip" + (on ? " on" : ""),
              "aria-pressed": on ? "true" : "false",
              "aria-label": p.name + (on ? " (included)" : " (excluded)"),
              disabled: needsCtx ? undefined : true,
              title: p.name, // the palette name on hover (the swatch carries no text)
              style: `background:${vp ? vp.key : "#888"}`,
              onclick: () => this._toggleCtx(i),
            });
          }),
        ),
      ),
      this.segmented(TABS, this.newPalTab, (id) => { this.newPalTab = id; this.render(); }, { ariaLabel: "Derivation mode", cls: "newpal-seg", role: "group", idPrefix: "npt" }),
      // body = two columns: LEFT = diagrams (hue×chroma circle + chroma curve), RIGHT = the
      // segment's selection/picker + the proposed-palette preview (swatches + ramp).
      h(
        "div",
        { class: "newpal-body" },
        h(
          "div",
          { class: "newpal-cols" },
          h("div", { class: "newpal-col newpal-col-left" }, ...this._newPalDiagrams(view, proposed)),
          h("div", { class: "newpal-col newpal-col-right" }, ...this._newPalRight(view, samples, blocked, proposed)),
        ),
      ),
      h(
        "div",
        { class: "newpal-foot" },
        h(
          "div",
          { class: "newpal-preview" },
          h("span", { class: "newpal-sw", style: `background:${previewCss || "transparent"}` }),
          h("small", {}, blocked ? "Select a palette to derive from" : "Proposed"),
        ),
        h("div", { class: "spacer" }),
        btn("Cancel", { onclick: () => this.closeNewPalette() }),
        btn("Create palette", { variant: "primary", cls: "newpal-create", disabled: blocked, onclick: () => this.createNewPalette(view) }),
      ),
    );
  }


  // _newPalProposed — the would-be palette for the current settings, PROJECTED (not committed):
  // returns { pal, view, vp, hex, target, pos } or null when A/B has no context. `pal` is the
  // minimal palette object (hue/chroma + keyColors for A/B); `view` is its throwaway projectView
  // (palettes[0] = vp, carrying .key + .ramp) so the diagrams + ramp render from real engine output.
  _newPalProposed(view) {
    const tab = this.newPalTab;
    let pal, target = null;
    if (tab === "custom") {
      const c = this.newPalCustom || { hue: 210, chroma: 55 };
      pal = { name: "_probe", hue: Math.round(c.hue), chroma: Math.round(c.chroma), on: true };
    } else {
      const samples = this.newPalSamples(view);
      if (!samples.length) return null;
      target = tab === "environmental" ? deriveNeutral(samples) : deriveRelative(this.newPalRel, samples);
      const s = seedFromKeyColor(target, this.doc.hueSpace) || { hue: 200, chroma: 60 };
      pal = { name: "_probe", hue: s.hue, chroma: s.chroma, on: true, keyColors: [{ role: "dominant", oklch: target.map(Number) }] };
    }
    let pv;
    try { pv = projectView({ ...this.doc, palettes: [pal] }); } catch { return null; }
    const vp = pv.palettes[0];
    // the proposed dot's polar position: target hue/chroma for A/B; the rendered identity for Custom.
    const oklch = target || vp.keyOklch;
    return { pal, view: pv, vp, hex: vp.key, target, pos: { H: oklch[2], C: oklch[1] } };
  }


  // LEFT column — the diagrams. The hue×chroma circle places every context color (and the proposed
  // one) at angle = hue, radius ∝ chroma; the chroma curve reuses the analysis-rail graph.
  _newPalDiagrams(view, proposed) {
    return [
      h(
        "div",
        { class: "newpal-diagram" },
        h("div", { class: "newpal-diagram-title" }, "Hue × chroma — context + proposed"),
        this._hueCircle(view, proposed),
      ),
      h(
        "div",
        { class: "newpal-diagram" },
        h("div", { class: "newpal-diagram-title" }, "Chroma curve — applied vs ceiling"),
        proposed ? this.graphChroma(proposed.view, 0) : h("div", { class: "an-empty" }, "—"),
      ),
    ];
  }


  // _hueCircle — a polar plot: 0° at top, clockwise (90° right · 180° bottom · 270° left). Each dot
  // sits at its hue angle; its distance from centre is its chroma normalized to the busiest sample
  // (greys fall to the middle, vivids to the rim). The proposed color wears an accent ring.
  _hueCircle(view, proposed) {
    const ctx = this.newPalCtx || new Set();
    const dots = [];
    for (const i of ctx) {
      const vp = view.palettes[i];
      if (!vp || !vp.keyOklch) continue;
      const [, C, H] = vp.keyOklch;
      dots.push({ H, C, fill: vp.key, on: false });
    }
    if (proposed) dots.push({ H: proposed.pos.H, C: proposed.pos.C, fill: proposed.hex, on: true });
    const SZ = 280, cx = SZ / 2, cy = SZ / 2, R = SZ / 2 - 30;
    const maxC = Math.max(0.08, ...dots.map((d) => d.C)); // floor so a near-grey-only set still spreads
    const at = (H, C) => {
      const rr = R * Math.min(1, C / maxC), a = (H * Math.PI) / 180;
      return [cx + rr * Math.sin(a), cy - rr * Math.cos(a)];
    };
    const dotSvg = dots.map((d) => {
      const [x, y] = at(d.H, d.C);
      return d.on
        ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" class="hc-ring"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" class="hc-dot" fill="${d.fill}"/>`
        : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" class="hc-dot" fill="${d.fill}"/>`;
    }).join("");
    const svg = `
      <svg width="${SZ}" height="${SZ}" viewBox="0 0 ${SZ} ${SZ}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${cx}" cy="${cy}" r="${R}" class="hc-rim"/>
        <text x="${cx}" y="13" class="hc-axis" text-anchor="middle">0°</text>
        <text x="${SZ - 4}" y="${cy + 4}" class="hc-axis" text-anchor="end">90°</text>
        <text x="${cx}" y="${SZ - 3}" class="hc-axis" text-anchor="middle">180°</text>
        <text x="4" y="${cy + 4}" class="hc-axis" text-anchor="start">270°</text>
        ${dotSvg}
      </svg>`;
    return h("div", { class: "an-svg newpal-hc", html: svg });
  }


  // RIGHT column — segment-specific: the selection/picker, then the proposed-palette preview.
  _newPalRight(view, samples, blocked, proposed) {
    const pane = h("div", { class: "newpal-pp-host" }, this._newPalPreviewPane(view, proposed));
    if (this.newPalTab === "relative") return [this._relSelect(), pane];
    if (this.newPalTab === "environmental") {
      return [
        h("p", { class: "newpal-note" }, "A neutral environment tone for backgrounds, surfaces, dividers, and system text. Its hue is the chroma-weighted average of the selected palettes — the saturated members set the temperature — at a chroma low enough to still read as grey."),
        blocked ? false : h("p", { class: "newpal-readout" }, ...this._envReadout(samples)),
        pane,
      ];
    }
    return [this._customPicker(proposed), pane];
  }


  // the relationship radio group (a single column inside the right pane).
  _relSelect() {
    return h(
      "div",
      { class: "newpal-rels", role: "radiogroup", "aria-label": "Relationship" },
      ...RELATIONSHIPS.map((r) => {
        const on = this.newPalRel === r.id;
        return h(
          "button",
          {
            type: "button",
            class: "newpal-rel" + (on ? " on" : ""),
            role: "radio",
            "aria-checked": on ? "true" : "false",
            onclick: () => { this.newPalRel = r.id; this.render(); },
          },
          h("b", { class: "newpal-rel-label" }, r.label),
          h("small", { class: "newpal-rel-hint" }, r.hint),
        );
      }),
    );
  }


  // the Custom picker — a native color picker + parametric Hue/Chroma sliders. Picking a color seeds
  // hue/chroma from it (CAM16 recovery); the sliders fine-tune. Both touch newPalCustom (not the
  // doc/undo stack) and refresh the preview + diagrams in place (a full render would recreate the
  // range input mid-drag / detach the OS color panel) — the sliders re-sync on the picker's `change`.
  _customPicker(proposed) {
    const c = this.newPalCustom || (this.newPalCustom = { hue: 210, chroma: 55 });
    const slider = (label, key, min, max, fmtFn) => {
      const readout = h("b", {}, fmtFn(c[key]));
      return h(
        "div",
        { class: "field" },
        h("label", {}, label, readout),
        h("input", {
          type: "range",
          "data-fk": "npc:" + key,
          "aria-label": label,
          min, max, step: 1, value: c[key],
          oninput: (e) => { const v = parseFloat(e.target.value); c[key] = v; readout.textContent = fmtFn(v); this._refreshNewPalPreview(); },
        }),
      );
    };
    return h(
      "div",
      { class: "newpal-custom" },
      h("p", { class: "newpal-note" }, "Pick a color, or set hue and chroma directly. The ramp builds from these the same way every palette does."),
      h(
        "div",
        { class: "field newpal-color-field" },
        h("label", {}, "Color"),
        h("input", {
          type: "color",
          class: "newpal-color-input",
          "data-fk": "npc:color",
          "aria-label": "Pick a color",
          value: (proposed && proposed.hex) || "#888888",
          // live: recover hue/chroma from the picked color + refresh the preview in place (don't
          // rebuild the input mid-pick — that would detach the OS color panel).
          oninput: (e) => { const s = seedFromKeyColor(hexToOklch(e.target.value), this.doc.hueSpace); if (s) { c.hue = s.hue; c.chroma = s.chroma; this._refreshNewPalPreview(); } },
          // settle: full render so the Hue/Chroma sliders move to reflect the picked color.
          onchange: () => this.render(),
        }),
      ),
      slider("Hue", "hue", 0, 360, (v) => fmt(v) + "°"),
      slider("Chroma", "chroma", 0, 100, (v) => fmt(v) + "%"),
    );
  }


  // the proposed-palette preview: the proposed Dominant swatch, the Primary it's derived relative to
  // (Relative only — the priority anchor), the priority chain of the remaining context, and the full
  // generated ramp — the colors before committing.
  _newPalPreviewPane(view, proposed) {
    if (!proposed) return h("div", { class: "newpal-preview-pane empty" }, h("small", {}, "Select a palette to derive from"));
    const isRel = this.newPalTab === "relative";
    const chain = isRel ? this._orderedContext(view).map((i) => view.palettes[i].key) : [];
    const ord = ["Primary (anchor)", "Secondary", "Tertiary", "Quaternary"];
    return h(
      "div",
      { class: "newpal-preview-pane" },
      h("div", { class: "newpal-pp-label" }, "Proposed palette"),
      h(
        "div",
        { class: "newpal-pp-swatches" },
        this._ppSwatch("Dominant", proposed.hex),
        chain.length ? this._ppSwatch("Primary", chain[0], "the priority color this relationship pivots on") : false,
      ),
      // priority chain (Relative): the ordered context — primary first, then secondary/tertiary — so
      // the priority order driving the relationship is visible, not just the single anchor.
      isRel && chain.length > 1
        ? h(
            "div",
            { class: "newpal-pp-chain" },
            h("small", {}, "Context priority"),
            h(
              "div",
              { class: "newpal-pp-chain-row" },
              ...chain.map((hex, i) =>
                h("span", { class: "newpal-pp-chain-sw" + (i === 0 ? " primary" : ""), style: `background:${hex}`, title: ord[i] || `#${i + 1}` }),
              ),
            ),
          )
        : false,
      h(
        "div",
        { class: "newpal-ramp" },
        ...proposed.vp.ramp.map((s) => h("i", { class: s.inGamut ? "" : "oog", style: `background:${s.hex}`, title: `${s.stop} · ${s.hex}` })),
      ),
    );
  }

  _ppSwatch(label, css, title) {
    return h("div", { class: "newpal-pp-sw-item", title }, h("span", { class: "newpal-pp-sw", style: `background:${css}` }), h("small", {}, label));
  }


  // _envReadout — the derived neutral's hue + chroma, as a short human line under the description.
  _envReadout(samples) {
    const [, C, H] = deriveNeutral(samples);
    return ["Derived neutral: ", h("b", {}, fmt(H) + "° hue"), ", ", h("b", {}, "chroma " + C.toFixed(3)), " — a tinted grey."];
  }


  // _refreshNewPalPreview — recompute the diagrams + preview pane IN PLACE (no full render), so the
  // Custom sliders stay smooth mid-drag (their input nodes, in the right column, are never touched).
  _refreshNewPalPreview() {
    const view = this._view || projectView(this.doc);
    const blocked = this.newPalTab !== "custom" && this.newPalSamples(view).length === 0;
    const proposed = blocked ? null : this._newPalProposed(view);
    const left = this.querySelector(".newpal-col-left");
    if (left) left.replaceChildren(...this._newPalDiagrams(view, proposed));
    const host = this.querySelector(".newpal-pp-host");
    if (host) host.replaceChildren(this._newPalPreviewPane(view, proposed));
    const sw = this.querySelector(".newpal-sw");
    if (sw) sw.style.background = proposed ? proposed.hex : "transparent";
  }


  renderCanvasHeader() {
    return h(
      "div",
      { class: "canvas-header" },
      // when the LEFT pane is collapsed its toggle pops here, at the canvas's left edge.
      !this.panesLeft ? this.paneToggle("left") : false,
      // canvas content toggle — palette ramps vs the scrim overlays.
      this.segmented(
        [
          { id: "palettes", label: "Palettes", title: "Palettes — the tonal ramps" },
          { id: "scrims", label: "Scrims", title: "Scrims — the 7 translucent 500 overlays per palette, over a checkerboard" },
          { id: "mapping", label: "Mapping", title: "Semantic Mapping — each role's Light/Dark raw token, as a table" },
        ],
        this.canvasView,
        (id) => this.setCanvasView(id),
        { cls: "canvas-seg", ariaLabel: "Canvas view", idPrefix: "cview" },
      ),
      // stops density (Palettes + Scrims ramps): 19 core stops vs the 25 extended set (half-steps).
      this.canvasView !== "mapping"
        ? this.segmented(
            [
              { id: "core", label: "Core", title: "19 stops · 050/100/150/200/…" },
              { id: "extended", label: "All", title: "25 stops · adds 075/125/175/825/875/925" },
            ],
            this.stopsMode,
            (id) => this.setStopsMode(id),
            { cls: "canvas-seg", ariaLabel: "Ramp stops", role: "group", idPrefix: "stops" },
          )
        : false,
      // trailing tool group, right-aligned: fit · scheme · zoom · + Palette.
      h("div", { class: "spacer" }),
      // fit/orient — reset the canvas view to centre at 100% (icon-only).
      btn(icon("crosshair"), {
        title: "Fit — reset the canvas view to centre at 100%",
        ariaLabel: "Fit — reset the canvas view to centre at 100%",
        onclick: () => {
          this.fit();
          this.render();
        },
      }),
      // unified Mode control — the Color section's value modes: Light · Dark · Both (Both = the side-by-side
      // Compare view). Generalizes the old sun/moon/auto scheme toggle (Type/Geom keep canvasThemeBtn until
      // breakpoints land).
      this.colorModeControl(),
      btn(icon("minus"), { ariaLabel: "Zoom out", onclick: () => this.zoomBy(-1) }),
      h("span", { class: "zoom-readout", role: "status", "aria-live": "polite", "aria-label": "Zoom level" }, Math.round(this.viewport.zoom * 100) + "%"),
      btn(icon("plus"), { ariaLabel: "Zoom in", onclick: () => this.zoomBy(1) }),
      btn([icon("plus"), "Palette"], { cls: "add-pal-btn", title: "Create a new palette — derive it from your palette set, or pick one custom", onclick: () => this.openNewPalette() }),
      // when the RIGHT pane is collapsed its toggle pops here, at the canvas's right edge.
      !this.panesRight ? this.paneToggle("right") : false,
    );
  }


  // The canvas IS the 2D pannable space; the ramp rows ARE the palette navigator. The Mapping
  // view is a DATA TABLE, not a visual scene — it scrolls instead of pan/zoom (is-table).
  renderCanvasArea(view) {
    const isTable = this.canvasView === "mapping";
    // Color "Both" mode → the side-by-side Compare (Palettes/Scrims only; the Mapping table already shows
    // both modes' refs, so it renders normally).
    if (this.section === "color" && this.colorMode === "both" && !isTable) return this.renderCompareArea(view);
    const scene = this._canvasScene(view);
    const area = h(
      "div",
      {
        class: "canvas-area canvas-scheme-" + this.resolvedCanvasScheme() + (isTable ? " is-table" : ""),
        style: "--canvas-bg:" + this.canvasBg(),
        role: "group",
        "aria-label": isTable ? "Semantic mapping table" : "Palette canvas — drag to pan, wheel to zoom, double-click to reset",
      },
      h("div", { class: "canvas-scene" }, scene),
    );
    if (!isTable) {
      // shift-drag (or middle-drag) pans · wheel zooms about cursor · click selects.
      this.wirePanZoom(area);
      // Apply the live transform after layout so the readout + centering are correct.
      requestAnimationFrame(() => this.applyTransform());
    }
    return area;
  }


  // colorModeControl — the unified Mode control in the Color canvas header (Light · Dark · Both). It
  // replaces the old sun/moon/auto scheme toggle: Light/Dark preview a single value mode, Both opens the
  // side-by-side Compare. (Type/Geom keep canvasThemeBtn until breakpoints add their modes — Phase 5.)
  colorModeControl() {
    return this.segmented(
      [
        { id: "light", label: "Light", title: "Preview the Light value mode" },
        { id: "dark", label: "Dark", title: "Preview the Dark value mode" },
        { id: "both", label: "Both", title: "Compare — Light & Dark side by side" },
      ],
      this.colorMode,
      (id) => this.setColorMode(id),
      { cls: "canvas-seg", ariaLabel: "Color value mode", role: "group", idPrefix: "cmode" },
    );
  }

  setColorMode(v) { this.colorMode = v; this.render(); }


  // renderCompareArea — the Color "Both" mode: the canvas scene rendered in Light AND Dark, side by side,
  // inside ONE pannable .canvas-scene (so pan/zoom/fit move both columns together). Each column forces its
  // own scheme via _schemeOverride, so canvasBg() + every resolvedCanvasScheme() read while the scene
  // builds resolves per-column.
  renderCompareArea(view) {
    const area = h(
      "div",
      { class: "canvas-area canvas-compare", role: "group", "aria-label": "Compare — Light and Dark side by side · drag to pan, wheel to zoom" },
      h("div", { class: "canvas-scene compare" },
        this._compareColumn(view, "light"),
        this._compareColumn(view, "dark")),
    );
    this.wirePanZoom(area);
    requestAnimationFrame(() => this.applyTransform());
    return area;
  }

  _compareColumn(view, scheme) {
    this._schemeOverride = scheme; // force resolvedCanvasScheme() while this column's scene + bg resolve
    const bg = this.canvasBg();
    const scene = this._canvasScene(view);
    this._schemeOverride = null;
    return h(
      "div",
      { class: "compare-col canvas-scheme-" + scheme, style: "--canvas-bg:" + bg },
      h("div", { class: "compare-col-label" }, scheme === "dark" ? "Dark" : "Light"),
      scene,
    );
  }


  // Ramps scene — each ENABLED palette = a clickable navigator row: name + ●/○
  // enable toggle + its stop swatches. Click (not drag) selects that palette.
  renderRampsScene(view) {
    const rows = this.doc.palettes
      .map((p, i) => ({ p, i, vp: view.palettes[i] }))
      .filter((x) => x.vp && x.vp.on)
      .map(({ p, i, vp }) => {
        // highlight only when there's an EXPLICIT palette selection (Esc clears it)
        const selected = this.sel.kind === "palette" && this.selectedIndex() === i;
        const stops = this.stopsMode === "extended" ? vp.fullRamp : vp.ramp; // 25 vs 19
        const strip = h(
          "div",
          { class: "ramp-strip" },
          ...stops.map((s) =>
            h("i", {
              style: `background:${s.hex}`,
              class: s.inGamut ? "" : "oog",
              title: `${vp.name} ${s.stop} · ${s.hex} · tone ${fmt(s.tone)}`,
              onmouseenter: () => {
                this.hover = { name: vp.name, stop: s.stop, hex: s.hex, tone: s.tone, inGamut: s.inGamut };
                this.paintCanvasFooter();
              },
              onmouseleave: () => {
                this.hover = null;
                this.paintCanvasFooter();
              },
            }),
          ),
        );
        return h(
          "div",
          {
            class: "ramp-row" + (selected ? " sel" : ""),
            style: this.containerBg(vp) ? "background:" + this.containerBg(vp) : null, // tint = palette's 150 stop
            "data-pi": i, // real index into doc.palettes (for reorder hit-testing)
            // click selects the palette — but never on a pan-drag OR a handle-drag.
            onclick: () => {
              if (this._didDrag || this._reordering) {
                this._didDrag = false;
                this._reordering = false; // consume the post-reorder click guard
                return;
              }
              this.selectPalette(i);
            },
          },
          h(
            "div",
            { class: "ramp-head" },
            this.dragHandle(i),
            h(
              "span",
              {
                class: "enable",
                title: "Toggle enabled",
                // a clickable span is invisible to the keyboard — give it button
                // semantics, focusability, and Enter/Space activation.
                role: "button",
                tabindex: "0",
                "aria-pressed": p.on !== false ? "true" : "false",
                "aria-label": (p.on !== false ? "Disable " : "Enable ") + vp.name + " palette",
                onclick: (e) => {
                  e.stopPropagation();
                  this.commit((d) => (d.palettes[i].on = !(d.palettes[i].on !== false)));
                },
                onkeydown: (e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  this.commit((d) => (d.palettes[i].on = !(d.palettes[i].on !== false)));
                },
              },
              icon(p.on !== false ? "dot" : "circle", { size: 13 }),
            ),
            h("span", { class: "ramp-name" }, vp.name, h("small", {}, `${stops.length} stops`)),
          ),
          // retained key colors (when set): the brand colors, above the generated ramp,
          // each captioned with its nearest stop (the perceptual placement). Off-ramp by design.
          this.keyStrip(vp),
          strip,
        );
      });
    // disabled palettes still appear as ghost rows so they can be re-enabled.
    const offRows = this.doc.palettes
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.on === false)
      .map(({ p, i }) =>
        h(
          "div",
          {
            class: "ramp-row off",
            "data-pi": i,
            onclick: () => {
              if (this._reordering) { this._reordering = false; return; }
              this.selectPalette(i);
            },
          },
          h(
            "div",
            { class: "ramp-head" },
            this.dragHandle(i),
            h(
              "span",
              {
                class: "enable",
                title: "Enable",
                onclick: (e) => {
                  e.stopPropagation();
                  this.commit((d) => (d.palettes[i].on = true));
                },
              },
              icon("circle", { size: 13 }),
            ),
            h("span", { class: "ramp-name off" }, p.name || "(unnamed)", h("small", {}, "disabled")),
          ),
        ),
      );
    if (rows.length === 0 && offRows.length === 0) return h("div", { class: "empty-note" }, "No palettes");
    const stack = h("div", { class: "ramp-stack" }, ...rows, ...offRows);
    this._wireReorder(stack); // pointer-drag the ⋮⋮ handle to reorder palettes
    return stack;
  }


  // renderScrimsScene — the canvas "Scrims" view. Per ENABLED palette, the 7 scrim roles
  // (scrimWeakest..scrimStrongest = the 500-base color at 10–55% alpha, already resolved in
  // view.palettes[i].roles as #RRGGBBAA). Each cell paints the translucent color over a
  // light/dark split so the alpha — and how it reads on light vs dark content — is visible.
  // Reuses the ramp-row chrome (drag-reorder, enable, selection) so both views feel identical.
  // scrimAlpha — recover a scrim's alpha % from its #RRGGBBAA byte, so the label always matches
  // the actual color (never a hardcoded list that can drift from SCRIM_STEPS). Nearest 0.5%.
  scrimAlpha(hex8) {
    return Math.round((parseInt(hex8.slice(7, 9), 16) / 255) * 200) / 2;
  }


  renderScrimsScene(view) {
    const rows = this.doc.palettes
      .map((p, i) => ({ p, i, vp: view.palettes[i] }))
      .filter((x) => x.vp && x.vp.on)
      .map(({ p, i, vp }) => {
        const selected = this.sel.kind === "palette" && this.selectedIndex() === i;
        // The FULL scrim ramp: the palette's 500 color at every stop's alpha (alpha% = stop/10),
        // one cell per stop, honoring the Core-19 / All-25 toggle — parallel to the palette ramp.
        const stops = this.stopsMode === "extended" ? vp.fullRamp : vp.ramp;
        const base = vp.fullRamp.find((s) => s.stop === 500) || vp.ramp[Math.floor(vp.ramp.length / 2)];
        const hex500 = (base ? base.hex : "#808080").slice(0, 7); // the solid 500 color, opaque
        const strip = h(
          "div",
          { class: "scrim-strip" },
          ...stops.map((s) => {
            const aByte = Math.round((s.stop / 1000) * 255).toString(16).padStart(2, "0").toUpperCase();
            const hex8 = hex500 + aByte;
            const a = this.scrimAlpha(hex8); // = stop/10, recovered from the byte
            const pad = String(s.stop).padStart(3, "0");
            return h(
              "div",
              {
                class: "scrim-cell",
                title: `${vp.name} · scrim ${pad} · 500 @ ${a}% · ${hex8}`,
                onmouseenter: () => {
                  this.hover = { kind: "scrim", name: vp.name, label: pad, alpha: a, hex: hex8 };
                  this.paintCanvasFooter();
                },
                onmouseleave: () => {
                  this.hover = null;
                  this.paintCanvasFooter();
                },
              },
              h("i", { class: "scrim-fill", style: `background:${hex8}` }),
            );
          }),
        );
        return h(
          "div",
          {
            class: "ramp-row scrim-row" + (selected ? " sel" : ""),
            style: this.containerBg(vp) ? "background:" + this.containerBg(vp) : null, // tint = palette's 150 stop
            "data-pi": i,
            onclick: () => {
              if (this._didDrag || this._reordering) {
                this._didDrag = false;
                this._reordering = false;
                return;
              }
              this.selectPalette(i);
            },
          },
          h(
            "div",
            { class: "ramp-head" },
            this.dragHandle(i),
            h(
              "span",
              {
                class: "enable",
                title: "Toggle enabled",
                role: "button",
                tabindex: "0",
                "aria-pressed": p.on !== false ? "true" : "false",
                "aria-label": (p.on !== false ? "Disable " : "Enable ") + vp.name + " palette",
                onclick: (e) => {
                  e.stopPropagation();
                  this.commit((d) => (d.palettes[i].on = !(d.palettes[i].on !== false)));
                },
                onkeydown: (e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  this.commit((d) => (d.palettes[i].on = !(d.palettes[i].on !== false)));
                },
              },
              icon(p.on !== false ? "dot" : "circle", { size: 13 }),
            ),
            h("span", { class: "ramp-name" }, vp.name, h("small", {}, `500 base · ${stops.length} scrims`)),
          ),
          strip,
        );
      });
    if (rows.length === 0) return h("div", { class: "empty-note" }, "No enabled palettes — toggle one on to see its scrims");
    const stack = h("div", { class: "ramp-stack" }, ...rows);
    this._wireReorder(stack); // reorder works in the scrim view too
    return stack;
  }


  // renderMappingScene — the Semantic Mapping table for the SELECTED palette: every role's
  // chain, one row per mode — [ Mode · swatch · semantic-token · raw-token ]. Read-only for now
  // (the raw/semantic names are the values from the canonical role table; editing them — a
  // per-doc remap/rename — and bidirectional load are the next step, pending the data-model call).
  // keyStrip — the retained key colors row (dominant/supportive) for one palette, captioned with
  // each color's nearest stop. Shown above the ramp AND atop the mapping table so the brand colors
  // stay visible across canvas views (not just the Palettes view).
  keyStrip(vp) {
    if (!vp || !vp.keyColors || !vp.keyColors.length) return false;
    return h(
      "div",
      { class: "key-strip" },
      ...vp.keyColors.map((kc) =>
        h(
          "div",
          { class: "key-cell", title: `${kc.role}${kc.name ? " · " + kc.name : ""} · ${kc.css} · ≈ stop ${kc.nearStop} · drift ${kc.drift}` },
          h("span", { class: "key-fill", style: `background:${kc.css}` }),
          h("small", {}, kc.role + " ≈" + kc.nearStop),
        ),
      ),
    );
  }


  renderMappingScene(view) {
    const vp = view.palettes[this.selectedIndex()];
    if (!vp) return h("div", { class: "empty-note" }, "Select a palette to see its semantic mapping");
    const n = slug(vp.name);
    const ov = this.doc.roleOverrides || {};
    const ovCount = Object.keys(ov).reduce((a, k) => a + Object.keys(ov[k] || {}).length, 0);
    // raw refs you can re-point a role to: the 25 solid stops + every scrim ref (base-step), built
    // from the SAME SCRIM_BASES × SCRIM_STEPS the engine/exporters use — so the scrim roles
    // (e.g. scrim-weakest → 500-050) always have a matching option instead of falling back to 050.
    const scrimRefs = SCRIM_BASES.flatMap((b) => SCRIM_STEPS.map((st) => String(b).padStart(3, "0") + "-" + String(st).padStart(3, "0")));
    const validRefs = [...vp.fullRamp.map((s) => String(s.stop)), ...scrimRefs];
    const tokenName = (ref) => n + "-" + (ref.includes("-") ? ref : ref.padStart(3, "0")); // the displayed raw-token name
    const padRef = (ref) => (ref.includes("-") ? ref : ref.padStart(3, "0"));
    const drift = this.liveVars ? this.driftSummary() : null; // the Figma drift-diff summary, if a live read was done
    // per-mode drift cell: check = matches the file / ✗ drifted / — not in the file / · not read yet.
    const driftCell = (ref, hex) => {
      const st = this.driftStatus(n + "/" + padRef(ref), hex);
      const title = { match: "Matches the file", drift: "Drifted from the file", absent: "Not in the file" }[st]
        || "Click Read live to compare with the file";
      const mark = st === "match" ? icon("check", { size: 12 })
        : st === "drift" ? icon("x", { size: 12 })
        : st === "absent" ? "—" : "·";
      return h("td", { class: "map-file" }, h("span", { class: "map-drift map-drift-" + (st || "none"), title }, mark));
    };

    const rawEditor = (r, mode, ref, overridden) =>
      this.mapTextMode
        ? h("input", {
            class: "map-raw-input" + (overridden ? " ov" : ""),
            type: "text",
            value: tokenName(ref),
            "data-fk": "map:" + r.key + ":" + mode,
            "aria-label": r.name + " " + mode + " raw token",
            onchange: (e) => this.commitMapRaw(r.key, mode, e.target.value, n),
          })
        : h(
            "select",
            {
              class: "map-raw-select" + (overridden ? " ov" : ""),
              "data-fk": "map:" + r.key + ":" + mode,
              "aria-label": r.name + " " + mode + " raw token",
              onchange: (e) => this.setRoleOverride(r.key, mode, e.target.value),
            },
            ...validRefs.map((vr) => h("option", vr === ref ? { value: vr, selected: "selected" } : { value: vr }, tokenName(vr))),
          );

    const modeRow = (r, mode, hex, ref) => {
      const overridden = !!(ov[r.key] && ov[r.key][mode] != null);
      return h(
        "tr",
        { class: "map-row map-" + mode + (mode === "light" ? " map-role-top" : "") + (overridden ? " map-ov" : "") },
        h("td", { class: "map-mode" }, mode === "light" ? "Light" : "Dark"),
        h("td", { class: "map-sw" }, h("span", { class: "map-swatch" }, h("span", { class: "map-swatch-fill", style: `background:${hex}` }))),
        h("td", { class: "map-sem" }, h("code", {}, r.name)),
        h(
          "td",
          { class: "map-raw" },
          rawEditor(r, mode, ref, overridden),
          overridden ? btn(icon("arrow-counter-clockwise", { size: 13 }), { variant: "bare", cls: "map-reset", title: "Reset to canonical", ariaLabel: "Reset to canonical", onclick: () => this.clearRoleOverride(r.key, mode) }) : false,
        ),
        this.inFigma ? driftCell(ref, hex) : false, // drift vs the live Figma variable (#3)
      );
    };
    const bodyRows = vp.roles.flatMap((r) => [
      modeRow(r, "light", r.lightHex, r.lightRef),
      modeRow(r, "dark", r.darkHex, r.darkRef),
    ]);
    return h(
      "div",
      { class: "map-wrap" },
      this.keyStrip(vp), // the palette's retained key colors, visible here too (not just the ramps view)
      h(
        "div",
        { class: "map-head" },
        h("b", {}, "Semantic Mapping"),
        h("small", {}, `${vp.name} · ${vp.roles.length} roles${ovCount ? " · " + ovCount + " re-pointed" : ""}`),
        h("div", { class: "spacer" }),
        // drift summary chip (after a live read) — does the file match what I'd generate now?
        drift ? chip(drift.drifted ? `${drift.drifted} drifted` : "in sync", { tone: drift.drifted ? "has-drift" : "in-sync" }) : false,
        // read the live raw-colors variables from the file and diff (Figma only).
        this.inFigma ? btn([icon("arrows-clockwise"), "Read live"], { title: "Read the live raw-colors variables from this file and compare (drift)", onclick: () => this.readLiveVariables() }) : false,
        ovCount ? btn("Reset " + ovCount, { title: "Revert all re-points to the canonical mapping", onclick: () => this.clearAllOverrides() }) : false,
        btn([icon("arrows-left-right"), this.mapTextMode ? "text" : "select"], {
          ariaPressed: this.mapTextMode ? "true" : "false",
          title: "Switch the raw-token editor between a select menu and a free text input",
          onclick: () => this.setMapTextMode(!this.mapTextMode),
        }),
      ),
      h(
        "table",
        { class: "map-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Mode"), h("th", { class: "map-sw" }, ""), h("th", {}, "Semantic token"), h("th", {}, "Raw token"), this.inFigma ? h("th", {}, "File") : false)),
        h("tbody", {}, ...bodyRows),
      ),
    );
  }


  // dragHandle — the ⋮⋮ grip that starts a reorder drag. Its pointerdown stops
  // propagation so it NEVER reaches the canvas pan handler, and the row's onclick
  // is suppressed during/after a reorder (this._reordering guard), so dragging the
  // handle neither pans the canvas nor selects the row.
  dragHandle(i) {
    return h("span", {
      class: "drag-handle",
      title: "Drag to reorder",
      "data-handle": i,
      onpointerdown: (e) => this._beginReorder(e, i),
    });
  }


  // _wireReorder — keep a handle on the live stack node for hit-testing during a
  // drag. Rows carry data-pi (their real doc.palettes index); we read the rects
  // at move-time so the target insertion index is always current.
  _wireReorder(stack) {
    this._rampStack = stack;
  }


  // _rowRects — current [{ pi, top, bottom, mid, el }] for every row in the stack,
  // top-to-bottom. Recomputed per drag-move (cheap; few rows).
  _rowRects() {
    const stack = this._rampStack;
    if (!stack) return [];
    return Array.from(stack.querySelectorAll(".ramp-row[data-pi]")).map((el) => {
      const r = el.getBoundingClientRect();
      return { pi: Number(el.getAttribute("data-pi")), top: r.top, bottom: r.bottom, mid: (r.top + r.bottom) / 2, el };
    });
  }


  // _beginReorder — start a handle-drag. Stops propagation (no canvas pan), sets
  // the reorder guard, and installs document-level move/up so the drag tracks even
  // when the pointer leaves the handle. The actual move happens once on release.
  _beginReorder(e, src) {
    e.stopPropagation(); // never let the canvas pan-handler see this press
    e.preventDefault();
    this._reorder = { src, dropPi: src, before: true, moved: false };
    this._reordering = false; // becomes true once the pointer actually moves
    const handle = e.currentTarget;
    if (handle && handle.setPointerCapture) {
      try { handle.setPointerCapture(e.pointerId); } catch {}
    }
    // find the source ROW for the grabbed handle (parentNode walk — works in the browser AND the
    // headless DOM shim, which has no Element.closest / attribute selectors).
    let srcRow = handle;
    while (srcRow && !(srcRow.classList && srcRow.classList.contains("ramp-row"))) srcRow = srcRow.parentNode;
    this._reorder.srcRow = srcRow || null;
    this._buildDragGhost(e, srcRow); // lift a floating clone + drop a placeholder (browser only; no-ops in the shim)
    this._reorderMove = (ev) => this._onReorderMove(ev);
    this._reorderUp = (ev) => this._onReorderUp(ev);
    document.addEventListener("pointermove", this._reorderMove);
    document.addEventListener("pointerup", this._reorderUp);
    document.addEventListener("pointercancel", this._reorderUp);
    this.classList.add("reordering");
  }


  // _buildDragGhost — the visual lift. Clones the dragged row into a viewport-fixed "ghost" that
  // tracks the cursor, and replaces the source row with a same-size dashed PLACEHOLDER so the list
  // visibly parts to show where the drop will land. Appended to the HOST (not the transformed canvas
  // scene) so `position:fixed` is viewport-relative. Guarded: in the headless DOM shim (no cloneNode /
  // real layout) it returns early, leaving the reorder LOGIC unchanged.
  _buildDragGhost(e, srcRow) {
    const st = this._reorder;
    if (!srcRow || typeof srcRow.cloneNode !== "function" || typeof srcRow.getBoundingClientRect !== "function") return;
    const rect = srcRow.getBoundingClientRect();
    if (!rect || !rect.width) return;
    st.grabDx = (e.clientX ?? rect.left) - rect.left;
    st.grabDy = (e.clientY ?? rect.top) - rect.top;
    const ghost = srcRow.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.classList.remove("sel"); // the lifted clone isn't the selection ring
    // The ghost is re-parented to the HOST (for viewport-fixed positioning), but the row it clones
    // lives in the CANVAS — whose color-scheme (the ◐ preview toggle) is independent of the app chrome.
    // Pin the canvas's resolved scheme on the ghost so its light-dark() tokens (--ink, --panel, …)
    // resolve in the mode it visually belongs to, not the host's (else a light-canvas row dragged while
    // the chrome is dark renders dark-mode text on the light row).
    ghost.style.colorScheme = this.resolvedCanvasScheme();
    ghost.style.width = rect.width + "px";
    ghost.style.height = rect.height + "px";
    ghost.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    this.appendChild(ghost);
    st.ghostEl = ghost;
    const ph = document.createElement("div");
    ph.className = "drop-ghost";
    ph.style.height = rect.height + "px";
    st.placeholderEl = ph;
    // drop the placeholder into the source's slot, then collapse the source — the lift is immediate.
    if (srcRow.parentNode) srcRow.parentNode.insertBefore(ph, srcRow);
    srcRow.style.display = "none";
  }


  // _syncDropFromPlaceholder — read the committed drop (dropPi/before) from the placeholder's live DOM
  // position: it drops BEFORE the next real row, or AFTER the previous one if it's at the very end. The
  // collapsed source row (data-pi === src) is skipped so it never reads as the target.
  _syncDropFromPlaceholder() {
    const st = this._reorder;
    const ph = st && st.placeholderEl;
    if (!ph || !ph.parentNode) return;
    const isRow = (n) => n && n.classList && n.classList.contains("ramp-row") && n.getAttribute && n.getAttribute("data-pi") != null && Number(n.getAttribute("data-pi")) !== st.src;
    let next = ph.nextSibling;
    while (next && !isRow(next)) next = next.nextSibling;
    if (next) { st.dropPi = Number(next.getAttribute("data-pi")); st.before = true; return; }
    let prev = ph.previousSibling;
    while (prev && !isRow(prev)) prev = prev.previousSibling;
    if (prev) { st.dropPi = Number(prev.getAttribute("data-pi")); st.before = false; }
  }


  // _teardownDragGhost — remove the floating clone + placeholder and un-hide the source row. The
  // subsequent render() rebuilds the stack anyway; this just keeps the frame clean before it.
  _teardownDragGhost() {
    const st = this._reorder;
    if (!st) return;
    if (st.ghostEl && st.ghostEl.parentNode) st.ghostEl.parentNode.removeChild(st.ghostEl);
    if (st.placeholderEl && st.placeholderEl.parentNode) st.placeholderEl.parentNode.removeChild(st.placeholderEl);
    if (st.srcRow && st.srcRow.style) st.srcRow.style.display = "";
    st.ghostEl = null; st.placeholderEl = null;
  }


  // _onReorderMove — the floating clone tracks the cursor 1:1; the DROP slot is decided relative to
  // the PLACEHOLDER's own position (the proposed placement) with a 10px deadzone, so it only reslots
  // when the cursor moves clearly past the placeholder's edge — stable, never jittering from the
  // reflow. Headless (no placeholder) falls back to the row-midpoint hit-test so the verifier holds.
  _onReorderMove(ev) {
    const st = this._reorder;
    if (!st) return;
    this._reordering = true;
    st.moved = true;
    if (ev.preventDefault) ev.preventDefault();
    const y = ev.clientY;
    // the floating clone follows the cursor (anchored under the original grab point).
    if (st.ghostEl) st.ghostEl.style.transform = `translate(${(ev.clientX ?? 0) - (st.grabDx || 0)}px, ${(y ?? 0) - (st.grabDy || 0)}px)`;

    // Browser path — the hit area is the placeholder (proposed placement) ± SENS px. Step the
    // placeholder one row toward the cursor while it's past the deadzone (bounded, to keep up with a
    // fast flick), re-reading rects each step since each move reflows the list.
    const SENS = 10; // px the cursor must pass the placeholder edge before the drop reslots
    if (st.placeholderEl && typeof st.placeholderEl.getBoundingClientRect === "function") {
      for (let guard = 0; guard < 64; guard++) {
        const ph = st.placeholderEl.getBoundingClientRect();
        const rows = this._rowRects().filter((r) => r.bottom - r.top > 1); // visible rows (not the collapsed source)
        const above = rows.filter((r) => r.bottom <= ph.top + 2).pop();    // row immediately above the placeholder
        const below = rows.find((r) => r.top >= ph.bottom - 2);            // row immediately below it
        if (above && y < ph.top - SENS) { st.placeholderEl.parentNode.insertBefore(st.placeholderEl, above.el); continue; }
        if (below && y > ph.bottom + SENS) { st.placeholderEl.parentNode.insertBefore(st.placeholderEl, below.el.nextSibling); continue; }
        break; // cursor is within the proposed slot's hit area — stable
      }
      this._syncDropFromPlaceholder();
      return;
    }

    // Headless / no placeholder — row-midpoint hit-test (unchanged) so the reorder verifier still works.
    const rects = this._rowRects().filter((r) => r.bottom - r.top > 1);
    if (!rects.length) return;
    let target = null;
    for (const r of rects) {
      if (y < r.mid) { target = { pi: r.pi, before: true }; break; }
      target = { pi: r.pi, before: false };
    }
    if (!target) target = { pi: rects[rects.length - 1].pi, before: false };
    st.dropPi = target.pi;
    st.before = target.before;
  }


  // _onReorderUp — finalize. Translate (dropPi, before) into a destination index in
  // doc.palettes, splice the source there as ONE undo step, and keep `selected` on
  // the SAME palette object (track it by identity across the move).
  _onReorderUp() {
    const st = this._reorder;
    document.removeEventListener("pointermove", this._reorderMove);
    document.removeEventListener("pointerup", this._reorderUp);
    document.removeEventListener("pointercancel", this._reorderUp);
    this.classList.remove("reordering");
    this._teardownDragGhost(); // remove the floating clone + placeholder, un-hide the source row
    this._reorder = null;
    // NOTE: leave this._reordering TRUE if a move happened — the row's onclick
    // fires right after this pointerup and must be suppressed; it (or the next
    // _beginReorder / pointerdown) clears the flag.
    if (!st || !st.moved) { this._reordering = false; this.render(); return; }

    const pals = this.doc.palettes;
    const from = st.src;
    // destination index BEFORE removal: index of dropPi, +1 if dropping "after".
    let to = pals.findIndex((_, idx) => idx === st.dropPi);
    if (st.before === false) to += 1;
    // adjust for the slice-out of `from` when from precedes the insertion point.
    if (from < to) to -= 1;
    to = Math.max(0, Math.min(to, pals.length - 1));
    if (to === from) { this._reordering = false; this.render(); return; }

    // Track the currently-selected palette by identity so selection follows it.
    const selPal = this.doc.palettes[this.selectedIndex()];
    this.pushHistory(); // ONE undo step for the whole reorder
    const [moved] = pals.splice(from, 1);
    pals.splice(to, 0, moved);
    // keep `selected` on the SAME palette object (now at its new index)
    const newSel = this.doc.palettes.indexOf(selPal);
    if (newSel >= 0) {
      this.sel = { kind: "palette", id: newSel };
      this.doc.selected = newSel;
    }
    this.save(); // persist the reordered doc + corrected selection in one shot
    this.render();
    // safety net: if no stray click consumes the guard, clear it next tick.
    setTimeout(() => { this._reordering = false; }, 0);
  }


  // renderStoryInspector — the holistic "Story" tab: the set's concept narrative + the curated
  // colors (name · role · description) + the 60/30/10 groups + what the palette refuses. Mirrors the
  // source's cover layout. Present only for sets that carry a story (the curated travel volumes).
  renderStoryInspector(view) {
    const s = view.story;
    if (!s) return h("div", { class: "empty-note" }, "No story for this palette set.");
    const HIER = { d: "Dominant", s: "Supporting", a: "Accent" };
    const cols = view.palettes.filter((p) => p.colorName); // the curated colors carry the story
    return h(
      "div",
      { class: "story-pane" },
      s.kicker ? h("div", { class: "story-kicker" }, s.kicker) : false,
      s.title ? h("h3", { class: "story-title" }, s.title) : false,
      s.narrative ? h("p", { class: "story-narrative" }, s.narrative) : false,
      cols.length
        ? h(
            "div",
            { class: "story-colors" },
            ...cols.map((p) =>
              h(
                "div",
                { class: "story-color" },
                h("span", { class: "story-swatch", style: `background:${p.key}` }),
                h(
                  "div",
                  { class: "story-color-meta" },
                  h("div", { class: "story-color-name" }, p.colorRole ? h("span", { class: "color-role" }, p.colorRole) : false, p.colorName),
                  p.description ? h("p", { class: "story-color-note" }, p.description) : false,
                ),
              ),
            ),
          )
        : false,
      s.groups && s.groups.length
        ? h(
            "div",
            { class: "story-groups" },
            ...s.groups.map((g) =>
              h(
                "div",
                { class: "story-group" },
                h("div", { class: "story-group-head" }, h("b", {}, HIER[g.hier] || g.hier), h("span", { class: "story-group-pct" }, g.pct + "%")),
                g.note ? h("p", {}, g.note) : false,
              ),
            ),
          )
        : false,
      s.refuses ? h("div", { class: "story-refuses" }, h("b", {}, "Refuses"), h("p", {}, s.refuses)) : false,
    );
  }


  // scrimContext — the sub-variant preview shown atop the Palette inspector while the canvas is
  // in the Scrims view. Scrims have NO independent controls — they ARE this palette's 500 stop at
  // fixed alpha — so the panel shows the 7 swatches and makes the shared-edit relationship explicit:
  // editing Hue / Chroma / Skew / Lift below moves the palette and its scrims together.
  scrimContext(view) {
    const vp = view.palettes[this.selectedIndex()];
    if (!vp) return false;
    const KEYS = ["scrimWeakest", "scrimWeaker", "scrimWeak", "scrim", "scrimStrong", "scrimStronger", "scrimStrongest"];
    const byKey = {};
    for (const r of vp.roles) byKey[r.key] = r;
    return h(
      "div",
      { class: "scrim-context" },
      h("div", { class: "scrim-ctx-head" }, h("b", {}, "Scrims"), h("small", {}, "500 base · 10–55% alpha")),
      h(
        "div",
        { class: "scrim-ctx-strip" },
        ...KEYS.map((k) => {
          const hex8 = (byKey[k] && byKey[k].lightHex) || "#00000000";
          return h("div", { class: "scrim-cell sm", title: `${this.scrimAlpha(hex8)}% · ${hex8}` }, h("i", { class: "scrim-fill", style: `background:${hex8}` }));
        }),
      ),
      h("p", { class: "scrim-ctx-note" }, "A scrim is a sub-variant of this palette — its 500 stop at a fixed alpha. Edit Hue · Chroma · Skew · Lift below and the palette and its scrims move together."),
    );
  }


  renderPaletteInspector(view) {
    const i = this.selectedIndex();
    const p = this.doc.palettes[i];
    if (!p) return h("div", {}, "No palette selected");
    const vp = view.palettes[i];
    // skew + lift shape the CIELAB tone curve (toneAt) — they have NO effect in the OKHSL distribution
    // modes (perceptual/peak step lightness directly), so hide them there, matching the Global controls.
    const isEven = this.doc.toneMode === "even";

    return h(
      "div",
      { class: "insp-body" },
      h("h3", { class: "insp-title" }, swatch((vp.ramp.find((s) => s.stop === 550) || vp.ramp[9]).hex, { size: 16 }), "Palette"),
      h("div", { class: "insp-sub" }, isEven ? "Tune hue · chroma · skew · lift — live" : (this.doc.toneMode === "perceptual" ? "Tune hue · chroma · cusp pull — live" : "Tune hue · chroma — live")),
      // curated story for this color (preset palettes): its evocative name, role, and description.
      vp.colorName
        ? h(
            "div",
            { class: "color-story" },
            h("div", { class: "color-story-name" }, vp.colorRole ? h("span", { class: "color-role" }, vp.colorRole) : false, vp.colorName),
            vp.description ? h("p", { class: "color-story-note" }, vp.description) : false,
          )
        : false,
      // In the Scrims view, surface the sub-variant relationship at the top of the inspector.
      this.canvasView === "scrims" ? this.scrimContext(view) : false,
      field(
        "Name",
        h("input", {
          type: "text",
          "data-fk": "pname",
          value: p.name,
          // typing coalesces into one undo step (editDrag debounce). editDrag does
          // a PARTIAL liveRefresh — it never replaces this <input> (the right pane
          // is left alone), so focus + caret survive mid-word. The canvas row name
          // + analysis header update live. blur/Enter ('change') settles + renders.
          oninput: (e) => this.editDrag((d) => (d.palettes[i].name = e.target.value)),
          onchange: () => {
            this.commitDrag();
            this.render(); // settle: reconcile the right pane + rails post-edit
          },
        }),
      ),
      h(
        "div",
        { class: "field" },
        switchControl({
          on: p.on !== false,
          ariaLabel: "Palette enabled",
          label: p.on !== false ? "Enabled" : "Disabled",
          onToggle: () => this.commit((d) => (d.palettes[i].on = !(d.palettes[i].on !== false))),
        }),
      ),
      this.slider("Hue", p.hue, 0, 360, 1, (v) => fmt(v) + "°", (v) => this.editDrag((d) => (d.palettes[i].hue = v))),
      this.slider("Chroma", p.chroma, 0, 100, 1, (v) => fmt(v) + "%", (v) => this.editDrag((d) => (d.palettes[i].chroma = v))),
      isEven ? this.slider("Skew", p.skew, -100, 100, 1, (v) => fmt(v), (v) => this.editDrag((d) => (d.palettes[i].skew = v))) : false,
      isEven ? this.slider("Lift", p.lift, -40, 40, 1, (v) => fmt(v), (v) => this.editDrag((d) => (d.palettes[i].lift = v))) : false,
      // Cusp pull (perceptual only) — this palette's override of the global Vibrancy: how far its
      // richest stop is nudged toward 500. Starts at the inherited global value; the peak mode pins it.
      this.doc.toneMode === "perceptual"
        ? this.slider("Cusp pull", p.cuspPull ?? (this.doc.vibrancy ?? 0), 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((d) => (d.palettes[i].cuspPull = v)))
        : false,
      // Edge hue rotation — bipolar, centre 0. The readout shows the light/dark torsion:
      // left = light + / dark −, right = light − / dark + (the slider value = the dark edge).
      this.slider(
        "Edge hue",
        p.hueShift ?? 0,
        -60,
        60,
        1,
        (v) => {
          if (v === 0) return "0°";
          const light = -v; // light-end rotation; dark = +v (opposite) or = light (same-direction)
          const dark = p.hueSameDir ? light : v;
          const sgn = (x) => (x > 0 ? "+" : "−") + Math.abs(x);
          return `${sgn(light)}/${sgn(dark)}°`;
        },
        (v) => this.editDrag((d) => (d.palettes[i].hueShift = v)),
      ),
      // mini-checkbox: bend both ends the SAME direction (|s|) instead of opposite torsion (s)
      h(
        "label",
        { class: "mini-check", title: "Bend both ends the same direction (instead of opposite torsion)" },
        h("input", {
          type: "checkbox",
          checked: p.hueSameDir === true,
          onchange: (e) => this.commit((d) => (d.palettes[i].hueSameDir = e.target.checked)),
        }),
        "ends bend same way",
      ),
      this.keyColorsEditor(i, vp),
      h(
        "div",
        { class: "insp-actions" },
        btn([icon("copy"), "Duplicate"], { onclick: () => this.duplicatePalette(i) }),
        btn([icon("trash"), "Delete"], { variant: "danger", onclick: () => this.deletePalette(i) }),
      ),
    );
  }


  // keyColorsEditor — the palette's retained brand colors as two EXPRESSIONS: `dominant`
  // (the main color) and `supportive` (optional). Each is a big swatch (≈ half width) with
  // its ramp placement (≈ stop + drift), a "seed" (align the family to it), and remove. An
  // empty slot captures the palette's current identity color in one click. Values are OKLCH.
  keyColorsEditor(i, vp) {
    const placed = vp.keyColors || []; // [{role, css, nearStop, drift, ...}]
    const slot = (role) => {
      const pl = placed.find((p) => p.role === role);
      if (pl) {
        return h(
          "div",
          { class: "key-slot filled" },
          h("span", { class: "key-fill", style: `background:${pl.css}` }),
          h(
            "div",
            { class: "key-meta" },
            h("span", { class: "key-role" }, role),
            h("span", { class: "key-place", title: `drift ${pl.drift} — perceptual distance to that stop` }, "≈ " + pl.nearStop),
          ),
          h(
            "div",
            { class: "key-acts" },
            btn(icon("arrows-clockwise"), { variant: "bare", cls: "key-act", title: "Seed the palette's hue + chroma from this color", ariaLabel: `Seed palette from ${role} key color`, onclick: () => this.seedFromKey(i, role) }),
            btn(icon("trash"), { variant: "bare", cls: "key-act", title: "Remove", ariaLabel: `Remove ${role} key color`, onclick: () => this.commit((d) => { d.palettes[i].keyColors = (d.palettes[i].keyColors || []).filter((k) => k.role !== role); }) }),
          ),
        );
      }
      return h(
        "button",
        { type: "button", class: "key-slot empty", title: `Add a ${role} key color (captures this palette's current color; edit by seeding)`, "aria-label": `Add ${role} key color`, onclick: () => this.addKeyColor(i, role) },
        icon("plus"), h("span", {}, "Add " + role),
      );
    };
    return h(
      "div",
      { class: "field key-colors" },
      h("label", {}, "Key colors", h("small", {}, "dominant · supportive")),
      h("div", { class: "key-slots" }, slot("dominant"), slot("supportive")),
    );
  }


  // addKeyColor — capture the palette's current identity color (its vivid `key`) as a key
  // color in OKLCH, tagged with the role. One undo step.
  addKeyColor(i, role) {
    const vp = (this._view || projectView(this.doc)).palettes[i];
    if (!vp) return;
    const oklch = vp.keyOklch; // store the HIGH-RES key OKLCH, not a re-measured 8-bit hex
    this.commit((d) => { (d.palettes[i].keyColors = (d.palettes[i].keyColors || []).filter((k) => k.role !== role)).push({ role, oklch }); });
  }


  // seedFromKey — set the palette's hue + chroma from a key color, in the ACTIVE doc's hue space
  // (OKLCH for new docs, CAM16 for a preserved legacy doc), so the generated ramp's family matches the
  // brand color. One undo step.
  seedFromKey(i, role) {
    const kc = (this.doc.palettes[i].keyColors || []).find((k) => k.role === role);
    const s = kc && seedFromKeyColor(kc.oklch, this.doc.hueSpace);
    if (!s) return;
    this.commit((d) => { d.palettes[i].hue = s.hue; d.palettes[i].chroma = s.chroma; });
  }


  duplicatePalette(i) {
    this.commit((d) => {
      const src = d.palettes[i];
      d.palettes.splice(i + 1, 0, { ...src, name: src.name + " copy" });
    });
    this.selectPalette(i + 1);
  }


  deletePalette(i) {
    if (this.doc.palettes.length <= 1) {
      this.toast("Can't delete the last palette");
      return;
    }
    this.commit((d) => d.palettes.splice(i, 1));
    this.selectPalette(Math.max(0, i - 1));
  }


  renderGlobalInspector() {
    const d = this.doc;
    return h(
      "div",
      { class: "insp-body" },
      h("h3", { class: "insp-title" }, icon("gear"), "Global controls"),
      h("div", { class: "insp-sub" }, "Tone curve shared by every palette"),
      field(
        "Distribution",
        h(
          "select",
          { onchange: (e) => this.commit((doc) => (doc.toneMode = e.target.value)) },
          ...["perceptual", "even", "peak"].map((m) => h("option", { value: m, selected: d.toneMode === m }, m)),
        ),
        { labelTitle: "perceptual: even OKHSL-lightness steps + gamut chroma (no near-white dead zone). even: the classic CIELAB curve (tone-aligned across hues; Curve/Tension/Chroma-basis apply). peak: cusp anchored at stop 500." },
      ),
      // Vibrancy (perceptual only): pulls the ramp's center toward the hue's chroma cusp, so the mid
      // stops read vibrant — the fix for hues whose vivid expression is off-center (e.g. yellow). At
      // 100 it equals "peak" mode. Hidden in even (CIELAB) + peak (already pinned at the cusp).
      d.toneMode === "perceptual"
        ? this.slider("Vibrancy", d.vibrancy, 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.vibrancy = v)))
        : false,
      // Curve · Tension · Chroma-basis shape the CIELAB "even" path ONLY — hide them in the OKHSL modes.
      d.toneMode === "even"
        ? field(
            "Curve",
            h(
              "select",
              { onchange: (e) => this.commit((doc) => (doc.curve = e.target.value)) },
              ...CURVES.map((c) => h("option", { value: c, selected: d.curve === c }, c)),
            ),
          )
        : false,
      d.toneMode === "even"
        ? this.slider("Tension", d.tension, 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.tension = v)))
        : false,
      this.slider("L* min", d.lmin, 0, 40, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.lmin = v))),
      this.slider("L* max", d.lmax, 60, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.lmax = v))),
      this.slider("Damp", d.damp, 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.damp = v))),
      // chroma floor (even mode only): lifts the damped light/dark ends back toward the palette's
      // intended chroma so low-chroma ramps don't dead-zone to near-white; never over-saturates.
      d.toneMode === "even"
        ? this.slider("Chroma floor", d.chromaFloor, 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.chromaFloor = v)))
        : false,
      // differential damping curve — falloff (shape) · amplify (mid boost) · bias (L↔D)
      h("div", { class: "sub-head" }, "Differential curve"),
      this.dampPresets(),
      this.slider("Falloff", d.dampCurve, 0.5, 4, 0.1, (v) => fmt(v, 1), (v) => this.editDrag((doc) => (doc.dampCurve = v))),
      this.slider("Amplify", d.dampAmp, 0, 100, 1, (v) => fmt(v), (v) => this.editDrag((doc) => (doc.dampAmp = v))),
      this.slider(
        "Bias",
        d.dampBias,
        -100,
        100,
        1,
        (v) => (v === 0 ? "0" : (v > 0 ? "dark " : "light ") + fmt(Math.abs(v))),
        (v) => this.editDrag((doc) => (doc.dampBias = v)),
      ),
      h("div", { class: "damp-graph" }, this.graphDamping(d)),
      // Hue space + On-color policy — two 2-option choices as side-by-side segmented controls (both
      // options visible, vs a toggle that hid the OFF label). On-colors: "fixed" = the light tint in both
      // modes (ADR-003); "contrast" flips on{N}/on{N}Variant to the better-contrasting end vs the accent fill.
      h(
        "div",
        { class: "global-seg-row" },
        h(
          "div",
          { class: "field" },
          h("label", { title: "OKLCH: perceptual hue (the default). CAM16: the legacy hue model." }, "Hue space"),
          this.segmented(
            [{ id: "oklch", label: "OKLCH" }, { id: "cam16", label: "CAM16" }],
            d.hueSpace === "oklch" ? "oklch" : "cam16",
            (id) => this.commit((doc) => (doc.hueSpace = id)),
            { ariaLabel: "Hue space", role: "group", idPrefix: "huespace", cls: "seg-sm" },
          ),
        ),
        h(
          "div",
          { class: "field" },
          h("label", { title: "Fixed: on-colors are the light tint in both modes (ADR-003). Contrast: on{N}/on{N}Variant flip to the end with the best WCAG contrast vs the accent fill, per mode — accessible, but no longer uniform." }, "On-colors"),
          this.segmented(
            [{ id: "fixed", label: "Fixed" }, { id: "contrast", label: "Contrast" }],
            d.onColorMode === "contrast" ? "contrast" : "fixed",
            (id) => this.commit((doc) => (doc.onColorMode = id)),
            { ariaLabel: "On-colors", role: "group", idPrefix: "oncolor", cls: "seg-sm" },
          ),
        ),
      ),
      d.toneMode === "even"
        ? field(
            "Chroma basis",
            switchControl({
              on: d.relChroma,
              ariaLabel: "Chroma basis — gamut when on, peak when off",
              label: d.relChroma ? "gamut" : "peak",
              onToggle: () => this.commit((doc) => (doc.relChroma = !doc.relChroma)),
            }),
            { labelTitle: "peak: chroma is % of each hue's own peak. gamut: % of every stop's gamut ceiling — palettes harmonize across hue." },
          )
        : false,
    );
  }


  // Roles panel — the 53-role table for the selected palette: key · suffix · the
  // light ref swatch + the dark ref swatch · plus a small live semantic preview.
  renderRolesInspector(view) {
    const idx = this.selectedIndex();
    const p = view.palettes[idx] || view.palettes[0];
    const ns = p ? slug(p.name) : "";
    return h(
      "div",
      {},
      h("h3", { class: "insp-title" }, icon("roles"), "Roles"),
      h("div", { class: "insp-sub" }, `${p ? p.name : ""} — 53 semantic roles · light / dark refs`),
      // (the live component preview is pinned at the bottom of the pane on every
      // tab — see .seg-example / exampleCard — so the Roles panel no longer repeats
      // it here at the top.)
      h(
        "div",
        { class: "roles-table" },
        h(
          "div",
          { class: "rrow rhead" },
          h("span", { class: "k" }, "key"),
          h("span", { class: "suf" }, "suffix"),
          h("span", { class: "sw-pair" }, h("span", {}, "L"), h("span", {}, "D")),
        ),
        ...(p
          ? p.roles.map((r) =>
              h(
                "div",
                { class: "rrow" },
                h("span", { class: "k", title: "--c-" + ns + r.suffix }, r.key),
                h("span", { class: "suf" }, r.suffix || "—"),
                h(
                  "span",
                  { class: "sw-pair" },
                  swatch(r.lightHex, { size: 16, title: "light ref " + r.lightHex, onClick: () => this.copy(r.lightHex, "Copied " + r.lightHex) }),
                  swatch(r.darkHex, { size: 16, title: "dark ref " + r.darkHex, onClick: () => this.copy(r.darkHex, "Copied " + r.darkHex) }),
                ),
              ),
            )
          : []),
      ),
    );
  }
}
export const ColorSection = ColorSectionImpl;
