// describe-eval.mjs — the PURE golden-description eval set + scorer (#375). Interpretation quality (the
// words→brief step) can't be parity-gated mechanically — it varies by calling model — so this gates what
// CAN be measured: does a model-produced brief land its per-family hue/chroma in the right neighborhood
// for a known theme. "Golden" here means the SAME 15 exemplars #370's rubric already bundles (mcp/
// describe-rubric.mjs's EXEMPLARS) — not a second, drift-prone dataset. Each exemplar's own `families`
// object (already computed via hexToOklch+seedFromKeyColor from a REAL corpus hex, #370) is treated as
// the answer key: the exact seed a perfect interpretation of that theme would produce. This module is
// pure and network-free — the network call (a real provider interpreting a description) lives in the
// separate describe-eval-runner.mjs, which imports this file's data + scorer.

import { EXEMPLARS } from "./describe-rubric.mjs";

// HUE_TOLERANCE / CHROMA_TOLERANCE — the band half-width around each golden family's exact seed. Wide
// enough that a DIFFERENT reasonable referent for the same theme (e.g. a different real hex naming the
// same color family) still passes — this evals INTERPRETATION DIRECTION, not exact-hex recall — narrow
// enough that a rubric regression (the wrong hue family entirely, or a wildly over/under-chroma read)
// still fails. Centered on the chroma vocabulary ladder's own step size (#370: pastel~25/muted~40/
// vivid~80/neon~100 — steps of ~15-20) and a hue-wheel "same named color family" width (~30°).
export const HUE_TOLERANCE = 30;
export const CHROMA_TOLERANCE = 20;

// GOLDEN_EVALS — one entry per exemplar that tagged at least one family. `description` is the exact
// theme string a caller would send to generate_kit({description}); `bands[family]` is the acceptable
// {hue, chroma} neighborhood a model-produced brief's SAME family should land in.
export const GOLDEN_EVALS = EXEMPLARS.filter((e) => Object.keys(e.families).length > 0).map((e) => ({
  id: e.id,
  description: e.theme,
  bands: Object.fromEntries(Object.entries(e.families).map(([name, f]) => [name, { hue: f.hue, chroma: f.chroma }])),
}));

const hueDist = (a, b) => { const d = Math.abs(((a % 360) + 360) % 360 - ((b % 360) + 360) % 360) % 360; return d > 180 ? 360 - d : d; };

// scoreBrief(golden, brief) → { misses: [...], passed: boolean }. `brief` is whatever a model (or a test)
// produced for `golden.description` — a plain object shaped like a PaletteBrief (§3), read defensively:
// a missing/malformed families object or family entry is a MISS, never a thrown error, so one bad model
// response degrades a report entry instead of crashing the whole eval run.
export function scoreBrief(golden, brief) {
  const misses = [];
  const families = (brief && typeof brief === "object" && brief.families && typeof brief.families === "object") ? brief.families : {};
  for (const [family, band] of Object.entries(golden.bands)) {
    const seed = families[family];
    if (!seed || typeof seed !== "object") { misses.push({ family, reason: "missing", want: band }); continue; }
    if (typeof seed.hue === "number") {
      const dist = hueDist(seed.hue, band.hue);
      if (dist > HUE_TOLERANCE) misses.push({ family, reason: "hue", got: seed.hue, want: band.hue, distance: Math.round(dist) });
    } else {
      misses.push({ family, reason: "hue-missing", want: band.hue });
    }
    if (typeof seed.chroma === "number") {
      const diff = Math.abs(seed.chroma - band.chroma);
      if (diff > CHROMA_TOLERANCE) misses.push({ family, reason: "chroma", got: seed.chroma, want: band.chroma, distance: Math.round(diff) });
    } else {
      misses.push({ family, reason: "chroma-missing", want: band.chroma });
    }
  }
  return { misses, passed: misses.length === 0 };
}

// scoreRun(results) → a summary over a whole eval run: results = [{id, brief}] (one per GOLDEN_EVALS
// entry, in the same order or matched by id). Convenience for the runner + tests — not required for a
// caller who only wants scoreBrief on one entry.
export function scoreRun(results) {
  const byId = new Map(GOLDEN_EVALS.map((g) => [g.id, g]));
  const scored = results.map(({ id, brief }) => {
    const golden = byId.get(id);
    if (!golden) return { id, passed: false, misses: [{ family: null, reason: "unknown-golden-id" }] };
    return { id, ...scoreBrief(golden, brief) };
  });
  return { scored, passCount: scored.filter((s) => s.passed).length, total: scored.length };
}
