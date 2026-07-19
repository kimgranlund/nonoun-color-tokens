// brand-kit-merged-core.mjs — the PURE, transport-agnostic MCP surface merging the read-only brand-kit
// server (mcp/brand-kit-core.mjs) with the describe-palette generator (mcp/describe-mcp-core.mjs /
// describe-kit-core.mjs), so a generated kit never dead-ends (#374, spec §7). ONE session-scoped mutable
// binding — { kit, doc } — starts from an optional initial kit (a loaded brand-kit.json; no doc, so
// export_tokens is unavailable until a real generate_kit call happens) and REBINDS after every successful
// generate_kit call: last generate wins.
//
// Deliberately REUSES brand-kit-core.mjs's own `handle` dispatcher (already fully generic over a `surface`
// object) rather than duplicating its ~20-line JSON-RPC switch a third time — the only new logic here is
// composing a surface that (a) rebuilds the read tools/resources/prompts off the CURRENT bound kit on every
// dispatch (buildSurface is pure and cheap, so recomputing it is simpler and safer than caching + manual
// invalidation) and (b) appends the two new tools, generate_kit and export_tokens.

import { buildSurface as buildReadSurface, handle as handleRead } from "./brand-kit-core.mjs";
import { generateKitTool, attachImageBlock } from "./describe-mcp-core.mjs";
import { projectView } from "../src/ui/model.mjs";

// FORMAT_META — the 7 named color formats export_tokens can serve (the 8th enum value, "all", aggregates
// all 7 into one multi-file response). Filenames are flat (no doc-name slug — an MCP result isn't a zip
// entry) but otherwise mirror the app's own per-format naming (the export drawer / Download-All zip).
const FORMAT_META = {
  css: { name: "tokens.css", mimeType: "text/css" },
  oklch: { name: "tokens-oklch.css", mimeType: "text/css" },
  json: { name: "tokens.json", mimeType: "application/json" },
  dtcg: { name: "dtcg.tokens.json", mimeType: "application/json" },
  ui3: { name: "ui3.json", mimeType: "application/json" },
  tailwind: { name: "tailwind.css", mimeType: "text/css" },
  shadcn: { name: "shadcn.css", mimeType: "text/css" },
};
const FORMAT_ORDER = ["css", "oklch", "json", "dtcg", "ui3", "tailwind", "shadcn"];

const fileFor = (format, text) => ({ ...FORMAT_META[format], text });

// createSession(initialKit?) → { handle(msg), getState() }. `initialKit` is the OPTIONAL sibling
// brand-kit.json's parsed contents (or null/omitted for a kitless boot).
export function createSession(initialKit) {
  const state = { kit: initialKit && typeof initialKit === "object" ? initialKit : {}, doc: null };

  // generate_kit wraps describe-mcp-core.mjs's own tool function byte-for-byte — REBINDING only happens
  // when it actually generated (mode 2 ran); a teaching-mode (mode 1) response never touches state, so a
  // caller exploring the method doesn't clobber whatever kit is currently bound.
  function generateKitWrapped(args) {
    const result = generateKitTool(args);
    if (result && result.kit) { state.kit = result.kit; state.doc = result.doc; }
    return result;
  }

  // export_tokens(format) wraps src/engine/exports.js over the bound doc's state, via the SAME projectView
  // the app's own export drawer reads from — no duplicated exporter wiring. Only available once a doc
  // exists (spec §7: "a downloaded-kit-only session has no doc"); a graceful { error } — matching
  // brand-kit-core.mjs's own precedent (e.g. get_ramp's "no palette ..." shape) — not a thrown tool error,
  // since calling export_tokens too early is a normal, recoverable sequencing mistake, not a malformed call.
  function exportTokensTool(args) {
    const format = args && args.format;
    if (!state.doc) return { error: "export_tokens needs a generated kit first — call generate_kit with { brief }." };
    if (format !== "all" && !FORMAT_META[format]) return { error: `unknown format: ${format} (expected one of ${[...FORMAT_ORDER, "all"].join(", ")})` };
    const view = projectView(state.doc);
    if (format === "all") return { files: FORMAT_ORDER.map((f) => fileFor(f, view.exports[f])) };
    return { files: [fileFor(format, view.exports[format])] };
  }

  // surface() — rebuilt fresh on every dispatch off the CURRENT state.kit. When state.kit is `{}` (the
  // kitless boot, or before any generate call), buildReadSurface's own hasColor/type/geometry gates
  // naturally contribute ZERO read tools — "kitless boot serves the generator surface only" (spec §7)
  // falls out of this composition for free, no special-casing needed.
  function surface() {
    const read = buildReadSurface(state.kit);
    return {
      kit: state.kit,
      TOOLS: [
        ...read.TOOLS,
        {
          name: "generate_kit",
          description: "Turn a plain-language palette description into a brand kit, or learn the method first. Call with { description } to receive the interpretation rubric + PaletteBrief schema + theme-adjacent exemplars (this NEVER generates a kit). Call with { brief } — an object matching that schema — to generate deterministically; the read tools (list_palettes, resolve_token, ...) and export_tokens immediately serve the generated kit. To refine, patch the brief and resend; never hand-edit the output's hex values.",
          inputSchema: { type: "object", properties: { description: { type: "string" }, brief: { type: "object" } } },
          run: generateKitWrapped,
        },
        {
          name: "export_tokens",
          description: "Export the currently-bound kit's tokens in a documented format, so the natural next move — writing tokens.css or a framework config into the user's project — is one call. Only available once a kit has been GENERATED (not a loaded brand-kit.json alone). format: css | oklch | json | dtcg | ui3 | tailwind | shadcn | all (every format at once, multi-file).",
          inputSchema: { type: "object", properties: { format: { type: "string", enum: [...FORMAT_ORDER, "all"] } }, required: ["format"] },
          run: exportTokensTool,
        },
      ],
      RESOURCES: read.RESOURCES,
      PROMPTS: read.PROMPTS,
    };
  }

  return {
    // attachImageBlock (from describe-mcp-core.mjs, #373) post-processes the reply AFTER handleRead
    // returns it — brand-kit-core.mjs's own dispatch stays fully unaware of image blocks; the enrichment
    // is entirely external to it.
    handle: (msg) => attachImageBlock(handleRead(msg, surface()), msg),
    // exposed for tests only — not part of the MCP protocol surface.
    getState: () => state,
  };
}
