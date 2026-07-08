# SPEC — App-Shell Patterns (the creative-editor shell)

> **Status:** normative pattern spec — reusable across products.
> **Kind:** a *pattern* SPEC, not a product SPEC. It defines the behavior contract for a **creative-editor
> app shell** so any system can implement it against **its own design system**. It prescribes
> *structure, behavior, state, and states* — never pixels, component APIs, color, or type. Where a
> requirement would pin an implementation choice, it is stated as a constraint with a rationale and the
> freedom left explicit.
> **Origin:** abstracted from the shipped `nonoun-color-tokens` shell; its concrete realization is the
> reference implementation and lives in `.claude/docs/lld/app-shell.md` (the LLD — the *how*). This SPEC
> is the *what*; that LLD is one conforming build.
> **Audience:** implementers building a create/configure/analyze tool who want a proven shell skeleton
> without re-deriving it, and who will skin it with their own components and tokens.
> **Relation to the layout vocabulary:** this is the *behavior* view of the **productivity-shell**
> archetype (`~/.claude/skills/ui-patterns/references/archetype-productivity-shell.md`, which owns the
> *structural* view — regions, wireframe, named-pattern vocabulary). The card names the parts; this SPEC
> pins how they behave.
> **Conformance language:** MUST / SHOULD / MAY per RFC 2119. A conforming shell satisfies every MUST.

---

## 0. Goals (`PRD-G#`)

No separate PRD exists for a generic pattern, so this section states the pattern's own product goals and
gives them stable handles. Every `SPEC-R#` traces to one.

| Goal | Statement |
|------|-----------|
| **PRD-G1** | Give create/configure/analyze tools a **standard shell skeleton** — one users recognize across products and implementers reuse instead of re-deriving. |
| **PRD-G2** | Establish a **stable spatial contract**: a fixed set of regions with fixed semantic roles, so the user's mental map holds as content changes. |
| **PRD-G3** | Let one document expose **multiple editable facets** ("sections") in a single editor, without new windows or route changes. |
| **PRD-G4** | Keep **continuous-tuning edits responsive and non-disruptive** — the artifact updates live without losing the user's focus, caret, or scroll. |
| **PRD-G5** | Keep **orientation and status always visible** — what is selected, whether work is saved, whether it is valid. |
| **PRD-G6** | Let the user **control density** — collapse chrome to concentrate on the work, without losing the way back. |
| **PRD-G7** | Be **design-system-agnostic** — the skeleton imposes structure and behavior only; all visual identity is the implementer's. |

**Non-goals.** This SPEC does not define: the contents/behavior of any region's *body* (the specific
graphs, tables, controls a product puts inside a pane); visual design (color, type, spacing, motion
curves); persistence format or backend; the document's domain model. Those are the implementer's.

---

## 1. Definitions

- **Shell** — the persistent frame around the work: the regions below, minus their bodies.
- **Region** — a named, fixed-purpose area of the shell (§2).
- **Workspace** — the central region where the primary artifact is viewed/manipulated (a.k.a. "canvas").
- **Section** — one editable facet of the single open document (e.g. in the reference impl: Color /
  Typography / Geometry). Switching sections re-routes region *bodies*, never the frame.
- **Selection** — the entity within the active section the side regions inspect/analyze.
- **Full render** — a rebuild of the shell subtree from current state.
- **Live refresh** — a partial, in-place update of only the regions affected by an in-progress edit,
  performed without a full render (§4).
- **Ephemeral (ui-session) state** — view state that changes what is *shown* but not what would be
  *saved/exported*; not persisted, not undoable.
- **Persisted (document) state** — the artifact itself; survives reload; edited through undo/redo.

---

## 2. Region model

### SPEC-R1 — The frame *(→ PRD-G1, PRD-G2)*
The shell MUST present a single top-level **editor frame** composed of a fixed set of regions:
a **header** band, a **left rail**, a **center workspace**, a **right rail**, and a **footer** band;
plus a layer of **overlays** rendered outside the frame's flow.
The frame MUST be invariant across sections and selections (§R8): regions do not appear, disappear, or
change role as content changes — only their bodies do.
- **AC-R1.1** Given any section or selection, the same five regions are present with the same roles.
- **AC-R1.2** The header spans the full width above the rails; the footer spans the full width below;
  the three middle regions sit left · center · right between them.
- **AC-R1.3** The workspace is the flex/primary region — it absorbs remaining space as the frame
  resizes; the rails hold their assigned measure. (Exact measures are the implementer's.)

### SPEC-R2 — Header contract *(→ PRD-G1, PRD-G3, PRD-G5)*
The header MUST carry, at minimum: (a) a **home/brand affordance** that returns to the browse view
(§R15); (b) the **document identity** (its name, editable in place); (c) the **section switcher** (§R8);
(d) a **primary-action cluster** including the document's principal output action (e.g. export/save/
publish). It SHOULD also expose undo/redo, a theme/preview toggle, and settings.
- **AC-R2.1** The home affordance is keyboard-operable and returns to browse (§R15).
- **AC-R2.2** Editing the document name in the header does not move focus out of the field until the
  edit is committed (blur/Enter); see §R13.
- **AC-R2.3** The primary output action is visually distinguished from secondary actions.

### SPEC-R3 — Left rail: analysis / diagnostics *(→ PRD-G2, PRD-G5)*
The left rail MUST present **read-only diagnostics for the current selection** — derived, non-editing
views (metrics, graphs, checks). It MUST NOT be the primary place edits are made.
- **AC-R3.1** The rail reflects the active section (its body is section-specific) and the current
  selection.
- **AC-R3.2** With no valid selection, the rail renders an explicit empty state (§R18), not blank space
  or an error.

### SPEC-R4 — Center workspace *(→ PRD-G1, PRD-G2)*
The workspace MUST present the section's **primary artifact over its full dataset** and MUST provide a
**navigation model** appropriate to that artifact. When the artifact is spatial/continuous, the
workspace SHOULD support pan + zoom + a "fit/reset" action; when it is tabular/discrete, it SHOULD
scroll. A workspace-local header MAY carry view-mode, density, preview-scheme, and zoom controls; a
workspace-local footer MAY carry a live coordinate/hover readout and interaction hints.
- **AC-R4.1** A "fit/reset" affordance returns the workspace to its canonical framing in one action.
- **AC-R4.2** If pan/zoom is offered, a small drag threshold MUST separate a *pan* gesture from a
  *select/click* on a workspace item (a click must not be swallowed by an incidental drag, and vice
  versa).
- **AC-R4.3** The workspace shows the *whole* dataset for the section (subject to the navigation model),
  not a paginated slice, unless the section explicitly defines paging.

### SPEC-R5 — Right rail: inspector *(→ PRD-G2)*
The right rail MUST be the **primary editing surface for the selection and its settings**, organized as
**switchable panels** (e.g. selection-scoped / document-scoped / role-or-mapping). A panel that only
applies conditionally MUST be hidden when it does not apply, and the active-panel selection MUST fall
back safely when its panel disappears (§R18). The rail SHOULD pin a **live preview** of the selection
that stays visible across panel switches.
- **AC-R5.1** Switching panels changes the rail body only; the frame, header, and other rails are
  unchanged.
- **AC-R5.2** If a conditional panel is removed while active, the selection resolves to a defined
  default panel with no error.

### SPEC-R6 — Footer: status *(→ PRD-G5)*
The footer MUST surface **orientation and status** at a glance: at minimum a **save/dirty indicator** and
a **validity indicator** for the document (e.g. an accessibility/contrast or rule-violation count). It
SHOULD also show summary counts (entities, output tokens) and the active preview/theme.
- **AC-R6.1** The save indicator distinguishes *saved* from *unsaved* at a glance.
- **AC-R6.2** When the document has validity violations, the footer states the count; when clean, it
  states so affirmatively.
- **AC-R6.3** Footer readouts update on every committed edit (and MAY update live during an edit, §R12).

### SPEC-R7 — Overlays *(→ PRD-G1)*
Transient surfaces (the output/export flow, entity-creation, confirmation gates, settings, transient
notifications) MUST render as **overlays outside the frame flow**, MUST NOT displace or reflow the
regions, and MUST be dismissible. A modal overlay MUST trap focus while open and restore it on close.
- **AC-R7.1** Opening/closing an overlay does not change the position or size of any region.
- **AC-R7.2** A modal overlay is dismissible by a standard affordance (close control and/or Escape) and
  returns focus to its invoker.

---

## 3. Section routing & the state model

### SPEC-R8 — The section axis *(→ PRD-G3)*
The shell MUST support **N ≥ 1 sections** representing facets of the **one open document**, selected by a
single **section switcher** in the header. Changing the section MUST re-route the **bodies** of the left
rail, workspace, and right rail to that section, while leaving the **frame invariant** (§R1). Sections
MUST NOT be modeled as separate documents, windows, or navigation routes.
- **AC-R8.1** With N sections, the switcher offers N mutually-exclusive choices; exactly one is active.
- **AC-R8.2** Switching a section updates all three middle regions' bodies and no others.
- **AC-R8.3** The frame, header identity, and footer persist unchanged across a section switch.

### SPEC-R9 — Per-section body routing *(→ PRD-G2, PRD-G3)*
Each of the left rail, workspace, and right rail MUST resolve its body from the active section. A section
MUST provide a body for all three, or the shell MUST render a defined placeholder for any it omits — it
MUST NOT display a stale sibling section's body.
- **AC-R9.1** Adding a section that omits a rail body yields that rail's placeholder, never the previous
  section's content.

### SPEC-R10 — Cross-section state preservation *(→ PRD-G4)*
Section-local view state that a user invests effort in (e.g. the workspace pan/zoom position) MUST be
**preserved and restored** across a round-trip away from and back to that section. State that is not
meaningful in another section MUST NOT leak into it.
- **AC-R10.1** Set a workspace view (pan/zoom) in section A, switch to B and back to A → A's view is
  restored.
- **AC-R10.2** Section B starts at its own canonical framing, unaffected by A's view.

### SPEC-R11 — State tiers *(→ PRD-G4, PRD-G7)*
The shell MUST separate **persisted document state** from **ephemeral ui-session state** (§1). Ephemeral
state (active section, active panels, view mode, pan/zoom, pane-collapsed flags, preview scheme) MUST NOT
be written to the document, MUST NOT create undo entries, and MUST NOT survive reload. Persisted edits
MUST flow through an undo/redo history.
- **AC-R11.1** Toggling any ephemeral control produces no change to saved/exported output and no undo
  entry.
- **AC-R11.2** A document edit is undoable and, once committed, marks the document dirty (§R6).

---

## 4. Render & live-refresh invariants

### SPEC-R12 — Live refresh for continuous edits *(→ PRD-G4)*
During a **continuous-value edit** (e.g. a slider/handle drag, a live text field), the shell MUST update
the affected views **without a full render** — updating only the workspace artifact and the derived
diagnostics/status that depend on the changed value. A full render, if used, MUST be deferred to the
edit's **commit** (settle) boundary. The mechanism (which nodes are patched) is the implementer's; the
observable contract is what this requires.
- **AC-R12.1** Dragging an input continuously updates the workspace and the left-rail diagnostics in
  step, with no visible full-frame rebuild.
- **AC-R12.2** The continuous edit produces exactly **one** undo entry, created at commit, not one per
  intermediate value.
- **AC-R12.3** Footer status readouts (§R6) reflect the in-progress value during the drag.

### SPEC-R13 — Interaction continuity *(→ PRD-G4)*
No shell update — full render or live refresh — may disrupt an in-progress interaction. The **active
control MUST retain focus and caret/selection**, the **workspace MUST retain scroll/pan/zoom position**,
and an **open overlay MUST stay open**, across any update triggered while that interaction is active.
- **AC-R13.1** Typing in the document-name field across intermediate updates never loses focus or moves
  the caret.
- **AC-R13.2** An update triggered while an overlay is open leaves the overlay open and its state intact.
- **AC-R13.3** A workspace scroll/pan position is stable across a diagnostics-only refresh.

---

## 5. Navigation, density, preview

### SPEC-R14 — Browse ↔ edit top-level views *(→ PRD-G1)*
The product MUST provide a **browse view** (a home/gallery for opening or creating documents) distinct
from the **editor view** (this shell). Entering a document opens the editor; the header's home
affordance (§R2) returns to browse. Switching MUST preserve unsaved-work semantics (warn or persist per
the product's policy).
- **AC-R14.1** From browse, opening/creating a document lands in the editor with that document active.
- **AC-R14.2** The home affordance returns to browse from the editor.

### SPEC-R15 — Preview independent of chrome *(→ PRD-G5)*
Where the artifact is previewed under a variable condition the app chrome also has (canonically:
light/dark theme), the shell MUST let the user set the **artifact preview condition independently of the
app-chrome condition** — two separate controls, not one shared toggle.
- **AC-R15.1** The artifact can be previewed in dark while the app chrome stays light (and vice versa).

### SPEC-R16 — Pane collapse *(→ PRD-G6)*
The user MUST be able to **collapse and restore each side rail** to widen the workspace. A collapsed rail
MUST leave an always-visible affordance to restore it (the restore control relocates to a persistent edge
rather than vanishing with the rail). Collapse is ephemeral state (§R11).
- **AC-R16.1** Collapsing a rail widens the workspace and leaves a visible restore affordance.
- **AC-R16.2** Restoring returns the rail to its prior state; the collapsed flag does not persist across
  reload.

---

## 6. States, edges & errors

### SPEC-R17 — Defined states for every region *(→ PRD-G2, PRD-G5)*
Every region MUST define its **empty, loading (if async), and error** states, and MUST render the
appropriate one rather than blank space, a stack trace, or a stale view. At minimum:
- **AC-R17.1 (empty document / no entities)** The workspace and rails render explicit empty states; the
  footer reads zero counts; nothing throws; the output flow (§R7) still opens (e.g. yielding an
  empty/annotated result rather than failing).
- **AC-R17.2 (no valid selection)** The selection-scoped rails degrade to a defined empty/placeholder
  state; a selection index out of range resolves to a safe default, not an exception.
- **AC-R17.3 (conditional panel absent)** Per §R5.2 — the active-panel selection falls back to a default.
- **AC-R17.4 (async body loading)** A region awaiting data shows a loading state, then its content or a
  retryable error — never an indefinite blank.
- **AC-R17.5 (constrained environment)** When embedded where a capability is unavailable (e.g. no
  network, a sandboxed host), features depending on it degrade gracefully with a stated reason; the
  shell remains operable.

---

## 7. Non-functional requirements

### SPEC-R18 — Responsiveness *(→ PRD-G4)*
A live-refresh update (§R12) SHOULD complete within one animation frame budget (~16 ms for the patched
region on a mid-tier device) so a drag tracks the pointer without visible lag. A full render SHOULD
complete within ~100 ms for a typical document. (Products SHOULD state their own measured budgets.)
- **AC-R18.1** A continuous drag maintains interactive frame rate on the target device class.

### SPEC-R19 — Accessibility *(→ PRD-G2, PRD-G5)*
The shell MUST be operable by keyboard and expose correct semantics: the section switcher and inspector
panels as a tablist/tab semantics with roving focus and arrow-key movement; live status regions
(save/validity/coordinate readouts) announced politely; modal overlays with focus trap + restore (§R7);
every actionable affordance reachable and labeled. It MUST meet the product's stated contrast/target-size
floor.
- **AC-R19.1** Every header action, switcher choice, panel tab, and pane toggle is keyboard-reachable and
  labeled.
- **AC-R19.2** Status readouts are exposed to assistive tech as live regions.

### SPEC-R20 — Design-system independence *(→ PRD-G7)*
The shell MUST express all visual identity through the implementer's design system (its components,
tokens, themes) and MUST NOT hard-code color, type, spacing, or component internals into the pattern. A
conforming shell can be re-skinned to a different design system by swapping tokens/components without
changing region roles, routing, or the render/refresh contracts.
- **AC-R20.1** Two conforming implementations with different design systems both satisfy §2–§6 with no
  change to this SPEC.

---

## 8. Traceability

| Goal | Requirements |
|------|--------------|
| PRD-G1 shell skeleton | R1, R2, R4, R7, R14 |
| PRD-G2 spatial contract | R1, R3, R4, R5, R8, R9, R17, R19 |
| PRD-G3 multi-facet / sections | R2, R8, R9 |
| PRD-G4 responsive, non-disruptive edits | R10, R11, R12, R13, R18 |
| PRD-G5 orientation & status | R2, R3, R6, R15, R17, R19 |
| PRD-G6 density control | R16 |
| PRD-G7 design-system-agnostic | R11, R20 |

**Reference implementation:** `nonoun-color-tokens` — see `.claude/docs/lld/app-shell.md` (maps each
region here to a concrete `LLD-C*`, e.g. this SPEC's §R3 analysis rail ↔ its left pane; §R8 section axis
↔ its `this.section` routing; §R12 live-refresh ↔ its partial `liveRefresh`). That LLD is one conforming
build; this SPEC is the portable contract.

---

*Update rule: this is a pattern SPEC with an internal Goals block (§0). If the pattern's goals change,
amend §0 and re-derive the affected `SPEC-R#`; do not patch a requirement to look current while its goal
drifts. The reference LLD is downstream — a goal change flags it stale.*
