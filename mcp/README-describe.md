# Describe-Palette MCP

A **zero-dependency** [MCP](https://modelcontextprotocol.io/) server that both **serves** your current
Ultimate Tokens brand kit AND **generates new ones from a plain-language description** — one server, so
a kit an agent generates never dead-ends: the read tools, `export_tokens`, and the resources all serve it
immediately, right alongside whatever kit you downloaded with.

> Pro feature. Everything the read-only Brand-Kit MCP does, plus `generate_kit` and `export_tokens`.

## Files

This package keeps its files at the same paths they live at in the Ultimate Tokens repo — every import
below is a real relative import Node resolves as-is, not a bundle:

- `mcp/brand-kit-merged-server.mjs` — the stdio entry. Pure Node, **no `npm install`**.
- `mcp/brand-kit-merged-core.mjs` / `brand-kit-core.mjs` / `describe-mcp-core.mjs` / `describe-kit-core.mjs`
  / `describe-rubric.mjs` / `png-swatch-board.mjs` — the transport-agnostic MCP surface the server imports.
- `src/` — the pure engine + model modules these import (color/type/geometry math, semantic roles,
  persistence). No DOM, no browser APIs — the exact code the web app itself runs on.
- `docs/reference/data/role-table.json` — the semantic-role answer key `generate_kit`'s defaults draw from.
- `mcp/brand-kit.json` — your **current** resolved tokens (same shape the read-only package ships), sitting
  beside the server (its own default sibling-file lookup). The server loads it at boot, so the read tools
  work immediately — describing a NEW palette is additive, not a replacement.

## Run it

```bash
node mcp/brand-kit-merged-server.mjs                    # reads mcp/brand-kit.json
node mcp/brand-kit-merged-server.mjs path/to/kit.json   # or an explicit path
```

## Add it to Claude Code

```bash
claude mcp add describe-palette -- node /abs/path/to/mcp/brand-kit-merged-server.mjs
```

…or in a project `.mcp.json`:

```json
{ "mcpServers": { "describe-palette": { "command": "node", "args": ["/abs/path/to/mcp/brand-kit-merged-server.mjs"] } } }
```

## What it adds beyond the read-only Brand-Kit MCP

| tool | does |
|---|---|
| `generate_kit({ description })` | teaches the method — returns the interpretation rubric, the PaletteBrief schema, and a handful of theme-adjacent exemplars. Never generates a kit. |
| `generate_kit({ brief })` | generates a full 8-family brand kit deterministically from a PaletteBrief. The reply includes a PNG swatch board (light + dark) and a lint array. |
| `export_tokens({ format })` | export the **currently bound** kit's tokens — `css` \| `oklch` \| `json` \| `dtcg` \| `ui3` \| `tailwind` \| `shadcn` \| `all`. Available once a kit has been *generated* this session (not from the loaded `brand-kit.json` alone) — call `generate_kit` first. |

The two-step protocol exists because MCP hosts vary and agents don't reliably read server-level prompts:
call with `{ description }` first to receive everything the method needs in-band, then call again with
`{ brief }` to generate. Refine by patching the brief and resending — never hand-edit the output's hex
values.

Every read tool, resource, and prompt the free Brand-Kit MCP exposes (`list_palettes`, `get_ramp`,
`resolve_token`, `get_semantic`, `nearest_token`, `get_type`, `get_geometry`, the `brand://…` resources,
the `apply_brand` prompt) works identically here — this server is a strict superset. `last generate wins`:
once you generate a kit, the read surface switches to serving *that* kit until you generate again or
restart the server.

## Protocol

JSON-RPC 2.0 over **stdio**, newline-delimited. Logging goes to **stderr** only.
