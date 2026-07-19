// describe-mcp-core.mjs — the PURE, transport-agnostic MCP surface for the describe-palette generator
// (#371). Mirrors mcp/brand-kit-core.mjs's shape (buildSurface + handle, the same JSON-RPC 2.0 dispatch)
// so the eventual merge with the read-only brand-kit surface (#374) is a straightforward concat, not a
// redesign — but is NOT shared code with it; merging the two dispatchers is #374's explicit job, not
// this module's, so this stays self-contained like brand-kit-core.mjs already is.
//
// Exposes exactly ONE tool — generate_kit — the self-teaching two-step protocol (spec §5): MCP prompts
// are unreliable delivery (uneven host support; agents call tools directly without reading prompts), so
// the TOOL RESULT itself teaches. { description } returns a briefing payload and NEVER generates — the
// method is guaranteed in context at the moment of use, on any host, with zero installed skills. { brief }
// generates deterministically via describe-kit-core.mjs. No server-side LLM anywhere in this flavor — the
// calling agent is the interpreter (spec §1's local-flavor constraint).

import { generateKit, PALETTE_BRIEF_SCHEMA, FAMILY_NAMES } from "./describe-kit-core.mjs";
import { RUBRIC, RESEARCH_TIER_NOTE, ROUND_TRIP_INSTRUCTIONS, retrieveExemplars } from "./describe-rubric.mjs";
import { contrastRatio, slug } from "../src/ui/model.mjs";
import { swatchBoardImageBlock } from "./png-swatch-board.mjs";

export const PROTOCOL_VERSION = "2025-06-18";
export const SERVER = { name: "ultimate-tokens-describe-palette", version: "0.1.0" };

// CONTRAST_MIN (#373, spec §6.3) — the prime-vs-on-prime contrast floor. 3.0, not the stricter 4.5
// (WCAG AA normal text): the app's own "fixed" onColorMode (ADR-003) targets large-text/UI-component
// contrast (WCAG's 3:1 floor for bold button-scale text), not body text — the DEFAULT document's own
// dark-mode ratios cluster at 3.0-3.4 by design. A 4.5 floor would fire on every unmodified default kit,
// defeating the "actionable signal" goal (spec §6.3) with noise instead of a real problem. A fine sweep of
// the brief's exposed per-family parameters (hue/chroma/skew/lift) found a worst reachable case of
// ~3.028 (hue 150, chroma 100, skew -100, lift -40) — THIN headroom, not the wide margin it might sound
// like: this floor is a genuine safety net for the on-color system's own edge, one already close to being
// exercised by legal input, not a check with room to spare. `test/mcp/describe-mcp-core.mjs` pins that
// exact worst-known config as a regression guard — a future engine retune that pushes it under 3.0 must
// fail a test, not surface silently.
export const CONTRAST_MIN = 3.0;
// CHROMA_BUDGET_AVG_THRESHOLD (#373) — flags a kit whose 8 families average NEAR peak chroma (the
// rubric's "vivid" tier, #370, starts at ~80). The app's own DEFAULT document already averages ~63
// (role-table.json's own convention mixes vivid brand accents with muted supporting/status families) —
// so 80 only fires when a theme has pushed MOST families deliberately high, not on ordinary input.
export const CHROMA_BUDGET_AVG_THRESHOLD = 80;

// contrastLint(kit) — one `contrast` entry per palette whose prime/on-prime pairing (light OR dark) falls
// under CONTRAST_MIN. Silent when everything clears the floor — lint only surfaces divergences worth
// acting on (the SAME philosophy as clamped/status-distinctness), not a routine "everything's fine" wall.
export function contrastLint(kit) {
  const hexToRgb = (hex) => [0, 2, 4].map((i) => parseInt(String(hex).slice(1 + i, 3 + i), 16));
  const out = [];
  for (const p of kit.palettes || []) {
    const key = slug(p.name);
    const roles = kit.roles && kit.roles[key];
    const prime = roles && roles[key];
    const onKey = "on" + key.charAt(0).toUpperCase() + key.slice(1);
    const on = roles && roles[onKey];
    if (!prime || !on) continue;
    const lightRatio = contrastRatio(hexToRgb(prime.light), hexToRgb(on.light));
    const darkRatio = contrastRatio(hexToRgb(prime.dark), hexToRgb(on.dark));
    const worst = Math.min(lightRatio, darkRatio);
    if (worst < CONTRAST_MIN) {
      out.push({ level: "warn", code: "contrast", family: p.name, message: `${p.name}: its on-color contrast falls under ${CONTRAST_MIN}:1 (light ${lightRatio.toFixed(2)}:1, dark ${darkRatio.toFixed(2)}:1) — text on this accent may be hard to read.` });
    }
  }
  return out;
}

// chromaBudgetLint(doc) — ONE advisory (not per-family) when the 8 families' AVERAGE chroma runs near
// peak. Reads doc.palettes[].chroma directly (the resolved CONTROL value) rather than re-deriving chroma
// from a ramp hex — the kit's ramp hexes are a lossy round-trip for this, the doc's own field isn't. Not
// an error — a bold, near-neon kit can be entirely intentional — but names the risk the ticket's own
// example calls out: supporting/status families usually read better muted, for contrast against the
// brand accents they sit alongside.
export function chromaBudgetLint(doc) {
  const chromas = (doc.palettes || []).map((p) => p.chroma).filter((c) => typeof c === "number");
  if (!chromas.length) return [];
  const avg = chromas.reduce((a, c) => a + c, 0) / chromas.length;
  if (avg < CHROMA_BUDGET_AVG_THRESHOLD) return [];
  return [{ level: "info", code: "chroma-budget", family: null, message: `The 8 families average ${avg.toFixed(0)} chroma — near peak across the board. Intentional for a bold/electric theme, but consider muting the supporting or status families for contrast against the brand accents (avg ≥ ${CHROMA_BUDGET_AVG_THRESHOLD} triggers this note).` }];
}

// generateKitTool(args) → the briefing payload (mode 1, "teach") or the generation result (mode 2,
// "generate"). Precedence: `brief` wins (spec §5) — an agent that resends its description alongside a
// constructed brief still gets a kit, never silently the wrong mode; the description is lint-noted as
// ignored, not silently dropped. Neither given → mode 1 with an empty description, the self-teaching
// default (never guesses at a kit; always teaches when the call is ambiguous or empty). A `brief` that IS
// given but isn't a plain object is a TOOL ERROR (spec §4.4: "only a non-object brief is a tool error") —
// this boundary validates the top-level SHAPE; describe-kit-core.mjs's own §4.4 permissiveness (never
// rejecting on CONTENT — clamping instead) only ever applies to an already-shape-valid object.
export function generateKitTool(args) {
  const a = args && typeof args === "object" ? args : {};
  if (a.brief != null) {
    if (typeof a.brief !== "object" || Array.isArray(a.brief)) {
      throw new Error(`brief must be an object (got ${Array.isArray(a.brief) ? "an array" : typeof a.brief})`);
    }
    const result = generateKit(a.brief);
    // #373's quality-analysis lint (contrast/chroma-budget) — appended at this MCP-tool layer, same as
    // description-ignored above, not inside describe-kit-core.mjs's own generateKit: that module's scope
    // stays construction-time-only (clamp/default/distinctness); these read the FINAL resolved kit/doc.
    result.lint = [...result.lint, ...contrastLint(result.kit), ...chromaBudgetLint(result.doc)];
    if (typeof a.description === "string" && a.description.trim()) {
      result.lint = [...result.lint, { level: "info", code: "description-ignored", family: null, message: "Both `description` and `brief` were given — generated from `brief`; `description` was ignored (brief wins)." }];
    }
    return result;
  }
  const description = typeof a.description === "string" ? a.description : "";
  return {
    rubric: RUBRIC,
    schema: PALETTE_BRIEF_SCHEMA,
    exemplars: retrieveExemplars(description, 3),
    research: RESEARCH_TIER_NOTE,
    instructions: ROUND_TRIP_INSTRUCTIONS,
  };
}

// buildSurface() → { TOOLS, RESOURCES, PROMPTS, SERVER, PROTOCOL_VERSION }. Unlike the read-only brand-kit
// surface, nothing is pre-loaded — every generate_kit call is self-contained, so this takes no argument.
// RESOURCES/PROMPTS are deliberately empty: the design goal is that NOTHING here relies on a host reading
// a resource or a prompt (both are unreliable delivery, per spec §1) — everything lives in the tool result.
export function buildSurface() {
  const TOOLS = [
    {
      name: "generate_kit",
      description: "Turn a plain-language palette description into a brand kit, or learn the method first. Call with { description } to receive the interpretation rubric + PaletteBrief schema + theme-adjacent exemplars (this NEVER generates a kit). Call with { brief } — an object matching that schema — to generate deterministically; the result carries a swatch-board PNG preview (for vision-capable callers to self-critique before the user looks) plus a lint array (contrast/chroma-budget advisories, for text-only callers). To refine, patch the brief and resend; never hand-edit the output's hex values.",
      inputSchema: { type: "object", properties: { description: { type: "string" }, brief: { type: "object" } } },
      run: generateKitTool,
    },
  ];
  return { TOOLS, RESOURCES: [], PROMPTS: [], SERVER, PROTOCOL_VERSION };
}

// attachImageBlock(response, msg) — appends the swatch-board PNG (#373, spec §6.2) as an MCP image
// content block to a generate_kit tools/call response that actually generated (its JSON digest carries a
// `kit`) — a teaching-mode response (no kit) is returned unchanged. Exported as a standalone, reusable
// post-processing step rather than baked into textResult, so #374's merged server — which reuses
// brand-kit-core.mjs's OWN handle/textResult, deliberately untouched by this module — can apply the
// identical enrichment to ITS generate_kit responses without either module needing to know about the
// other's dispatch internals.
export function attachImageBlock(response, msg) {
  if (!(response && response.result && Array.isArray(response.result.content) && msg && msg.method === "tools/call" && msg.params && msg.params.name === "generate_kit")) return response;
  const first = response.result.content[0];
  if (!first || first.type !== "text") return response;
  let digest;
  try { digest = JSON.parse(first.text); } catch { return response; }
  if (!digest || !digest.kit) return response; // teaching mode (no kit) — nothing to preview
  const image = swatchBoardImageBlock(digest.kit, FAMILY_NAMES);
  return { ...response, result: { ...response.result, content: [...response.result.content, image] } };
}

// handle(msg, surface) → a JSON-RPC 2.0 response OBJECT, or null when nothing should be sent (a
// notification, or a notification-shaped ping). Pure: the caller writes the returned object to its
// transport. Self-contained dispatch (mirrors brand-kit-core.mjs's shape; not imported from it).
export function handle(msg, surface) {
  const { TOOLS } = surface;
  const m = msg || {};
  const { id, method, params } = m;
  const isRequest = id !== undefined && id !== null;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  const textResult = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });

  switch (method) {
    case "initialize":
      return reply({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER, instructions: "Describe-palette generator. Call generate_kit with { description } to learn the method, or { brief } (per the schema the briefing returns) to generate a kit." });
    case "notifications/initialized": return null; // notification, no reply
    case "ping": return isRequest ? reply({}) : null;
    case "tools/list": return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const t = TOOLS.find((x) => x.name === (params && params.name));
      if (!t) return fail(-32602, `unknown tool: ${params && params.name}`);
      try { return attachImageBlock(reply(textResult(t.run((params && params.arguments) || {}))), m); }
      catch (e) { return reply({ ...textResult(`error: ${e.message}`), isError: true }); }
    }
    case "resources/list": return reply({ resources: [] });
    case "prompts/list": return reply({ prompts: [] });
    default:
      return isRequest ? fail(-32601, `method not found: ${method}`) : null;
  }
}
