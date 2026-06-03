# HANDOFF — "Too much line" — the over-densification root cause (thorns / bulge-bow / dead-end-triangles)

**State:** IN-FLIGHT — fresh root-cause agent dispatched 2026-06-04 (STEP-1 diagnose-first running). **Domain:** cartograph SHAPE (Survey, 2D) — spans `skeleton.js` → `derive.js` → `tileGround.js`. **Drafted/diagnosed:** Boz + Jacob, 2026-06-04.

---

## The reframe (the knot — Jacob's eye on the live 2D Survey render)

A cluster of artifacts is **one root cause**, not separate bugs:
- **Arrowhead thorns** on smoothed curves/loops (Benton Place — inward spikes on the thin-loop inner edges).
- **Rectangular / step artifacts** on straight sequences.
- General **bulge-and-bow** in the band polygons.
- The **"dead-end triangles."**

**Root = "too much line"** (Jacob's words): the centerlines are **over-densified**, so the tile-ring polygons carry far more vertices (+ tiny ripples) than the geometry warrants. When those rings are offset **inward** for the ped bands, the excess line has nowhere to go → **bulges, bows, and pinches into thorns** at thin spots. Classic `project_skeleton_is_the_first_bake` doctrine: the simpler the skeleton output, the healthier everything downstream.

**Consequence: the dead-end PRUNE was a symptom-patch on a misdiagnosis** — the "dead-end triangles" are over-densification artifacts, not degree-1 pendant weaving. The dead-end agent was **stood down** 2026-06-04 (its work committed/parked; may apply to genuine cul-de-sac residuals *after* the root clears). Do NOT prune by shape.

## Evidence (confirmed)

- **Double-smoothing confirmed.** Benton's loop needs ~5–12 pts; `skeleton.json` already carries it at **29**; `tileGround.smoothChain` (`tileGround.js:614`, centripetal Catmull-Rom, +3 pts/seg @ smooth 0.5) re-samples that to **~113**. Two layers of densification on one curve.
- **Smoking gun:** Benton's 29-pt frame chain sits at ~5m segment spacing — `derive.js:1146` Catmull-Rom-densifies curves >12° to `CURVE_MAX_SEG=5m`. So curves get densified to 5m AND re-smoothed at render.
- **Park Avenue is sparse** (median seg 33–135m, never densified) yet shows a thorn → its thorn is a **different/secondary** class (corner/junction), not this root.
- **`smoothChain` is not idempotent** (`smoothCenterline.js:63`): re-sampling an already-dense line through centripetal Catmull-Rom on tiny non-uniform segments injects ripple → offset crossings.

## Suspected densification sources (the agent pins which)

1. `skeleton.js resamplePolyline` (`:558`) — does the FRAME emit the over-dense 29? (= Stage-1 skeleton defect)
2. `derive.js:1146` — Catmull-Rom curve-densify to 5m (pre-tile; its stated job `derive.js:1128` is the *figure-ground* block-face offset = the dying path → likely redundant for tiles).
3. `tileGround.js:614` — `smoothChain` re-smoothing an already-dense input (= Stage-2 render over-smooth).

## The diagnose-first brief (dispatched 2026-06-04)

**STEP 1 — DIAGNOSE (read-only, the Stage-1-vs-Stage-2 fork):** vertex-count chain **raw OSM → skeleton → ribbons → post-`smoothChain`** for (a) Benton loop, (b) a straight street with rectangular artifacts, (c) a "dead-end triangle." Pin **where** the excess originates — frame over-dense (Stage-1) vs render re-smooth (Stage-2) vs both. ⚠️ skeleton points are NOT `[[x,y]]` (Boz's probe got NaN) — find the format first.
**STEP 2 — FIX AT THE ROOT:** the right amount of line, **smoothed once** (single smoothing authority; `tileGround` must not re-densify already-dense input; minimal-sufficient control points). ⚠️ **No regression:** parcel/face curve boundaries (`derive.js:1581-1617`) or wide-ribbon kink-freeness (grade-sep, `tileGround:967`).
**STEP 3 — WATCH live 2D Survey:** Benton + a straight run + the old "dead-end triangles." All clean → root confirmed.

## Coordination / boundaries

- **Branch off trunk `cartograph-looks-pass-ab` in its own worktree** (`isolation: "worktree"`).
- **⚠️ HOLD THE BAKE / don't merge to trunk** — ONE integrated bake after the fix lands (joins D1 + grade-sep already in the base; + any genuine dead-end residual).
- **Report STEP-1 diagnosis before committing any fix.**
- Canon docs off-limits — Boz folds into `PIPELINE P1` / `RIBBONS §3.9a` / `project_skeleton_is_the_first_bake` after it lands.

## On landing (Boz)

- Fold the root cause + the single-smoothing-authority rule into canon; flip the ledger G12/thorn rows; re-evaluate whether the capacity-guard completion (full-collapse-only gap) is still needed or evaporates with the root fix (the knot test). Retire this HANDOFF → NOTES. Then resume the consolidated eyeball (`scratch/eyeball-checklist-post-deadend-bake.md`) on the integrated bake.
