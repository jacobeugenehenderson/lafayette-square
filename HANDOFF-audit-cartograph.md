# Handoff — Cartograph Pathologist (forensic audit)

> **You ARE the dispatched agent.** Name yourself; sign your commits with it. Read
> `AUDIT-MATRIX.md` first — it's the shared instrument (columns, classification, guardrails,
> cross-cutting threads). This phase is a **read-only walk** — NO code changes.

## Why this is the highest-stakes audit

**The Cartograph IS the product** — the factory (authoring suite, with arborist + meteorologist
as modules) that produces slabs. Its cleanliness and *configurability* are literally what's
licensable. You are auditing the thing that gets sold.

## Your domain (and only yours)

The **authoring corpus**: Designer (Survey / Measure / Design modes), Toy, Stage, and the
Preview UI (Desktop + Mobile). Files: `src/cartograph/*`, `src/stage/*`, `src/preview/*`,
`cartograph/` (serve.js + the quintet docs), the cartograph store.

**Not yours:** the LS production app (LS App Pathologist), tree internals (Arborist), clouds
(cloud specialist, in flight). The slab *emit/bake* is a seam you share — coordinate, don't own it.

## The walk

Fill **`scratch/audit-cartograph.md`** — your domain's rows in the `AUDIT-MATRIX.md` column
format. Walk every authoring tool / panel / mode / asset across your environments.

Domain emphases:
- **De-hardwiring → `future-setting` tagging is central here.** This is the product someone will
  configure; every hardcoded LS-specific is a future setting. Tag relentlessly.
- **Capability-statement-as-dead-code-detector** is especially potent across the many panels and
  tools — if a tool's "you can do X" reads as nonsense, flag it.
- You **co-own CSS/token reconciliation**: inventory `src/cartograph/cartograph.css`; reconcile
  *toward* the existing token source with the LS App Pathologist (don't design new — see the
  cross-cutting note in `AUDIT-MATRIX.md`). The two token files (`src/tokens/design.css`,
  `public/lsq-tokens.css`) are a known duplication to flag.
- You **co-own authoring/preview-mobile** (Stage Mobile|Desktop tab, Preview-mobile) with the LS App.

## Guardrails (full text in `AUDIT-MATRIX.md`)

Read-only this phase. **Classify before any future cut:** dead→remove, duct-tape→fix, real→keep.
Evidence-before-excision; Boz signs off deletions; SSOT = one definition + documented deltas.

## Defaults (Boz's leans — flag in your report if you'd change them)

Mobile authoring co-owned with LS App · CSS = reconcile existing, not design new. Surface anything
outside this brief (extra files, schema, surprises) in your report.

## Deliverable

`scratch/audit-cartograph.md` (the filled matrix) + a short narrative naming the biggest knots:
the duct-tape that needs real fixes, the duplicate sources of truth, and the blocked work each
untangling would release.
