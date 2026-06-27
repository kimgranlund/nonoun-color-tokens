# Brand-Kit MCP

A **zero-dependency** [MCP](https://modelcontextprotocol.io/) server that serves a **Color Tokens by
NONOUN** brand kit (your generated color tokens) to AI agents — **Claude Code / Claude Design, Cursor,
VS Code, ChatGPT**, anything that speaks MCP. The agent then builds with your brand's *exact* tokens
instead of guessing a colour.

> Status: **spike / proof-of-concept.** The server + data shape are real and tested; the in-app
> "Download Brand-Kit MCP" packaging (the per-brand `.zip`) is the next step.

## Files

- `brand-kit-server.mjs` — the server. Pure Node, **no `npm install`**.
- `brand-kit.json` — your resolved tokens (produced by `brandKit(doc)` — palettes, ramps, and the 37
  semantic roles resolved for light + dark). The server reads this sibling file.

## Run it

```bash
node brand-kit-server.mjs                 # reads ./brand-kit.json
node brand-kit-server.mjs path/to/kit.json   # or an explicit path
```

## Add it to Claude Code

```bash
claude mcp add brand-kit -- node /abs/path/to/brand-kit-server.mjs
```

…or in a project `.mcp.json`:

```json
{ "mcpServers": { "brand-kit": { "command": "node", "args": ["/abs/path/to/brand-kit-server.mjs"] } } }
```

(Claude Desktop / Cursor / VS Code use the same `command` + `args` shape in their MCP config.)

## What it exposes

**Resources** — `brand://kit` (full), `brand://palettes`, `brand://semantic/light`,
`brand://semantic/dark`, `brand://guide`.

**Tools**
| tool | does |
|---|---|
| `list_palettes` | the palettes + their identity colour |
| `get_ramp(palette)` | a palette's full tonal ramp (stop → hex) |
| `resolve_token(palette, role, scheme)` | the hex for a semantic role in `light`/`dark` (role can be `"palette/role"`) |
| `get_semantic(scheme)` | all 37 roles per palette resolved for a scheme |
| `nearest_token(hex)` | the brand token closest to a hex (reuse the system, don't invent a colour) |

**Prompt** — `apply_brand`: how to apply the kit (surfaces from `*/surface*`, accents from the prime
roles, text from `*/on*`, never raw hex).

## Protocol

JSON-RPC 2.0 over **stdio**, newline-delimited. Logging goes to **stderr** only.
