<!-- voice-check: rulebook — cites drifted values as cautionary examples; the checker exempts it -->
# Fact sheet — the pinned numbers

The single source for every count, name, price, and claim in customer-facing copy. **Copy never
invents or "remembers" a number — it cites this sheet, and this sheet cites the code.** A drifted fact
here is a defect; update it in the same change that alters the product (the store copy's 53-role era
is the cautionary tale — the product had moved to 59 while the copy still said 53).

| Fact | Value | Verify at |
|---|---|---|
| Product name | **Ultimate Tokens** — every mention; there is no longer form | `index.html` `<title>` |
| Maker | **none** — the product is unattributed; no "by" line, no maker brand, no monogram | `test/repo/branding.mjs` (gated) |
| Internal id (kebab form; never customer-facing) | `ultimate-tokens` | `package.json` |
| Live app | `https://kimgranlund.github.io/ultimate-tokens/` (no custom domain) | README badge |
| Semantic roles per palette | **53**, resolved for Light + Dark | `docs/reference/data/role-table.json` `rolesPerPalette` |
| Default palettes | **8** | `role-table.json` `defaults` |
| Tonal ramp | **050–950** (19 display stops; 25 in exports with the extra stops) | `src/engine/tonal.js` `STOPS`/`EXPORT_STOPS` |
| Color model | **OKLCH-native** source of truth; HCT/CAM16 + OKHSL modeling; HEX derived for output only | `src/engine/` |
| Distribution modes | even · **perceptual (default)** · peak, plus vibrancy, relative-chroma, chroma floor | `src/engine/tonal.js` |
| Composing systems | **3** — Color · Typography · Geometry (one document, one editor) | `CLAUDE.md` |
| Type voices | **15** — Display · Headline · Sub-heading · Title · Sub-title · Lead · Body · Body-mono · Label · Label-mono · Kicker · Tiny · Tiny-mono · UI-control · UI-widget, each a fixed 3-step SM/MD/LG ramp shared across every treatment | `src/engine/type.mjs` `makeVoices` |
| Type treatments | **5** — Product / Lifestyle · Luxury / Premium · Editorial / Magazine · Technical / Data · Brutalist / Statement | `src/engine/type.mjs` `TYPE_TREATMENTS` |
| Geometry | size ramp **XS–2XL** on one centering law: edge padding = (height − glyph) / 2 | `src/engine/geometry.mjs` |
| Geometry treatments | **5** — Comfortable · Compact / Dense · Spacious / Airy · Touch / Mobile · Pill / Rounded | `src/engine/geometry.mjs` `GEOMETRY_TREATMENTS` |
| Color Categories | **7** categories (Architecture · Cuisine · Film · Literature · Music · Nature · Travel), 12 volumes × 4 = **48 palettes each, 336 total**, each sourced + storied | `src/ui/categories/` |
| Export formats | CSS custom properties (HEX or OKLCH) · Tailwind v4 · shadcn/ui · DTCG · JSON · Figma variables · Figma UI3 (Material) · Design System export (`tokens.json` + `DESIGN.md`, three AI-design-tool targets) · re-importable Config · Download-all `.zip` | `src/engine/exports.js` |
| Export settings | CSS units px / rem / em · naming scheme (Ultimate / Material 3 / Custom) · per-system Include toggles | Settings → Export |
| Token naming scheme | **3 schemes**, one convention across colour · type · geometry — **Ultimate** (default: `--c-*` · `--type-*` · `--size-*`) · **Material 3-style** (`--md-sys-color-*` · `--md-sys-typescale-*` · `--md-sys-*`, extended with our roles) · **Custom** `--{brand}-*` root | Settings → Export ("Naming convention") |
| Figma plugin | **free, fully offline** (`networkAccess: none`); binds semantic variables with a raw→semantic cascade + breakpoint modes; on apply also creates variable-bound **style swatches** (opt-out — see below) | `figma/plugin/manifest.json` |
| Figma styles | On "Apply → Figma", **style swatches bound to the variables** — opt-out via the **"Styles"** toggle in the export drawer (default on). A **paint style per semantic role per palette family** (`Primary/onPrimary`), grouped into `scrims/` + `surfaces/` sub-folders, each bound to its Color Modes variable so it tracks **Light + Dark** automatically — **424** on the default 8-palette kit (53 × 8). **Text styles per type voice × step** (`Display/lg`, largest→smallest in the panel), bound to the Typography + Font Primitives variables, with literal leading/tracking. **Body + Label additionally get a `/single` sibling per step/weight** (`Body/md/single`) — a 1.0-leading, single-line variant alongside the normal reading style. Plugin-created styles are updated/pruned on re-apply; the user's own styles are never touched. Download-all adds `figma/styles.plan.json` (a machine-readable plan) | `figma/binder/style-plan.mjs`, `figma/plugin/code.js` |
| Sibling weights | Per type voice, **3** named weight variants around the core, auto-populated by default for every voice (e.g. core Bold 700 → **Extra-bold 800 · Semi-bold 600 · Medium 500**), user-editable in the Typography panel. Each sibling becomes a Figma text style (`Body/md/semi-bold`), a CSS custom property, a DTCG `fontWeight` token, and a Figma weight primitive; the core itself gets a dot-prefixed style too (`Body/md/• Regular`) | `src/engine/type.mjs` `WEIGHT_NAMES`, `siblingWeightDefaults` |
| Brand-Kit MCP | zero-dependency stdio server download, pre-filled with your tokens, for Claude Code / Cursor / any MCP agent; **hosted** endpoint is a Pro feature (not yet live — never market it as live) | `mcp/` |
| Ultimate Tokens Claude plugin | installable Claude Code plugin, **free + MIT**, that teaches a coding agent to CONSUME an exported kit in its own project — 3 skills (**color-tokens** · **typography-tokens** · **geometry-tokens**) + the **`token-integrator`** agent; parity-gated against the engines in `npm test`. Install: `/plugin marketplace add https://unpkg.com/@ultimate-tokens/claude/marketplace.json` → `/plugin install ultimate-tokens` | `plugin/ultimate-tokens/` |
| Design system export | **free** on every tier — one canonical core (a universal-dialect `DESIGN.md` generation prompt + a `tokens.json` carrier: light + dark colour role set + type / spacing / radii, on-colours measured WCAG-AA, OKLCH payload) emitted as **three platform targets**, one folder each in the Download-all `.zip`: **`design-system-for-claude-code/`** (10 files — `DESIGN.md` · `tokens.json` · `components/*.html` **7** preview cards · `README.md`; the Claude-facing target for both `claude.ai/design` (Anthropic's surface where a vision-capable Claude generates on-brand UI) and Claude Code) · **`design-system-for-google-stitch/`** (2 files — a byte-identical `DESIGN.md` + `README.md`; for **Google Stitch**, Google's generative-UI tool) · **`design-system-for-figma-make/`** (9 files — a routed `guidelines/` tree of compiled shadcn + `README.md`; for **Figma Make**, React + Tailwind + shadcn/ui). The `DESIGN.md` is a **10-section** generation prompt carrying the kit's own guardrails. In-app it surfaces as a **"Design System"** Export-drawer group (tokens.json + DESIGN.md tabs); the three-folder split appears in Download-all, not as three drawer groups | `src/engine/exports.js` `exportDesignSystemBundle` / `exportDesignSystemStitchBundle` / `exportDesignSystemMakeBundle` |
| Dependencies | **zero** runtime dependencies; ships as one self-contained file that runs offline | `package.json`, `dist/ultimate-tokens.html` |
| Privacy | local-first: your browser + your Figma file; the **only network call is the license check** | `src/main.ts` |
| Free tier | full generator · **2 brand kits** · core exports · base treatments · offline Figma plugin · MCP download · design-system export | `src/engine/flags.js` |
| Pro | **$39/year, per user** — unlimited kits · complete export suite · advanced treatments · hosted MCP (when live) · updates + support | store, `flags.js` |
| Studio | **$149/year for 5 seats**, +**$19/seat/year** — Pro for a team, one account | store |
| Refund | **14 days**, full, no questions | store policy |
| Store | Lemon Squeezy (`ultimate-tokens.lemonsqueezy.com`) | store-copy.md |
| Support channel | **GitHub Issues** on `kimgranlund/ultimate-tokens` — there is no support inbox (decided 2026-07-09) | store-copy.md placeholders |
| Licensing direction | email-bound identity: unlimited devices for the key's owner; Studio seats become named emails (Phase 2) — customer copy describes SHIPPED behavior until each phase lands | `docs/site/licensing-identity-spec.md` |
| Dogfooding | the app chrome runs on the very tokens it generates | README |

**Rules of use**

1. Copy cites these values verbatim — "53 semantic roles" (per `role-table.json` `rolesPerPalette`),
   never "over 50", never a remembered 59 (the pre-trim count, before the six `-variant` state roles came out).
2. A feature behind a flag that isn't live (hosted MCP; enforcement pre-flip) is **never marketed as
   available**; "when live" phrasing or omission only.
3. When the product changes a value, update this sheet **in the same change**, then sweep **every
   customer-facing surface** — not just this corpus: `grep -rn "<old>" docs/marketing/
   README.md index.html src/ui/app.js` (the 53-defect lived *outside* the corpus; the sweep that only
   covers the corpus recreates it).
4. **Deployed surfaces don't grep.** Copy already pasted into external dashboards must be re-pasted
   after a fact changes. The checklist: the **Lemon Squeezy store** (product pages, checkout, emails),
   the **Figma Community listing**, any social bios/pinned posts. Track the re-paste in the same PR
   that changes the fact, as an unchecked box the human closes.
