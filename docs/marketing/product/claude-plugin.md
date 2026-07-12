# Ultimate Tokens for Claude Code — the consumption plugin

Copy for every surface that describes the installable Claude Code plugin: the marketplace/README
listing, docs mentions, and the agent-facing pitch. This is the **consumption** side — where the
Brand-Kit MCP *serves* your tokens to an agent, this plugin teaches the agent *how to apply them*.
It's free and MIT, and it's live today (fact sheet: **Ultimate Tokens Claude plugin**). Posture:
**landing/store**; the install block is docs register. Facts: [`../fact-sheet.md`](../fact-sheet.md).

**One-liner**

```
Teach your coding agent to build with your exact tokens — which role goes where, not a guessed hex.
```

**Short description (marketplace / README)**

> A free Claude Code plugin that teaches a coding agent to *consume* an exported Ultimate Tokens kit
> inside your own project. Three skills — **color-tokens** (which of the 53 semantic roles goes on
> every surface), **typography-tokens** (the eleven-voice scale, role × level), **geometry-tokens**
> (the two-tier dimensional system) — plus a **`token-integrator`** agent that wires a component or
> migrates a whole UI onto the kit. Every skill is parity-gated against the generator's engines, so
> its guidance can't drift from the tokens it documents.

**The pitch (long form)**

> Exporting the kit is half the job. An agent that can't read your tokens guesses them — a plausible
> blue for a button, an approximate size for a heading — and the system you derived drifts back into
> hand-picked values one component at a time. That's the gap this plugin closes: it makes your exact
> tokens first-class context the agent applies, not a convention it has to infer.
>
> Install it into Claude Code and it adds three consumption skills and an integration agent. Ask the
> agent to style a component and the right skill activates: **color-tokens** enforces which of the 53
> roles belongs on each surface and the on-colour pairing law; **typography-tokens** picks the voice
> by the text's function and the level by its hierarchy, then derives the size from that level;
> **geometry-tokens** applies the control-and-container dimensional system and the radius scale. The
> **`token-integrator`** agent does the wiring — for a small job directly, for a migration by
> orchestrating scoped planning → execution → verification, the verifier a separate seat from the
> executors so no agent blesses its own edits.
>
> It binds to *your* export first: it reads the real variable names your kit declares — the default
> `--c-*` scheme, a Material 3-style `--md-sys-*` root, or your own `--{brand}-*` — and names the
> token for the job, or stops and asks. And because every skill is parity-gated against the product
> engines, the roles it teaches are the roles the generator ships — checked, not remembered.

**Install (docs register — paste where instructions belong)**

```
# In Claude Code, add the marketplace, then the plugin:
/plugin marketplace add https://unpkg.com/@ultimate-tokens/claude/marketplace.json
/plugin install ultimate-tokens

# Then, in any project that contains an Ultimate Tokens export, ask the agent to
# style or migrate a component — the matching skill activates on the task.
```

**What it teaches the agent (feature bullets)**

```
• color-tokens — which of the 53 semantic roles goes where; the on-colour pairing law, per state
• typography-tokens — the eleven-voice scale, role × level (size derived, never guessed)
• geometry-tokens — the two-tier dimensional system + the Material-3-aligned radius scale
• token-integrator — binds to your real exported variables; wires a component or migrates a UI
• Parity-gated against the engines in the generator's test suite — guidance can't drift from the kit
```

**Cross-reference.** The [Brand-Kit MCP](brand-kit-mcp.md) *serves* the values; this plugin teaches
the agent *how to apply them* — both free and available today.
A hosted MCP endpoint is planned as a Pro feature, not yet live.
