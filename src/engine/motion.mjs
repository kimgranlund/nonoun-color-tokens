// motion.mjs — the MOTION facet of a brand kit. Pure, no DOM (an engine module).
//
// Motion is the one facet whose values are not derived from the user's parameters (there is no motion
// engine, and no Settings picker): they are SYSTEM CONSTANTS with provenance. So this module's job is
// to carry them accurately, cite them, and let the exports state the LAWS an agent must follow — a
// DESIGN.md's Motion section is a rulebook, not a slider.
//
// ── Why Material-founded curves and not springs ────────────────────────────────────────────────
// The estate's house default for motion is Apple-style springs (velocity continuity, mid-flight
// retargeting). Two rationales don't apply here, so we deviate deliberately (naming the reason, per
// the deviation doctrine):
//   1. Every target that consumes this kit renders on the WEB (Claude Code / Stitch / Figma Make →
//      React + Tailwind + shadcn). Web has no spring tokens; springs are realized by sampling
//      stiffness/damping into `linear()`. A cubic-bezier + ms ladder is directly bindable everywhere.
//   2. This kit's semantic role system is already Material-Design-founded; a Material-founded motion
//      layer keeps one lineage across color, geometry, and motion.
// A consuming project that IS spring-native (SwiftUI, Compose, M3 Expressive) should use its own
// spring set — the laws below (enter/exit asymmetry, compositor-only, reduced-motion) still hold.
//
// Provenance: values are the published M3 spec set — the material-foundation token repo's
// `css/motion.css`, MDC-Android Motion.md, m3.material.io (as carried by the
// `material-design-motion-tokens` pack, accessed 2026-07-09). The perception limits, enter/exit
// asymmetry, never-animate list, and reduced-motion policy come from the `motion-design` corpus
// (Nielsen's limits; web.dev asymmetric-animation-timing + animations-guide; WCAG 2.2.2/2.3.1/2.3.3;
// vestibular.org). Cited in DESIGN.md so a consuming agent can audit the claim.

// EASING — cubic-bezier control points. NOTE the published caveat: `emphasized` carries the SAME
// bezier as `standard`; the emphasized family's distinctness lives in its accelerate/decelerate
// variants. We reproduce that faithfully rather than inventing a distinct curve.
export const MOTION_EASING = {
  "linear": "cubic-bezier(0, 0, 1, 1)",
  "standard": "cubic-bezier(0.2, 0, 0, 1)",
  "standard-decelerate": "cubic-bezier(0, 0, 0, 1)",
  "standard-accelerate": "cubic-bezier(0.3, 0, 1, 1)",
  "emphasized": "cubic-bezier(0.2, 0, 0, 1)",
  "emphasized-decelerate": "cubic-bezier(0.05, 0.7, 0.1, 1)",
  "emphasized-accelerate": "cubic-bezier(0.3, 0, 0.8, 0.15)",
};

// DURATION — the ms ladder, four tiers × four steps. Tier by SCOPE: short = a small component
// (switch, checkbox); medium = a partial-screen surface (drawer, menu, card); long/extra-long =
// full-screen transitions. 100 ms is the "instant" perceptual floor; past ~400 ms a transition
// starts reading as slow.
export const MOTION_DURATION = {
  "short1": 50, "short2": 100, "short3": 150, "short4": 200,
  "medium1": 250, "medium2": 300, "medium3": 350, "medium4": 400,
  "long1": 450, "long2": 500, "long3": 550, "long4": 600,
  "extra-long1": 700, "extra-long2": 800, "extra-long3": 900, "extra-long4": 1000,
};

// The properties that may be animated by default — the only ones the compositor can hold at 60fps
// (a 16.7 ms frame budget) off the main thread.
export const MOTION_ANIMATABLE = ["transform", "opacity"];

// NEVER-ANIMATE — the list design-md-format's Motion section asks for, each with the reason that
// makes it a defect rather than a preference.
export const MOTION_NEVER = [
  ["layout properties (`top`/`left`/`width`/`height`)", "they trigger layout + paint; animated layout shift is a CLS defect — animate `transform` instead"],
  ["anything but `transform`/`opacity`, by default", "only compositor properties hold 60fps off the main thread"],
  ["text while it is being read", "moving/blinking text impedes reading (WCAG 2.2.2 — the user must be able to pause it)"],
  ["focus indicators, via reflow", "showing an outline must never shift layout (WCAG 2.4.11)"],
  ["the text caret", "the blink is OS-defined; caret color interpolates discretely anyway"],
  ["form fields during entry", "state animation mid-typing is cognitive load — value changes land instantly"],
  ["decorative loops with no pause control", "WCAG 2.2.2's five-second rule"],
];

// motionTokens() — the machine-readable block the exports carry. Pure data; no config to resolve
// (motion has no user-tunable parameters in this kit).
export function motionTokens() {
  return { easing: { ...MOTION_EASING }, duration: { ...MOTION_DURATION }, animatable: [...MOTION_ANIMATABLE] };
}
