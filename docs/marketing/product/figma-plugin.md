# Figma plugin — Community listing copy

Paste-ready copy for publishing the plugin to Figma Community. Two plugins exist; the listing below
is the **main app-as-plugin** (the generator inside Figma). The standalone Semantic Binder ships as a
section of the same listing until it earns its own. Posture: **landing/store**, with the docs
register for "How it works". Facts: [`../fact-sheet.md`](../fact-sheet.md).

**Plugin name**

```
Ultimate Tokens
```

**Tagline**

```
Perceptual color, type & geometry tokens — written straight into Figma variables.
```

**Description**

> Ultimate Tokens is a perceptual design-token generator, running entirely inside Figma. Pick a key
> color and it derives an even, OKLCH-true tonal ramp, mapped to 53 semantic roles across light and
> dark — then writes the whole system into your file's variable collections: Color Primitives, Color
> Modes, aliased so a raw-color edit cascades to every role.
>
> **Fully offline.** The plugin makes no network requests (`networkAccess: none`) — your palettes,
> your file, nothing else. No account, no sign-up, and every feature of the generator is free in the
> plugin.
>
> **How it works**
> 1. Open the plugin and compose your kit — color palettes, a type scale, a geometry ramp.
> 2. Choose which systems to apply (Color · Typography · Geometry).
> 3. Apply. The plugin creates or updates the variable collections and binds the semantic layer —
>    raw primitives at the bottom, 53 aliased roles on top, light and dark as modes.
> 4. Edit a primitive later and the cascade carries it to every role that references it.
>
> **Style swatches, bound to the variables.** Apply also drops a Figma style for every token, each
> bound to the variable behind it: a paint style per semantic role — grouped in the Styles panel,
> tracking Light and Dark on its own — and a text style per type voice and step. Name a few sibling
> weights on a voice and each becomes its own text style too. Prefer variables only? Turn off the
> "Styles" toggle. The plugin updates and prunes the styles it made on every re-apply and never
> touches the ones you drew yourself.
>
> The same kit exports beyond Figma from the web app: CSS custom properties, W3C design tokens
> (DTCG), Tailwind, shadcn, and a Brand-Kit MCP server for AI agents — every format derived from the
> one source, in sync by construction.

**Support / privacy lines (listing fields)**

```
Support:  github.com/kimgranlund/ultimate-tokens/issues
Privacy:  Runs fully offline. No network access, no analytics, no account.
```

**Community tags**

```
design tokens · color system · variables · OKLCH · type scale · design system
```
