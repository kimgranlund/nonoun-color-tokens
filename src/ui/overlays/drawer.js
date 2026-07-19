import { exportDesignSystemBundle, exportDesignSystemMakeBundle, exportDesignSystemSpine, exportDesignSystemStitchBundle, exportDesignSystemTokens, figmaBundle, figmaCollectionNames, slug, tokenCount } from "../model.mjs";
import { serialize } from "../persist.js";
import { typeTokensBreakpointCSS, typeTokensCSS, typeTokensDTCG, typeTokensFigmaModes, typeTokensFigmaPrimitives } from "../../engine/type.mjs";
import { geomTokensBreakpointCSS, geomTokensCSS, geomTokensDTCG, geomTokensFigma, geomTokensFigmaModes } from "../../engine/geometry.mjs";
import { zipStore } from "../zip.mjs";
import { mergeModeInterchanges } from "../../../figma/binder/mode-apply-plan.mjs";
import { COLLECTIONS } from "../../engine/collections.js";
import { primitivesApplyPlan, stylePlans } from "../../../figma/binder/style-plan.mjs";
import { icon } from "../icons.js";
import { ALIASED_README, REPO_URL, btn, chip, h } from "../app-helpers.mjs";

// Prototype mixin (TKT-0023): a class body used ONLY as a verbatim, comma-free carrier for these
// methods — copied onto HctApp.prototype (see app.js's mixin() call), never instantiated directly.
export class DrawerMixinImpl {

  // ── export drawer ────────────────────────────────────────────────────────────
  toggleDrawer(open) {
    this.exportOpen = open;
    this.render(); // render() → _syncDrawer() promotes/dismisses the native <dialog> in the top layer
    // showModal() moves focus INTO the dialog on open and the browser traps Tab there; on close
    // we return focus to the opener. Guarded to a no-op in the headless DOM (no real focus).
    if (!open) {
      const opener = this.querySelector(".export-open-btn");
      if (opener && opener.focus) opener.focus();
    }
  }


  // renderDrawer — computes the shared inputs (format groups, per-system code, the selected format's
  // rendered output) once, then wires them into per-region sub-renders (TKT-0023: was one 220-line
  // method; each _drawer* sub-render below is independently readable and under ~150 lines).
  renderDrawer(view) {
    // Export formats grouped by SYSTEM — the three brand-kit systems (Colors · Typography · Geometry) each
    // get their own group, then Project. Within Colors the order runs CSS → frameworks → design tools. The
    // item names disambiguate where a format spans systems (Type · DTCG vs the colour DTCG). Internal ids
    // (css/oklch/tailwind/…) are unchanged — only the display grouping + labels.
    const FORMAT_GROUPS = [
      ["Colors", [["css", "Hex"], ["oklch", "OKLCH"], ["tailwind", "Tailwind v4"], ["shadcn", "shadcn/ui"], ["figma", "Figma"], ["ui3", "Figma UI3"], ["dtcg", "DTCG"], ["json", "JSON"]]],
      ["Typography", [["type-css", "Type · CSS"], ["type-dtcg", "Type · DTCG"]]],
      ["Geometry", [["geom-css", "Geometry · CSS"], ["geom-dtcg", "Geometry · DTCG"]]],
      ["Design System", [["ds-tokens", "tokens.json"], ["ds-spine", "DESIGN.md"]]],
      ["Project", [["config", "Config"]]],
    ];
    // the per-system token output for the Typography / Geometry format tabs (the colour formats live on
    // view.exports). Computed from the same engines the modals + the Brand-Kit MCP use.
    const typeSc = this._typeScaleFor("base"); // override-aware base scale (Phase 3) — same as the matrix Base column
    const geomSc = this._geomScaleFor("base");
    const u = { unit: this._exportUnit() }; // the CSS unit preference (Settings › Export); Figma stays px
    const ut = { ...u, prefix: this._typePrefix() }; // + the naming-scheme prefix for the type CSS
    const ug = { ...u, prefix: this._geomPrefix() }; // + the naming-scheme prefix for the geometry CSS
    // splitCssPreview — a single-pane, read-only preview of the SEPARATE files Download-All actually
    // zips (base + one file per breakpoint), each fenced with its real filename so "one tab" still shows
    // the true multi-file shape: add just the base file, or additionally the breakpoint file(s) below it.
    const splitCssPreview = (baseCss, files, baseFilename) => {
      const parts = [`/* ${baseFilename} — the only file most sites need */\n${baseCss}`];
      for (const f of files) parts.push(`/* ${baseFilename.replace(/\.css$/, "")}-${slug(f.name)}.css — optional, add for the ${f.name} breakpoint */\n${f.css}`);
      return parts.join("\n");
    };
    const SYSTEM_CODE = {
      "type-css": () => splitCssPreview(typeTokensCSS(typeSc, ut), typeTokensBreakpointCSS(this._typeModeScales(), ut), "type.css"),
      "type-dtcg": () => JSON.stringify(typeTokensDTCG(typeSc, u), null, 2),
      "geom-css": () => splitCssPreview(geomTokensCSS(geomSc, ug), geomTokensBreakpointCSS(this._geomModeScales(), ug), "geometry.css"),
      "geom-dtcg": () => JSON.stringify(geomTokensDTCG(geomSc, u), null, 2),
      // the Design System export — the universal-dialect DESIGN.md core + tokens.json (the LLM generation
      // system); the component previews ride the Download-All bundle only (a folder, not a single preview).
      "ds-tokens": () => exportDesignSystemTokens(this.doc, typeSc, geomSc),
      "ds-spine": () => exportDesignSystemSpine(this.doc, typeSc, geomSc),
    };
    const SYSTEM_LABEL = { "type-css": "Typography · CSS", "type-dtcg": "Typography · DTCG", "geom-css": "Geometry · CSS", "geom-dtcg": "Geometry · DTCG", "ds-tokens": "Design System · tokens.json", "ds-spine": "Design System · DESIGN.md" };
    // the systems currently opted into the Download-All + MCP bundle (for the footer summary).
    const SYS_LABEL = { color: "Color", type: "Typography", geometry: "Geometry" };
    const included = ["color", "type", "geometry"].filter((k) => this.exportSystems[k] !== false).map((k) => SYS_LABEL[k]).join(" · ");
    // The three Figma mode files: [stateKey, label, real filename to import as].
    const FIGMA = [
      ["light", "Light", "Light_tokens.json"],
      ["dark", "Dark", "Dark_tokens.json"],
      ["raw", "Raw values", "palette.tokens.json"],
    ];
    const isFigma = this.exportTab === "figma";
    const isConfig = this.exportTab === "config";
    const figCur = FIGMA.find((f) => f[0] === this.figmaFile) || FIGMA[0];
    // proExport gate: a Pro format the plan doesn't unlock shows an upsell instead of its code (NO-OP until
    // go-live). PRO_LABEL names the upsell; the format <select> tags the option " · Pro".
    const proLocked = this._proExportLocked(this.exportTab);
    const PRO_LABEL = { dtcg: "DTCG", tailwind: "Tailwind v4", shadcn: "shadcn/ui" };
    const code = proLocked
      ? ""
      : isConfig
        ? JSON.stringify(serialize(this.doc), null, 2) // the parametric doc — re-importable via the gallery's ⬆ Import
        : isFigma
          ? view.exports.figma[this.figmaFile]
          : SYSTEM_CODE[this.exportTab]
            ? SYSTEM_CODE[this.exportTab]()
            : view.exports[this.exportTab];
    const bytes = new Blob([code]).size;

    // A native <dialog>: showModal() (see _syncDrawer) promotes it to the browser TOP LAYER —
    // above every stacking context with no z-index race — and gives ::backdrop, focus trapping,
    // background inert, and Esc for free. open/close is driven by exportOpen via _syncDrawer.
    return h(
      "dialog",
      {
        class: "drawer",
        "aria-label": "Export",
        // a click that lands on the dialog box itself (i.e. the ::backdrop) closes it; clicks on
        // the content hit child nodes, so they don't.
        onclick: (e) => { if (e.target === e.currentTarget) this.toggleDrawer(false); },
        // Esc → native 'cancel'. Keep exportOpen the single source of truth: cancel the default
        // close and route through toggleDrawer so the state + the dialog stay in lockstep.
        oncancel: (e) => { e.preventDefault(); this.toggleDrawer(false); },
      },
      this._drawerHead(),
      this._drawerSystemsRow(),
      this._drawerFormatSelect(FORMAT_GROUPS),
      isFigma ? this._drawerFigmaBar(FIGMA) : false,
      isConfig ? this._drawerConfigBar() : false,
      this._drawerCodeBlock(code, proLocked, PRO_LABEL),
      this._drawerFooter(view, { included, isFigma, isConfig, figCur, proLocked, PRO_LABEL, SYSTEM_LABEL, bytes }),
    );
  }

  _drawerHead() {
    return h(
      "div",
      { class: "drawer-head" },
      h("h3", {}, icon("export"), "Export"),
      h("div", { class: "spacer" }),
      btn(icon("x"), { ariaLabel: "Close export drawer", onclick: () => this.toggleDrawer(false) }),
    );
  }

  // Systems opt-in: which token systems the Download-All .zip + the Brand-Kit MCP bundle. Color
  // gates every colour format + the palettes/roles; Type/Geometry add their CSS + DTCG. The
  // single-format preview below is unaffected (pick any format to inspect/copy it directly).
  _drawerSystemsRow() {
    return h(
      "div",
      { class: "drawer-systems" },
      h("span", { class: "drawer-systems-label" }, "Include"),
      ...[["color", "Color"], ["type", "Typography"], ["geometry", "Geometry"], ["styles", "Styles"]].map(([k, label]) =>
        chip(label, {
          mode: "interactive",
          on: this.exportSystems[k] !== false,
          cls: "sys-chip",
          title: k === "styles"
            ? "Create Figma STYLE swatches (paint + text styles) bound to the variables on Apply — one per semantic role and type step"
            : `Include the ${label} system in Download-All & the Brand-Kit MCP`,
          onclick: () => this.toggleExportSystem(k),
        }),
      ),
      h("span", { class: "drawer-systems-note" }, "in Download-All & MCP"),
    );
  }

  _drawerFormatSelect(FORMAT_GROUPS) {
    return h(
      "div",
      { class: "drawer-format" },
      h("label", { for: "export-format" }, "Format"),
      h(
        "select",
        {
          id: "export-format",
          "aria-label": "Export format",
          onchange: (e) => {
            this.exportTab = e.target.value;
            this.render();
          },
        },
        ...FORMAT_GROUPS.map(([label, items]) =>
          h(
            "optgroup",
            { label },
            ...items.map(([id, lab]) =>
              h("option", id === this.exportTab ? { value: id, selected: "selected" } : { value: id }, this._proExportLocked(id) ? lab + " · Pro" : lab),
            ),
          ),
        ),
      ),
    );
  }

  // Figma sub-bar: the import note on its own row, then [mode-file segmented | Binder plugin].
  _drawerFigmaBar(FIGMA) {
    return h(
      "div",
      { class: "figma-bar" },
      h("span", { class: "figma-note" }, "One file per Figma variable-mode — import Light & Dark into the two modes of one collection, then run the Binder plugin for the live raw→semantic cascade."),
      h(
        "div",
        { class: "figma-bar-row" },
        this.segmented(
          FIGMA.map(([id, label]) => ({ id, label })),
          this.figmaFile,
          (id) => {
            this.figmaFile = id;
            this.render();
          },
          { baseClass: "figma-files", ariaLabel: "Figma mode file", role: "group", idPrefix: "ffile" },
        ),
        btn([icon("download"), "Binder plugin"], {
          cls: "figma-plugin-btn",
          title: "Download the Color Tokens Semantic Binder plugin (manifest.json + code.js). In Figma: Plugins → Development → Import plugin from manifest — it aliases each semantic role to its raw variable so editing a raw color cascades.",
          onclick: () => this.downloadFigmaPlugin(),
        }),
        // Opt-in (inside Figma only): re-create Color Semantic so it adopts the grouped order
        // (Figma won't reorder existing variables on a normal apply). Lives here, beside the
        // Binder plugin, because it's a Figma-tab action — re-creates vars, so bound layers
        // need reconnecting.
        this.inFigma
          ? btn([icon("arrows-clockwise"), "Regroup"], {
              cls: "figma-regroup",
              title: this._applyBusy ? "Applying…" : "Rebuild the Color Semantic variables in grouped order (regular · containers · surfaces · scrims). Re-creates them, so layers bound to them will need reconnecting. Color Primitives are untouched.",
              disabled: !!this._applyBusy, // TKT-0004: no double-firing a second apply while one is in flight
              onclick: () => this.requestApplyToFigma(true),
            })
          : false,
      ),
    );
  }

  // Config sub-bar: the project source-of-truth actions live ABOVE the code, not in the footer.
  _drawerConfigBar() {
    return h(
      "div",
      { class: "config-bar" },
      btn([icon("upload"), "Save to project"], { title: this.inFigma ? "Save this config into this Figma file (travels with the file)" : "Save this config to the project (localStorage)", onclick: () => this.saveToProject() }),
      btn([icon("download"), "Load from project"], { title: this.inFigma ? "Load the config saved in this Figma file" : "Load the config saved to the project", onclick: () => this.loadFromProject() }),
      btn([icon("download"), "Brand-Kit MCP"], { title: "Download a ready-to-run MCP server (your tokens, for Claude Code / Cursor / any agent) — a .zip with the zero-dep server + your brand-kit.json + setup README", onclick: () => this.downloadBrandKitMcp() }),
      btn([icon("download"), this.flagOf("describePalette") ? "Describe-Palette MCP" : "Describe-Palette MCP · Pro"], {
        title: this.flagOf("describePalette")
          ? "Download the Brand-Kit MCP's Pro sibling: a .zip that ALSO generates new brand kits from a text description — everything Brand-Kit MCP does, plus generate_kit + export_tokens"
          : "Generate new brand kits from a text description via MCP — a Pro feature. Upgrade to download it.",
        onclick: () => this.downloadDescribePaletteMcp(),
      }),
      h("span", { class: "config-note" }, this.inFigma ? "Source of truth: this Figma file (travels with the file)" : "Source of truth: your browser (localStorage)"),
    );
  }

  // The code block carries its OWN floating copy affordance (top-right), so the footer stays a
  // single download action instead of a row of competing buttons.
  _drawerCodeBlock(code, proLocked, PRO_LABEL) {
    return h(
      "div",
      // the output for the format chosen in the drawer-format <select> above.
      { class: "drawer-code", role: "region", "aria-label": "Export output" },
      ...(proLocked
        ? [this._proUpsell(`${PRO_LABEL[this.exportTab] || "This"} export is a Pro format — upgrade to export it.`)]
        : [
            btn([icon("copy"), "Copy"], { variant: "bare", cls: "copy-float", title: "Copy to clipboard", ariaLabel: "Copy", onclick: () => this.copy(code) }),
            h("pre", { class: "drawer-pre" }, code),
          ]),
    );
  }

  _drawerFooter(view, { included, isFigma, isConfig, figCur, proLocked, PRO_LABEL, SYSTEM_LABEL, bytes }) {
    return h(
      "div",
      { class: "drawer-foot" },
      h("span", { class: "meta" }, proLocked ? `${PRO_LABEL[this.exportTab] || "Pro"} · Pro format · Download-All: ${included}` : `${(bytes / 1024).toFixed(1)} KB · ${isFigma ? figCur[2] : isConfig ? "re-importable config" : SYSTEM_LABEL[this.exportTab] || tokenCount(this.doc) + " tokens"} · Download-All: ${included}`),
      // Footer actions kept in ONE group so they never split across rows: the foot is
      // flex-wrap and .meta has flex:1, so as separate children Download all wrapped below
      // Apply. As a single .foot-actions child they stay together (Apply left, Download right).
      h(
        "div",
        { class: "foot-actions" },
        // Inside Figma, applying variables directly is the point — primary action, on the LEFT.
        this.inFigma
          ? btn([icon("flag"), "Apply Variables"], {
              variant: "primary",
              cls: "figma-apply",
              title: this._applyBusy ? "Applying…" : "Create/update the Color Primitives + Color Semantic (Light/Dark) variable collections directly in this Figma file",
              disabled: !!this._applyBusy, // TKT-0004: no double-firing a second apply while one is in flight
              onclick: () => this.requestApplyToFigma(),
            })
          : false,
        // (Regroup moved to the Figma tab's sub-bar, beside the Binder plugin button.)
        // ONE download action — every format in its own folder + the config, as a single .zip.
        btn([icon("download"), "Download All"], { variant: "primary", title: `Download the selected systems (${included}) — each format in its own folder + the re-importable config, as one .zip`, onclick: () => this.downloadAllZip(view) }),
      ),
    );
  }


  // toggleExportSystem — flip one token system (color/type/geometry) in the Download-All + MCP opt-in.
  // Keeps at least one system selected (an all-off bundle is degenerate).
  toggleExportSystem(k) {
    const on = this.exportSystems[k] !== false;
    // `styles` is an overlay on the selected systems (the Figma swatches opt-out), not a token system —
    // the keep-one-system guard applies only to the three real systems.
    if (k !== "styles" && on && ["color", "type", "geometry"].filter((s) => this.exportSystems[s] !== false).length <= 1) {
      this.toast("Keep at least one system selected");
      return;
    }
    this.exportSystems = { ...this.exportSystems, [k]: !on };
    this.render();
  }


  // downloadAllZip — ONE archive with every SELECTED system's formats in its own folder + the
  // re-importable config at the root. Built with the dependency-free store-only ZIP writer (zip.mjs) so
  // it works offline / in the Figma sandbox. Colour folders (css-hex / css-oklch / json / dtcg / figma /
  // ui3 / tailwind / shadcn) ride `systems.color`; `typography/` + `geometry/` ride their toggles; the
  // figma/ folder also gets the type + dimension token files (importable as Figma variables/styles).
  downloadAllZip(view) {
    const s = slug(this.doc.name || "palette");
    const sys = this.exportSystems;
    const u = { unit: this._exportUnit() }; // the CSS unit preference; the figma/ folder stays px (Figma is numeric)
    const ex = view.exports;
    const files = [];
    if (sys.color) {
      files.push(
        // BOTH raw-colour CSS variants — hex and oklch are two co-equal formats (like tailwind + shadcn),
        // and this is the comprehensive bundle. The export drawer's Hex/OKLCH tabs pick one individually.
        { name: `css-hex/${s}.css`, data: ex.css },
        { name: `css-oklch/${s}.css`, data: ex.oklch },
        { name: `json/${s}.json`, data: ex.json },
        { name: "figma/Light_tokens.json", data: ex.figma.light },
        { name: "figma/Dark_tokens.json", data: ex.figma.dark },
        { name: "figma/palette.tokens.json", data: ex.figma.raw },
        { name: `ui3/${s}.json`, data: ex.ui3 },
      );
      // proExport-gated formats (DTCG + the framework configs) — omitted from the bundle until the plan
      // unlocks them (NO-OP while TIERS_ENFORCED is off; flagOf("proExport") is true).
      if (this.flagOf("proExport")) files.push(
        { name: `dtcg/${s}.tokens.json`, data: ex.dtcg },
        { name: `tailwind/${s}.css`, data: ex.tailwind },
        { name: `shadcn/${s}.css`, data: ex.shadcn },
      );
      // figma-aliased/ — the SAME tokens, but the Light/Dark leaves carry com.figma.aliasData targeting
      // the "Color Primitives" collection (figmaBundle). For TESTING plugin-free import / the live cascade
      // (OD-004, unverified end-to-end). The default figma/ files (resolved) always import; the plugin is
      // the reliable cascade. See figma-aliased/README.txt.
      const aliased = this.figmaBundle();
      files.push(
        { name: "figma-aliased/palette.tokens.json", data: JSON.stringify(aliased["palette.tokens.json"], null, 2) },
        { name: "figma-aliased/Light_tokens.json", data: JSON.stringify(aliased["Light_tokens.json"], null, 2) },
        { name: "figma-aliased/Dark_tokens.json", data: JSON.stringify(aliased["Dark_tokens.json"], null, 2) },
        { name: "figma-aliased/README.txt", data: ALIASED_README },
      );
      // design-system-for-claude-code/ — the LLM design-system bundle: DESIGN.md (the universal-dialect
      // core — Stitch-canonical sections + Responsive + Agent Prompt Guide) + tokens.json (hex colors/
      // colorsDark + the type/spacing/radii ladders) + components/*.html (self-contained @dsCard previews)
      // + README.md (the profile receipt). One shared colour source (dsColorRoles) keeps every carrier
      // value-equal by construction. Rides `systems.color`. A vision-capable Claude reads the folder to
      // generate on-brand screens; the measured-reduction on-colors hold WCAG AA in both schemes.
      const dsDate = new Date().toISOString().slice(0, 10);
      files.push(...exportDesignSystemBundle(this.doc, this._typeScaleFor("base"), this._geomScaleFor("base"), { date: dsDate })
        .map((f) => ({ name: `design-system-for-claude-code/${f.name}`, data: f.data })));
      // design-system-for-google-stitch/ — the SAME canonical DESIGN.md (Stitch consumes one file,
      // byte-identical to the Claude Code spine) + a Stitch-profile README receipt. One core, two uploads.
      files.push(...exportDesignSystemStitchBundle(this.doc, this._typeScaleFor("base"), this._geomScaleFor("base"), { date: dsDate })
        .map((f) => ({ name: `design-system-for-google-stitch/${f.name}`, data: f.data })));
      // design-system-for-figma-make/ — a routed guidelines/ tree Figma Make reads directly (no
      // linter/schema of its own — make_guidelines_check.py is the gate of record) + a profile README.
      files.push(...exportDesignSystemMakeBundle(this.doc, this._typeScaleFor("base"), this._geomScaleFor("base"), { date: dsDate })
        .map((f) => ({ name: `design-system-for-figma-make/${f.name}`, data: f.data })));
    }
    // the two halves of the merged breakpoint-moded "Geometry" collection (TKT-0009) — filled by the
    // type/geometry blocks below, merged + pushed as ONE figma/tokens.modes.variables.json after both.
    const modesHalves = [];
    if (sys.type) {
      const tsc = this._typeScaleFor("base"); // override-aware base scale (Phase 3)
      const tDtcg = JSON.stringify(typeTokensDTCG(tsc, u), null, 2); // the chosen unit — for the typography/ folder
      const tCssOpts = { ...u, prefix: this._typePrefix() };
      files.push(
        // SEPARATE files, not one @media-embedded stylesheet: type.css alone is a complete, valid,
        // Desktop-anchored stylesheet (drop it in and you're done); type-tablet.css / type-mobile.css are
        // optional, self-contained bolt-ons (each internally bounded — add any subset, any load order).
        { name: "typography/type.css", data: typeTokensCSS(tsc, tCssOpts) },
        ...typeTokensBreakpointCSS(this._typeModeScales(), tCssOpts).map((f) => ({ name: `typography/type-${slug(f.name)}.css`, data: f.css })),
        { name: "typography/type.tokens.json", data: tDtcg },
        ...this._typeModeDTCGFiles("typography/type", u),
        { name: "figma/type.tokens.json", data: JSON.stringify(typeTokensDTCG(tsc), null, 2) }, // ALWAYS px — Figma import (a tokens plugin)
        // the companion "Font Primitives" collection — deduped family STRING primitives + per-voice
        // font aliases + per-voice weight primitives (import artifact; never enters the apply path).
        { name: "figma/typography.primitives.variables.json", data: JSON.stringify(typeTokensFigmaPrimitives(tsc), null, 2) },
      );
      // the type HALF of the merged breakpoint-moded collection (pushed after the geometry block below).
      modesHalves.push(typeTokensFigmaModes(tsc, this._typeModeScales(), this._typeBaseOpts()));
    }
    if (sys.geometry) {
      const gsc = this._geomScaleFor("base"); // composed with the type scale (the per-step `font` is shared); override-aware (Phase 3)
      const gDtcg = JSON.stringify(geomTokensDTCG(gsc, u), null, 2); // the chosen unit — for the geometry/ folder
      const gCssOpts = { ...u, prefix: this._geomPrefix() };
      files.push(
        // SEPARATE files (mirrors typography/ above): geometry.css alone is a complete, Desktop-anchored
        // stylesheet; geometry-tablet.css / geometry-mobile.css are optional bolt-ons.
        { name: "geometry/geometry.css", data: geomTokensCSS(gsc, gCssOpts) },
        ...geomTokensBreakpointCSS(this._geomModeScales(), gCssOpts).map((f) => ({ name: `geometry/geometry-${slug(f.name)}.css`, data: f.css })),
        { name: "geometry/geometry.tokens.json", data: gDtcg },
        ...this._geomModeDTCGFiles("geometry/geometry", u),
        { name: "figma/dimension.variables.json", data: JSON.stringify(geomTokensFigma(gsc), null, 2) }, // a "Geometry" collection of Figma NUMBER (FLOAT) variables
      );
      modesHalves.push(geomTokensFigmaModes(gsc, this._geomModeScales(), this._geomBaseOpts()));
    }
    // ONE breakpoint-moded Figma-variable file — the merged "Geometry" collection (type/ + box-geometry
    // halves, TKT-0009) with a MODE per breakpoint (Base + each), instead of the pre-merge
    // typography.modes/dimension.modes pair: the plugin executor prunes variables per collection, so the
    // halves must land as one interchange. Emitted whenever either system is on (Base-only, no breakpoints ok).
    {
      const modesIx = mergeModeInterchanges(...modesHalves);
      if (modesIx) files.push({ name: "figma/tokens.modes.variables.json", data: JSON.stringify(modesIx, null, 2) });
    }
    // figma/styles.plan.json — the plugin-free STYLES import artifact (rides the Styles opt-out chip,
    // compositional with the system toggles like the apply path): the same pure plans the in-Figma
    // apply executes, so external tooling (or a later plugin-free import) can create the bound
    // swatches without re-deriving anything. paints → Color Semantic bindings; texts → Breakpoints (type/)/Font
    // Primitives bindings + literal fallbacks; fontPrimitives → the ordered ensure-plan.
    if (sys.styles !== false && (sys.color || sys.type)) {
      const stScale = sys.type ? this._typeScaleFor("base") : null;
      let stFamilies = [];
      if (sys.color) {
        const tree = this.figmaBundle()["Light_tokens.json"];
        const enabled = (this.doc.palettes || []).filter((p) => p && p.on !== false);
        stFamilies = Object.keys(tree).filter((k) => k[0] !== "$").map((n, i) => ({ n, name: (enabled[i] && enabled[i].name) || n }));
      }
      const stPlans = stylePlans({ families: stFamilies, scale: stScale, include: { color: !!sys.color, type: !!sys.type } });
      if (stPlans.paints.length || stPlans.texts.length) {
        const artifact = { $schema: "ultimate-tokens-figma-styles.plan.v1", ...stPlans, ...(stPlans.texts.length && stScale ? { fontPrimitives: primitivesApplyPlan(typeTokensFigmaPrimitives(stScale)) } : {}) };
        files.push({ name: "figma/styles.plan.json", data: JSON.stringify(artifact, null, 2) });
      }
    }
    // the re-importable parametric config — ALWAYS (it carries the colour + type + geometry params).
    files.push({ name: `ultimate-tokens-${s}-config.json`, data: JSON.stringify(serialize(this.doc), null, 2) });
    // the root README — the zip is self-describing: what each included folder is, plus the two
    // companion channels this archive does NOT carry (the consumption plugin + the Brand-Kit MCP).
    files.push({ name: "README.md", data: this._zipReadme(s, sys) });
    const bytes = zipStore(files);
    this.downloadBytes(bytes, `ultimate-tokens-${s}.zip`, "application/zip");
  }


  // _zipReadme — the Download-All root README. Reflects the ACTUAL toggles (a folder absent from the
  // zip is absent from the map) and points at the consumption plugin — the skills/agent layer is
  // deliberately NOT bundled (it updates centrally via the marketplace; a copy here would go stale).
  _zipReadme(s, sys) {
    const name = this.doc.name || "Brand kit";
    const rows = [];
    if (sys.color) {
      rows.push(
        "| `css-hex/` · `css-oklch/` | The palette + 53 semantic roles per palette, plus fixed system constants (e.g. `--dialog-backdrop`), as CSS custom properties (two co-equal color formats) |",
        "| `json/` | The raw palette data as JSON |",
      );
      // the Pro-gated folders appear in the map only when they are actually IN the archive.
      if (this.flagOf("proExport")) rows.push(
        "| `dtcg/` | W3C-DTCG design tokens |",
        "| `tailwind/` · `shadcn/` | Framework presets |",
      );
      const collNames = figmaCollectionNames(this.doc);
      const customColl = collNames.raw !== COLLECTIONS.colorRaw || collNames.semantic !== COLLECTIONS.colorSemantic;
      rows.push(
        "| `figma/` | Importable Figma variable files (Light/Dark semantic + primitives" + (sys.type !== false || sys.geometry !== false ? " + the breakpoint-moded Typography/Geometry collections" : "") + ") |",
        "| `figma-aliased/` | The raw→semantic aliased variant (plugin-free import path)" + (customColl ? ` — targets collections named \`${collNames.raw}\` / \`${collNames.semantic}\` (renamed in Settings › Token mapping)` : "") + " |",
        "| `design-system-for-claude-code/` | The full agent-facing design system: `DESIGN.md` + `tokens.json` + self-contained component previews |",
        "| `design-system-for-google-stitch/` | The single-file `DESIGN.md` upload for Google Stitch |",
        "| `design-system-for-figma-make/` | The routed `guidelines/` tree for Figma Make (paste-ready `styles.css`) |",
      );
    }
    if (sys.type) rows.push("| `typography/` | The eleven-voice type scale — `type.css` (Desktop, complete on its own) + optional `type-tablet.css` / `type-mobile.css` bolt-ons + DTCG, incl. per-breakpoint files |");
    if (sys.geometry) rows.push("| `geometry/` | The dimensional system — control ramp, radii, spacing, container tier — `geometry.css` (Desktop) + optional `geometry-tablet.css` / `geometry-mobile.css` + DTCG |");
    rows.push(`| \`ultimate-tokens-${s}-config.json\` | The re-importable parametric config — open it in Ultimate Tokens to edit this kit |`);
    return [
      `# ${name} — Ultimate Tokens export`, "",
      `Design tokens generated by [Ultimate Tokens](${REPO_URL}).`,
      "Every value derives from a small parametric config (bottom of this table) — edit the config, not the outputs.", "",
      "| Folder / file | What it is |", "|---|---|", ...rows, "",
      "## Consuming this kit with a coding agent", "",
      "The **Ultimate Tokens Claude plugin** (free, MIT) teaches a coding agent to bind these tokens",
      "correctly — the right semantic role per surface, the right voice/step per text, the right size per",
      "control — instead of guessing values. It is deliberately not bundled here (it updates centrally):", "",
      "```", "/plugin marketplace add https://unpkg.com/@ultimate-tokens/claude/marketplace.json", "/plugin install ultimate-tokens", "```", "",
      "For AI agents that speak MCP, the app's **Download Brand-Kit MCP** produces a zero-dependency",
      "offline server wrapping this same kit (palettes · roles · type · geometry) as queryable tools.", "",
      "## Notes", "",
      "- Colors are high-resolution OKLCH at the source; hex files are derived for consumption.",
      "- The CSS is Desktop-anchored and split into separate files, matching the Figma collections (Desktop as the default mode): add just `type.css`/`geometry.css` for a non-responsive site, or additionally drop in `-tablet`/`-mobile` — each is a self-contained, bounded `@media` override, so any subset in any load order resolves correctly. Body-class type is frozen across breakpoints while display-class compresses — that asymmetry is the system.",
      "- Include the text-rendering baseline from the design-system `DESIGN.md` Typography section in your global CSS — it is part of the system.",
    ].join("\n") + "\n";
  }
}
export const DrawerMixin = DrawerMixinImpl;
