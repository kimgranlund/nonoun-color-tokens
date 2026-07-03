# ultimate-tokens — the consumption plugin

Three skills that teach a coding agent to **consume** an exported
[Ultimate Tokens](https://kimgranlund.github.io/nonoun-color-tokens/) design-token kit correctly in
*your* project — picking the right semantic role for every UI surface instead of guessing a hex, a
font size, or a pixel value.

| Skill | Use when you're setting… | Covers |
|---|---|---|
| **color-tokens** | the colour of any UI | the 59-role semantic layer — buttons (all variants + states), form fields, text hierarchy, cards/modals/elevation, intents/toasts/scrims, navigation, focus. Enforces the pairing law and on-colour discipline. |
| **typography-tokens** | the type of any UI | the seven-role scale — role=function × level=hierarchy-depth (size derived), the body-vs-ui split, single-line vs multi-line, per-role paragraph rhythm, responsive breakpoint modes. |
| **geometry-tokens** | the size or spacing of any UI | the two-tier dimensional system — control geometry (the centering law) and container geometry (insets/gaps), the Material-3-aligned radius scale, borders, focus rings. |

## The agent

**`token-integrator`** is the seat you invoke to actually *do the wiring* — "use our design tokens
here", "wire the theme", "migrate this UI to our kit". It binds to your project's real exported
variables, applies the three skills' laws (adapting past them for frameworks they don't cover), and
for large work orchestrates scoped planning → execution → verification sub-agents (the verifier a
separate seat from the executors). If you're already running your own loop or orchestrator, it slots
in as a seat and hands back cleanly rather than starting a competing one.

## How it works

Each skill **binds to your project first**: it finds the exported CSS/DTCG, reads the actual variable
prefix (default `--c-*` / `--type-*` / `--size-*`, or a Material `--md-sys-*` / custom `--{brand}-*`
scheme), enumerates what the kit exports, then applies the usage laws with your real token names. It
names the semantic token for the job rather than inventing a value — or stops and asks.

## Install

Add the marketplace, then the plugin:

```
/plugin marketplace add kimgranlund/nonoun-color-tokens
/plugin install ultimate-tokens
```

Then, in any project that contains an Ultimate Tokens export, ask the agent to style a component and
the right skill activates on the task.

## Provenance

Authored in [`nonoun-color-tokens`](https://github.com/kimgranlund/nonoun-color-tokens) (the generator
that produces the kits these skills consume). Every skill is parity-gated against the product's
engines in that repo's `npm test`, so the skills cannot drift from the tokens they document — and each
was independently reviewed before shipping.
