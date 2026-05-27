# Handoff — Arborist Pathologist (forensic audit)

> **You ARE the dispatched agent.** Name yourself; sign your commits with it. Read
> `AUDIT-MATRIX.md` first (shared columns, classification, guardrails). Read-only walk this
> phase — NO code changes.

## What you're auditing

The **tree pipeline** (a Cartograph module — à-la-carte sellable — and a major slab-content
contributor) and **every surface a tree renders on**: the Salon, the Grove, Stage, Preview, and
Production (via `InstancedTrees` + the baked slab). Files: `arborist/*` (pipeline, serve.js,
docs), `src/components/InstancedTrees.jsx`, `treeAtlasMaterial.js`, the tree data/bake outputs.

The pipeline has accreted through many briefs (Phases L, bark, leaf decimation, wind, roster
curation…), so expect real cruft and conflicts.

## ⚠ Critical sequencing — LOD/novelty is the FINAL task, not concurrent

The hero-LOD / impostor / "more novel" tree solution Jacob wants is the **payoff, gated behind
the inventory** — do **NOT** start solving it until the audit is done and Boz/Jacob review.
Context: `HANDOFF-tree-hero-lod.md`, Azimuth's Phase A landed (heroTier classifier + Grove/Stage
QC overlay), then **parked at the A→B seam** awaiting Jacob's visual QC + a more-novel approach.
Inventory first; LOD-novelty last, as a separate gated brief you propose at the end.

## The walk

Fill **`scratch/audit-arborist.md`** in the matrix format across the tree surfaces.

Domain emphases:
- **Inventory real vs. duct-tape vs. vestigial** across the pipeline — many half-finished/
  superseded attempts likely linger. Classify; don't cut yet.
- **Find conflicts** — competing classifiers, drifted detection, `--clean` regen gaps
  (see `feedback_clean_regen_must_be_idempotent_complete` territory).
- **The bake → slab tree-content contract** — what tree content the slab carries vs. what
  `InstancedTrees` reconstructs at runtime (the runtime-merge attributes). Coordinate with the LS
  App Pathologist's slab-contract audit — trees are a big slab-content surface.
- **Blocked-work ledger** — Azimuth's Phase C/E tier-render is waiting on the post-conformance
  `Scene.jsx`; note what releases when.

## Guardrails / defaults

Per `AUDIT-MATRIX.md`: read-only; classify dead/duct-tape/real; evidence-before-excision; Boz
signs deletions. Surface anything outside this brief in your report.

## Deliverable

`scratch/audit-arborist.md` (filled matrix + conflict/cruft narrative + blocked-work ledger), and
— **as the final, gated artifact** — a prioritized LOD/novelty brief, written only after the
inventory is reviewed.
