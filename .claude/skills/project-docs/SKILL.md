---
name: project-docs
description: >-
  Answers what THIS project (ultimate-tokens) has decided, planned, queued, and specified — from
  the docs/ corpus. Use for "what are the requirements for X", "which tickets are open", "what's
  on the roadmap / the plan", "what did we decide about Y", "is there a spec for Z", "what's the
  status of TKT-####", "what's already been queued or shipped". Consult table → the docs/ files;
  Grep first, read the matching section. ANSWERS from the corpus only. NOT for authoring or
  editing a document (/doc-forge, scribe); NOT for capturing a new feature idea (/feature) or bug
  (/bug-report); NOT for building from a record (/build, orchestration).
user-invocable: false
disable-model-invocation: false
---

# project-docs — this project's decision and work record

The routing surface over `docs/` — so any session can find what this project has decided,
planned, and queued without being told where to look. Answers come from the files, cited by
path; a question the corpus doesn't answer is reported as absent, never guessed.

| Ask | Look in |
|---|---|
| Problem, users, outcomes — the why | `docs/prd/` (PRD-*) — not present yet |
| Requirements, exact behavior, acceptance criteria (scribe-authored) | `docs/spec/` (SPEC-*) — not present yet |
| A ratified decision and its alternatives | `docs/adr/` (ADR-*, accepted = append-only) — not present yet |
| What's queued, in flight, or done | `docs/tickets/` (TKT-*; frontmatter `kind:` bug/feature, `size:`, status) |
| Sequenced steps with done-whens | `docs/plan/` (PLAN-*) — not present yet |
| Horizons of intent — Now / Next / Later | `docs/roadmap/` (ROADMAP-*) — not present yet |
| One actor, one sitting, one done-when | `docs/task/` (TASK-*) — not present yet |
| The color/type/geometry ENGINE's own canonical reference (role tables, export-format shapes, typography/geometry specs, rubrics) | `docs/reference/` — pre-existing, own conventions (not scribe TICKET/SPEC frontmatter); the role-answer-key is `docs/reference/data/role-table.json` |
| Marketing corpus (voice platform, fact sheet, store copy, launch kit) | `docs/marketing/` — author via the `marketing-manager` agent + `ultimate-tokens-brand-voice` skill, not this skill |
| Hosting/licensing design docs, one architecture LLD | `docs/site/`, `docs/lld/` — pre-existing, informal headers (no `doc-type:` frontmatter), predate the scribe TICKET workflow |
| Generated README preview asset | `docs/img/` — not a document, skip for doc-shaped asks |

All of the above live under one `docs/` root (migrated from `.claude/docs/` on 2026-07-12).
`.claude/docs/other/` is the one exception: it is PRIVATE and local-only (gitignored via
`.git/info/exclude`) and never moves here — if asked about its content, say it's local scratch
material outside this corpus, don't read it speculatively.

(A directory that doesn't exist usually means the project has none of that record type yet —
but before answering "absent", sweep for near-miss locations: misnamed dirs (`docs/specs/`,
`rfcs/`, `design-docs/`, `adrs/`), loose files (`NOTES.md`, `DECISIONS.md`, `ARCHITECTURE.md`),
doc-shaped README sections. A hit → answer with the real location, marked non-canonical:
"spec-shaped content lives at rfcs/ — not indexed; /docs-alignment (scribe) can migrate it." A false
"this project has no specs" is this skill's own worst failure. Knowledge corpora authored at
intake are linked from their ticket, not mapped here.)

## Consult procedure

1. Classify the ask against the table; Grep the corpus for the feature's nouns or the TKT-/PRD-
   id first — the files are records, not linear reads.
2. Answer with **the claim + the file path (+ the record's status where it has one)**. A record's
   frontmatter (`status`, `kind`, `size`) is part of the answer — an open ticket and a done one
   answer "is X built?" oppositely.
3. Cross-references between records use ids (the ID spine: a TKT links its SPEC by id) — follow
   them rather than assuming one file is complete.
4. Route all making: a new idea → `/feature`; a bug → `/bug-report`; building a queued record →
   `/build`; authoring or revising any document → `/doc-forge` (all where installed — otherwise
   name the record that would be touched and hand back to the user).
