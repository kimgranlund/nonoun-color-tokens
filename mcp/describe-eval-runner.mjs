#!/usr/bin/env node
// describe-eval-runner.mjs — the LIVE-MODEL half of the golden-description eval (#375). Calls a real
// provider (Anthropic, forced tool-use against the PaletteBrief schema) with the SAME briefing payload
// generate_kit({description}) would return, for every entry in GOLDEN_EVALS, then scores the result with
// the pure scorer in describe-eval.mjs. Deliberately NOT part of `npm test` or the PR-gating CI workflow —
// this makes real network calls with real cost and real model nondeterminism; the ticket's own acceptance
// keeps it scheduled/manual, never per-PR gating.
//
// Usage: ANTHROPIC_API_KEY=... node mcp/describe-eval-runner.mjs [--model=claude-haiku-4-5-20251001]
// No API key -> prints a clear "skipped" message and exits 0 (never a hard failure on a missing key —
// CI secret custody is this ticket's own stated open item; the workflow that invokes this is safe to wire
// up before that decision is made, since it degrades to a no-op report instead of a red build).

import { generateKitTool } from "./describe-mcp-core.mjs";
import { GOLDEN_EVALS, scoreRun } from "./describe-eval.mjs";

// DEFAULT_MODEL — matches ADR-021's own "Haiku-class" framing for the hosted flavor's demoted
// interpreter: a cheaper/faster tier, not the caller's own (agent) model. Override with --model= for a
// different provider tier without editing this file.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";

function modelFromArgv(argv) {
  const flag = argv.find((a) => a.startsWith("--model="));
  return flag ? flag.slice("--model=".length) : DEFAULT_MODEL;
}

// interpretOne(apiKey, model, description, briefing) → the model's PaletteBrief (a plain object), via
// FORCED tool-use against the exact schema generate_kit({description}) already returns — output is
// guaranteed schema-shaped, never free text to re-parse (mirrors #377's own planned describe_palette
// design, spec §8 item 2, so this eval genuinely tests what that hosted path will do).
export async function interpretOne(apiKey, model, description, briefing) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: `${briefing.rubric}\n\n${briefing.research}`,
      messages: [{ role: "user", content: `Description: ${description}\n\nConstruct a PaletteBrief for this theme.` }],
      tools: [{ name: "submit_brief", description: "Submit the constructed PaletteBrief.", input_schema: briefing.schema }],
      tool_choice: { type: "tool", name: "submit_brief" },
    }),
  });
  if (!res.ok) throw new Error(`provider error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const toolUse = (json.content || []).find((b) => b.type === "tool_use" && b.name === "submit_brief");
  if (!toolUse) throw new Error(`no tool_use block in the provider response: ${JSON.stringify(json)}`);
  return toolUse.input;
}

// runEval(apiKey, model) → { summary, elapsedMs }. Exported so a future caller (e.g. a hosted-flavor
// pre-launch smoke check) can invoke the SAME logic without going through argv/process.exit.
export async function runEval(apiKey, model) {
  const briefing = generateKitTool({}); // {rubric, schema, exemplars, research, instructions} — the
  // interpretOne below uses this call's rubric/research/schema VERBATIM (a rubric regression here is a
  // rubric regression a real caller would hit) but deliberately does NOT forward briefing.exemplars into
  // the model's system prompt: the golden answer key IS an exemplar's own resolved family seed, so
  // handing the model a matching few-shot example would leak the answer and turn this into a
  // memorization test rather than a genuine interpretation eval.
  const started = Date.now();
  const results = [];
  for (const golden of GOLDEN_EVALS) {
    try {
      const brief = await interpretOne(apiKey, model, golden.description, briefing);
      results.push({ id: golden.id, brief });
    } catch (e) {
      results.push({ id: golden.id, brief: null, error: e.message });
    }
  }
  return { summary: scoreRun(results), elapsedMs: Date.now() - started };
}

function printReport(model, summary) {
  console.log(`[describe-eval] model=${model} — ${summary.passCount}/${summary.total} passed`);
  for (const s of summary.scored) {
    if (s.passed) { console.log(`  ✓ ${s.id}`); continue; }
    console.log(`  ✗ ${s.id}`);
    for (const m of s.misses) {
      const detail = m.got !== undefined ? ` (got ${m.got}, want ${m.want}, off by ${m.distance})` : m.want !== undefined ? ` (want ${JSON.stringify(m.want)})` : "";
      console.log(`      - ${m.family ?? "(entry)"}: ${m.reason}${detail}`);
    }
  }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[describe-eval] skipped — no ANTHROPIC_API_KEY set. This eval calls a real provider and is optional infra (scheduled/manual, per #375's own acceptance), not a build gate. Set the key to run it for real.");
    process.exit(0);
  }
  const model = modelFromArgv(process.argv.slice(2));
  const { summary } = await runEval(apiKey, model);
  printReport(model, summary);
  // a non-zero exit here only affects THIS script's own run status (visible in the scheduled/manual
  // workflow's history) — it is never wired into the PR-gating CI, so a rubric regression is visible
  // without blocking anyone's merge.
  process.exit(summary.passCount === summary.total ? 0 : 1);
}

// only run main() when invoked directly (`node describe-eval-runner.mjs`), not when imported for its
// exported functions (interpretOne/runEval) by a test or another script.
if (import.meta.url === `file://${process.argv[1]}`) main();
