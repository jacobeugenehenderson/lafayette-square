# HANDOFF — Junction band-thorns: forensic-only diagnosis (DO NOT FIX YET)

**State:** DISPATCH-READY (forensic). **Domain:** cartograph SHAPE — the **tile band construction** at junctions (`src/lib/tileGround.js`: `sectionPass` / `offsetRings` / the corner-fillet pass / `unionRings`), NOT the centerline frame. **Drafted:** 2026-06-04 (Chord), from Jacob's 4 marker strokes.

> **Agent: FRESH.** A forensic specialist who looks ONLY at this one issue. **This is diagnose-only — do NOT change construction code.** Produce a written root-cause with exact mechanism + the minimal fix proposal; Jacob/Boz decide the fix dispatch after. (The over-densification arc that surfaced this — RDP frame + non-overshoot smoothing — is a *separate, landed* piece; don't touch it.)

---

## The issue, precisely (one mechanism, four faces)

At street junctions the **ped-band rings** (curb / sidewalk / block outline — the blue Survey wireframe) develop **spurious sharp spikes and near-180° reversals**. The street **centerlines are clean** at these spots (through-streets run straight through the node at **0–1°** — verified), so this is **purely a band-construction artifact**, not centerline density or smoothing. Jacob's read — "might actually be one symptom" — looks right: **inconsistent corner/fillet treatment at degree-3+ nodes.** The four marked faces:

| Mark | Jacob's words | Where | What the geometry shows |
|---|---|---|---|
| #1 | "hard angle created adjacent to a T" | junction **[29.3, −434.9]** (deg 3; Hickory Ts into Mackay) | curb ring 72° spike at [22.9, −436.9] |
| #2 | "hard angle … adjacent to a T" | junction **[18.4, −402.0]** (deg 3; Hickory end + 2× Mackay) | curb/sidewalk/asphalt/block spikes 90–176° clustered ~[33.5, −396.9] |
| #3 | "a *rounded* inner fillet adjacent to a T" | junction **[−48.0, −203.9]** (deg 3; Mackay Ts into Park Ave) | sidewalk near-reversal 169° at [−57.0, −207.6]; curb 77–81° |
| #4 | "pulled away from a complex corner" | junction **[340.0, −120.6]** (deg 3; Vail end + Park Ave) — near the deg-5 complex node at [424, −89] | 16+ curb/sidewalk reversals 110–147°; band insets off the corner |

**#1/#2 = a hard angle where the band should round; #3 = a rounded fillet where it should be hard; #4 = the band pulled off the corner.** That inconsistency is the tell.

## Confirmed facts (don't re-derive — verify and extend)

1. **Centerline-clean.** Through-streets at all four junctions turn **0–1°** — these are not bend/over-densification thorns (that arc is fixed). The spikes live in the **curb / sidewalk / block** ring lists out of `buildTileGround`, near the node.
2. **Pre-existing, frame-independent.** Built the tiles from BOTH the trunk frame and the RDP frame: the reversals are present in **both**, and are **worse on trunk** (junction #4: trunk 27 reversals up to 180° vs the RDP frame's 16 up to 147°; #3: both ~1 at ~170–180°). So the RDP/smoothing work did **not** cause this — it slightly *reduced* it. The cause is in the **construction**, the same for any frame.
3. **This is the known "T-junction aberration."** The dead-end handoff (`HANDOFF-dead-end-spike-prune.md`, "On landing") explicitly queued **"the T-junction aberrations (17 degree-3 faces) as the next SHAPE dispatch."** This is that. Reconcile with it.

## Read first (aim the agent)

- `RIBBONS.md §3.9a` (the tile keystone: corner = band BENT, jtMiter, the capacity guard) + the §"proper way to a clean map" note. Hold: **the corner is a slice of continuous offsets, never a constructed primitive** — a junction spike means an offset/union is mis-forming, not that we need a new corner shape.
- `src/lib/tileGround.js`: `extractFaces` (the deg-3 node face walk), `sectionPass` + `offsetRings` (the concentric ped-band offsets, `jtMiter`), the **per-vertex fillet pass** (`filletRing` / `applyVertexFillets` / `cornerFillets`), `strokeOpen` (asphalt/curb open-stroke at run ends), `unionRings` (curb = `unionRings(Cacc)`). The spike is most likely born where a **run boundary / tile seam at the node** meets the offset or the union.
- `project_f3_corner_editor` + the cornerFillets doctrine (one corner truth = the achieved fillet).

## The forensic deliverable (what to produce)

1. **Pin the exact construction step** that emits each spike — for at least #1 (cleanest, single 72° curb spike) and #3 (the 169° sidewalk reversal) and #4 (the deg-5 complex corner). Walk the ring back to the op that created the reversal (which `Cacc`/`sectionPass` run, which offset, the union seam, or the fillet).
2. **State whether #1/#2/#3/#4 are one mechanism or a small family** (Jacob's hypothesis: one). If one, name it; if a family, enumerate.
3. **Minimal fix proposal** (written, not applied): the smallest construction change that removes the spikes without regressing the legit 90° corners or the capacity guard.
4. **No-regress notes:** which junctions are *correct* today (so a fix doesn't break them) + the divided-carriageway median (don't confuse a median sliver with a thorn — `TRUMAN-FORENSICS.md`).

## Verification surface (reuse, don't rebuild)

- **The 4 marks** are strokes 8–11 in `cartograph/data/lafayette-square/clean/marker_strokes.json` (world `{x,z}`). Junction coords are in the table above.
- **The dump pattern** Chord used: `buildTileGround(ribbons, {smooth:0.5})` → scan each ring list for vertices near a junction with interior turn > ~110° (reversals) — `scratch/chord-tile-dump.mjs` / `chord-trunk-cmp.mjs` are the starting harnesses. **Per the toy-is-the-spike-surface doctrine, validate on the production `buildTileGround` path, not a parallel rasterizer** — and confirm against the live :5173 Survey wireframe (Jacob's eye), since a proxy reading ≠ the operator's screen.

## Boundaries

- **Forensic only — no construction edits.** Output is the root-cause writeup + minimal-fix proposal.
- Branch off the current worktree (`chord-too-much-line`) or trunk in its OWN worktree (`isolation: "worktree"`); don't disturb the smoothing/RDP work or the live :5173 server.
- Canon docs off-limits; Boz folds findings after the fix lands.
