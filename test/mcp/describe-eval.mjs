#!/usr/bin/env node
// describe-eval.mjs — verifier for the PURE golden-description eval set + scorer (mcp/describe-eval.mjs,
// #375). No network — the real-model runner is a SEPARATE script (describe-eval-runner.mjs), deliberately
// not part of this test file or the npm test gate (LLM cost/flake, per the ticket's own acceptance).
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GOLDEN_EVALS, HUE_TOLERANCE, CHROMA_TOLERANCE, scoreBrief, scoreRun } from "../../mcp/describe-eval.mjs";
import { EXEMPLARS } from "../../mcp/describe-rubric.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// ── the golden set is genuinely derived from the exemplar corpus, not a second hand-typed dataset ──
ok(GOLDEN_EVALS.length === EXEMPLARS.filter((e) => Object.keys(e.families).length > 0).length, `GOLDEN_EVALS covers every exemplar that tagged at least one family (got ${GOLDEN_EVALS.length})`);
ok(GOLDEN_EVALS.length >= 10, `at least 10 golden entries exist (got ${GOLDEN_EVALS.length}) — the corpus is genuinely bundled, not a stub`);
{
  const g = GOLDEN_EVALS.find((x) => x.id === "ocean-drive-miami-deco");
  const e = EXEMPLARS.find((x) => x.id === "ocean-drive-miami-deco");
  ok(g && g.description === e.theme, "a golden entry's description is exactly the exemplar's own theme string (the same text a caller would send to generate_kit)");
  ok(g.bands.Primary.hue === e.families.Primary.hue && g.bands.Primary.chroma === e.families.Primary.chroma, "a golden entry's band is exactly the exemplar's own resolved family seed (not re-derived or approximated)");
  ok(!("colorName" in g.bands.Primary) && !("description" in g.bands.Primary), "a band carries only {hue, chroma} — not the exemplar's narrative fields, which the scorer never needs");
}

// ── scoreBrief: a perfect brief (the golden's own bands, verbatim) always passes ──
{
  const golden = GOLDEN_EVALS[0];
  const perfectBrief = { families: Object.fromEntries(Object.entries(golden.bands).map(([name, b]) => [name, { hue: b.hue, chroma: b.chroma }])) };
  const result = scoreBrief(golden, perfectBrief);
  ok(result.passed === true && result.misses.length === 0, `a brief matching the golden bands exactly passes with zero misses (got ${JSON.stringify(result)})`);
}

// ── scoreBrief: within tolerance passes, just outside fails, with the right reason ──
{
  const golden = GOLDEN_EVALS[0];
  const primaryBand = golden.bands.Primary;
  const withinBrief = { families: { ...Object.fromEntries(Object.entries(golden.bands).map(([n, b]) => [n, { hue: b.hue, chroma: b.chroma }])), Primary: { hue: primaryBand.hue + HUE_TOLERANCE - 1, chroma: primaryBand.chroma } } };
  ok(scoreBrief(golden, withinBrief).passed, `a hue just INSIDE the tolerance (±${HUE_TOLERANCE}°) still passes`);
  const exactBoundaryBrief = { families: { ...Object.fromEntries(Object.entries(golden.bands).map(([n, b]) => [n, { hue: b.hue, chroma: b.chroma }])), Primary: { hue: primaryBand.hue + HUE_TOLERANCE, chroma: primaryBand.chroma } } };
  ok(scoreBrief(golden, exactBoundaryBrief).passed, `a hue at EXACTLY the tolerance boundary (distance === ${HUE_TOLERANCE}) is inclusive — still passes, not just values strictly under it`);
  const outsideBrief = { families: { ...Object.fromEntries(Object.entries(golden.bands).map(([n, b]) => [n, { hue: b.hue, chroma: b.chroma }])), Primary: { hue: primaryBand.hue + HUE_TOLERANCE + 5, chroma: primaryBand.chroma } } };
  const result = scoreBrief(golden, outsideBrief);
  ok(!result.passed && result.misses.some((m) => m.family === "Primary" && m.reason === "hue"), `a hue just OUTSIDE the tolerance fails with reason "hue" for Primary (got ${JSON.stringify(result.misses)})`);
}
{
  // circular hue distance must wrap around 0/360 — a naive |a-b| would read hue 5 vs hue 355 as 350°
  // apart (a false "hue" miss) when it's actually only 10° apart, well within tolerance.
  const wraparoundGolden = { id: "synthetic-wraparound", description: "test", bands: { Primary: { hue: 5, chroma: 50 } } };
  const wraparoundBrief = { families: { Primary: { hue: 355, chroma: 50 } } };
  const result = scoreBrief(wraparoundGolden, wraparoundBrief);
  ok(result.passed, `hue 355 vs a golden hue of 5 is only 10° apart across the 0/360 wrap, well within tolerance — must pass, not fail on a naive |355-5|=350 miscalculation (got ${JSON.stringify(result)})`);
}
{
  const golden = GOLDEN_EVALS[0];
  const badChromaBrief = { families: { ...Object.fromEntries(Object.entries(golden.bands).map(([n, b]) => [n, { hue: b.hue, chroma: b.chroma }])), Primary: { hue: golden.bands.Primary.hue, chroma: Math.max(0, golden.bands.Primary.chroma - CHROMA_TOLERANCE - 5) } } };
  const result = scoreBrief(golden, badChromaBrief);
  ok(!result.passed && result.misses.some((m) => m.family === "Primary" && m.reason === "chroma"), `a chroma outside its tolerance fails with reason "chroma" (got ${JSON.stringify(result.misses)})`);
}

// ── scoreBrief: defensive reading — malformed/missing input degrades to misses, never throws ──
{
  const golden = GOLDEN_EVALS[0];
  let threw = false;
  let result;
  try { result = scoreBrief(golden, null); } catch { threw = true; }
  ok(!threw, "scoreBrief(golden, null) does not throw");
  ok(!result.passed && result.misses.length === Object.keys(golden.bands).length && result.misses.every((m) => m.reason === "missing"), `a null brief misses EVERY family with reason "missing" (got ${JSON.stringify(result.misses)})`);
}
{
  const golden = GOLDEN_EVALS[0];
  const partial = { families: { Primary: { hue: golden.bands.Primary.hue, chroma: golden.bands.Primary.chroma } } }; // only Primary given, others absent
  const result = scoreBrief(golden, partial);
  ok(!result.passed && result.misses.filter((m) => m.reason === "missing").length === Object.keys(golden.bands).length - 1, `a partial brief misses only the ABSENT families, not the one correctly given (got ${JSON.stringify(result.misses)})`);
}
{
  const golden = GOLDEN_EVALS[0];
  const noHue = { families: { ...Object.fromEntries(Object.entries(golden.bands).map(([n, b]) => [n, { hue: b.hue, chroma: b.chroma }])), Primary: { chroma: golden.bands.Primary.chroma } } }; // hue field absent, not just wrong
  const result = scoreBrief(golden, noHue);
  ok(result.misses.some((m) => m.family === "Primary" && m.reason === "hue-missing"), `a family entry present but missing its hue field reports reason "hue-missing", distinct from a wrong-value "hue" miss (got ${JSON.stringify(result.misses)})`);
}

// ── scoreRun: aggregates a whole run, matches by id, tolerates an unknown id ──
{
  const results = GOLDEN_EVALS.slice(0, 3).map((g) => ({ id: g.id, brief: { families: Object.fromEntries(Object.entries(g.bands).map(([n, b]) => [n, { hue: b.hue, chroma: b.chroma }])) } } ));
  const summary = scoreRun(results);
  ok(summary.total === 3 && summary.passCount === 3, `scoreRun aggregates correctly over 3 perfect briefs (got ${JSON.stringify({ total: summary.total, passCount: summary.passCount })})`);
}
{
  const summary = scoreRun([{ id: "not-a-real-golden-id", brief: {} }]);
  ok(summary.total === 1 && summary.passCount === 0 && summary.scored[0].misses[0].reason === "unknown-golden-id", "scoreRun degrades gracefully for an id with no matching golden entry, instead of throwing");
}

// ── the runner (a REAL process, describe-eval-runner.mjs) gracefully skips — exit 0, no network call —
// when no provider key is present. Genuinely testable without a real key or network access: the skip
// path returns before ever calling fetch. This is the regression guard for "CI secret custody is still
// open" (#375's own Scope/Open) never turning into a red build the moment the workflow that invokes this
// script runs before a key has been added.
{
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const out = execFileSync("node", [resolve(ROOT, "mcp/describe-eval-runner.mjs")], { env, encoding: "utf8" });
  ok(/skipped.*no ANTHROPIC_API_KEY/i.test(out), `the runner, with no API key in its environment, prints a clear skip message (got: ${out.trim()})`);
}

if (fails.length) { console.error(`describe-eval FAIL (${fails.length}):\n  ` + fails.join("\n  ")); process.exit(1); }
console.log("describe-eval PASS — GOLDEN_EVALS (derived from the real exemplar corpus, not a second dataset) + scoreBrief/scoreRun (tolerance bands, defensive reads, no throws) + the runner's graceful no-key skip");
process.exit(0);
