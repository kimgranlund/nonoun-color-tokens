# Changelog

All notable changes to **Ultimate Tokens** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries are grouped by the day
they landed on `main` and reference the squash-merged PR that introduced them.

## [Unreleased]

### 2026-07-12

#### Added
- **Adjacent weight siblings, made systematic** (#263) — `siblingWeightDefaults(core)` now suggests the
  two LADDER-ADJACENT weights (immediate neighbors, never a skipped step), stepping from the core toward
  the 400–600 emphasis band: `Regular 400` → `Medium 500, Semi-bold 600`; `Bold 700` → `Semi-bold 600,
  Medium 500`. Replaces the old ±200 skip-a-step heuristic from #231. Every Color Categories preset (336
  palettes × the 5 designed voices — Display/Heading/Body/UI/Kicker) now ships these siblings
  pre-populated at generation time, so opening any curated palette already exports emphasis-ready Figma
  text style variants, not just the single core weight.

#### Changed
- **The type/geometry CSS export is now SEPARATE, self-contained files, not one @media-embedded
  stylesheet** (#264) — `type.css` / `geometry.css` carry the designed (Desktop) scale unconditionally,
  no media query, a complete valid stylesheet on their own; `type-tablet.css` / `type-mobile.css` (and
  the geometry equivalents) are optional bolt-ons, each bounded on both ends (`min-width` AND `max-width`,
  except the narrowest tier which stays open below) so a consumer can add any subset in any load order.
  Replaces `typeTokensResponsiveCSS`/`geomTokensResponsiveCSS`'s single mobile-first `:root`-is-actually-Mobile
  file, which — because the Figma/DTCG exports are Desktop-anchored while the CSS was silently
  mobile-first — was the likely source of "why do we only see Desktop tokens" confusion: the file's
  unlabeled `:root` block held the smallest (Mobile) sizes, not the designed Desktop ones.

### 2026-07-11

#### Added
- **A `dialog-backdrop` system constant** — a fixed, non-palette color token (opaque black at 80%
  alpha, the canonical modal/dialog scrim) now ships across every color export: CSS/OKLCH
  (`--{prefix}-dialog-backdrop`), the raw JSON (`constants.dialogBackdrop`), the DTCG raw tree
  (`palette.tokens.json`'s `constants` group), the Figma UI3 Primitives collection, Tailwind's
  `@theme` (`--color-dialog-backdrop`), and ShadCN (`--overlay`, aliasable in the design-system
  Make bundle). Also served by the downloadable Brand-Kit MCP (`kit.constants.dialogBackdrop`,
  unconditionally like `motion`) and named in the DESIGN.md Elevation & Depth prose.
  **Deliberately absent from the DTCG/UI3 *semantic* tree** (Light/Dark · `Color / Semantic`) — a
  real invariant, caught live while wiring this in: every top-level key there is treated elsewhere
  (the app's style-plan family derivation, `figma/binder/style-plan.mjs`'s paint/text-style
  generation) as a REAL PALETTE with a full 53-role set, positionally zipped against
  `doc.palettes`; a synthetic non-palette key silently breaks both. Constants live in the raw tree
  only, where every consumer already walks by name generically — documented as its own load-bearing
  rule in `knowledge-04-export-formats.md` §8 so it isn't rediscovered the hard way twice. (#262)

#### Fixed
- **The Download-All zip's root README stays honest under a renamed Figma collection.** The
  `figma-aliased/` row now names the actual collections its aliasData targets when Settings ›
  Token mapping has renamed them — previously the README always said "Color Primitives" / "Color
  Modes" even when the export pointed somewhere else, leaving a plugin-free importer no way to
  know what collection to create. Also de-duplicated the repo link onto the existing `REPO_URL`
  constant instead of a second hardcoded literal (one fewer copy to miss at the eventual
  domain/private-repo cutover). (#261)
- **Every install-instruction surface pointed at the retired GitHub marketplace channel.** The
  plugin's own README (which ships as the npm package's README too), the Download-All zip's root
  README, and four marketing docs (fact sheet, store copy, the Claude-plugin product page, the
  launch kit) all still said `/plugin marketplace add kimgranlund/ultimate-tokens` — dead the
  moment the repo goes private, and already misleading now that the real, verified-working channel
  is `https://unpkg.com/@ultimate-tokens/claude/marketplace.json`. All six now match; the plugin
  version bumps to 0.2.1 to publish the fix. (#260)

#### Added
- **The plugin distribution goes pure-npm, published by CI** — the repo is going private, retiring
  the GitHub marketplace channel; nothing is hosted anywhere (supersedes the same-day
  ultimate-tokens.com hosting shape of #258). The plugin publishes as **`@ultimate-tokens/claude`**
  (the npm org), **automatically**: `.github/workflows/publish-plugin.yml` publishes on every
  `plugin.json` version bump that lands on main (idempotent — same version is a no-op; needs the
  one-time `NPM_TOKEN` org secret). The `marketplace.json` rides *inside* the package and the npm
  CDNs serve it as a remote-URL marketplace
  (`/plugin marketplace add https://unpkg.com/@ultimate-tokens/claude/marketplace.json`), its
  plugin source the package itself, deliberately UNPINNED so downloaded catalogs never go stale.
  Two verified platform facts shape this: no direct-from-npm install exists (a marketplace is
  always the entry point), and a URL-added marketplace downloads only the one file.
  `npm run gen:plugin-pack` builds the publishable package; `test/plugin/hosted-pack.mjs` (the
  27th test file) gates version lockstep, the unpinned in-package catalog, and surface
  completeness. Public install copy keeps the working GitHub commands until the first publish
  claims the name; the flip list + runbook live in `plugin/HOSTING.md`. (#258, #259)
- **The Download-All zip is self-describing.** A generated root `README.md` maps every included
  folder (respecting the system toggles AND the Pro-export gate — a folder absent from the archive
  is absent from the map), carries the consumption-plugin install commands
  (`/plugin marketplace add kimgranlund/ultimate-tokens` → `/plugin install ultimate-tokens`), points
  at the Download Brand-Kit MCP, and notes the responsive anchor + the text-rendering baseline. The
  skills layer itself stays deliberately un-bundled — it updates centrally via the marketplace, so a
  copy frozen into every zip would go stale. (#257)
- **The consumption plugin is versioned honestly:** `0.1.0 → 0.2.0` — the installed-copy update
  signal for this week's skill changes (the breakpoint canon, text-rendering law 7, invocation
  dials); its descriptions also said "seven-voice type scale" — the scale has been **eleven** voices
  since ADR-013. (#257)
- **Settings grew its missing preferences.** Token mapping gains **Figma collections** — per-document
  overrides for the two color-collection names the plugin creates (defaults `Color Primitives` /
  `Color Modes`); the override rides the export's aliasData and the apply message, `code.js` falls
  back to the defaults, and a renamed file still round-trips at boot (the saved config resolves the
  name). Appearance gains **Motion** (System respects your OS reduce-motion setting — which the
  editor previously ignored entirely — Reduced forces minimal animations) and **Reset to defaults**;
  the theme, canvas-preview, and motion preferences now **persist on the device**
  (`ultimate-tokens-app-prefs-v1`) instead of resetting every session. (#255)
- **Backlog note:** the "back up your variables first" consent gate (backlog item 2) was verified
  already fully shipped — the road-block before Apply/Regroup, the versioned don't-show-again
  consent, and the always-warning destructive Regroup all predate this wave; no change was needed.
  Stop-density/scrim-step preferences are deliberately deferred: `EXPORT_STOPS` is a lockstep engine
  contract (role refs + count gates ride on it), not a settings row. (#255)

### 2026-07-10

#### Added
- **The text-rendering baseline ships in every design-system export — always, never optional.** The
  DESIGN.md Typography section (all three platform profiles), the Figma Make `styles.css` (as real,
  paste-ready CSS) and `typography.md`, and every `@dsCard` preview now carry the block:
  `-webkit-font-smoothing: antialiased` + `-moz-osx-font-smoothing: grayscale` (the macOS pair —
  consistent weight in both schemes), `text-rendering: optimizeLegibility`, `font-optical-sizing:
  auto`, `font-synthesis: none` (weights resolve from the real font, never synthesized),
  `font-kerning: normal`, `font-variant-ligatures: common-ligatures`, plus
  `code, pre, kbd { font-variant-ligatures: none }` so code-like units never ligate. "Always" is a
  gate, not a hope: the exports verifier fails on any carrier missing the block. The consumption
  plugin's `typography-tokens` skill teaches the same rule (law 7). (#254)

#### Changed
- **Breakpoints are hierarchy-aware and DESKTOP-ANCHORED.** The scale you design now IS the Desktop
  mode, and Tablet/Mobile derive *down* via a size-progressive compression curve: body-class text is
  **frozen** across breakpoints (Body/UI/Caption ±0px) while display-class type compresses steeply
  (Display ~90 → 75 → 60 — ×5/6 at Tablet, ×2/3 at Mobile at the top of the ramp, interpolated in
  log-size space down to ×1 at body size). Geometry mirrors the anchor (the designed ramp is Desktop;
  Tablet/Mobile heights derive −2/−4). This replaces the flat bodyBase bump, which scaled everything —
  the opposite of how responsive type behaves. The Standard set now *materializes* these same modes for
  matrix editing (`factor` modes); responsive CSS re-anchors mobile-first (`:root` = Mobile, `@media`
  up to Desktop at 1280) while Figma stays Desktop-first with Desktop as the default mode. (#253)
- **Category preset typography uses %-strings.** The curated presets' per-palette type slots now carry
  `"leading": "96%"` and `"tracking": "-2%"` (% of font size) instead of the ambiguous bare floats
  (`leading: 0.96`, `trackingEm: -0.02`) — all 7 category files (3,360 fields) converted atomically;
  the generator parses %-strings strictly and a schema gate rejects the retired numeric shape. (#253)
- **Size modes are now INTRINSIC — every export carries Desktop · Tablet · Mobile, like every color
  export carries Light + Dark.** A document with no configured breakpoint modes no longer produces
  Base-only Typography/Geometry collections: the standard Desktop (1280, +2px body / +4px heights) and
  Tablet (992, +1 / +2) rungs are synthesized from the base config at export/apply time, with the base
  riding as **Mobile** — zero setup, in the Figma variables, the responsive CSS `@media` blocks, and the
  per-breakpoint DTCG files (Download-All gains `type.{1280,992}.tokens.json` +
  `geometry.{1280,992}.tokens.json`). Configuring your own modes (＋ or Standard set) takes full manual
  control. Geometry's synthesized rungs compose the type scale at the same rung, so the shared `font`
  tracks. (#252)
- **The standard breakpoint set is now Desktop · Tablet · Mobile.** One click in Typography or Geometry
  creates **Desktop (min-width 1280)** and **Tablet (992)** and renames the base layer **Mobile** (your
  unmodified ≤476 scale) — replacing the four numeric rungs (768/992/1280/1540). The order is
  desktop-first everywhere it shows: the Figma collections emit modes **Desktop · Tablet · Mobile**, so
  **Desktop becomes Figma's default mode**; the canvas Mode chips and the token matrices read the same
  way. Type steps body +2/+1 px; Geometry lands the original full ramp on Desktop (the base compresses
  −4 px, Tablet sits midway). Existing files convert on re-apply — the plugin renames the old `Base`
  default mode to `Desktop` and adds the rest by name. (#251)
- **Responsive CSS is order-proof.** `typeTokensResponsiveCSS`/`geomTokensResponsiveCSS` now emit
  `@media` blocks ascending by min-width regardless of how the doc stores its modes — a desktop-first
  mode list can no longer break the mobile-first cascade. The Figma emitters gain
  `{ baseName, baseLast }` (a renamed base layer, optionally ordered last); the mode-apply validator
  accepts any non-empty default mode name instead of requiring the literal `Base`. A doc without
  breakpoint modes is byte-identical to before. (#251)

#### Fixed
- The CHANGELOG's own header still attributed the product ("Ultimate Tokens by NONOUN") — the one
  "by" line the #250 debrand missed. (#251)

### 2026-07-09

#### Removed
- **The maker brand.** "Ultimate Tokens by NONOUN" is now simply **Ultimate Tokens** — no attribution, no
  "by" line, no monogram. The `nonoun.io` surface is gone: **support is GitHub Issues**, **docs are the
  README**, **billing is Lemon Squeezy's own customer portal**. Every replacement link resolves today; the
  alternative was a domain nobody owns, shipping 404s behind a nicer name.
- **The `<nonoun-color-tokens>` element tag.** The deprecated alias registered alongside `<ultimate-tokens>`
  is retired: there is **one tag**. Keeping it looked free, but an alias keeps the retired brand alive in
  the DOM and in every generated bundle. An embed on the old tag now renders nothing — a visible failure,
  which beats a silently-styled ghost. `migrateStorageKeys()` is untouched: the tag was *cosmetic*
  compatibility, the storage prefixes are *data* compatibility, and only the first was expendable.
  (ADR-014 amended, #250)
- **The "N" monogram**, which could not be renamed away because it *was* the letterform. `brandMark()` and
  the eight `ico-nonoun-*` assets are deleted; the favicon set is regenerated from a brand-neutral mark —
  four tonal swatches, saying what the product is rather than who made it. The header shows the wordmark
  alone. (ADR-015, #250)

#### Added
- **`test/repo/branding.mjs`** — the debrand is a **gate**, not a sweep. A find-and-replace decays: the next
  toast, og: tag, or lifecycle email reintroduces the maker by muscle memory, and re-attribution is a
  factual claim about who makes this. The gate fails `npm test` on `NONOUN`, on any `nonoun.io` URL, and on
  the pre-rename identifier outside a named back-compat allowlist. `voice-check.mjs` raises the same word to
  **ERROR** in copy. Changelogs and the decision records are exempt — a record must be able to name what it
  retired. (#250)

#### Changed
- Internal identifiers took the product's name: the export schema `nonoun-figma-styles.plan.v1` →
  `ultimate-tokens-figma-styles.plan.v1`, the DOM ids `nonoun-type-fonts` / `nonoun-wf-*`, and the shared
  build anchor `__NONOUN_FLOAT_PLANS__` (lockstep across the app, the binder, and two tests). (#250)
- The voice platform's §1 kept the house grammar rule ("no nouns, just verbs") and dropped the etymology it
  used to be derived from. The unbuilt hosted-MCP and magic-link URLs became explicit `<APP_DOMAIN>` /
  `<MCP_DOMAIN>` placeholders, so Phase B must acquire a domain as step zero rather than inherit one. (#250)
- Fixed a stale install command in the pinned fact sheet that #248 missed
  (`/plugin marketplace add kimgranlund/nonoun-color-tokens`). (#250)
- **The deeper identity rename — `nonoun-color-tokens` → `ultimate-tokens`.** Following the folder and
  GitHub-repo move, the product's identity moved everywhere it is *addressable*, in four namespaces:
  the **custom element** (`<nonoun-color-tokens>` → **`<ultimate-tokens>`**, with the old tag kept as a
  deprecated alias so pre-rename embeds keep booting — every tag-keyed CSS selector matches both);
  **localStorage** (`ultimate-tokens-*`, with `migrateStorageKeys()` now a chain
  `hct-palette-state-v1` ← `nonoun-color-tokens` ← `ultimate-tokens`, newest legacy wins, never clobbering
  a present key); the **Figma plugin id** and its `pluginData` keys; and the **brand-kit MCP schema**
  (`nonoun-brand-kit/1` → **`ultimate-tokens-brand-kit/1`**). The build artifact is now
  `dist/ultimate-tokens.html` and the Pages deploy follows it. (#247)
- **The public install command changed** — the Claude plugin is now
  `/plugin marketplace add kimgranlund/ultimate-tokens`. GitHub redirects the old path, but new copy
  uses the new one. (#248)
- **The repo's own agent + skill renamed to the new domain**: `color-tokens-reviewer` →
  **`ultimate-tokens-reviewer`**, and the `/color-tokens-brand-voice` skill →
  **`/ultimate-tokens-brand-voice`** (the directory name IS the command). The plugin's `color-tokens`
  consumption skill KEEPS its name — there `color-tokens` names the token *system* (peer to
  `typography-tokens` / `geometry-tokens`), not the product. (#249)
- **User-facing product-name drift repaired.** The flagship Figma plugin's error toast and console prefix
  still said "Color Tokens" while its manifest said "Ultimate Tokens by NONOUN"; the app's masthead `<h1>`
  and brand link said the same. All now read **Ultimate Tokens**. The separately-published **Color Tokens
  Semantic Binder** plugin keeps its own published name and id. (#248)

#### Removed
- **`LEGACY_CONFIG_KEY` (the Figma `"hct-config"` fallback).** `figma.root.setPluginData` is namespaced
  **per plugin id**, so changing the id orphans every pre-rename key — there is no read path to them and no
  migration is possible. The fallback was dead code. In its place, a gate proves `load-config` degrades to a
  clean empty config when only pre-rename keys exist, rather than silently adopting a stale one. (#247)


### 2026-07-05

#### Added
- **The Claude Design export is now the FULL bundle — spine + previews, not just tokens.** Building on the
  `tokens.json` layer, Download-All's `claude-design/` folder now carries the complete three-layer
  [Claude Design](https://claude.ai/design) system: **`DESIGN.md`** — the 9-section generation prompt
  (Visual Theme · Color Palette & Roles · Typography · Component Stylings · Layout · Depth & Elevation ·
  Do's & Don'ts · Responsive · Agent Prompt Guide), written *as* instructions with the brand's own
  guardrails (the pairing law, intents-mean-status, elevation-as-surface-ladder) — plus six
  **self-contained `components/*.html`** @dsCard previews (colors · type scale · spacing/radii · buttons ·
  status/intents · a composed card) that render the brand with no external loads. A new **DESIGN.md**
  preview tab sits beside **tokens.json** in the Export drawer. One shared colour source feeds all three
  layers, so the whole bundle stays cross-layer-consistent — validated against the `design-system-author`
  skill's `ds_check.py` (**D1 card grammar · D2 self-containment · D3 cross-layer consistency all PASS**),
  for both a full 8-palette kit and a minimal 2-palette one. A vision-capable Claude reads the folder to
  generate on-brand screens.

### 2026-07-04

#### Added
- **Export a Claude Design bundle — `claude-design/tokens.json`.** A new export format (Export drawer →
  *Claude Design*, and in Download-All under the Color system) emits the token layer of a
  [Claude Design](https://claude.ai/design) system: a small **generation colour role set** — surfaces &
  chrome (`background · surface · surface-raised · foreground · muted · border · ring`) plus the
  accent/intent roles (`primary · secondary · accent · danger · success · warning · info`, each paired
  with a `-foreground`) — reduced from the 59 roles by the same name→role matcher the shadcn export uses,
  plus the composed **type** (fonts + a per-voice·step size scale), **spacing**, and **radii** ladders
  (numeric px). Colours ship both schemes (`colors` = light, `colorsDark` = dark); a vision-capable Claude
  reads the file to generate on-brand screens. Validated against the `design-system-author` skill's
  `ds_check.py` D3 gate.
- **Four editorial type voices — the taxonomy grows 7 → 11.** Alongside the original seven, the type
  system now generates **Lead** (a standfirst/lede), **Quote** (a block/pull quote that rides the heading
  role, so it takes each treatment's display face — a serif pull-quote in the serif treatments), **Caption**
  (figure/media captions) and **Legal** (fine-print). Each is a semantic token (`--type-quote-md-*`, …) on
  a lean SM·MD·LG ramp (53 steps total), flowing automatically to every export — CSS, DTCG, Tailwind,
  Figma variables, and the MCP brand kit. Caption + Legal ride the **UI font** but set as **prose** (reading
  leading, no single-line height) via a new per-voice flow flag; the seven original voices are byte-identical.
  (ADR-013)

#### Changed
- **Curated palette presets carry the full status set — `info · success · warning · danger`.** Every
  gallery preset (7 categories × 48) now ships an **`info`** (blue) status family alongside
  success / warning / danger — the canonical four, matching the product's Info/Success/Warning/Danger
  defaults — and emits them in that order. Each preset grows 10 → 11 palettes; the status block stays a
  single muted register so it never fights a preset's curated character.

### 2026-07-03

#### Added
- **Ultimate Tokens ships as an installable Claude plugin** (`plugin/ultimate-tokens/`). Three
  *consumption* skills teach a coding agent to apply an exported kit inside its own project —
  `color-tokens` (the 59 semantic roles), `typography-tokens` (the seven-voice scale, role × level), and
  `geometry-tokens` (the two-tier dimensional system) — alongside a **`token-integrator`** entry-point
  agent that binds to the project's real exported variables and, for large migrations, orchestrates scoped
  planning → execution → verification sub-agents (the verifier a separate seat from the executors). Install
  with `/plugin marketplace add kimgranlund/nonoun-color-tokens`. Every skill is parity-gated against the
  product engines in `npm test`, so it cannot drift from the tokens it documents. (#186, #187, #188, #192,
  #193, #194, #196)
- **Configurable token naming scheme across all three systems.** Colour/type/geometry exports emit the
  default (`--c-*` / `--type-*` / `--size-*`), a **Material 3-flavoured** scheme (`--md-sys-color-*` /
  `--md-sys-typescale-*` / `--md-sys-*`), or a **custom `--{brand}-*`** prefix — chosen in Settings and
  unified across colour, type, and geometry. (#189, #191)
- **Geometry container tier** — semantic inset/gap tokens plus stroke/border tokens beside the existing
  control geometry, so spacing and dividers are tokenised too. (#183)
- **Responsive geometry (`rampContrast`)** — the dimensional ramp compresses toward small screens,
  mirroring the type breakpoint modes. (#182)
- **Per-role paragraph spacing + single-line height** — every voice carries its own `paragraphSpacing`;
  the box-text voices (UI · Code · Kicker) also carry `singleLineHeight` (leading 1.0) for non-wrapping
  control text. (#184)
- **Per-voice weight style-names** for non-variable font families (e.g. "Condensed Black Italic"), emitted
  to the Figma Font Primitives collection. (#185)

#### Changed
- **Type roles decoupled from size and renamed** to drop the size-implying names: the seven voices are now
  **Display · Heading · Sub-heading · Kicker · Body · UI · Code** (was Heading-Editorial · Heading-Context ·
  Heading-Eyebrow). A voice is the text's *function*; the step is its *hierarchy level*, from which the size
  is derived — the type-scale law now states this explicitly, so `display` is never reached for merely
  "big text." (#195, #197)
- **Radius ladder aligned to Material 3's shape-corner scale** — `none/xs/sm/md/lg/xl/full =
  0/4/8/12/16/28/9999`, fixed across the geometry treatments. (#190)
- **Type leadings retuned to the design intent** — line-height:size is now a fixed per-role constant,
  uniform across treatments: **Display 0.8** (< 1 — large type sets tight, was ~1.1), heading/sub-heading
  **1.125**, body **1.5**. Treatments express voice through font/weight/tracking/scale, not leading. Every
  type export's `line-height` shifts accordingly. (#199)

#### Fixed
- **Exported OKLCH hue now matches the hue you set.** The perceptual ramp is authored in OKHSL and
  exported in OKLCH, and the two disagree on "constant hue" by a chroma/lightness-dependent amount (the
  Abney effect) — worst in the blues, where a set Hue 270 exported ~6° off (Hue 300 → ~297). The key stop
  (500) is now anchored by solving the OKHSL hue **directly in the render space, at that stop's own
  saturation and lightness**, so it reads back on the set OKLCH hue exactly — within **~0.5° across the
  whole wheel**, at any damping (was up to 6°). Supersedes the interim reached-saturation anchor.
  (#201, #202)
- **The same hue fix now covers the "even" tone mode.** The even/CAM16 ramp is authored in HCT and had the
  same Abney drift on OKLCH-hue palettes — up to ~2° un-amplified and **~9° under mid-tone amplification**
  (`dampAmp`), worst in the blues. Its key stop (500) is now solved **directly in the render space at that
  stop's actual chroma and tone** (`solveCam16Hue`), matching the perceptual path to **~0.5° across the
  wheel** at any damping. Both ramp paths now anchor hue in the space they render (ADR-012); `cam16`-hue
  documents are unaffected.
- **Download-All now includes BOTH colour-CSS formats.** The bundle emitted only one CSS folder
  (`css-hex/` *or* `css-oklch/`) based on a `Colour format` setting; it now always ships **both**
  `css-hex/` and `css-oklch/`, matching how it already ships both Tailwind and shadcn and the export
  drawer's two co-equal Hex/OKLCH tabs. The redundant `Colour format` setting is **removed** (pick a
  single format from the drawer's tabs; the mega-bundle is comprehensive). (#200)

### 2026-07-02

#### Added
- **Marketing corpus + `marketing-manager` agent + brand-voice skill** — a voice platform, a pinned fact
  sheet, complete schema-keyed store copy, and a launch/social kit under `.claude/docs/marketing/`,
  authored and fact-checked through a dedicated agent and brand-voice skill. (#173, #175)
- **`store-drift-check`** — audits the live Lemon Squeezy store against the corpus, with per-product
  description probes. (#177, #178)
- **Standard breakpoint set for Type & Geometry** plus a Figma **Font Primitives** collection export.
  (#180, #181)
- **Brand icon kit + social share card** for the live demo site. (#171)
- **Lemon Squeezy knowledge skills** (`lemon-squeezy-schemas`, `lemon-squeezy-api`). (#174)

#### Changed
- **Docs tree moved under `.claude/docs/`**, with the agent/skill records serviced to match. (#172)
- **Email-bound licensing direction recorded** (decision record + corpus pins). (#176)

### 2026-07-01

#### Added
- **Export settings group completed** — a Colours CSS-format setting (**HEX / OKLCH**) beside
  Typography/Geometry, a settings-driven **CSS unit format** (px/rem/em) for type + geometry, and the
  Format dropdown grouped by system. (#167, #168, #169)
- **shadcn theme carries the brand fonts + a geometry-derived `--radius`.** (#170)
- **Per-size Height editing for Geometry** (as in Typography), plus a calendar glyph and solid carets.
  (#163)

#### Changed
- **Font sizes quantise to a nice-number ladder** (always on). (#166)

#### Fixed
- **Range-slider drag made robust for the Figma plugin** — pointer-capture + measured-track mapping, driven
  off `window` so a far drag no longer cuts off. (#164, #165)
- **The Figma apply-gate modal closes with real completion feedback.** (#161)
- **The weakest scrim step is zero-padded** (`500-50 → 500-050`, ADR-006). (#162)

### 2026-06-30

#### Added
- **Monetization gates wired** — `maxSets` (blocks a new kit past the plan cap), `proExport` (DTCG /
  Tailwind / shadcn are Pro), and `advancedTreatments` (non-default treatments are Pro). (#138, #139, #140)
- **Lemon Squeezy product/variant IDs wired** — checkout deep-links + a product-id pin. (#159)
- **Native breakpoint-mode apply for Type & Geometry in Figma** (Phase 5.4b), built on a pure apply-plan
  for breakpoint-mode variables. (#137, #154)
- **Per-voice typography tuning** — select a voice and reshape it (Scale select-and-edit), with an editable
  font combobox per role for custom families. (#149, #151)
- **Two more editor preview artifacts** — a native slider and form controls. (#148)
- **Hosted Brand-Kit MCP — spec & plan (Cloudflare).** Account-based (magic-link, one OAuth endpoint); a
  transport-agnostic `brand-kit-core` extracted for hosted-MCP parity (Phase A); and a normative storage &
  offline-first sync spec (lazy-anonymous, 90-day retention). (#141, #142, #143, #144, #145)

#### Changed
- **Editor chrome polish** — Roles click-to-copy, Global toggles → segmented controls, export
  consolidation, Story rhythm, and Settings labels. (#146, #147)

#### Fixed
- **Figma apply respects the export-system toggles** (never writes a toggled-off system) and is
  **provenance-guarded** (never touches a user's own collection). (#155, #160)
- **The inspector specimen rows stack** in the narrow right pane. (#150)
- **Example-gallery collapse restored on `main`** (test + style + bundle). (#156)

### 2026-06-29

#### Added
- **Live seat usage in Account + boot re-validation.** (#136)

### 2026-06-28

#### Changed
- **Product identity: renamed to "Ultimate Tokens by NONOUN"** (was "Color Tokens by NONOUN"). The
  display name updates across the app title/wordmark + About, the Figma plugin manifest, the favicon
  web-manifest, the MCP brand-kit `generator` field + server/README, and the CSS/Tailwind/shadcn export
  headers. The internal id (`nonoun-color-tokens` — repo, package, storage keys) is unchanged.

### 2026-06-27

#### Fixed
- **Typography fonts now render in Safari (the real "fonts not loading" root cause).** The specimen built
  inline `font-family` declarations with **unquoted** family names, e.g. `font-family: Source Serif 4, serif`.
  Per the CSS spec an unquoted family name can't contain a token starting with a digit, so **`Source Serif 4`
  (the "4") is invalid in Safari** and the declaration drops to the fallback — while **Chrome tolerates it**
  (which is why the headless-Chrome smoke passed and Safari failed). Every inline-style font-family (the
  specimen, the inspector, the live example, the analysis card) and the exported CSS custom prop
  (`--font-*`) now **quote** the family name. A side-by-side isolation page (`scripts/gen-font-test.mjs`)
  pinned it down: all loading methods work; only the unquoted real-name usage failed in Safari.
- **Typography fonts now load everywhere — including offline and in the Figma plugin.** The four faces
  (Inter · Inter Tight · Source Serif 4 · JetBrains Mono) are **self-hosted**: their Latin subset is
  inlined as base64 `@font-face` (`src/ui/type-fonts.js`, ~230 KB), injected as a `<style>` when the
  Typography section opens. `data:` URIs are inline, not network requests, so the specimen renders in the
  real faces with **no Google Fonts CDN call at all** — offline-proof, privacy-clean, and compliant with
  the Figma plugin's `networkAccess:"none"` (which hard-blocked the old CDN `<link>`). A `gen:type-fonts`
  script regenerates the asset when the font set changes. The faces are **eagerly activated** via the
  FontFace API (`document.fonts.add` + `load()`), not just declared in a `<style>` — Chromium's `@font-face`
  path is lazy (a face isn't activated until an element uses it), which left a font outside the current
  treatment (e.g. **Source Serif 4** on a sans treatment) inactive and flashed the fallback on first use.
  Eager activation makes all four render reliably from first paint, on every treatment.

#### Changed
- **Typography expanded to the seven named groups** (the canonical taxonomy from the spec): **Display ·
  Heading-Editorial · Heading-Context · Heading-Eyebrow · Body · UI · Code** — replacing the prior four
  voices. Heading-Eyebrow + Code ride the **mono** font; Display, Heading-Context, and Heading-Eyebrow are
  the **UPPERCASE** caps voices (Display tightens, Context/Eyebrow open up) — the engine now carries a
  per-step `textTransform`, emitted to CSS (`text-transform`) + DTCG (`textCase`). The canvas specimen,
  left-rail analysis (seven-series curves), and right-pane inspector all render the full **41-step** scale
  (Display 5 · 3×Heading 5 · Body 5 · UI 8 · Code 8). All five treatments keep their character via a shared
  `make7()` factory. No persist change — `doc.type = {treatment, bodyBase}` is unchanged.

#### Added
- **Typography is now a first-class editor SECTION (not a modal).** A persistent App-Header switcher
  **« Color · Typography · Geometry »** routes the whole editor between sections of the *same* set. The
  Typography section reuses the three-pane shell: the **center canvas** shows the **full 23-step specimen**
  (Display · Heading · Body · UI — every step, vs the old modal's 8) live in the real fonts, pannable /
  zoomable, with a **Specimen · Tokens** toggle; the **left rail** shows type **analysis** (modular-scale
  curve, optical-tracking curve, leading, font-role pairings); the **right pane** is the type **inspector**
  (treatment + body-base controls, a read-only per-voice summary, a live brand-coloured example, and the
  token download). The Typography **modal is retired**. Color behavior is unchanged (the section branches
  are guarded; the color canvas/inspector/analysis are byte-identical). Geometry's tab lands on a
  placeholder with a one-click into its existing editor (its section follows in the next phase). Phase 2 of
  the three-system workbench IA — designed via a multi-agent team (4 parallel designers + synthesis) and
  adversarially reviewed before merge.

#### Changed
- **Settings is now a page, not a toast.** Rebuilt as a left **section-nav** (grouped, labeled — Tokens ·
  App · About) + a right content area with a page header and label-left / control-right rows, sized like a
  page (`min(960px, 94vw) × min(85vh, 720px)`). **Tokens › Mapping** holds the accent + on-color mapping;
  **App › Appearance** surfaces the app-theme and canvas-preview scheme as explicit segmented controls;
  **About** carries the support contact + docs. First step of the three-system workbench IA — the nav has
  room to grow (Export defaults, Set identity, Modes & breakpoints) as those land. `(set)` headless covers
  the nav + panel switching.

### 2026-06-26

#### Added
- **Type ↔ Geometry composition.** A control's box and its text now share **one number**: the geometry
  engine's per-size `font` comes from the brand's **Typography UI** scale (matching step — geometry XS →
  UI XS … 2XL → UI 2XL) instead of a standalone power law, so changing the type treatment or body base
  moves the control text everywhere it's used. The frame (height/icon/padding/radius) is untouched, so the
  centering law still holds. The Geometry modal shows the shared-source note and the composed sizes; the
  Brand-Kit MCP serves the composed geometry. New `geometryScale(doc)` (the single join point) +
  `geomScale(config, { typeScale })`.
- **Geometry → Figma number variables.** The Download-All bundle's `figma/dimension.variables.json` (and
  the Geometry modal's `.zip`) now ships a **"Geometry" collection of DTCG `number` tokens** (unitless) —
  the shape a Figma variable importer turns into native **FLOAT variables** (height · icon · font · gap ·
  padding · radius · space) you bind to auto-layout, corner radius, gaps, and sizing. New `geomTokensFigma`.
- **Per-system export opt-in (Color · Typography · Geometry).** The export drawer gains an **Include**
  toggle row — choose which token systems go into the **Download-All `.zip`** and the **Brand-Kit MCP**.
  Color gates every colour format + the palettes/roles; Typography adds `typography/type.{css,tokens.json}`;
  Geometry adds `geometry/geometry.{css,tokens.json}` (both also dropped into `figma/` as importable
  variables/styles). The format picker now previews **Typography (CSS/DTCG)** and **Geometry (CSS/DTCG)**
  directly too. `brandKit(doc, systems)` builds only the opted-in sections, and the **MCP server's surface
  follows suit** — `get_type` / `brand://type` and `get_geometry` / `brand://geometry` appear only when
  those systems are included (the colour tools only with palettes).
- **Geometry / dimensional generator.** The spatial analog of the color & type engines: a few params →
  a systematic size ramp → derived control geometry. A 📐 Geometry modal (header) picks a **treatment**
  (Comfortable, Compact/Dense, Spacious/Airy, Touch/Mobile, Pill/Rounded) + base control height, previews
  a **live size ramp** (XS–2XL mock controls — leading icon · label · caret, every dimension the real
  px), and downloads **geometry tokens** (CSS custom props + `.control-*` utility classes + DTCG
  `dimension` tokens) as a `.zip`. The engine (`src/engine/geometry.mjs`) encodes the **centering law** —
  edge padding = (height − glyph) / 2, every glyph centered in a square cell of side = the control height —
  and the **two families** (frame ∝ height: icon, slot, pad, pill radius = height/2; rhythm ∝ font:
  gap = font/2, caret = font; density rides the rhythm only). The six-size ramp is generated by one
  sublinear power law (icon = 2.49·h^0.58, font ≈ √h), reproducing the hand-tuned reference table to ±1px.
  It travels with the set (persisted) and is **served by the Brand-Kit MCP** too.
- **Typography generator.** The type analog of the color engine: a few params → a systematic type scale.
  A ⓣ Typography modal (header) picks a **treatment** (Product/Lifestyle, Luxury, Editorial, Technical,
  Brutalist) + body base size, previews a **live specimen** (Display / Heading / Body / UI voices), and
  downloads **type tokens** (CSS utility classes + DTCG `typography` tokens) as a `.zip`. The engine
  (`src/engine/type.mjs`) derives every step's size (modular scale), line-height (per-role leading),
  letter-spacing (optical — tightens big display, loosens small UI), and weight. It travels with the set
  (persisted) and is **served by the Brand-Kit MCP** too.
- **Brand-Kit MCP (download).** "Brand-Kit MCP" in the export drawer's Config tab downloads a `.zip` with
  a **zero-dependency MCP server** + your resolved tokens (`brand-kit.json`) + a setup README. Point
  **Claude Code / Cursor / any MCP agent** at it (`node brand-kit-server.mjs` or `claude mcp add`) and it
  serves your palettes, tonal ramps, and the 37-role semantic layer (light + dark) as MCP resources/tools
  (`resolve_token`, `get_ramp`, `nearest_token`, …) + a brand-usage prompt — so the agent builds with your
  exact tokens. New `brandKit(doc)` projection; a 12th verifier drives the server over the MCP protocol.
- **Settings modal** (⚙ in the header) for doc-level **token-mapping** preferences. First controls:
  **Primary accent** — `Mode-specific · 550 / 450` *(default)* vs `Single · 500 / 500` (one
  mode-agnostic accent token) — and **On-colors** (`fixed` / WCAG-`contrast`, surfaced here too). A
  resolution-layer choice (`applyAccentRef`) that re-points how the prime accent role resolves without
  touching the ramp or the canonical role table; travels with the set + applies to every export.
- **"Back up your variables first" consent gate** before "Apply Variables → Figma" (and Regroup). A
  centered modal explains that applying creates/overwrites the `Color Primitives` + `Color Modes`
  variable collections (same-named variables are overwritten — which can intentionally re-skin bound
  components), nudges you to **duplicate the file first**, and links to **how mappings work**. It's
  **cookieable** ("Don't show again", remembered per user/version) for normal apply; the destructive
  **Regroup always re-warns**. Doubles as Figma's required explicit-consent-before-modifying gate.

#### Changed
- **Figma plugin compliance pass (launch prep).** Both plugins now show **friendly, handled errors** —
  the technical detail goes to `console.error`, and users see an actionable message ("Color Tokens couldn't
  apply the variables… email support@nonoun.io") instead of a raw error string (Figma store policy). The
  companion plugin is renamed **"HCT Semantic Binder" → "Color Tokens Semantic Binder"** (id
  `color-tokens-semantic-binder`) and its manifest `networkAccess` moved to the current object form
  (`{ "allowedDomains": ["none"] }`). Stale **"HCT"** *product* branding is scrubbed from every user-facing
  string (the *color-model* term HCT stays in the engine, where it's accurate). Regression-guarded in
  `test/figma/{plugin,binder}.mjs`.
- The Figma plugin's in-file config key `hct-config` → **`nonoun-color-tokens-config`** (aligns with
  `SETS_KEY`'s `nonoun-color-tokens-*` naming). `readConfig` falls back to the legacy `hct-config` key,
  so files saved before the rename still load and migrate forward on the next save.

#### Docs
- **README refresh** — regenerated the hero from the current engine and **pinned the preview to the
  perceptual distribution** (`gen-preview.mjs`), so the "perceptually-even" caption holds regardless of
  the default; added a **Compose new palettes** feature bullet (the derivation modal + drag-reorder);
  framed the hero as the perceptual export.
- **Spec/reference docs brought current** — the Figma collections renamed to `Color Primitives` /
  `Color Modes` across the `.claude/docs/spec/**` prose; a new `knowledge-06-palette-derivation.md` for the
  "New Palette" engine; `component-inventory.md` + `spec-draft.md` updated for the ghost reorder, the
  native-`<dialog>` overlays, the gallery, and the evolved data model. (Internal spec; see spec CHANGELOG 1.37.)

### 2026-06-25

#### Changed
- **Palette drag-to-reorder is now ghost-based.** Dragging a row's ⋮⋮ handle lifts a **floating clone**
  that tracks the cursor, the source row collapses, and a **dashed placeholder** opens at the landing
  slot so the list visibly parts to show where the drop will go — replacing the thin drop-edge line.
  The drop slot is decided relative to that placeholder (the proposed placement) with a **10px
  deadzone**, so it only reslots when the cursor moves clearly past the placeholder's edge — no jitter
  from the reflow. The reorder logic (one undo step, selection follows the moved palette) is unchanged.

#### Fixed
- The drag-reorder **floating clone now resolves its colors in the canvas preview's `color-scheme`**,
  not the app chrome's. The clone is re-parented to the host for viewport-fixed positioning, so a row
  dragged while the canvas ◐ preview is the **opposite** mode from the chrome (e.g. light canvas, dark
  app) previously rendered the clone's `light-dark()` text/surfaces in the wrong mode (light text on
  the light row). The ghost is now pinned to `resolvedCanvasScheme()`.

## [1.2.0] — 2026-06-25

Renames **Surveys → Color Categories** (the gallery label *and* the internal code), adds a **color
picker** and a **priority chain** to the New-Palette modal, drops the "Survey" wording from the curated
eyebrows, and hardens the CI smoke harness against cold-runner flakes.

### 2026-06-25

#### Added
- **New-Palette modal polish:** the **Custom** tab gains a native **color picker** (pick a color and
  the palette's hue + chroma are recovered from it; the sliders still fine-tune), and the **Relative**
  preview now shows the **priority chain** — the ordered context colors (primary marked, then
  secondary / tertiary…) — so the priority order driving the relationship is visible, not just the
  single anchor.

#### Changed
- Renamed the **"Surveys"** feature to **"Color Categories"** throughout — the gallery label/nav and
  the **internal code**: `src/ui/surveys/` → `src/ui/categories/`, `.claude/docs/spec/colors/surveys/` →
  `…/categories/`, `scripts/gen-surveys.mjs` → `gen-categories.mjs` (npm `gen:categories`),
  `SURVEY_INDEX`/`loadSurvey` → `CATEGORY_INDEX`/`loadCategory`, the `openSurvey`/`closeSurvey`/
  `renderSurveyBody` methods, and the `.survey-*` CSS classes. The curated category + volume eyebrows
  were updated too — "… Palette Survey · …" → "… Palette · …" and "… Survey · Vol N · …" → "… · Vol N
  · …" — so no "Survey" wording remains anywhere. No behavior change.
- **Tooling:** the CI smoke harness waits for Chrome's CDP endpoint more robustly — a two-phase poll
  (debugger-listening, then open-tab) with a 45 s budget and a diagnostic error, instead of a 15 s
  blind wait that intermittently failed cold runners with "Chrome CDP did not come up".

## [1.1.0] — 2026-06-25

Adds the **New-Palette derivation modal**, a derived **`neutral`** leading every survey preset,
opt-in **WCAG-safe on-colors**, and a **real-browser smoke test** in CI.

### 2026-06-25

#### Added
- **"New palette" derivation modal** — "+ Palette" now opens a large, **draggable** dialog (drag it
  by the header) that *derives* a palette instead of adding a default. Three modes: **Relative** (a
  color-theory relationship — extend / complete / contrast / bridge / anchor / recontextualize — that
  pivots on the **primary**, the first non-neutral palette you include via a swatch-only "Derive from"
  strip), **Environmental** (a neutral/environment tone: chroma-weighted mean hue + a clamped low
  chroma), and **Custom** (pick hue + chroma directly). Status palettes (success/warning/error/…) are
  excluded from the derivation context by default. The modal is **two-column**: a hue × chroma circle
  + chroma curve on the left, and the selection/picker plus a **live proposed-palette preview**
  (the Dominant + the Primary it derives against, and the generated ramp) on the right. (#64)
- **Survey presets lead with a derived `neutral`** — all 336 gallery presets now prepend a
  neutral/environment palette derived from their own character colors (the same rule as the modal's
  Environmental mode), baked into the survey generator so it travels with the data and shows on the
  tiles. 10 palettes/preset (was 9). (#64)
- **Opt-in WCAG-safe on-colors** (`onColorMode: "contrast"`) — re-points the accent on-colors to the
  end with the better contrast vs the accent fill, per mode (`550` light / `450` dark): `on{N}` flips
  050↔950, `on{N}Variant` 200↔800. A resolution-layer adjustment; the default stays **`"fixed"`** and
  the canonical role table is unchanged. (#62)
- **Download-All ships a `figma-aliased/` folder** — the Light/Dark/raw tokens with `aliasData`
  targeting the `Color Primitives` collection (the shape the plugin posts), so the plugin-free native
  import can be tested by hand. The default `figma/` stays resolved; the plugin stays the reliable
  path. (#63)

#### Changed
- The Figma **"Regroup"** action moved into the **Figma export tab** (beside the Binder plugin
  button), out of the drawer footer — it's a Figma-tab action, so it lives with the other Figma ones.
- **Tooling:** CI now runs a **real-browser smoke test** (headless Chrome over CDP, zero new deps) on
  every PR, driving gallery → survey → editor → export dialog. Node bumped to 22 (the smoke harness
  needs a global `WebSocket`). (#61)

## [1.0.0] — 2026-06-24

The first tagged release. Beyond the foundations (HCT/OKHSL engine, 37-role semantic layer, the
export formats, and the Figma generator + binder), 1.0.0 adds the **Palette Surveys** gallery, the
per-palette **Cusp pull**, durable Figma persistence, and a pass of naming/ordering/export polish.

### 2026-06-24

#### Added
- Opt-in **"Regroup Color Modes"** action (Figma, in the Export drawer): re-creates the `Color Modes`
  collection so it adopts the canonical grouped order (regular · containers · surfaces · scrims) —
  Figma keeps existing variables' positions on a normal apply. Destructive (re-created variables get
  new IDs, so bound layers detach), so it's opt-in + confirmed; the default apply stays idempotent.

#### Changed
- **Semantic token order regrouped** — the 37 roles emit as regular colors → containers → surfaces →
  scrims (scrims moved from the middle to the end), consistently across the Figma `Color Modes`
  variables, the `--c-*` CSS, and every export. Pure reorder; no color changes. (#57)
- **CSS raw vars drop the underscore** — `--c_{family}-{stop}` → `--c-{family}-{stop}`; raw and
  semantic now share the `--c-` prefix (raw names end in digits, semantic in a word, so no collision). (#58)
- `outlineVariant` references the `500-300` scrim (was `500-400`) — a subtler variant outline. (#59)

### 2026-06-23

#### Added
- **Per-palette "Cusp pull"** (perceptual mode) — a per-palette override of the global Vibrancy that
  nudges a palette's richest (max-chroma) stop toward stop 500, independent of the others (e.g. pulls
  yellow's vivid expression to the mid). Optional persisted field; perceptual-only inspector slider. (#55)

#### Changed
- **Figma collections renamed** — the generated variable collections are now **`Color Primitives`**
  (was `raw-colors`) and **`Color Modes`** (was `semantic-colors`). (#54)

#### Fixed
- **Figma gallery sets persist** via `figma.clientStorage` — the plugin iframe's opaque origin blocks
  `localStorage`, so "Your Palettes" silently vanished on reopen; now durable per-user. (#56)
- Export drawer spans full height; downloads save reliably (File System Access API + `<a download>`
  fallback) instead of navigating to the blob in embedded webviews; Mapping-tab scrim refs corrected
  (`scrim-weakest → 500-50`, etc.). (#55)

### 2026-06-22

#### Added
- **Palette Surveys** — the gallery is now a hub: *Your Palettes* (your saved sets) over a **Surveys**
  grid of **7 curated categories** (Architecture, Cuisine, Film, Literature, Music, Nature, Travel),
  each **12 volumes × 4 = 48** palettes (**336 total**). Each category is a page of volume-grouped,
  story-carrying palettes that open as an editable copy. Sourced from clean per-category JSON
  (`.claude/docs/spec/colors/surveys/*.json`) via `npm run gen:surveys`, and **lazy-loaded** per category
  (the web build code-splits each into its own chunk; the offline single-file build inlines them). (#51)
- **Sticky gallery masthead** — a pinned two/three-row header per screen: hub = title + search /
  description; a category = back-eyebrow + search / title / description, over a scrolling body. (#52)
- **Sun / moon / system color-scheme toggles** — the app chrome **and** the canvas preview each cycle
  ☀ light → 🌙 dark → ◐ system (icon-only), both defaulting to **system** (follow the OS). The canvas
  resolves system → OS preference and re-renders live when the OS scheme flips. (#52)

#### Changed
- The export drawer is now a native top-layer `<dialog>` (`showModal()`) — real `::backdrop`, focus
  trap, `inert` background, and Esc — replacing the hand-rolled scrim + `z-index` scaffolding. (#52)
- Header alignment + ordering: the analysis-rail and inspector pane headers match the canvas-header
  band (height, padding, bottom seam); the shell header reads undo · redo · scheme · new · export and
  the canvas header trailing group reads fit · scheme · zoom · + Palette (undo/redo/scheme/fit are now
  icon-only). (#52)
- Survey **volume headings** drop the redundant "Four palettes from …" lead-in and read as the
  evocative phrase (e.g. *"The great Russian novels, snow, candlelight, and dread"*). (#52)

#### Fixed
- Export dialog rendered two overlapping copy buttons; only one remains. (#52)
- Removed the stray canvas origin-dot. (#52)

### 2026-06-21

#### Added
- **Key colors** — pin exact brand colors per palette (a `dominant` + optional `supportive`), stored
  losslessly in **OKLCH**; the ramp is re-derived around them through the perceptual lens so a palette
  keeps its real source color while every other stop stays even. Shown as large inspector swatches and
  in the gallery tiles. (#49, #50)
- **Vibrancy** control — blends even-lightness toward the chroma-cusp anchoring so the palette's center
  reads vivid (notably for yellows). (#50)

#### Changed
- **`perceptual` is now the default** distribution mode everywhere. (#50)
- The export-format picker is a grouped **select** (grouped by destination), fixing the drawer-tab
  overflow as formats grew. (#48)

### 2026-06-20

#### Added
- **Tailwind v4** and **shadcn/ui** theme exports. (#47)
- Accessible primitive factories (button/switch/segmented/swatch/chip/field) extracted with an a11y
  pass, plus a drawer focus-trap. (#42, #45)

#### Changed
- Inspector gap-spacing refactor onto a shared geometry token. (#46)

### 2026-06-18

#### Added
- **Ramp distribution modes** — `even` (uniform CIELAB L\*), `perceptual` (uniform OKHSL lightness +
  gamut-proportional chroma), and `peak` (chroma-cusp anchored), with UX that hides controls that don't
  apply to the active mode and adds vivid-mids presets. (#38, #39)
- **OKHSL ↔ sRGB** engine module. (#36)
- **`relative-chroma`** mode — harmonize saturation across hues. (#33)
- A **chroma floor** to kill the near-white dead zone. (#41)
- Central inlined-SVG **icon registry** (Phosphor, offline). (#25)
- Gallery tile polish — palette-count + state tags moved into the preview, delete to top-right, an
  "updated" time tag. (#23, #24, #29)
- Product identity: renamed to **Color Tokens by NONOUN** / `nonoun-color-tokens`, with the NONOUN
  mark/favicon and the finished de-HCT rename. (#28, #31, #32)

#### Changed
- Canvas preview tints retuned (background 125/875, container 75/925, palette-container 150/850); click
  empty canvas to deselect. (#22, #26, #27)
- The Download-all archive is named `nonoun-color-tokens-{project}.zip`. (#35)
- A new palette ("+ Palette") resets all shaping config to neutral. (#34)

#### Fixed
- Removed a duplicate Contrast panel from the right-pane Inspector. (#37)
- A collapsed side pane no longer bleeds its cards into the canvas. (#21)

---

### Foundations

The engine (HCT/CAM16 tonal ramps, the 37-role semantic layer validated against the canonical
`.claude/docs/spec/data/role-table.json`, the export formats, and the Figma raw→semantic cascade), the
`<nonoun-color-tokens>` web component, the offline single-file build, and the Figma generator +
Semantic Binder plugins predate this changelog. See the git history for the full record.
