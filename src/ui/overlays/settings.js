import { figmaCollectionNames } from "../model.mjs";
import { ICON_SYSTEMS, iconSystem, iconSystemById, iconSystemLabel } from "../../engine/icon-systems.mjs";
import { icon } from "../icons.js";
import { ACCOUNT_URL, DEV_FLAG_TOGGLES, DOCS_URL, PRO_CHECKOUT_URL, STUDIO_CHECKOUT_URL, SUPPORT_URL, btn, field, h, setColorScheme } from "../app-helpers.mjs";

// Prototype mixin (TKT-0023): a class body used ONLY as a verbatim, comma-free carrier for these
// methods — copied onto HctApp.prototype (see app.js's mixin() call), never instantiated directly.
export class SettingsMixinImpl {

  // ── Settings modal (token mapping + preferences) ──────────────────────────────────────
  openSettings() { this.settingsOpen = true; this.render(); }

  closeSettings() { this.settingsOpen = false; this.render(); }

  _syncSettings() {
    const d = this.querySelector(".settings");
    if (!d || typeof d.showModal !== "function") return;
    if (this.settingsOpen && !d.open) { try { d.showModal(); } catch { /* not attached */ } }
    else if (!this.settingsOpen && d.open) { try { d.close(); } catch { /* already closed */ } }
  }


  // a labeled setting row: a title + description on the left, a segmented control on the right.
  _settingRow(title, desc, items, value, onSelect, idPrefix) {
    return h(
      "div",
      { class: "settings-row" },
      h("div", { class: "settings-row-text" }, h("b", {}, title), h("small", {}, desc)),
      this.segmented(items, value, onSelect, { ariaLabel: title, role: "group", cls: "settings-seg", idPrefix }),
    );
  }

  // a titled group of setting rows (a sub-section of a Settings page).
  _settingsGroup(title, rows) {
    return h("div", { class: "settings-group" }, title ? h("div", { class: "settings-group-title" }, title) : false, ...rows.filter(Boolean));
  }

  // _openCheckout(url) — open a Lemon Squeezy hosted-checkout deep-link in a new tab (web only; the outward
  // link keeps this file network-free). noopener/noreferrer; a blocked popup fails silently.
  _openCheckout(url) { try { window.open(url, "_blank", "noopener,noreferrer"); } catch (e) { /* popup blocked */ } }


  // The Settings nav model: grouped, labeled sections (the left rail). Each item id → a panel.
  _settingsNav() {
    return [
      { group: "Tokens", items: [{ id: "mapping", label: "Mapping" }, { id: "icons", label: "Icons" }, { id: "export", label: "Export" }] },
      { group: "App", items: [{ id: "appearance", label: "Appearance" }] },
      // Figma-only: a real Figma file, not this generator's own state, is what a sweep inspects.
      ...(this.inFigma ? [{ group: "Figma", items: [{ id: "cleanup", label: "Cleanup" }] }] : []),
      { group: "Account", items: [{ id: "account", label: "Account" }] },
      { group: "About", items: [{ id: "about", label: "About" }] },
    ];
  }

  // _iconSystem() — the RESOLVED icon system for this kit ({id,name,variant,license,url,note}). Absent
  // doc.icons ⇒ the default (Phosphor · regular). The icon system is a brand facet like a font family;
  // icon SIZES come from the geometry ramp (sizes.<size>.icon), never from here.
  _iconSystem() { return iconSystem(this.doc.icons || {}); }

  // _setIconSystem(id) — pick a library; seeds its default variant. Custom keeps/needs a typed name.
  _setIconSystem(id) {
    const sys = iconSystemById(id);
    if (!sys) return;
    this.commit((d) => {
      if (sys.id === "custom") { d.icons = { id: "custom", name: (d.icons && d.icons.name) || "" }; return; }
      d.icons = { id: sys.id, ...(sys.defaultVariant ? { variant: sys.defaultVariant } : {}) };
    });
  }

  // _setIconVariant(v) — the library's own style name (thin/bold/fill…, outlined/rounded/sharp…).
  _setIconVariant(v) { this.commit((d) => { d.icons = { ...(d.icons || {}), variant: v }; }); }

  // _setIconCustom(field, value) — the Custom escape hatch: any set name + an optional variant string.
  _setIconCustom(field, value) {
    const v = String(value || "").trim().slice(0, field === "name" ? 60 : 40);
    this.commit((d) => { d.icons = { ...(d.icons || {}), id: "custom", [field]: v }; });
  }


  // _exportUnit — the CSS unit for the type/geometry exports (Settings › Export). Doc-bound + persisted so it
  // travels with the kit; defaults to "px" (the pre-setting output). Figma exports ignore it (they're numeric).
  _exportUnit() { return this.doc.export && ["px", "rem", "em"].includes(this.doc.export.unit) ? this.doc.export.unit : "px"; }

  _setExportUnit(unit) { this.commit((d) => { d.export = { ...(d.export || {}), unit }; }); }


  // _colorPrefix — the CSS custom-property prefix core for the colour export (the `c` in `--c-*`).
  // Default "c" (the historical Ultimate naming); a user may set "md-sys-color" (Material-flavoured)
  // or any custom namespace, extended with our roles. Sanitized so the preview matches the export.
  _colorPrefix() {
    const raw = this.doc.export && typeof this.doc.export.colorPrefix === "string" ? this.doc.export.colorPrefix : "";
    const clean = raw.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/^(\d)/, "c$1");
    return clean || "c";
  }

  // _typePrefix / _geomPrefix — the naming-scheme prefixes for the type + geometry CSS exports.
  // Type default "type" (--type-*); geometry default "" (native --size-/--radius-/…). A Material scheme
  // sets them to "md-sys-typescale" and "md-sys" so the whole system exports under one root.
  _typePrefix() { const p = this.doc.export && typeof this.doc.export.typePrefix === "string" ? this.doc.export.typePrefix.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/^(\d)/, "t$1") : ""; return p || "type"; }

  _geomPrefix() { const p = this.doc.export && typeof this.doc.export.geomPrefix === "string" ? this.doc.export.geomPrefix.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/^(\d)/, "g$1") : ""; return p; }


  // _namingScheme — the coherent naming convention across all three systems (colour · type · geometry).
  // "ultimate" = the native names (--c-* · --type-* · --size-*); "material" = one --md-sys-* root
  // (--md-sys-color-* · --md-sys-typescale-* · --md-sys-*); "custom" = a --{brand}-* root the user types.
  _namingScheme() {
    const cp = this._colorPrefix();
    if (cp === "c" && this._typePrefix() === "type" && !this._geomPrefix()) return "ultimate";
    if (cp === "md-sys-color" && this._typePrefix() === "md-sys-typescale" && this._geomPrefix() === "md-sys") return "material";
    return "custom";
  }

  // set all three prefixes coherently. id "ultimate"|"material" use the presets; else a custom root brand.
  _setNamingScheme(idOrBrand) {
    let color, type, geom;
    if (idOrBrand === "ultimate") { color = ""; type = ""; geom = ""; } // "" ⇒ defaults drop (identity)
    else if (idOrBrand === "material") { color = "md-sys-color"; type = "md-sys-typescale"; geom = "md-sys"; }
    else {
      const brand = String(idOrBrand || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/^(\d)/, "b$1").slice(0, 24);
      if (!brand) { color = ""; type = ""; geom = ""; } else { color = `${brand}-color`; type = `${brand}-type`; geom = brand; }
    }
    this.commit((d) => {
      const ex = { ...(d.export || {}) };
      if (!color || color === "c") delete ex.colorPrefix; else ex.colorPrefix = color;
      if (!type || type === "type") delete ex.typePrefix; else ex.typePrefix = type;
      if (!geom) delete ex.geomPrefix; else ex.geomPrefix = geom;
      if (Object.keys(ex).length) d.export = ex; else delete d.export;
    });
  }

  // the current custom brand root (strip the -color/-type suffixes back to the brand stem), for the field.
  _customBrand() { const c = this._colorPrefix(); return c.endsWith("-color") ? c.slice(0, -6) : c === "c" ? "" : c; }


  // _settingsPanel — the right-content for a nav section: { title, desc, body[] }.
  // _settingsPanel — dispatches to one per-section builder (each { title, desc, body[] }). Decomposed
  // (TKT-0023) so no single method holds every nav section's markup; each sub-builder stays independently
  // readable and under ~150 lines.
  _settingsPanel(sec) {
    if (sec === "appearance") return this._settingsPanelAppearance();
    if (sec === "icons") return this._settingsPanelIcons();
    if (sec === "export") return this._settingsPanelExport();
    if (sec === "cleanup") return this._cleanupPanel();
    if (sec === "account") return this._accountPanel();
    if (sec === "about") return this._settingsPanelAbout();
    return this._settingsPanelMapping(); // mapping (default)
  }

  _settingsPanelAppearance() {
    const schemes = [{ id: "system", label: "System" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }];
    return {
      title: "Appearance", desc: "How the editor chrome and the canvas preview render. These preferences are remembered on this device.",
      body: [this._settingsGroup(null, [
        this._settingRow("App theme", "The editor chrome. System follows your OS.", schemes, this.theme,
          (id) => { this.theme = id; this.dataset.theme = id; setColorScheme(id); this._saveAppPrefs(); this.render(); }, "setapptheme"),
        this._settingRow("Canvas preview", "The scheme the canvas previews in — independent of the chrome.", schemes, this.canvasTheme,
          (id) => { this.canvasTheme = id; this._saveAppPrefs(); this.render(); }, "setcanvastheme"),
        this._settingRow("Motion", "Editor animations and transitions. System respects your OS reduce-motion setting; Reduced keeps them minimal always.",
          [{ id: "system", label: "System" }, { id: "reduced", label: "Reduced" }], this.motion,
          (id) => { this.motion = id; this._saveAppPrefs(); this.render(); }, "setmotion"),
        h("div", { class: "settings-row" },
          h("div", { class: "settings-row-text" }, h("b", {}, "Reset app preferences"),
            h("small", {}, "Theme, canvas preview, and motion return to System; the saved record is cleared. Documents are untouched.")),
          btn("Reset to defaults", { cls: "settings-reset", ariaLabel: "Reset app preferences to defaults", onclick: () => this._resetAppPrefs() })),
      ])],
    };
  }

  _settingsPanelIcons() {
    const d = this.doc;
    const cur = this._iconSystem();
    const sel = (d.icons && d.icons.id) || cur.id;
    const sys = iconSystemById(sel);
    const isCustom = sel === "custom";
    // the GRID — one tile per library; the tile carries the name, its licence/shape note, and the
    // selected state. We can't render another library's glyphs offline (the app inlines Phosphor only),
    // so a tile states its character in words rather than faking a preview.
    const grid = h(
      "div",
      { class: "icon-grid", role: "radiogroup", "aria-label": "Icon system" },
      ...ICON_SYSTEMS.map((x) =>
        h(
          "button",
          { type: "button", class: "icon-tile" + (sel === x.id ? " on" : ""), role: "radio",
            "aria-checked": sel === x.id ? "true" : "false", "data-fk": "iconsys:" + x.id,
            title: x.url || "Name any icon set",
            onclick: () => this._setIconSystem(x.id) },
          h("b", {}, x.name),
          h("small", {}, x.note || ""),
          x.license ? h("small", { class: "icon-tile-lic" }, x.license) : false,
        ),
      ),
    );
    const rows = [grid];
    // variant control — only for libraries that HAVE style variants (Lucide/Feather/Bootstrap don't).
    if (!isCustom && sys && sys.variants.length) {
      rows.push(this._settingRow(
        "Style", `${sys.name}'s own weight/fill names. This is the stroke character an agent binds to.`,
        sys.variants.map((v) => ({ id: v, label: v })), cur.variant, (v) => this._setIconVariant(v), "iconvariant"));
    }
    if (isCustom) {
      rows.push(h("div", { class: "settings-row" },
        h("div", { class: "settings-row-text" }, h("b", {}, "Set name"), h("small", {}, "Any icon library — it ships in the kit verbatim.")),
        h("input", { type: "text", class: "icon-custom-name", value: (d.icons && d.icons.name) || "", placeholder: "e.g. Streamline",
          "data-fk": "iconcustom:name", "aria-label": "Custom icon set name", onchange: (e) => this._setIconCustom("name", e.target.value) })));
      rows.push(h("div", { class: "settings-row" },
        h("div", { class: "settings-row-text" }, h("b", {}, "Style"), h("small", {}, "Optional — the set's own weight/fill name.")),
        h("input", { type: "text", class: "icon-custom-variant", value: (d.icons && d.icons.variantName) || "", placeholder: "e.g. Core",
          "data-fk": "iconcustom:variant", "aria-label": "Custom icon style name", onchange: (e) => this._setIconCustom("variantName", e.target.value) })));
    }
    return {
      title: "Icons", desc: "The icon system this kit binds to. Sizes come from the Geometry ramp — this names the library and its stroke character.",
      body: [
        this._settingsGroup(null, rows),
        h("p", { class: "settings-note" }, `This kit specifies ${iconSystemLabel(cur)}. It ships in the design-system exports (DESIGN.md · tokens.json) and the Brand-Kit MCP, so a consuming agent binds to it instead of picking its own. Icon sizes stay geometry's job (the control ramp's icon step).`),
      ],
    };
  }

  _settingsPanelExport() {
    const units = [{ id: "px", label: "px" }, { id: "rem", label: "rem" }, { id: "em", label: "em" }];
    const schemePresets = [{ id: "ultimate", label: "Ultimate" }, { id: "material", label: "Material" }, { id: "custom", label: "Custom" }];
    const scheme = this._namingScheme();
    const brand = this._customBrand();
    // the resolved example var names under the current scheme (colour · type · geometry).
    const exColor = `--${this._colorPrefix()}-primary-on-surface`;
    const exType = `--${this._typePrefix()}-body-md-size`;
    const exGeom = `--${this._geomPrefix() ? this._geomPrefix() + "-radius" : "radius"}-md`;
    return {
      title: "Export", desc: "How the CSS + DTCG exports render. Figma variables are always numeric (px).",
      body: [this._settingsGroup(null, [
        this._settingRow("CSS units", "The unit the Typography + Geometry CSS/DTCG use. rem = px ÷ 16 (clean, thanks to the nice-number sizes). Figma stays px.", units, this._exportUnit(),
          (id) => this._setExportUnit(id), "setexportunit"),
        // Naming convention — one coherent scheme across colour · type · geometry. Ultimate = native
        // names; Material = the --md-sys-* root; Custom = a --{brand}-* root. The app chrome is
        // unaffected (it dogfoods a fixed --c-* theme); only the CSS EXPORT names change.
        this._settingRow("Naming convention", "The naming of the CSS variables the export emits, across colour, type, and geometry. Material uses M3-style --md-sys-* naming, extended with our roles. The app's own UI is unaffected.", schemePresets, scheme,
          (id) => this._setNamingScheme(id === "custom" ? (brand || "brand") : id), "setnaming"),
        h("div", { class: "settings-row" },
          h("div", { class: "settings-row-text" }, h("b", {}, "Custom brand root"),
            h("small", {}, ["e.g. ", h("code", {}, exColor), " · ", h("code", {}, exType), " · ", h("code", {}, exGeom)])),
          h("input", { class: "settings-input", type: "text", value: scheme === "custom" ? brand : "", placeholder: "brand", "aria-label": "Custom naming brand root",
            onchange: (e) => this._setNamingScheme(e.target.value || "ultimate") })),
      ])],
    };
  }

  _settingsPanelAbout() {
    return {
      title: "About", desc: "Ultimate Tokens.",
      body: [h("div", { class: "settings-about" },
        h("p", {}, "Generate perceptual color palettes, a systematic type scale, and a dimensional geometry system — exported as CSS, DTCG, Tailwind, shadcn, Figma variables, and a downloadable Brand-Kit MCP."),
        this._settingsGroup(null, [
          h("div", { class: "settings-row" }, h("div", { class: "settings-row-text" }, h("b", {}, "Support"), h("small", {}, "Questions, bugs, or feedback.")), h("a", { class: "settings-meta", href: SUPPORT_URL, target: "_blank", rel: "noopener noreferrer" }, "GitHub Issues")),
          h("div", { class: "settings-row" }, h("div", { class: "settings-row-text" }, h("b", {}, "Documentation"), h("small", {}, "Guides and the token-mapping reference.")), h("a", { class: "settings-meta", href: DOCS_URL, target: "_blank", rel: "noopener noreferrer" }, "Read the docs")),
        ]),
      )],
    };
  }

  _settingsPanelMapping() {
    const d = this.doc;
    const accentRef = d.accentRef === "single" ? "single" : "mode";
    const onColorMode = d.onColorMode === "contrast" ? "contrast" : "fixed";
    const collNames = figmaCollectionNames(d);
    const collInput = (key, label, dflt) =>
      h("div", { class: "settings-row" },
        h("div", { class: "settings-row-text" }, h("b", {}, label),
          h("small", {}, key === "raw" ? "The raw stop/scrim variables (one Value mode)." : "The semantic role variables (Light / Dark modes), aliased to the primitives.")),
        h("input", {
          class: "settings-input", type: "text", placeholder: dflt, "aria-label": label,
          value: (d.figmaCollections && d.figmaCollections[key]) || "",
          onchange: (e) => this._setFigmaCollection(key, e.target.value),
        }));
    return {
      title: "Token mapping", desc: "How semantic roles resolve and export. These choices travel with the set.",
      body: [
        this._settingsGroup("Accent", [
          this._settingRow(
            "Primary accent",
            "How the prime accent role exports. Mode picks the better-contrast stop per scheme (550 light / 450 dark); Single uses one mode-agnostic token (500).",
            [{ id: "mode", label: "Mode" }, { id: "single", label: "Single" }],
            accentRef, (id) => this.commit((doc) => { doc.accentRef = id; }), "setaccent",
          ),
          this._settingRow(
            "On-colors",
            "Text/icon colors on accent fills. Fixed pins the light tint (050 / 200); Contrast flips to the WCAG-safer end per mode.",
            [{ id: "fixed", label: "Fixed" }, { id: "contrast", label: "Contrast" }],
            onColorMode, (id) => this.commit((doc) => { doc.onColorMode = id; }), "setoncolor",
          ),
        ]),
        // Figma collection names — per-doc overrides for the two color collections the plugin
        // creates. Empty = the defaults. An override applies from the NEXT apply; collections already
        // in the file keep their name (the apply-gate warning covers the overwrite semantics).
        this._settingsGroup("Figma collections", [
          collInput("raw", "Primitives collection", "Color Primitives"),
          collInput("semantic", "Semantic collection", "Color Semantic"),
          ...(collNames.raw.toLowerCase() === collNames.semantic.toLowerCase()
            ? [h("p", { class: "settings-note settings-warn" }, "The two collections need distinct names — identical names would merge the primitives and roles into one collection on apply.")]
            : []),
        ]),
        h("p", { class: "settings-note" }, "These are resolution-layer mapping choices — they re-point how roles resolve, not the ramps, and apply to every export."),
      ],
    };
  }

  // _setFigmaCollection(key, value) — write one collection-name override ("raw" | "semantic"). Empty
  // clears back to the default; the record is dropped entirely when both are default (identity gate).
  _setFigmaCollection(key, value) {
    const v = String(value || "").trim().slice(0, 60);
    this.commit((d) => {
      const fc = { ...(d.figmaCollections || {}) };
      if (v) fc[key] = v; else delete fc[key];
      if (Object.keys(fc).length) d.figmaCollections = fc; else delete d.figmaCollections;
    });
  }


  // _cleanupPanel — Settings › Figma › Cleanup: scan this file for real styles that look like ours but
  // don't match anything the CURRENT apply plan would produce (leftovers from an older naming generation
  // that predate this plugin's own registry, so a normal apply can never find or prune them), then let
  // the user pick exactly which ones to remove. Confirm-before-delete throughout: a scan never mutates
  // anything, and delete only ever touches the ids explicitly checked.
  _cleanupPanel() {
    const r = this.sweepResults;
    const busy = this.sweepBusy;
    const body = [];
    body.push(h("div", { class: "settings-row" },
      h("div", { class: "settings-row-text" }, h("b", {}, "Scan for legacy styles"),
        h("small", {}, "Looks for real Figma styles whose name starts with a voice/palette this kit still uses, but that no current apply would ever produce — usually leftovers from an older naming convention. Nothing is deleted by scanning.")),
      btn(busy && !r ? "Scanning…" : "Scan this file", { variant: "primary", cls: "cleanup-scan", disabled: busy, onclick: () => this.scanForLegacyStyles() })));
    if (r) {
      const items = [...r.texts.map((x) => ({ ...x, kind: "Text style" })), ...r.paints.map((x) => ({ ...x, kind: "Paint style" }))];
      if (!items.length) {
        body.push(h("p", { class: "settings-note" }, "No legacy styles found — this file is clean."));
      } else {
        const allChecked = this.sweepSelected.size === items.length;
        body.push(h("div", { class: "cleanup-list-head" },
          h("small", {}, `${items.length} candidate${items.length === 1 ? "" : "s"} found`),
          h("button", { type: "button", class: "linklike", onclick: () => this.toggleSweepSelectAll() }, allChecked ? "Deselect all" : "Select all")));
        body.push(h("ul", { class: "cleanup-list", role: "list" }, ...items.map((it) =>
          h("li", { class: "cleanup-item" },
            h("label", { class: "cleanup-item-label" },
              h("input", { type: "checkbox", checked: this.sweepSelected.has(it.id) ? "" : undefined, onchange: () => this.toggleSweepSelect(it.id) }),
              h("code", {}, it.name), h("small", {}, it.kind))))));
        body.push(btn(busy ? "Removing…" : `Delete ${this.sweepSelected.size} selected`, {
          cls: "cleanup-delete", disabled: busy || !this.sweepSelected.size,
          onclick: () => this.deleteSelectedSweep(),
        }));
      }
    }
    return {
      title: "Cleanup", desc: "Find and remove real Figma styles left over from an older naming convention — nothing is ever removed without your confirmation.",
      body: [this._settingsGroup(null, body)],
    };
  }


  // _accountPanel — the Settings « Account » home (item 7, Layer 3): the effective plan (Free/Pro badge),
  // the license-key entry (Validate/Remove — WEB only; hidden/disabled in the offline Figma plugin), a
  // Manage-subscription link, and the dev/QA flag-override toggles. No payment UI beyond the seam.
  _accountPanel() {
    const isPro = this.tier() === "pro";
    const ent = this.profile.entitlement;
    const web = !this.inFigma;
    const expText = ent && ent.expiresAt ? (() => { try { return new Date(ent.expiresAt).toLocaleDateString(); } catch (e) { return null; } })() : null;
    const body = [];

    // Plan: the effective tier as a badge, plus a buy-Pro CTA for a Free web user (the Figma plugin is free).
    const planRows = [
      h("div", { class: "settings-row" },
        h("div", { class: "settings-row-text" },
          h("b", {}, "Current plan"),
          h("small", {}, isPro ? "Pro — every feature unlocked." : "Free — the core generator. A Pro license unlocks the rest.")),
        h("span", { class: "account-tier acct-badge " + (isPro ? "is-pro" : "is-free") }, isPro ? "Pro" : "Free")),
    ];
    if (web && !isPro) {
      planRows.push(h("div", { class: "settings-row" },
        h("div", { class: "settings-row-text" },
          h("b", {}, "Upgrade to Pro"),
          h("small", {}, "Unlimited brand kits, the Pro export formats, advanced treatments, and hosted MCP. ",
            h("button", { type: "button", class: "linklike account-studio-link", onclick: () => this._openCheckout(STUDIO_CHECKOUT_URL) }, "Studio for teams →"))),
        btn("Get Pro →", { variant: "primary", cls: "account-upgrade", title: "Buy a Pro license", onclick: () => this._openCheckout(PRO_CHECKOUT_URL) })));
    }
    body.push(this._settingsGroup("Plan", planRows));

    // License: the key entry / status. WEB only — the offline Figma plugin stays free, so it shows a note
    // instead of the entry (no localStorage/network there to validate against).
    if (web) {
      const rows = [];
      if (isPro) {
        const seats = this.profile.seats;
        const seatText = seats && Number.isFinite(seats.limit)
          ? ` · ${seats.usage} of ${seats.limit} seat${seats.limit === 1 ? "" : "s"} in use`
          : "";
        rows.push(h("div", { class: "settings-row" },
          h("div", { class: "settings-row-text" },
            h("b", {}, "License"),
            h("small", { class: "account-license-status" }, "Active on this device." + (expText ? " Valid until " + expText + "." : "") + seatText)),
          btn("Release seat", { cls: "account-remove", title: "Deactivate this device and free its seat", onclick: () => this.clearLicense() })));
      } else {
        rows.push(h("div", { class: "settings-row" },
          h("div", { class: "settings-row-text" },
            h("b", {}, "License key"),
            h("small", {}, "Paste the key from your purchase email to unlock Pro.")),
          h("div", { class: "account-license-entry" },
            h("input", {
              type: "text", class: "account-license-input", placeholder: "Your license key", "aria-label": "License key",
              value: this._licenseDraft || "",
              oninput: (e) => { this._licenseDraft = e.target.value; },
              onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); this.enterLicense(e.target.value); } },
            }),
            btn("Validate", { variant: "primary", cls: "account-validate", onclick: () => this.enterLicense((this.querySelector(".account-license-input") || {}).value ?? this._licenseDraft) }))));
        rows.push(h("p", { class: "settings-note account-buy-note" }, "Don't have a key? ",
          h("button", { type: "button", class: "linklike", onclick: () => this._openCheckout(PRO_CHECKOUT_URL) }, "Get a Pro license →")));
      }
      if (this._licenseError) rows.push(h("p", { class: "account-error settings-note" }, this._licenseError));
      body.push(this._settingsGroup("License", rows));
    } else {
      body.push(this._settingsGroup("License", [
        h("div", { class: "settings-row" },
          h("div", { class: "settings-row-text" },
            h("b", {}, "License"),
            h("small", {}, "Activate a Pro license in the web app — the Figma plugin is free and runs fully offline.")),
          h("span", { class: "settings-meta" }, "Web only")),
      ]));
    }

    // Manage subscription — a placeholder account portal link.
    body.push(this._settingsGroup(null, [
      h("div", { class: "settings-row" },
        h("div", { class: "settings-row-text" },
          h("b", {}, "Manage subscription"),
          h("small", {}, "Invoices, payment method, and cancellation.")),
        h("a", { class: "account-manage settings-meta", href: ACCOUNT_URL, target: "_blank", rel: "noopener noreferrer" }, "Manage on Lemon Squeezy")),
    ]));

    // Developer · flag overrides — three-state (Default / On / Off) per boolean capability flag, written to
    // profile.flagOverrides. "Default" inherits the tier value; On/Off pin it. Handy for QA-ing a gate.
    const fo = this.profile.flagOverrides || {};
    const triItems = [{ id: "default", label: "Default" }, { id: "on", label: "On" }, { id: "off", label: "Off" }];
    const overrideRows = DEV_FLAG_TOGGLES.map((f) => {
      const cur = f.key in fo ? (fo[f.key] ? "on" : "off") : "default";
      return this._settingRow(f.label, f.desc, triItems, cur,
        (id) => this.setFlagOverride(f.key, id === "default" ? null : id === "on"), "fovr-" + f.key);
    });
    body.push(this._settingsGroup("Developer · flag overrides", overrideRows));
    body.push(h("p", { class: "settings-note" }, "Overrides win over your plan everywhere a gate reads flagOf() — for testing only; they live on this machine and never travel with a set."));

    return { title: "Account", desc: "Your plan, license, and developer flag overrides.", body };
  }


  renderSettings() {
    const sec = this.settingsSection || "mapping";
    const nav = this._settingsNav();
    const panel = this._settingsPanel(sec);
    return h(
      "dialog",
      {
        class: "settings",
        "aria-label": "Settings",
        onclick: (e) => { if (e.target === e.currentTarget) this.closeSettings(); },
        oncancel: (e) => { e.preventDefault(); this.closeSettings(); },
      },
      // left rail: grouped, labeled section nav
      h(
        "nav",
        { class: "settings-nav", "aria-label": "Settings sections" },
        h("div", { class: "settings-nav-head" }, icon("gear"), h("b", {}, "Settings")),
        ...nav.map((g) =>
          h(
            "div",
            { class: "settings-nav-group" },
            h("div", { class: "settings-nav-grouplabel" }, g.group),
            ...g.items.map((it) =>
              h("button", {
                type: "button",
                class: "settings-nav-item" + (sec === it.id ? " on" : ""),
                "aria-current": sec === it.id ? "page" : undefined,
                onclick: () => { this.settingsSection = it.id; this.render(); },
              }, it.label),
            ),
          ),
        ),
      ),
      // right content: page header + sections
      h(
        "div",
        { class: "settings-content" },
        btn(icon("x"), { cls: "settings-close", ariaLabel: "Close settings", onclick: () => this.closeSettings() }),
        h("div", { class: "settings-pagehead" }, h("h3", {}, panel.title), h("p", {}, panel.desc)),
        h("div", { class: "settings-sections", role: "region", "aria-label": panel.title }, ...panel.body),
      ),
    );
  }
}
export const SettingsMixin = SettingsMixinImpl;
