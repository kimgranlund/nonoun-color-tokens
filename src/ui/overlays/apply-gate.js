import { figmaCollectionNames, slug } from "../model.mjs";
import { serialize } from "../persist.js";
import { typeTokensFigmaModes, typeTokensFigmaPrimitives } from "../../engine/type.mjs";
import { geomTokensFigmaModes } from "../../engine/geometry.mjs";
import { applyRenameMigrations, mergeModeInterchanges, modeApplyPlan, retirementsFor, validateModeInterchange } from "../../../figma/binder/mode-apply-plan.mjs";
import { FIGMA_MIGRATIONS, kebabWaveColorRenames, kebabWaveVarRenames } from "../../../figma/binder/migrations.mjs";
import { primitivesApplyPlan, stylePlans } from "../../../figma/binder/style-plan.mjs";
import { countChangedValues, flattenModePlanValues, flattenPrimitivesPlanValues } from "../../../figma/binder/live-diff.mjs";
import { COLLECTIONS } from "../../engine/collections.js";
import { icon } from "../icons.js";
import { REPO_URL, btn, h, swatch } from "../app-helpers.mjs";

// Prototype mixin (TKT-0023): a class body used ONLY as a verbatim, comma-free carrier for these
// methods — copied onto HctApp.prototype (see app.js's mixin() call), never instantiated directly.
export class ApplyGateMixinImpl {

  // applyToFigma — post the current DTCG bundle to the plugin sandbox (code.js), which
  // creates/updates the raw-colors + Light/Dark variable collections. A safe no-op outside
  // a Figma plugin: parent === window and nothing listens for the pluginMessage envelope.
  // requestApplyToFigma — the GATED entry the Apply / Regroup buttons call. Shows a "back up your
  // variables first" road-block (explicit consent + destructive-overwrite warning) before touching
  // the file. Normal apply is cookieable ("don't show again"); the destructive Regroup ALWAYS warns.
  requestApplyToFigma(rebuild = false) {
    if (!rebuild && this._applyConsented()) { this.applyToFigma(false); return; }
    this.applyGateRebuild = !!rebuild;
    this.applyGateDontShow = false;
    this.applyGateOpen = true;
    // TKT-0020: kick off the live Breakpoints/Font Primitives read-back so the gate can show a
    // changed-value count before the user commits — reset to null (not stale) until the reply lands;
    // _figmaChangedCount()/renderApplyGate treat null as "still checking", 0 as a real answer.
    this._liveFloatVars = null;
    if (this.inFigma) { try { parent.postMessage({ pluginMessage: { type: "read-float-variables" } }, "*"); } catch { /* no frame */ } }
    this.render();
  }

  closeApplyGate() { this.applyGateOpen = false; this.render(); }

  // confirm the gate: persist consent (normal apply only) + run the real apply.
  confirmApplyGate() {
    const rebuild = this.applyGateRebuild;
    if (!rebuild && this.applyGateDontShow) this._setApplyConsent();
    this.applyGateOpen = false;
    this.render(); // CLOSE the gate <dialog> (via _syncApplyGate) + rebuild toastEl — toast() alone never renders
    this.applyToFigma(rebuild);
  }

  // consent is a per-USER preference (not doc-bound) → localStorage, versioned so a material change to
  // apply-behavior can re-surface the warning by bumping the key. (Figma's iframe localStorage may be
  // session-scoped — re-warning once per session for a destructive action is acceptable / safe.)
  _applyConsentKey() { return "ultimate-tokens-apply-consent-v1"; } // renamed: re-shows the back-up warning once (a safety prompt, not data)

  _applyConsented() { try { return localStorage.getItem(this._applyConsentKey()) === "1"; } catch { return false; } }

  _setApplyConsent() { try { localStorage.setItem(this._applyConsentKey(), "1"); } catch { /* storage blocked */ } }


  applyToFigma(rebuild = false) {
    // rebuild = the opt-in "Regroup" path: re-create the Color Semantic collection so it adopts the
    // canonical grouped order (Figma keeps existing variables' positions on a normal update). It
    // re-creates the semantic variables — bound layers detach (warned in the apply gate).
    try {
      // Apply respects the SAME export-system opt-in as Download-All (this.exportSystems): a toggled-off
      // system is NOT written to the file. Color omits `dtcg` (code.js then skips the color collections);
      // Type/Geometry are filtered out of floatPlans below. The config embed travels regardless.
      const sys = this.exportSystems || {};
      const _colorSlugs = sys.color !== false ? (this.doc.palettes || []).filter((p) => p && p.on !== false).map((p) => slug(p.name)) : [];
      const msg = { type: "apply", config: serialize(this.doc), rebuildSemantic: !!rebuild, floatPlans: this._figmaFloatPlans(), collections: figmaCollectionNames(this.doc), renames: { color: { ...kebabWaveColorRenames(_colorSlugs), collections: FIGMA_MIGRATIONS.color.collections } } };
      if (sys.color !== false) msg.dtcg = this.figmaBundle();
      // STYLES (opt-out): the swatch layer bound to the variables — paint styles per semantic role
      // (color on), text styles per voice×step×weight (type on). Pure plans (style-plan.mjs); the
      // sandbox executes them verbatim after the variables land, so bindings always resolve.
      if (sys.styles !== false && (sys.color !== false || sys.type !== false)) {
        const scale = sys.type !== false ? this._typeScaleFor("base") : null;
        let families = [];
        if (sys.color !== false && msg.dtcg && msg.dtcg["Light_tokens.json"]) {
          // the semantic tree keys ARE the variable-name family slugs, in enabled-palette order —
          // pair each with its palette's display name for the style folder segment.
          const enabled = (this.doc.palettes || []).filter((p) => p && p.on !== false);
          families = Object.keys(msg.dtcg["Light_tokens.json"]).filter((k) => k[0] !== "$")
            .map((n, i) => ({ n, name: (enabled[i] && enabled[i].name) || n }));
        }
        const plans = stylePlans({ families, scale, include: { color: sys.color !== false, type: sys.type !== false } });
        if (plans.paints.length || plans.texts.length) {
          plans.renames = FIGMA_MIGRATIONS.styles; // TKT-0012: id-preserving style renames (empty = no-op)
          msg.stylePlans = plans;
          if (plans.texts.length) msg.fontPrimitives = primitivesApplyPlan(typeTokensFigmaPrimitives(scale));
        }
      }
      parent.postMessage({ pluginMessage: msg }, "*");
      // Optimistic "in progress" toast; the sandbox posts {apply-done} back when the write actually completes
      // (→ onApplyDone → a "done" toast), or {apply-error} on failure (→ onApplyError). See the ui.html bridge.
      this.toast(rebuild ? "Regrouping Color Semantic…" : "Applying to Figma…");
    } catch {
      /* not in a frame / blocked — nothing to apply to */
    }
  }


  // onApplyDone / onApplyError — the sandbox's completion callbacks (relayed by the ui.html bridge). The apply
  // is async in the plugin VM, so THIS is the real "done" signal (the applyToFigma toast is only optimistic).
  onApplyDone(m) {
    const n = (m && (Number(m.raw) || 0) + (Number(m.semantic) || 0) + (Number(m.floatVars) || 0)) || 0;
    const st = (m && (Number(m.paintStyles) || 0) + (Number(m.textStyles) || 0)) || 0;
    this.applyGateOpen = false; // defensive: never leave the gate open past completion
    const varsPart = n ? `${n} variable${n === 1 ? "" : "s"}` : "";
    const stylesPart = st ? `${st} style swatch${st === 1 ? "" : "es"}` : "";
    const what = [varsPart, stylesPart].filter(Boolean).join(" + ");
    const missing = m && Array.isArray(m.missingFonts) ? m.missingFonts : [];
    const subbed = m && Array.isArray(m.substitutedFonts) ? m.substitutedFonts : [];
    this.toast(what ? `Applied ${what} to Figma — check the Variables & Styles panels` : "Applied to Figma — check the Variables panel");
    // SECOND toast — the font reality. A substituted family means the style EXISTS with its family
    // still bound to the Font Primitives variable: installing the font adopts it, no re-apply needed.
    // (The sandbox's own notify races the apply-done toast and gets lost, so the UI says it too.)
    if (subbed.length) this.toast(`${m.substituted || subbed.length} text style${(m.substituted || 0) === 1 ? "" : "s"} use a placeholder face — install to see them as designed: ${subbed.slice(0, 4).join(", ")}${subbed.length > 4 ? "…" : ""}. The family stays variable-bound.`);
    if (missing.length) this.toast(`Text styles skipped — no usable font for: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}`);
  }

  onApplyError() {
    this.toast("Couldn't apply to Figma — please try again.");
  }


  // ── legacy-style sweep (Settings › Cleanup, Figma-only) — find real Figma styles that look like ours
  // (their top "/" segment matches a namespace we still use) but aren't anything the CURRENT plan would
  // produce: leftovers from an older naming generation that predate this plugin's own per-style registry,
  // so no ordinary apply/prune can ever reach them. Scan-then-confirm: nothing is ever deleted without the
  // user checking it first (sweepCandidates in code.js is itself read-only; only sweep-delete mutates,
  // and only the exact ids sent).
  _sweepNames() {
    // the SAME resolution applyToFigma uses for its own plan — so "current" here means exactly what the
    // next real apply would produce, never a stale or hypothetical shape.
    const sys = this.exportSystems || {};
    const scale = sys.type !== false ? this._typeScaleFor("base") : null;
    let families = [];
    if (sys.color !== false) {
      const bundle = this.figmaBundle();
      if (bundle && bundle["Light_tokens.json"]) {
        const enabled = (this.doc.palettes || []).filter((p) => p && p.on !== false);
        families = Object.keys(bundle["Light_tokens.json"]).filter((k) => k[0] !== "$")
          .map((n, i) => ({ n, name: (enabled[i] && enabled[i].name) || n }));
      }
    }
    const plans = stylePlans({ families, scale, include: { color: sys.color !== false, type: sys.type !== false } });
    return { textNames: plans.texts.map((t) => t.name), paintNames: plans.paints.map((p) => p.name) };
  }

  scanForLegacyStyles() {
    if (!this.inFigma || this.sweepBusy) return;
    try {
      const { textNames, paintNames } = this._sweepNames();
      this.sweepBusy = true; this.render();
      parent.postMessage({ pluginMessage: { type: "sweep-scan", textNames, paintNames } }, "*");
    } catch { this.sweepBusy = false; this.toast("Couldn't scan — please try again."); }
  }

  receiveSweepScan(m) {
    this.sweepResults = { texts: (m && m.texts) || [], paints: (m && m.paints) || [] };
    this.sweepSelected = new Set();
    this.sweepBusy = false;
    this.render();
  }

  toggleSweepSelect(id) {
    const s = new Set(this.sweepSelected);
    if (s.has(id)) s.delete(id); else s.add(id);
    this.sweepSelected = s;
    this.render();
  }

  toggleSweepSelectAll() {
    const all = this.sweepResults ? [...this.sweepResults.texts, ...this.sweepResults.paints].map((x) => x.id) : [];
    this.sweepSelected = this.sweepSelected.size === all.length ? new Set() : new Set(all);
    this.render();
  }

  deleteSelectedSweep() {
    if (!this.inFigma || this.sweepBusy || !this.sweepSelected.size) return;
    this.sweepBusy = true; this.render();
    try { parent.postMessage({ pluginMessage: { type: "sweep-delete", ids: [...this.sweepSelected] } }, "*"); }
    catch { this.sweepBusy = false; this.toast("Couldn't delete — please try again."); }
  }

  onSweepDone(m) {
    const n = (m && Number(m.removed)) || 0;
    this.sweepBusy = false;
    this.sweepResults = null;
    this.sweepSelected = new Set();
    this.toast(n ? `Removed ${n} legacy style${n === 1 ? "" : "s"}` : "Nothing removed");
    this.render();
  }


  // _figmaFloatPlans — the Type + Geometry halves of the single breakpoint-moded "Geometry" collection
  // (typeTokensFigmaModes / geomTokensFigmaModes over the override-aware base + per-breakpoint mode
  // scales, TKT-0009), MERGED into one interchange and turned into the pure apply PLANS code.js executes
  // (figma/binder/mode-apply-plan.mjs) — one plan per collection is load-bearing: the executor prunes
  // variables per collection against ITS plan, so two plans on "Geometry" would delete each other's
  // halves. Only the systems toggled ON in this.exportSystems are included (a toggled-off system is
  // never applied). Each HALF is validated separately first — a malformed one (the half-bound-import
  // failure) is dropped rather than half-applied; an engine error on one system never blocks the other
  // (or the color apply) — and the merged interchange is validated again (a mode-list mismatch between
  // halves surfaces as missing values there, never as a half-applied file).
  _figmaFloatPlans() {
    const sys = this.exportSystems || {};
    const halves = [];
    const add = (make) => { try { const ix = make(); if (ix && validateModeInterchange(ix).length === 0) halves.push(ix); } catch { /* skip a malformed system */ } };
    if (sys.type !== false) add(() => typeTokensFigmaModes(this._typeScaleFor("base"), this._typeModeScales(), this._typeBaseOpts()));
    if (sys.geometry !== false) add(() => geomTokensFigmaModes(this._geomScaleFor("base"), this._geomModeScales(), this._geomBaseOpts()));
    const ix = mergeModeInterchanges(...halves);
    if (!ix) return [];
    try {
      if (validateModeInterchange(ix).length) return [];
      // TKT-0012: stamp the active rename maps (id-preserving; empty maps = byte-identical no-op).
      // The ADR-016 var map derives from the LIVE plan's names (kebabWaveVarRenames reverses each to
      // its frozen pre-wave form), so custom voices/steps are covered without a hand list.
      const plans = applyRenameMigrations(modeApplyPlan(ix), FIGMA_MIGRATIONS.floats);
      for (const p of plans) {
        const waveVars = kebabWaveVarRenames(p.variables.map((v) => v.name));
        if (Object.keys(waveVars).length) p.renames = { ...waveVars, ...(p.renames || {}) };
      }
      // TKT-0018: the TKT-0009 retirement rule (the merged Breakpoints collection supersedes the old
      // two-collection era's "Typography" once it actually lands type/ variables) is pure + unit-tested
      // in mode-apply-plan.mjs — see FIGMA_MIGRATIONS.floats.retire for the declarative rule.
      return retirementsFor(plans, FIGMA_MIGRATIONS.floats);
    } catch { return []; }
  }


  // receiveLiveFloatVariables — code.js's reply to the read-float-variables request requestApplyToFigma
  // fires when the gate opens (TKT-0020: the Geometry/Type counterpart to receiveLiveVariables' color
  // drift read). Stashes the raw per-collection read-back; _figmaChangedCount derives the count the gate
  // renders. A safe no-op outside the gate (the message simply arrives and re-renders).
  receiveLiveFloatVariables(m) {
    this._liveFloatVars = { breakpoints: (m && m.breakpoints) || { found: false, values: {} }, fontPrimitives: (m && m.fontPrimitives) || { found: false, values: {} } };
    this.render();
  }


  // _figmaChangedCount() — how many LIVE Breakpoints/Font Primitives values the apply the gate is about
  // to confirm would actually overwrite (collections-arch review C2 / TKT-0020): the SAME plans
  // applyToFigma is about to POST (_figmaFloatPlans + the Font Primitives plan, filtered by the SAME
  // exportSystems toggles), diffed against the read-back via the pure figma/binder/live-diff.mjs helpers.
  // null while the read-back hasn't landed yet (nothing to show); 0 is a real, valid answer (first apply,
  // or the file is already in sync).
  _figmaChangedCount() {
    if (!this._liveFloatVars) return null;
    const sys = this.exportSystems || {};
    let n = 0;
    if (sys.type !== false || sys.geometry !== false) {
      const bpLive = (this._liveFloatVars.breakpoints || {}).values || {};
      for (const p of this._figmaFloatPlans()) {
        if (p.collection !== COLLECTIONS.breakpoints) continue;
        n += countChangedValues(flattenModePlanValues(p), bpLive);
      }
    }
    // Font Primitives is only ever WRITTEN alongside text styles (applyToFigma sets msg.fontPrimitives
    // only inside the styles-on branch; code.js only calls applyFontPrimitives when msg.fontPrimitives
    // is present) — so counting it while Styles is toggled off would over-report values this apply
    // never touches.
    if (sys.type !== false && sys.styles !== false) {
      try {
        const plan = primitivesApplyPlan(typeTokensFigmaPrimitives(this._typeScaleFor("base")));
        if (plan) n += countChangedValues(flattenPrimitivesPlanValues(plan), (this._liveFloatVars.fontPrimitives || {}).values || {});
      } catch { /* a malformed scale never blocks the rest of the count */ }
    }
    return n;
  }


  // _syncApplyGate — reconcile the gate <dialog> with applyGateOpen (mirrors _syncDrawer/_syncNewPal).
  _syncApplyGate() {
    const d = this.querySelector(".apply-gate");
    if (!d || typeof d.showModal !== "function") return;
    if (this.applyGateOpen && !d.open) { try { d.showModal(); } catch { /* not attached */ } }
    else if (!this.applyGateOpen && d.open) { try { d.close(); } catch { /* already closed */ } }
  }


  // renderApplyGate — the "back up your variables first" consent road-block shown before Apply/Regroup.
  // A Figma review gate (explicit awareness before modifying the file) AND destructive-overwrite
  // protection (Apply can overwrite same-named variables that components are bound to).
  renderApplyGate() {
    const rebuild = this.applyGateRebuild;
    const MAPPINGS_DOC = REPO_URL + "#figma-plugin";
    return h(
      "dialog",
      {
        class: "apply-gate",
        "aria-label": rebuild ? "Regroup Color Semantic" : "Apply variables to Figma",
        onclick: (e) => { if (e.target === e.currentTarget) this.closeApplyGate(); },
        oncancel: (e) => { e.preventDefault(); this.closeApplyGate(); },
      },
      h(
        "div",
        { class: "drawer-head" },
        h("h3", {}, icon("warning"), rebuild ? "Regroup Color Semantic" : "Apply variables to this file"),
        h("div", { class: "spacer" }),
        btn(icon("x"), { ariaLabel: "Close", onclick: () => this.closeApplyGate() }),
      ),
      h(
        "div",
        { class: "apply-gate-body" },
        h("p", { class: "apply-gate-lede" }, rebuild
          ? "Regroup deletes and re-creates the Color Semantic variables so they adopt the grouped order. Any layers or styles bound to them will detach and need reconnecting — the Ultimate Tokens style swatches are re-bound automatically on this same apply. (Color Primitives are untouched.)"
          : (this.exportSystems && this.exportSystems.styles === false
              ? "This creates or updates the Color Primitives + Color Semantic variable collections in this file. Variables with the same names are overwritten — which can re-skin components already bound to them (sometimes exactly what you want)."
              : "This creates or updates the Color Primitives + Color Semantic variable collections in this file, plus the STYLE swatches bound to them (paint styles per semantic role, text styles per type step — toggle \u201CStyles\u201D in the drawer to opt out). Variables and Ultimate Tokens styles with the same names are overwritten — which can re-skin components already bound to them (sometimes exactly what you want).")),
        h(
          "div",
          { class: "apply-gate-warn" },
          icon("warning", { size: 16 }),
          h("div", {}, h("b", {}, "Back up your file first."), " Duplicate the file (or the collections) before applying, so you can roll back if a mapping overwrites something you meant to keep."),
        ),
        // TKT-0020: the Geometry/Type changed-value count (collections-arch review C2) — a hand-tweaked
        // dimension is invisible today; this surfaces it BEFORE the overwrite, not just after. Figma-only
        // (the read-back is a plugin message); null while the read-back is still in flight. Suppressed
        // entirely on a color-only apply (Type AND Geometry both off) — there is nothing Geometry/Type
        // -shaped for the count to ever mean there. Regroup still carries floatPlans (it only affects
        // the Color Semantic rebuild flag), so the count is just as relevant there — no rebuild guard.
        (this.inFigma && ((this.exportSystems || {}).type !== false || (this.exportSystems || {}).geometry !== false)) ? (() => {
          const n = this._figmaChangedCount();
          return h("p", { class: "apply-gate-drift" + (n ? " has-changes" : "") },
            n === null ? "Checking for hand-edited values in this file…"
              : n > 0 ? `${n} existing Geometry/Type value${n === 1 ? "" : "s"} in this file will be overwritten by this apply.`
              : "No hand-edited Geometry/Type values found — nothing will be overwritten.");
        })() : false,
        h("p", { class: "apply-gate-learn" },
          "Re-routing semantic tokens onto existing variables? ",
          h("button", { type: "button", class: "linklike", onclick: () => { try { window.open(MAPPINGS_DOC, "_blank", "noopener"); } catch {} } }, "Learn how mappings work →"),
        ),
        // "Don't show again" — normal apply only; the destructive Regroup always warns.
        rebuild ? false : h(
          "label",
          { class: "apply-gate-dontshow" },
          h("input", {
            type: "checkbox",
            checked: this.applyGateDontShow ? true : undefined,
            onchange: (e) => { this.applyGateDontShow = !!e.target.checked; },
          }),
          h("span", {}, "Don't show this again"),
        ),
      ),
      h(
        "div",
        { class: "apply-gate-foot" },
        h("div", { class: "spacer" }),
        btn("Cancel", { onclick: () => this.closeApplyGate() }),
        btn(rebuild ? "Regroup variables" : "Apply variables", { variant: "primary", cls: "apply-gate-go", onclick: () => this.confirmApplyGate() }),
      ),
    );
  }
}
export const ApplyGateMixin = ApplyGateMixinImpl;
