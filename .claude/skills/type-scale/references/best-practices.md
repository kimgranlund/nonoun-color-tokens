## Best practices — changing the typography engine

The non-obvious do/don'ts (each a real trap in this engine), then a worked walkthrough from the
2026-07-13 fixed-size-table rewrite.

### Derive, never hand-author a SCALED size

- **No magic numbers for a SCALED output.** `bodyBase`/`modeFactor` scale the fixed `SIZES` table; never
  paste a resolved px size into a treatment's knobs to "fix" a scaled or compressed value — retune the
  voice's `weight`/`leading`/`trackingEm` knob instead, or the fixed literal itself in `SIZES` if the
  DESIGNED (unscaled) size is actually wrong.
- **The fixed size table (`SIZES`) is the one exception to "derive, don't hand-author."** Since 2026-07-13
  every voice's SM/MD/LG is a literal px value, shared across all 5 treatments — this IS the hand-authored
  source of truth now, not a modular-scale byproduct. Changing a voice's DESIGNED size means editing
  `SIZES`, not inventing a per-treatment override.
- **Resize with `bodyBase`, not individual literals.** `factor = bodyBase / 16` scales the WHOLE fixed
  table together. Bumping one voice's literal in `SIZES` to "make it bigger" desyncs every treatment at
  once (the table is shared) — that's a real design change, not a per-kit resize; per-kit resizing is
  `bodyBase`.
- **An unscaled size must pass through EXACT, never re-snapped.** The nice-number ladder only engages when
  `factor !== 1` or a breakpoint `compress` is active — a hand-authored literal (120, 34, …) must reach the
  emitted output byte-for-byte when nothing is scaling it. Reintroducing an unconditional `niceSize()` call
  would silently re-round already-nice hand-authored numbers (120→128) for no reason — this shipped once
  and was fixed as the 2026-07-13 rewrite's own regression test.
- **Keep tracking optical (an em coefficient).** `trackingEm` × the DERIVED (scaled/compressed) size — so
  tracking grows with scale, not just with the raw literal. Don't switch to a flat px value.
- **Use the fixed leading constants**, uniform across treatments (Display **0.8**, heading-family
  1.125, prose 1.4–1.5, single-line control text 1.0) — see `makeVoices`'s own header comment for the
  full table. They're the design intent; retune a per-voice `*Lead` knob only for a deliberate character
  exception, and prefer the self-documenting percent-string form (`"112.5%"`) over a raw decimal when
  authoring an override — `parseRatio` accepts either.

### Body-class core weights must stay ≤450 (the snap-boundary trap)

- **`Body`, `Body-mono`, `Label`, `Label-mono`, `Tiny`, `Tiny-mono`, `Lead`'s CORE weight defaults sit at
  440 — not 400, not 460/480/500.** The nearest-ladder-stop snap (`weightNameFor`) rounds a core weight to
  its closest 100-multiple; 440 snaps to Regular(400), but a core at 460 or above snaps to Medium(500) —
  so a style whose Figma label says "regular •" would silently RENDER the Medium face. This is a real
  defect class that shipped once (found live against BZZR): don't "round up" a body-class core weight past
  450 for a slight optical bump without checking which face it resolves to. Full model:
  `references/weight-ladders-and-labels.md`.

### The font-family QUOTING guard (the Safari trap)

- **Always emit family names QUOTED** (`--font-{role}: '{family}'`, and now also `--font-voice-{voice}` per
  voice via `resolvedFontFor`). A name with a digit — `Source Serif 4`, `Inter Tight` — is invalid
  *unquoted* in a strict CSS parser, and **Safari drops the entire declaration** → the specimen renders in
  the fallback. Chrome is forgiving, so the smoke (Chrome-only) stays green while Safari is broken (see the
  smoke-is-Chrome-only-Safari-blind-spot memory). The verifier pins `typeTokensCSS(luxury)` (which uses
  `Source Serif 4`) contains `--font-display: 'Source Serif 4'`. If you refactor the emitter, keep the
  quotes on BOTH the role-level and voice-level font props.

### Case is a per-treatment decision

- **Don't blanket-force Display to UPPERCASE.** Display is title/sentence case in four of five treatments;
  ONLY Brutalist/`statement` opts in (via `dTransform:"uppercase"`). The test asserts *exactly one*
  treatment sets an uppercase Display. The two standing caps voices are Sub-heading and Kicker (hardcoded
  `"uppercase"` in `makeVoices`), and they track POSITIVE; Display caps (Brutalist) track NEGATIVE. Don't
  swap those tracking signs.

### Treatments + voices come as complete sets

- **A new treatment must pass the full `fonts` palette** (`display/heading/body/ui/mono` — five roles) and
  call `makeVoices` so all thirteen voices resolve — the test pins every treatment has them + `fonts`, and
  `roleOf` needs every role's family present (note `technical` + `editorial` point `fonts.ui` at JetBrains
  Mono — `ui` and `mono` can share a family). Supply `note` too; the UI specimen reads it. A treatment
  differs in CHARACTER only — never add a per-treatment size/ratio knob back in; that's the exact thing
  the 2026-07-13 rewrite removed.
- **A new voice group means a new `cat(...)` line in `makeVoices`** (plus a `SIZES` entry, unless it
  aliases an existing voice's triplet) — its role flows from `cat`'s first arg into `roleOf` automatically,
  and the emitters map over `categories`, so CSS/DTCG/Figma tokens emit for free. But a voice count is
  hardcoded in several places that DON'T auto-flow, and missing one is a silent break:
  - the **`persist.js` VOICES allowlist** — the one FUNCTIONAL landmine: a voice absent here has its
    per-voice overrides **silently dropped on hydrate** (the allowlist must track `makeVoices`'s voices);
  - the **`styles.css` `.ty-s0…N` series colours** — one per voice, in order (the analysis-chart strokes);
  - the **count literals** in `test/engine/type.mjs` (`GROUPS`, the "13 voices" / "39 steps" asserts) and
    `test/ui/headless-boot.mjs` (**39 steps / 13 groups** — 13 voices × the uniform 3-step ramp);
  - the **`test/smoke/smoke.mjs`** Typography-section count — **Chrome-only, so `npm test` won't catch
    it; only CI's smoke leg does** (the classic Safari-blind-spot trap in reverse — a green local gate can
    still red the smoke leg on a stale count);
  - `docs/reference/typography/README.md`'s voice table and the `TYPE_SPECIMENS`/`SHORT` specimen maps.

  There is NO code-enforced type answer-key (unlike colour's `role-table.json`) — the consumption plugin's
  `voice-parity.mjs` auto-derives the voice list from the live engine, so the guard is the tests + these
  hand-kept lists, not a table. Adding (or renaming) a voice is a taxonomy change, not just code.

### The fonts are a manual, two-ended chain

- **`src/ui/type-fonts.js` is generated — never hand-edit it.** Regenerate with `npm run gen:type-fonts`.
- **It is NOT in `build` or `test`** (`package.json` — neither script calls `gen:type-fonts`). Forgetting to
  run it after a font change leaves the old embedded set; the new face renders in the fallback (and the
  smoke won't catch it — fonts aren't asserted). After running it, COMMIT the regenerated `type-fonts.js`.
- **Wire a new font at BOTH ends:** add it to the treatment's `fonts` AND to `scripts/gen-type-fonts.mjs#
  FAMILIES` (name + the variable `wght` axis, e.g. `wght@400..900`). Only-`fonts` → no embedded woff2 →
  fallback render. Only-`FAMILIES` → embedded but unused. Then regenerate + commit.

### Pure + deterministic

- `type.mjs` is pure, no DOM, no RNG, no clock. `round()` in type.mjs is the only dp-rounding helper; keep
  `letterSpacing` at 2 dp and sizes integer. Same config → identical tokens (the emitters are deterministic
  by construction — pinned by an explicit determinism assert on the auto-populated sibling weights too).

## Worked walkthrough — the 2026-07-13 fixed-size-table rewrite (condensed)

The pattern behind moving from a modular scale to a hand-authored fixed table:

1. **Decided the fixed table beats a shared ratio.** Five treatments deriving size from their own
   `base × ratio^n` meant subtle unintended drift between treatments at the same nominal step. Google's
   own Material 3 approach (one fixed scale, theme varies styling only) was the model: hand-author
   `SIZES[voice] = [SM, MD, LG]` once, shared by all treatments.
2. **Kept `bodyBase` as the ONE resize lever** (`factor = bodyBase/16`) so the whole fixed table still
   scales together — the design changed WHAT gets derived (a literal table instead of a modular formula),
   not the resize mechanism.
3. **Added the "unscaled passes through exact" guard.** The nice-number ladder existed to make a
   MODULAR-scale output land on familiar numbers; applying it unconditionally to an already-hand-authored
   literal would silently re-round it (120→128). Gated the quantizer on `factor !== 1 || compress` instead.
4. **Retired per-voice `ratio`/`steps` entirely** — every voice now rides the uniform SM/MD/LG ramp; the
   old 3/5/8-step split (`STEPS_3`/`STEPS_5`/`STEPS_UI`) had no meaning once size stopped deriving from an
   exponent.
5. **Validated** — `node test/engine/type.mjs` (green: 13 voices × the uniform 3-step ramp, `roleOf`, the
   box/prose split, the fixed-size-table exact-passthrough assert, the nice-ladder-only-when-scaled assert,
   the quoting guard, DTCG composite, sibling weights, per-voice font overrides — prints `type PASS`), then
   `npm test`. For a font change, also ran `npm run gen:type-fonts`, committed `src/ui/type-fonts.js`, and
   eyeballed the specimen in Safari (the smoke is Chrome-only).
